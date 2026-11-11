// Owner decision 2026-11-11: levelling was too fast, so every level needs xpCurveMult (2, then 5) x the
// prototype XP. Saves store total XP (no rescaling: pre-v7 saves are not loaded).
import { describe, expect, it } from 'vitest';
import { freshEngine } from './engine-helpers';
import { loadLegacy } from '../legacy/harness.mjs';

describe('XP curve x xpCurveMult', () => {
  it('every level threshold is xpCurveMult x the prototype curve', async () => {
    const { E, mod } = await freshEngine();
    const L = (loadLegacy({ seed: 1 }) as any).GW.Engine;
    expect(mod.DATA.config.xpCurveMult).toBe(5);
    for (const lvl of [2, 10, 20, 40, 70, 99]) expect(E.xpForLevel(lvl)).toBe(5 * L.xpForLevel(lvl));
    expect(E.levelFor(E.xpForLevel(70))).toBe(70);
    expect(E.levelFor(E.xpForLevel(70) - 1)).toBe(69);
    expect('xpScale' in E.newState()).toBe(false);
  });

  it('the cache follows the mult when the config changes', async () => {
    const { E, mod } = await freshEngine();
    const base = E.xpForLevel(30) / 5;
    mod.ctx.data = Object.assign({}, mod.DATA, { config: Object.assign({}, mod.DATA.config, { xpCurveMult: 3 }) });
    try { expect(E.xpForLevel(30)).toBe(base * 3); } finally { mod.ctx.data = mod.DATA; }
    expect(E.xpForLevel(30)).toBe(base * 5);
  });

  it('stored XP loads unchanged (no rescaling since save schema v7)', async () => {
    const h = await freshEngine();
    const raw = JSON.parse(JSON.stringify(h.E.newState()));
    raw.skills.mining.xp = h.E.xpForLevel(42) + 7;
    const m = h.E.migrate(raw);
    expect(m.skills.mining.xp).toBe(h.E.xpForLevel(42) + 7);
    expect(h.E.skillLevel(m, 'mining')).toBe(42);
    expect('xpScale' in m).toBe(false);
  });
});
