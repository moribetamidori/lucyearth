'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { chartCandles, chartRanges, defaultInterval, intervalOptions, type ChartRange, type DisplayInterval } from '@/lib/laurie/chart';
import { readChartCache, writeChartCache } from '@/lib/laurie/browser-cache';
import LaurieChart from './LaurieChart';
import LaurieOptions from './LaurieOptions';
import type { LaurieChartSeries, LaurieRun, LaurieSnapshot, StepName, StepState, WatchQuote, WatchSymbol } from '@/lib/laurie/types';

const steps: { id: StepName; label: string; detail: string }[] = [
  { id: 'fetch', label: 'Fetch 1-minute candles', detail: 'Read the latest available series' },
  { id: 'position', label: 'Read sandbox position', detail: 'Cash, buying power and shares' },
  { id: 'analyze', label: 'Analyze', detail: 'One bounded decision' },
  { id: 'risk', label: 'Risk check', detail: 'Independent order rules' },
  { id: 'order', label: 'Paper order or HOLD', detail: 'Sandbox only' },
  { id: 'save', label: 'Save result', detail: 'Add to the journal' },
];
const initialSteps = () => Object.fromEntries(steps.map(step => [step.id, 'pending'])) as Record<StepName, StepState>;
const money = (n: number) => `$${n.toFixed(2)}`;
const clock = (iso: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' }).format(new Date(iso));
const panel = 'rounded-2xl border border-[#e6e9e2] bg-[#fffefd] shadow-[0_17px_45px_#374b3908]';
const kicker = 'text-[9px] font-bold tracking-[.16em] text-[#789481]';
const title = 'mt-2 font-serif text-[21px] font-normal tracking-tight text-[#26342e] max-sm:text-[18px]';
const defaultWatchlist: WatchSymbol[] = [
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', category: 'US_ETF' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', category: 'US_ETF' },
];
const dailyPercent = (quote: WatchQuote) => quote.preClose && quote.preClose > 0 ? (quote.price / quote.preClose - 1) * 100 : null;

