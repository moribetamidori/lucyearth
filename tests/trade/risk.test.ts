import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_POLICY, loadRiskPolicy, validateOrder, withinCoreHours } from '../../lib/trade/risk/policy';
import { assertPaperMode } from '../../lib/trade/config';
import { proposalSchema } from '../../lib/trade/types';
import { simulatedBaseline } from '../../lib/trade/agents/trader';
import { buy, NOW, snapshot } from './fixtures';

const state = { paused: false, submittedToday: 0 };
test('paper mode cannot be switched to live by environment configuration', () => {
  assert.doesNotThrow(() => assertPaperMode({}));
  assert.doesNotThrow(() => assertPaperMode({ TRADING_MODE: 'paper' }));
  for (const mode of ['live', 'production', 'sandbox', 'PAPER', '']) assert.throws(() => assertPaperMode({ TRADING_MODE: mode }));
});
test('risk limits are immutable to proposals and reject malformed operator configuration', () => {
  assert.ok(Object.isFrozen(DEFAULT_POLICY)); assert.ok(Object.isFrozen(DEFAULT_POLICY.allowedSymbols));
  for (const config of [{ MAX_ORDER_NOTIONAL: '-1' }, { MAX_DAILY_LOSS: 'NaN' }, { MAX_TOTAL_EXPOSURE: '101' }, { ALLOWED_SYMBOLS: 'SPY,TSLA' }]) assert.throws(() => loadRiskPolicy(config));
  assert.equal(validateOrder(buy(), snapshot(), state, DEFAULT_POLICY, NOW).allowed, true);
});
test('notional ceiling is inclusive and rounding cannot admit an oversized order', () => {
  assert.equal(validateOrder({ ...buy(), notional: 100 }, snapshot(), state, DEFAULT_POLICY, NOW).allowed, true);
  for (const notional of [100.001, Infinity, NaN, -25, 0, 4.99]) assert.equal(validateOrder({ ...buy(), notional }, snapshot(), state, DEFAULT_POLICY, NOW).allowed, false);
});
test('risk checks reject missing, stale, future and incorrectly matched data', () => {
  for (const mutate of [
    (s: ReturnType<typeof snapshot>) => { s.account.dayPnl = null; },
    (s: ReturnType<typeof snapshot>) => { s.account.equity = NaN; },
    (s: ReturnType<typeof snapshot>) => { s.quote.asOf = new Date(NOW.getTime() - 121000).toISOString(); },
    (s: ReturnType<typeof snapshot>) => { s.quote.asOf = new Date(NOW.getTime() + 10000).toISOString(); },
    (s: ReturnType<typeof snapshot>) => { s.quote.receivedAt = 'bad'; },
    (s: ReturnType<typeof snapshot>) => { s.quote.symbol = 'QQQ'; },
  ]) { const s = snapshot(); mutate(s); assert.equal(validateOrder(buy(), s, state, DEFAULT_POLICY, NOW).allowed, false); }
  const delayed = snapshot(); delayed.quote.delaySeconds = 900; delayed.quote.asOf = new Date(NOW.getTime() - 900000).toISOString();
  assert.equal(validateOrder(buy(), delayed, state, DEFAULT_POLICY, NOW).allowed, true);
});
test('every initial exposure budget is enforced, including pending orders', () => {
  const s = snapshot();
  assert.equal(validateOrder(buy(), s, { ...state, paused: true }, DEFAULT_POLICY, NOW).allowed, false);
  assert.equal(validateOrder(buy(), s, { ...state, submittedToday: 4 }, DEFAULT_POLICY, NOW).allowed, false);
  s.account.dayPnl = -25;
  assert.equal(validateOrder(buy(), s, state, DEFAULT_POLICY, NOW).allowed, false);
  s.account.dayPnl = 0; s.account.buyingPower = 24;
  assert.equal(validateOrder(buy(), s, state, DEFAULT_POLICY, NOW).allowed, false);
  s.account.buyingPower = 10000;
  s.positions = [{ symbol: 'SPY', quantity: 1, averagePrice: 80, marketValue: 80, unrealizedPnl: 0 }];
  assert.match(validateOrder(buy(), s, state, DEFAULT_POLICY, NOW).reasons.join(' '), /position percentage/);
  s.positions = [{ symbol: 'QQQ', quantity: 1, averagePrice: 190, marketValue: 190, unrealizedPnl: 0 }];
  assert.match(validateOrder(buy(), s, state, DEFAULT_POLICY, NOW).reasons.join(' '), /total exposure/);
  assert.match(validateOrder(buy(), s, state, { ...DEFAULT_POLICY, maxOpenPositions: 1 }, NOW).reasons.join(' '), /open positions/);
  s.positions = [];
  s.openOrders = [{ ...buy(), id: 'pending', status: 'submitted', notional: 90, filledQuantity: 0, averageFillPrice: null, filledNotional: 0, fees: 0, submittedAt: NOW.toISOString(), filledAt: null }];
  assert.equal(validateOrder(buy(), s, state, DEFAULT_POLICY, NOW).allowed, false);
  s.openOrders[0].notional = 1; s.openOrders[0].status = 'unknown';
  assert.match(validateOrder(buy(), s, state, DEFAULT_POLICY, NOW).reasons.join(' '), /uncertain/);
});
test('sales cannot short or sell shares already reserved by another order', () => {
  const s = snapshot(), sell = { ...buy(), side: 'SELL' as const, notional: null, quantity: 0.05 };
  assert.equal(validateOrder(sell, s, state, DEFAULT_POLICY, NOW).allowed, false);
  s.positions = [{ symbol: 'SPY', quantity: 0.05, marketValue: 32.5, averagePrice: 650, unrealizedPnl: 0 }];
  s.account.dayPnl = -30;
  assert.equal(validateOrder(sell, s, { paused: true, submittedToday: 5 }, DEFAULT_POLICY, NOW).allowed, true);
  s.openOrders = [{ ...sell, id: 'reserved', status: 'submitted', filledQuantity: 0, filledNotional: 0, averageFillPrice: null, fees: 0, submittedAt: NOW.toISOString(), filledAt: null }];
  assert.equal(validateOrder(sell, s, state, DEFAULT_POLICY, NOW).allowed, false);
});
test('fractional limit orders and unbounded market buys are prohibited', () => {
  assert.equal(validateOrder({ ...buy(), quantity: 0.05, notional: null }, snapshot(), state, DEFAULT_POLICY, NOW).allowed, false);
  assert.equal(validateOrder({ ...buy(), quantity: 0.05, notional: null, orderType: 'LIMIT', limitPrice: 650 }, snapshot(), state, DEFAULT_POLICY, NOW).allowed, false);
  const s = snapshot(); s.capabilities.notional = false;
  assert.equal(validateOrder(buy(), s, state, DEFAULT_POLICY, NOW).allowed, false);
});
test('core-hour guard respects US Eastern daylight savings and weekends', () => {
  assert.equal(withinCoreHours(new Date('2026-09-04T13:30:00Z')), true);
  assert.equal(withinCoreHours(new Date('2026-09-04T20:00:00Z')), false);
  assert.equal(withinCoreHours(new Date('2026-09-05T15:00:00Z')), false);
  assert.equal(withinCoreHours(new Date('2026-12-04T14:00:00Z')), false);
  assert.equal(withinCoreHours(new Date('2026-12-04T14:30:00Z')), true);
});
test('non-trading decisions cannot smuggle an order or risk override', () => {
  const s = snapshot(); s.features.volumeRatio = 0.8;
  const p = simulatedBaseline(s); assert.equal(p.action, 'NO_TRADE');
  assert.doesNotThrow(() => proposalSchema.parse(p));
  assert.throws(() => proposalSchema.parse({ ...p, quantity: 1 }));
  assert.throws(() => proposalSchema.parse({ ...p, max_daily_loss: 100000 }));
  assert.throws(() => simulatedBaseline({ ...s, broker: 'webull_paper' }));
});
