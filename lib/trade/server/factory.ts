import 'server-only';
import { createHash } from 'node:crypto';
import { tradingConfig } from '../config';
import { SimulatedBroker } from '../broker/simulated';
import { WebullPaperBroker } from '../broker/webull_paper';
import { TradeStore } from './store';
import { dbError } from './db';
import type { BrokerOrder } from '../types';

export function tradingServices() {
  const config = tradingConfig();
  const store = new TradeStore(`${config.broker}:${config.accountId || 'setup'}`, config.broker);
  const broker = config.broker === 'simulated' ? new SimulatedBroker({
    list: async () => {
      const r = await store.db.from('trade_simulated_orders').select('payload').eq('account_key', store.key); dbError(r.error);
      return r.data!.map(o => o.payload as BrokerOrder);
    },
    save: async order => { dbError((await store.db.from('trade_simulated_orders').upsert({ account_key: store.key, client_order_id: order.clientOrderId, payload: order })).error); },
  }) : new WebullPaperBroker(config.accountId, async path => {
    const keyFingerprint = createHash('sha256').update(process.env.WEBULL_PAPER_APP_KEY ?? '').digest('hex').slice(0, 16);
    const r = await store.db.rpc('trade_rate_limit', { p_bucket: `webull:${keyFingerprint}:${path}`, p_limit: 25, p_seconds: 60 }); dbError(r.error);
    if (!r.data) throw new Error('Sandbox rate limit reached. Wait one minute before retrying.');
  }, async (path, status) => store.event('webull_request', 'Webull sandbox response', { path, status }));
  return { config, store, broker };
}
