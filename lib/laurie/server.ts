import 'server-only';
import { randomUUID } from 'node:crypto';
import { tradeDb } from '@/lib/trade/server/db';
import { operator } from '@/lib/trade/server/auth';
import { WebullPaperBroker } from '@/lib/trade/broker/webull_paper';
import { withinCoreHours } from '@/lib/trade/risk/policy';
import { demoChartCandles, demoRun, demoSnapshot, numericSummary } from './demo';
import { chartRangeStart, type ChartRange, type DisplayInterval } from './chart';
import type { Candle, LaurieChartSeries, LaurieRun, LaurieSnapshot, StepName } from './types';

const PROMPT_VERSION = 'laurie-v1';
const MODEL = 'gpt-4.1-mini';
const OUTPUT_CAP = 180;
const SYMBOL = process.env.LAURIE_SYMBOL?.toUpperCase() === 'QQQ' ? 'QQQ' : 'SPY';
const MAX_PAPER_NOTIONAL = 25;
const MAX_POSITION_VALUE = 100;
type Db = ReturnType<typeof tradeDb>;

function configured() {
  return process.env.LAURIE_MODE === 'webull_sandbox' &&
    Boolean(process.env.WEBULL_PAPER_APP_KEY && process.env.WEBULL_PAPER_APP_SECRET &&
      process.env.WEBULL_PAPER_ACCOUNT_ID && process.env.OPENAI_API_KEY &&
      process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.TRADE_ADMIN_EMAIL);
}
async function hasOperator() {
  try { return Boolean(await operator()); } catch { return false; }
}
async function demoDatabase(): Promise<Db | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.TRADE_ADMIN_EMAIL) return null;
  if (!(await hasOperator())) return null;
  return tradeDb();
}
function broker() {
  return new WebullPaperBroker(process.env.WEBULL_PAPER_ACCOUNT_ID ?? '', async () => {}, async () => {});
}
type MarketData = { bars: Candle[]; quote: Awaited<ReturnType<WebullPaperBroker['getQuote']>> };
let marketCache: { symbol: string; expiresAt: number; promise: Promise<MarketData> } | null = null;
async function historicalMarketData(): Promise<MarketData | null> {
  if (process.env.LAURIE_MARKET_DATA === 'sample' || !process.env.WEBULL_PAPER_APP_KEY ||
      !process.env.WEBULL_PAPER_APP_SECRET || (process.env.TRADING_MODE ?? 'paper') !== 'paper') return null;
  if (marketCache?.symbol === SYMBOL && marketCache.expiresAt > Date.now()) return marketCache.promise;
  const api = broker();
  const promise = Promise.all([api.getOneMinuteBars(SYMBOL), api.getQuote(SYMBOL)]).then(([bars, quote]) => {
    if (bars.length < 20) throw new Error('Webull returned too few one-minute bars.');
    return { bars, quote };
  });
  marketCache = { symbol: SYMBOL, expiresAt: Date.now() + 60_000, promise };
  try { return await promise; }
  catch (error) { marketCache = null; throw error; }
}

const chartTimespans: Record<DisplayInterval, 'M1' | 'M5' | 'M15' | 'M30' | 'M60' | 'M240' | 'D' | 'W' | 'M'> = {
  '1m': 'M1', '5m': 'M5', '15m': 'M15', '30m': 'M30', '1h': 'M60', '4h': 'M240', '1D': 'D', '1W': 'W', '1M': 'M',
};
const CHART_PAGE_SIZE = 800;
const chartCache = new Map<string, { expiresAt: number; promise: Promise<Candle[]> }>();

function trimChartRange(bars: Candle[], range: ChartRange) {
  if (!bars.length || range === 'MAX') return bars;
  const latest = new Date(bars.at(-1)!.timestamp);
  if (range === '1D') {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
    const lastDay = day.format(latest);
    return bars.filter(bar => day.format(new Date(bar.timestamp)) === lastDay);
  }
  return bars.filter(bar => Date.parse(bar.timestamp) >= (chartRangeStart(range) ?? -Infinity));
}

