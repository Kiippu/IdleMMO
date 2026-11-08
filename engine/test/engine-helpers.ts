// Shared test helpers: a fresh engine on a seeded RNG and a movable fake clock.
// Raids resolve only on the game clock now (no startRaidNow), so tests move the injected
// clock into the raid window and tick once.
import { vi } from 'vitest';

export const START = Date.UTC(2026, 10, 2, 9, 0, 0); // Mon 2 Nov 2026 09:00 UTC
export const DAY = 86400000;

export async function freshEngine(seed = 1, start = START) {
  vi.resetModules();
  const mod = await import('../src/index');
  let now = start;
  const storage = mod.memoryStorage();
  const E = mod.createEngine({ rng: mod.mulberry32(seed), now: () => now, storage, data: mod.DATA });
  return {
    E, mod, storage,
    now: () => now,
    setNow: (t: number) => { now = t; },
    advance: (ms: number) => { now += ms; },
  };
}

/** Move the clock to just after this week's raid window opens and tick, so processClock resolves it. */
export function resolveRaidByClock(h: { E: any; setNow: (t: number) => void }, s: any) {
  const w = h.E.raidWindow(s);
  h.setNow(w.start + 60000);
  const events = h.E.tick(s, 1);
  return { events, recap: h.E.lastRecap(s) };
}

export const invTotal = (m: any, id: string) => ((m && m[id]) || []).reduce((a: number, b: number) => a + (b > 0 ? b : 0), 0);
