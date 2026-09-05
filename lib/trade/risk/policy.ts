import { z } from 'zod';
import type { OrderRequest, RiskResult, Snapshot } from '../types';

export const POLICY_VERSION = 'paper-risk-v1';
export const policySchema = z.strictObject({
  maxOrderNotional: z.number().positive(), maxPositionPercent: z.number().positive().max(100),
  maxTotalExposure: z.number().positive().max(100), maxDailyLoss: z.number().positive(),
  maxOpenPositions: z.number().int().positive(), maxTradesPerDay: z.number().int().positive(),
  allowedSymbols: z.array(z.enum(['SPY', 'QQQ'])).min(1),
});
export type RiskPolicy = z.infer<typeof policySchema>;
export const DEFAULT_POLICY: Readonly<RiskPolicy> = Object.freeze({
  maxOrderNotional: 100, maxPositionPercent: 1, maxTotalExposure: 2, maxDailyLoss: 25,
  maxOpenPositions: 2, maxTradesPerDay: 4, allowedSymbols: ['SPY', 'QQQ'] as ('SPY' | 'QQQ')[],
});
Object.freeze(DEFAULT_POLICY.allowedSymbols);

export function loadRiskPolicy(env: Record<string, string | undefined> = process.env): Readonly<RiskPolicy> {
  const n = (key: string, fallback: number) => env[key] === undefined ? fallback : Number(env[key]);
  const policy = policySchema.parse({
    maxOrderNotional: n('MAX_ORDER_NOTIONAL', 100), maxPositionPercent: n('MAX_POSITION_PERCENT', 1),
    maxTotalExposure: n('MAX_TOTAL_EXPOSURE', 2), maxDailyLoss: n('MAX_DAILY_LOSS', 25),
    maxOpenPositions: n('MAX_OPEN_POSITIONS', 2), maxTradesPerDay: n('MAX_TRADES_PER_DAY', 4),
    allowedSymbols: env.ALLOWED_SYMBOLS === undefined ? ['SPY', 'QQQ'] : env.ALLOWED_SYMBOLS.split(',').map(s => s.trim()),
  });
  Object.freeze(policy.allowedSymbols);
  return Object.freeze(policy);
}

export function easternDay(now: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function withinCoreHours(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));
  // Webull's CORE session flag additionally enforces exchange holidays/early closes.
  return !['Sat', 'Sun'].includes(get('weekday')) && minutes >= 570 && minutes < 960;
}

