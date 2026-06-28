import type { TradeFullSnapshot } from './tradeSnapshot';
import { isWebPlatform } from '../utils/isWebPlatform';

const DB_NAME = 'tradescore-persist-v1';
const DB_VERSION = 2;
const STORE = 'kv';
const SNAPSHOT_KEY = 'full-snapshot';

function isWeb(): boolean {
  return isWebPlatform() && typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
      if (!db.objectStoreNames.contains('handles')) {
        db.createObjectStore('handles');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

function idbGet(db: IDBDatabase, key: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

function idbSet(db: IDBDatabase, key: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Mirror snapshot vào IndexedDB — bền hơn localStorage trên cùng origin. */
export async function saveSnapshotToIndexedDb(snapshot: TradeFullSnapshot): Promise<void> {
  if (!isWeb()) return;
  try {
    const db = await openDb();
    await idbSet(db, SNAPSHOT_KEY, JSON.stringify(snapshot));
    db.close();
  } catch {
    // quota / private mode
  }
}

export async function loadSnapshotFromIndexedDb(): Promise<TradeFullSnapshot | null> {
  if (!isWeb()) return null;
  try {
    const db = await openDb();
    const raw = await idbGet(db, SNAPSHOT_KEY);
    db.close();
    if (!raw) return null;
    return JSON.parse(raw) as TradeFullSnapshot;
  } catch {
    return null;
  }
}
