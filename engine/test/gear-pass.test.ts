// Gear pass (2026-11-12, gear-pass-contract.md): E.gearDetail, E.gearInfo (common stacking), craft gain
// events, mass salvage in one call.
import { describe, expect, it } from 'vitest';
import { freshEngine } from './engine-helpers';

const piece = (s: any, uid: string, itemId: string, rarity = 'common', quality = 50, affixes: any[] = [], dur = 100, maxDur = 100) => {
  const g = { uid, itemId, rarity, quality, affixes, dur, maxDur }; s.gear.push(g); return g;
};
function run(h: any, s: any, n = 300) {
  const evs: any[] = [];
  for (let i = 0; i < n && s.active; i++) { h.advance(1000); evs.push(...h.E.tick(s, 1)); }
  return evs;
}

describe('E.gearDetail', () => {
  it('lists final x10 stats, affixes with plain labels, and compares against the worn piece', async () => {
    const { E, mod } = await freshEngine();
    const s = E.newState();
    // epic Rough bronze sword: primary + Soothing + Hale (rolls 1)
    piece(s, 'gE', 'bronze_sword', 'epic', 20, [{ id: 'primary', roll: 1 }, { id: 'soothing', roll: 1 }, { id: 'hale', roll: 1 }], 200, 200);
    const d = E.gearDetail(s, 'gE');
    expect(d).toMatchObject({ uid: 'gE', itemId: 'bronze_sword', section: 'fight', slot: 'weapon', type: 'sword', material: 'bronze', tier: 1,
      rarity: 'epic', grade: 0, gradeName: 'Rough', dur: 200, maxDur: 200, equipped: false, worn: null, role: 'striker', hands: 1 });
    expect(d.name).toBe('Soothing Bronze sword');
    // base = 60 x 0.66 = 39.6 budget; atk 0.9 → 35.64 x (0.97 + 3 x 0.12) = 47.4 → 47; the rarity bonus lifts every base stat,
    // and the backstop keeps each one 1 above the rarity below at Pristine: def 3.96 → Common 4 … Epic Rough 7;
    // Soothing = 39.6 x 5% = 2; Hale = 39.6 x 5% x 2.5 = 5 on the x10 scale → 1 HP (HP x2 scale)
    expect(d.stats).toEqual([
      { key: 'atk', label: 'Attack', value: 47, unit: 'pts', text: 'Attack +47' },
      { key: 'def', label: 'Defence', value: 7, unit: 'pts', text: 'Defence +7' },
      { key: 'heal', label: 'Healing', value: 2, unit: 'pts', text: 'Healing +2' },
      { key: 'hp', label: 'Max HP', value: 1, unit: 'pts', text: 'Max HP +1' },
    ]);
    expect(d.affixes.map((a: any) => a.label)).toEqual(['Epic bonus: Attack +12, Defence +3', 'Soothing: Healing +2', 'Hale: Max HP +1']);
    expect(d.effects).toEqual([]);
    expect(d.value).toBe(E.gearValue(s.gear.find((g: any) => g.uid === 'gE')));
    // worn: the starter bronze sword (Common, Rough): atk 35, def 4
    const worn = s.equipped.weapon;
    expect(d.compare.uid).toBe(worn);
    expect(d.compare.at).toEqual({ section: 'fight', slot: 'weapon' });
    expect(d.compare.diff).toEqual([
      { key: 'atk', label: 'Attack', unit: 'pts', mine: 47, theirs: 35, delta: 12 },
      { key: 'def', label: 'Defence', unit: 'pts', mine: 7, theirs: 4, delta: 3 },
      { key: 'heal', label: 'Healing', unit: 'pts', mine: 2, theirs: 0, delta: 2 },
      { key: 'hp', label: 'Max HP', unit: 'pts', mine: 1, theirs: 0, delta: 1 },
    ]);
    expect(d.compare.power.striker.delta).toBe(Math.round(47 * 2.16) - Math.round(35 * 2.16)); // ROLE_POWER.striker.atk
    void mod;
  });

  it('no compare for the worn piece itself or an empty slot; null for an unknown uid; broken shows nominal stats', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    const d = E.gearDetail(s, s.equipped.weapon);
    expect(d.equipped).toBe(true);
    expect(d.worn).toEqual({ section: 'fight', slot: 'weapon' });
    expect(d.compare).toBeNull();
    expect(E.gearDetail(s, 'nope')).toBeNull();
    piece(s, 'gH', 'bronze_helm');
    expect(E.gearDetail(s, 'gH').compare).toBeNull(); // head slot empty
    piece(s, 'gB', 'bronze_sword', 'rare', 70, [{ id: 'primary', roll: 1 }, { id: 'of_embers', roll: 1 }, { id: 'enduring', roll: 1 }], 0, 192);
    const b = E.gearDetail(s, 'gB');
    expect(b.broken).toBe(true);
    expect(b.stats.map((x: any) => x.key)).toEqual(['atk', 'def', 'fire']);
    expect(b.stats.find((x: any) => x.key === 'fire')).toEqual({ key: 'fire', label: 'Fire damage', value: 5, unit: 'pct', text: 'Fire damage +5.0%' });
    expect(b.affixes.map((a: any) => a.label)).toEqual([expect.stringMatching(/^Rare bonus: Attack \+\d+, Defence \+\d+$/), 'of Embers: Fire damage +5.0%', 'Enduring: +20% max durability']);
    expect(b.name).toBe('Enduring Bronze sword of Embers');
    expect(b.repair).toMatchObject({ can: true });
  });

  it('a ring compares against the ring it would replace: none while a ring slot is empty, else the weaker one', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    piece(s, 'r1', 'copper_band'); piece(s, 'r2', 'copper_signet', 'rare', 85, [{ id: 'primary', roll: 1 }, { id: 'sturdy', roll: 1 }], 160, 160);
    piece(s, 'r3', 'copper_loop');
    expect(E.equip(s, 'r1')).toMatchObject({ ok: true, at: { section: 'fight', slot: 'ring1' }, replaced: null });
    expect(E.gearDetail(s, 'r2').compare).toBeNull(); // ring2 is empty
    expect(E.equip(s, 'r2')).toMatchObject({ ok: true, at: { section: 'fight', slot: 'ring2' } });
    const c = E.gearDetail(s, 'r3').compare;
    expect(c.uid).toBe('r1'); // the common band is weaker than the rare signet
    expect(c.at).toEqual({ section: 'fight', slot: 'ring1' });
    expect(c.diff.every((x: any) => x.delta === x.mine - x.theirs)).toBe(true);
  });
});