async function cachedChartPage(symbol: string, category: 'US_STOCK' | 'US_ETF', interval: DisplayInterval, before?: string) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return [];
  try {
    let query = tradeDb().from('laurie_chart_candles').select('timestamp,open,high,low,close,volume,received_at')
      .eq('symbol', symbol).eq('category', category).eq('interval', interval).order('timestamp', { ascending: false }).limit(CHART_PAGE_SIZE);
    if (before) query = query.lt('timestamp', before);
    const { data, error } = await query;
    if (error) return [];
    return (data ?? []).reverse().map(row => ({ timestamp: row.timestamp, open: Number(row.open), high: Number(row.high),
      low: Number(row.low), close: Number(row.close), volume: Number(row.volume), receivedAt: row.received_at }));
  } catch { return []; }
}

async function saveChartPage(symbol: string, category: 'US_STOCK' | 'US_ETF', interval: DisplayInterval, bars: Candle[]) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || bars.length === 0) return;
  try {
    const db = tradeDb();
    for (let start = 0; start < bars.length; start += 200) {
      const { error } = await db.from('laurie_chart_candles').upsert(bars.slice(start, start + 200).map(bar => ({
        ...bar, symbol, category, interval, received_at: new Date().toISOString(),
      })), { onConflict: 'symbol,category,interval,timestamp' });
      if (error) return;
    }
    await db.rpc('laurie_prune_chart_cache');
  } catch { /* Browser and in-process caches still work before this migration is applied. */ }
}

