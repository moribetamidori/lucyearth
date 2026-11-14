import { WebullPaperBroker } from '@/lib/trade/broker/webull_paper';
import type { WatchQuote, WatchSymbol } from '@/lib/laurie/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (origin && (!host || new URL(origin).host !== host)) return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
  let symbols: WatchSymbol[];
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || !('symbols' in body) || !Array.isArray(body.symbols) || body.symbols.length > 20) throw new Error();
    symbols = body.symbols;
    if (symbols.some(item => !item || typeof item !== 'object' || !/^[A-Z][A-Z0-9.]{0,9}$/.test(item.symbol) || !['US_STOCK', 'US_ETF'].includes(item.category))) throw new Error();
  } catch { return Response.json({ error: 'Invalid watchlist.' }, { status: 400 }); }
  if (process.env.LAURIE_MARKET_DATA === 'sample' || !process.env.WEBULL_PAPER_APP_KEY || !process.env.WEBULL_PAPER_APP_SECRET) {
    return Response.json({ error: 'Webull sandbox credentials are not configured.' }, { status: 503 });
  }
  try {
    const broker = new WebullPaperBroker('', async () => {}, async () => {});
    const groups = (['US_STOCK', 'US_ETF'] as const).map(category => ({ category, tickers: [...new Set(symbols.filter(item => item.category === category).map(item => item.symbol))] }));
    const quotes = await Promise.all(groups.filter(group => group.tickers.length).map(group => broker.getWatchQuotes(group.tickers, group.category)));
    return Response.json({ quotes: quotes.flat() satisfies WatchQuote[] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Webull sandbox quotes are unavailable for this watchlist.' }, { status: 503 });
  }
}