describe('E.gearInfo (common stacking)', () => {
  it('stackKey only for common, unequipped, out-of-loadout, full and never-repaired pieces', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    piece(s, 'a', 'bronze_sword'); piece(s, 'b', 'bronze_sword', 'common', 55);
    piece(s, 'c', 'bronze_sword', 'common', 65); // Fine
    piece(s, 'd', 'bronze_sword', 'common', 50, [], 60, 100); // worn down
    piece(s, 'e', 'bronze_sword', 'common', 50, [], 80, 80); // repaired
    piece(s, 'f', 'bronze_sword', 'uncommon', 50, [{ id: 'primary', roll: 1 }], 130, 130);
    piece(s, 'g', 'bronze_sword');
    s.loadouts.push({ id: 'L1', name: 'x', slots: { weapon: 'g' } });
    const info = E.gearInfo(s);
    expect(info.a).toEqual({ section: 'fight', worn: null, grade: 1, equipped: false, inLoadout: false, stackKey: 'bronze_sword|1', low: false, score: E.gearScore(s.gear.find((g: any) => g.uid === 'a')) });
    expect(info.b.stackKey).toBe('bronze_sword|1');
    expect(info.c.stackKey).toBe('bronze_sword|2');
    expect(info.d.stackKey).toBeNull();
    expect(info.e.stackKey).toBeNull();
    expect(info.f.stackKey).toBeNull();
    expect(info.g).toMatchObject({ inLoadout: true, stackKey: null });
    expect(info[s.equipped.weapon]).toMatchObject({ equipped: true, stackKey: null });
    expect(E.derivedExtras(s).gearInfo.a.stackKey).toBe('bronze_sword|1');
  });

  it('salvages a large stack in one call: atomic, deduped, one gain event', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    const uids: string[] = [];
    for (let i = 0; i < 300; i++) { piece(s, 'm' + i, 'bronze_sword'); uids.push('m' + i); }
    E.takeEvents();
    const before = s.gear.length;
    const r = E.salvage(s, uids.concat(uids.slice(0, 10), [s.equipped.weapon]), {});
    expect(r.ok).toBe(true);
    expect(r.salvaged).toBe(300);
    expect(r.blocked).toHaveLength(1);
    expect(s.gear.length).toBe(before - 300);
    const ev = E.takeEvents();
    expect(ev).toHaveLength(1);
    expect(ev[0].source).toBe('salvage');
    expect(ev[0].items.reduce((a: number, i: any) => a + i.qty, 0)).toBe(r.items.reduce((a: number, i: any) => a + i.qty, 0));
  });
});

