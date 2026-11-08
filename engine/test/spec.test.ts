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

  it('caps the OLD spec skill EFFECTIVE level at 70, keeps its XP, and restores it on switching back', async () => {
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
    // XP is kept; only the effective level is capped.
    expect(s.skills.mining.xp).toBe(E.xpForLevel(99));
    expect(E.skillLevel(s, 'mining')).toBe(70);
    const prog = E.skillProgress(s, 'mining');
    expect(prog.level).toBe(70); expect(prog.rawLevel).toBe(99); expect(prog.capped).toBe(true);
    expect(E.spec(s).capped).toEqual(['mining']);
    // XP earned while capped is kept too, but the level stays at 70.
    s.skills.mining.xp += 1000;
    expect(E.skillLevel(s, 'mining')).toBe(70);
    // The new spec's skill is untouched.
    expect(s.skills.woodcutting.xp).toBe(0);
    // Switch back after another week: the cap lifts and the full level returns.
    s.spec.lastSwitchAt = START - (7 * DAY + 1000);
    expect(E.switchSpec(s, 'mining').ok).toBe(true);
    expect(E.skillLevel(s, 'mining')).toBe(99);
    expect(E.spec(s).capped).toEqual(['woodcutting']);
  });

  it('enforces a one-week cooldown', async () => {
    const { E, advance } = await freshEngine();
    const s = E.newState();
    s.gold = 20000;
    E.switchSpec(s, 'mining');
    // Try to switch immediately: blocked.
    const r1 = E.switchSpec(s, 'woodcutting');
    expect(r1.ok).toBe(false);
    // Cooldown text is days + hours, never seconds.
    expect(r1.reason).toMatch(/7d 0h/);
    expect(r1.reason).not.toMatch(/second/);
    expect(E.specCooldown(s)).toEqual({ ms: 7 * DAY, text: '7d 0h', ready: false });
    // Advance a day short of a week: still blocked.
    advance(6 * DAY);
    const r2 = E.switchSpec(s, 'woodcutting');
    expect(r2.ok).toBe(false);
    expect(r2.cooldownText).toBe('1d 0h');
    advance(23 * 3600000 + 30 * 60000); // 30 min left: rounds up to 1h, never shows seconds
    expect(E.specCooldown(s).text).toBe('0d 1h');
    advance(-(23 * 3600000 + 30 * 60000));
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

describe('v4/v5 → v6 spec field defaults', () => {
  it('v4 save with no spec field migrates to spec: { skillId: null, lastSwitchAt: null }', async () => {
    const { E } = await freshEngine();
    const base = E.newState();
    const raw = JSON.parse(JSON.stringify(Object.assign({}, base, { v: 4 })));
    delete raw.spec;
    const out = E.migrate(raw);
    expect(out).not.toBeNull();
    expect(out.spec).toEqual({ skillId: null, lastSwitchAt: null, capped: [] });
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
    expect(out.spec).toEqual({ skillId: null, lastSwitchAt: null, capped: [] });
  });

  it('a free player (no membership modelled) can switch; the fresh-state spec has an empty cap list', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    expect(s.spec.capped).toEqual([]);
    s.gold = 3000;
    expect(E.switchSpec(s, 'fishing').ok).toBe(true);
    expect(s.gold).toBe(0);
  });
});
