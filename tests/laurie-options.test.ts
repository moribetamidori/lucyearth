import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateOptionAtExpiry } from '../lib/laurie/options';
import type { Candle } from '../lib/laurie/types';

const history: Candle[] = Array.from({ length: 70 }, (_, index) => ({ timestamp: new Date(Date.UTC(2026, 5, 1 + index)).toISOString(),
  open: 100, high: 100, low: 100, close: 100, volume: 1000 }));

test('expiry expected return uses contract payoff and the executable ask', () => {
  const estimate = estimateOptionAtExpiry({ symbol: 'TEST261016C00090000', expiration: '2026-10-16', strike: 90,
    type: 'CALL', multiplier: 100 }, 5, 100, history, new Date('2026-09-29T20:00:00Z'));
  assert.ok(estimate);
  assert.equal(Math.round(estimate.expectedPnl), 500);
  assert.equal(Math.round(estimate.expectedReturnPct), 100);
  assert.equal(estimate.probabilityProfitPct, 100);
  assert.equal(estimate.breakeven, 95);
  assert.equal(estimate.maxLoss, 500);
});

test('a contract with no reliable purchase price produces no estimate', () => {
  assert.equal(estimateOptionAtExpiry({ symbol: 'TEST261016P00110000', expiration: '2026-10-16', strike: 110,
    type: 'PUT', multiplier: 100 }, 0, 100, history, new Date('2026-09-29T20:00:00Z')), null);
});
