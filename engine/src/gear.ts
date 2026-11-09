// Gear: rarity, affixes, stats, durability, repair, salvage, fuse.
// Ported from legacy/engine.js lines 242-405. Behaviour must stay identical to the
// legacy build (see test/parity.test.ts); design changes come in phase 1.
/* eslint-disable */
import { E, SLOTS, arr, num, rarities, elements, item, allActions, affixDefs, rand, clamp, randInt, shuffle, lcFirst, article, itemName, nextId, gradeOf, gradeMult, rarityDef, fmtGold } from './core';
import { addItem, consume, lowestGrade } from './inventory';
import { statsFor } from './stats';

// ---------------------------------------------------------------- gear
export function findGear(state, uid) { return arr(state.gear).find((g) => g.uid === uid) || null; }
export function isEquipped(state, uid) { return SLOTS.some((s) => state.equipped[s] === uid); }
export function makeGear(state, itemId, rIdx, quality) {
  const rar = rarities()[clamp(rIdx, 0, rarities().length - 1)];
  const slots = Math.max(0, Math.floor(num(rar.affixSlots, 0)));
  const affixes = shuffle(affixDefs().filter((a) => a && a.id)).slice(0, slots).map((a) => {
    const r = Array.isArray(a.range) ? a.range : [1, 3];
    return { id: a.id, value: randInt(num(r[0], 1), num(r[1], num(r[0], 1))) };
  });
  let durPct = 0;
  affixes.forEach((af) => { const d = affixDefs().find((x) => x.id === af.id); if (d && d.stat === 'dur') durPct += af.value; });
  const maxDur = Math.max(10, Math.round(num(rar.durability, 100) * (1 + durPct / 100)));
  const g = { uid: nextId(state, 'g'), itemId, rarity: rar.id, quality: clamp(Math.round(num(quality, 50)), 1, 100), affixes, dur: maxDur, maxDur };
  state.gear.push(g);
  return g;
}
export const emptyElements = () => { const o = {}; elements().forEach((e) => { o[e] = 0; }); return o; };
E.gearStats = function (g) {
  const out = { atk: 0, def: 0, heal: 0, hp: 0, elements: emptyElements(), speed: 0, durPct: 0 };
  const it = g && item(g.itemId);
  if (!it || !(num(g.dur, 0) > 0)) return out;
  const rar = rarityDef(g.rarity);
  const m = num(rar.statMult, 1) * gradeMult(gradeOf(g.quality));
  const st = it.stats || {};
  ['atk', 'def', 'heal', 'hp'].forEach((k) => { const b = num(st[k], 0); if (b > 0) out[k] = Math.max(1, Math.round(b * m)); });
  if (it.element) out.elements[it.element] = num(out.elements[it.element], 0) + Math.max(1, Math.round(Math.max(2, num(st.atk, 0)) * 0.3 * num(rar.statMult, 1)));
  arr(g.affixes).forEach((af) => {
    const d = affixDefs().find((x) => x.id === af.id); if (!d) return;
    const v = num(af.value, 0);
    if (d.stat === 'speed') out.speed += v;
    else if (d.stat === 'dur') out.durPct += v;
    else if (['atk', 'def', 'heal', 'hp'].includes(d.stat)) out[d.stat] += v;
    else if (d.stat) out.elements[d.stat] = num(out.elements[d.stat], 0) + v;
  });
  return out;
};
E.playerStats = function (state) { return statsFor(state, state.equipped); };
E.equip = function (state, uid) {
  const g = findGear(state, uid); if (!g) return { ok: false, reason: 'That item is no longer in your bag.' };
  const it = item(g.itemId); if (!it || !SLOTS.includes(it.slot)) return { ok: false, reason: 'That item cannot be equipped.' };
  state.equipped[it.slot] = uid;
  clampHp(state);
  return { ok: true };
};
E.unequip = function (state, slot) {
  if (SLOTS.includes(slot)) state.equipped[slot] = null;
  clampHp(state);
  return { ok: true };
};
export function clampHp(state) { const max = E.playerStats(state).maxHp; state.hp = clamp(num(state.hp, max), 0, max); }

