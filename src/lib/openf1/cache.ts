/**
 * IndexedDB cache for OpenF1 responses.
 *
 * A session's data never changes once the session is over, so every endpoint
 * response is stored permanently under a "<endpoint>?<query>" key and a session
 * is downloaded exactly once. This is what keeps us inside the rate limit during
 * normal use — after the first load, a replay costs zero requests.
 *
 * All functions degrade to a no-op miss when IndexedDB is unavailable (SSR,
 * private browsing), so the client still works, it just re-fetches.
 */
import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'pit-wall';
const DB_VERSION = 1;
const STORE = 'openf1';

interface CacheEntry {
  key: string;
  /** The parsed JSON array returned by OpenF1. */
  data: unknown;
  storedAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> | null {
  if (typeof indexedDB === 'undefined') return null;
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    },
  });
  return dbPromise;
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await getDb();
    if (!db) return undefined;
    const entry = (await db.get(STORE, key)) as CacheEntry | undefined;
    return entry?.data as T | undefined;
  } catch {
    return undefined; // a broken cache must never break the app
  }
}

export async function cacheSet(key: string, data: unknown): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const entry: CacheEntry = { key, data, storedAt: Date.now() };
    await db.put(STORE, entry);
  } catch {
    // Quota exceeded or store unavailable — losing the cache is survivable.
  }
}

/** Remove every cached entry for one session (used by a "re-download" action). */
export async function cacheClearSession(sessionKey: number): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const keys = (await db.getAllKeys(STORE)) as string[];
    const marker = `session_key=${sessionKey}`;
    await Promise.all(keys.filter((k) => k.includes(marker)).map((k) => db.delete(STORE, k)));
  } catch {
    // ignore
  }
}

export async function cacheHas(key: string): Promise<boolean> {
  return (await cacheGet(key)) !== undefined;
}
