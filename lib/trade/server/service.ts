import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import type { PaperBroker } from '../broker/interface';
import { assertPaperMode } from '../config';
import { closedBars, calculateFeatures } from '../market/features';
import { loadRiskPolicy, POLICY_VERSION, validateOrder } from '../risk/policy';
import { proposalSchema, type BrokerOrder, type Decision, type OrderRequest, type Preview, type Snapshot, type StoredOrder } from '../types';
import { simulatedBaseline } from '../agents/trader';
import { llmProvider } from '../llm';
import { TRADER_PROMPT_VERSION } from '../llm/provider';
import type { TradeStore } from './store';

export type TradingStore = Pick<TradeStore, 'key' | 'strategy' | 'runtime' | 'activeOrders' | 'reconcilableOrders' | 'recordedQuantity' | 'saveSnapshot' | 'withLock' | 'startJob' | 'finishJob' | 'countToday' | 'assertLock' | 'recordDecision' | 'event' | 'decision' | 'order' | 'expirePreviews' | 'recordOrder' | 'beginOrder' | 'reconcile' | 'updateOrder'>;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export function approvalHash(accountKey: string, decision: Decision, order: OrderRequest, preview: Preview, expires: string) {
  // JSONB reorders keys, and timestamptz may return +00:00 instead of Z.
  // Semantically identical persisted terms must hash identically.
  return createHash('sha256').update(JSON.stringify(canonical({ accountKey, decisionId: decision.id, strategyId: decision.strategy_id, order, preview, expires: new Date(expires).toISOString(), risk: loadRiskPolicy() }))).digest('hex');
}
export function requestForDecision(decision: Pick<Decision, 'proposal'>, clientOrderId: string): OrderRequest {
  const p = proposalSchema.parse(decision.proposal);
  if (p.action !== 'BUY' && p.action !== 'SELL' || !p.order_type) throw new Error('This decision does not propose an order.');
  return { clientOrderId, symbol: p.symbol, side: p.action, quantity: p.quantity, notional: p.notional, orderType: p.order_type, limitPrice: p.limit_price };
}
function localBrokerOrder(order: StoredOrder): BrokerOrder {
  return { ...order.request, id: order.broker_order_id ?? order.client_order_id, status: order.status, filledQuantity: Number(order.filled_quantity), filledNotional: Number(order.filled_notional), averageFillPrice: order.fill_price === null ? null : Number(order.fill_price), fees: Number(order.fees), submittedAt: order.submitted_at, filledAt: order.filled_at };
}

