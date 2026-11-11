// Owner decision 2026-11-11: levelling was too fast, so every level needs xpCurveMult (2, then 5) x the
// prototype XP. Saves store total XP; migrate() rescales it so nobody loses a level.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { freshEngine, START } from './engine-helpers';
import { loadLegacy } from '../legacy/harness.mjs';

const fixture = (name: string) => JSON.parse(readFileSync(resolve(__dirname, 'fixtures', name), 'utf8'));

describe('XP curve x xpCurveMult', () => {
  it('every level threshold is xpCurveMult x the prototype curve', async () => {
    const { E, mod } = await freshEngine();
    const L = (loadLegacy({ seed: 1 }) as any).GW.Engine;
    expect(mod.DATA.config.xpCurveMult).toBe(5);
    for (const lvl of [2, 10, 20, 40, 70, 99]) expect(E.xpForLevel(lvl)).toBe(5 * L.xpForLevel(lvl));
    expect(E.levelFor(E.xpForLevel(70))).toBe(70);
    expect(E.levelFor(E.xpForLevel(70) - 1)).toBe(69);
    expect(E.newState().xpScale).toBe(5);
  });

  it('the cache follows the mult when the config changes', async () => {
    const { E, mod } = await freshEngine();
    const base = E.xpForLevel(30) / 5;
    mod.ctx.data = Object.assign({}, mod.DATA, { config: Object.assign({}, mod.DATA.config, { xpCurveMult: 3 }) });
    try { expect(E.xpForLevel(30)).toBe(base * 3); } finally { mod.ctx.data = mod.DATA; }
    expect(E.xpForLevel(30)).toBe(base * 5);
  });

  it('v4/v5/v6 fixtures keep every skill level and are idempotent on reload', async () => {
    const h = await freshEngine(3, START + 3600000);
    const L = (loadLegacy({ seed: 1 }) as any).GW.Engine; // the old (x1) curve
    for (const f of ['v4-save.json', 'v5-phase2-save.json', 'v6-phase25-save.json']) {
      const raw = fixture(f);
      const s = h.E.migrate(raw);
      expect(s.xpScale).toBe(5);
      Object.keys(raw.skills).forEach((k) => {
        if (!s.skills[k]) return;
        const oldLvl = L.levelFor(raw.skills[k].xp);
        expect(h.E.levelFor(s.skills[k].xp), `${f} ${k}`).toBe(oldLvl);
      });
      const again = h.E.migrate(JSON.parse(JSON.stringify(s)));
      Object.keys(s.skills).forEach((k) => expect(again.skills[k].xp).toBe(s.skills[k].xp));
    }
  });

  it('a 70+ specialization survives the rescale (XP kept, still eligible)', async () => {
    const h = await freshEngine();
    const s = h.E.newState();
    const raw = JSON.parse(JSON.stringify(s));
    raw.xpScale = undefined; // a pre-2026-11-11 save: XP on the x1 curve
    const L = (loadLegacy({ seed: 1 }) as any).GW.Engine;
    raw.skills.mining.xp = L.xpForLevel(75) + 10; raw.spec = { skillId: 'mining', lastSwitchAt: null };
    const m = h.E.migrate(raw);
    expect(m.spec.skillId).toBe('mining');
    expect(h.E.skillLevel(m, 'mining')).toBe(75);
    expect(m.skills.mining.xp).toBe((L.xpForLevel(75) + 10) * 5);
  });

  it('a save already migrated at xpScale 2 rescales by 5/2, keeps levels, and is idempotent', async () => {
    const h = await freshEngine();
    const L = (loadLegacy({ seed: 1 }) as any).GW.Engine;
    const raw = JSON.parse(JSON.stringify(h.E.newState()));
    raw.xpScale = 2;
    raw.skills.mining.xp = 2 * (L.xpForLevel(42) + 7); raw.skills.fishing.xp = 2 * L.xpForLevel(70);
    const m = h.E.migrate(raw);
    expect(m.xpScale).toBe(5);
    expect(m.skills.mining.xp).toBe(5 * (L.xpForLevel(42) + 7));
    expect(h.E.skillLevel(m, 'mining')).toBe(42);
    expect(h.E.skillLevel(m, 'fishing')).toBe(70);
    const again = h.E.migrate(JSON.parse(JSON.stringify(m)));
    expect(again.skills.mining.xp).toBe(m.skills.mining.xp);
  });
});
