import type { LaurieChartSeries } from './types';

const DATABASE = 'laurie-chart-cache-v1';
const STORE = 'series';
const LIMIT = 20_000;

function openCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readChartCache(key: string): Promise<LaurieChartSeries | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const db = await openCache();
    const result = await new Promise<LaurieChartSeries | null>((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return result;
  } catch { return null; }
}

export async function writeChartCache(key: string, series: LaurieChartSeries): Promise<void> {
  if (typeof indexedDB === 'undefined' || series.dataSource !== 'webull_sandbox') return;
  try {
    const db = await openCache();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put({ ...series, candles: series.candles.slice(-LIMIT) }, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  } catch { /* IndexedDB is an optional speed layer. */ }
}
