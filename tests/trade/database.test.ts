import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { snapshot, buy, NOW } from './fixtures';

const strategyId = '11111111-1111-4111-8111-111111111111';
const decisionId = '22222222-2222-4222-8222-222222222222';
const actorId = '33333333-3333-4333-8333-333333333333';
const token = '44444444-4444-4444-8444-444444444444';
const orderId = '55555555-5555-4555-8555-555555555555';
const key = 'simulated:quant-lab';

async function database() {
  const db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role;');
  await db.exec(await readFile(new URL('../../supabase/migrations/20260904000000_trade_lab.sql', import.meta.url), 'utf8'));
  await db.query('insert into trade_runtime(account_key,broker,paused) values($1,$2,false)', [key, 'simulated']);
  await db.query("insert into trade_strategies(id,account_key,version,status,strategy_definition,created_by,change_summary) values($1,$2,1,'current',$3,'system','Baseline')", [strategyId, key, JSON.stringify(snapshot().strategy.strategy_definition)]);
  const proposal = { action: 'BUY', symbol: 'SPY', quantity: null, notional: 25, order_type: 'MARKET', limit_price: null, stop_loss: 640, take_profit: 670, confidence: 0.6, thesis: 'Test', signals: [], invalidation_conditions: [] };
  await db.query("insert into trade_agent_decisions(id,account_key,strategy_id,strategy_version,symbol,action,confidence,reasoning_summary,market_context,raw_agent_output,proposal,risk_result,model,prompt_version,source) values($1,$2,$3,1,'SPY','BUY',0.6,'Test',$4,$5,$5,$6,'fixture','trader-v1','deterministic_simulator')", [decisionId, key, strategyId, JSON.stringify(snapshot()), JSON.stringify(proposal), JSON.stringify({ allowed: true })]);
  await db.query("insert into trade_orders(id,account_key,decision_id,client_order_id,symbol,side,quantity,order_type,limit_price,status,request,preview,approval_hash,approval_expires_at) values($1,$2,$3,'buy-1','SPY','BUY',1,'LIMIT',100,'pending_approval',$4,$5,'exact-hash',now()+interval '60 seconds')", [orderId, key, decisionId, JSON.stringify({ ...buy(), clientOrderId: 'buy-1', quantity: 1, notional: null, orderType: 'LIMIT', limitPrice: 100 }), JSON.stringify({ accepted: true })]);
  return db;
}

test('migration isolates financial tables from browser roles and preserves immutable evidence', async () => {
  const db = await database();
  try {
    await assert.rejects(db.query('update trade_agent_decisions set confidence=1 where id=$1', [decisionId]), /append-only/);
    await assert.rejects(db.query("update trade_strategies set strategy_definition='{}' where id=$1", [strategyId]), /new strategy/);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query('select * from trade_orders'), /permission denied/);
      await assert.rejects(db.query('select trade_acquire_lock($1,$2)', [key, token]), /permission denied/);
      await db.exec('reset role');
    }
    const rls = await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where relname like 'trade_%' and relkind='r'");
    assert.ok(rls.rows.length >= 12); assert.ok(rls.rows.every(r => r.relrowsecurity));
  } finally { await db.close(); }
});

test('database grants only one account lease and consumes an exact approval once', async () => {
  const db = await database();
  try {
    assert.equal((await db.query<{ acquired: boolean }>('select trade_acquire_lock($1,$2) as acquired', [key, token])).rows[0].acquired, true);
    assert.equal((await db.query<{ acquired: boolean }>('select trade_acquire_lock($1,$2) as acquired', [key, actorId])).rows[0].acquired, false);
    await assert.rejects(db.query('select trade_begin_order($1,$2,$3,$4,$5)', [key, token, orderId, 'tampered-hash', actorId]), /expired or changed/);
    await db.query('select trade_begin_order($1,$2,$3,$4,$5)', [key, token, orderId, 'exact-hash', actorId]);
    await assert.rejects(db.query('select trade_begin_order($1,$2,$3,$4,$5)', [key, token, orderId, 'exact-hash', actorId]), /already been processed/);
    assert.equal((await db.query<{ n: number }>('select count(*)::int as n from trade_order_approvals')).rows[0].n, 1);
    await db.query('select trade_release_lock($1,$2)', [key, actorId]);
    assert.equal((await db.query<{ acquired: boolean }>('select trade_acquire_lock($1,$2) as acquired', [key, actorId])).rows[0].acquired, false);
  } finally { await db.close(); }
});

test('expired approvals, paused entries and expired leases are refused by the database', async () => {
  const db = await database();
  try {
    await db.query('select trade_acquire_lock($1,$2)', [key, token]);
    await db.exec("update trade_orders set approval_expires_at=now()-interval '1 second'");
    await assert.rejects(db.query('select trade_begin_order($1,$2,$3,$4,$5)', [key, token, orderId, 'exact-hash', actorId]), /expired/);
    await db.exec("update trade_orders set approval_expires_at=now()+interval '60 seconds';update trade_runtime set paused=true");
    await assert.rejects(db.query('select trade_begin_order($1,$2,$3,$4,$5)', [key, token, orderId, 'exact-hash', actorId]), /paused/);
    await db.exec("update trade_runtime set paused=false,lock_until=now()-interval '1 second'");
    await assert.rejects(db.query('select trade_begin_order($1,$2,$3,$4,$5)', [key, token, orderId, 'exact-hash', actorId]), /lock expired/);
  } finally { await db.close(); }
});

