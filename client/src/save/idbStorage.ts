// Sync SaveStorage facade over IndexedDB.
// The engine's SaveStorage is sync (localStorage-shaped); IDB is async. We hydrate
// known keys into an in-memory cache up front, serve getItem/setItem/removeItem
// from the cache, and flush writes to IDB on a short debounce.
import type { SaveStorage } from '@guildwright/engine';
import { idbDelete, idbGet, idbSet } from './idb';

const DEBOUNCE_MS = 500;

export interface IdbBackedStorage {
  storage: SaveStorage;
  hydrate(keys: string[]): Promise<void>;
  flush(): Promise<void>;
}

export function createIdbStorage(): IdbBackedStorage {
  const cache = new Map<string, string | null>();
  const dirty = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let flushing: Promise<void> | null = null;

  function schedule() {
    if (timer != null) return;
    timer = setTimeout(() => { timer = null; void flush(); }, DEBOUNCE_MS);
  }

  async function flush(): Promise<void> {
    if (flushing) { await flushing; }
    if (dirty.size === 0) return;
    const keys = Array.from(dirty);
    dirty.clear();
    if (timer != null) { clearTimeout(timer); timer = null; }
    flushing = (async () => {
      for (const k of keys) {
        const v = cache.get(k);
        if (v == null) await idbDelete(k);
        else await idbSet(k, v);
      }
    })().finally(() => { flushing = null; });
    await flushing;
  }

  const storage: SaveStorage = {
    getItem(key) { return cache.get(key) ?? null; },
    setItem(key, value) { cache.set(key, value); dirty.add(key); schedule(); },
    removeItem(key) { cache.set(key, null); dirty.add(key); schedule(); },
  };

  return {
    storage,
    async hydrate(keys) {
      for (const k of keys) {
        const v = await idbGet(k);
        if (v != null) cache.set(k, v);
      }
    },
    flush,
  };
}
