'use client';

import { useEffect, useRef, useState } from 'react';
import { CandlestickSeries, ColorType, createChart, createSeriesMarkers, HistogramSeries,
  type IChartApi, type ISeriesApi, type ISeriesMarkersPluginApi, type SeriesMarker, type Time, type UTCTimestamp } from 'lightweight-charts';
import { intervalDescription, type ChartCandle, type ChartRange, type DisplayInterval } from '@/lib/laurie/chart';
import type { LaurieRun } from '@/lib/laurie/types';

type Props = { candles: ChartCandle[]; runs: LaurieRun[]; selectedId: string | null; interval: DisplayInterval;
  range: ChartRange; symbol: string; hasMore: boolean; loadingMore: boolean;
  onSelect: (id: string) => void; onNeedOlder: () => void };
const timeOf = (iso: string) => Math.floor(Date.parse(iso) / 1000) as UTCTimestamp;
const easternTime = (time: Time, intraday: boolean) => new Intl.DateTimeFormat('en-US', intraday ?
  { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' } :
  { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: '2-digit' })
  .format(new Date(Number(time) * 1000));
const easternTick = (time: Time, intraday: boolean) => new Intl.DateTimeFormat('en-US', intraday ?
  { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' } :
  { timeZone: 'America/New_York', month: 'short', day: 'numeric' })
  .format(new Date(Number(time) * 1000));

export default function LaurieChart({ candles, runs, selectedId, interval, range, symbol, hasMore, loadingMore, onSelect, onNeedOlder }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const price = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volume = useRef<ISeriesApi<'Histogram'> | null>(null);
  const markers = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const priorFirst = useRef<string | null>(null);
  const onOlderRef = useRef(onNeedOlder);
  const moreRef = useRef(hasMore);
  const loadingRef = useRef(loadingMore);
  const onSelectRef = useRef(onSelect);
  const runByTime = useRef(new Map<number, string>());
  const [focus, setFocus] = useState<ChartCandle | null>(null);
  onOlderRef.current = onNeedOlder;
  moreRef.current = hasMore;
  loadingRef.current = loadingMore;
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!container.current) return;
    const instance = createChart(container.current, {
      width: container.current.clientWidth, height: 405,
      layout: { background: { type: ColorType.Solid, color: '#fffefd' }, textColor: '#9eaa9f', fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: '#eceee8', style: 3 } },
      timeScale: { borderVisible: false, timeVisible: interval.endsWith('m') || interval.endsWith('h'), secondsVisible: false,
        rightOffset: 4, barSpacing: 7, shiftVisibleRangeOnNewBar: true,
        tickMarkFormatter: (time: Time) => easternTick(time, interval.endsWith('m') || interval.endsWith('h')) },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.04, bottom: 0.26 } },
      crosshair: { vertLine: { color: '#b9c6b9', style: 3 }, horzLine: { color: '#b9c6b9', style: 3 } },
      localization: { priceFormatter: (value: number) => value.toFixed(2), timeFormatter: (time: Time) => easternTime(time, interval.endsWith('m') || interval.endsWith('h')) },
    });
    chart.current = instance;
    price.current = instance.addSeries(CandlestickSeries, { upColor: '#5a8775', downColor: '#b8796d',
      borderUpColor: '#5a8775', borderDownColor: '#b8796d', wickUpColor: '#5a8775', wickDownColor: '#b8796d' });
    volume.current = instance.addSeries(HistogramSeries, { priceScaleId: 'volume', priceFormat: { type: 'volume' },
      lastValueVisible: false, priceLineVisible: false });
    volume.current.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false });
    markers.current = createSeriesMarkers(price.current);
    const resize = new ResizeObserver(() => { if (container.current) instance.applyOptions({ width: container.current.clientWidth }); });
    resize.observe(container.current);
    instance.timeScale().subscribeVisibleLogicalRangeChange(visible => {
      if (visible && visible.from < 35 && moreRef.current && !loadingRef.current) onOlderRef.current();
    });
    instance.subscribeCrosshairMove(param => {
      if (!param.time) { setFocus(null); return; }
      const timestamp = typeof param.time === 'number' ? param.time : null;
      if (timestamp === null) return;
      const bar = price.current && param.seriesData.get(price.current);
      if (!bar || !('open' in bar)) { setFocus(null); return; }
      setFocus({ timestamp: new Date(timestamp * 1000).toISOString(), open: bar.open, high: bar.high,
        low: bar.low, close: bar.close, volume: 0, endTimestamp: new Date(timestamp * 1000).toISOString() });
    });
    instance.subscribeClick(param => {
      if (typeof param.time === 'number') {
        const run = runByTime.current.get(param.time);
        if (run) onSelectRef.current(run);
      }
    });
    priorFirst.current = null;
    return () => { resize.disconnect(); instance.remove(); chart.current = null; price.current = null; volume.current = null; markers.current = null; };
  }, [symbol, interval, range]);

  useEffect(() => {
    if (!chart.current || !price.current || !volume.current || candles.length === 0) return;
    const previous = chart.current.timeScale().getVisibleLogicalRange();
    const added = priorFirst.current ? candles.findIndex(candle => candle.timestamp === priorFirst.current) : -1;
    price.current.setData(candles.map(candle => ({ time: timeOf(candle.timestamp), open: candle.open, high: candle.high,
      low: candle.low, close: candle.close })));
    volume.current.setData(candles.map(candle => ({ time: timeOf(candle.timestamp), value: candle.volume,
      color: candle.close >= candle.open ? '#b5cfba' : '#ddc4bb' })));
    const placed: SeriesMarker<Time>[] = [];
    const byTime = new Map<number, string>();
    for (const run of runs) {
      const candle = candles.find(item => run.candleTime >= (item.startTimestamp ?? item.timestamp) && run.candleTime <= item.endTimestamp);
      if (!candle) continue;
      const time = timeOf(candle.timestamp);
      placed.push({ time, position: 'aboveBar', shape: 'circle', color: run.decision === 'BUY' ? '#5a8775' : run.decision === 'SELL' ? '#b8796d' : '#d7b982',
        text: run.id === selectedId ? `● ${run.decision}` : run.decision[0], size: run.id === selectedId ? 2 : 1 });
      byTime.set(time, run.id);
    }
    runByTime.current = byTime;
    markers.current?.setMarkers(placed.sort((a, b) => Number(a.time) - Number(b.time)));
    if (previous && added > 0) chart.current.timeScale().setVisibleLogicalRange({ from: previous.from + added, to: previous.to + added });
    else if (!priorFirst.current) chart.current.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - 120), to: candles.length + 4 });
    priorFirst.current = candles[0].timestamp;
  }, [candles, runs, selectedId]);

  return <div className="mt-5">
    <div className="flex min-h-5 items-center justify-between gap-3 text-[10px] text-[#9ba69c] max-sm:block">
      <span><i className="mr-1 inline-block size-2 rounded-[2px] bg-[#71937d]" /> {intervalDescription[interval]} OHLC <span className="px-2 text-[#c1c8bf]">/</span> Volume</span>
      {focus && <span className="font-mono tabular-nums max-sm:mt-2 max-sm:block max-sm:text-[9px]">O ${focus.open.toFixed(2)} &nbsp; H ${focus.high.toFixed(2)} &nbsp; L ${focus.low.toFixed(2)} &nbsp; C ${focus.close.toFixed(2)}</span>}
    </div>
    <div ref={container} role="img" aria-label={`${symbol} ${intervalDescription[interval]} candlestick chart with volume and agent decision markers`}
      data-candle-count={candles.length} className="w-full" />
    <div className="mx-3 flex justify-between text-[9px] text-[#adb6ac]"><span>Price · USD</span><span>{loadingMore ? 'Loading earlier candles…' : hasMore ? 'Scroll left for earlier candles' : 'All available candles loaded'}</span><span>All times Eastern</span></div>
  </div>;
}
