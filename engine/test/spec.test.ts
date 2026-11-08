// Specialization (phase 2.5 owner rules): profession skills level to 70 for everyone; past 70 only
// your specialization levels (others are held at EFFECTIVE 70 while XP keeps accruing). A spec needs
// a profession skill at 70+. First pick free, no cooldown; switching costs specSwitchCost + a one-week
// cooldown; the old skill drops back to effective 70 (XP kept) and switching back restores it.
import { describe, expect, it } from 'vitest';
import { freshEngine, START, DAY } from './engine-helpers';

const at = (E: any, lvl: number) => E.xpForLevel(lvl);

describe('profession cap without a specialization', () => {
  it('profession skills cap at effective 70 with XP kept; combat skills are not capped', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    s.skills.mining.xp = at(E, 85);
    expect(E.skillLevel(s, 'mining')).toBe(70);
    const p = E.skillProgress(s, 'mining');
    expect(p).toMatchObject({ level: 70, rawLevel: 85, capped: true });
    s.skills.mining.xp += 100000; // XP keeps accruing
    expect(E.skillLevel(s, 'mining')).toBe(70);
    s.skills.striker.xp = at(E, 85);
    expect(E.skillLevel(s, 'striker')).toBe(85);
    expect(E.spec(s).capped).toEqual(['mining']);
  });

  it('a capped skill raises no level-up past 70', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    s.skills.mining.xp = at(E, 70);
    E.start(s, 'mine_copper');
    const ev = E.tick(s, 30);
    expect(ev.some((e: any) => e.type === 'levelup' && e.skill === 'mining')).toBe(false);
  });
});

describe('choosing and switching a specialization', () => {
  it('needs a profession skill at 70+', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    s.gold = 1e6;
    s.skills.mining.xp = at(E, 69);
    expect(E.switchSpec(s, 'mining').ok).toBe(false);
    expect(E.spec(s).eligible).toEqual([]);
    s.skills.striker.xp = at(E, 80);
    expect(E.switchSpec(s, 'striker').ok).toBe(false); // combat is not a profession
    expect(E.switchSpec(s, 'notaskill').ok).toBe(false);
    s.skills.mining.xp = at(E, 70);
    expect(E.spec(s).eligible).toEqual(['mining']);
  });

  it('first pick is free and starts no cooldown; the spec levels past 70', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    s.gold = 10;
    s.skills.mining.xp = at(E, 90);
    expect(E.spec(s)).toMatchObject({ cost: 0, firstPickFree: true, cooldownMs: 0 });
    const r = E.switchSpec(s, 'mining');
    expect(r).toMatchObject({ ok: true, cost: 0, first: true });
    expect(s.gold).toBe(10);
    expect(s.spec.lastSwitchAt).toBeNull();
    expect(E.specCooldown(s).ready).toBe(true);
    expect(E.skillLevel(s, 'mining')).toBe(90);
    expect(E.spec(s).cost).toBe(E.spec(s).switchCost);
  });

  it('switching costs the switch price, drops the old skill to 70 (XP kept), and switching back restores it', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    const cost = E.spec(s).switchCost;
    s.skills.mining.xp = at(E, 95); s.skills.fishing.xp = at(E, 72);
    E.switchSpec(s, 'mining');
    s.gold = cost * 2;
    const r = E.switchSpec(s, 'fishing');
    expect(r.ok).toBe(true);
    expect(s.gold).toBe(cost);
    expect(s.skills.mining.xp).toBe(at(E, 95));
    expect(E.skillLevel(s, 'mining')).toBe(70);
    expect(E.skillLevel(s, 'fishing')).toBe(72);
    s.spec.lastSwitchAt = START - (7 * DAY + 1000);
    expect(E.switchSpec(s, 'mining').ok).toBe(true);
    expect(E.skillLevel(s, 'mining')).toBe(95);
    expect(E.skillLevel(s, 'fishing')).toBe(70);
  });

  it('rejects a switch the player cannot afford', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    s.skills.mining.xp = at(E, 70); s.skills.fishing.xp = at(E, 70);
    E.switchSpec(s, 'mining');
    s.gold = 10;
    expect(E.switchSpec(s, 'fishing').ok).toBe(false);
    expect(s.spec.skillId).toBe('mining');
    expect(s.gold).toBe(10);
  });

  it('switching has a one-week cooldown shown as "Xd Yh", never seconds', async () => {
    const { E, advance } = await freshEngine();
    const s = E.newState();
    s.skills.mining.xp = at(E, 70); s.skills.fishing.xp = at(E, 70); s.skills.herbalism.xp = at(E, 70);
    E.switchSpec(s, 'mining');
    s.gold = 1e6;
    expect(E.switchSpec(s, 'fishing').ok).toBe(true); // first switch: no cooldown from the free pick
    const r1 = E.switchSpec(s, 'herbalism');
    expect(r1.ok).toBe(false);
    expect(r1.reason).toMatch(/7d 0h/);
    expect(r1.reason).not.toMatch(/second/);
    expect(E.specCooldown(s)).toEqual({ ms: 7 * DAY, text: '7d 0h', ready: false });
    advance(6 * DAY);
    expect(E.switchSpec(s, 'herbalism').cooldownText).toBe('1d 0h');
    advance(23 * 3600000 + 30 * 60000);
    expect(E.specCooldown(s).text).toBe('0d 1h');
    advance(31 * 60000);
    expect(E.switchSpec(s, 'herbalism').ok).toBe(true);
  });

  it('is a no-op on the same skill', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    s.skills.mining.xp = at(E, 70);
    E.switchSpec(s, 'mining');
    expect(E.switchSpec(s, 'mining').ok).toBe(false);
  });
});

describe('spec migration', () => {
  it('a spec below level 70 is cleared, 3,000g refunded and the cooldown reset', async () => {
    const { E } = await freshEngine();
    const base = E.newState();
    const raw = JSON.parse(JSON.stringify(base));
    raw.v = 6; raw.gold = 100; raw.spec = { skillId: 'mining', lastSwitchAt: START - DAY, capped: ['fishing'] };
    const out = E.migrate(raw);
    expect(out.spec).toEqual({ skillId: null, lastSwitchAt: null });
    expect(out.gold).toBe(3100);
    expect(out.log[0].text).toMatch(/refunded/);
  });

  it('a spec at 70+ is kept without a refund; old fields are stripped', async () => {
    const { E } = await freshEngine();
    const base = E.newState();
    const raw = JSON.parse(JSON.stringify(base));
    raw.v = 6; raw.gold = 100; raw.skills.mining.xp = at(E, 75);
    raw.spec = { skillId: 'mining', lastSwitchAt: START - DAY, capped: [] };
    const out = E.migrate(raw);
    expect(out.spec).toEqual({ skillId: 'mining', lastSwitchAt: START - DAY });
    expect(out.gold).toBe(100);
  });

  it('a save with no spec gets the default', async () => {
    const { E } = await freshEngine();
    const raw = JSON.parse(JSON.stringify(Object.assign({}, E.newState(), { v: 4 })));
    delete raw.spec;
    expect(E.migrate(raw).spec).toEqual({ skillId: null, lastSwitchAt: null });
  });

  it('a malformed spec is normalised to the default with no refund', async () => {
    const { E } = await freshEngine();
    const raw = JSON.parse(JSON.stringify(Object.assign({}, E.newState(), { spec: { skillId: 'bogus', lastSwitchAt: 'x' } })));
    const out = E.migrate(raw);
    expect(out.spec).toEqual({ skillId: null, lastSwitchAt: null });
    expect(out.gold).toBe(raw.gold);
  });
});
