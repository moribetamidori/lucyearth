import 'server-only';
import { randomUUID } from 'node:crypto';
import { assertPaperMode, required } from '../config';
import { signature } from './signature';
import type { PaperBroker } from './interface';
import type { Account, Bar, BrokerOrder, Capabilities, OrderRequest, OrderStatus, Position, Preview, Quote } from '../types';

export const SANDBOX_HOST = 'api.sandbox.webull.com';
const endpoints = {
  accounts: '/trading/accounts/list', balance: '/trading/assets/balances/get', positions: '/trading/assets/positions/list',
  quote: '/market-data/stocks/snapshots/list', bars: '/market-data/stocks/bars/list',
  instrument: '/trading/instruments/stocks/profiles/list', open: '/trading/orders/open-orders/list',
  history: '/trading/orders/historical-orders/list', detail: '/trading/orders/get',
  preview: '/trading/orders/preview', place: '/trading/orders/place', cancel: '/trading/orders/cancel',
} as const;
type Json = Record<string, unknown>;
function record(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Unexpected Webull response structure.');
  return value as Json;
}
function unwrap(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'data' in value) return (value as Json).data;
  return value;
}
function items(value: unknown, keys: string[] = []): unknown[] {
  const data = unwrap(value);
  if (Array.isArray(data)) return data;
  const r = record(data);
  for (const key of keys) if (Array.isArray(r[key])) return r[key] as unknown[];
  throw new Error('Webull collection schema was not recognized. Execution is blocked.');
}
function number(value: unknown, label: string): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value))) throw new Error(`Webull omitted a valid ${label}.`);
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`Webull returned invalid ${label}.`);
  return result;
}
function optionalNumber(value: unknown, label: string) { return value === undefined || value === null || value === '' ? null : number(value, label); }
function timestamp(value: unknown): string {
  if (value === null || value === undefined || value === '') throw new Error('Webull omitted a market or execution timestamp.');
  const numeric = typeof value === 'number' || typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : null;
  const time = numeric === null ? Date.parse(String(value)) : numeric > 1e14 ? numeric / 1e6 : numeric > 1e11 ? numeric : numeric * 1000;
  if (!Number.isFinite(time)) throw new Error('Webull returned an invalid timestamp.');
  return new Date(time).toISOString();
}
function string(value: unknown, label: string) { if (typeof value !== 'string' || !value) throw new Error(`Webull omitted ${label}.`); return value; }

export function webullOrderBody(accountId: string, order: OrderRequest) {
  return { account_id: accountId, new_orders: [{
    client_order_id: order.clientOrderId, combo_type: 'NORMAL', symbol: order.symbol, instrument_type: 'EQUITY', market: 'US',
    side: order.side, order_type: order.orderType, time_in_force: 'DAY', support_trading_session: 'CORE',
    entrust_type: order.notional !== null ? 'AMOUNT' : 'QTY',
    ...(order.notional !== null ? { total_cash_amount: order.notional.toFixed(2) } : { quantity: String(order.quantity) }),
    ...(order.limitPrice !== null ? { limit_price: String(order.limitPrice) } : {}),
  }] };
}

