import type { Bar, Features } from '../types';

export function closedBars(bars: Bar[], cutoff: string, intervalMs = 900000): Bar[] {
  const end = Date.parse(cutoff);
  if (!Number.isFinite(end)) throw new Error('Invalid data cutoff.');
  const sorted = [...bars].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const seen = new Set<number>();
  return sorted.filter(b => {
    const t = Date.parse(b.timestamp);
    if (!Number.isFinite(t) || [b.open, b.high, b.low, b.close].some(v => !Number.isFinite(v) || v <= 0) || !Number.isFinite(b.volume) || b.volume < 0 || b.low > Math.min(b.open, b.close) || b.high < Math.max(b.open, b.close) || b.low > b.high) throw new Error('Invalid historical bar.');
    if (seen.has(t)) throw new Error('Duplicate historical bars.');
    seen.add(t);
    return t + intervalMs <= end;
  });
}

function ema(values: number[], period: number) {
  let value = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (const next of values.slice(period)) value += 2 / (period + 1) * (next - value);
  return value;
}

export function calculateFeatures(bars: Bar[]): Features {
  if (bars.length < 60) throw new Error('At least 60 closed bars are required.');
  const closes = bars.map(b => b.close);
  const ranges = bars.slice(1).map((b, i) => Math.max(b.high - b.low, Math.abs(b.high - bars[i].close), Math.abs(b.low - bars[i].close)));
  let atr = ranges.slice(0, 14).reduce((a, b) => a + b, 0) / 14;
  for (const range of ranges.slice(14)) atr = (atr * 13 + range) / 14;
  const averageVolume = bars.slice(-21, -1).reduce((a, b) => a + b.volume, 0) / 20;
  return {
    ema20: ema(closes, 20), ema50: ema(closes, 50), atr14: atr,
    volumeRatio: averageVolume ? bars.at(-1)!.volume / averageVolume : 0,
    return5: closes.at(-1)! / closes.at(-6)! - 1,
  };
}
