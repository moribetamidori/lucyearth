import { expect, test } from '@playwright/test';
import { snapshot, buy } from './fixtures';
import { simulatedBaseline } from '../../lib/trade/agents/trader';
import { DEFAULT_POLICY } from '../../lib/trade/risk/policy';

const config = { mode: 'paper', broker: 'simulated', model: 'openai/fixture', accessReady: true, databaseReady: true, credentialsReady: true, accountReady: true, llmReady: false };

test('unauthenticated financial endpoints and cross-origin controls are protected', async ({ request }) => {
  const state = await request.get('/trade/api/overview'); expect(state.status()).toBe(401);
  const denied = await request.post('/trade/api/evaluate', { headers: { origin: 'https://untrusted.example' }, data: { symbol: 'SPY', engine: 'baseline' } }); expect(denied.status()).toBe(403);
  const anonymous = await request.post('/trade/api/evaluate', { headers: { origin: 'http://127.0.0.1:3127' }, data: { symbol: 'SPY', engine: 'baseline' } }); expect(anonymous.status()).toBe(401);
});

test('all six routes render honestly before setup and fit the viewport', async ({ page }, info) => {
  for (const path of ['', '/decisions', '/trades', '/strategies', '/lab', '/logs']) {
    await page.goto(`/trade${path}`);
    await expect(page.getByRole('heading', { name: 'Your lab is ready for setup.' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (path === '/lab') {
      await expect(page.getByRole('button', { name: 'Generate candidates' })).toBeDisabled();
      await expect(page.getByText('No improvement cycle yet.')).toHaveCount(0);
    }
  }
  await page.goto('/trade');
  await expect(page.getByRole('button', { name: 'Enter the lab →' })).toBeDisabled();
  await page.screenshot({ path: info.outputPath('setup.png'), fullPage: true });
});

test('a preview cannot submit an order until the operator explicitly approves it', async ({ page }, info) => {
  const s = snapshot(); const p = simulatedBaseline(s);
  let submissions = 0;
  const d = { id: '22222222-2222-4222-8222-222222222222', account_key: 'simulated:quant-lab', strategy_id: s.strategy.id, strategy_version: 1, timestamp: new Date().toISOString(), symbol: 'SPY', action: 'BUY', confidence: 0.6, reasoning_summary: p.thesis, market_context: s, raw_agent_output: p, proposal: p, risk_result: { allowed: true, reasons: [], notional: 25, policyVersion: 'paper-risk-v1' }, model: 'fixture', prompt_version: 'trader-v1', source: 'deterministic_simulator' };
  const o = { id: '55555555-5555-4555-8555-555555555555', decision_id: d.id, client_order_id: 'testpaperorder', symbol: 'SPY', side: 'BUY', quantity: null, notional: 25, order_type: 'MARKET', limit_price: null, status: 'pending_approval', request: buy(), preview: { accepted: true, estimatedNotional: 25, estimatedFees: 0.01, warnings: ['Synthetic prices and simulated fills.'], source: 'simulated' }, approval_hash: 'a'.repeat(64), approval_expires_at: new Date(Date.now() + 60000).toISOString(), filled_quantity: 0, fill_price: null, created_at: new Date().toISOString() };
  const state = { configuration: config, paused: false, snapshot: s, strategies: [s.strategy], decisions: [d], orders: [] as typeof o[], trades: [], events: [], policy: DEFAULT_POLICY, jobs: [] };
  await page.route('**/trade/api/**', async route => {
    const action = new URL(route.request().url()).pathname.split('/').at(-1);
    let result: unknown;
    if (action === 'session') result = { authenticated: true, configuration: config };
    else if (action === 'overview') result = state;
    else if (action === 'preview') { state.orders = [o]; result = { order: o }; }
    else if (action === 'approve') { submissions++; expect(route.request().postDataJSON()).toEqual({ orderId: o.id, hash: o.approval_hash }); o.status = 'filled'; o.filled_quantity = 0.038; result = { order: o }; }
    else throw new Error(`Unexpected browser API call: ${action}`);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) });
  });
  await page.goto('/trade');
  await expect(page.getByText('$10,000.00')).toBeVisible();
  await page.screenshot({ path: info.outputPath('dashboard.png'), fullPage: true });
  await page.getByRole('button', { name: /SPY BUY/ }).click();
  await page.getByRole('button', { name: 'Preview paper order →' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(submissions).toBe(0);
  await page.getByRole('button', { name: 'Approve simulated order' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(submissions).toBe(1);
  await page.reload();
  await expect(page.getByText('filled', { exact: true })).toBeVisible();
  expect(submissions).toBe(1);
});