export function validateOrder(order: OrderRequest, snapshot: Snapshot, state: { paused: boolean; submittedToday: number }, policy: Readonly<RiskPolicy> = DEFAULT_POLICY, now = new Date()): RiskResult {
  const reasons: string[] = [];
  const { account, quote, positions, openOrders, capabilities } = snapshot;
  const check = (test: boolean, reason: string) => { if (!test) reasons.push(reason); };
  const reducing = order.side === 'SELL';
  check(policy.allowedSymbols.includes(order.symbol as 'SPY' | 'QQQ'), 'Symbol is outside the immutable universe.');
  check(order.symbol === quote.symbol && order.symbol === capabilities.symbol, 'Market data does not match the order.');
  check(account.currency === 'USD' && Number.isFinite(account.equity) && account.equity > 0, 'Valid USD account equity is required.');
  check(!state.paused || reducing, 'New exposure is paused by the operator.');
  check(Number.isFinite(account.dayPnl), 'Daily account P&L is unavailable.');
  check(reducing || account.dayPnl! > -policy.maxDailyLoss, 'Maximum daily loss reached.');
  check(Number.isInteger(state.submittedToday) && state.submittedToday >= 0, 'Daily order count is unavailable.');
  check(reducing || state.submittedToday < policy.maxTradesPerDay, 'Maximum daily orders reached.');
  check(snapshot.broker === 'simulated' || withinCoreHours(now), 'Outside regular US market hours.');
  const age = now.getTime() - Date.parse(quote.asOf);
  const receiptAge = now.getTime() - Date.parse(quote.receivedAt);
  const accountAge = now.getTime() - Date.parse(account.asOf);
  check(Number.isFinite(age) && age >= -5000 && age <= (quote.delaySeconds + 120) * 1000 && quote.delaySeconds >= 0 && quote.delaySeconds <= 900, 'Quote is stale or its delay is invalid.');
  check(receiptAge >= -5000 && receiptAge <= 120000 && accountAge >= -5000 && accountAge <= 120000, 'Account or quote receipt is stale.');
  check(Number.isFinite(quote.last) && quote.last > 0, 'Invalid market price.');
  check((order.quantity === null) !== (order.notional === null), 'Exactly one sizing method is required.');
  check(order.quantity === null || Number.isFinite(order.quantity) && order.quantity > 0, 'Invalid quantity.');
  check(order.quantity === null || Math.abs(order.quantity * 1e6 - Math.round(order.quantity * 1e6)) < 1e-8, 'Quantity supports at most six decimal places.');
  check(order.notional === null || Math.abs(order.notional * 100 - Math.round(order.notional * 100)) < 1e-8, 'Cash-notional orders must use exact cents.');
  check(order.notional === null || Number.isFinite(order.notional) && order.notional >= 5 && order.side === 'BUY' && order.orderType === 'MARKET' && capabilities.notional && order.notional < quote.last, 'Unsupported cash-notional order.');
  check(order.orderType === 'MARKET' ? order.limitPrice === null : order.limitPrice !== null && Number.isFinite(order.limitPrice) && order.limitPrice > 0, 'Invalid order price or type.');
  if (order.quantity !== null && !Number.isInteger(order.quantity)) check(capabilities.fractional && order.orderType === 'MARKET' && order.quantity <= 1, 'Unsupported fractional order.');
  // Buying by quantity at MARKET has no enforceable notional ceiling.
  check(order.side !== 'BUY' || order.orderType !== 'MARKET' || order.notional !== null, 'Market buys must use a bounded cash amount.');
  const price = order.limitPrice ?? Math.max(quote.last, quote.ask ?? quote.last) * 1.02;
  const notional = order.notional ?? (order.quantity ?? NaN) * price;
  check(Number.isFinite(notional) && notional > 0 && Math.ceil(notional * 100 - 1e-8) <= Math.floor(policy.maxOrderNotional * 100), 'Maximum order notional exceeded.');
  const existing = positions.find(p => p.symbol === order.symbol);
  check(positions.every(p => Number.isFinite(p.quantity) && p.quantity >= 0 && Number.isFinite(p.marketValue) && p.marketValue >= 0), 'Account contains unsupported or invalid positions.');
  check(!openOrders.some(o => o.status === 'unknown' || o.status === 'submitting'), 'An order has an uncertain outcome; reconcile first.');
  const pending = openOrders.filter(o => ['submitted', 'partial'].includes(o.status));
  const reservedBuy = (symbol?: string) => pending.filter(o => o.side === 'BUY' && (!symbol || o.symbol === symbol)).reduce((sum, o) => {
    if (o.notional !== null) return sum + Math.max(0, o.notional - (o.filledNotional ?? 0));
    // Unknown market-order value blocks new exposure rather than assuming zero.
    if (o.quantity === null || o.limitPrice === null) return Infinity;
    return sum + Math.max(0, o.quantity - o.filledQuantity) * o.limitPrice;
  }, 0);
  if (reducing) {
    const reservedSell = pending.filter(o => o.side === 'SELL' && o.symbol === order.symbol).reduce((n, o) => n + Math.max(0, (o.quantity ?? Infinity) - o.filledQuantity), 0);
    check(order.quantity !== null && order.quantity <= (existing?.quantity ?? 0) - reservedSell + 1e-10, 'Sell exceeds unreserved owned shares; shorting is prohibited.');
  } else {
    check(Number.isFinite(account.cash) && Number.isFinite(account.buyingPower) && notional + reservedBuy() <= Math.min(account.cash, account.buyingPower), 'Insufficient unreserved cash buying power.');
    check((existing?.marketValue ?? 0) + reservedBuy(order.symbol) + notional <= account.equity * policy.maxPositionPercent / 100, 'Maximum position percentage exceeded.');
    check(positions.reduce((n, p) => n + p.marketValue, 0) + reservedBuy() + notional <= account.equity * policy.maxTotalExposure / 100, 'Maximum total exposure exceeded.');
    const symbols = new Set([...positions.filter(p => p.quantity > 0).map(p => p.symbol), ...pending.filter(o => o.side === 'BUY').map(o => o.symbol), order.symbol]);
    check(symbols.size <= policy.maxOpenPositions, 'Maximum open positions exceeded.');
  }
  return { allowed: reasons.length === 0, reasons, notional: Number.isFinite(notional) ? notional : 0, policyVersion: POLICY_VERSION };
}
