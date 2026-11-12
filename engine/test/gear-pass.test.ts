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
  it('lists stats, affixes with plain labels, and compares against the worn piece', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    // epic Rough bronze sword with Keen +3, Hale +10, Swift +5
    piece(s, 'gE', 'bronze_sword', 'epic', 20, [{ id: 'keen', value: 3 }, { id: 'hale', value: 10 }, { id: 'swift', value: 5 }], 200, 200);
    const d = E.gearDetail(s, 'gE');
    expect(d).toMatchObject({ uid: 'gE', itemId: 'bronze_sword', slot: 'weapon', rarity: 'epic', grade: 0, gradeName: 'Rough', dur: 200, maxDur: 200, equipped: false });
    expect(d.name).toBe('Keen Bronze sword');
    // 7 atk x 1.5 x 0.85 = 8.925 → 9, + Keen 3 = 12
    expect(d.stats).toEqual([
      { key: 'atk', label: 'Attack', value: 12 },
      { key: 'hp', label: 'Max HP', value: 10 },
      { key: 'speed', label: 'Speed', value: 5 },
    ]);
    expect(d.affixes.map((a: any) => a.label)).toEqual(['Keen: +3 Attack', 'Hale: +10 Max HP', 'Swift: +5% Speed']);
    expect(d.affixes[0]).toMatchObject({ id: 'keen', value: 3, stat: 'atk' });
    expect(d.value).toBe(E.gearValue(s.gear.find((g: any) => g.uid === 'gE')));
    // worn: the starter training sword (atk 3, Standard common)
    const worn = s.equipped.weapon;
    expect(d.compare.uid).toBe(worn);
    expect(d.compare.stats).toEqual([{ key: 'atk', label: 'Attack', value: 3 }]);
    expect(d.compare.diff).toEqual([
      { key: 'atk', label: 'Attack', mine: 12, theirs: 3, delta: 9 },
      { key: 'hp', label: 'Max HP', mine: 10, theirs: 0, delta: 10 },
      { key: 'speed', label: 'Speed', mine: 5, theirs: 0, delta: 5 },
    ]);
  });

  it('no compare for the worn piece itself or an empty slot; null for an unknown uid; broken shows nominal stats', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    const d = E.gearDetail(s, s.equipped.weapon);
    expect(d.equipped).toBe(true);
    expect(d.compare).toBeNull();
    expect(E.gearDetail(s, 'nope')).toBeNull();
    piece(s, 'gB', 'bronze_sword', 'uncommon', 70, [{ id: 'of_embers', value: 4 }, { id: 'enduring', value: 20 }], 0, 156);
    const b = E.gearDetail(s, 'gB');
    expect(b.broken).toBe(true);
    expect(b.stats.map((x: any) => x.key)).toEqual(['atk', 'fire', 'durPct']);
    expect(b.stats.find((x: any) => x.key === 'fire').label).toBe('Fire');
    expect(b.affixes.map((a: any) => a.label)).toEqual(['of Embers: +4 Fire', 'Enduring: +20% Durability']);
  });

  it('a ring compares against the worn ring only when one is worn', async () => {
    const { E, mod } = await freshEngine();
    const s = E.newState();
    const ringId = Object.keys(mod.DATA.items).find((id) => mod.DATA.items[id].slot === 'ring')!;
    piece(s, 'r1', ringId); piece(s, 'r2', ringId, 'rare', 85, [{ id: 'sturdy', value: 2 }, { id: 'keen', value: 1 }], 160, 160);
    expect(E.gearDetail(s, 'r2').compare).toBeNull();
    E.equip(s, 'r1');
    const c = E.gearDetail(s, 'r2').compare;
    expect(c.uid).toBe('r1');
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
    piece(s, 'f', 'bronze_sword', 'uncommon', 50, [{ id: 'keen', value: 2 }], 130, 130);
    piece(s, 'g', 'bronze_sword');
    s.loadouts.push({ id: 'L1', name: 'x', slots: { weapon: 'g' } });
    const info = E.gearInfo(s);
    expect(info.a).toEqual({ grade: 1, equipped: false, inLoadout: false, stackKey: 'bronze_sword|1' });
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

describe('E.gearDetail effects (gear tags)', () => {
  it('a copper pickaxe shows Mining speed, scaled by rarity, nominal when broken', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    piece(s, 'pC', 'copper_pickaxe');                         // common Standard: 0.15
    piece(s, 'pU', 'copper_pickaxe', 'uncommon');             // x1.15 = 0.1725 → 17.3%
    piece(s, 'pB', 'copper_pickaxe', 'common', 50, [], 0);    // broken: still shows what repair gives back
    expect(E.gearDetail(s, 'pC').effects).toEqual([{ key: 'mining', label: 'Mining speed', value: 15, unit: 'pct', text: 'Mining speed +15%' }]);
    expect(E.gearDetail(s, 'pU').effects).toEqual([{ key: 'mining', label: 'Mining speed', value: 17.3, unit: 'pct', text: 'Mining speed +17.3%' }]);
    expect(E.gearDetail(s, 'pB').effects.map((e: any) => e.text)).toEqual(['Mining speed +15%']);
  });
  it('words yield, drops and quality, skips combat tags and the Swift speed affix', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    piece(s, 'f', 'foragers_satchel');
    piece(s, 'h', 'leather_cap');
    piece(s, 'q', 'gemstone_ring', 'common', 50, [{ id: 'swift', value: 5 }]);
    expect(E.gearDetail(s, 'f').effects.map((e: any) => e.text)).toEqual(['Foraging yield +15%']);
    expect(E.gearDetail(s, 'h').effects.map((e: any) => e.text)).toEqual(['Hunting drops +5%']);
    expect(E.gearDetail(s, 'q').effects).toEqual([{ key: 'quality', label: 'Crafting quality', value: 3, unit: 'pts', text: 'Crafting quality +3' }]);
  });
  it('compare carries the worn piece effects', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    piece(s, 'old', 'copper_pickaxe');
    piece(s, 'new', 'iron_pickaxe');
    expect(E.equip(s, 'old').ok).toBe(true);
    const d = E.gearDetail(s, 'new');
    expect(d.effects.map((e: any) => e.text)).toEqual(['Mining speed +25%']);
    expect(d.compare.effects.map((e: any) => e.text)).toEqual(['Mining speed +15%']);
  });
});
