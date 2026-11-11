// NPC general store (owner decision 2026-11-08). Replaces the player market, which is parked.
//   - Stock rotates every game-clock hour: ECON.storeResourceSlots raw/refined materials and
//     ECON.storeGearSlots low/mid-tier gear pieces (Common, Standard quality).
//   - The rotation is seeded from the hour index only (its own mulberry32 stream, never ctx.rng, so it
//     does not disturb the engine's seeded RNG order). Every player draws the same random numbers each
//     hour; what those numbers pick is weighted toward items near THAT player's skill levels.
//   - Each slot has a limited qty for its hour. Buy = value x ECON.storeResourceMult / storeGearMult.
//   - The store buys any item (stackable or gear) at value x ECON.storeSellMult: a gold floor and sink.
// State: state.store = { hour, slots: [{ itemId, kind, grade, stock, sold }] } (additive v6 field).
/* eslint-disable */
import { mulberry32 } from './context';
import { E, SLOTS, arr, num, item, itemsMap, allActions, bosses, clamp, itemName, isStackable, zeros5, fmtGold, lcFirst, grades, gradeOf, qtyName, plural } from './core';
import { ECON } from './data';
import { addItem, cleanInv } from './inventory';
import { findGear, makeGear, isEquipped } from './gear';
import { nowOf } from './clock';
import { lockedNow } from './raid-rules';
import { pushEvent } from './events';
import { emitGain } from './gains';

export const HOUR_MS = 3600000;
const GEAR_QUALITY = 50; // Standard grade

export const storeHour = (state) => Math.floor(nowOf(state) / HOUR_MS);

// ---- where each item comes from: the lowest-level action that yields it ({ skill, level, chance })
let srcCache: any = { acts: undefined, items: undefined, map: null };
export function itemSources() {
  const acts = allActions(); const items = itemsMap();
  if (srcCache.acts === acts && srcCache.items === items && srcCache.map) return srcCache.map;
  const map = {};
  const put = (id, a, chance) => {
    const cur = map[id]; const lvl = num(a.level, 1);
    if (!cur || lvl < cur.level || (lvl === cur.level && chance > cur.chance)) map[id] = { skill: a.skill, level: lvl, chance, kind: a.kind };
  };
  allActions().forEach((a) => {
    if (!a) return;
    if (a.kind === 'gather' || a.kind === 'refine' || a.kind === 'craft') Object.keys(a.outputs || {}).forEach((id) => put(id, a, 1));
    if (a.kind === 'gather') arr(a.bonus).forEach((b) => { if (b && b.item) put(b.item, a, num(b.chance, 0)); });
    if (a.kind === 'combat') arr(a.drops).forEach((d) => { if (d && d.item) put(d.item, a, num(d.chance, 0)); });
  });
  srcCache = { acts, items, map };
  return map;
}
const bossLoot = () => { const s = new Set(); bosses().forEach((b) => arr(b.loot).forEach((l) => { if (l && l.item) s.add(l.item); })); return s; };

