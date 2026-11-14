import { chartSeries, executeRun, runId, snapshot } from '@/lib/laurie/server';
import { isChartSelection, type DisplayInterval } from '@/lib/laurie/chart';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const range = url.searchParams.get('range');
    const interval = url.searchParams.get('interval');
    if (range !== null || interval !== null) {
      if (!range || !interval || !isChartSelection(range, interval)) return Response.json({ error: 'Unsupported chart range or interval.' }, { status: 400 });
      const symbol = url.searchParams.get('symbol') ?? (process.env.LAURIE_SYMBOL?.toUpperCase() === 'QQQ' ? 'QQQ' : 'SPY');
      const category = url.searchParams.get('category') ?? 'US_ETF';
      const before = url.searchParams.get('before') ?? undefined;
      if (!/^[A-Z][A-Z0-9.]{0,9}$/.test(symbol) || (category !== 'US_ETF' && category !== 'US_STOCK')) {
        return Response.json({ error: 'Unsupported chart ticker.' }, { status: 400 });
      }
      if (before && (!Number.isFinite(Date.parse(before)) || Date.parse(before) > Date.now())) return Response.json({ error: 'Invalid chart cursor.' }, { status: 400 });
      return Response.json(await chartSeries(symbol, category, range, interval as DisplayInterval, before), { headers: { 'Cache-Control': 'no-store' } });
    }
    return Response.json(await snapshot(), { headers: { 'Cache-Control': 'no-store' } });
  }
  catch { return Response.json({ error: 'Could not load the Laurie screen.' }, { status: 503 }); }
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (origin && (!host || new URL(origin).host !== host)) return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
  const id = runId();
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (value: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
      try {
        const run = await executeRun(id, (step, state) => send({ type: 'step', step, state }));
        send({ type: 'result', run });
      } catch (error) {
        send({ type: 'error', message: error instanceof Error ? error.message : 'Agent run failed.' });
      } finally { controller.close(); }
    },
  });
  return new Response(body, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
