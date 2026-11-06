// The one place the engine touches the outside world. Everything that was a browser
// global in the prototype (Math.random, Date.now, localStorage, window.GW.DATA) is
// injected here, so the rules are deterministic under a seeded RNG and a fake clock.
import { DATA } from './data';

/** Key/value store for saves. localStorage satisfies it; so does an in-memory Map wrapper. */
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface EngineContext {
  /** Uniform random in [0, 1). The call ORDER is part of the rules: fixtures depend on it. */
  rng: () => number;
  /** Wall clock in ms since the epoch (what Date.now() was). */
  now: () => number;
  /** Save storage, or null for no persistence (load() then returns null). */
  storage: SaveStorage | null;
  /** Static game content (was window.GW.DATA). Read at call time, so it can be swapped. */
  data: any;
}

const unset = (what: string) => () => { throw new Error(`Guildwright engine: ${what} not configured; call createEngine({ ${what} })`); };

/** The live context. Module-level: one engine per JS realm (see PORTING.md). */
export const ctx: EngineContext = { rng: unset('rng'), now: unset('now'), storage: null, data: DATA };

export function configure(opts: Partial<EngineContext>): EngineContext {
  if (opts.rng) ctx.rng = opts.rng;
  if (opts.now) ctx.now = opts.now;
  if ('storage' in opts) ctx.storage = opts.storage ?? null;
  if ('data' in opts) ctx.data = opts.data;
  return ctx;
}

/** mulberry32: the seeded RNG used by the fixtures and tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function memoryStorage(): SaveStorage & { clear(): void } {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(String(k)) ? m.get(String(k))! : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: (k) => { m.delete(String(k)); },
    clear: () => m.clear(),
  };
}
