import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { TradingService, type TradingStore } from '../../lib/trade/server/service';
import { SimulatedBroker } from '../../lib/trade/broker/simulated';
import type { Runtime } from '../../lib/trade/server/store';
import { activeOrderStatuses, type BrokerOrder, type Decision, type Snapshot, type StoredOrder, type Strategy } from '../../lib/trade/types';
import { snapshot } from './fixtures';

// Runs the actual service, simulator, schema, leases and reconciliation RPCs against
// embedded PostgreSQL. Only the PostgREST transport is replaced by direct SQL.
class SqlStore implements TradingStore {
  readonly key = 'simulated:quant-lab';
  constructor(readonly db: PGlite) {}
  async first<T>(sql: string, args: unknown[] = []) { const row = (await this.db.query<T>(sql, args)).rows[0]; if (!row) throw new Error('Row not found'); return row; }
  async insert<T>(table: string, value: object): Promise<T> {
    const entries = Object.entries(value);
    return this.first<T>(`insert into ${table}(${entries.map(([k]) => k).join(',')}) values(${entries.map((_, i) => `$${i + 1}`).join(',')}) returning *`, entries.map(([, v]) => typeof v === 'object' && v !== null ? JSON.stringify(v) : v));
  }
  runtime() { return this.first<Runtime>('select * from trade_runtime'); }
  strategy() { return this.first<Strategy>("select * from trade_strategies where status='current'"); }
  async activeOrders() { return (await this.db.query<StoredOrder>('select * from trade_orders where status=any($1)', [activeOrderStatuses])).rows; }
  async reconcilableOrders() { return (await this.db.query<StoredOrder>('select * from trade_orders where status=any($1) or (filled_quantity>0 and not fees_final)', [activeOrderStatuses])).rows; }
  async recordedQuantity(symbol: string) { return Number((await this.first<{ quantity: string }>('select coalesce(sum(quantity),0) as quantity from trade_trades where symbol=$1 and exit_time is null', [symbol])).quantity); }
  async saveSnapshot(s: Snapshot) { await this.insert('trade_account_snapshots', { account_key: this.key, account: s.account, positions: s.positions }); await this.db.query('update trade_runtime set last_snapshot=$1', [JSON.stringify(s)]); }
  async withLock<T>(fn: (token: string) => Promise<T>) {
    const token = randomUUID();
    const acquired = await this.first<{ ok: boolean }>('select trade_acquire_lock($1,$2) as ok', [this.key, token]);
    if (!acquired.ok) throw new Error('Another account operation is running');
    try { return await fn(token); } finally { await this.db.query('select trade_release_lock($1,$2)', [this.key, token]); }
  }
  async assertLock(token: string) { await this.db.query('select trade_assert_lock($1,$2)', [this.key, token]); }
  async startJob(kind: string, actor: string) { return (await this.insert<{ id: string }>('trade_job_runs', { account_key: this.key, kind, actor_id: actor, status: 'running' })).id; }
  async finishJob(id: string, ok: boolean) { await this.db.query('update trade_job_runs set status=$1 where id=$2', [ok ? 'completed' : 'failed', id]); }
  async countToday() { return (await this.first<{ n: number }>('select count(*)::int as n from trade_orders where submitted_at is not null')).n; }
  recordDecision(d: Omit<Decision, 'id'>) { return this.insert<Decision>('trade_agent_decisions', d); }
  async event(kind: string, message: string, details: Record<string, unknown> = {}) { await this.insert('trade_system_events', { account_key: this.key, kind, message, details }); }
  decision(id: string) { return this.first<Decision>('select * from trade_agent_decisions where id=$1', [id]); }
  order(id: string) { return this.first<StoredOrder>('select * from trade_orders where id=$1', [id]); }
  async expirePreviews(id: string) { await this.db.query("update trade_orders set status='expired' where decision_id=$1 and status='pending_approval'", [id]); }
  recordOrder(order: Partial<StoredOrder>) { return this.insert<StoredOrder>('trade_orders', order); }
  async beginOrder(id: string, hash: string, actor: string, token: string) {
    await this.db.query('select trade_begin_order($1,$2,$3,$4,$5)', [this.key, token, id, hash, actor]); return this.order(id);
  }
  async reconcile(id: string, result: BrokerOrder, token: string) { await this.db.query('select trade_reconcile_order($1,$2,$3,$4)', [this.key, token, id, JSON.stringify(result)]); }
  async updateOrder(id: string, update: Partial<StoredOrder>) { assert.deepEqual(Object.keys(update), ['status']); await this.db.query('update trade_orders set status=$1 where id=$2', [update.status, id]); }
}

