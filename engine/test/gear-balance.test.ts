// Gear balance (gear spec 2026-11-12): rarity guarantee at every grade, tier ordering, soft caps, x10 boss needs,
// shop tool payback, gearless H, and the expected kit gains.
import { describe, expect, it } from 'vitest';
import { freshEngine } from './engine-helpers';

const RAR = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
const Q = [20, 50, 70, 87, 97]; // Rough .. Pristine
const mk = (mod: any, itemId: string, r: number, quality: number, extra: any[] = []) => {
  const it = mod.DATA.items[itemId];
  const g: any = { uid: 'x', itemId, rarity: RAR[r], quality, affixes: r > 0 ? [{ id: 'primary', roll: 1 }, ...extra] : [] };
  if (it.section === 'fight') { g.dur = 100; g.maxDur = 100; } else if (it.section === 'tool') g.cond = 100;
  return g;
};
/** the primary stat (fight) or each primary effect (tools/outfit, unrounded, per group it serves) of a lone piece */
let PE: any = null;
function primaryOf(E: any, mod: any, s: any, g: any): number[] {
  const it = mod.DATA.items[g.itemId]; s.gear = [g];
  if (it.section === 'fight') return [E.gearDetail(s, g.uid).stats.find((l: any) => l.key === it.primary).value];
  return it.effects.map((e: any) => PE.pieceEffects(g, e.group || it.toolGroup || (it.outfitSet === 'gather' ? 'gathering' : 'refining'))[e.id]);
}
const gt = (a: number[], b: number[]) => a.every((x, i) => x > b[i]);
const ge = (a: number[], b: number[]) => a.every((x, i) => x >= b[i]);

