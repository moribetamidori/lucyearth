import type { Candle } from './types';

export type CandleInterval = 1 | 5 | 30 | 60;
export type ChartCandle = Candle & { endTimestamp: string; startTimestamp?: string };
export type ChartRange = '1D' | '1W' | '1M' | '3M' | 'YTD' | '1Y' | '5Y' | 'MAX';
export type DisplayInterval = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1D' | '1W' | '1M';

export const chartRanges: ChartRange[] = ['1D', '1W', '1M', '3M', 'YTD', '1Y', '5Y', 'MAX'];
export const allIntervals: DisplayInterval[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1D', '1W', '1M'];
export const intervalOptions: Record<ChartRange, DisplayInterval[]> = {
  '1D': allIntervals, '1W': allIntervals, '1M': allIntervals, '3M': allIntervals,
  YTD: allIntervals, '1Y': allIntervals, '5Y': allIntervals, MAX: allIntervals,
};
export const defaultInterval: Record<ChartRange, DisplayInterval> = {
  '1D': '1m', '1W': '30m', '1M': '1h', '3M': '1D', YTD: '1D', '1Y': '1D', '5Y': '1W', MAX: '1M',
};
export const intervalDescription: Record<DisplayInterval, string> = {
  '1m': '1 minute', '5m': '5 minutes', '15m': '15 minutes', '30m': '30 minutes', '1h': '1 hour', '4h': '4 hours', '1D': '1 day', '1W': '1 week', '1M': '1 month',
};

export function isChartSelection(range: string, interval: string): range is ChartRange {
  return chartRanges.includes(range as ChartRange) && allIntervals.includes(interval as DisplayInterval);
}

export function chartRangeStart(range: ChartRange, now = new Date()): number | null {
  if (range === 'MAX') return null;
  const start = new Date(now);
  if (range === '1D') start.setUTCDate(start.getUTCDate() - 1);
  if (range === '1W') start.setUTCDate(start.getUTCDate() - 7);
  if (range === '1M') start.setUTCMonth(start.getUTCMonth() - 1);
  if (range === '3M') start.setUTCMonth(start.getUTCMonth() - 3);
  if (range === 'YTD') { start.setUTCMonth(0, 1); start.setUTCHours(0, 0, 0, 0); }
  if (range === '1Y') start.setUTCFullYear(start.getUTCFullYear() - 1);
  if (range === '5Y') start.setUTCFullYear(start.getUTCFullYear() - 5);
  return start.getTime();
}

export function chartCandles(candles: Candle[], interval: DisplayInterval): ChartCandle[] {
  const duration = { '1m': 60_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000, '1h': 3_600_000, '4h': 14_400_000,
    '1D': 86_400_000, '1W': 7 * 86_400_000, '1M': 32 * 86_400_000 }[interval];
  const sorted = [...candles].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return sorted.map((candle, index) => {
    const periodEndingBar = interval === '1W' || interval === '1M';
    const start = periodEndingBar ? index === 0 ? Date.parse(candle.timestamp) - duration : Date.parse(sorted[index - 1].timestamp) + 86_400_000 : Date.parse(candle.timestamp);
    const end = Date.parse(candle.timestamp) + (periodEndingBar ? 86_400_000 : duration) - 1;
    return { ...candle, startTimestamp: new Date(start).toISOString(), endTimestamp: new Date(end).toISOString() };
  });
}

export const candleIntervals: { minutes: CandleInterval; label: string; description: string }[] = [
  { minutes: 1, label: '1m', description: '1 minute' },
  { minutes: 5, label: '5m', description: '5 minutes' },
  { minutes: 30, label: '30m', description: '30 minutes' },
  { minutes: 60, label: '1h', description: '1 hour' },
];

const easternParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function bucketKey(timestamp: string, minutes: CandleInterval) {
  const parts = Object.fromEntries(easternParts.formatToParts(new Date(timestamp)).map(part => [part.type, part.value]));
  const minuteOfDay = Number(parts.hour) * 60 + Number(parts.minute);
  // Regular US market candles begin at 09:30 ET; hourly candles follow that session anchor.
  const sessionMinute = minuteOfDay - 570;
  return `${parts.year}-${parts.month}-${parts.day}:${Math.floor(sessionMinute / minutes)}`;
}

export function aggregateCandles(candles: Candle[], minutes: CandleInterval): ChartCandle[] {
  const sorted = [...candles].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (minutes === 1) return sorted.map(candle => ({ ...candle, endTimestamp: candle.timestamp }));
  const output: ChartCandle[] = [];
  let previousKey = '';
  for (const candle of sorted) {
    const key = bucketKey(candle.timestamp, minutes);
    const current = output.at(-1);
    if (!current || key !== previousKey) {
      output.push({ ...candle, endTimestamp: candle.timestamp });
      previousKey = key;
    } else {
      current.high = Math.max(current.high, candle.high);
      current.low = Math.min(current.low, candle.low);
      current.close = candle.close;
      current.volume += candle.volume;
      current.endTimestamp = candle.timestamp;
    }
  }
  return output;
}

export function chartWindow(candles: ChartCandle[], selectedTime: string | null, count = 90) {
  if (candles.length <= count) return candles;
  const selectedIndex = selectedTime === null ? -1 : candles.findIndex(candle =>
    selectedTime >= candle.timestamp && selectedTime <= candle.endTimestamp);
  if (selectedIndex < 0 || selectedIndex >= candles.length - count) return candles.slice(-count);
  const start = Math.max(0, Math.min(selectedIndex - Math.floor(count / 2), candles.length - count));
  return candles.slice(start, start + count);
}