function resourceCandidates() {
  const src = itemSources(); const boss = bossLoot(); const out = [];
  Object.keys(itemsMap()).forEach((id) => {
    const it = item(id); const s = src[id];
    if (!it || it.kind !== 'material' || num(it.tier, 1) > 4 || !s) return;
    // elite / boss materials stay earned: skip items that only come from rare combat drops or boss loot
    if (s.kind === 'combat' && s.chance < 0.15) return;
    if (boss.has(id) && s.kind === 'combat' && s.chance < 0.5) return;
    out.push(id);
  });
  return out.sort();
}
function gearCandidates() {
  const src = itemSources(); const max = num(ECON.storeGearMaxTier, 2);
  return Object.keys(itemsMap()).filter((id) => { const it = item(id); return it && it.kind === 'gear' && num(it.tier, 1) <= max && src[id]; }).sort();
}
/** weight of an item for this player: highest near the player's level in the skill that makes it */
export function nearWeight(state, id) {
  const s = itemSources()[id]; if (!s) return 0;
  const lvl = E.skillLevel(state, s.skill); const d = s.level - lvl;
  return d > 0 ? 1 / (1 + (d / 5) * (d / 5)) : 1 / (1 + (d / 15) * (d / 15));
}
function weightedPick(rng, ids, weights) {
  const total = weights.reduce((a, w) => a + w, 0); if (!(total > 0)) return -1;
  let r = rng() * total;
  for (let i = 0; i < ids.length; i++) { r -= weights[i]; if (r < 0) return i; }
  return ids.length - 1;
}
/** deterministic stock for one hour index (same random stream for everyone; picks weighted to `state`) */
export function stockFor(state, hour) {
  const rng = mulberry32((Math.imul(hour | 0, 0x9e3779b1) ^ 0x5f3759df) >>> 0);
  const slots = [];
  const pickN = (ids, n, kind) => {
    const pool = ids.slice(); const w = pool.map((id) => nearWeight(state, id));
    for (let k = 0; k < n && pool.length; k++) {
      const i = weightedPick(rng, pool, w); if (i < 0) break;
      const id = pool[i]; pool.splice(i, 1); w.splice(i, 1);
      const tier = clamp(num(item(id).tier, 1), 1, 5);
      if (kind === 'resource') {
        const x = rng(); const grade = x < 0.25 ? 0 : x < 0.85 ? 1 : 2;
        const base = [40, 25, 15, 8, 4][tier - 1];
        slots.push({ itemId: id, kind, grade, stock: Math.max(1, Math.round(base * (0.6 + 0.4 * rng()))), sold: 0 });
      } else {
        slots.push({ itemId: id, kind, grade: 1, stock: rng() < 0.3 ? 2 : 1, sold: 0 });
      }
    }
  };
  pickN(resourceCandidates(), Math.max(0, Math.floor(num(ECON.storeResourceSlots, 6))), 'resource');
  pickN(gearCandidates(), Math.max(0, Math.floor(num(ECON.storeGearSlots, 3))), 'gear');
  return slots;
}
export function normStore(raw) {
  if (!raw || typeof raw !== 'object' || !isFinite(raw.hour) || !Array.isArray(raw.slots)) return null;
  const slots = raw.slots.filter((x) => x && item(x.itemId)).map((x) => ({ itemId: x.itemId, kind: x.kind === 'gear' ? 'gear' : 'resource',
    grade: clamp(Math.floor(num(x.grade, 1)), 0, 4), stock: Math.max(0, Math.floor(num(x.stock, 0))), sold: Math.max(0, Math.floor(num(x.sold, 0))) }));
  return { hour: Math.floor(raw.hour), slots };
}
/** roll the stock if the game-clock hour changed (cheap when it hasn't) */
export function ensureStore(state) {
  const h = storeHour(state);
  if (!state.store || state.store.hour !== h || !Array.isArray(state.store.slots)) state.store = { hour: h, slots: stockFor(state, h) };
  return state.store;
}

// ---- prices
const gearProbe = (itemId) => ({ itemId, rarity: 'common', quality: GEAR_QUALITY, dur: 1, maxDur: 1 });
// Grade ladder for prices (2026-11-12): each grade of a stackable is worth at least 1g more than the grade
// below it (Rough and Fine copper ore used to both sell for 1g). Built bottom-up from the plain price, so a
// price is only ever raised, never lowered. The store's buy price stays above its sell price at every grade.
const GRADES_N = 5;
export function gradeLadder(raw: (g: number) => number) {
  const out = [];
  for (let g = 0; g < GRADES_N; g++) { const p = Math.max(1, Math.round(num(raw(g), 1))); out.push(g ? Math.max(p, out[g - 1] + 1) : p); }
  return out;
}
const gIdx = (grade) => clamp(Math.floor(num(grade, 1)), 0, GRADES_N - 1);
export function storeSellLadder(itemId) { return gradeLadder((g) => Math.round(E.itemValue(itemId, g) * num(ECON.storeSellMult, 0.4))); }
export function storeBuyPrice(itemId, grade) {
  const it = item(itemId); if (!it) return 0;
  if (it.kind === 'gear') return Math.max(1, Math.round(E.gearValue(gearProbe(itemId)) * num(ECON.storeGearMult, 2)));
  const g = gIdx(grade);
  const buy = gradeLadder((k) => Math.ceil(E.itemValue(itemId, k) * num(ECON.storeResourceMult, 1.5)))[g];
  return Math.max(buy, storeSellLadder(itemId)[g] + 1);
}
export function storeSellPrice(itemId, grade) {
  if (!item(itemId)) return 0;
  return storeSellLadder(itemId)[gIdx(grade)];
}
export function storeGearSellPrice(g) { return g ? Math.max(1, Math.round(E.gearValue(g) * num(ECON.storeSellMult, 0.4))) : 0; }
E.storeBuyPrice = storeBuyPrice;
E.storeSellPrice = storeSellPrice;