async function lab() {
  const db = new PGlite(), store = new SqlStore(db);
  await db.exec('create role anon; create role authenticated; create role service_role;');
  await db.exec(await readFile(new URL('../../supabase/migrations/20260904000000_trade_lab.sql', import.meta.url), 'utf8'));
  await store.insert('trade_runtime', { account_key: store.key, broker: 'simulated', paused: false });
  await store.insert('trade_strategies', { ...snapshot().strategy, account_key: store.key });
  // Future weekday keeps PostgreSQL wall-clock approval expiry valid on any test date.
  const now = new Date(); now.setUTCDate(now.getUTCDate() + 1); now.setUTCHours(15, 0, 0, 0);
  while ([0, 6].includes(now.getUTCDay())) now.setUTCDate(now.getUTCDate() + 1);
  const ledger = {
    async list() { return (await db.query<{ payload: BrokerOrder }>('select payload from trade_simulated_orders')).rows.map(r => r.payload); },
    async save(order: BrokerOrder) { await db.query('insert into trade_simulated_orders(account_key,client_order_id,payload) values($1,$2,$3) on conflict(account_key,client_order_id) do update set payload=excluded.payload', [store.key, order.clientOrderId, JSON.stringify(order)]); },
  };
  const broker = new SimulatedBroker(ledger, () => now);
  broker.getQuote = async symbol => ({ ...snapshot().quote, symbol, asOf: now.toISOString(), receivedAt: now.toISOString() });
  broker.getBars = async () => Array.from({ length: 70 }, (_, i) => ({ timestamp: new Date(now.getTime() - (70 - i) * 900000).toISOString(), open: 640 + i * 0.1, high: 641 + i * 0.1, low: 639 + i * 0.1, close: 640 + i * 0.1, volume: i === 69 ? 2000 : 1000 }));
  return { db, store, broker, ledger, service: new TradingService(store, broker, () => now), actor: randomUUID() };
}

test('full simulated milestone persists immutable context and one fill only after exact human approval', async () => {
  const { db, store, ledger, service, actor } = await lab();
  try {
    const decision = await service.runTrader('SPY', 'baseline', actor);
    assert.equal(decision.action, 'BUY'); assert.equal(decision.risk_result.allowed, true);
    const saved = JSON.stringify(decision.market_context);
    const order = await service.previewDecision(decision.id);
    assert.equal(order.status, 'pending_approval'); assert.equal((await ledger.list()).length, 0);
    await assert.rejects(service.approveOrder(order.id, 'tampered', actor), /changed/);
    const approvals = await Promise.allSettled([service.approveOrder(order.id, order.approval_hash, actor), service.approveOrder(order.id, order.approval_hash, actor)]);
    assert.equal(approvals.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal((await store.order(order.id)).status, 'filled'); assert.equal((await ledger.list()).length, 1);
    await assert.rejects(service.approveOrder(order.id, order.approval_hash, actor), /already used/);
    await service.reconcileOrders();
    assert.equal((await store.first<{ n: number }>('select count(*)::int as n from trade_fills')).n, 1);
    assert.equal((await store.first<{ n: number }>('select count(*)::int as n from trade_order_approvals')).n, 1);
    assert.ok(await store.recordedQuantity('SPY') > 0);
    assert.equal(JSON.stringify((await store.decision(decision.id)).market_context), saved);
  } finally { await db.close(); }
});

test('pause and expired approval block submission; a lost reply blocks replacements until readback succeeds', async () => {
  const { db, store, broker, ledger, service, actor } = await lab();
  try {
    const decision = await service.runTrader('SPY', 'baseline', actor);
    let order = await service.previewDecision(decision.id);
    await db.exec("update trade_orders set approval_expires_at=now()-interval '1 day'");
    await assert.rejects(service.approveOrder(order.id, order.approval_hash, actor), /expired/);
    order = await service.previewDecision(decision.id);
    await db.exec('update trade_runtime set paused=true');
    await assert.rejects(service.approveOrder(order.id, order.approval_hash, actor), /paused/);
    assert.equal((await ledger.list()).length, 0);
    await db.exec('update trade_runtime set paused=false');
    const readback = broker.getOrder.bind(broker);
    broker.getOrder = async () => { throw new Error('Lost readback response'); };
    await assert.rejects(service.approveOrder(order.id, order.approval_hash, actor), /requires reconciliation/);
    assert.equal((await store.order(order.id)).status, 'unknown'); assert.equal((await ledger.list()).length, 1);
    await assert.rejects(service.previewDecision(decision.id), /uncertain|Reconcile|reconcil/i);
    await assert.rejects(service.approveOrder(order.id, order.approval_hash, actor), /already used/);
    broker.getOrder = readback;
    assert.equal((await service.reconcileOrders()).confirmed, 1);
    assert.equal((await store.order(order.id)).status, 'filled');
    assert.equal((await store.first<{ n: number }>('select count(*)::int as n from trade_fills')).n, 1);
  } finally { await db.close(); }
});
