// Gear overhaul verbs and rules (2026-11-12): equip routing by section, rings / two-handers, tool wear and its
// speed penalty, tool repair, work effects in actions, crafted quality, shop tools, salvage and vault for all sections.
import { describe, expect, it } from 'vitest';
import { freshEngine } from './engine-helpers';

const add = (s: any, uid: string, itemId: string, mod: any, rarity = 'common', quality = 50, affixes: any[] = []) => {
  const it = mod.DATA.items[itemId]; const g: any = { uid, itemId, rarity, quality, affixes: rarity === 'common' ? affixes : [{ id: 'primary', roll: 1 }, ...affixes] };
  if (it.section === 'fight') { g.dur = 100; g.maxDur = 100; } else if (it.section === 'tool') g.cond = 100;
  s.gear.push(g); return g;
};

describe('equip routing', () => {
  it('tools go to their skill slot, outfit pieces to their set + piece, and the replaced piece is reported', async () => {
    const { E, mod } = await freshEngine();
    const s = E.newState(); const old = s.tools.mining;
    add(s, 'p2', 'iron_pickaxe', mod);
    expect(E.equip(s, 'p2')).toEqual({ ok: true, reason: '', section: 'tool', at: { section: 'tool', skill: 'mining' }, replaced: old });
    expect(s.tools.mining).toBe('p2');
    add(s, 'gl', 'linen_work_gloves', mod);
    expect(E.equip(s, 'gl')).toMatchObject({ ok: true, section: 'outfit', at: { section: 'outfit', set: 'refine', piece: 'hands' }, replaced: null });
    expect(s.workOutfit.refine.hands).toBe('gl');
    expect(E.unequipGear(s, 'gl')).toEqual({ ok: true, reason: '' });
    expect(s.workOutfit.refine.hands).toBeNull();
    expect(E.unequipGear(s, 'gl').ok).toBe(false);
    // tools and outfit add nothing to fight stats
    const p0 = E.playerStats(s); E.equip(s, 'gl'); expect(E.playerStats(s)).toEqual(p0);
  });

  it('a two-handed weapon takes the offhand off; an offhand is refused while it is worn; rings fill ring1 then ring2', async () => {
    const { E, mod } = await freshEngine();
    const s = E.newState();
    add(s, 'sh', 'pine_shield', mod); expect(E.equip(s, 'sh').ok).toBe(true);
    add(s, 'gs', 'bronze_greatsword', mod); expect(E.equip(s, 'gs').ok).toBe(true);
    expect(s.equipped.offhand).toBeNull();
    expect(E.equip(s, 'sh')).toMatchObject({ ok: false, reason: 'Your two-handed weapon needs both hands.' });
    add(s, 'a', 'copper_band', mod); add(s, 'b', 'copper_band', mod); add(s, 'c', 'copper_band', mod, 'rare');
    E.equip(s, 'a'); E.equip(s, 'b');
    expect([s.equipped.ring1, s.equipped.ring2]).toEqual(['a', 'b']);
    expect(E.equip(s, 'c', 'ring2')).toMatchObject({ ok: true, at: { section: 'fight', slot: 'ring2' }, replaced: 'b' });
    expect(E.equip(s, 'c', 'ring1')).toMatchObject({ ok: true, at: { section: 'fight', slot: 'ring1' }, replaced: 'a' });
    expect([s.equipped.ring1, s.equipped.ring2]).toEqual(['c', null]); // moved, not duplicated
    add(s, 'am', 'copper_torc', mod); expect(E.equip(s, 'am').at).toEqual({ section: 'fight', slot: 'amulet' });
  });

  it('a worn tool or outfit piece is "In use" for salvage and the store; the vault takes it off', async () => {
    const { E, mod } = await freshEngine();
    const s = E.newState(); const pick = s.tools.mining;
    expect(E.salvage(s, [pick]).blocked).toEqual([{ uid: pick, reason: 'In use. Take it off first.' }]);
    expect(E.storeSellGear(s, pick)).toMatchObject({ ok: false, reason: 'In use. Take it off first.' });
    add(s, 'p2', 'bronze_pickaxe', mod);
    const r = E.salvage(s, ['p2']);
    expect(r.ok).toBe(true); expect(r.salvaged).toBe(1);
    // the free starter tools are loaners: never sold or salvaged, even once taken off
    E.unequipGear(s, pick);
    expect(E.storeSellGear(s, pick).reason).toBe("A starter tool: it can't be sold or salvaged.");
    expect(E.salvage(s, [pick], { allowProtected: true }).blocked[0].reason).toBe("A starter tool: it can't be sold or salvaged.");
    expect(E.storeView(s).gearSellPrices[pick]).toBe(0);
    expect(E.gearInfo(s)[pick]).toMatchObject({ starter: true, stackKey: null });
    E.equip(s, pick);
    E.vaultDepositGear(s, pick);
    expect(s.tools.mining).toBeNull();
  });
});

