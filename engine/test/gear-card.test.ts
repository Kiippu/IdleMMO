// Gear card engine fields (2026-11-13, gear-card-contract.md): item score, maker, stat rows with icons, lore, specials,
// sell price, salvage preview, compare.scoreDelta, shop previews.
import { describe, expect, it } from 'vitest';
import { freshEngine } from './engine-helpers';

const RAR = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
const Q = [20, 50, 70, 87, 97];
const mk = (mod: any, itemId: string, r: number, quality: number) => {
  const it = mod.DATA.items[itemId];
  const g: any = { uid: 'x', itemId, rarity: RAR[r], quality, affixes: r > 0 ? [{ id: 'primary', roll: 1 }] : [] };
  if (it.section === 'fight') { g.dur = 100; g.maxDur = 100; } else if (it.section === 'tool') g.cond = 100;
  return g;
};

describe('gear card', () => {
  it('item score rises strictly with grade, with rarity at any grade, and with tier (same family), every item', async () => {
    const { E, mod } = await freshEngine();
    const items = mod.DATA.items; const S = (id: string, r: number, q: number) => E.gearScore(mk(mod, id, r, q));
    const ids = Object.keys(items).filter((k) => items[k].kind === 'gear');
    for (const id of ids) {
      for (let r = 0; r < 6; r++) for (let g = 1; g < 5; g++) expect(S(id, r, Q[g]), `${id} ${RAR[r]} grade ${g}`).toBeGreaterThan(S(id, r, Q[g - 1]));
      for (let r = 1; r < 6; r++) expect(S(id, r, Q[0]), `${id} ${RAR[r]} Rough vs ${RAR[r - 1]} Pristine`).toBeGreaterThan(S(id, r - 1, Q[4]));
    }
    const fam: Record<string, any[]> = {};
    ids.forEach((id) => { (fam[items[id].section + ':' + items[id].type] ||= []).push(items[id]); });
    for (const list of Object.values(fam)) { list.sort((a, b) => a.tier - b.tier);
      for (let i = 1; i < list.length; i++) for (let r = 0; r < 6; r++) for (const q of Q) expect(S(list[i].id, r, q), `${list[i].id}`).toBeGreaterThan(S(list[i - 1].id, r, q)); }
    // the formula: fight = round(10 x weighted role stats); T1 Common Standard bronze sword = 10 x (35.64 x 2.16 + 3.96 x 1.16) = 816
    expect(S('bronze_sword', 0, 50)).toBe(Math.round(10 * (35.64 * 2.16 + 3.96 * 1.16)));
    // work = round(200 x weighted effects); T1 Common Standard pickaxe: 200 x 2 x 1.0 = 400
    expect(S('bronze_pickaxe', 0, 50)).toBe(400);
  });

  it('detail carries score, maker, stat rows with icons, lore, specials [], sell price, salvage; gearInfo has the same score', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    const sw = E.gearDetail(s, s.equipped.weapon);
    expect(sw.score).toBe(E.gearInfo(s)[s.equipped.weapon].score);
    expect(sw.maker).toEqual({ kind: 'starter', text: 'Starter kit' });
    expect(sw.statRows).toEqual([
      { key: 'atk', label: 'Attack', icon: 'stat_atk', value: sw.stats[0].value, valueText: '+' + sw.stats[0].value, unit: 'pts' },
      { key: 'def', label: 'Defence', icon: 'stat_def', value: sw.stats[1].value, valueText: '+' + sw.stats[1].value, unit: 'pts' }]);
    expect(sw.lore).toMatch(/blade/);
    expect(sw.specials).toEqual([]);
    expect(sw.levelReq).toBe(1);
    expect(sw.sellPrice).toBeGreaterThan(0);
    expect(sw.salvage.length).toBeGreaterThan(0);
    const pick = E.gearDetail(s, s.tools.mining);
    expect(pick.statRows).toEqual([{ key: 'speed', label: 'Speed', icon: 'fx_speed', value: 1, valueText: '+1.0%', unit: 'pct' }]);
    // starter tools sell and salvage like any Common T1 tool (owner 2026-11-14); it is the only mining tool, so it is kept
    expect(pick.sellPrice).toBeGreaterThan(0); expect(pick.salvage.length).toBeGreaterThan(0);
    expect(pick.keepReason).toBe('Your last Mining tool: keep it.');
    // element and ward rows
    s.gear.push({ uid: 'fb', itemId: 'frostbite_saber', rarity: 'rare', quality: 50, affixes: [{ id: 'primary', roll: 1 }, { id: 'warded_fire', roll: 1 }], dur: 160, maxDur: 160 });
    s.gear.push({ uid: 'fb2', itemId: 'frostbite_saber', rarity: 'rare', quality: 50, affixes: [{ id: 'primary', roll: 1 }], dur: 160, maxDur: 160 });
    const fb = E.gearDetail(s, 'fb');
    expect(fb.statRows.map((r: any) => [r.icon, r.valueText])).toEqual(expect.arrayContaining([['el_frost', '+25.0%']]));
  });

  it('maker is set at creation: crafted by the player ("You" or state.playerName), shop, starter; old pieces show nothing', async () => {
    const h = await freshEngine(); const { E, mod } = h;
    const s = E.newState();
    const act = mod.DATA.actions.find((a: any) => a.id === 'bronze_sword');
    Object.keys(act.inputs).forEach((id) => { s.inv[id] = [0, 100, 0, 0, 0]; });
    E.start(s, 'bronze_sword', 1); for (let i = 0; i < 20 && s.active; i++) { h.advance(1000); E.tick(s, 1); }
    const made = s.gear[s.gear.length - 1];
    expect(made.maker).toEqual({ kind: 'crafted', name: 'You' });
    expect(E.gearDetail(s, made.uid).maker).toEqual({ kind: 'crafted', name: 'You', text: 'Made by You' });
    s.playerName = 'Ana'; E.start(s, 'bronze_sword', 1); for (let i = 0; i < 20 && s.active; i++) { h.advance(1000); E.tick(s, 1); }
    expect(s.gear[s.gear.length - 1].maker).toEqual({ kind: 'crafted', name: 'Ana' });
    s.gold = 1e6; const slot = E.storeView(s).slots.find((x: any) => x.kind === 'gear'); const b = E.storeBuy(s, slot.slot, 1);
    expect(E.gearDetail(s, b.uids[0]).maker.text).toBe('Shop');
    // a v8 piece saved before the field: unknown, no text; the field survives save/load
    const old = s.gear.find((g: any) => g.uid === made.uid); delete old.maker;
    expect(E.gearDetail(s, made.uid).maker).toEqual({ kind: 'unknown', text: null });
    const back = E.migrate(JSON.parse(JSON.stringify(s)));
    expect(back.gear.find((g: any) => g.uid === s.equipped.weapon).maker).toEqual({ kind: 'starter' });
    expect(back.gear.find((g: any) => g.uid === made.uid).maker).toBeUndefined();
  });

  it('compare.scoreDelta = this score - the worn piece score; gearPreview shows a shop offer without touching state', async () => {
    const { E, mod } = await freshEngine();
    const s = E.newState();
    s.gear.push(mk(mod, 'iron_sword', 1, 50)); s.gear[s.gear.length - 1].uid = 'is';
    const d = E.gearDetail(s, 'is');
    expect(d.compare.scoreDelta).toBe(d.score - E.gearDetail(s, s.equipped.weapon).score);
    expect(d.compare.statRows.length).toBeGreaterThan(0);
    const before = JSON.stringify(s);
    const p = E.gearPreview(s, 'bronze_helm');
    expect(p).toMatchObject({ uid: '', itemId: 'bronze_helm', rarity: 'common', gradeName: 'Rough', repair: null, salvage: null, maker: { kind: 'shop', text: 'Shop' } });
    expect(p.score).toBe(E.gearScore(mk(mod, 'bronze_helm', 0, 30)));
    expect(JSON.stringify(s)).toBe(before);
    expect(E.gearPreview(s, 'copper_ore')).toBeNull();
  });

  it('every gear item has a lore line', async () => {
    const { E, mod } = await freshEngine();
    const s = E.newState();
    for (const id of Object.keys(mod.DATA.items).filter((k) => mod.DATA.items[k].kind === 'gear')) expect(E.gearPreview(s, id).lore, id).toBeTruthy();
  });
});
