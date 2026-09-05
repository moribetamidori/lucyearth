import type { PaperBroker } from './interface';
import { activeOrderStatuses, type Account, type Bar, type BrokerOrder, type OrderRequest, type Position, type Preview, type Quote } from '../types';

export interface SimulationLedger {
  list(): Promise<BrokerOrder[]>;
  save(order: BrokerOrder): Promise<void>;
}
export function syntheticPrice(symbol: string, time: number) {
  const base = symbol === 'SPY' ? 650 : 580;
  const step = time / 900000;
  return base + Math.sin(step / 96) * 5 + Math.sin(step / 13) * 0.6;
}

export class SimulatedBroker implements PaperBroker {
  readonly kind = 'simulated' as const;
  readonly accountId = 'quant-lab';
  constructor(private readonly ledger: SimulationLedger, private readonly clock = () => new Date()) {}
  async listAccounts() { return [{ id: this.accountId, type: 'SIMULATED · synthetic prices' }]; }
  async getQuote(symbol: string): Promise<Quote> {
    const now = this.clock(); const price = syntheticPrice(symbol, now.getTime());
    return { symbol, last: price, bid: price - 0.01, ask: price + 0.01, asOf: now.toISOString(), receivedAt: now.toISOString(), delaySeconds: 0, source: this.kind };
  }
  async getBars(symbol: string, _timeframe: '15m', start: string, end: string): Promise<Bar[]> {
    const bars: Bar[] = [];
    const finish = Math.floor(Date.parse(end) / 900000) * 900000;
    const begin = Math.max(Math.ceil(Date.parse(start) / 900000) * 900000, finish - 500 * 900000);
    for (let t = begin; t < finish; t += 900000) {
      const open = syntheticPrice(symbol, t), close = syntheticPrice(symbol, t + 899999);
      bars.push({ timestamp: new Date(t).toISOString(), open, close, high: Math.max(open, close) + 0.3, low: Math.min(open, close) - 0.3, volume: Math.round(1000000 * (1 + 0.3 * Math.sin(t / 900000 / 5))) });
    }
    return bars;
  }
  async getCapabilities(symbol: string) { return { symbol, fractional: true, notional: true, fractionalLimit: false as const }; }
  async getPositions(): Promise<Position[]> {
    const lots = new Map<string, { quantity: number; cost: number }>();
    for (const o of (await this.ledger.list()).sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''))) {
      if (!o.filledQuantity || o.averageFillPrice === null) continue;
      const lot = lots.get(o.symbol) ?? { quantity: 0, cost: 0 };
      if (o.side === 'BUY') { lot.quantity += o.filledQuantity; lot.cost += o.filledQuantity * o.averageFillPrice; }
      else { const average = lot.quantity > 0 ? lot.cost / lot.quantity : 0; lot.quantity -= o.filledQuantity; lot.cost -= average * o.filledQuantity; }
      lots.set(o.symbol, lot);
    }
    return Promise.all([...lots].filter(([, lot]) => lot.quantity > 1e-9).map(async ([symbol, lot]) => {
      const quote = await this.getQuote(symbol);
      return { symbol, quantity: lot.quantity, averagePrice: lot.cost / lot.quantity, marketValue: lot.quantity * quote.last, unrealizedPnl: lot.quantity * quote.last - lot.cost };
    }));
  }
  async getAccount(): Promise<Account> {
    const orders = await this.ledger.list();
    const cash = 10000 + orders.reduce((sum, o) => sum + (o.side === 'SELL' ? 1 : -1) * (o.filledNotional ?? 0) - o.fees, 0);
    const positions = await this.getPositions();
    const equity = cash + positions.reduce((sum, p) => sum + p.marketValue, 0);
    // Mark the entire ledger at the previous NY midnight for a reproducible daily baseline.
    const now = this.clock();
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const previousOrders = orders.filter(o => o.filledAt && new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(o.filledAt)) < day);
    const oldCash = 10000 + previousOrders.reduce((sum, o) => sum + (o.side === 'SELL' ? 1 : -1) * (o.filledNotional ?? 0) - o.fees, 0);
    // Find the first instant of the NY date, including DST changes.
    let midnight = Date.parse(`${day}T00:00:00Z`);
    const localDay = (t: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
    while (localDay(midnight) !== day) midnight += 3600000;
    const oldValue = previousOrders.reduce((sum, o) => sum + (o.side === 'BUY' ? 1 : -1) * o.filledQuantity * syntheticPrice(o.symbol, midnight), 0);
    return { id: this.accountId, currency: 'USD', equity, cash, buyingPower: cash, dayPnl: equity - (oldCash + oldValue), asOf: now.toISOString() };
  }
  async getOrders() { return (await this.ledger.list()).filter(o => activeOrderStatuses.includes(o.status)); }
  async getHistory(start: string, end: string) {
    return (await this.ledger.list()).filter(o => o.submittedAt && o.submittedAt.slice(0, 10) >= start && o.submittedAt.slice(0, 10) <= end);
  }
  async getOrder(id: string) {
    const order = (await this.ledger.list()).find(o => o.clientOrderId === id);
    if (!order) throw new Error('Simulated order not found.');
    if (activeOrderStatuses.includes(order.status)) return this.fillIfEligible(order);
    return order;
  }
  async previewOrder(order: OrderRequest): Promise<Preview> {
    const quote = await this.getQuote(order.symbol);
    const estimatedNotional = order.notional ?? order.quantity! * (order.limitPrice ?? quote.last);
    return { accepted: true, estimatedNotional, estimatedFees: 0.01 + estimatedNotional * 0.0001, warnings: ['Synthetic prices and simulated fills. This is not a Webull order.', 'Stop and target levels require manual evaluation; no resting protection.'], source: this.kind };
  }
  async placeOrder(request: OrderRequest) {
    const existing = (await this.ledger.list()).find(o => o.clientOrderId === request.clientOrderId);
    if (existing) return existing;
    const order: BrokerOrder = {
      ...request, id: `sim-${request.clientOrderId}`, status: 'submitted', filledQuantity: 0, filledNotional: 0,
      averageFillPrice: null, fees: 0, feesFinal: true, submittedAt: this.clock().toISOString(), filledAt: null,
    };
    await this.ledger.save(order);
    return this.fillIfEligible(order);
  }
  private async fillIfEligible(order: BrokerOrder) {
    const quote = await this.getQuote(order.symbol);
    const price = order.side === 'BUY' ? quote.ask! * 1.0001 : quote.bid! * 0.9999;
    if (order.orderType === 'LIMIT' && (order.side === 'BUY' ? price > order.limitPrice! : price < order.limitPrice!)) return order;
    const quantity = order.notional === null ? order.quantity! : Math.floor(order.notional / price * 1000000) / 1000000;
    const filled: BrokerOrder = { ...order, status: 'filled', filledQuantity: quantity, filledNotional: quantity * price, averageFillPrice: price, fees: 0.01 + quantity * price * 0.0001, filledAt: this.clock().toISOString() };
    await this.ledger.save(filled); return filled;
  }
  async cancelOrder(id: string) {
    const order = await this.getOrder(id);
    if (order.filledQuantity > 0 || order.status === 'filled') throw new Error('Order already filled.');
    await this.ledger.save({ ...order, status: 'cancelled' });
  }
}
