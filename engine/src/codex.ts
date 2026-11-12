// Discovery + encyclopedia (QoL pass 2026-11-11).
//   state.seen: Record<itemId, true> (additive v6 field) — every item the player has touched: entered
//   the bag (addItem), was made as gear (makeGear), or sits in the bag / gear / equipped / raid pouch /
//   crew vault (sweepSeen, run every tick, after offline catch-up and on load).
//   E.codex(state) → per item status: 'known' | 'hint' | 'hidden' (rules below) + contract demand now.
//   E.catalog() / DATA.catalog → static encyclopedia entries (no state needed; main-thread safe).
// Lore text comes from DATA.itemLore[id] when present (string, or { description } / { text }); the
// writer agent's engine/src/item-lore.ts is expected to fill it. Missing entries are fine.
/* eslint-disable */
import { E, SLOTS, D, arr, num, item, itemsMap, allActions, bosses, skillDefs, rarities } from './core';
import { DATA } from './data';
import { invCount } from './v4-helpers';
import { storeBuyPrice, storeSellPrice } from './store';
import { recipeFor, salvagePctOf } from './gear';
import { markSeen } from './inventory';
import { ITEM_LORE } from './item-lore'; // writer-owned; DATA.itemLore[id] overrides it

/** hint a raw material once a source action is within this many levels of the player's skill */
export const RAW_HINT_LEVELS = 10;

// ---------------------------------------------------------------- discovery
export function sweepSeen(state) {
  if (!state) return;
  if (!state.seen || typeof state.seen !== 'object') state.seen = {};
  const mark = (id) => { if (id && item(id)) state.seen[id] = true; };
  const invKeys = (inv) => Object.keys(inv || {}).forEach((id) => { if (invCount(inv, id) > 0) mark(id); });
  invKeys(state.inv);
  arr(state.gear).forEach((g) => mark(g && g.itemId));
  invKeys(state.raid && state.raid.pouch);
  const v = state.crew && state.crew.vault;
  if (v) { invKeys(v.inv); arr(v.gear).forEach((g) => mark(g && g.itemId)); }
}
/** on load: the save's seen list, plus what it owns now and its event history */
export function seedSeen(out, raw) {
  const prev = raw && raw.seen && typeof raw.seen === 'object' ? raw.seen : {};
  out.seen = {};
  Object.keys(prev).forEach((id) => { if (prev[id] && item(id)) out.seen[id] = true; });
  sweepSeen(out);
  arr(out.events).forEach((e) => { if (e && e.itemId && item(e.itemId)) markSeen(out, e.itemId); });
  arr(out.raid && out.raid.recaps).forEach((r) => arr(r && r.payout && r.payout.items).forEach((x) => { if (x && item(x.itemId)) markSeen(out, x.itemId); }));
}
E.seen = (state) => Object.assign({}, state && state.seen);

