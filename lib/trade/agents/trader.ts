import type { Proposal, Snapshot } from '../types';

// Deterministic fixture driver is available only with the simulated broker.
// It exercises the pipeline without pretending that an LLM ran.
export function simulatedBaseline(snapshot: Snapshot): Proposal {
  if (snapshot.broker !== 'simulated') throw new Error('The fixture driver cannot trade a Webull account.');
  const { features: f, quote: q } = snapshot;
  const position = snapshot.positions.find(p => p.symbol === q.symbol);
  const base: Proposal = {
    action: 'NO_TRADE', symbol: q.symbol, quantity: null, notional: null, order_type: null,
    limit_price: null, stop_loss: null, take_profit: null, confidence: 0.5,
    thesis: 'The deterministic baseline does not find sufficient confirmation in the synthetic bars.',
    signals: [], invalidation_conditions: [],
  };
  if (position && f.ema20 > q.last) return {
    ...base, action: 'SELL', quantity: Math.min(position.quantity, 0.05), order_type: 'MARKET',
    thesis: 'Synthetic price fell below EMA20. Propose a small reduction of the recorded holding.', signals: ['price below EMA20'],
  };
  if (!position && f.ema20 > f.ema50 && q.last > f.ema20 && f.return5 > 0 && f.volumeRatio > 1) return {
    ...base, action: 'BUY', notional: 25, order_type: 'MARKET', stop_loss: q.last - 1.5 * f.atr14, take_profit: q.last + 3 * f.atr14,
    confidence: 0.6, thesis: 'The synthetic data meets the baseline trend, volume, and recent-return conditions.',
    signals: ['EMA20 above EMA50', 'price above EMA20', 'volume ratio above 1', 'positive recent return'], invalidation_conditions: ['price below EMA20'],
  };
  return position ? { ...base, action: 'HOLD', thesis: 'Keep the simulated holding; no baseline exit is currently triggered.' } : base;
}