export function normalizeWebullOrder(value: unknown): BrokerOrder {
  const r = record(value);
  const statuses: Record<string, OrderStatus> = { NEW: 'submitted', WORKING: 'submitted', SUBMITTED: 'submitted', PENDING: 'submitted', PENDING_NEW: 'submitted', PENDING_CANCEL: 'submitted', PARTIAL_FILLED: 'partial', PARTIALLY_FILLED: 'partial', FILLED: 'filled', CANCELLED: 'cancelled', CANCELED: 'cancelled', REJECTED: 'rejected', FAILED: 'rejected', EXPIRED: 'expired' };
  const filled = number(r.filled_quantity ?? '0', 'filled quantity');
  const average = optionalNumber(r.filled_price, 'average fill price');
  if (filled < 0 || filled > 0 && (average === null || average <= 0)) throw new Error('Webull fill data is incomplete.');
  const side = string(r.side, 'order side');
  if (side !== 'BUY' && side !== 'SELL') throw new Error('Unsupported order side in account.');
  const type = string(r.order_type, 'order type');
  if (type !== 'LIMIT' && type !== 'MARKET') throw new Error('Unsupported order type in account.');
  if (r.instrument_type !== undefined && r.instrument_type !== 'EQUITY') throw new Error('Only equity orders are supported.');
  const commission = r.commission ? record(r.commission) : null;
  const feeRows = Array.isArray(r.fees) ? r.fees.map(record) : [];
  const feesKnown = commission?.actual_commission !== undefined && Array.isArray(r.fees) && feeRows.every(f => f.actual_value !== undefined);
  const fees = number(commission?.actual_commission ?? '0', 'commission') + feeRows.reduce((sum, f) => sum + number(f.actual_value ?? '0', 'fee'), 0);
  if (fees < 0) throw new Error('Invalid broker fees.');
  return {
    id: string(r.order_id ?? r.client_order_id, 'order ID'), clientOrderId: string(r.client_order_id, 'client order ID'),
    symbol: string(r.symbol, 'symbol'), side, quantity: optionalNumber(r.total_quantity, 'quantity'),
    notional: optionalNumber(r.total_cash_amount, 'cash amount'), orderType: type,
    limitPrice: optionalNumber(r.limit_price, 'limit price'), status: statuses[String(r.order_status ?? r.status)] ?? 'unknown',
    filledQuantity: filled, averageFillPrice: average, filledNotional: optionalNumber(r.filled_amount, 'filled amount') ?? (average === null ? 0 : filled * average),
    fees, feesFinal: feesKnown && ['FILLED', 'CANCELLED', 'FAILED'].includes(String(r.status)),
    submittedAt: r.place_time_at || r.place_time ? timestamp(r.place_time_at ?? r.place_time) : null,
    filledAt: filled > 0 ? timestamp(r.filled_time_at ?? r.filled_time) : null,
  };
}

function groupedOrders(value: unknown): BrokerOrder[] {
  return items(value).flatMap(value => {
    const group = record(value);
    if (group.combo_type !== 'NORMAL') throw new Error('Non-simple orders in this account require manual reconciliation.');
    return items(group.orders).map(normalizeWebullOrder);
  });
}

export class WebullPaperBroker implements PaperBroker {
  readonly kind = 'webull_paper' as const;
  private readonly appKey = required('WEBULL_PAPER_APP_KEY');
  private readonly appSecret = required('WEBULL_PAPER_APP_SECRET');
  constructor(readonly accountId: string, private readonly rateLimit: (path: string) => Promise<void>, private readonly log: (path: string, status: number) => Promise<void>, private readonly transport: typeof fetch = fetch) { assertPaperMode(); }

