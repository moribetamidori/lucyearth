import assert from 'node:assert/strict';
import test from 'node:test';
import { signature } from '../../lib/trade/broker/signature';
import { SimulatedBroker } from '../../lib/trade/broker/simulated';
import { calculateFeatures, closedBars } from '../../lib/trade/market/features';
import type { BrokerOrder } from '../../lib/trade/types';
import { NOW, buy } from './fixtures';

test('request signer matches Webull’s public documentation test vector', () => {
  // Public, fictional example values from the official Signature page; not credentials.
  const result = signature({ path: '/trade/place_order', query: { a1: 'webull', a2: '123', a3: 'xxx', q1: 'yyy' },
    body: JSON.stringify({ k1: 123, k2: 'this is the api request body', k3: true, k4: { foo: [1, 2] } }),
    appKey: '776da210ab4a452795d74e726ebd74b6', appSecret: '0f50a2e853334a9aae1a783bee120c1f',
    host: 'api.webull.com', timestamp: '2022-01-04T03:55:31Z', nonce: '48ef5afed43d4d91ae514aaeafbc29ba' });
  assert.equal(result, 'kvlS6opdZDhEBo5jq40nHYXaLvM=');
});
test('simulation previews do not place orders; placement/readback is idempotent and includes fees', async () => {
  const ledger = new Map<string, BrokerOrder>();
  const broker = new SimulatedBroker({ list: async () => [...ledger.values()], save: async order => { ledger.set(order.clientOrderId, order); } }, () => NOW);
  const order = buy();
  const preview = await broker.previewOrder(order);
  assert.equal(preview.source, 'simulated'); assert.equal(ledger.size, 0);
  const fill = await broker.placeOrder(order);
  assert.equal(fill.status, 'filled'); assert.ok(fill.filledNotional! <= 25); assert.ok(fill.fees > 0);
  assert.deepEqual(await broker.placeOrder(order), fill);
  assert.deepEqual(await broker.getOrder(order.clientOrderId), fill); assert.equal(ledger.size, 1);
  const account = await broker.getAccount();
  assert.ok(account.cash < 10000); assert.equal((await broker.getPositions()).length, 1);
  await assert.rejects(() => broker.cancelOrder(order.clientOrderId), /filled/);
});
test('unfilled simulated limit orders remain open and can be cancelled', async () => {
  const ledger = new Map<string, BrokerOrder>();
  const broker = new SimulatedBroker({ list: async () => [...ledger.values()], save: async order => { ledger.set(order.clientOrderId, order); } }, () => NOW);
  const request = { ...buy(), notional: null, quantity: 1, orderType: 'LIMIT' as const, limitPrice: 1 };
  assert.equal((await broker.placeOrder(request)).status, 'submitted');
  await broker.cancelOrder(request.clientOrderId);
  assert.equal((await broker.getOrder(request.clientOrderId)).status, 'cancelled');
  assert.equal((await broker.getAccount()).equity, 10000);
});
test('indicators use closed bars only, have a warmup, and do not change when future bars are appended', async () => {
  const broker = new SimulatedBroker({ list: async () => [], save: async () => {} }, () => NOW);
  const bars = await broker.getBars('SPY', '15m', new Date(NOW.getTime() - 100 * 900000).toISOString(), NOW.toISOString());
  const original = calculateFeatures(closedBars(bars, NOW.toISOString()));
  const future = { timestamp: NOW.toISOString(), open: 9999, high: 10000, low: 9998, close: 10000, volume: 1000000000 };
  assert.deepEqual(calculateFeatures(closedBars([...bars, future], NOW.toISOString())), original);
  assert.throws(() => calculateFeatures(bars.slice(0, 59)), /60/);
  assert.throws(() => closedBars([...bars, bars[0]], NOW.toISOString()), /Duplicate/);
  assert.throws(() => closedBars([{ ...future, low: 20000 }], NOW.toISOString()), /Invalid/);
});