// ---- "make it yourself" time: seconds per unit at the player's current levels (null = can't yet).
// Cached per (skill levels + equipped gear) so the worker can send it every snapshot.
let gsCache = { key: '', map: null };
function gsKey(state) {
  const lv = Object.keys(state.skills || {}).sort().map((k) => E.skillLevel(state, k)).join(',');
  const eq = SLOTS.map((s) => { const g = findGear(state, state.equipped[s]); return g ? g.uid + (g.dur > 0 ? '+' : '-') : '_'; }).join();
  return lv + '|' + eq;
}
E.gatherSecs = function (state) {
  const key = gsKey(state);
  if (gsCache.key === key && gsCache.map) return gsCache.map;
  const map = E.gatherEstimates(state, Object.keys(itemsMap()));
  gsCache = { key, map };
  return map;
};

// ---- view for the client (derived bundle)
E.storeView = function (state) {
  const st = ensureStore(state); const gs = E.gatherSecs(state);
  const slots = st.slots.map((x, i) => {
    const it = item(x.itemId) || {};
    return { slot: i, itemId: x.itemId, name: it.name || x.itemId, kind: x.kind, grade: x.kind === 'gear' ? null : x.grade,
      rarity: x.kind === 'gear' ? 'common' : (it.rarity || 'common'),
      qty: Math.max(0, x.stock - x.sold), stock: x.stock, price: storeBuyPrice(x.itemId, x.grade),
      gatherSecs: gs[x.itemId] == null ? null : gs[x.itemId] };
  });
  const sellPrices = {};
  Object.keys(state.inv || {}).forEach((id) => { if (item(id)) sellPrices[id] = storeSellLadder(id); });
  const gearSellPrices = {};
  arr(state.gear).forEach((g) => { gearSellPrices[g.uid] = storeGearSellPrice(g); });
  return { hour: st.hour, refreshesAt: (st.hour + 1) * HOUR_MS, slots,
    buyMult: { resource: ECON.storeResourceMult, gear: ECON.storeGearMult }, sellMult: ECON.storeSellMult, sellPrices, gearSellPrices };
};

// ---- verbs
E.storeBuy = function (state, slot, qty) {
  const st = ensureStore(state); const x = st.slots[Math.floor(num(slot, -1))];
  const fail = (reason) => ({ ok: false, reason, qty: 0, gold: 0 });
  if (!x) return fail('That item is no longer on sale.');
  qty = Math.floor(num(qty, 1)); if (qty < 1) return fail('Buy at least 1.');
  const left = x.stock - x.sold;
  if (left < 1) return fail('Sold out until the stock changes.');
  if (qty > left) return fail(`Only ${left} left this hour.`);
  const price = storeBuyPrice(x.itemId, x.grade); const cost = price * qty;
  if (num(state.gold, 0) < cost) return fail(`That costs ${fmtGold(cost)} and you have ${fmtGold(Math.floor(num(state.gold, 0)))}.`);
  state.gold -= cost; x.sold += qty;
  const uids = [];
  if (x.kind === 'gear') {
    const got = [];
    for (let k = 0; k < qty; k++) { const g = makeGear(state, x.itemId, 0, GEAR_QUALITY); uids.push(g.uid); got.push({ itemId: g.itemId, qty: 1, grade: gradeOf(g.quality), rarity: g.rarity, uid: g.uid }); }
    emitGain('buy', got);
  } else { addItem(state, x.itemId, x.grade, qty); emitGain('buy', [{ itemId: x.itemId, qty, grade: x.grade }]); }
  const gradeTxt = x.kind === 'gear' ? '' : ` (${(grades()[x.grade] || {}).name || 'Standard'})`;
  pushEvent(state, 'gold', `Bought ${qtyName(qty, x.itemId)}${gradeTxt} at the general store for ${fmtGold(cost)}.`, { itemId: x.itemId, qty, grade: x.kind === 'gear' ? null : x.grade, gold: -cost });
  return { ok: true, reason: '', qty, gold: cost, itemId: x.itemId, uids };
};
E.storeSell = function (state, itemId, grade, qty) {
  const it = item(itemId); const fail = (reason) => ({ ok: false, reason, qty: 0, gold: 0 });
  if (!it) return fail('Unknown item.');
  if (!isStackable(it)) return fail('Sell gear with storeSellGear.');
  grade = Math.floor(num(grade, -1)); qty = Math.floor(num(qty, 0));
  if (grade < 0 || grade > 4) return fail('Pick a grade.');
  if (qty < 1) return fail('Sell at least 1.');
  const have = (state.inv[itemId] || zeros5())[grade] || 0;
  if (have < qty) return fail(`You only have ${have} ${(grades()[grade] || {}).name || ''} ${lcFirst(it.name)}.`.replace(/\s+/g, ' '));
  const gold = storeSellPrice(itemId, grade) * qty;
  state.inv[itemId][grade] -= qty; cleanInv(state, itemId); state.gold = num(state.gold, 0) + gold;
  pushEvent(state, 'gold', `Sold ${qty} ${plural(it.name, qty)} (${(grades()[grade] || {}).name || 'Standard'}) to the general store for ${fmtGold(gold)}.`, { itemId, qty, grade, gold });
  return { ok: true, reason: '', qty, gold };
};
E.storeSellGear = function (state, uid) {
  const g = findGear(state, uid); const fail = (reason) => ({ ok: false, reason, qty: 0, gold: 0 });
  if (!g) return fail('That item is no longer in your bag.');
  if (isEquipped(state, uid)) return fail('Unequip it first.');
  if (lockedNow(state) && state.raid.lock && SLOTS.some((s) => state.raid.lock.slots[s] === uid)) return fail('It is locked in for this week\'s raid.');
  const gold = storeGearSellPrice(g); const name = E.gearName(g);
  state.gear = state.gear.filter((x) => x !== g); state.gold = num(state.gold, 0) + gold;
  pushEvent(state, 'gold', `Sold your ${name} to the general store for ${fmtGold(gold)}.`, { itemId: g.itemId, qty: 1, gold, rarity: g.rarity });
  return { ok: true, reason: '', qty: 1, gold };
};