describe('gear balance', () => {
  it('171 items at T1–T3: 57 per tier (12 weapons, 3 offhands, 9 armour, 6 jewellery, 15 tools, 12 outfit)', async () => {
    const { mod } = await freshEngine();
    const gear = Object.values(mod.DATA.items).filter((x: any) => x.kind === 'gear') as any[];
    expect(gear).toHaveLength(171);
    for (const t of [1, 2, 3]) {
      const g = gear.filter((x) => x.tier === t);
      expect(g.filter((x) => x.section === 'fight' && x.slot === 'weapon')).toHaveLength(12);
      expect(g.filter((x) => x.slot === 'offhand')).toHaveLength(3);
      expect(g.filter((x) => x.section === 'fight' && ['head', 'chest', 'legs'].includes(x.slot))).toHaveLength(9);
      expect(g.filter((x) => ['ring', 'amulet'].includes(x.slot))).toHaveLength(6);
      expect(g.filter((x) => x.section === 'tool')).toHaveLength(15);
      expect(g.filter((x) => x.section === 'outfit')).toHaveLength(12);
    }
    // every gear item has exactly one craft recipe, made by its maker, at a level inside its tier
    for (const it of gear) {
      const recs = mod.DATA.actions.filter((a: any) => a.kind === 'craft' && a.outputs[it.id]);
      expect(recs, it.id).toHaveLength(1);
      expect(recs[0].skill).toBe(it.maker);
      expect(recs[0].level).toBeGreaterThanOrEqual([0, 1, 15, 30][it.tier]);
      expect(recs[0].level).toBeLessThanOrEqual([0, 14, 29, 44][it.tier]);
      Object.keys(recs[0].inputs).forEach((id) => expect(mod.DATA.items[id], `${it.id} input ${id}`).toBeTruthy());
    }
  });

  it('higher rarity beats the same item one rarity lower at ANY grade (Rough r > Pristine r-1), every item', async () => {
    const { E, mod } = await freshEngine();
    PE = await import('../src/gear');
    const s = E.newState();
    for (const id of Object.keys(mod.DATA.items).filter((k) => mod.DATA.items[k].kind === 'gear')) {
      for (let r = 1; r < RAR.length; r++) {
        const lo = primaryOf(E, mod, s, mk(mod, id, r, Q[0]));
        const hiPrev = primaryOf(E, mod, s, mk(mod, id, r - 1, Q[4]));
        expect(gt(lo, hiPrev), `${id} ${RAR[r]} Rough ${lo} vs ${RAR[r - 1]} Pristine ${hiPrev}`).toBe(true);
      }
      for (let r = 0; r < RAR.length; r++) for (let g = 1; g < Q.length; g++) {
        expect(ge(primaryOf(E, mod, s, mk(mod, id, r, Q[g])), primaryOf(E, mod, s, mk(mod, id, r, Q[g - 1]))), `${id} grade ${g}`).toBe(true);
      }
    }
  });

  it('cross-grade over the export set: rarity r at Rough beats r-1 at Pristine on EVERY stat, the piece\'s role power and every shown effect', async () => {
    const { E, mod } = await freshEngine();
    const { powersOf } = await import('../src/stats');
    const s = E.newState(); const items = mod.DATA.items; let checked = 0;
    const view = (g: any) => { s.gear = [g]; const d = E.gearDetail(s, g.uid); const st: any = {}; d.stats.forEach((l: any) => { st[l.key] = l.value; });
      const ef: any = {}; d.effects.forEach((l: any) => { ef[l.label] = l.value; }); return { st, ef }; };
    for (const id of Object.keys(items).filter((k) => items[k].kind === 'gear')) {
      const it = items[id];
      for (let r = 1; r < RAR.length; r++) {
        const lo = view(mk(mod, id, r, Q[0])), hi = view(mk(mod, id, r - 1, Q[4]));
        for (const k of ['atk', 'def', 'heal', 'hp']) if (hi.st[k] != null) expect(lo.st[k], `${id} ${k} ${RAR[r]} Rough vs ${RAR[r - 1]} Pristine`).toBeGreaterThan(hi.st[k]);
        if (it.section === 'fight') {
          const ps = (x: any) => ({ atk: x.st.atk || 0, def: x.st.def || 0, heal: x.st.heal || 0, maxHp: 600 + (x.st.hp || 0), elements: {}, wards: {} });
          expect(powersOf(ps(lo), null)[it.role], `${id} ${it.role} power`).toBeGreaterThan(powersOf(ps(hi), null)[it.role]);
        }
        for (const label of Object.keys(hi.ef)) expect(lo.ef[label], `${id} ${label} ${RAR[r]}`).toBeGreaterThan(hi.ef[label]);
        checked++;
      }
    }
    expect(checked).toBe(171 * 5);
  });

  it('effect format: >= 1 one decimal, < 1 two decimals, never +0.0', async () => {
    const { fmtEffect, statText } = await import('../src/index');
    expect(fmtEffect(1, 'pct')).toBe('+1.0%'); expect(fmtEffect(0.25, 'pct')).toBe('+0.25%'); expect(fmtEffect(2, 'pts')).toBe('+2.0');
    expect(fmtEffect(0.995)).toBe('+1.0%'); expect(fmtEffect(0.004)).toBe('+0.00%');
    expect(statText('fire', 3.3)).toBe('Fire damage +3.3%'); expect(statText('venom', 5)).toBe('Poison damage +5.0%');
    expect(statText('ward_frost', 2)).toBe('Frost resistance +2.0%'); expect(statText('atk', 47)).toBe('Attack +47');
    // no work affix or primary bonus can show as zero
    const { E, mod } = await freshEngine(); const s = E.newState(); const items = mod.DATA.items;
    for (const id of Object.keys(items).filter((k) => items[k].kind === 'gear' && items[k].section !== 'fight')) for (let r = 1; r < 6; r++) {
      const g = mk(mod, id, r, Q[0], [{ id: (items[id].section === 'tool' ? ({ gathering: 'brisk', refining: 'thrifty' } as any)[items[id].toolGroup] || 'masterful' : 'brisk'), roll: 0.8 }]); s.gear = [g];
      for (const a of E.gearDetail(s, g.uid).affixes) expect(a.label, id).not.toMatch(/\+0\.00?%?($|,| )/);
    }
  });

  it('each tier beats the last at equal rarity and grade (same family type)', async () => {
    const { E, mod } = await freshEngine();
    PE = await import('../src/gear');
    const s = E.newState(); const items = mod.DATA.items;
    const byType: Record<string, any[]> = {};
    Object.values(items).forEach((it: any) => { if (it.kind === 'gear') (byType[it.section + ':' + it.type] ||= []).push(it); });
    for (const list of Object.values(byType)) {
      list.sort((a, b) => a.tier - b.tier);
      for (let i = 1; i < list.length; i++) for (let r = 0; r < RAR.length; r++) for (const q of [Q[0], Q[4]]) {
        const a = primaryOf(E, mod, s, mk(mod, list[i].id, r, q)), b = primaryOf(E, mod, s, mk(mod, list[i - 1].id, r, q));
        // never worse on any primary, strictly better on at least one (the craft outfit's quality is 1 at both T2 and T3 by spec)
        expect(ge(a, b) && a.some((x, k) => x > b[k]), `${list[i].id} ${a} vs ${list[i - 1].id} ${b}`).toBe(true);
      }
    }
  });

  it('worked numbers: T1 sword and plate chest, chest HP = 2.5 x defence, x1.5 a tier', async () => {
    const { E, mod } = await freshEngine();
    PE = await import('../src/gear');
    const s = E.newState();
    // sword: 60 x 0.66 x 0.9 = 35.64 → Rough/Standard/Pristine 35/36/38; Mythic 56/57/59
    expect([20, 50, 97].map((q) => primaryOf(E, mod, s, mk(mod, 'bronze_sword', 0, q)))).toEqual([[35], [36], [38]]);
    expect([20, 50, 97].map((q) => primaryOf(E, mod, s, mk(mod, 'bronze_sword', 5, q)))).toEqual([[56], [57], [59]]);
    expect(mod.DATA.items.bronze_cuirass.stats).toEqual({ def: 60, hp: 150 });
    expect(mod.DATA.items.iron_cuirass.stats).toEqual({ def: 90, hp: 225 });
    expect(mod.DATA.items.steel_cuirass.stats.def).toBe(135);
    // named T3 weapons carry 25% of an element; bows add 10% to any element they carry
    expect(mod.DATA.items.frostbite_saber).toMatchObject({ element: 'frost', elementShare: 25, tier: 3 });
    s.gear = [mk(mod, 'venomstring_bow', 0, 50)];
    expect(E.gearDetail(s, 'x').stats.find((l: any) => l.key === 'venom').value).toBe(35);
  });

  it('boss requirements are x10 (300 … 1500) and a full T1 Common kit clears boss 1', async () => {
    const { E, mod } = await freshEngine();
    expect(mod.DATA.bosses.map((b: any) => b.reqPower)).toEqual([300, 500, 750, 1000, 1200, 1500]);
    const s = E.newState();
    expect(E.roleRequirement(s, 'striker')).toBe(300);
    s.gear = []; Object.keys(s.equipped).forEach((k) => { s.equipped[k] = null; });
    ['bronze_greatsword', 'leather_cap', 'leather_jerkin', 'leather_breeches', 'copper_signet', 'copper_signet', 'copper_pendant'].forEach((id, i) => {
      const g = mk(mod, id, 0, 50); g.uid = 'k' + i; s.gear.push(g); expect(E.equip(s, g.uid).ok).toBe(true);
    });
    expect(s.equipped.ring1).toBe('k4'); expect(s.equipped.ring2).toBe('k5');
    expect(E.rolePower(s, 'striker', 'equipped')).toBeGreaterThanOrEqual(300);
  });

  it('striker power: elements swing it by at most +-12.5% (weak 1.25, own 0.75); total share capped at 50%', async () => {
    const { E, mod } = await freshEngine();
    const s = E.newState(); const boss = E.currentBoss(s); // Ashen Wyrm: weak to frost, hits fire
    const ps = { atk: 100, def: 0, heal: 0, maxHp: 600, elements: { fire: 0, frost: 50, venom: 0, holy: 0 }, wards: {} };
    const { powersOf } = await import('../src/stats');
    const { ROLE_POWER } = await import('../src/data/gear/model');
    const k = ROLE_POWER.striker.atk;
    expect(powersOf(ps, boss).striker).toBe(Math.round(100 * k * 1.125));
    expect(powersOf({ ...ps, elements: { fire: 50, frost: 0, venom: 0, holy: 0 } }, boss).striker).toBe(Math.round(100 * k * 0.875));
    // two element weapons' worth of share: capped to 50 in total
    s.gear = []; ['frostbite_saber'].forEach((id) => { const g = mk(mod, id, 3, 50, [{ id: 'of_rime', roll: 1.2 }, { id: 'of_rime', roll: 1.2 }]); g.uid = 'w'; s.gear.push(g); });
    s.equipped.weapon = 'w';
    const st = E.playerStats(s);
    expect(st.elements.frost).toBeLessThanOrEqual(50);
    void boss;
  });

  it('soft cap: linear to half the cap, then curves; never above the cap, however much is stacked', async () => {
    const { softCap } = await import('../src/gear');
    expect(softCap(1, 8)).toBe(1); expect(softCap(4, 8)).toBe(4);
    expect(softCap(5, 8)).toBeCloseTo(4 + 4 * (1 - Math.exp(-1 / 4)), 9);
    expect(softCap(1000, 8)).toBeLessThanOrEqual(8);
    const { E, mod } = await freshEngine();
    const s = E.newState();
    // a Mythic Pristine tool and 4 outfit pieces, every secondary Brisk/Bountiful/Keen-eyed at roll 1.2
    const pool = ['brisk', 'bountiful', 'keen_eyed'];
    const sec = () => [0, 1, 2, 3].map((i) => ({ id: pool[i % 3], roll: 1.2 }));
    const t = mk(mod, 'steel_pickaxe', 5, 97, sec()); t.uid = 'T'; s.gear.push(t); s.tools.mining = 'T';
    ['silk_field_cap', 'silk_field_vest', 'silk_field_gloves', 'silk_field_boots'].forEach((id, i) => {
      const g = mk(mod, id, 5, 97, sec()); g.uid = 'O' + i; s.gear.push(g); s.workOutfit.gather[mod.DATA.items[id].slot] = g.uid;
    });
    const wb = E.workBonus(s, 'mining');
    for (const e of mod.DATA.effects) expect(wb.totals[e.id], e.id).toBeLessThanOrEqual(e.cap);
    expect(wb.raw.find).toBeGreaterThanOrEqual(30); expect(wb.totals.find).toBeLessThan(wb.raw.find); expect(wb.totals.find).toBeLessThan(30);
    expect(wb.totals.save).toBe(0); // refine-only effects never apply to mining
  });

  it('H, the hourly income and the raid cap are measured without tools or outfit', async () => {
    const { E } = await freshEngine();
    const s = E.newState(); s.skills.mining.xp = E.xpForLevel(40);
    const a = E.incomePerHour(s, 'mine_silver');
    expect(E.incomePerHour(s, 'mine_silver', { withGear: true })).toBeGreaterThan(a); // the starter pickaxe helps
    const bare = JSON.parse(JSON.stringify(s)); Object.keys(bare.tools).forEach((k) => { bare.tools[k] = null; });
    expect(E.incomePerHour(bare, 'mine_silver')).toBeCloseTo(a, 9);
    expect(E.hourlyIncome(s)).toBeCloseTo(E.hourlyIncome(bare), 9);
  });

  it('a full Common Standard kit of tier N at the tier mid combat level is 1.0–1.15x boss N; guardian at most 10% above the others', async () => {
    const { E, mod } = await freshEngine();
    const items = mod.DATA.items; const MID = [0, 7, 22, 37]; const NEED = [0, 300, 500, 750];
    const KITS: Record<string, string[]> = { striker: ['greatsword', 'cap', 'jerkin', 'breeches', 'signet', 'signet', 'pendant'],
      guardian: ['mace', 'shield', 'helm', 'cuirass', 'greaves', 'band', 'band', 'torc'], mender: ['staff', 'hood', 'robe', 'trousers', 'loop', 'loop', 'locket'] };
    for (const t of [1, 2, 3]) {
      const p: Record<string, number> = {};
      for (const role of Object.keys(KITS)) {
        const s = E.newState(); s.gear = []; Object.keys(s.equipped).forEach((k) => { s.equipped[k] = null; });
        s.skills[role].xp = E.xpForLevel(MID[t]);
        KITS[role].forEach((type, i) => { const id = Object.keys(items).find((x) => items[x].tier === t && items[x].type === type && items[x].section === 'fight')!;
          const g = mk(mod, id, 0, 50); g.uid = 'k' + i; s.gear.push(g); expect(E.equip(s, g.uid).ok).toBe(true); });
        p[role] = E.rolePower(s, role, 'equipped');
        expect(p[role] / NEED[t], `T${t} ${role} ${p[role]}`).toBeGreaterThanOrEqual(1.0);
        expect(p[role] / NEED[t], `T${t} ${role} ${p[role]}`).toBeLessThanOrEqual(1.15);
      }
      expect(p.guardian).toBeLessThanOrEqual(1.1 * Math.min(p.striker, p.mender));
    }
  });

  it('crafted Common tools pay back in 20–50 h of their gathering skill at the tier mid level', async () => {
    const { E, mod } = await freshEngine();
    const items = mod.DATA.items;
    for (const [tier, lvl] of [[1, 7], [2, 22], [3, 37]]) for (const skill of ['mining', 'woodcutting', 'herbalism', 'fishing']) {
      const s = E.newState(); Object.keys(s.tools).forEach((k) => { s.tools[k] = null; }); s.skills[skill].xp = E.xpForLevel(lvl);
      const best = mod.DATA.actions.filter((a: any) => a.skill === skill && a.level <= lvl).sort((a: any, b: any) => E.incomePerHour(s, b.id) - E.incomePerHour(s, a.id))[0];
      const g0 = E.incomePerHour(s, best.id, { withGear: true });
      const id = Object.keys(items).find((x) => items[x].section === 'tool' && items[x].toolSkill === skill && items[x].tier === tier)!;
      const g = mk(mod, id, 0, 50); g.uid = 'T'; s.gear.push(g); s.tools[skill] = 'T';
      const hours = E.gearValue(g) / (E.incomePerHour(s, best.id, { withGear: true }) - g0);
      expect(hours, `${id} ${hours}`).toBeGreaterThanOrEqual(20); expect(hours, `${id} ${hours}`).toBeLessThanOrEqual(50);
    }
  });

  it('work kit income bands at level 40 (tool + 4 Gather pieces): T1 Common +1.5–2.5%, T3 Rare +5–7%, T5 Mythic Pristine best ≤ +11%', async () => {
    const { E, mod } = await freshEngine();
    const { buildGear } = await import('../src/data/gear/build');
    Object.assign(mod.DATA.items, buildGear([5]).items); // T5 is data-model only this release
    const items = mod.DATA.items;
    const gain = (tier: number, r: number, q: number, pool: string[], roll: number) => {
      const s = E.newState(); s.skills.mining.xp = E.xpForLevel(40); let k = 0;
      const sec = () => Array.from({ length: Math.max(0, r - 1) }, () => ({ id: pool[k++ % pool.length], roll }));
      const tid = Object.keys(items).find((x) => items[x].section === 'tool' && items[x].toolSkill === 'mining' && items[x].tier === tier)!;
      const t = mk(mod, tid, r, q, sec()); t.uid = 'T'; s.gear.push(t); s.tools.mining = 'T';
      ['head', 'body', 'hands', 'feet'].forEach((p) => { const id = Object.keys(items).find((x) => items[x].section === 'outfit' && items[x].outfitSet === 'gather' && items[x].slot === p && items[x].tier === tier)!;
        const g = mk(mod, id, r, q, sec()); g.uid = 'O' + p; s.gear.push(g); s.workOutfit.gather[p] = g.uid; });
      const wb = E.workBonus(s, 'mining');
      return (E.incomePerHour(s, 'mine_silver', { withGear: true }) * (1 + wb.totals.double / 100) / E.incomePerHour(s, 'mine_silver') - 1) * 100;
    };
    const t1 = gain(1, 0, 50, [], 1); expect(t1).toBeGreaterThanOrEqual(1.5); expect(t1).toBeLessThanOrEqual(2.5);
    const t3 = gain(3, 2, 50, ['bountiful', 'keen_eyed', 'brisk'], 1); expect(t3).toBeGreaterThanOrEqual(5); expect(t3).toBeLessThanOrEqual(7);
    const t5 = gain(5, 5, 97, ['brisk', 'bountiful'], 1.2); expect(t5).toBeLessThanOrEqual(11); expect(t5).toBeGreaterThan(9);
  });

  it('expected gains: a T1 Common work kit gives +2% income', async () => {
    const { E, mod } = await freshEngine();
    const s = E.newState(); s.skills.mining.xp = E.xpForLevel(40);
    ['hessian_field_gloves', 'hessian_field_boots', 'anglers_hat', 'foragers_satchel'].forEach((id, i) => {
      const g = mk(mod, id, 0, 50); g.uid = 'O' + i; s.gear.push(g); expect(E.equip(s, g.uid).ok).toBe(true);
    });
    const wb = E.workBonus(s, 'mining');
    expect(wb.totals).toMatchObject({ speed: 1, double: 1 });
    const gain = E.incomePerHour(s, 'mine_silver', { withGear: true }) * (1 + wb.totals.double / 100) / E.incomePerHour(s, 'mine_silver') - 1;
    expect(gain * 100).toBeCloseTo(2.01, 1);
  });

  it('the starter hessian robe (Common, Rough) shows its cloth profile only: no bonus or affix line', async () => {
    const { E } = await freshEngine();
    const s = E.newState(); const d = E.gearDetail(s, s.equipped.chest);
    expect(d).toMatchObject({ itemId: 'hessian_robe', rarity: 'common', gradeName: 'Rough', affixes: [] });
    expect(d.stats.map((l: any) => l.key)).toEqual(['def', 'heal', 'hp']); // cloth: defence + healing; a chest adds HP = 2.5 x defence
    expect(E.playerStats(s).maxHp).toBe(600 + d.stats.find((l: any) => l.key === 'hp').value); // base 600 (x10 scale) + the robe
  });
});
