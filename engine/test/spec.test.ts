// Specialization switch: anyone can declare a spec; swapping costs ~3000g,
// has a one-week cooldown, and clamps the OLD spec's XP to the level-70 cap.
import { describe, expect, it, vi } from 'vitest';

const START = Date.UTC(2026, 10, 2, 9, 0, 0);
const DAY = 86400000;

async function freshEngine(seed = 1) {
  vi.resetModules();
  const mod = await import('../src/index');
  let now = START;
  const storage = mod.memoryStorage();
  const E = mod.createEngine({ rng: mod.mulberry32(seed), now: () => now, storage, data: mod.DATA });
  return { E, mod, storage, setNow: (t: number) => { now = t; }, advance: (ms: number) => { now += ms; } };
}

describe('specialization switch', () => {
  it('fresh state has no spec set and reports no cooldown', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    const info = E.spec(s);
    expect(info.skillId).toBeNull();
    expect(info.cooldownMs).toBe(0);
    expect(info.cost).toBeGreaterThan(0);
  });

  it('first pick is free of the clamp (no old skill to cap) but still costs gold', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    s.gold = 5000;
    const before = s.gold;
    const r = E.switchSpec(s, 'mining');
    expect(r.ok).toBe(true);
    expect(s.spec.skillId).toBe('mining');
    expect(s.gold).toBe(before - r.cost);
  });

  it('rejects an unknown skill', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    s.gold = 5000;
    const r = E.switchSpec(s, 'notaskill');
    expect(r.ok).toBe(false);
  });

  it('rejects when the player cannot afford the cost', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    s.gold = 10; // far below 3000
    const r = E.switchSpec(s, 'mining');
    expect(r.ok).toBe(false);
    expect(s.spec.skillId).toBeNull();
    expect(s.gold).toBe(10);
  });

  it('clamps the OLD spec skill XP to the level-70 cap when swapped out', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    s.gold = 20000;
    // Pick mining as the first spec, then level mining past 70 artificially.
    E.switchSpec(s, 'mining');
    s.skills.mining.xp = E.xpForLevel(99); // way past the cap
    // Advance a week + 1s to clear the cooldown, then switch out.
    s.spec.lastSwitchAt = START - (7 * DAY + 1000);
    const r = E.switchSpec(s, 'woodcutting');
    expect(r.ok).toBe(true);
    expect(s.spec.skillId).toBe('woodcutting');
    expect(s.skills.mining.xp).toBe(E.xpForLevel(70));
    // The new spec's skill is untouched.
    expect(s.skills.woodcutting.xp).toBe(0);
  });

  it('enforces a one-week cooldown', async () => {
    const { E, advance } = await freshEngine();
    const s = E.newState();
    s.gold = 20000;
    E.switchSpec(s, 'mining');
    // Try to switch immediately: blocked.
    const r1 = E.switchSpec(s, 'woodcutting');
    expect(r1.ok).toBe(false);
    expect(r1.reason.toLowerCase()).toMatch(/cooldown/);
    // Advance a day short of a week: still blocked.
    advance(6 * DAY);
    const r2 = E.switchSpec(s, 'woodcutting');
    expect(r2.ok).toBe(false);
    // Advance past a full week from the original switch: now allowed.
    advance(2 * DAY);
    const r3 = E.switchSpec(s, 'woodcutting');
    expect(r3.ok).toBe(true);
  });

  it('is idempotent on the same skill (no-op without charging)', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    s.gold = 20000;
    E.switchSpec(s, 'mining');
    const after = s.gold;
    const r = E.switchSpec(s, 'mining');
    expect(r.ok).toBe(false);
    expect(s.gold).toBe(after);
  });
});

describe('v4 → v5 spec field defaults', () => {
  it('v4 save with no spec field migrates to spec: { skillId: null, lastSwitchAt: null }', async () => {
    const { E } = await freshEngine();
    const base = E.newState();
    const raw = JSON.parse(JSON.stringify(Object.assign({}, base, { v: 4 })));
    delete raw.spec;
    const out = E.migrate(raw);
    expect(out).not.toBeNull();
    expect(out.spec).toEqual({ skillId: null, lastSwitchAt: null });
  });

  it('v5 save with a valid spec round-trips', async () => {
    const { E } = await freshEngine();
    const base = E.newState();
    base.spec = { skillId: 'mining', lastSwitchAt: START - DAY };
    const raw = JSON.parse(JSON.stringify(base));
    const out = E.migrate(raw);
    expect(out.spec.skillId).toBe('mining');
    expect(out.spec.lastSwitchAt).toBe(START - DAY);
  });

  it('v5 save with a malformed spec is normalised back to the default', async () => {
    const { E } = await freshEngine();
    const base = E.newState();
    const raw = JSON.parse(JSON.stringify(Object.assign({}, base, { spec: { skillId: 'bogus', lastSwitchAt: 'not a number' } })));
    const out = E.migrate(raw);
    expect(out.spec).toEqual({ skillId: null, lastSwitchAt: null });
  });
});