export async function chartSeries(symbol: string, category: 'US_STOCK' | 'US_ETF', range: ChartRange, interval: DisplayInterval, before?: string): Promise<LaurieChartSeries> {
  const fallback = (note: string | null): LaurieChartSeries => ({ symbol, candles: demoChartCandles(symbol, range, interval),
    dataSource: 'sample', sourceLabel: 'Recorded sample chart data · not live', accessNote: note, hasMore: false });
  if (process.env.LAURIE_MARKET_DATA === 'sample' || !process.env.WEBULL_PAPER_APP_KEY ||
      !process.env.WEBULL_PAPER_APP_SECRET || (process.env.TRADING_MODE ?? 'paper') !== 'paper') {
    if (before) return { symbol, candles: [], dataSource: 'sample', sourceLabel: 'Recorded sample chart data · not live', accessNote: null, hasMore: false };
    return fallback('Webull historical data is not configured.');
  }
  try {
    const key = `${category}:${symbol}:${interval}:${before ?? 'latest'}`;
    const cacheFreshMs = interval === '1D' || interval === '1W' || interval === '1M' ? 15 * 60_000 : 60_000;
    let cached = chartCache.get(key);
    if (!cached || cached.expiresAt < Date.now()) {
      const promise = (async () => {
        const saved = await cachedChartPage(symbol, category, interval, before);
        if (before && saved.length === CHART_PAGE_SIZE) return saved;
        if (!before && saved.length > 0 && Date.now() - Date.parse(saved.at(-1)!.receivedAt) < cacheFreshMs) return saved;
        try {
          const fresh = await broker().getHistoricalBars(symbol, chartTimespans[interval],
            before || interval === '1D' || interval === '1W' || interval === '1M' || saved.length < CHART_PAGE_SIZE ? CHART_PAGE_SIZE : 3,
            category, before);
          await saveChartPage(symbol, category, interval, fresh);
          if (!before && saved.length >= CHART_PAGE_SIZE) return [...new Map([...saved, ...fresh].map(bar => [bar.timestamp, bar])).values()]
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp)).slice(-CHART_PAGE_SIZE);
          return fresh;
        } catch (error) { if (saved.length) return saved; throw error; }
      })();
      cached = { expiresAt: Date.now() + cacheFreshMs, promise };
      if (chartCache.size >= 100) chartCache.delete(chartCache.keys().next().value!);
      chartCache.set(key, cached);
    }
    const raw = await cached.promise;
    const bars = trimChartRange(raw, range);
    if (!before && bars.length < 1) throw new Error('Webull returned no candles for this range.');
    const earliest = bars[0]?.timestamp;
    const start = chartRangeStart(range);
    const hasMore = Boolean(earliest && raw.length >= CHART_PAGE_SIZE && (start === null || Date.parse(earliest) > start));
    return { symbol, candles: bars, dataSource: 'webull_sandbox',
      sourceLabel: `Webull sandbox historical ${interval} candles · delayed, not live · through ${bars.at(-1)?.timestamp ?? before}`,
      accessNote: null, hasMore };
  } catch (error) {
    chartCache.delete(`${category}:${symbol}:${interval}:${before ?? 'latest'}`);
    if (before) throw error;
    return fallback(`Webull history unavailable for ${range} / ${interval}: ${safeMessage(error)}`);
  }
}
async function historicalDemoSnapshot(note: string): Promise<LaurieSnapshot> {
  const demo = demoSnapshot(note, SYMBOL);
  try {
    const market = await historicalMarketData();
    if (market) {
      const ageMinutes = Math.max(0, Math.round((Date.now() - Date.parse(market.bars.at(-1)!.timestamp)) / 60_000));
      Object.assign(demo, { dataSource: 'webull_sandbox', candles: market.bars,
        latestPrice: market.quote.last, dataTimestamp: market.quote.asOf,
        delaySeconds: market.quote.delaySeconds,
        sourceLabel: `Webull sandbox history · latest candle ${ageMinutes} min old · delayed data` });
    }
  } catch (error) { demo.accessNote = `Historical sandbox data unavailable: ${safeMessage(error)} Recorded sample is shown.`; }
  try {
    const db = await demoDatabase();
    if (db) demo.runs = (await recentRuns(db)).filter(run => run.mode === 'demo' && run.symbol === SYMBOL);
  } catch { /* The browser journal remains available until the migration is applied. */ }
  return demo;
}
function check(error: { message: string } | null) { if (error) throw new Error('Laurie database is unavailable. Apply the Laurie migration and retry.'); }
function safeMessage(error: unknown) {
  const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
  return message.replace(/(sk-[A-Za-z0-9_-]+|Bearer\s+\S+)/g, '[redacted]');
}

export async function snapshot(): Promise<LaurieSnapshot> {
  if (!configured() || !(await hasOperator())) {
    return historicalDemoSnapshot(!configured() ? 'Trading setup is incomplete. The agent runs in Demo Mode.' :
      'Sign in as the configured operator at /trade to enable sandbox runs.');
  }
  try {
    const market = await historicalMarketData();
    if (!market) throw new Error('Webull historical market data is not configured.');
    const { bars, quote } = market;
    const [positions, account] = await Promise.all([broker().getPositions(), broker().getAccount()]);
    const db = tradeDb();
    const runs = (await recentRuns(db)).filter(run => run.symbol === SYMBOL);
    const ageMinutes = Math.max(0, Math.round((Date.now() - Date.parse(bars.at(-1)!.timestamp)) / 60_000));
    return {
      symbol: SYMBOL, mode: 'webull_sandbox', dataSource: 'webull_sandbox', sourceLabel: `Webull sandbox · latest candle ${ageMinutes} min old · delayed data`,
      candles: bars, latestPrice: quote.last, dataTimestamp: quote.asOf, delaySeconds: quote.delaySeconds,
      position: { quantity: positions.find(p => p.symbol === SYMBOL)?.quantity ?? 0, cash: account.cash, buyingPower: account.buyingPower },
      runs, accessNote: null,
    };
  } catch (error) {
    return historicalDemoSnapshot(`Trading sandbox unavailable: ${safeMessage(error)} Agent Demo Mode is shown.`);
  }
}