describe('tool wear and repair', () => {
  it('-1% condition per hour of work, slower for rarer tools; below 50/25/10% the action is 3/5/8% slower', async () => {
    const h = await freshEngine(); const { E, mod } = h;
    const s = E.newState(); const pick = s.gear.find((g: any) => g.uid === s.tools.mining);
    E.start(s, 'mine_copper');
    for (let i = 0; i < 60; i++) { h.advance(60000); E.tick(s, 60); }
    expect(pick.cond).toBeCloseTo(99, 1);
    const t100 = E.actionTime(s, 'mine_copper');
    expect(t100).toBeCloseTo(3 / 1.01, 9);
    for (const [cond, pen] of [[49, 3], [24, 5], [9, 8], [1, 8]]) {
      pick.cond = cond;
      expect(E.workBonus(s, 'mining').wear).toBe(pen);
      expect(E.actionTime(s, 'mine_copper')).toBeCloseTo(3 / (1 + (1 - pen) / 100), 9);
    }
    // a Rare tool wears 1 / (1 + 0.2 x 2) as fast
    add(s, 'rp', 'bronze_pickaxe', mod, 'rare'); E.equip(s, 'rp');
    const { wearTool } = await import('../src/gear');
    wearTool(s, 'mining', 3600 * 1.4);
    expect(s.gear.find((g: any) => g.uid === 'rp').cond).toBeCloseTo(99, 9);
    wearTool(s, 'mining', 3600 * 1e4);
    expect(s.gear.find((g: any) => g.uid === 'rp').cond).toBe(1); // never breaks
  });

  it('repair: 100g per 10% x tier factor (1/2/4); repair all refuses when short, else restores every tool', async () => {
    const { E, mod } = await freshEngine();
    const s = E.newState();
    const t1 = s.gear.find((g: any) => g.uid === s.tools.mining); t1.cond = 50;
    add(s, 't2', 'iron_saw', mod).cond = 80; add(s, 't3', 'steel_chisel', mod).cond = 90;
    expect(E.repairCost(s, t1.uid).gold).toBe(500);
    expect(E.repairCost(s, 't2').gold).toBe(400);
    expect(E.repairCost(s, 't3').gold).toBe(400);
    expect(E.toolRepairAll(s)).toEqual({ count: 3, gold: 1300 });
    expect(E.derivedExtras(s).toolRepair).toEqual({ count: 3, gold: 1300 });
    s.gold = 1000;
    expect(E.repairAllTools(s)).toMatchObject({ ok: false, count: 0 });
    expect(s.gold).toBe(1000);
    expect(E.repair(s, 't2')).toMatchObject({ ok: true, gold: 400, cond: 100 });
    expect(s.gold).toBe(600);
    s.gold = 2000;
    expect(E.repairAllTools(s)).toMatchObject({ ok: true, gold: 900, count: 2 });
    expect(s.gold).toBe(1100);
    expect(t1.cond).toBe(100);
    expect(E.repair(s, 't3')).toMatchObject({ ok: false, reason: 'It is already in perfect condition.' });
  });
});

