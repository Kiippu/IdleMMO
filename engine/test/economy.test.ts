// Phase 2.5 pace rules. speedFactor stays 1 (prototype pace; owner prefers income too high over too
// low). Early game must match the legacy prototype, and the spec switch price is set in hours of
// income: ~3 hours of a typical level-40 player's gather → sell loop.
import { describe, expect, it } from 'vitest';
import { loadLegacy } from '../legacy/harness.mjs';
import { freshEngine } from './engine-helpers';

const GATHER = ['mining', 'woodcutting', 'herbalism', 'fishing'];

/** typical level-40 income: median over the gathering skills of each one's best action at level 40 */
function typicalL40Income(E: any, DATA: any) {
  const s = E.newState();
  GATHER.forEach((sk) => { s.skills[sk].xp = E.xpForLevel(40); });
  const best = GATHER.map((sk) => Math.max(...DATA.actions.filter((a: any) => a.skill === sk && a.level <= 40).map((a: any) => E.incomePerHour(s, a.id))));
  best.sort((a, b) => a - b);
  return { best, median: (best[1] + best[2]) / 2 };
}

describe('pace', () => {
  it('first ~10 levels match the legacy prototype: time per rep, XP per rep, output value', async () => {
    const h: any = loadLegacy({ seed: 1 });
    const L = h.GW.Engine; const LD = h.GW.DATA; const ls = L.newState();
    const { E, mod } = await freshEngine();
    const s = E.newState();
    const acts = mod.DATA.actions.filter((a: any) => a.level <= 10 && a.kind !== 'combat');
    expect(acts.length).toBeGreaterThan(30);
    expect(mod.DATA.config.xpMult).toBe(LD.config.xpMult);
    for (const a of acts) {
      const la = LD.actions.find((x: any) => x.id === a.id);
      expect(la, a.id).toBeTruthy();
      expect(E.actionTime(s, a.id)).toBeCloseTo(L.actionTime(ls, a.id), 9);
      expect(a.xp).toBe(la.xp);
      expect(a.outputs).toEqual(la.outputs);
      Object.keys(a.outputs || {}).forEach((id) => expect(E.itemValue(id, 1)).toBe(L.itemValue(id, 1)));
    }
  });

  it('spec switch cost is 2.5-3.5 hours of a typical level-40 income', async () => {
    const { E, mod } = await freshEngine();
    const inc = typicalL40Income(E, mod.DATA);
    const ratio = mod.DATA.config.specSwitchCost / inc.median;
    // eslint-disable-next-line no-console
    console.log('[l40-income]', JSON.stringify({ best: inc.best.map(Math.round), median: Math.round(inc.median), cost: mod.DATA.config.specSwitchCost, hours: ratio }));
    expect(ratio).toBeGreaterThanOrEqual(2.5);
    expect(ratio).toBeLessThanOrEqual(3.5);
    expect(E.spec(E.newState()).switchCost).toBe(mod.DATA.config.specSwitchCost);
  });
});
