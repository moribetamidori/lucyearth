import type { Candle } from './types';

export type OptionContract = { symbol: string; expiration: string; strike: number; type: 'CALL' | 'PUT'; multiplier: number };
export type OptionEstimate = OptionContract & {
  bid: number | null; ask: number | null; impliedVolatility: number | null; openInterest: number | null;
  quoteTime: string | null; expectedPnl: number | null; expectedReturnPct: number | null;
  probabilityProfitPct: number | null; breakeven: number | null; maxLoss: number | null;
};
export type OptionAnalysis = {
  underlying: string; underlyingPrice: number; underlyingTime: string; expiration: string;
  historyEnd: string; historyDays: number; paths: number; contracts: OptionEstimate[];
  sourceLabel: string;
};

const PATHS = 2000;

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export function estimateOptionAtExpiry(contract: OptionContract, ask: number, spot: number, dailyBars: Candle[], now = new Date()) {
  if (!(ask > 0) || !(spot > 0) || contract.multiplier !== 100 || !/^20\d{2}-\d{2}-\d{2}$/.test(contract.expiration)) return null;
  const untilExpiry = (Date.parse(`${contract.expiration}T20:00:00Z`) - now.getTime()) / 86_400_000;
  if (!(untilExpiry > 0) || untilExpiry > 1096) return null;
  const history = [...dailyBars].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const returns = history.slice(1).map((bar, i) => Math.log(bar.close / history[i].close))
    .filter(value => Number.isFinite(value) && Math.abs(value) < 0.5);
  if (returns.length < 60) return null;
  const sessions = Math.max(1, Math.round(untilExpiry * 252 / 365));
  const random = seededRandom([...contract.symbol].reduce((seed, char) => Math.imul(seed ^ char.charCodeAt(0), 16777619), 2166136261));
  let total = 0, profitable = 0;
  const cost = ask * contract.multiplier;
  for (let path = 0; path < PATHS; path++) {
    let logReturn = 0;
    for (let session = 0; session < sessions; session++) logReturn += returns[Math.floor(random() * returns.length)];
    const finalSpot = spot * Math.exp(logReturn);
    const payoff = contract.type === 'CALL' ? Math.max(finalSpot - contract.strike, 0) : Math.max(contract.strike - finalSpot, 0);
    const pnl = payoff * contract.multiplier - cost;
    total += pnl;
    if (pnl > 0) profitable++;
  }
  const expectedPnl = total / PATHS;
  return {
    expectedPnl, expectedReturnPct: expectedPnl / cost * 100,
    probabilityProfitPct: profitable / PATHS * 100,
    breakeven: contract.type === 'CALL' ? contract.strike + ask : contract.strike - ask,
    maxLoss: cost, historyDays: returns.length, paths: PATHS,
  };
}
