import type { Account, Bar, BrokerKind, BrokerOrder, Capabilities, OrderRequest, Position, Preview, Quote } from '../types';

export interface PaperBroker {
  readonly kind: BrokerKind;
  readonly accountId: string;
  listAccounts(): Promise<{ id: string; type: string }[]>;
  getAccount(): Promise<Account>;
  getPositions(): Promise<Position[]>;
  getQuote(symbol: string): Promise<Quote>;
  getBars(symbol: string, timeframe: '15m', start: string, end: string): Promise<Bar[]>;
  getCapabilities(symbol: string): Promise<Capabilities>;
  getOrders(): Promise<BrokerOrder[]>;
  getHistory(start: string, end: string): Promise<BrokerOrder[]>;
  getOrder(clientOrderId: string): Promise<BrokerOrder>;
  previewOrder(order: OrderRequest): Promise<Preview>;
  placeOrder(order: OrderRequest): Promise<BrokerOrder>;
  cancelOrder(clientOrderId: string): Promise<void>;
}
