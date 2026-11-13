// Rarity odds (owner 2026-11-13): base Common 85 / Uncommon 11 / Rare 3.25 / Epic 0.65 / Legendary 0.1 (Mythic only with a core);
// the modifier total multiplies EVERY non-common chance, Common is the remainder, non-common capped at 60%.
import { describe, expect, it } from 'vitest';
import { freshEngine } from './engine-helpers';

const R = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
async function oddsFor(opts: { grade: number; crafts: number; catalyst?: string; fortunate?: boolean }) {
  const { E, mod } = await freshEngine();
  const s = E.newState(); const act = mod.DATA.actions.find((a: any) => a.id === 'bronze_sword');
  Object.keys(act.inputs).forEach((id) => { const g = [0, 0, 0, 0, 0]; g[opts.grade] = 100; s.inv[id] = g; });
  s.mastery.bronze_sword = opts.crafts; s.focus = 0;
  if (opts.catalyst) { s.inv[opts.catalyst] = [0, 5, 0, 0, 0]; s.settings.useCatalyst = true; }
  if (opts.fortunate) { // a Mythic craft outfit + smith's hammer full of Fortunate: rarity odds at its cap (+25%)
    const items = mod.DATA.items; let n = 0;
    const add = (id: string) => { const g: any = { uid: 'F' + n++, itemId: id, rarity: 'mythic', quality: 97, affixes: [{ id: 'primary', roll: 1 }, ...[1, 2, 3, 4].map(() => ({ id: 'fortunate', roll: 1.2 }))] };
      if (items[id].section === 'tool') g.cond = 100; s.gear.push(g); E.equip(s, g.uid); };
    ['silk_craft_cap', 'silk_craft_apron', 'silk_craft_gloves', 'silk_craft_boots', 'yew_smith_hammer'].forEach(add);
  }
  const p = E.procOdds(s, 'bronze_sword');
  const o: Record<string, number> = {}; p.odds.forEach((x: any) => { o[x.rarity] = x.chance; });
  return { o, total: p.mods.total, nonCommon: 1 - o.common };
}

describe('rarity odds', () => {
  it('base table at modifier 1 (Standard inputs, Novice): 85 / 11 / 3.25 / 0.65 / 0.1, Mythic 0 without a core', async () => {
    const { o, total, nonCommon } = await oddsFor({ grade: 1, crafts: 0 });
    expect(total).toBe(1);
    expect(o.common).toBeCloseTo(0.85, 9); expect(o.uncommon).toBeCloseTo(0.11, 9); expect(o.rare).toBeCloseTo(0.0325, 9);
    expect(o.epic).toBeCloseTo(0.0065, 9); expect(o.legendary).toBeCloseTo(0.001, 9); expect(o.mythic).toBe(0);
    expect(nonCommon).toBeCloseTo(0.15, 9);
  });

  it('the modifier multiplies every non-common chance (Uncommon too); targets for Uncommon-or-better', async () => {
    const app = await oddsFor({ grade: 4, crafts: 10 });                                   // Pristine x Apprentice = 1.45 x 1.1
    expect(app.nonCommon).toBeCloseTo(0.15 * 1.45 * 1.1, 9);                              // ≈ 24%
    expect(app.o.uncommon / app.o.rare).toBeCloseTo(0.11 / 0.0325, 9);                     // proportions kept
    const master = await oddsFor({ grade: 4, crafts: 1000, catalyst: 'quickening_salts' }); // 1.45 x 1.5 x 1.15
    expect(master.nonCommon).toBeGreaterThanOrEqual(0.30); expect(master.nonCommon).toBeLessThanOrEqual(0.40);
    const best = await oddsFor({ grade: 4, crafts: 10000, catalyst: 'cut_prism', fortunate: true });
    expect(best.nonCommon).toBeCloseTo(0.6, 9);                                           // capped
    for (const c of [app, master, best]) expect(Object.values(c.o).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });

  it('cap: non-common never above 60%, scaled proportionally; Mythic only with a core (0.4% x total)', async () => {
    const { rarityOdds } = await import('../src/actions');
    for (const t of [0, 0.5, 1, 2, 4, 10, 100]) for (const core of [false, true]) {
      const o = rarityOdds(t, core); const nc = 1 - o[0];
      expect(o.reduce((a: number, b: number) => a + b, 0)).toBeCloseTo(1, 12);
      expect(nc).toBeLessThanOrEqual(0.6 + 1e-12);
      if (!core) expect(o[5]).toBe(0);
      if (core && t > 0) expect(o[5] / o[2]).toBeCloseTo(0.004 / 0.0325, 9);
    }
    expect(rarityOdds(2, true)[5]).toBeCloseTo(0.008, 12);
  });

  it('prints the four reference cases', async () => {
    const cases = [['Standard, Novice', { grade: 1, crafts: 0 }], ['Pristine, Apprentice', { grade: 4, crafts: 10 }],
      ['Pristine, Master + Quickening salts', { grade: 4, crafts: 1000, catalyst: 'quickening_salts' }],
      ['Pristine, Grandmaster + Cut prism + Fortunate max', { grade: 4, crafts: 10000, catalyst: 'cut_prism', fortunate: true }]] as const;
    for (const [label, c] of cases) { const r = await oddsFor(c as any);
      console.log(`${label.padEnd(50)} x${r.total.toFixed(3)}  ` + R.map((k) => `${k} ${(r.o[k] * 100).toFixed(2)}%`).join('  ') + `  | Uncommon+ ${(r.nonCommon * 100).toFixed(1)}%`); }
  });
});