export class TradingService {
  constructor(readonly store: TradingStore, readonly broker: PaperBroker, private readonly clock = () => new Date()) {}
  async snapshot(symbol: string): Promise<Snapshot> {
    const strategy = await this.store.strategy();
    if (!strategy.strategy_definition.universe.includes(symbol as 'SPY' | 'QQQ')) throw new Error('Symbol is outside the current strategy universe.');
    const account = await this.broker.getAccount();
    const [positions, quote, openOrders, capabilities, local] = await Promise.all([
      this.broker.getPositions(), this.broker.getQuote(symbol), this.broker.getOrders(), this.broker.getCapabilities(symbol), this.store.activeOrders(),
    ]);
    const cutoff = quote.asOf;
    const bars = closedBars(await this.broker.getBars(symbol, '15m', new Date(Date.parse(cutoff) - 14 * 86400000).toISOString(), cutoff), cutoff);
    const known = new Map(openOrders.map(o => [o.clientOrderId, o]));
    for (const order of local) {
      // A locally uncertain result must not disappear just because it isn't on the open-orders page.
      if (['unknown', 'submitting'].includes(order.status) || !known.has(order.client_order_id)) known.set(order.client_order_id, localBrokerOrder(order));
    }
    const snapshot: Snapshot = { timestamp: this.clock().toISOString(), broker: this.broker.kind, account, positions, openOrders: [...known.values()], quote, bars, capabilities, strategy, features: calculateFeatures(bars), featureVersion: 'features-v1', promptVersion: TRADER_PROMPT_VERSION, riskPolicyVersion: POLICY_VERSION };
    await this.store.saveSnapshot(snapshot);
    return snapshot;
  }
  async runTrader(symbol: string, engine: 'llm' | 'baseline', actor: string) {
    return this.store.withLock(async token => {
      const job = await this.store.startJob('runTrader', actor);
      try {
        const snapshot = await this.snapshot(symbol);
        const provider = engine === 'llm' ? llmProvider() : null;
        const output = provider ? await provider.generateStructured(snapshot) : { proposal: simulatedBaseline(snapshot), raw: null };
        const proposal = proposalSchema.parse(output.proposal);
        if (proposal.symbol !== symbol) throw new Error('The model returned a symbol outside this evaluation.');
        const state = await this.store.runtime();
        const trading = proposal.action === 'BUY' || proposal.action === 'SELL';
        const risk = trading ? validateOrder(requestForDecision({ proposal }, 'evaluation'), snapshot, { paused: state.paused, submittedToday: await this.store.countToday(this.clock()) }, loadRiskPolicy(), this.clock()) : { allowed: false, reasons: [], notional: 0, policyVersion: POLICY_VERSION };
        await this.store.assertLock(token);
        const decision = await this.store.recordDecision({
          account_key: this.store.key, strategy_id: snapshot.strategy.id, strategy_version: snapshot.strategy.version,
          timestamp: snapshot.timestamp, symbol, action: proposal.action, confidence: proposal.confidence,
          reasoning_summary: proposal.thesis, market_context: snapshot, raw_agent_output: output.raw ?? proposal,
          proposal, risk_result: risk, model: provider ? `${provider.name}/${provider.model}` : 'deterministic-synthetic-baseline',
          prompt_version: TRADER_PROMPT_VERSION, source: provider ? 'llm' : 'deterministic_simulator',
        });
        await this.store.event(trading && !risk.allowed ? 'risk_block' : 'decision', trading && !risk.allowed ? 'Order proposal blocked by immutable risk policy' : `${proposal.action} decision recorded`, { decisionId: decision.id, reasons: risk.reasons });
        await this.store.finishJob(job, true);
        return decision;
      } catch (error) { await this.store.finishJob(job, false); await this.store.event('agent_error', 'Market evaluation failed; no order submitted'); throw error; }
    });
  }
  private async checkedSnapshot(order: OrderRequest) {
    const snapshot = await this.snapshot(order.symbol);
    const runtime = await this.store.runtime();
    const risk = validateOrder(order, snapshot, { paused: runtime.paused, submittedToday: await this.store.countToday(this.clock()) }, loadRiskPolicy(), this.clock());
    if (order.side === 'SELL' && (order.quantity ?? Infinity) > await this.store.recordedQuantity(order.symbol) + 1e-9) {
      risk.allowed = false; risk.reasons.push('V1 can only sell quantities attributable to recorded lab entry lots.');
    }
    if (!risk.allowed) {
      await this.store.event('risk_block', 'Pre-submission risk validation blocked the order', { clientOrderId: order.clientOrderId, reasons: risk.reasons });
      throw new Error(risk.reasons.join(' '));
    }
    return snapshot;
  }
  private async checkPreview(preview: Preview, snapshot: Snapshot, order: OrderRequest) {
    if (!preview.accepted || preview.source !== this.broker.kind || !Number.isFinite(preview.estimatedNotional) || preview.estimatedNotional <= 0 || !Number.isFinite(preview.estimatedFees) || preview.estimatedFees < 0) throw new Error('The broker did not return a valid accepted preview.');
    if (preview.estimatedNotional > loadRiskPolicy().maxOrderNotional) throw new Error('Broker preview exceeds the maximum order notional.');
    if (order.notional !== null && Math.abs(preview.estimatedNotional - order.notional) > preview.estimatedFees + 0.02) throw new Error('Broker preview did not confirm the exact cash-notional order. Submission is blocked.');
    if (order.side === 'BUY' && preview.estimatedNotional + preview.estimatedFees > Math.min(snapshot.account.cash, snapshot.account.buyingPower)) throw new Error('Broker preview including fees exceeds available cash.');
    const risk = validateOrder(order, { ...snapshot, account: { ...snapshot.account, cash: snapshot.account.cash - preview.estimatedFees, buyingPower: snapshot.account.buyingPower - preview.estimatedFees } }, { paused: (await this.store.runtime()).paused, submittedToday: await this.store.countToday(this.clock()) }, loadRiskPolicy(), this.clock());
    if (!risk.allowed) throw new Error(risk.reasons.join(' '));
  }
  async previewDecision(id: string) {
    return this.store.withLock(async token => {
      const decision = await this.store.decision(id);
      if (!decision.risk_result.allowed) throw new Error('This decision was blocked or abstained. Run a new market evaluation.');
      if (this.clock().getTime() - Date.parse(decision.timestamp) > 15 * 60000) throw new Error('Decision is older than 15 minutes. Run a fresh evaluation.');
      const order = requestForDecision(decision, randomUUID().replaceAll('-', ''));
      const snapshot = await this.checkedSnapshot(order);
      if (snapshot.strategy.id !== decision.strategy_id) throw new Error('The current strategy changed. Run a fresh evaluation.');
      const preview = await this.broker.previewOrder(order);
      await this.checkPreview(preview, snapshot, order);
      const expiry = new Date(this.clock().getTime() + 60000).toISOString();
      const hash = approvalHash(this.store.key, decision, order, preview, expiry);
      await this.store.assertLock(token);
      await this.store.expirePreviews(decision.id);
      const result = await this.store.recordOrder({ account_key: this.store.key, decision_id: decision.id, client_order_id: order.clientOrderId, symbol: order.symbol, side: order.side, quantity: order.quantity, notional: order.notional, order_type: order.orderType, limit_price: order.limitPrice, status: 'pending_approval', request: order, preview, approval_hash: hash, approval_expires_at: expiry });
      await this.store.event('order_preview', 'Paper order preview ready for a single human approval', { orderId: result.id, expiresAt: expiry });
      return result;
    });
  }
  async approveOrder(id: string, hash: string, actor: string) {
    assertPaperMode();
    return this.store.withLock(async token => {
      const order = await this.store.order(id);
      const decision = await this.store.decision(order.decision_id);
      if (order.status !== 'pending_approval' || Date.parse(order.approval_expires_at) <= this.clock().getTime()) throw new Error('Approval is expired or already used. Request another preview.');
      if (hash !== order.approval_hash || approvalHash(this.store.key, decision, order.request, order.preview, order.approval_expires_at) !== hash) throw new Error('The approved order or risk configuration changed. Request another preview.');
      const snapshot = await this.checkedSnapshot(order.request);
      const preview = await this.broker.previewOrder(order.request);
      await this.checkPreview(preview, snapshot, order.request);
      if (preview.estimatedFees > order.preview.estimatedFees + 0.01) throw new Error('Estimated fees increased. Request another preview.');
      await this.store.beginOrder(id, hash, actor, token);
      try {
        await this.broker.placeOrder(order.request);
        const confirmed = await this.broker.getOrder(order.client_order_id);
        await this.store.reconcile(id, confirmed, token);
      } catch {
        await this.store.updateOrder(id, { status: 'unknown' });
        await this.store.event('order_unknown', 'Submission or reconciliation did not complete. New orders are blocked until reconciliation.', { orderId: id });
        throw new Error('Order outcome requires reconciliation. Do not submit a replacement order.');
      }
      await this.store.event('order_submitted', 'Approved paper order read back from broker', { orderId: id });
      return this.store.order(id);
    });
  }
  async reconcileOrders() {
    return this.store.withLock(async token => {
      let confirmed = 0;
      for (const order of await this.store.reconcilableOrders()) {
        try { await this.store.reconcile(order.id, await this.broker.getOrder(order.client_order_id), token); confirmed++; }
        catch { await this.store.event('reconciliation_pending', 'Broker order still needs reconciliation', { orderId: order.id }); }
      }
      await this.store.event('reconciliation', 'Paper order reconciliation completed', { confirmed });
      return { confirmed };
    });
  }
  async cancelOrder(id: string) {
    return this.store.withLock(async token => {
      const order = await this.store.order(id);
      if (order.status === 'pending_approval') { await this.store.updateOrder(id, { status: 'cancelled' }); return; }
      if (!['submitted', 'partial', 'unknown'].includes(order.status)) throw new Error('Order cannot be cancelled in its current state.');
      try {
        await this.broker.cancelOrder(order.client_order_id);
        await this.store.reconcile(id, await this.broker.getOrder(order.client_order_id), token);
      } catch { await this.store.updateOrder(id, { status: 'unknown' }); throw new Error('Cancellation outcome is uncertain. Reconcile before another order.'); }
      await this.store.event('order_cancel', 'Cancellation checked with paper broker', { orderId: id });
    });
  }
}
