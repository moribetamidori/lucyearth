import 'server-only';
import { randomUUID } from 'node:crypto';
import { dbError, tradeDb } from './db';
import { easternDay } from '../risk/policy';
import { activeOrderStatuses, strategySchema, type BrokerKind, type BrokerOrder, type Decision, type Snapshot, type StoredOrder, type Strategy, type SystemEvent, type Trade } from '../types';
import baseline from '../strategies/v1.json';

export type Runtime = { account_key: string; paused: boolean; lock_token: string | null; lock_until: string | null; last_snapshot: Snapshot | null };
export class TradeStore {
  readonly db = tradeDb();
  constructor(readonly key: string, readonly broker: BrokerKind) {}
  async initialize() {
    dbError((await this.db.from('trade_runtime').upsert({ account_key: this.key, broker: this.broker }, { onConflict: 'account_key', ignoreDuplicates: true })).error);
    const definition = strategySchema.parse(baseline);
    dbError((await this.db.from('trade_strategies').upsert({ account_key: this.key, version: 1, status: 'current', strategy_definition: definition, created_by: 'system', change_summary: 'Initial infrastructure baseline; no profitability claim.' }, { onConflict: 'account_key,version', ignoreDuplicates: true })).error);
  }
  async runtime(): Promise<Runtime> {
    const r = await this.db.from('trade_runtime').select('*').eq('account_key', this.key).single(); dbError(r.error); return r.data as Runtime;
  }
  async strategy(): Promise<Strategy> {
    const r = await this.db.from('trade_strategies').select('*').eq('account_key', this.key).eq('status', 'current').single(); dbError(r.error);
    return { ...r.data, strategy_definition: strategySchema.parse(r.data.strategy_definition) } as Strategy;
  }
  async strategies(): Promise<Strategy[]> { const r = await this.db.from('trade_strategies').select('*').eq('account_key', this.key).order('version'); dbError(r.error); return r.data as Strategy[]; }
  async decisions(): Promise<Decision[]> { const r = await this.db.from('trade_agent_decisions').select('*').eq('account_key', this.key).order('timestamp', { ascending: false }).limit(100); dbError(r.error); return r.data as Decision[]; }
  async orders(): Promise<StoredOrder[]> { const r = await this.db.from('trade_orders').select('*').eq('account_key', this.key).order('created_at', { ascending: false }).limit(200); dbError(r.error); return r.data as StoredOrder[]; }
  async activeOrders(): Promise<StoredOrder[]> { const r = await this.db.from('trade_orders').select('*').eq('account_key', this.key).in('status', activeOrderStatuses); dbError(r.error); return r.data as StoredOrder[]; }
  async reconcilableOrders(): Promise<StoredOrder[]> {
    const r = await this.db.from('trade_orders').select('*').eq('account_key', this.key).or('status.in.(submitting,submitted,partial,unknown),and(filled_quantity.gt.0,fees_final.eq.false)').order('created_at').limit(100);
    dbError(r.error); return r.data as StoredOrder[];
  }
  async recordedQuantity(symbol: string): Promise<number> {
    const r = await this.db.from('trade_trades').select('quantity').eq('account_key', this.key).eq('symbol', symbol).is('exit_time', null);
    dbError(r.error); return r.data!.reduce((sum, lot) => sum + Number(lot.quantity), 0);
  }
  async trades(): Promise<Trade[]> { const r = await this.db.from('trade_trades').select('*').eq('account_key', this.key).order('entry_time', { ascending: false }).limit(200); dbError(r.error); return r.data as Trade[]; }
  async events(): Promise<SystemEvent[]> { const r = await this.db.from('trade_system_events').select('*').eq('account_key', this.key).order('created_at', { ascending: false }).limit(150); dbError(r.error); return r.data as SystemEvent[]; }
  async decision(id: string): Promise<Decision> { const r = await this.db.from('trade_agent_decisions').select('*').eq('account_key', this.key).eq('id', id).single(); dbError(r.error); return r.data as Decision; }
  async order(id: string): Promise<StoredOrder> { const r = await this.db.from('trade_orders').select('*').eq('account_key', this.key).eq('id', id).single(); dbError(r.error); return r.data as StoredOrder; }
  async countToday(now = new Date()) {
    // UTC lower bound includes the complete NY day, then filter by exchange date.
    const since = new Date(now.getTime() - 48 * 3600000).toISOString();
    const r = await this.db.from('trade_orders').select('submitted_at').eq('account_key', this.key).gte('submitted_at', since); dbError(r.error);
    return r.data!.filter(o => easternDay(new Date(o.submitted_at)) === easternDay(now)).length;
  }
  async recordDecision(decision: Omit<Decision, 'id'>) {
    const p = decision.proposal;
    const r = await this.db.from('trade_agent_decisions').insert({ ...decision, entry_price: p.limit_price ?? decision.market_context.quote.last, stop_loss: p.stop_loss, take_profit: p.take_profit, position_size: p.quantity }).select().single(); dbError(r.error); return r.data as Decision;
  }
  async recordOrder(order: Partial<StoredOrder>) { const r = await this.db.from('trade_orders').insert(order).select().single(); dbError(r.error); return r.data as StoredOrder; }
  async updateOrder(id: string, update: Partial<StoredOrder>) { dbError((await this.db.from('trade_orders').update(update).eq('account_key', this.key).eq('id', id)).error); }
  async expirePreviews(decisionId: string) { dbError((await this.db.from('trade_orders').update({ status: 'expired' }).eq('account_key', this.key).eq('decision_id', decisionId).eq('status', 'pending_approval')).error); }
  async saveSnapshot(snapshot: Snapshot) {
    dbError((await this.db.from('trade_account_snapshots').insert({ account_key: this.key, timestamp: snapshot.timestamp, account: snapshot.account, positions: snapshot.positions })).error);
    dbError((await this.db.from('trade_runtime').update({ last_snapshot: snapshot, updated_at: new Date().toISOString() }).eq('account_key', this.key)).error);
  }
  async setPaused(paused: boolean) { dbError((await this.db.from('trade_runtime').update({ paused, updated_at: new Date().toISOString() }).eq('account_key', this.key)).error); await this.event('control', paused ? 'New exposure paused' : 'Manual evaluations enabled'); }
  async event(kind: string, message: string, details: Record<string, unknown> = {}) { dbError((await this.db.from('trade_system_events').insert({ account_key: this.key, kind, message, details })).error); }
  async withLock<T>(fn: (token: string) => Promise<T>) {
    const token = randomUUID();
    const r = await this.db.rpc('trade_acquire_lock', { p_key: this.key, p_token: token }); dbError(r.error);
    if (!r.data) throw new Error('Another account operation is running. Wait for it to finish, then refresh.');
    try { return await fn(token); } finally { dbError((await this.db.rpc('trade_release_lock', { p_key: this.key, p_token: token })).error); }
  }
  async assertLock(token: string) { dbError((await this.db.rpc('trade_assert_lock', { p_key: this.key, p_token: token })).error); }
  async beginOrder(id: string, hash: string, actor: string, token: string) {
    const r = await this.db.rpc('trade_begin_order', { p_key: this.key, p_token: token, p_order: id, p_hash: hash, p_actor: actor }); dbError(r.error); return r.data as StoredOrder;
  }
  async reconcile(id: string, result: BrokerOrder, token: string) { dbError((await this.db.rpc('trade_reconcile_order', { p_key: this.key, p_token: token, p_order: id, p_result: result })).error); }
  async startJob(kind: string, actor: string) { const r = await this.db.from('trade_job_runs').insert({ account_key: this.key, kind, actor_id: actor, status: 'running' }).select('id').single(); dbError(r.error); return r.data!.id as string; }
  async finishJob(id: string, ok: boolean) { dbError((await this.db.from('trade_job_runs').update({ status: ok ? 'completed' : 'failed', completed_at: new Date().toISOString(), error_code: ok ? null : 'OPERATION_FAILED' }).eq('id', id).eq('account_key', this.key)).error); }
}