// ---------------------------------------------------------------- static catalog
const CRAFT_KINDS = ['refine', 'craft'];
function sourcesOf(id) {
  const gathered = []; const drops = [];
  allActions().forEach((a) => {
    if (!a) return;
    if (a.kind === 'gather') {
      if (a.outputs && a.outputs[id]) gathered.push({ actionId: a.id, name: a.name, skill: a.skill, level: num(a.level, 1), chance: 1, qty: a.outputs[id] });
      arr(a.bonus).forEach((b) => { if (b && b.item === id) gathered.push({ actionId: a.id, name: a.name, skill: a.skill, level: num(a.level, 1), chance: num(b.chance, 0), qty: b.qty }); });
    }
    if (a.kind === 'combat') arr(a.drops).forEach((d) => { if (d && d.item === id) drops.push({ source: 'monster', actionId: a.id, name: (a.enemy && a.enemy.name) || a.name, skill: a.skill, level: num(a.level, 1), chance: num(d.chance, 0), qty: d.qty }); });
  });
  bosses().forEach((b) => arr(b.loot).forEach((l) => { if (l && l.item === id) drops.push({ source: 'boss', bossId: b.id, name: b.name, chance: num(l.chance, 0), qty: l.qty }); }));
  return { gathered, drops };
}
function recipesFor(id) {
  return allActions().filter((a) => a && CRAFT_KINDS.includes(a.kind) && a.outputs && a.outputs[id]).sort((a, b) => num(a.level, 1) - num(b.level, 1));
}
function loreOf(id) {
  const over = (D().itemLore || {})[id];
  const l = over != null ? over : (ITEM_LORE || {})[id];
  if (!l) return null;
  if (typeof l === 'string') return l;
  return typeof l.description === 'string' ? l.description : typeof l.text === 'string' ? l.text : null;
}
function buildEntry(id) {
  const it = item(id); const src = sourcesOf(id); const rec = recipesFor(id)[0] || null;
  const gear = it.kind === 'gear';
  const gr = rec ? recipeFor(id) : null; const outQty = gr ? Math.max(1, num(gr.outputs[id], 1)) : 1;
  return {
    id, name: it.name, rarity: it.rarity || 'common', kind: it.kind, tier: num(it.tier, 1), slot: gear ? it.slot : null, role: gear ? it.role || null : null,
    stats: gear && it.stats ? Object.assign({}, it.stats) : null, element: it.element || null,
    section: gear ? it.section || 'fight' : null, toolSkill: it.toolSkill || null, outfitSet: it.outfitSet || null, effects: it.effects ? it.effects.map((e) => Object.assign({}, e)) : null,
    heal: num(it.heal, 0) || null, buff: it.buff ? Object.assign({}, it.buff) : null, value: num(it.value, 0),
    recipe: rec ? { actionId: rec.id, skill: rec.skill, level: num(rec.level, 1), inputs: Object.assign({}, rec.inputs || {}), outputQty: num(rec.outputs[id], 1), secs: num(rec.sec, 0), xp: num(rec.xp, 0) * num((D().config || {}).xpMult, 1) } : null,
    usedIn: allActions().filter((a) => a && a.inputs && a.inputs[id]).map((a) => ({ actionId: a.id, name: a.name, skill: a.skill, level: num(a.level, 1), qty: a.inputs[id], outputs: Object.keys(a.outputs || {}) })),
    gatheredBy: src.gathered, dropsFrom: src.drops,
    store: { buy: storeBuyPrice(id, 1), sell: [0, 1, 2, 3, 4].map((g) => storeSellPrice(id, g)) },
    salvage: gear && gr ? { perRarity: Object.fromEntries(rarities().map((r) => [r.id, salvagePctOf(r.id)])),
      inputs: Object.fromEntries(Object.keys(gr.inputs || {}).map((k) => [k, num(gr.inputs[k], 0) / outQty])) } : null,
    lore: loreOf(id),
  };
}
let catCache = { data: undefined, lore: undefined, map: null };
export function catalog() {
  const data = D();
  if (catCache.data === data && catCache.lore === data.itemLore && catCache.map) return catCache.map;
  const map = {}; Object.keys(itemsMap()).forEach((id) => { map[id] = buildEntry(id); });
  catCache = { data, lore: data.itemLore, map };
  return map;
}
E.catalog = catalog;
E.catalogEntry = (id) => catalog()[id] || null;
// DATA.catalog: same as E.catalog(), readable on the main thread (lazy, cached, not enumerable).
if (!Object.getOwnPropertyDescriptor(DATA, 'catalog')) Object.defineProperty(DATA, 'catalog', { get: catalog, enumerable: false, configurable: true });

// ---------------------------------------------------------------- per-state codex
/**
 * Status rules:
 *  - touched (state.seen) → 'known'
 *  - craftable: 'known' when ALL inputs of its recipe are touched, 'hint' when at least one is
 *  - raw (no recipe): 'hint' when a gather/monster source is within RAW_HINT_LEVELS of the player's level
 *    in that source's skill; boss-only loot and cores stay hidden until touched
 *  - else 'hidden'
 */
E.codex = function (state) {
  const seen = (state && state.seen) || {}; const items = {}; const lv = {};
  const lvl = (sk) => (lv[sk] != null ? lv[sk] : (lv[sk] = E.skillLevel(state, sk)));
  const cat = catalog();
  Object.keys(cat).forEach((id) => {
    const c = cat[id]; const ins = c.recipe ? Object.keys(c.recipe.inputs) : [];
    const inputsSeen = ins.filter((x) => seen[x]).length;
    let status = 'hidden';
    if (seen[id]) status = 'known';
    else if (c.recipe) status = inputsSeen === ins.length && ins.length ? 'known' : inputsSeen > 0 ? 'hint' : 'hidden';
    else if (c.gatheredBy.concat(c.dropsFrom.filter((d) => d.source === 'monster')).some((s) => s.level <= lvl(s.skill) + RAW_HINT_LEVELS)) status = 'hint';
    items[id] = { id, status, inputsSeen, inputsTotal: ins.length, touched: !!seen[id] };
  });
  // contract demand now: units still wanted on open contracts you could fill
  const demand = {};
  if (state && state.crew) arr(E.listContracts(state)).forEach((k) => {
    if (!k || k.mine || !(k.capacity > 0)) return;
    demand[k.itemId] = (demand[k.itemId] || 0) + k.capacity;
  });
  return { items, demand };
};
void SLOTS; void skillDefs;