E.gearName = function (g) {
  if (!g) return '';
  const it = item(g.itemId); const base = it ? it.name : String(g.itemId);
  let pre = null, suf = null;
  arr(g.affixes).forEach((af) => {
    const d = affixDefs().find((x) => x.id === af.id); if (!d || !d.name) return;
    if (/^of\s/i.test(d.name)) { if (!suf) suf = d.name; } else if (!pre) pre = d.name;
  });
  return [pre, base, suf].filter(Boolean).join(' ');
};
E.itemValue = function (itemId, grade) {
  const it = item(itemId); if (!it) return 0;
  return Math.max(1, Math.round(num(it.value, 1) * gradeMult(clamp(Math.floor(num(grade, 1)), 0, 4))));
};
E.gearValue = function (g) {
  const it = g && item(g.itemId); if (!it) return 0;
  const durF = 0.5 + 0.5 * clamp(num(g.dur, 0) / Math.max(1, num(g.maxDur, 1)), 0, 1);
  return Math.max(1, Math.round(num(it.value, 1) * num(rarityDef(g.rarity).valueMult, 1) * gradeMult(gradeOf(g.quality)) * durF));
};
E.repairCost = function (state, uid) {
  const g = findGear(state, uid); if (!g) return { gold: 0, newMaxDur: 0 };
  const newMaxDur = Math.max(10, Math.round(num(g.maxDur, 100) * 0.8));
  const missing = clamp(1 - num(g.dur, 0) / Math.max(1, g.maxDur), 0, 1);
  const full = Math.max(1, Math.round(num((item(g.itemId) || {}).value, 1) * num(rarityDef(g.rarity).valueMult, 1) * gradeMult(gradeOf(g.quality))));
  const b = state && state.server ? E.weekBuff(state) : null; const disc = b && b.kind === 'repair' ? clamp(num(b.value, 0), 0, 0.9) : 0;
  return { gold: missing > 0 ? Math.max(1, Math.ceil(full * 0.25 * missing * (1 - disc))) : 0, newMaxDur, discount: disc };
};
E.repair = function (state, uid) {
  const g = findGear(state, uid); if (!g) return { ok: false, reason: 'That item is no longer in your bag.' };
  const c = E.repairCost(state, uid);
  if (g.dur >= g.maxDur) return { ok: false, reason: 'It is already in perfect condition.' };
  if (g.dur >= c.newMaxDur) return { ok: false, reason: `Still at ${Math.round(g.dur)} durability; repairing now would only lower its maximum to ${c.newMaxDur}.` };
  if (state.gold < c.gold) return { ok: false, reason: `Repairing costs ${fmtGold(c.gold)} and you have ${fmtGold(Math.floor(state.gold))}.` };
  state.gold -= c.gold; g.dur = c.newMaxDur; g.maxDur = c.newMaxDur;
  E.log(state, 'info', `Repaired your ${E.gearName(g)} for ${fmtGold(c.gold)} (max durability now ${c.newMaxDur}).`);
  return { ok: true, gold: c.gold };
};
export function recipeFor(itemId) {
  return allActions().find((a) => a && a.kind === 'craft' && a.outputs && a.outputs[itemId]) || null;
}
E.salvage = function (state, uid) {
  const g = findGear(state, uid); if (!g) return { ok: false, reason: 'That item is no longer in your bag.', items: [] };
  if (isEquipped(state, uid)) return { ok: false, reason: 'Unequip it before salvaging.', items: [] };
  const rec = recipeFor(g.itemId); const grade = gradeOf(g.quality); const items = [];
  if (rec && rec.inputs) {
    const outQty = Math.max(1, num(rec.outputs[g.itemId], 1));
    Object.keys(rec.inputs).forEach((id) => {
      if (!item(id)) return;
      const exact = num(rec.inputs[id], 0) / outQty * 0.3;
      const q = Math.floor(exact) + (rand() < exact % 1 ? 1 : 0);
      if (q > 0) { addItem(state, id, grade, q); items.push({ itemId: id, grade, qty: q }); }
    });
  }
  state.gear = state.gear.filter((x) => x.uid !== uid);
  E.log(state, 'info', items.length ? `Salvaged ${E.gearName(g)} into ${items.map((i) => `${i.qty} ${itemName(i.itemId)}`).join(', ')}.` : `Salvaged ${E.gearName(g)}; nothing useful was left.`);
  return { ok: true, items };
};
E.fuseCandidates = function (state) {
  const by = {};
  arr(state.gear).forEach((g) => { if (g.rarity === rarities()[0].id && !isEquipped(state, g.uid)) (by[g.itemId] = by[g.itemId] || []).push(g); });
  return Object.keys(by).filter((id) => by[id].length >= 5)
    .map((id) => ({ itemId: id, uids: by[id].sort((a, b) => a.quality - b.quality).map((g) => g.uid) }));
};
E.fuse = function (state, itemId) {
  const cand = E.fuseCandidates(state).find((c) => c.itemId === itemId);
  if (!cand) return { ok: false, reason: 'You need 5 unequipped Common copies to fuse.' };
  const use = cand.uids.slice(0, 5); // lowest quality first: keeps your best Commons
  const qs = use.map((u) => findGear(state, u).quality);
  state.gear = state.gear.filter((g) => !use.includes(g.uid));
  const rIdx = rand() < 0.15 ? Math.min(2, rarities().length - 1) : Math.min(1, rarities().length - 1);
  const g = makeGear(state, itemId, rIdx, qs.reduce((a, b) => a + b, 0) / 5);
  E.log(state, 'craft', `Fused 5 Commons into ${article(rarities()[rIdx].name)} ${rarities()[rIdx].name} ${itemName(itemId)}.`);
  return { ok: true, gear: g };
};

