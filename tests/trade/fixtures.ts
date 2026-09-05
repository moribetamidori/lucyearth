import type { Snapshot, OrderRequest } from '../../lib/trade/types';
import { strategySchema } from '../../lib/trade/types';
import baseline from '../../lib/trade/strategies/v1.json';

export const NOW = new Date('2026-09-04T15:00:00.000Z');
export function snapshot(): Snapshot {
  return {
    timestamp: NOW.toISOString(), broker: 'simulated',
    account: { id: 'quant-lab', currency: 'USD', equity: 10000, cash: 10000, buyingPower: 10000, dayPnl: 0, asOf: NOW.toISOString() },
    positions: [], openOrders: [],
    quote: { symbol: 'SPY', last: 650, bid: 649.99, ask: 650.01, asOf: NOW.toISOString(), receivedAt: NOW.toISOString(), delaySeconds: 0, source: 'simulated' },
    capabilities: { symbol: 'SPY', fractional: true, notional: true, fractionalLimit: false },
    bars: [], features: { ema20: 649, ema50: 645, atr14: 2, volumeRatio: 1.2, return5: 0.01 },
    strategy: { id: '11111111-1111-4111-8111-111111111111', version: 1, parent_strategy_id: null, status: 'current', strategy_definition: strategySchema.parse(baseline), created_at: NOW.toISOString(), created_by: 'system', change_summary: 'Test baseline' },
    featureVersion: 'features-v1', promptVersion: 'trader-v1', riskPolicyVersion: 'paper-risk-v1',
  };
}
export function buy(): OrderRequest { return { clientOrderId: 'testpaperorder', symbol: 'SPY', side: 'BUY', quantity: null, notional: 25, orderType: 'MARKET', limitPrice: null }; }
