import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authClient, operator } from '@/lib/trade/server/auth';
import { tradingConfig, assertPaperMode } from '@/lib/trade/config';
import { loadRiskPolicy } from '@/lib/trade/risk/policy';
import { tradingServices } from '@/lib/trade/server/factory';
import { TradingService } from '@/lib/trade/server/service';
import { dbError, tradeDb } from '@/lib/trade/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

function configuration() {
  const config = tradingConfig();
  return {
    mode: 'paper', broker: config.broker, model: `${config.llmProvider}/${config.model}`,
    accessReady: Boolean(config.adminEmail),
    databaseReady: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    credentialsReady: config.broker === 'simulated' || Boolean(process.env.WEBULL_PAPER_APP_KEY && process.env.WEBULL_PAPER_APP_SECRET),
    accountReady: Boolean(config.accountId),
    llmReady: Boolean(process.env[config.llmProvider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY']),
  };
}

async function body(request: NextRequest) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error('A JSON request is required.');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Request body is required.');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 16384) { await reader.cancel(); throw new Error('Request is too large.'); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
  catch { throw new Error('Request body is not valid JSON.'); }
}
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin || request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const configured = process.env.TRADE_APP_ORIGIN;
  if (configured) {
    try { return origin === new URL(configured).origin; } catch { return false; }
  }
  // Next's internal request URL can differ behind a proxy. Pin the external
  // origin in deployments; only loopback development gets a local fallback.
  if (process.env.NODE_ENV === 'production') return false;
  try {
    const local = new URL(`http://${request.headers.get('host')}`);
    return ['localhost', '127.0.0.1', '[::1]'].includes(local.hostname) && origin === local.origin;
  } catch { return false; }
}

export async function GET(_request: NextRequest, context: { params: Promise<{ action: string }> }) {
  try {
    assertPaperMode();
    const { action } = await context.params;
    if (!['session', 'overview'].includes(action)) return json({ error: 'Not found.' }, 404);
    const user = await operator();
    if (action === 'session') return json({ authenticated: Boolean(user), configuration: configuration() });
    if (!user) return json({ error: 'Sign in as the trading operator.' }, 401);
    const { store } = tradingServices();
    await store.initialize();
    const [state, strategies, decisions, orders, trades, events, jobs, summary] = await Promise.all([
      store.runtime(), store.strategies(), store.decisions(), store.orders(), store.trades(), store.events(),
      store.db.from('trade_job_runs').select('id,kind,status,started_at,completed_at').eq('account_key', store.key).order('started_at', { ascending: false }).limit(20),
      store.db.rpc('trade_summary', { p_key: store.key }),
    ]);
    dbError(jobs.error);
    dbError(summary.error);
    return json({ configuration: configuration(), paused: state.paused, snapshot: state.last_snapshot, strategies, decisions, orders, trades, events, jobs: jobs.data, summary: summary.data, policy: loadRiskPolicy() });
  } catch (error) { return json({ error: safeError(error) }, 503); }
}

export async function POST(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  if (!sameOrigin(request)) return json({ error: 'Cross-origin controls are not permitted.' }, 403);
  try {
    assertPaperMode();
    const { action } = await context.params;
    if (!['login', 'logout', 'discover', 'refresh', 'evaluate', 'preview', 'approve', 'cancel', 'reconcile', 'pause'].includes(action)) return json({ error: 'Not found.' }, 404);
    const input = await body(request);
    if (action === 'login') {
      const data = z.strictObject({ email: z.string().email().max(254), password: z.string().min(1).max(1024) }).parse(input);
      const config = tradingConfig();
      if (!config.adminEmail) return json({ error: 'Configure TRADE_ADMIN_EMAIL on the server first.' }, 503);
      const limit = await tradeDb().rpc('trade_rate_limit', { p_bucket: 'operator-login', p_limit: 10, p_seconds: 60 });
      dbError(limit.error);
      if (!limit.data) return json({ error: 'Too many sign-in attempts. Please wait one minute.' }, 429);
      if (data.email.trim().toLowerCase() !== config.adminEmail) return json({ error: 'Invalid operator credentials.' }, 401);
      const auth = await authClient();
      const result = await auth.auth.signInWithPassword(data);
      if (result.error || !result.data.user?.email_confirmed_at) { await auth.auth.signOut(); return json({ error: 'Invalid operator credentials.' }, 401); }
      return json({ ok: true });
    }
    const user = await operator();
    if (!user) return json({ error: 'Sign in as the trading operator.' }, 401);
    if (action === 'logout') { await (await authClient()).auth.signOut(); return json({ ok: true }); }
    const { store, broker } = tradingServices();
    await store.initialize();
    const limit = await store.db.rpc('trade_rate_limit', { p_bucket: `controls:${user.id}`, p_limit: 20, p_seconds: 60 }); dbError(limit.error);
    if (!limit.data) return json({ error: 'Too many requests. Wait one minute.' }, 429);
    const service = new TradingService(store, broker);
    switch (action) {
      case 'discover': return json({ accounts: await store.withLock(() => broker.listAccounts()) });
      case 'refresh': return json({ snapshot: await store.withLock(() => service.snapshot(z.strictObject({ symbol: z.enum(['SPY', 'QQQ']) }).parse(input).symbol)) });
      case 'evaluate': {
        const p = z.strictObject({ symbol: z.enum(['SPY', 'QQQ']), engine: z.enum(['llm', 'baseline']) }).parse(input);
        return json({ decision: await service.runTrader(p.symbol, p.engine, user.id) });
      }
      case 'preview': return json({ order: await service.previewDecision(z.strictObject({ decisionId: z.string().uuid() }).parse(input).decisionId) });
      case 'approve': {
        const p = z.strictObject({ orderId: z.string().uuid(), hash: z.string().regex(/^[a-f0-9]{64}$/) }).parse(input);
        return json({ order: await service.approveOrder(p.orderId, p.hash, user.id) });
      }
      case 'cancel': await service.cancelOrder(z.strictObject({ orderId: z.string().uuid() }).parse(input).orderId); return json({ ok: true });
      case 'reconcile': return json(await service.reconcileOrders());
      case 'pause': await store.setPaused(z.strictObject({ paused: z.boolean() }).parse(input).paused); return json({ ok: true });
    }
  } catch (error) { return json({ error: safeError(error) }, error instanceof z.ZodError ? 400 : 409); }
}

function safeError(error: unknown) {
  if (error instanceof z.ZodError) return 'The request did not match the required schema.';
  // All upstream adapters deliberately replace raw responses with bounded, secret-free messages.
  return error instanceof Error ? error.message.slice(0, 600) : 'The operation could not be completed.';
}
