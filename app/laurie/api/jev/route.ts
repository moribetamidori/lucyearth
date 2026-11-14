import { WebullPaperBroker } from '@/lib/trade/broker/webull_paper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (origin && (!host || new URL(origin).host !== host)) return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
  let symbol: string, category: 'US_STOCK' | 'US_ETF';
  try {
    const body = await request.json();
    symbol = body.symbol; category = body.category;
    if (!/^[A-Z][A-Z0-9.]{0,9}$/.test(symbol) || !['US_STOCK', 'US_ETF'].includes(category)) throw new Error();
  } catch { return Response.json({ error: 'Invalid ticker.' }, { status: 400 }); }
  if (!process.env.OPENJEV_API_KEY) return Response.json({ error: 'Add a free OPENJEV_API_KEY on the server to enable the optional Jev readout.' }, { status: 503 });
  if (process.env.LAURIE_MARKET_DATA === 'sample' || !process.env.WEBULL_PAPER_APP_KEY || !process.env.WEBULL_PAPER_APP_SECRET) {
    return Response.json({ error: 'Real market history is required for Jev.' }, { status: 503 });
  }
  try {
    const broker = new WebullPaperBroker('', async () => {}, async () => {});
    const bars = await broker.getHistoricalBars(symbol, 'D', 65, category);
    if (bars.length < 25) throw new Error();
    const last = bars.at(-1)!;
    const five = bars.at(-6)!;
    const twenty = bars.at(-21)!;
    const response = await fetch('https://api.openjev.sh/v1/systemone', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENJEV_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'openjev', state: { symbol, latest_daily_bar: last.timestamp,
        last_5_sessions: `${((last.close / five.close - 1) * 100).toFixed(2)}%`,
        last_20_sessions: `${((last.close / twenty.close - 1) * 100).toFixed(2)}%`,
        above_20_session_average: last.close > bars.slice(-20).reduce((sum, bar) => sum + bar.close, 0) / 20,
        note: 'These are historical stock-price features only. No future price, option quote, or news is supplied.' },
      questions: { recent_regime: { type: 'choice', instructions: 'Classify the observed recent price action, without forecasting the future.',
        criteria: { rising: 'Observed prices show an upward trend', falling: 'Observed prices show a downward trend', mixed: 'Observed prices are mixed or range-bound' } } } }),
      signal: AbortSignal.timeout(10_000), cache: 'no-store', redirect: 'error',
    });
    if (!response.ok) throw new Error();
    const data = await response.json();
    const answer = data.answers?.recent_regime;
    if (!answer || !['rising', 'falling', 'mixed'].includes(answer.choice) || !answer.probabilities) throw new Error();
    return Response.json({ symbol, observedThrough: last.timestamp, model: data.model ?? 'openjev',
      choice: answer.choice, probabilities: answer.probabilities, confidence: answer.confidence ?? null,
      note: 'Experimental Jev classification of past price action; it does not change option expected returns.' },
      { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Jev readout is unavailable. Option calculations are unaffected.' }, { status: 503 }); }
}