describe('craft gain events', () => {
  it('each crafted gear piece emits a craft gain with qty 1, rarity and uid; catch-up crafts come offline: true', async () => {
    const h = await freshEngine(); const { E, mod } = h;
    const s = E.newState();
    const craft = mod.DATA.actions.find((a: any) => a.kind === 'craft' && a.level === 1 && E.isGearCraft(a.id));
    Object.keys(craft.inputs).forEach((id) => { s.inv[id] = [0, 500, 0, 0, 0]; });
    s.skills[craft.skill].xp = E.xpForLevel(craft.level);
    E.takeEvents();
    E.start(s, craft.id, 3);
    const gains = run(h, s).filter((e) => e.type === 'gain' && e.source === 'craft');
    expect(gains).toHaveLength(3);
    gains.forEach((g) => {
      expect(g.offline).toBeUndefined();
      expect(g.items).toHaveLength(1);
      const it = g.items[0];
      const made = s.gear.find((x: any) => x.uid === it.uid);
      expect(made).toBeTruthy();
      expect(it).toMatchObject({ itemId: made.itemId, qty: 1, rarity: made.rarity, uid: made.uid });
      expect(typeof it.grade).toBe('number');
    });
    // offline catch-up: aggregated into one craft gain flagged offline, gear keeps uids
    E.start(s, craft.id, 4);
    E.takeEvents();
    const n0 = s.gear.length;
    h.advance(3600000);
    E.applyOffline(s, h.now());
    const off = E.takeEvents().filter((e: any) => e.source === 'craft');
    expect(off).toHaveLength(1);
    expect(off[0].offline).toBe(true);
    expect(off[0].items.every((i: any) => i.uid && i.rarity)).toBe(true);
    expect(off[0].items.length).toBe(s.gear.length - n0);
  });
});

describe('E.gearDetail effects (tools and work outfit)', () => {
  const tool = (s: any, uid: string, itemId: string, rarity = 'common', quality = 50, affixes: any[] = [], cond = 100) => {
    const g = { uid, itemId, rarity, quality, affixes, cond }; s.gear.push(g); return g;
  };
  it('a pickaxe shows Speed scaled by grade and rarity, one decimal; worn condition shows the penalty', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    tool(s, 'pC', 'bronze_pickaxe');                                            // 1.0
    tool(s, 'pU', 'bronze_pickaxe', 'uncommon', 50, [{ id: 'primary', roll: 1 }]); // 1.12, lifted to 1.2: one shown step above Common Pristine (1.1)
    tool(s, 'pW', 'bronze_pickaxe', 'common', 20, [], 24.4);                     // Rough 0.97; cond 24 → -5%
    expect(E.gearDetail(s, 'pC').effects).toEqual([{ key: 'speed', label: 'Speed', value: 1, unit: 'pct', text: 'Speed +1.0%' }]);
    expect(E.gearDetail(s, 'pU').effects).toEqual([{ key: 'speed', label: 'Speed', value: 1.2, unit: 'pct', text: 'Speed +1.2%' }]);
    expect(E.gearDetail(s, 'pU').affixes[0].label).toBe('Uncommon bonus: Speed +0.20%');
    const w = E.gearDetail(s, 'pW');
    expect(w).toMatchObject({ section: 'tool', toolSkill: 'mining', cond: 24, wear: 5, stats: [] });
    expect(w.effects[0].value).toBe(0.97);
    expect(w.repair).toMatchObject({ gold: 756, can: false }); // 75.6% missing: ceil(7.56 x 100g x tier factor 1); 150g on hand
  });
  it('the craft outfit lists quality for gear crafts and double output for food and potions', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    tool(s, 'ap', 'artisans_apron');
    delete s.gear.find((g: any) => g.uid === 'ap').cond;
    expect(E.gearDetail(s, 'ap').effects.map((e: any) => e.text)).toEqual(['Double output (food, potions) +0.25%', 'Quality (gear crafts) +0.50']);
    expect(E.gearDetail(s, 'ap').repair).toBeNull();
  });
  it('a tool compares with the one in its slot; final shows the skill totals now and if worn', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    tool(s, 'new', 'iron_pickaxe');
    const d = E.gearDetail(s, 'new');
    expect(d.effects.map((e: any) => e.text)).toEqual(['Speed +1.5%']);
    expect(d.compare.uid).toBe(s.tools.mining);
    expect(d.compare.at).toEqual({ section: 'tool', skill: 'mining' });
    expect(d.compare.effects.map((e: any) => e.text)).toEqual(['Speed +1.0%']);
    expect(d.compare.diff).toEqual([{ key: 'speed', label: 'Speed', unit: 'pct', mine: 1.5, theirs: 1, delta: 0.5 }]);
    expect(d.final.now.speed).toBe(1); expect(d.final.ifWorn.speed).toBe(1.5); // linear below half the cap
  });
});
