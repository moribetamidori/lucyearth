import { z } from 'zod';

export type BrokerKind = 'simulated' | 'webull_paper';
export type Account = {
  id: string; currency: 'USD'; equity: number; cash: number; buyingPower: number;
  dayPnl: number | null; asOf: string;
};
export type Position = { symbol: string; quantity: number; averagePrice: number; marketValue: number; unrealizedPnl: number };
export type Quote = {
  symbol: string; last: number; bid: number | null; ask: number | null;
  asOf: string; receivedAt: string; delaySeconds: number; source: BrokerKind;
};
export type Bar = { timestamp: string; open: number; high: number; low: number; close: number; volume: number };
export type Features = { ema20: number; ema50: number; atr14: number; volumeRatio: number; return5: number };
export type Capabilities = { symbol: string; fractional: boolean; notional: boolean; fractionalLimit: false };
export type OrderStatus = 'pending_approval' | 'submitting' | 'submitted' | 'partial' | 'filled' | 'cancelled' | 'rejected' | 'expired' | 'unknown';
export type BrokerOrder = {
  id: string; clientOrderId: string; symbol: string; side: 'BUY' | 'SELL';
  quantity: number | null; notional: number | null; filledQuantity: number;
  averageFillPrice: number | null; filledNotional: number | null; fees: number;
  feesFinal?: boolean;
  orderType: 'LIMIT' | 'MARKET'; limitPrice: number | null; status: OrderStatus;
  submittedAt: string | null; filledAt: string | null;
};
export type OrderRequest = {
  clientOrderId: string; symbol: string; side: 'BUY' | 'SELL';
  quantity: number | null; notional: number | null; orderType: 'LIMIT' | 'MARKET'; limitPrice: number | null;
};
export type Preview = { accepted: boolean; estimatedNotional: number; estimatedFees: number; warnings: string[]; source: BrokerKind };

export const proposalJsonSchema = z.strictObject({
  action: z.enum(['BUY', 'SELL', 'HOLD', 'NO_TRADE']),
  symbol: z.string().regex(/^[A-Z]{1,8}$/),
  quantity: z.number().positive().max(100000).nullable(),
  notional: z.number().positive().max(1000000).nullable(),
  order_type: z.enum(['LIMIT', 'MARKET']).nullable(),
  limit_price: z.number().positive().nullable(),
  stop_loss: z.number().positive().nullable(),
  take_profit: z.number().positive().nullable(),
  confidence: z.number().min(0).max(1),
  thesis: z.string().min(1).max(2000),
  signals: z.array(z.string().max(300)).max(12),
  invalidation_conditions: z.array(z.string().max(300)).max(12),
});
export const proposalSchema = proposalJsonSchema.superRefine((p, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (p.action === 'HOLD' || p.action === 'NO_TRADE') {
    if ([p.quantity, p.notional, p.order_type, p.limit_price, p.stop_loss, p.take_profit].some(v => v !== null)) fail('A non-trading decision cannot contain order terms.');
    return;
  }
  if (!p.order_type || (p.quantity === null) === (p.notional === null)) fail('Choose exactly one sizing method and an order type.');
  if (p.action === 'SELL' && p.notional !== null) fail('Sell only an explicit owned quantity.');
  if (p.order_type === 'LIMIT' ? p.limit_price === null : p.limit_price !== null) fail('Only LIMIT orders have a limit price.');
  if (p.notional !== null && p.order_type !== 'MARKET') fail('Cash-notional orders require MARKET.');
  if (p.quantity !== null && !Number.isInteger(p.quantity) && p.order_type !== 'MARKET') fail('Fractional LIMIT orders are unsupported.');
});
export type Proposal = z.infer<typeof proposalJsonSchema>;

export const strategySchema = z.strictObject({
  name: z.string().max(100), version: z.number().int().positive(),
  universe: z.array(z.enum(['SPY', 'QQQ'])).min(1).max(2), timeframe: z.literal('15m'),
  features: z.array(z.enum(['EMA20', 'EMA50', 'ATR14', 'volume_ratio', 'return5'])),
  entry_rules: z.array(z.enum(['ema20_above_ema50', 'close_above_ema20', 'volume_ratio_above_1', 'positive_return5'])),
  exit_rules: z.array(z.enum(['close_below_ema20', 'stop_1_5_atr', 'target_3_atr'])),
  position_sizing_rules: z.literal('fixed_25_usd_within_risk_limits'), notes: z.string().max(2000),
});
export type StrategyDefinition = z.infer<typeof strategySchema>;
export type Strategy = {
  id: string; version: number; parent_strategy_id: string | null; status: string;
  strategy_definition: StrategyDefinition; created_at: string; created_by: string; change_summary: string;
};
export type Snapshot = {
  timestamp: string; broker: BrokerKind; account: Account; positions: Position[]; openOrders: BrokerOrder[];
  quote: Quote; bars: Bar[]; features: Features; capabilities: Capabilities; strategy: Strategy;
  featureVersion: string; promptVersion: string; riskPolicyVersion: string;
};
export type RiskResult = { allowed: boolean; reasons: string[]; notional: number; policyVersion: string };
export type Decision = {
  id: string; account_key: string; strategy_id: string; strategy_version: number; timestamp: string;
  symbol: string; action: Proposal['action']; confidence: number; reasoning_summary: string;
  market_context: Snapshot; raw_agent_output: unknown; proposal: Proposal; risk_result: RiskResult;
  model: string; prompt_version: string; source: 'llm' | 'deterministic_simulator';
};
export type StoredOrder = {
  id: string; account_key: string; decision_id: string; broker_order_id: string | null;
  client_order_id: string; symbol: string; side: 'BUY' | 'SELL'; quantity: number | null;
  notional: number | null; order_type: 'LIMIT' | 'MARKET'; limit_price: number | null;
  status: OrderStatus; request: OrderRequest; preview: Preview; approval_hash: string;
  approval_expires_at: string; approved_by: string | null; approved_at: string | null;
  submitted_at: string | null; filled_at: string | null; fill_price: number | null;
  filled_quantity: number; filled_notional: number; fees: number; created_at: string;
  fees_final: boolean;
};
export type Trade = {
  id: string; strategy_version: number; symbol: string; entry_time: string; entry_price: number;
  exit_time: string | null; exit_price: number | null; quantity: number; realized_pnl: number | null;
  return_pct: number | null; max_adverse_excursion: number | null; max_favorable_excursion: number | null;
};
export type SystemEvent = { id: number; created_at: string; kind: string; message: string; details: Record<string, unknown> };
export const activeOrderStatuses: OrderStatus[] = ['submitting', 'submitted', 'partial', 'unknown'];