// ---- sell list (layout pass 2026-11-11): bag stacks grouped by item across grades, with per-grade qty and
// what the store pays. Stackables only; gear is sold piece by piece (storeSellGear).
E.storeSellList = function (state) {
  const out = [];
  Object.keys(state.inv || {}).forEach((id) => {
    const it = item(id); if (!it || !isStackable(it)) return;
    const row = state.inv[id] || [];
    const gs = [0, 1, 2, 3, 4].map((g) => ({ grade: g, gradeName: (grades()[g] || {}).name || '', qty: Math.max(0, Math.floor(num(row[g], 0))), price: storeSellPrice(id, g) }))
      .filter((x) => x.qty > 0).map((x) => Object.assign(x, { gold: x.qty * x.price }));
    if (!gs.length) return;
    out.push({ itemId: id, name: it.name || id, kind: it.kind, rarity: it.rarity || 'common',
      qty: gs.reduce((a, x) => a + x.qty, 0), gold: gs.reduce((a, x) => a + x.gold, 0), grades: gs });
  });
  return out.sort((a, b) => a.name.localeCompare(b.name));
};
/** sell every grade of one stackable item to the store in one go */
E.storeSellAll = function (state, itemId) {
  const it = item(itemId); const fail = (reason) => ({ ok: false, reason, qty: 0, gold: 0, grades: [] });
  if (!it) return fail('Unknown item.');
  if (!isStackable(it)) return fail('Sell gear with storeSellGear.');
  const row = state.inv[itemId] || zeros5(); const sold = [];
  [0, 1, 2, 3, 4].forEach((g) => { const q = Math.max(0, Math.floor(num(row[g], 0))); if (q > 0) sold.push({ grade: g, qty: q, gold: storeSellPrice(itemId, g) * q }); });
  if (!sold.length) return fail(`You have no ${lcFirst(it.name)}.`);
  const qty = sold.reduce((a, x) => a + x.qty, 0); const gold = sold.reduce((a, x) => a + x.gold, 0);
  sold.forEach((x) => { state.inv[itemId][x.grade] -= x.qty; });
  cleanInv(state, itemId); state.gold = num(state.gold, 0) + gold;
  pushEvent(state, 'gold', `Sold ${qty} ${plural(it.name, qty)}${sold.length > 1 ? ' (all grades)' : ` (${(grades()[sold[0].grade] || {}).name || 'Standard'})`} to the general store for ${fmtGold(gold)}.`, { itemId, qty, gold });
  return { ok: true, reason: '', qty, gold, grades: sold };
};

// One call for the worker's per-snapshot derived bundle (2026-11-08 additions). Read-only apart from
// rolling the store stock when the game-clock hour changes.
E.derivedExtras = function (state) {
  return { store: E.storeView(state), events: E.events(state), raidPrep: E.raidPrep(state), gatherSecs: E.gatherSecs(state), codex: E.codex(state),
    // layout pass 2026-11-11
    lastRecapView: E.recapView(state), crewActivity: E.crewActivity(state), sellList: E.storeSellList(state),
    disabledReasons: E.disabledReasons(state),
    // juice pass 2026-11-12
    maxMake: E.maxMake(state), readiness: E.raidReadiness(state), recentUnlocks: E.recentUnlocks(state), equipDeltas: E.equipDeltas(state) };
};