  private async request(endpoint: keyof typeof endpoints, query: Record<string, string> = {}, body?: unknown) {
    assertPaperMode();
    const path = endpoints[endpoint];
    await this.rateLimit(path);
    const serialized = body === undefined ? '' : JSON.stringify(body);
    const time = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), nonce = randomUUID().replaceAll('-', '');
    const headers: Record<string, string> = {
      'x-app-key': this.appKey, 'x-timestamp': time, 'x-signature-algorithm': 'HMAC-SHA1',
      'x-signature-version': '1.0', 'x-signature-nonce': nonce, 'x-version': 'v2', 'Content-Type': 'application/json',
      'x-signature': signature({ path, query, body: serialized, appKey: this.appKey, appSecret: this.appSecret, host: SANDBOX_HOST, timestamp: time, nonce }),
    };
    if (process.env.WEBULL_PAPER_ACCESS_TOKEN) headers['x-access-token'] = process.env.WEBULL_PAPER_ACCESS_TOKEN;
    // Host/path come from code constants only. Credentials cannot select a live endpoint.
    const url = new URL(path, `https://${SANDBOX_HOST}`);
    url.search = new URLSearchParams(query).toString();
    let response: Response;
    try { response = await this.transport(url, { method: body === undefined ? 'GET' : 'POST', headers, body: serialized || undefined, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(12000) }); }
    catch { throw new Error('Webull sandbox request did not return a confirmed result. Reconcile before retrying an order.'); }
    // Never log signed headers, bodies, tokens or upstream error text.
    await this.log(path, response.status);
    if (!response.ok) throw new Error(`Webull sandbox returned HTTP ${response.status}. Check sandbox credentials, permissions and the connection log.`);
    const data: unknown = await response.json();
    if (data && typeof data === 'object' && 'error_code' in data && (data as Json).error_code) throw new Error('Webull sandbox rejected the request. No automatic order retry was made.');
    return data;
  }
  async listAccounts() {
    return items(await this.request('accounts'), ['accounts']).map(value => { const r = record(value); return { id: string(r.account_id, 'account ID'), type: string(r.account_type, 'account type') }; });
  }
  async verifyAccount() { if (!this.accountId || !(await this.listAccounts()).some(a => a.id === this.accountId)) throw new Error('Pin an account returned by Webull sandbox account discovery.'); }
  async getAccount(): Promise<Account> {
    await this.verifyAccount();
    const r = record(unwrap(await this.request('balance', { account_id: this.accountId })));
    const assets = items(r.account_currency_assets, []).map(record).find(a => a.currency === 'USD');
    if (!assets || r.total_asset_currency !== 'USD') throw new Error('A USD sandbox account is required.');
    return { id: this.accountId, currency: 'USD', equity: number(r.total_net_liquidation_value, 'net liquidation value'), cash: number(assets.settled_cash ?? assets.cash_balance, 'cash'), buyingPower: number(assets.buying_power ?? assets.overnight_buying_power, 'buying power'), dayPnl: optionalNumber(r.total_day_profit_loss ?? assets.day_profit_loss, 'daily P&L'), asOf: new Date().toISOString() };
  }
  async getPositions(): Promise<Position[]> {
    return items(await this.request('positions', { account_id: this.accountId }), ['positions', 'holdings']).map(value => {
      const r = record(value);
      if (r.instrument_type !== 'EQUITY' || r.currency !== 'USD') throw new Error('Only USD equity positions are supported.');
      const quantity = number(r.quantity, 'position quantity');
      return { symbol: string(r.symbol, 'position symbol'), quantity, averagePrice: number(r.cost_price, 'position cost'), marketValue: quantity * number(r.last_price, 'position price'), unrealizedPnl: number(r.unrealized_profit_loss, 'unrealized P&L') };
    });
  }
  async getQuote(symbol: string): Promise<Quote> {
    const r = items(await this.request('quote', { symbols: symbol, category: 'US_ETF' })).map(record).find(r => r.symbol === symbol);
    if (!r) throw new Error('Webull did not return the requested symbol.');
    return { symbol, last: number(r.price, 'quote price'), bid: optionalNumber(r.bid, 'bid'), ask: optionalNumber(r.ask, 'ask'), asOf: timestamp(r.last_trade_time), receivedAt: new Date().toISOString(), delaySeconds: 900, source: this.kind };
  }
  async getBars(symbol: string, _timeframe: '15m', start: string, end: string): Promise<Bar[]> {
    const startTime = Date.parse(start); let endTime = Date.parse(end) - 1;
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime >= endTime) throw new Error('Invalid bar date range.');
    const all = new Map<string, Bar>();
    for (let page = 0; page < 20; page++) {
      const data = record(await this.request('bars', {}, { symbols: [symbol], category: 'US_ETF', timespan: 'M15', count: 500, trading_sessions: 'RTH', start_time: startTime, end_time: endTime, real_time_required: false }));
      const group = items(data.result).map(record).find(r => r.symbol === symbol);
      if (!group) throw new Error('Webull omitted the requested bar series.');
      const values = items(group.result);
      let earliest = endTime + 1;
      for (const value of values) {
        const r = record(value), time = timestamp(r.time), ms = Date.parse(time);
        if (ms < startTime || ms > endTime) throw new Error('Webull returned bars outside the requested range.');
        earliest = Math.min(earliest, ms);
        all.set(time, { timestamp: time, open: number(r.open, 'bar open'), high: number(r.high, 'bar high'), low: number(r.low, 'bar low'), close: number(r.close, 'bar close'), volume: number(r.volume, 'bar volume') });
      }
      if (values.length < 500 || earliest <= startTime) return [...all.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      if (earliest > endTime) throw new Error('Bar pagination stalled.');
      endTime = earliest - 1;
    }
    throw new Error('Bar range exceeds the bounded page limit. Request a smaller range.');
  }
  async getCapabilities(symbol: string): Promise<Capabilities> {
    const r = items(await this.request('instrument', { symbols: symbol, category: 'US_STOCK' })).map(record).find(r => r.symbol === symbol);
    if (!r) throw new Error('Instrument permissions are unavailable.');
    if (r.currency !== 'USD' || r.status !== 'OC') throw new Error('Instrument is not open for trading in USD.');
    const fractional = r.fractionable === true;
    return { symbol, fractional, notional: fractional, fractionalLimit: false };
  }
  async getOrders() { return this.orderPages('open'); }
  async getHistory(start: string, end: string) { return this.orderPages('history', { start_date: start, end_date: end }); }
  private async orderPages(endpoint: 'open' | 'history', query: Record<string, string> = {}) {
    const all: BrokerOrder[] = []; let cursor = '';
    for (let page = 0; page < 20; page++) {
      const data = groupedOrders(await this.request(endpoint, { account_id: this.accountId, ...query, page_size: '100', ...(cursor ? { last_client_order_id: cursor } : {}) }));
      all.push(...data); if (data.length < 100) return all;
      const next = data.at(-1)!.clientOrderId; if (next === cursor) throw new Error('Webull order history pagination stalled.'); cursor = next;
    }
    throw new Error('History exceeds the bounded page limit. Request a smaller date range.');
  }
  async getOrder(id: string) {
    const group = record(await this.request('detail', { account_id: this.accountId, client_order_id: id }));
    const orders = groupedOrders([group]);
    if (orders.length !== 1 || orders[0].clientOrderId !== id) throw new Error('Webull returned a different order.');
    return orders[0];
  }
  async previewOrder(order: OrderRequest): Promise<Preview> {
    const raw = unwrap(await this.request('preview', {}, webullOrderBody(this.accountId, order)));
    const r = Array.isArray(raw) && raw.length === 1 ? record(raw[0]) : record(raw);
    if (r.error_code || r.success === false) throw new Error('Webull rejected the paper preview.');
    // Unknown preview formats fail closed; estimated fees are never assumed away.
    return { accepted: true, estimatedNotional: number(r.estimated_cost, 'preview consideration'), estimatedFees: number(r.estimated_transaction_fee, 'preview fees'), warnings: ['Webull sandbox · market data may be delayed 15 minutes.', 'Estimated consideration can include charges; fees are reserved conservatively.', 'Exit targets are manually monitored; this order has no resting stop or target.'], source: this.kind };
  }
  async placeOrder(order: OrderRequest) {
    await this.request('place', {}, webullOrderBody(this.accountId, order));
    // Always read back. A successful placement response is not proof of a fill.
    return this.getOrder(order.clientOrderId);
  }
  async cancelOrder(id: string) { await this.request('cancel', {}, { account_id: this.accountId, client_order_id: id }); }
}
