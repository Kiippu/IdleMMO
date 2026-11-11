// One-shot v4 import: if IDB has nothing under the engine's save key and the old
// prototype still has a blob in localStorage, hand it to the facade. localStorage does not exist in a
// Web Worker, so the MAIN thread reads the blob (readLegacySave) and passes it to the worker's init;
// the main thread clears the legacy slot once the worker reports it was imported.
// The engine's migrate() handles the v4 -> v5 -> v6 upgrade on load.
import type { SaveStorage } from '@guildwright/engine';

export const SAVE_KEY = 'guildwright-proto-v1';

/** Main thread only: the legacy localStorage blob, or null. */
export function readLegacySave(key: string = SAVE_KEY): string | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage.getItem(key); } catch { return null; }
}
export function clearLegacySave(key: string = SAVE_KEY): void {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

/** Copy `raw` into the facade when nothing is stored under `key` yet. Returns true when it imported. */
export function importLegacyLocalStorage(storage: SaveStorage, key: string, raw: string | null | undefined): boolean {
  if (!raw) return false;
  if (storage.getItem(key) != null) return false;
  storage.setItem(key, raw);
  return true;
}