async function saveDemoRun(run: LaurieRun) {
  try {
    const db = await demoDatabase();
    if (!db) return;
    check((await db.from('laurie_agent_runs').insert({ id: run.id, symbol: run.symbol, mode: 'demo', data_source: run.dataSource,
      status: 'completed', started_at: run.startedAt, completed_at: run.completedAt,
      data_timestamp: run.candleTime, model_name: run.model, prompt_version: run.promptVersion,
      input_summary: { display: run.inputSummary }, estimated_cost_usd: 0, actual_cost_usd: 0,
      input_tokens: 0, output_tokens: 0 })).error);
    check((await db.from('laurie_decisions').insert({ run_id: run.id, decision: run.decision,
      explanation: run.explanation, risk_allowed: false,
      risk_result: { allowed: false, message: run.risk }, order_status: run.orderStatus })).error);
  } catch { /* Demo stays usable and is also kept in browser storage. */ }
}

async function runDemo(id: string, emit: (step: StepName, state: 'active' | 'complete' | 'error') => void) {
  let historical: Candle[] | undefined;
  for (const step of ['fetch', 'position', 'analyze', 'risk', 'order', 'save'] as StepName[]) {
    emit(step, 'active');
    if (step === 'fetch') {
      try { historical = (await historicalMarketData())?.bars; } catch { /* Recorded sample remains available. */ }
    }
    await new Promise(resolve => setTimeout(resolve, 180));
    emit(step, 'complete');
  }
  const run = demoRun(id, SYMBOL, historical);
  await saveDemoRun(run);
  return run;
}

async function recentRuns(db: Db): Promise<LaurieRun[]> {
  const { data, error } = await db.from('laurie_agent_runs').select('*, laurie_decisions(*), laurie_order_outcomes(*)')
    .order('started_at', { ascending: false }).limit(30);
  check(error);
  return (data ?? []).map(row => {
    const d = Array.isArray(row.laurie_decisions) ? row.laurie_decisions[0] : row.laurie_decisions;
    const o = Array.isArray(row.laurie_order_outcomes) ? row.laurie_order_outcomes[0] : row.laurie_order_outcomes;
    const s = row.input_summary as { display?: string } | null;
    return {
      id: row.id, startedAt: row.started_at, completedAt: row.completed_at ?? row.started_at,
      symbol: row.symbol, mode: row.mode, dataSource: row.data_source, candleTime: row.data_timestamp ?? row.started_at,
      decision: d?.decision ?? 'ERROR', explanation: d?.explanation ?? (row.error || 'Run did not complete.'), inputSummary: s?.display ?? 'Data unavailable',
      risk: (d?.risk_result as { message?: string })?.message ?? 'No risk result',
      orderStatus: o?.status === 'unknown' ? 'Paper order outcome uncertain · reconcile before retry' :
        o?.status ? `Webull paper order · ${o.status}` : d?.order_status ?? 'No order',
      model: row.model_name, promptVersion: row.prompt_version,
      estimatedCostUsd: Number(row.estimated_cost_usd), actualCostUsd: row.actual_cost_usd === null ? null : Number(row.actual_cost_usd),
      inputTokens: row.input_tokens, outputTokens: row.output_tokens, error: row.error,
    } satisfies LaurieRun;
  });
}

function inputSummary(bars: Candle[], quantity: number, cash: number) {
  const stats = numericSummary(bars);
  return { ...stats, positionQuantity: quantity, cash: +cash.toFixed(2),
    display: `${bars.length} sandbox 1-minute candles · 20-bar change ${stats.change20Pct}% · range $${stats.range20} · mean volume ${stats.avgVolume20.toLocaleString()} · position ${quantity} shares` };
}

