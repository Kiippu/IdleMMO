// Loads the legacy data.js + engine.js into a Node vm context with an injected
// window, a seeded RNG for Math.random (mulberry32), a fake clock for Date.now and an
// in-memory localStorage. Local-time maths in the engine use the process TZ, which is
// pinned to UTC here so fixtures are machine independent.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

process.env.TZ = 'UTC';
const here = dirname(fileURLToPath(import.meta.url));

export const DEFAULT_START = Date.UTC(2026, 10, 2, 9, 0, 0); // Monday 2 Nov 2026 09:00 UTC

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: (k) => { m.delete(String(k)); },
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

export function loadLegacy({ seed = 1, start = DEFAULT_START, silent = true } = {}) {
  const rng = mulberry32(seed);
  let now = start;
  const sandbox = {
    console: silent ? { log() {}, warn() {}, error() {} } : console,
    localStorage: memoryStorage(),
    __rng: () => rng(),
    __now: () => now,
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext('Math.random = __rng; Date.now = __now;', ctx);
  for (const f of ['data.js', 'engine.js']) {
    vm.runInContext(readFileSync(resolve(here, f), 'utf8'), ctx, { filename: `legacy/${f}` });
  }
  return {
    GW: sandbox.GW,
    context: ctx,
    localStorage: sandbox.localStorage,
    setTime: (ms) => { now = ms; },
    advance: (ms) => { now += ms; },
    now: () => now,
    // JSON round trip inside the vm so results are plain objects of this realm
    snap: (v) => JSON.parse(vm.runInContext('JSON.stringify', ctx)(v) ?? 'null'),
  };
}
