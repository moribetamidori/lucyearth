import { WebullPaperBroker } from '@/lib/trade/broker/webull_paper';
import { estimateOptionAtExpiry, type OptionAnalysis, type OptionContract, type OptionEstimate } from '@/lib/laurie/options';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const cache = new Map<string, { expires: number; result: OptionAnalysis }>();

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = (url.searchParams.get('symbol') ?? '').toUpperCase();
  const category = url.searchParams.get('category');
  const requestedExpiry = url.searchParams.get('expiration') ?? undefined;
  if (!/^[A-Z][A-Z0-9.]{0,9}$/.test(symbol) || (category !== 'US_STOCK' && category !== 'US_ETF') ||
    requestedExpiry && !/^20\d{2}-\d{2}-\d{2}$/.test(requestedExpiry)) {
    return Response.json({ error: 'Invalid option analysis request.' }, { status: 400 });
  }
  if (process.env.LAURIE_MARKET_DATA === 'sample' || !process.env.WEBULL_PAPER_APP_KEY || !process.env.WEBULL_PAPER_APP_SECRET ||
    (process.env.TRADING_MODE ?? 'paper') !== 'paper') {
    return Response.json({ error: 'Real Webull sandbox market data is required for option estimates.' }, { status: 503 });
  }
  const key = `${category}:${symbol}:${requestedExpiry ?? 'nearest'}`;
  const saved = cache.get(key);
  if (saved && saved.expires > Date.now()) return Response.json(saved.result, { headers: { 'Cache-Control': 'private, max-age=20' } });
  try {
    const broker = new WebullPaperBroker('', async () => {}, async () => {});
    const [quotes, history, available] = await Promise.all([
      broker.getWatchQuotes([symbol], category), broker.getHistoricalBars(symbol, 'D', 260, category),
      broker.getOptionContracts(symbol, requestedExpiry),
    ]);
    const quote = quotes[0];
    if (!quote || quote.price <= 0 || history.length < 61) throw new Error('Underlying quote or daily history is unavailable.');
    const today = new Date().toISOString().slice(0, 10);
    const listed = available.filter(contract => contract.expiration >= today);
    const expiration = requestedExpiry ?? listed.map(contract => contract.expiration).sort()[0];
    if (!expiration) throw new Error('No listed standard option contracts were returned.');
    const matches = listed.filter(contract => contract.expiration === expiration);
    if (matches.length === 0) throw new Error('No standard contracts were returned for this expiration.');
    const selected: OptionContract[] = (['CALL', 'PUT'] as const).flatMap(type => matches.filter(contract => contract.type === type)
      .sort((a, b) => Math.abs(a.strike - quote.price) - Math.abs(b.strike - quote.price)).slice(0, 10));
    const snapshots = await broker.getOptionSnapshots(selected.map(contract => contract.symbol));
    const snapshotsBySymbol = new Map(snapshots.map(snapshot => [snapshot.symbol, snapshot]));
    const contracts: OptionEstimate[] = selected.map(contract => {
      const snapshot = snapshotsBySymbol.get(contract.symbol);
      const bid = snapshot?.bid ?? null, ask = snapshot?.ask ?? null;
      const timestampsAlign = snapshot && Math.abs(Date.parse(snapshot.asOf) - Date.parse(quote.asOf)) <= 86_400_000;
      const validAsk = timestampsAlign && ask !== null && ask > 0 && bid !== null && bid >= 0 && bid <= ask;
      const estimate = validAsk ? estimateOptionAtExpiry(contract, ask, quote.price, history) : null;
      return { ...contract, bid, ask, impliedVolatility: snapshot?.impliedVolatility ?? null,
        openInterest: snapshot?.openInterest ?? null, quoteTime: snapshot?.asOf ?? null,
        expectedPnl: estimate?.expectedPnl ?? null, expectedReturnPct: estimate?.expectedReturnPct ?? null,
        probabilityProfitPct: estimate?.probabilityProfitPct ?? null, breakeven: estimate?.breakeven ?? null,
        maxLoss: estimate?.maxLoss ?? null };
    });
    const result: OptionAnalysis = { underlying: symbol, underlyingPrice: quote.price, underlyingTime: quote.asOf,
      expiration, historyEnd: history.at(-1)!.timestamp, historyDays: history.length - 1, paths: 2000,
      contracts: contracts.sort((a, b) => a.type.localeCompare(b.type) || a.strike - b.strike),
      sourceLabel: 'Webull sandbox delayed option bid/ask · historical daily-return scenarios · before fees' };
    cache.set(key, { expires: Date.now() + 60_000, result });
    if (cache.size > 80) cache.delete(cache.keys().next().value!);
    return Response.json(result, { headers: { 'Cache-Control': 'private, max-age=20' } });
  } catch {
    return Response.json({ error: 'Webull option contracts, quotes, or daily history are unavailable for this ticker.' }, { status: 503 });
  }
}
