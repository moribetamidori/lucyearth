import type { Candle, LaurieRun, LaurieSnapshot } from './types';
import type { ChartRange, DisplayInterval } from './chart';

export const DEMO_BASE_TIME = '2026-09-24T19:59:00.000Z';

function sampleBase(symbol: string) {
  if (symbol === 'SPY') return 684.12;
  if (symbol === 'QQQ') return 602.12;
  if (symbol === 'AAPL') return 340.12;
  return 80 + [...symbol].reduce((sum, character) => sum * 7 + character.charCodeAt(0), 0) % 320;
}

export function demoCandles(symbol = 'SPY'): Candle[] {
  const end = Date.parse(DEMO_BASE_TIME);
  const bars: Candle[] = [];
  let prior = sampleBase(symbol);
  for (let i = 0; i < 780; i++) {
    const minuteInSession = i % 390;
    const sessionEnd = end - (i < 390 ? 86_400_000 : 0);
    const drift = Math.sin(i * 0.21) * 0.095 + Math.cos(i * 0.51) * 0.052 + (minuteInSession > 270 ? 0.027 : -0.006);
    const close = +(prior + drift).toFixed(2);
    const wick = 0.08 + (i % 7) * 0.013;
    bars.push({
      timestamp: new Date(sessionEnd - (389 - minuteInSession) * 60_000).toISOString(),
      open: prior,
      high: +(Math.max(prior, close) + wick).toFixed(2),
      low: +(Math.min(prior, close) - wick * 0.8).toFixed(2),
      close,
      volume: Math.round(32000 + 15000 * Math.abs(Math.sin(i * 0.37)) + (i % 11) * 1030),
    });
    prior = close;
  }
  return bars;
}

export function demoChartCandles(symbol: string, range: ChartRange, interval: DisplayInterval): Candle[] {
  if (range === '1D' && interval === '1m') return demoCandles(symbol).slice(-390);
  const intradayMinutes: Partial<Record<DisplayInterval, number>> = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240 };
  const minuteStep = intradayMinutes[interval];
  const end = Date.parse(DEMO_BASE_TIME);
  const dates: number[] = [];
  if (minuteStep) {
    const sessions = range === '1W' ? 5 : range === '1M' ? 22 : range === '3M' ? 65 : 1;
    for (let day = 0; dates.length < sessions; day++) {
      const session = end - day * 86_400_000;
      const weekday = new Date(session).getUTCDay();
      if (weekday !== 0 && weekday !== 6) dates.unshift(session);
    }
  } else {
    const count = interval === '1D' ? range === '1W' ? 5 : range === '1M' ? 22 : range === '3M' ? 65 : range === 'YTD' ? 190 : 252 :
      interval === '1W' ? range === '1M' ? 4 : range === '3M' ? 13 : range === 'YTD' ? 40 : range === '1Y' ? 52 : 260 :
      range === 'YTD' ? 9 : range === '1Y' ? 12 : range === '5Y' ? 60 : 390;
    if (interval === '1D') {
      for (let day = 0; dates.length < count; day++) {
        const time = end - day * 86_400_000;
        const weekday = new Date(time).getUTCDay();
        if (weekday !== 0 && weekday !== 6) dates.unshift(time);
      }
    } else if (interval === '1W') {
      for (let i = count - 1; i >= 0; i--) dates.push(end - i * 7 * 86_400_000);
    } else {
      for (let i = count - 1; i >= 0; i--) {
        const time = new Date(end);
        time.setUTCMonth(time.getUTCMonth() - i);
        dates.push(time.getTime());
      }
    }
  }
  const times = minuteStep ? dates.flatMap(session => Array.from({ length: Math.ceil(390 / minuteStep) }, (_, i) =>
    session - 389 * 60_000 + i * minuteStep * 60_000)) : dates;
  let prior = sampleBase(symbol) * (times.length > 300 ? 0.79 : 0.96);
  return times.map((time, i) => {
    const drift = Math.sin(i * 0.29) * prior * 0.0007 + prior * 0.00012;
    const close = +(prior + drift).toFixed(2);
    const wick = Math.max(0.08, prior * 0.0003);
    const bar = { timestamp: new Date(time).toISOString(), open: prior,
      high: +(Math.max(prior, close) + wick).toFixed(2), low: +(Math.min(prior, close) - wick).toFixed(2),
      close, volume: Math.round((minuteStep ? minuteStep : interval === '1D' ? 390 : 1950) * (30000 + 10000 * Math.abs(Math.sin(i * 0.37)))) };
    prior = close;
    return bar;
  });
}

export function numericSummary(candles: Candle[]) {
  const recent = candles.slice(-20);
  const last = candles.at(-1)!;
  const first = recent[0]!;
  const change20 = +(((last.close / first.open) - 1) * 100).toFixed(3);
  const range20 = +(Math.max(...recent.map(c => c.high)) - Math.min(...recent.map(c => c.low))).toFixed(2);
  const avgVolume20 = Math.round(recent.reduce((sum, c) => sum + c.volume, 0) / recent.length);
  return { last: last.close, change20Pct: change20, range20, avgVolume20, sampleSize: candles.length };
}

export function demoRun(id: string, symbol: 'SPY' | 'QQQ' = 'SPY', historicalCandles?: Candle[]): LaurieRun {
  const candles = historicalCandles ?? demoCandles(symbol);
  const dataSource = historicalCandles ? 'webull_sandbox' : 'sample';
  const stats = numericSummary(candles);
  const now = new Date().toISOString();
  return {
    id, startedAt: now, completedAt: now, symbol, mode: 'demo', dataSource, candleTime: candles.at(-1)!.timestamp,
    decision: 'HOLD', explanation: historicalCandles ?
      'This simulated run used Webull sandbox history. Position and model access are not configured, so it holds without submitting an order.' :
      'The sample shows a mild upward drift, but it is recorded demo data. This run waits for a fresh sandbox signal.',
    inputSummary: `${candles.length} ${historicalCandles ? 'Webull sandbox historical' : 'sample'} 1-minute candles · 20-bar change ${stats.change20Pct}% · range $${stats.range20} · mean volume ${stats.avgVolume20.toLocaleString()}`,
    risk: 'No paper order requested. Demo runs never submit orders.', orderStatus: 'No order · demo simulation',
    model: 'deterministic demo', promptVersion: 'laurie-v1', estimatedCostUsd: 0, actualCostUsd: 0,
    inputTokens: 0, outputTokens: 0, error: null,
  };
}

export function demoSnapshot(accessNote: string | null = null, symbol: 'SPY' | 'QQQ' = 'SPY'): LaurieSnapshot {
  const candles = demoCandles(symbol);
  return { symbol, mode: 'demo', dataSource: 'sample', sourceLabel: 'Demo Mode · recorded sample · 24 Sep 2026',
    candles, latestPrice: candles.at(-1)!.close, dataTimestamp: candles.at(-1)!.timestamp,
    delaySeconds: null, position: { quantity: 0, cash: 10000, buyingPower: 10000 },
    runs: [], accessNote };
}