async function modelDecision(summary: ReturnType<typeof inputSummary>) {
  const instructions = `You evaluate one ${SYMBOL} paper-trading snapshot. Choose BUY, SELL, or HOLD. HOLD is welcome when evidence is weak. Return one concise explanation grounded only in the numeric input. You have no order tools. Do not infer news or current data beyond the input. ${PROMPT_VERSION}`;
  const input = JSON.stringify(summary);
  const estimatedInputTokens = Math.ceil((instructions.length + input.length) / 4);
  const estimatedCostUsd = (estimatedInputTokens * 0.4 + OUTPUT_CAP * 1.6) / 1_000_000;
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, store: false, max_output_tokens: OUTPUT_CAP, instructions, input,
      text: { format: { type: 'json_schema', name: 'laurie_decision', strict: true,
        schema: { type: 'object', properties: { decision: { type: 'string', enum: ['BUY', 'SELL', 'HOLD'] }, explanation: { type: 'string' } },
          required: ['decision', 'explanation'], additionalProperties: false } } } }),
    signal: AbortSignal.timeout(20_000), cache: 'no-store', redirect: 'error',
  });
  if (!response.ok) throw new Error(`OpenAI returned HTTP ${response.status}; no order was sent.`);
  const raw = await response.json();
  if (raw.status !== 'completed') throw new Error('The model response was incomplete; no order was sent.');
  const output = raw.output?.flatMap((item: { content?: { type: string; text?: string }[] }) => item.content ?? [])
    .filter((part: { type: string }) => part.type === 'output_text').map((part: { text?: string }) => part.text ?? '').join('');
  const parsed = JSON.parse(output ?? '');
  if (!['BUY', 'SELL', 'HOLD'].includes(parsed.decision) || typeof parsed.explanation !== 'string' ||
      !parsed.explanation.trim() || parsed.explanation.length > 500) throw new Error('Invalid model decision; no order was sent.');
  const inputTokens = Number(raw.usage?.input_tokens ?? 0);
  const cachedTokens = Math.min(inputTokens, Number(raw.usage?.input_tokens_details?.cached_tokens ?? 0));
  const outputTokens = Number(raw.usage?.output_tokens ?? 0);
  return { decision: parsed.decision as 'BUY' | 'SELL' | 'HOLD', explanation: parsed.explanation.trim(),
    estimatedCostUsd, actualCostUsd: ((inputTokens - cachedTokens) * 0.4 + cachedTokens * 0.1 + outputTokens * 1.6) / 1_000_000, inputTokens, outputTokens };
}

async function reconcileUnknown(db: Db, api: WebullPaperBroker) {
  const { data, error } = await db.from('laurie_order_outcomes').select('*').eq('account_id', process.env.WEBULL_PAPER_ACCOUNT_ID!)
    .in('status', ['submitting', 'unknown']).limit(10);
  check(error);
  for (const row of data ?? []) {
    let found;
    try { found = await api.getOrder(row.client_order_id); }
    catch { throw new Error(`Paper order ${row.client_order_id} has an uncertain outcome. Reconcile it with Webull before another run.`); }
    check((await db.from('laurie_order_outcomes').update({ status: found.status, broker_order_id: found.id,
      detail: found, reconciled_at: new Date().toISOString(), error: null }).eq('id', row.id)).error);
    if (found.status === 'unknown') throw new Error('A paper order still has an uncertain outcome.');
  }
}