function WatchlistRow({ item, quote, selected, unavailable, onSelect, onRemove }: {
  item: WatchSymbol; quote?: WatchQuote; selected: boolean; unavailable: boolean;
  onSelect: () => void; onRemove: () => void;
}) {
  const percent = quote ? dailyPercent(quote) : null;
  const pinned = defaultWatchlist.some(defaultItem => defaultItem.symbol === item.symbol);
  return <div className={`flex min-w-0 items-center rounded-xl border ${selected ? 'border-[#a9c3ad] bg-[#f1f7ef]' : 'border-[#e8ede5] bg-[#fbfcf9]'}`}>
    <button type="button" aria-label={`Show ${item.symbol} chart`} aria-pressed={selected} onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3 py-3 text-left hover:bg-[#f1f7ef]">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#e7f1e7] font-serif text-lg text-[#51735f]">{item.symbol[0]}</span>
      <span className="min-w-0 flex-1"><strong className="block text-[11px]">{item.symbol} <span className="ml-1 text-[9px] font-normal text-[#9eaa9f]">{item.category === 'US_ETF' ? 'ETF' : 'Stock'}</span></strong><span className="mt-1 block truncate text-[9px] text-[#8c998d]">{item.name}</span></span>
      <span className="shrink-0 text-right">{quote ? <><strong className="block text-[11px] tabular-nums">{money(quote.price)}</strong><span className={`mt-1 block text-[9px] font-semibold ${percent === null ? 'text-[#a2ada3]' : percent >= 0 ? 'text-[#508466]' : 'text-[#b8796d]'}`}>{percent === null ? 'Daily —' : `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`}</span><span className="mt-0.5 block text-[8px] text-[#a2ada3]">{clock(quote.asOf)}</span></> : <span className="text-[9px] text-[#a2ada3]">{unavailable ? 'Quote unavailable' : 'Loading…'}</span>}</span>
    </button>
    {!pinned && <button type="button" aria-label={`Remove ${item.symbol} from watchlist`} onClick={onRemove} className="mr-2 rounded-md px-1.5 py-1 text-lg leading-none text-[#a5aea5] hover:bg-[#eef3ec] hover:text-[#536e57]">×</button>}
  </div>;
}

export default function Laurie({ initial }: { initial: LaurieSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [demoRuns, setDemoRuns] = useState<LaurieRun[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [stepStates, setStepStates] = useState(initialSteps);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<ChartRange>('1D');
  const [interval, setInterval] = useState<DisplayInterval>('1m');
  const [series, setSeries] = useState<LaurieChartSeries>({ symbol: initial.symbol, candles: initial.candles.slice(-390),
    dataSource: 'sample', sourceLabel: 'Recorded sample chart data · not live', accessNote: null });
  const [loadingMore, setLoadingMore] = useState(false);
  const [shownKey, setShownKey] = useState('');
  const loadedKey = useRef('');
  const [chartError, setChartError] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<WatchSymbol[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState(initial.symbol);
  const [watchReady, setWatchReady] = useState(false);
  const [watchQuery, setWatchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<WatchSymbol[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [watchQuotes, setWatchQuotes] = useState<Record<string, WatchQuote>>({});
  const [watchLoaded, setWatchLoaded] = useState(false);
  const [watchError, setWatchError] = useState<string | null>(null);
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem('laurie-watchlist-v1') ?? '[]');
      if (Array.isArray(saved)) setWatchlist([...defaultWatchlist, ...saved.filter((item): item is WatchSymbol => item && typeof item === 'object' &&
        typeof item.symbol === 'string' && /^[A-Z][A-Z0-9.]{0,9}$/.test(item.symbol) && typeof item.name === 'string' &&
        (item.category === 'US_STOCK' || item.category === 'US_ETF') && !defaultWatchlist.some(defaultItem => defaultItem.symbol === item.symbol)).slice(0, 18)]);
      else setWatchlist(defaultWatchlist);
    } catch { setWatchlist(defaultWatchlist); }
    setWatchReady(true);
  }, []);
  useEffect(() => { if (watchReady) localStorage.setItem('laurie-watchlist-v1', JSON.stringify(watchlist)); }, [watchlist, watchReady]);
  useEffect(() => {
    const query = watchQuery.trim();
    if (!query) { setSuggestions([]); setSearchError(null); setSearching(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true); setSearchError(null);
      fetch(`/laurie/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'Search failed.'); return data.results as WatchSymbol[]; })
        .then(setSuggestions)
        .catch(error => { if (!controller.signal.aborted) { setSuggestions([]); setSearchError(error instanceof Error ? error.message : 'Search failed.'); } })
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [watchQuery]);
  useEffect(() => {
    if (!watchReady || watchlist.length === 0) { setWatchQuotes({}); setWatchError(null); setWatchLoaded(false); return; }
    setWatchLoaded(false);
    let active = true;
    async function refresh() {
      try {
        const response = await fetch('/laurie/api/watchlist', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols: watchlist }), cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Webull quotes are unavailable.');
        if (active) { setWatchQuotes(Object.fromEntries((data.quotes as WatchQuote[]).map(quote => [quote.symbol, quote]))); setWatchError(null); setWatchLoaded(true); }
      } catch (error) { if (active) { setWatchError(error instanceof Error ? error.message : 'Webull quotes are unavailable.'); setWatchLoaded(true); } }
    }
    void refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [watchlist, watchReady]);
  function addToWatchlist(item: WatchSymbol) {
    setWatchlist(previous => previous.some(saved => saved.symbol === item.symbol) || previous.length >= 20 ? previous : [...previous, item]);
    setWatchQuery(''); setSuggestions([]);
  }
  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem('laurie-demo-runs-v1') ?? '[]'); if (Array.isArray(saved)) setDemoRuns(saved.slice(0, 30)); } catch { /* Empty journal is safe. */ }
    fetch('/laurie/api', { cache: 'no-store' }).then(async res => { if (!res.ok) throw new Error('Could not load sandbox data.'); setSnapshot(await res.json()); })
      .catch(() => setSnapshot({ ...initial, accessNote: 'Sandbox data could not be loaded. Demo Mode remains available.' }))
      .finally(() => setLoading(false));
  }, [initial]);
  const selectedCategory = watchlist.find(item => item.symbol === selectedSymbol)?.category ??
    defaultWatchlist.find(item => item.symbol === selectedSymbol)?.category ?? 'US_ETF';
  const chartKey = `${selectedCategory}:${selectedSymbol}:${range}:${interval}`;
  useEffect(() => {
    const controller = new AbortController();
    setChartError(null);
    const query = new URLSearchParams({ range, interval, symbol: selectedSymbol, category: selectedCategory });
    async function refresh() {
      if (document.visibilityState !== 'visible') return;
      try {
        const response = await fetch(`/laurie/api?${query}`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Could not load this chart range.');
        const fresh = await response.json() as LaurieChartSeries;
        if (controller.signal.aborted) return;
        const sameSeries = loadedKey.current === chartKey;
        const upstreamFailed = sameSeries && fresh.dataSource === 'sample' && fresh.accessNote?.startsWith('Webull history unavailable');
        setSeries(previous => upstreamFailed && previous.dataSource === 'webull_sandbox' ? previous :
          sameSeries && previous.dataSource === 'webull_sandbox' && fresh.dataSource === 'webull_sandbox' ?
          { ...fresh, hasMore: previous.candles.length > fresh.candles.length ? previous.hasMore : fresh.hasMore,
            candles: [...new Map([...previous.candles, ...fresh.candles].map(bar => [bar.timestamp, bar])).values()]
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp)) } : fresh);
        loadedKey.current = chartKey;
        setShownKey(chartKey); setChartError(upstreamFailed ? fresh.accessNote : null);
      } catch (error) {
        if (!controller.signal.aborted) setChartError(error instanceof Error ? error.message : 'Chart data unavailable.');
      }
    }
    void readChartCache(chartKey).then(saved => {
      if (controller.signal.aborted) return;
      if (saved) { setSeries(saved); loadedKey.current = chartKey; setShownKey(chartKey); }
      void refresh();
    });
    const timer = window.setInterval(refresh, 60_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [chartKey, range, interval, selectedSymbol, selectedCategory]);
  const chartMatchesTicker = selectedSymbol === series.symbol && shownKey === chartKey;
  useEffect(() => { if (chartMatchesTicker) void writeChartCache(chartKey, series); }, [chartMatchesTicker, chartKey, series]);
  const agentTickerSelected = selectedSymbol === snapshot.symbol;
  const runs = snapshot.mode === 'demo' ? [...new Map([...demoRuns, ...snapshot.runs].filter(run => run.symbol === selectedSymbol).map(run => [run.id, run])).values()]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt)) : snapshot.runs.filter(run => run.symbol === selectedSymbol);
  const selected = useMemo(() => runs.find(run => run.id === selectedId) ?? runs[0] ?? null, [runs, selectedId]);
  const bars = useMemo(() => chartCandles(series.candles, interval), [series.candles, interval]);
  async function loadOlder() {
    if (!chartMatchesTicker || loadingMore || !series.hasMore || !series.candles.length || series.dataSource !== 'webull_sandbox') return;
    setLoadingMore(true);
    try {
      const query = new URLSearchParams({ range, interval, symbol: selectedSymbol, category: selectedCategory, before: series.candles[0].timestamp });
      const response = await fetch(`/laurie/api?${query}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load earlier candles.');
      const older = await response.json() as LaurieChartSeries;
      if (loadedKey.current !== chartKey) return;
      const merged = { ...series, hasMore: older.hasMore && older.candles.length > 0,
        candles: [...new Map([...older.candles, ...series.candles].map(bar => [bar.timestamp, bar])).values()]
          .sort((a, b) => a.timestamp.localeCompare(b.timestamp)) };
      setSeries(merged);
    } catch (error) { setChartError(error instanceof Error ? error.message : 'Earlier candles unavailable.'); }
    finally { setLoadingMore(false); }
  }
  function chooseRange(next: ChartRange) {
    setRange(next);
    setInterval(current => intervalOptions[next].includes(current) ? current : defaultInterval[next]);
  }
  async function runAgent() {
    if (running || !agentTickerSelected) return;
    setRunning(true); setError(null); setStepStates(initialSteps());
    try {
      const response = await fetch('/laurie/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!response.ok || !response.body) throw new Error('The run could not be started.');
      const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '', gotResult = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line) continue;
          const event = JSON.parse(line);
          if (event.type === 'step') setStepStates(previous => ({ ...previous, [event.step]: event.state }));
          if (event.type === 'error') throw new Error(event.message);
          if (event.type === 'result') {
            gotResult = true;
            const run = event.run as LaurieRun;
            setSelectedId(run.id);
            if (run.mode === 'demo') {
              setSnapshot(previous => {
                if (previous.mode === 'demo' && previous.dataSource === run.dataSource) return previous;
                return run.dataSource === 'sample' ? { ...initial, accessNote: 'The run used recorded sample data. Refresh to retry Webull history.' } : previous;
              });
              setDemoRuns(previous => { const next = [run, ...previous].slice(0, 30); localStorage.setItem('laurie-demo-runs-v1', JSON.stringify(next)); return next; });
            } else setSnapshot(previous => ({ ...previous, runs: [run, ...previous.runs] }));
          }
        }
      }
      if (!gotResult) throw new Error('The run ended without a result. Check the journal before retrying.');
      try {
        const refreshed = await fetch('/laurie/api', { cache: 'no-store' });
        if (refreshed.ok) setSnapshot(await refreshed.json());
      } catch { /* The saved result remains visible if refreshing the market data fails. */ }
    } catch (err) { setError(err instanceof Error ? err.message : 'The run failed.'); }
    finally { setRunning(false); }
  }
  const decisionTone = (decision: LaurieRun['decision']) => decision === 'BUY' ? 'bg-[#e7f1e9] text-[#4e8565]' : decision === 'SELL' ? 'bg-[#f6e9e6] text-[#aa665d]' : decision === 'ERROR' ? 'bg-[#fbf0ed] text-[#a55f53]' : 'bg-[#f7f0df] text-[#9c7a38]';
  return <main className="relative min-h-screen overflow-hidden bg-[#f6f7f2] font-sans font-normal tracking-normal text-[#26342e]">
    <div className="pointer-events-none absolute -top-80 -right-44 size-[760px] rounded-full bg-[radial-gradient(circle,#dfece4aa,transparent_68%)]" />
    <div className="pointer-events-none absolute -bottom-96 -left-64 size-[630px] rounded-full bg-[radial-gradient(circle,#f0e9d6a6,transparent_70%)]" />
    <div className="relative mx-auto max-w-[1510px] px-[50px] max-lg:px-6 max-sm:px-4">
      <header className="flex h-[88px] items-center border-b border-[#e5e8df] max-sm:h-[76px]">
        <div className="flex items-center gap-3"><Image src="/laurie.webp" alt="" width={44} height={44} className="size-11 rounded-xl object-cover" priority /><strong className="font-serif text-[27px] leading-6 font-normal tracking-[-.06em]">laurie</strong></div><span className="ml-auto rounded-full border border-[#b4cdb7] bg-[#e9f3e9] px-3 py-1.5 text-[10px] font-extrabold tracking-[.14em] text-[#3d7554]">SANDBOX</span>
      </header>
      <div className="mt-[18px] grid grid-cols-[minmax(0,1fr)_336px] gap-[18px] max-lg:grid-cols-[minmax(0,1fr)_310px] max-md:grid-cols-1 max-sm:mt-3 max-sm:gap-3">
      <section className={`${panel} col-start-2 row-start-1 min-w-0 p-6 max-md:col-start-1 max-md:row-start-2 max-sm:p-[18px]`} aria-label="Watchlist">
        <div className="relative max-w-[560px]">
          <label htmlFor="laurie-watch-search" className="sr-only">Search stocks or ETFs</label>
          <input id="laurie-watch-search" value={watchQuery} onChange={event => setWatchQuery(event.target.value)} autoComplete="off" placeholder="Search a company or ticker, e.g. Apple or AAPL" className="h-11 w-full rounded-xl border border-[#dce5db] bg-[#fbfcf9] px-4 text-xs outline-none placeholder:text-[#a6b1a5] focus:border-[#7ca087] focus:ring-2 focus:ring-[#dcebe0]" />
          {watchQuery.trim() && <div className="absolute z-20 mt-1 max-h-[310px] w-full overflow-y-auto rounded-xl border border-[#dce5db] bg-white p-1.5 shadow-[0_18px_45px_#26342e1c]" aria-label="Ticker suggestions">
            {searching && <p className="px-3 py-3 text-xs text-[#8c998d]" role="status">Searching Webull…</p>}
            {!searching && searchError && <p className="px-3 py-3 text-xs text-[#a55f53]" role="alert">{searchError}</p>}
            {!searching && !searchError && suggestions.length === 0 && <p className="px-3 py-3 text-xs text-[#8c998d]">No matching US stocks or ETFs.</p>}
            {!searching && suggestions.map(item => { const saved = watchlist.some(entry => entry.symbol === item.symbol); return <button key={item.symbol} type="button" disabled={saved || watchlist.length >= 20} onClick={() => addToWatchlist(item)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-[#f2f7f0] disabled:cursor-default disabled:opacity-60"><strong className="w-16 shrink-0 text-xs text-[#355b47]">{item.symbol}</strong><span className="min-w-0 flex-1 truncate text-[11px] text-[#657369]">{item.name}</span><span className="text-[10px] text-[#8da38f]">{saved ? 'Added' : 'Add +'}</span></button>; })}
          </div>}
        </div>
        <div className="mt-5 max-h-[390px] space-y-2 overflow-y-auto pr-0.5" aria-live="polite">{watchlist.map(item => <WatchlistRow key={item.symbol} item={item} quote={watchQuotes[item.symbol]} selected={selectedSymbol === item.symbol} unavailable={watchLoaded && !watchQuotes[item.symbol]} onSelect={() => { setSelectedSymbol(item.symbol); setSelectedId(null); }} onRemove={() => { setWatchlist(previous => previous.filter(saved => saved.symbol !== item.symbol)); if (selectedSymbol === item.symbol) setSelectedSymbol(snapshot.symbol); }} />)}</div>
        {watchError && watchlist.length > 0 && <p className="mt-3 text-[10px] text-[#a55f53]" role="status">{watchError}</p>}
      </section>
        <section className={`${panel} col-start-1 row-start-1 min-w-0 p-6 max-sm:p-[18px]`} aria-label={`${selectedSymbol} chart`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="group" aria-label="Chart time range" className="flex flex-wrap items-center gap-1 rounded-full bg-[#f1f4ee] p-1">{chartRanges.map(item => <button key={item} type="button" aria-pressed={range === item} onClick={() => chooseRange(item)} className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${range === item ? 'bg-white text-[#355b47] shadow-sm' : 'text-[#8a978b] hover:text-[#355b47]'}`}>{item}</button>)}</div>
            <label className="flex items-center gap-2 text-[10px] font-semibold text-[#839184]">Candle <select aria-label="Candle interval" value={interval} onChange={event => setInterval(event.target.value as DisplayInterval)} className="rounded-lg border border-[#e1e8df] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#355b47] outline-none focus:border-[#7ca087]">{intervalOptions[range].map(item => <option key={item} value={item}>{item}</option>)}</select></label>
          </div>
          {chartMatchesTicker ? <LaurieChart candles={bars} runs={runs} selectedId={selected?.id ?? null} interval={interval} range={range} symbol={selectedSymbol} hasMore={Boolean(series.hasMore)} loadingMore={loadingMore} onSelect={setSelectedId} onNeedOlder={loadOlder} /> :
            <div className="grid h-[340px] place-items-center text-xs text-[#8b998d]" role={chartError ? 'alert' : 'status'}>{chartError ?? `Loading ${selectedSymbol} ${range} chart…`}</div>}
          <div className="mt-6 flex items-start gap-2 border-t border-[#f0f1eb] pt-4 text-[10px] leading-4 text-[#849187] max-sm:mt-3"><i className="mt-1 size-1.5 shrink-0 rounded-full bg-[#648f71]" /><p>{chartMatchesTicker ? series.sourceLabel : `Loading ${selectedSymbol} history`}. Refreshes each minute while open.{chartMatchesTicker && series.accessNote && <span className="ml-1">{series.accessNote}</span>}{chartMatchesTicker && chartError && <span className="ml-1 text-[#a55f53]">{chartError}</span>}</p></div>
        </section>
        <aside className={`${panel} col-span-2 row-start-2 grid grid-cols-[minmax(0,360px)_minmax(0,1fr)] gap-x-10 p-6 max-md:col-span-1 max-md:row-start-3 max-md:grid-cols-2 max-md:gap-x-6 max-sm:block max-sm:p-[18px]`}><div className="flex items-start justify-between gap-4 max-md:col-start-1"><div><span className={kicker}>THE AGENT</span><h3 className={title}>One considered move</h3></div><span className="grid size-[30px] place-items-center rounded-lg border border-[#e0e9df] bg-[#f4f7f1] text-xl text-[#749883]">✧</span></div><p className="my-[18px] text-[11px] leading-5 text-[#8c998d] max-md:col-start-1">{agentTickerSelected ? 'Each click runs one bounded evaluation. A HOLD is a complete result.' : 'Agent runs are configured for ' + snapshot.symbol + '. Select that ticker to run.'}</p><button className="flex h-12 w-full items-center justify-between rounded-[10px] bg-[#355b47] px-4 text-xs font-bold text-white shadow-[0_7px_14px_#355b4726] transition hover:-translate-y-px hover:bg-[#294d39] disabled:cursor-wait disabled:opacity-70 motion-reduce:transition-none max-md:col-start-1" onClick={runAgent} disabled={running || !agentTickerSelected} aria-busy={running}><span>{running ? 'Running agent…' : agentTickerSelected ? 'Run Agent' : `Select ${snapshot.symbol} to run`}</span><span aria-hidden="true" className="text-lg font-normal">↗</span></button><div className="col-start-2 row-start-1 row-span-5 mt-0 max-sm:mt-5" aria-live="polite">{steps.map((step, i) => <div className="relative flex min-h-[47px] items-center gap-2.5 before:absolute before:top-[37px] before:left-3 before:h-[21px] before:border-l before:border-[#e8ece7] last:before:hidden" key={step.id}><span className={`z-10 grid size-[25px] shrink-0 place-items-center rounded-full border text-[9px] ${stepStates[step.id] === 'complete' ? 'border-[#70987c] bg-[#70987c] text-xs text-white' : stepStates[step.id] === 'active' ? 'border-[#99b49d] bg-[#edf5ec] text-[#4e7c5b]' : stepStates[step.id] === 'error' ? 'border-[#d4a198] bg-[#fbf0ed] text-[#a55f53]' : 'border-[#e4e9e2] bg-white text-[#a3ada2]'}`}>{stepStates[step.id] === 'complete' ? '✓' : String(i + 1).padStart(2, '0')}</span><div className="flex-1"><strong className="block text-[10px] font-semibold">{step.label}</strong><small className="mt-0.5 block text-[9px] text-[#a5aea5]">{step.detail}</small></div><span className="text-[9px] text-[#81a18a]">{stepStates[step.id] === 'active' ? 'working' : stepStates[step.id] === 'complete' ? 'done' : stepStates[step.id] === 'error' ? 'demo fallback' : ''}</span></div>)}</div>{error && <div className="mt-3 rounded-lg bg-[#fbf0ed] p-2.5 text-[11px] leading-5 text-[#a55f53] max-md:col-start-1" role="alert">{error}</div>}<div className="mt-3 flex justify-between border-t border-[#edf0e9] pt-4 max-md:col-start-1"><span className="text-[8px] tracking-widest text-[#a8b2a7]">MODEL CALLS <strong className="mt-1 block text-[10px] tracking-normal text-[#677d69]">{snapshot.mode === 'demo' ? '0 / run' : '≤ 1 / run'}</strong></span><span className="text-[8px] tracking-widest text-[#a8b2a7]">ORDER VENUE <strong className="mt-1 block text-[10px] tracking-normal text-[#677d69]">{snapshot.mode === 'demo' ? 'none' : 'paper only'}</strong></span></div></aside>
      </div>
      <div className="mt-[18px]"><LaurieOptions symbol={selectedSymbol} category={selectedCategory} sample={!chartMatchesTicker || series.dataSource !== 'webull_sandbox' || Boolean(chartError)} /></div>
      <div className="mt-[18px] mb-10 grid grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)] gap-[18px] max-md:grid-cols-1 max-sm:mt-3 max-sm:gap-3">
        <section className={`${panel} p-6 max-sm:p-[18px]`}><div className="flex items-start justify-between gap-4"><div><span className={kicker}>LATEST DECISION</span><h3 className={title}>{selected ? 'A result, with its reasoning' : 'Awaiting the first run'}</h3></div>{selected && <span className="whitespace-nowrap text-[10px] text-[#a4aea4]">{clock(selected.completedAt)}</span>}</div>{selected ? <><div className="flex items-center gap-5 border-b border-[#edf0ea] py-5"><span className={`min-w-[84px] rounded-lg px-3 py-2.5 text-center text-[13px] font-bold tracking-widest ${decisionTone(selected.decision)}`}>{selected.decision}</span><p className="max-w-[480px] text-xs leading-5 text-[#66746a]">{selected.explanation}</p></div><div className="grid grid-cols-2 gap-x-7 gap-y-5 pt-5 max-sm:gap-x-4">{[['DATA USED', selected.inputSummary], ['RISK CHECK', selected.risk], ['ORDER STATUS', selected.orderStatus], ['MODEL & COST', `${selected.model} · ${selected.promptVersion} · est. $${selected.estimatedCostUsd.toFixed(5)}${selected.actualCostUsd !== null ? ` / usage $${selected.actualCostUsd.toFixed(5)}` : ''}`]].map(([label, value]) => <div key={label}><span className="text-[9px] font-bold tracking-widest text-[#a0aca1]">{label}</span><p className="mt-1.5 break-words text-[11px] leading-5 text-[#596b5c]">{value}</p></div>)}</div></> : <div className="flex min-h-40 items-center gap-3.5 text-xs text-[#a4ada3]"><span className="text-[32px] text-[#abc2ae]">✧</span><p>Press Run Agent to see the first decision take shape.</p></div>}</section>
        <section className={`${panel} p-6 max-sm:p-[18px]`}><div className="flex items-start justify-between gap-4"><div><span className={kicker}>DECISION JOURNAL</span><h3 className={title}>Every run, in order</h3></div><span className="text-[9px] font-bold tracking-widest text-[#9aaa9c]">{runs.length} RUNS</span></div><div className="mt-4 max-h-[255px] overflow-auto">{runs.length === 0 && <div className="py-8 text-xs text-[#a4ada3]">The journal begins with your first run.</div>}{runs.map(run => <button type="button" key={run.id} className={`flex w-full items-center gap-2.5 border-t border-[#f0f1ec] px-1.5 py-3 text-left hover:bg-[#f8faf5] ${selected?.id === run.id ? 'bg-[#f8faf5]' : 'bg-transparent'}`} onClick={() => setSelectedId(run.id)}><span className={`grid size-[29px] shrink-0 place-items-center rounded-lg text-[10px] font-bold ${decisionTone(run.decision)}`}>{run.decision[0]}</span><span className="min-w-0 flex-1"><strong className="block truncate text-[10px]">{run.decision} <small className="font-normal text-[#9ca79d]">· {run.mode === 'demo' ? 'Demo simulation' : 'Webull sandbox'}</small></strong><span className="mt-1 block truncate text-[9px] text-[#9ca79d]">{run.orderStatus}</span></span><time className="whitespace-nowrap text-[9px] text-[#a3aca3]">{clock(run.completedAt)}</time></button>)}</div><div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-[#dce4d9] bg-[#f8f9f5] p-3.5"><span className="grid size-[29px] place-items-center rounded-lg bg-[#edf2e9] text-base text-[#8da58b]">↗</span><div className="flex-1"><strong className="text-[10px]">Experiment #1</strong><p className="mt-1 text-[9px] text-[#a1aca1]">Recursive self improvement</p></div><span className="text-[8px] font-bold tracking-widest text-[#a2b09e]">COMING LATER</span></div></section>
      </div>
      <footer className="flex justify-between gap-5 border-t border-[#e7e9e2] py-6 text-[8px] font-bold tracking-[.15em] text-[#a4aea3]"><span>LAURIE / PAPER EXPERIMENT</span><span className="max-sm:hidden">{loading ? 'Checking data source…' : 'A human-readable record of every decision.'}</span><span className="text-[#7b9881]">NO PRODUCTION ORDER PATH</span></footer>
    </div>
  </main>;
}
