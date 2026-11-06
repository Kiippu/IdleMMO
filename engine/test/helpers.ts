// Shared helpers: a fresh TS engine per run (fresh module instances so module-level
// caches start cold, like a fresh page load), plus a JSON diff that names the first mismatch.
import { vi } from 'vitest';

export const DEFAULT_START = Date.UTC(2026, 10, 2, 9, 0, 0); // Monday 2 Nov 2026 09:00 UTC

export async function freshEngine(seed: number, start = DEFAULT_START) {
  vi.resetModules();
  const mod = await import('../src/index');
  let now = start;
  const storage = mod.memoryStorage();
  const E = mod.createEngine({ rng: mod.mulberry32(seed), now: () => now, storage, data: mod.DATA });
  return { E, mod, storage, now: () => now, advance: (ms: number) => { now += ms; }, setTime: (ms: number) => { now = ms; } };
}

// Matches the legacy recorder's `snap` (engine/scripts/record-fixtures.mjs): undefined
// results normalize to null, so result-less steps round-trip to `result: null` in both
// got/want. Without this, parity.test fails with "$.result: undefined !== null".
export const snapResult = (v: unknown) => JSON.parse(JSON.stringify(v) ?? 'null');
// State uses the opposite rule: scenarios pass `{ result: ... }` with no `state`, and the
// recorder keeps that key off the output. Mirror that so undefined state stays undefined.
export const snapState = (v: unknown) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v) ?? 'null'));
// Kept for any legacy call sites: same behaviour as the old state-shaped helper.
export const jsonRound = snapState;

/** First differing path between two JSON values, or null when equal. */
export function firstDiff(a: any, b: any, path = '$'): string | null {
  if (a === b) return null;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return `${path}: ${JSON.stringify(a)?.slice(0, 200)} !== ${JSON.stringify(b)?.slice(0, 200)}`;
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: array vs object`;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return `${path}.length: ${a.length} !== ${b.length}`;
    for (let i = 0; i < a.length; i++) { const d = firstDiff(a[i], b[i], `${path}[${i}]`); if (d) return d; }
    return null;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) { const d = firstDiff(a[k], b[k], `${path}.${k}`); if (d) return d; }
  return null;
}