describe('work effects in actions', () => {
  const kit = (E: any, mod: any, s: any, set: string, tier: string, rarity = 'mythic', quality = 97, affixFor = (_: string) => [] as any[]) => {
    const ids = Object.keys(mod.DATA.items).filter((id) => { const it = mod.DATA.items[id]; return it.section === 'outfit' && it.outfitSet === set && it.material === tier; });
    expect(ids).toHaveLength(4);
    ids.forEach((id, i) => { add(s, set + i, id, mod, rarity, quality, affixFor(id)); expect(E.equip(s, set + i).ok).toBe(true); });
  };
  it("gathering: Double output doubles a rep's output at its chance; Bonus find raises bonus drop odds", async () => {
    const h = await freshEngine(4); const { E, mod } = h;
    const s = E.newState();
    kit(E, mod, s, 'gather', 'silk', 'mythic', 97, () => [{ id: 'bountiful', roll: 1.2 }, { id: 'keen_eyed', roll: 1.2 }, { id: 'bountiful', roll: 1.2 }, { id: 'keen_eyed', roll: 1.2 }]);
    const wb = E.workBonus(s, 'mining');
    expect(wb.totals.double).toBeGreaterThan(4.5); expect(wb.totals.double).toBeLessThanOrEqual(5); expect(wb.totals.find).toBeGreaterThan(20);
    E.start(s, 'mine_copper', 4000);
    for (let i = 0; i < 400 && s.active; i++) { h.advance(60000); E.tick(s, 60); }
    const ore = (s.inv.copper_ore || []).reduce((a: number, b: number) => a + b, 0);
    expect(ore / 4000).toBeGreaterThan(1 + wb.totals.double / 100 - 0.015);
    expect(ore / 4000).toBeLessThan(1 + wb.totals.double / 100 + 0.015);
    const gems = (s.inv.rough_gem || []).reduce((a: number, b: number) => a + b, 0);
    expect(gems / 4000).toBeGreaterThan(0.02 * 1.1); // base 2%, Bonus find relative +20%+
  });

  it('refining: Save input gives back an input unit at its chance', async () => {
    const h = await freshEngine(5); const { E, mod } = h;
    const s = E.newState();
    kit(E, mod, s, 'refine', 'silk', 'mythic', 97, () => [{ id: 'thrifty', roll: 1.2 }, { id: 'thrifty', roll: 1.2 }, { id: 'thrifty', roll: 1.2 }, { id: 'thrifty', roll: 1.2 }]);
    const save = E.workBonus(s, 'smelting').totals.save;
    expect(save).toBeGreaterThan(4.5); expect(save).toBeLessThanOrEqual(5);
    s.inv.copper_ore = [0, 10000, 0, 0, 0];
    E.start(s, 'smelt_copper', 3000);
    for (let i = 0; i < 400 && s.active; i++) { h.advance(60000); E.tick(s, 60); }
    const used = 10000 - s.inv.copper_ore.reduce((a: number, b: number) => a + b, 0);
    expect(used / 6000).toBeLessThan(1 - save / 200 + 0.01); // one of the 2 ore back per save
    expect(used / 6000).toBeGreaterThan(1 - save / 200 - 0.01);
  });

  it('crafted quality: 0.5 x inputs + 25 + level gap - 3 x (tier - 1) + mastery + quality points', async () => {
    const { E, mod } = await freshEngine();
    const s = E.newState();
    Object.keys(s.tools).forEach((k) => { s.tools[k] = null; });
    const act = mod.DATA.actions.find((a: any) => a.id === 'bronze_sword');
    Object.keys(act.inputs).forEach((id) => { s.inv[id] = [0, 50, 0, 0, 0]; });
    // at recipe level 1, Standard inputs (midpoint 49.5), T1, no mastery: 24.75 + 25 = 49.75 → 50 Standard
    expect(E.craftQuality(s, 'bronze_sword')).toEqual({ expected: 50, min: 46, max: 54, grade: 1 });
    // the starter smith's hammer adds 2 quality points
    s.tools.smithing = E.newState().tools.smithing; s.gear.push(E.newState().gear.find((g: any) => g.itemId === 'pine_smith_hammer'));
    s.tools.smithing = s.gear[s.gear.length - 1].uid;
    expect(E.craftQuality(s, 'bronze_sword').expected).toBe(52);
    // +30 levels (capped), Pristine inputs, Grandmaster: Pristine
    Object.keys(act.inputs).forEach((id) => { s.inv[id] = [0, 0, 0, 0, 50]; });
    s.skills.smithing.xp = E.xpForLevel(40); s.mastery.bronze_sword = 10000;
    expect(E.craftQuality(s, 'bronze_sword').grade).toBe(4);
    // a T3 recipe at its level with Standard inputs loses 6
    const t3 = mod.DATA.actions.find((a: any) => a.id === 'steel_sword' || a.id === 'frostbite_saber');
    Object.keys(t3.inputs).forEach((id) => { s.inv[id] = [0, 50, 0, 0, 0]; });
    s.skills.smithing.xp = E.xpForLevel(t3.level); s.mastery[t3.id] = 0;
    expect(E.craftQuality(s, t3.id).expected).toBe(Math.round(49.75 - 6 + 2));
  });

  it('Fortunate (rarity odds) multiplies the rarity odds total; tools and outfit add nothing to raid power', async () => {
    const { E, mod } = await freshEngine();
    const s = E.newState();
    const p0 = E.procOdds(s, 'bronze_sword').mods.total;
    kit(E, mod, s, 'craft', 'silk', 'mythic', 97, () => [{ id: 'fortunate', roll: 1 }, { id: 'fortunate', roll: 1 }, { id: 'fortunate', roll: 1 }, { id: 'fortunate', roll: 1 }]);
    const r = E.workBonus(s, 'smithing').totals.rarity;
    expect(r).toBeGreaterThan(10);
    expect(E.procOdds(s, 'bronze_sword').mods.total).toBeCloseTo(p0 * (1 + r / 100), 9);
    for (const role of ['guardian', 'mender', 'striker']) {
      const bare = JSON.parse(JSON.stringify(s)); bare.workOutfit = { gather: {}, refine: {}, craft: {} }; bare.tools = {};
      expect(E.rolePower(s, role, 'equipped')).toBe(E.rolePower(bare, role, 'equipped'));
    }
  });

  it("assisting a crewmate uses your tool speed and wears it; activeWork names the job's tool", async () => {
    const h = await freshEngine(); const { E } = h;
    const s = E.newState();
    const job = E.postCrewJob(s, 'smelt_copper'); job.qty = 5000;
    E.assist(s, job.id);
    expect(E.activeWork(s)).toMatchObject({ actionId: 'smelt_copper', skill: 'smelting', kind: 'refine', set: 'refine', toolUid: s.tools.smelting });
    for (let i = 0; i < 60; i++) { h.advance(60000); E.tick(s, 60); }
    expect(s.gear.find((g: any) => g.uid === s.tools.smelting).cond).toBeCloseTo(99, 1);
  });
});