test('partial fills reconcile once, partial exits split FIFO lots, and bad broker data rolls back', async () => {
  const db = await database();
  try {
    await db.query('select trade_acquire_lock($1,$2)', [key, token]);
    await db.query('select trade_begin_order($1,$2,$3,$4,$5)', [key, token, orderId, 'exact-hash', actorId]);
    const base = { ...buy(), clientOrderId: 'buy-1', id: 'broker-buy', quantity: 1, notional: null, orderType: 'LIMIT', limitPrice: 100, status: 'partial', filledQuantity: 0.4, averageFillPrice: 100, filledNotional: 40, fees: 0.04, submittedAt: NOW.toISOString(), filledAt: NOW.toISOString() };
    const reconcile = (id: string, result: object) => db.query('select trade_reconcile_order($1,$2,$3,$4)', [key, token, id, JSON.stringify(result)]);
    await reconcile(orderId, base); await reconcile(orderId, base);
    assert.equal((await db.query<{ n: number }>('select count(*)::int as n from trade_fills')).rows[0].n, 1);
    await reconcile(orderId, { ...base, status: 'filled', filledQuantity: 1, filledNotional: 100, fees: 0.1 });
    assert.equal((await db.query<{ n: number }>('select count(*)::int as n from trade_fills')).rows[0].n, 2);
    await assert.rejects(reconcile(orderId, { ...base, clientOrderId: 'someone-elses-order' }), /identity mismatch/);
    await assert.rejects(reconcile(orderId, base), /regressed/);
    const sellId = '66666666-6666-4666-8666-666666666666';
    const sellDecision = '77777777-7777-4777-8777-777777777777';
    await db.query("insert into trade_agent_decisions select $1,account_key,strategy_id,strategy_version,now(),symbol,'SELL',entry_price,stop_loss,take_profit,position_size,confidence,reasoning_summary,market_context,raw_agent_output,proposal,risk_result,model,prompt_version,source from trade_agent_decisions where id=$2", [sellDecision, decisionId]);
    await db.query("insert into trade_orders(id,account_key,decision_id,client_order_id,symbol,side,quantity,order_type,status,request,preview,approval_hash,approval_expires_at) values($1,$2,$3,'sell-1','SPY','SELL',0.5,'MARKET','submitted','{}','{}','sell-hash',now())", [sellId, key, sellDecision]);
    const sell = { ...base, id: 'broker-sell', clientOrderId: 'sell-1', side: 'SELL', status: 'filled', orderType: 'MARKET', limitPrice: null, quantity: 0.5, filledQuantity: 0.5, averageFillPrice: 110, filledNotional: 55, fees: 0.05 };
    await reconcile(sellId, sell); await reconcile(sellId, sell);
    const metrics = (await db.query<{ remaining: string; sold: string; pnl: string }>("select sum(quantity) filter(where exit_time is null) as remaining,sum(quantity) filter(where exit_time is not null) as sold,sum(realized_pnl) as pnl from trade_trades")).rows[0];
    assert.equal(Number(metrics.remaining), 0.5); assert.equal(Number(metrics.sold), 0.5); assert.equal(Number(metrics.pnl), 4.9);
    await assert.rejects(reconcile(sellId, { ...sell, filledQuantity: 2, filledNotional: 220 }), /approved quantity/);
    assert.equal(Number((await db.query<{ filled_quantity: string }>('select filled_quantity from trade_orders where id=$1', [sellId])).rows[0].filled_quantity), 0.5);
    await reconcile(orderId, { ...base, status: 'filled', filledQuantity: 1, filledNotional: 100, fees: 0.2, feesFinal: true });
    await reconcile(sellId, { ...sell, fees: 0.1, feesFinal: true });
    await reconcile(sellId, { ...sell, fees: 0.1, feesFinal: true });
    assert.equal(Number((await db.query<{ pnl: string }>('select sum(realized_pnl) as pnl from trade_trades')).rows[0].pnl), 4.8);
    assert.equal((await db.query<{ n: number }>('select count(*)::int as n from trade_fills')).rows[0].n, 3);
    assert.equal((await db.query<{ n: number }>("select count(*)::int as n from trade_system_events where kind='fee_settlement'")).rows[0].n, 2);
  } finally { await db.close(); }
});

test('shared request quotas are enforced in PostgreSQL', async () => {
  const db = await database();
  try {
    for (const expected of [true, true, false]) assert.equal((await db.query<{ ok: boolean }>('select trade_rate_limit($1,2,60) as ok', ['test'])).rows[0].ok, expected);
  } finally { await db.close(); }
});