// food
export function healOf(itemId, grade) { const it = item(itemId); return it ? Math.max(1, Math.round(num(it.heal, 0) * gradeMult(Math.max(0, grade)))) : 0; }
E.eat = function (state, itemId) {
  const it = item(itemId);
  if (!it || !(num(it.heal, 0) > 0)) return { ok: false, reason: 'That is not something you can eat.' };
  if (E.itemCount(state, itemId) <= 0) return { ok: false, reason: `You have no ${lcFirst(it.name)}.` };
  const max = E.playerStats(state).maxHp;
  if (state.hp >= max) return { ok: false, reason: 'You are already at full HP.' };
  const gr = lowestGrade(state, itemId); const h = healOf(itemId, gr);
  consume(state, itemId, 1, 'worst');
  const before = state.hp; state.hp = Math.min(max, state.hp + h);
  return { ok: true, heal: Math.round(state.hp - before) };
};
// picks the healing item with the smallest heal that still lifts hp to the target; else the biggest one
export function chooseHealItem(state, need, kinds) {
  let best = null, biggest = null;
  Object.keys(state.inv).forEach((id) => {
    const it = item(id); if (!it || !kinds.includes(it.kind) || !(num(it.heal, 0) > 0)) return;
    const gr = lowestGrade(state, id); if (gr < 0) return;
    const h = healOf(id, gr); const rank = kinds.indexOf(it.kind);
    const c = { id, h, rank };
    if (h >= need && (!best || h < best.h || (h === best.h && rank < best.rank))) best = c;
    if (!biggest || h > biggest.h) biggest = c;
  });
  return best || biggest;
}
export function autoEat(state, events, threshold, maxHp) {
  let guard = 0;
  while (state.hp < threshold * maxHp && guard++ < 6) {
    const c = chooseHealItem(state, threshold * maxHp - state.hp, ['food', 'potion']);
    if (!c) break;
    consume(state, c.id, 1, 'worst');
    const before = state.hp; state.hp = Math.min(maxHp, state.hp + c.h);
    events.push({ type: 'eat', itemId: c.id, heal: Math.round(state.hp - before) });
  }
}