describe('shop tools', () => {
  it('all 15 Common T1 tools (Rough) are always on sale at 1,000g; buying puts one in the bag, not in the slot', async () => {
    const { E, mod } = await freshEngine();
    const s = E.newState(); s.gold = 1100;
    const shelf = E.derivedExtras(s).store.tools;
    expect(shelf).toHaveLength(15);
    expect(new Set(shelf.map((t: any) => t.skill)).size).toBe(15);
    shelf.forEach((t: any) => { expect(t).toMatchObject({ price: 1000, rarity: 'common' }); expect(mod.DATA.items[t.itemId]).toMatchObject({ section: 'tool', tier: 1 }); });
    const before = s.tools.fishing;
    const r = E.storeBuyTool(s, 'pine_fishing_rod');
    expect(r).toMatchObject({ ok: true, qty: 1, gold: 1000 });
    expect(s.gold).toBe(100);
    const g = s.gear.find((x: any) => x.uid === r.uids[0]);
    expect(g).toMatchObject({ itemId: 'pine_fishing_rod', rarity: 'common', quality: 30, cond: 100 });
    expect(E.gradeOf(g.quality)).toBe(0); // Rough
    expect(g.affixes).toEqual([]);
    expect(g.starter).toBeUndefined(); // a bought tool can be sold and salvaged
    expect(s.tools.fishing).toBe(before);
    expect(E.storeBuyTool(s, 'pine_fishing_rod')).toMatchObject({ ok: false });
    expect(E.storeBuyTool(s, 'iron_pickaxe').reason).toBe('That tool is not on sale.');
    // the hourly gear rotation sells T1 fight gear only, Common and Rough
    for (let hr = 0; hr < 50; hr++) { const { stockFor } = await import('../src/store'); stockFor(s, hr).filter((x: any) => x.kind === 'gear').forEach((x: any) => {
      expect(mod.DATA.items[x.itemId]).toMatchObject({ section: 'fight', tier: 1 }); }); }
    s.gold = 1e6; const slot = E.storeView(s).slots.find((x: any) => x.kind === 'gear');
    const b = E.storeBuy(s, slot.slot, 1); expect(b.ok).toBe(true);
    expect(s.gear.find((x: any) => x.uid === b.uids[0])).toMatchObject({ rarity: 'common', quality: 30, affixes: [] });
  });
});
