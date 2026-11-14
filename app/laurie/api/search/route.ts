import type { WatchSymbol } from '@/lib/laurie/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (!query || query.length > 60 || !/^[\p{L}\p{N} .&'-]+$/u.test(query)) {
    return Response.json({ results: [] satisfies WatchSymbol[] });
  }
  try {
    const url = new URL('https://quotes-gw.webullfintech.com/api/search/pc/tickers');
    url.search = new URLSearchParams({ keyword: query, pageIndex: '1', pageSize: '20', regionId: '6' }).toString();
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Webull search is unavailable.');
    const payload: unknown = await response.json();
    const rows = payload && typeof payload === 'object' && 'data' in payload && Array.isArray(payload.data) ? payload.data : [];
    const results: WatchSymbol[] = [];
    const seen = new Set<string>();
    for (const value of rows) {
      if (!value || typeof value !== 'object') continue;
      const row = value as Record<string, unknown>;
      const symbol = typeof row.symbol === 'string' ? row.symbol.toUpperCase() : '';
      const name = typeof row.name === 'string' ? row.name : '';
      const category = row.template === 'etf' ? 'US_ETF' : row.template === 'stock' ? 'US_STOCK' : null;
      if (row.regionCode !== 'US' || !category || !/^[A-Z][A-Z0-9.]{0,9}$/.test(symbol) || !name || seen.has(symbol)) continue;
      results.push({ symbol, name, category });
      seen.add(symbol);
      if (results.length === 10) break;
    }
    return Response.json({ results }, { headers: { 'Cache-Control': 'private, max-age=30' } });
  } catch {
    return Response.json({ error: 'Webull ticker search is unavailable right now.' }, { status: 503 });
  }
}