export async function executeRun(id: string, emit: (step: StepName, state: 'active' | 'complete' | 'error') => void): Promise<LaurieRun> {
  const startedAt = new Date().toISOString();
  if (!configured() || !(await hasOperator())) {
    return runDemo(id, emit);
  }
  const db = tradeDb();
  const acquired = await db.rpc('laurie_acquire_run', { p_id: id });
  if (acquired.error) return runDemo(id, emit);
  if (!acquired.data) throw new Error('An agent run is already in progress. Wait for it to finish.');
  let inserted = false;
  try {
    const api = broker();
    await reconcileUnknown(db, api);
    emit('fetch', 'active');
    let bars: Candle[], quote: Awaited<ReturnType<typeof api.getQuote>>;
    try { [bars, quote] = await Promise.all([api.getOneMinuteBars(SYMBOL), api.getQuote(SYMBOL)]); }
    catch { return runDemo(id, emit); }
    if (bars.length < 20) throw new Error('At least 20 one-minute sandbox candles are required.');
    emit('fetch', 'complete');
    emit('position', 'active');
    let positions: Awaited<ReturnType<typeof api.getPositions>>,
      account: Awaited<ReturnType<typeof api.getAccount>>,
      openOrders: Awaited<ReturnType<typeof api.getOrders>>;
    try { [positions, account, openOrders] = await Promise.all([api.getPositions(), api.getAccount(), api.getOrders()]); }
    catch { return runDemo(id, emit); }
    const held = positions.find(p => p.symbol === SYMBOL);
    const summary = inputSummary(bars, held?.quantity ?? 0, account.cash);
    emit('position', 'complete');
    const candleTime = bars.at(-1)!.timestamp;
    check((await db.from('laurie_candles').upsert(bars.map(bar => ({ symbol: SYMBOL, timestamp: bar.timestamp,
      open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume, source: 'webull_sandbox' })),
      { onConflict: 'symbol,timestamp,source' })).error);
    const earlier = await db.from('laurie_agent_runs').select('id').eq('mode', 'webull_sandbox').eq('symbol', SYMBOL).eq('data_timestamp', candleTime)
      .in('status', ['running', 'completed']).limit(1);
    check(earlier.error);
    if (earlier.data?.length) throw new Error('This one-minute candle has already been evaluated. Wait for the next candle.');
    check((await db.from('laurie_agent_runs').insert({ id, symbol: SYMBOL, mode: 'webull_sandbox', data_source: 'webull_sandbox', status: 'running', started_at: startedAt,
      data_timestamp: candleTime, data_delay_seconds: quote.delaySeconds, model_name: MODEL,
      prompt_version: PROMPT_VERSION, input_summary: summary,
      estimated_cost_usd: (Math.ceil(JSON.stringify(summary).length / 4 + 100) * 0.4 + OUTPUT_CAP * 1.6) / 1_000_000 })).error);
    inserted = true;
    emit('analyze', 'active');
    const model = await modelDecision(summary);
    check((await db.from('laurie_agent_runs').update({ estimated_cost_usd: model.estimatedCostUsd,
      actual_cost_usd: model.actualCostUsd, input_tokens: model.inputTokens,
      output_tokens: model.outputTokens }).eq('id', id)).error);
    emit('analyze', 'complete');
    emit('risk', 'active');
    const reasons: string[] = [];
    const now = new Date();
    if (!['SPY', 'QQQ'].includes(SYMBOL) || quote.symbol !== SYMBOL) reasons.push('Ticker is not the configured allowed symbol.');
    if (!withinCoreHours(now)) reasons.push('Outside the regular US market session.');
    const quoteAge = now.getTime() - Date.parse(quote.asOf);
    const barAge = now.getTime() - Date.parse(candleTime);
    if (quoteAge < -5000 || quoteAge > 17 * 60_000 || barAge < -5000 || barAge > 17 * 60_000) reasons.push('Market data is too old for a sandbox order.');
    if (Math.abs(quote.last - bars.at(-1)!.close) / quote.last > 0.02) reasons.push('Quote and bars disagree by more than 2%.');
    if (openOrders.some(o => ['submitted', 'partial', 'unknown', 'submitting'].includes(o.status))) reasons.push('An existing paper order must resolve first.');
    if (model.decision === 'BUY') {
      if ((held?.marketValue ?? 0) + MAX_PAPER_NOTIONAL > MAX_POSITION_VALUE) reasons.push('Maximum paper position size would be exceeded.');
      if (Math.min(account.cash, account.buyingPower) < MAX_PAPER_NOTIONAL) reasons.push('Insufficient sandbox funds.');
    }
    if (model.decision === 'SELL' && (!held || held.quantity <= 0)) reasons.push(`No owned ${SYMBOL} shares to sell.`);
    const allowed = model.decision !== 'HOLD' && reasons.length === 0;
    const risk = model.decision === 'HOLD' ? 'HOLD · no order needed' : allowed ? 'Passed all paper order checks' : `Blocked · ${reasons.join(' ')}`;
    emit('risk', 'complete');
    emit('order', 'active');
    let orderStatus = model.decision === 'HOLD' ? 'No order · HOLD' : allowed ? 'Preparing paper order' : 'No order · risk blocked';
    if (allowed) {
      const quantity = model.decision === 'SELL' ? Math.floor(Math.min(held!.quantity, MAX_PAPER_NOTIONAL / quote.last) * 1_000_000) / 1_000_000 : null;
      if (model.decision === 'SELL' && (!quantity || quantity <= 0)) throw new Error('Sell quantity is too small; no order was sent.');
      const request = { clientOrderId: id.replaceAll('-', '').slice(0, 32), symbol: SYMBOL, side: model.decision as 'BUY' | 'SELL',
        quantity, notional: model.decision === 'BUY' ? MAX_PAPER_NOTIONAL : null, orderType: 'MARKET' as const, limitPrice: null };
      await api.previewOrder(request);
      check((await db.from('laurie_order_outcomes').insert({ run_id: id, account_id: process.env.WEBULL_PAPER_ACCOUNT_ID!, client_order_id: request.clientOrderId,
        side: request.side, quantity: request.quantity, notional: request.notional, status: 'submitting', detail: { request } })).error);
      try {
        const outcome = await api.placeOrder(request);
        check((await db.from('laurie_order_outcomes').update({ broker_order_id: outcome.id, status: outcome.status,
          detail: outcome, reconciled_at: new Date().toISOString() }).eq('run_id', id)).error);
        orderStatus = `Webull paper order · ${outcome.status}`;
      } catch (error) {
        check((await db.from('laurie_order_outcomes').update({ status: 'unknown', error: safeMessage(error) }).eq('run_id', id)).error);
        orderStatus = 'Paper order outcome uncertain · reconcile before retry';
      }
    }
    emit('order', 'complete');
    emit('save', 'active');
    check((await db.from('laurie_decisions').insert({ run_id: id, decision: model.decision, explanation: model.explanation,
      risk_allowed: allowed, risk_result: { allowed, reasons, message: risk }, order_status: orderStatus })).error);
    const completedAt = new Date().toISOString();
    check((await db.from('laurie_agent_runs').update({ status: 'completed', completed_at: completedAt,
      estimated_cost_usd: model.estimatedCostUsd, actual_cost_usd: model.actualCostUsd,
      input_tokens: model.inputTokens, output_tokens: model.outputTokens }).eq('id', id)).error);
    emit('save', 'complete');
    return { id, startedAt, completedAt, symbol: SYMBOL, mode: 'webull_sandbox', dataSource: 'webull_sandbox', candleTime,
      decision: model.decision, explanation: model.explanation, inputSummary: summary.display,
      risk, orderStatus, model: MODEL, promptVersion: PROMPT_VERSION, estimatedCostUsd: model.estimatedCostUsd,
      actualCostUsd: model.actualCostUsd, inputTokens: model.inputTokens, outputTokens: model.outputTokens, error: null };
  } catch (error) {
    if (inserted) await db.from('laurie_agent_runs').update({ status: 'failed', completed_at: new Date().toISOString(), error: safeMessage(error) }).eq('id', id);
    throw error;
  } finally {
    await db.rpc('laurie_release_run', { p_id: id });
  }
}

export function runId() { return randomUUID(); }
