// One-shot v4 import: if IDB has nothing under the engine's save key and the old
// prototype still has a blob in localStorage, hand it to the facade and clear
// the legacy slot. The engine's migrate() handles the v4 → v5 upgrade on load.
import type { SaveStorage } from '@guildwright/engine';

export function importLegacyLocalStorage(storage: SaveStorage, key: string): boolean {
  if (storage.getItem(key) != null) return false;
  if (typeof localStorage === 'undefined') return false;
  let raw: string | null;
  try { raw = localStorage.getItem(key); } catch { return false; }
  if (!raw) return false;
  storage.setItem(key, raw);
  try { localStorage.removeItem(key); } catch { /* ignore */ }
  return true;
}
