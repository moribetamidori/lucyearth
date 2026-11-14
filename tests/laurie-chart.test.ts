import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateCandles, chartCandles, chartWindow, defaultInterval, intervalOptions, isChartSelection } from '../lib/laurie/chart';
import type { Candle } from '../lib/laurie/types';

const candle = (minute: number, open: number, high: number, low: number, close: number, volume: number): Candle => ({
  timestamp: new Date(Date.parse('2026-09-24T13:30:00.000Z') + minute * 60_000).toISOString(),
  open, high, low, close, volume,
});

test('1-minute candles remain intact and ordered', () => {
  const first = candle(0, 100, 101, 99, 100.5, 10);
  const second = candle(1, 100.5, 102, 100, 101, 15);
  const result = aggregateCandles([second, first], 1);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(item => item.timestamp), [first.timestamp, second.timestamp]);
  assert.equal(result[0].endTimestamp, first.timestamp);
});

test('5-minute candles aggregate OHLCV and keep session-aligned boundaries', () => {
  const input = [
    candle(0, 100, 101, 99, 100.5, 10),
    candle(1, 100.5, 102, 100, 101, 15),
    candle(4, 101, 101.5, 98, 99, 20),
    candle(5, 99, 100, 97, 98, 25),
  ];
  const result = aggregateCandles(input, 5);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0], { ...input[0], high: 102, low: 98, close: 99, volume: 45, endTimestamp: input[2].timestamp });
  assert.equal(result[1].timestamp, input[3].timestamp);
});

test('30-minute and hourly buckets begin at 09:30 Eastern and do not cross days', () => {
  const input = [candle(0, 100, 101, 99, 100, 10), candle(29, 100, 102, 99, 101, 10),
    candle(30, 101, 103, 100, 102, 10), candle(59, 102, 104, 101, 103, 10),
    candle(60, 103, 105, 102, 104, 10),
    { ...candle(0, 200, 201, 199, 200, 10), timestamp: '2026-09-25T13:30:00.000Z' }];
  assert.equal(aggregateCandles(input, 30).length, 4);
  const hourly = aggregateCandles(input, 60);
  assert.equal(hourly.length, 3);
  assert.equal(hourly[0].volume, 40);
  assert.equal(hourly[0].close, 103);
  assert.equal(hourly[0].endTimestamp, input[3].timestamp);
});

test('selecting a journal entry keeps its candle in the chart window', () => {
  const bars = aggregateCandles(Array.from({ length: 120 }, (_, i) => candle(i, 100, 101, 99, 100, 10)), 1);
  const window = chartWindow(bars, bars[10].timestamp, 30);
  assert.equal(window.length, 30);
  assert.ok(window.some(item => item.timestamp === bars[10].timestamp));
});

test('every chart interval remains selectable at every range for paged history', () => {
  assert.equal(isChartSelection('1D', '1m'), true);
  assert.equal(isChartSelection('3M', '1m'), true);
  assert.equal(isChartSelection('3M', '4h'), true);
  assert.equal(isChartSelection('1W', '15m'), true);
  assert.equal(isChartSelection('3M', '1D'), true);
  assert.equal(isChartSelection('5Y', '1W'), true);
  assert.equal(isChartSelection('MAX', '1h'), true);
  assert.deepEqual(intervalOptions.MAX, intervalOptions['1D']);
  assert.equal(defaultInterval['3M'], '1D');
});

test('weekly decision markers map to the ending weekly bar', () => {
  const weekly = chartCandles([
    { ...candle(0, 100, 102, 99, 101, 100), timestamp: '2026-09-18T04:00:00.000Z' },
    { ...candle(0, 101, 103, 100, 102, 120), timestamp: '2026-09-25T04:00:00.000Z' },
  ], '1W');
  const runTime = '2026-09-22T17:00:00.000Z';
  assert.equal(runTime >= weekly[0].startTimestamp! && runTime <= weekly[0].endTimestamp, false);
  assert.equal(runTime >= weekly[1].startTimestamp! && runTime <= weekly[1].endTimestamp, true);
});
