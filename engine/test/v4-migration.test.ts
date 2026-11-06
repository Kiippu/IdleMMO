// Pins the v4 → v5 save migration. Every entry in CLAUDE.md's "settled decisions" that
// changes save shape should add a case here so a real save from the field keeps loading.
import { describe, expect, it, vi } from 'vitest';

const START = Date.UTC(2026, 10, 2, 9, 0, 0); // Mon 2 Nov 2026 09:00 UTC

async function freshEngine(seed = 1, now = START) {
  vi.resetModules();
  const mod = await import('../src/index');
  const storage = mod.memoryStorage();
  const E = mod.createEngine({ rng: mod.mulberry32(seed), now: () => now, storage, data: mod.DATA });
  return { E, mod, storage };
}

// Build a plausible v4 save: start from a fresh (v5) state so every field the migrator
// expects is populated, then stamp v: 4 and re-attach the v4-only fields that phase 1 drops.
function v4SaveFrom(baseV5: any, extra: Record<string, any> = {}) {
  return JSON.parse(JSON.stringify(Object.assign({}, baseV5, { v: 4 }, extra)));
}

describe('v4 → v5 migration', () => {
  it('drops the supply board', async () => {
    const { E } = await freshEngine();
    const base = E.newState();
    const raw = v4SaveFrom(base, {
      supply: { week: base.week, requests: [{ itemId: 'wood', rate: 1.5 }], donated: { wood: 10 }, earned: 42 },
    });
    const out = E.migrate(raw);
    expect(out).not.toBeNull();
    expect(out.v).toBe(5);
    expect(out.supply).toBeUndefined();
  });

  it('preserves player gold, hp, skills, inv, gear, equipped, crew, clock, server, economy, loadouts', async () => {
    const { E } = await freshEngine();
    const base = E.newState();
    base.gold = 1234;
    base.hp = 42;
    // bump the first skill so we can check it round-trips
    const firstSkillId = Object.keys(base.skills)[0];
    base.skills[firstSkillId].xp = 999;
    const raw = v4SaveFrom(base);
    const out = E.migrate(raw);
    expect(out.gold).toBe(1234);
    expect(out.hp).toBe(42);
    expect(out.skills[firstSkillId].xp).toBe(999);
    expect(out.inv).toEqual(base.inv);
    expect(out.gear.length).toBe(base.gear.length);
    expect(out.equipped).toEqual(base.equipped);
    expect(out.clock).toEqual(base.clock);
    expect(out.server).toEqual(base.server);
    expect(out.economy).toEqual(base.economy);
    expect(out.loadouts).toEqual(base.loadouts);
  });

  it('migrated state is playable: one live tick does not throw', async () => {
    const { E } = await freshEngine();
    const base = E.newState();
    const raw = v4SaveFrom(base, {
      supply: { week: base.week, requests: [], donated: {}, earned: 0 },
    });
    const out = E.migrate(raw);
    expect(() => E.tick(out, 0.25, { visible: true })).not.toThrow();
  });

  it('round-trips a fresh v5 save unchanged', async () => {
    const { E } = await freshEngine();
    const s5 = E.newState();
    const raw = JSON.parse(JSON.stringify(s5));
    const out = E.migrate(raw);
    expect(out).not.toBeNull();
    expect(out.v).toBe(5);
    expect(out.supply).toBeUndefined();
    expect(out.gold).toBe(s5.gold);
  });

  it('rejects unknown schema versions', async () => {
    const { E } = await freshEngine();
    expect(E.migrate({ v: 99, skills: {} })).toBeNull();
    expect(E.migrate({ v: 2, skills: {} })).toBeNull();
  });

  it('rejects malformed input', async () => {
    const { E } = await freshEngine();
    expect(E.migrate(null)).toBeNull();
    expect(E.migrate({})).toBeNull();
    expect(E.migrate({ skills: null })).toBeNull();
  });
});
