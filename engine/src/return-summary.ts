// Return moment (phase 3 layout pass, 2026-11-11). Extra, read-only views on what an offline catch-up
// produced, added to E.applyOffline's summary: a headline per skill, one "best find", loot grouped by item
// and gold broken down by source. Pure bookkeeping on events the catch-up already emits; changes no state.
/* eslint-disable */
import { E, arr, num, item, itemName, skillDefs, rarityIdx } from './core';

export type GoldSource = 'combat' | 'sales' | 'raid' | 'tips' | 'other';
export const GOLD_SOURCE_LABEL: Record<string, string> = { combat: 'Fighting', sales: 'Market sales', raid: 'Raid payout', tips: 'Crew tips', other: 'Other' };
const UNLOCK_NOUN: Record<string, [string, string]> = { gathering: ['node', 'nodes'], refining: ['recipe', 'recipes'], crafting: ['recipe', 'recipes'], combat: ['foe', 'foes'] };

/** levels of every known skill now (effective level, spec cap applied) */
export function levelSnapshot(state) {
  const out = {};
  skillDefs().forEach((d) => { out[d.id] = E.skillLevel(state, d.id); });
  Object.keys((state && state.skills) || {}).forEach((id) => { if (out[id] == null) out[id] = E.skillLevel(state, id); });
  return out;
}

/** accumulator fed by the catch-up's events */
export function newReturnAcc() {
  return { loot: {}, gear: [], gold: { combat: 0, sales: 0, raid: 0, tips: 0 } };
}
function addLoot(acc, itemId, grade, qty, fromRaid?) {
  if (!item(itemId) || !(qty > 0)) return;
  const g = Math.max(0, Math.min(4, Math.floor(num(grade, 1))));
  const e = acc.loot[itemId] || (acc.loot[itemId] = { byGrade: [0, 0, 0, 0, 0], raidQty: 0 });
  e.byGrade[g] += qty; if (fromRaid) e.raidQty += qty;
}
export function feedReturnAcc(state, acc, events) {
  arr(events).forEach((e) => {
    if (!e) return;
    if (e.type === 'complete') arr(e.items).forEach((i) => { if (!i.uid) addLoot(acc, i.itemId, i.grade, i.qty); });
    else if (e.type === 'craft' && e.gear) acc.gear.push(e.gear);
    else if (e.type === 'kill') acc.gold.combat += num(e.gold, 0);
    else if (e.type === 'sold') acc.gold.sales += num(e.gold, 0);
    else if (e.type === 'jobDone') acc.gold.tips += num(e.tip, 0);
    else if (e.type === 'raidResolved') {
      const r = arr(state.raid && state.raid.recaps).find((x) => x && x.id === e.recapId);
      const p = r && r.payout; if (!p) return;
      acc.gold.raid += num(p.gold, 0);
      arr(p.items).forEach((i) => addLoot(acc, i.itemId, i.grade, i.qty, true));
    }
  });
}

const itemRarity = (id) => (item(id) && item(id).rarity) || 'common';

/**
 * Build the return-moment fields. `levels0` = levelSnapshot before the catch-up; `xp` = summary.xp;
 * `goldTotal` = net gold change of the whole catch-up (residual goes to 'other').
 */
export function buildReturn(state, acc, levels0, xp, goldTotal) {
  // per-skill headline
  const skills = [];
  const ids = new Set(Object.keys(levels0).concat(Object.keys(xp || {})));
  ids.forEach((id) => {
    const from = num(levels0[id], 1); const to = E.skillLevel(state, id); const gained = num((xp || {})[id], 0);
    if (to <= from && !(gained > 0)) return;
    const def = skillDefs().find((d) => d.id === id) || { name: id, tier: '' };
    const unlocked = to > from ? E.actionsFor(id).filter((a) => num(a.level, 1) > from && num(a.level, 1) <= to).map((a) => a.id) : [];
    const noun = UNLOCK_NOUN[def.tier] || ['action', 'actions'];
    const headline = to > from
      ? `${def.name} ${from} → ${to}${unlocked.length ? `, ${unlocked.length} new ${unlocked.length === 1 ? noun[0] : noun[1]} unlocked` : ''}`
      : `${def.name} +${E.fmt(Math.round(gained))} XP`;
    skills.push({ skill: id, name: def.name, from, to, xp: gained, unlocked, unlockedCount: unlocked.length, headline });
  });
  skills.sort((a, b) => (b.to - b.from) - (a.to - a.from) || b.xp - a.xp);

  // loot grouped by item (stackables by grade; crafted gear counted per piece)
  const loot = [];
  Object.keys(acc.loot).forEach((id) => {
    const e = acc.loot[id]; const qty = e.byGrade.reduce((a, b) => a + b, 0); if (!(qty > 0)) return;
    const value = e.byGrade.reduce((a, q, g) => a + q * E.itemValue(id, g), 0);
    loot.push({ itemId: id, name: itemName(id), qty, byGrade: e.byGrade.slice(), rarity: itemRarity(id), value, raidQty: e.raidQty, gear: false });
  });
  const gearBy = {};
  acc.gear.forEach((g) => {
    const e = gearBy[g.itemId] || (gearBy[g.itemId] = { itemId: g.itemId, name: itemName(g.itemId), qty: 0, byGrade: [0, 0, 0, 0, 0], rarity: 'common', value: 0, raidQty: 0, gear: true, uids: [] });
    e.qty++; e.value += E.gearValue(g); e.uids.push(g.uid);
    if (rarityIdx(g.rarity) > rarityIdx(e.rarity)) e.rarity = g.rarity;
  });
  Object.keys(gearBy).forEach((k) => loot.push(gearBy[k]));
  loot.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

  // best find: rarest first, then highest unit value
  let best = null; const better = (c) => !best || c.rank > best.rank || (c.rank === best.rank && c.value > best.value);
  Object.keys(acc.loot).forEach((id) => acc.loot[id].byGrade.forEach((q, g) => {
    if (!(q > 0)) return;
    const c = { itemId: id, name: itemName(id), grade: g, qty: q, rarity: itemRarity(id), rank: rarityIdx(itemRarity(id)), value: E.itemValue(id, g), uid: null };
    if (better(c)) best = c;
  }));
  acc.gear.forEach((g) => {
    const c = { itemId: g.itemId, name: E.gearName(g), grade: null, qty: 1, rarity: g.rarity, rank: rarityIdx(g.rarity), value: E.gearValue(g), uid: g.uid };
    if (better(c)) best = c;
  });
  const bestFind = best ? { itemId: best.itemId, name: best.name, grade: best.grade, qty: best.qty, rarity: best.rarity, value: best.value, uid: best.uid } : null;

  // gold by source; whatever the known sources don't explain (escrow refunds, etc.) is 'other'
  const goldBySource = [];
  let known = 0;
  ['raid', 'combat', 'sales', 'tips'].forEach((s) => { const g = Math.round(num(acc.gold[s], 0)); known += g; if (g) goldBySource.push({ source: s, label: GOLD_SOURCE_LABEL[s], gold: g }); });
  const other = Math.round(num(goldTotal, 0)) - known;
  if (other) goldBySource.push({ source: 'other', label: GOLD_SOURCE_LABEL.other, gold: other });
  goldBySource.sort((a, b) => Math.abs(b.gold) - Math.abs(a.gold));
  return { skills, bestFind, loot, goldBySource };
}
