import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { WebullPaperBroker, normalizeWebullOrder, SANDBOX_HOST } from '../../lib/trade/broker/webull_paper';
import { buy, NOW } from './fixtures';

// Shapes transcribed from official Webull reference schemas, not from a live account.
const row = {
  client_order_id: 'testpaperorder', order_id: 'paper-123', symbol: 'SPY', side: 'BUY', instrument_type: 'EQUITY',
  order_type: 'MARKET', entrust_type: 'AMOUNT', total_quantity: '0.038', status: 'FILLED',
  filled_quantity: '0.038', filled_price: '650', place_time_at: NOW.toISOString(), filled_time_at: NOW.toISOString(),
  commission: { actual_commission: '0.01' }, fees: [{ type: 'SEC_FEE', actual_value: '0.002' }],
};

function fixture(t: TestContext, route: (url: URL, body: unknown) => unknown) {
  process.env.WEBULL_PAPER_APP_KEY = 'unit-test-key'; process.env.WEBULL_PAPER_APP_SECRET = 'unit-test-secret';
  t.after(() => { delete process.env.WEBULL_PAPER_APP_KEY; delete process.env.WEBULL_PAPER_APP_SECRET; });
  const calls: { path: string; body: unknown }[] = [], logs: string[] = [];
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, SANDBOX_HOST); assert.equal(url.protocol, 'https:'); assert.equal(init?.redirect, 'error');
    assert.ok((init?.headers as Record<string, string>)['x-signature']);
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ path: url.pathname, body });
    return Response.json(route(url, body));
  };
  return { broker: new WebullPaperBroker('sandbox-account', async () => {}, async (path, status) => { logs.push(`${path}:${status}`); }, transport), calls, logs };
}

test('official account, position, quote, capability and M15 bar schemas normalize on the sandbox host', async t => {
  const { broker, calls, logs } = fixture(t, (url, body) => {
    if (url.pathname.endsWith('/accounts/list')) return [{ account_id: 'sandbox-account', account_type: 'CASH' }];
    if (url.pathname.endsWith('/balances/get')) return { total_asset_currency: 'USD', total_net_liquidation_value: '10000', total_day_profit_loss: '2.5', account_currency_assets: [{ currency: 'USD', settled_cash: '9975', buying_power: '9975' }] };
    if (url.pathname.endsWith('/positions/list')) return [{ symbol: 'SPY', instrument_type: 'EQUITY', currency: 'USD', quantity: '0.038', cost_price: '650', last_price: '651', unrealized_profit_loss: '0.038' }];
    if (url.pathname.endsWith('/snapshots/list')) { assert.equal(url.searchParams.get('category'), 'US_ETF'); return [{ symbol: 'SPY', price: '650', last_trade_time: NOW.getTime(), bid: '649.99', ask: '650.01' }]; }
    if (url.pathname.endsWith('/profiles/list')) { assert.equal(url.searchParams.get('category'), 'US_STOCK'); return { data: [{ symbol: 'SPY', status: 'OC', currency: 'USD', fractionable: true }] }; }
    if (url.pathname.endsWith('/bars/list')) {
      assert.deepEqual(body, { symbols: ['SPY'], category: 'US_ETF', timespan: 'M15', count: 500, trading_sessions: 'RTH', start_time: NOW.getTime() - 3600000, end_time: NOW.getTime() - 1, real_time_required: false });
      return { result: [{ symbol: 'SPY', result: [{ time: '2026-09-04T14:30:00.000+0000', open: '649', high: '651', low: '648', close: '650', volume: '10000' }] }] };
    }
    throw new Error('Unexpected endpoint');
  });
  assert.equal((await broker.getAccount()).dayPnl, 2.5);
  assert.equal((await broker.getPositions())[0].marketValue, 0.038 * 651);
  assert.equal((await broker.getQuote('SPY')).asOf, NOW.toISOString());
  assert.equal((await broker.getCapabilities('SPY')).notional, true);
  assert.equal((await broker.getBars('SPY', '15m', new Date(NOW.getTime() - 3600000).toISOString(), NOW.toISOString()))[0].close, 650);
  assert.equal(calls.length, logs.length); assert.ok(!logs.join().includes('unit-test'));
});

test('preview is non-mutating; exact AMOUNT terms are preserved; placement is read back, not assumed filled', async t => {
  const { broker, calls } = fixture(t, url => {
    if (url.pathname.endsWith('/preview')) return { estimated_cost: '25', estimated_transaction_fee: '0.012' };
    if (url.pathname.endsWith('/place')) return { client_order_id: 'testpaperorder', order_id: 'paper-123' };
    if (url.pathname.endsWith('/open-orders/list') || url.pathname.endsWith('/historical-orders/list')) return [{ combo_type: 'NORMAL', orders: [row] }];
    if (url.pathname.endsWith('/get')) return { combo_type: 'NORMAL', orders: [row] };
    if (url.pathname.endsWith('/cancel')) return {};
    throw new Error('Unexpected endpoint');
  });
  assert.equal((await broker.previewOrder(buy())).estimatedNotional, 25);
  assert.equal(calls.length, 1);
  const result = await broker.placeOrder(buy());
  assert.equal(result.filledQuantity, 0.038); assert.equal(result.feesFinal, true); assert.equal(result.fees, 0.012);
  assert.deepEqual(calls[0].body, calls[1].body);
  assert.equal((calls[0].body as { new_orders: { total_cash_amount: string }[] }).new_orders[0].total_cash_amount, '25.00');
  assert.equal((await broker.getOrders())[0].id, 'paper-123');
  assert.equal((await broker.getHistory('2026-09-01', '2026-09-04'))[0].id, 'paper-123');
  await broker.cancelOrder('testpaperorder');
});

test('unknown preview schemas, missing execution times, mismatched orders and missing fee settlement fail safely', async t => {
  const { broker } = fixture(t, url => url.pathname.endsWith('/preview') ? { success: true } : { combo_type: 'NORMAL', orders: [{ ...row, client_order_id: 'wrong-order' }] });
  await assert.rejects(broker.previewOrder(buy()), /preview consideration/);
  await assert.rejects(broker.getOrder('testpaperorder'), /different order/);
  assert.throws(() => normalizeWebullOrder({ ...row, filled_time_at: undefined }), /timestamp/);
  assert.equal(normalizeWebullOrder({ ...row, commission: undefined, fees: undefined }).feesFinal, false);
  assert.throws(() => normalizeWebullOrder({ ...row, instrument_type: 'OPTION' }), /equity/);
});
