// Gear: rarity, affixes, stats, durability, repair, salvage, fuse.
// Ported from legacy/engine.js lines 242-405. Behaviour must stay identical to the
// legacy build (see test/parity.test.ts); design changes come in phase 1.
/* eslint-disable */
import { E, SLOTS, arr, num, rarities, grades, elements, item, allActions, affixDefs, rand, clamp, randInt, shuffle, lcFirst, article, itemName, nextId, gradeOf, gradeMult, rarityDef, fmtGold, qtyName } from './core';
import { addItem, consume, lowestGrade, markSeen } from './inventory';
import { ECON } from './data';
import { pushEvent } from './events';
import { emitGain } from './gains';
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
  state.gear.push(g); markSeen(state, itemId);
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

// ---------------------------------------------------------------- gear detail (gear pass 2026-11-12)
// E.gearDetail(state, uid) → GearDetail | null: what the item card and the craft reward card show.
// Stats are the piece's nominal stats (as if not broken, so a broken piece still shows what repairing it
// gives back); `broken` says when it currently counts for nothing.
const STAT_LABEL = { atk: 'Attack', def: 'Defence', heal: 'Healing', hp: 'Max HP', speed: 'Speed', durPct: 'Durability' };
const titleCase = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
export const statLabel = (key) => STAT_LABEL[key] || titleCase(key);
const statOrder = () => ['atk', 'def', 'heal', 'hp'].concat(elements(), ['speed', 'durPct']);
/** E.gearStats flattened to non-zero lines in a stable order: atk, def, heal, hp, elements, speed, durPct */
export function statLines(g) {
  if (!g) return [];
  const s = E.gearStats(num(g.dur, 0) > 0 ? g : Object.assign({}, g, { dur: 1 }));
  const flat = { atk: s.atk, def: s.def, heal: s.heal, hp: s.hp, speed: s.speed, durPct: s.durPct };
  elements().forEach((e) => { flat[e] = num(s.elements[e], 0); });
  return statOrder().filter((k) => num(flat[k], 0) !== 0).map((k) => ({ key: k, label: statLabel(k), value: flat[k] }));
}
export function inAnyLoadout(state, uid) { return arr(state && state.loadouts).some((l) => l && l.slots && SLOTS.some((s) => l.slots[s] === uid)); }
const findAnyGear = (state, uid) => findGear(state, uid) || arr(state && state.crew && state.crew.vault && state.crew.vault.gear).find((g) => g && g.uid === uid) || null;
E.gearDetail = function (state, uid) {
  const g = findAnyGear(state, uid); if (!g) return null;
  const it = item(g.itemId); const grade = gradeOf(g.quality);
  const slot = it && it.slot ? it.slot : '';
  const stats = statLines(g);
  const affixes = arr(g.affixes).map((af) => {
    const d = affixDefs().find((x) => x.id === af.id); if (!d) return null;
    const key = d.stat === 'dur' ? 'durPct' : d.stat; const v = num(af.value, 0);
    const pct = key === 'durPct' || key === 'speed' ? '%' : '';
    return { id: d.id, label: `${d.name}: ${v >= 0 ? '+' : ''}${v}${pct} ${statLabel(key)}`, value: v, stat: key };
  }).filter(Boolean);
  const equipped = isEquipped(state, g.uid);
  const curUid = SLOTS.includes(slot) ? state.equipped[slot] : null;
  const cur = curUid && curUid !== g.uid ? findGear(state, curUid) : null;
  let compare = null;
  if (cur) {
    const theirs = statLines(cur);
    const mineBy = {}; stats.forEach((l) => { mineBy[l.key] = l.value; });
    const theirBy = {}; theirs.forEach((l) => { theirBy[l.key] = l.value; });
    const diff = statOrder().filter((k) => k in mineBy || k in theirBy).map((k) => {
      const mine = num(mineBy[k], 0), other = num(theirBy[k], 0);
      return { key: k, label: statLabel(k), mine, theirs: other, delta: mine - other };
    });
    compare = { uid: cur.uid, name: E.gearName(cur), rarity: cur.rarity, grade: gradeOf(cur.quality), stats: theirs, diff, broken: !(num(cur.dur, 0) > 0) };
  }
  return {
    uid: g.uid, itemId: g.itemId, name: E.gearName(g), slot, rarity: g.rarity, grade, gradeName: (grades()[grade] || {}).name || '',
    dur: num(g.dur, 0), maxDur: num(g.maxDur, 0), value: E.gearValue(g), stats, affixes, equipped, compare,
    broken: !(num(g.dur, 0) > 0), inLoadout: inAnyLoadout(state, g.uid)
  };
};
/**
 * E.gearInfo(state) → Record<uid, { grade, equipped, inLoadout, stackKey }> for every bag gear piece.
 * stackKey = `${itemId}|${grade}` when the piece is common, unequipped, in no saved loadout and at full
 * durability (the UI groups pieces with the same stackKey into one row); otherwise null.
 */
E.gearInfo = function (state) {
  const out = {}; if (!state) return out;
  const worn = new Set(SLOTS.map((s) => state.equipped && state.equipped[s]).filter(Boolean));
  const inLo = new Set(); arr(state.loadouts).forEach((l) => { if (l && l.slots) SLOTS.forEach((s) => { if (l.slots[s]) inLo.add(l.slots[s]); }); });
  const common = rarities()[0].id;
  arr(state.gear).forEach((g) => {
    const grade = gradeOf(g.quality); const equipped = worn.has(g.uid); const inLoadout = inLo.has(g.uid);
    const fresh = num(g.dur, 0) >= num(g.maxDur, 0) && num(g.maxDur, 0) >= Math.round(num(rarityDef(g.rarity).durability, 100)); // never repaired
    const stack = g.rarity === common && !equipped && !inLoadout && fresh && !arr(g.affixes).length;
    out[g.uid] = { grade, equipped, inLoadout, stackKey: stack ? `${g.itemId}|${grade}` : null };
  });
  return out;
};
E.equip = function (state, uid) {
  const g = findGear(state, uid); if (!g) return { ok: false, reason: 'That item is no longer in your bag.' };
  const it = item(g.itemId); if (!it || !SLOTS.includes(it.slot)) return { ok: false, reason: 'That item cannot be equipped.' };
  const max0 = E.playerStats(state).maxHp;
  state.equipped[it.slot] = uid;
  gearHp(state, max0);
  return { ok: true };
};
E.unequip = function (state, slot) {
  const max0 = E.playerStats(state).maxHp;
  if (SLOTS.includes(slot)) state.equipped[slot] = null;
  gearHp(state, max0);
  return { ok: true };
};
export function clampHp(state) { const max = E.playerStats(state).maxHp; state.hp = clamp(num(state.hp, max), 0, max); }
/**
 * After a gear change (equip, unequip, loadout, repair): when max HP rose, current HP rises by the same
 * amount (full health stays full: 70/70 + a +7 HP piece = 77/77); when it dropped, HP is clamped.
 * `maxBefore` = E.playerStats(state).maxHp before the change.
 */
export function gearHp(state, maxBefore) {
  const max = E.playerStats(state).maxHp; const before = num(maxBefore, max);
  if (max > before) state.hp = num(state.hp, before) + (max - before);
  clampHp(state);
}

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
  const max0 = E.playerStats(state).maxHp;
  state.gold -= c.gold; g.dur = c.newMaxDur; g.maxDur = c.newMaxDur;
  gearHp(state, max0); // a broken equipped piece counts again
  E.log(state, 'info', `Repaired your ${E.gearName(g)} for ${fmtGold(c.gold)} (max durability now ${c.newMaxDur}).`);
  return { ok: true, gold: c.gold };
};
export function recipeFor(itemId) {
  return allActions().find((a) => a && a.kind === 'craft' && a.outputs && a.outputs[itemId]) || null;
}
// Salvage (QoL pass 2026-11-11): gear only. Returns ECON.salvagePct[rarity] of the recipe inputs, each
// input rounded up or down at random (seeded RNG), at the grade of the piece's quality. Protected unless
// opts.allowProtected: equipped pieces, pieces in any saved loadout, and rarity rare and above.
export const salvagePctOf = (rarity) => num((ECON.salvagePct || {})[rarity], num((ECON.salvagePct || {}).common, 0.2));
export function salvageBlock(state, g, allowProtected) {
  if (!g) return 'That item is no longer in your bag.';
  if (isEquipped(state, g.uid)) return 'Equipped. Unequip it first.';
  if (allowProtected) return '';
  if (arr(state.loadouts).some((l) => l && l.slots && SLOTS.some((s) => l.slots[s] === g.uid))) return 'Part of a saved loadout.';
  if (rarities().findIndex((r) => r.id === g.rarity) >= 2) return `${rarityDef(g.rarity).name} or better: protected.`;
  return '';
}
/** expected mats from one gear piece: [{ itemId, grade, exact }] */
export function salvageYield(g) {
  const rec = g && recipeFor(g.itemId); if (!rec || !rec.inputs) return [];
  const outQty = Math.max(1, num(rec.outputs[g.itemId], 1)); const pct = salvagePctOf(g.rarity); const grade = gradeOf(g.quality);
  return Object.keys(rec.inputs).filter((id) => item(id)).map((id) => ({ itemId: id, grade, exact: num(rec.inputs[id], 0) / outQty * pct })).filter((x) => x.exact > 0);
}
const uidList = (uids) => Array.from(new Set((Array.isArray(uids) ? uids : uids != null ? [uids] : []).map(String))); // deduped
E.salvagePreview = function (state, uids, opts) {
  const allow = !!(opts && opts.allowProtected); const agg = {}; const blocked = []; let gearCount = 0;
  uidList(uids).forEach((uid) => {
    const g = findGear(state, uid); const why = salvageBlock(state, g, allow);
    if (why) { blocked.push({ uid, reason: why }); return; }
    gearCount++;
    salvageYield(g).forEach((y) => {
      const k = y.itemId + '|' + y.grade; const a = agg[k] || (agg[k] = { itemId: y.itemId, grade: y.grade, qtyMin: 0, qtyMax: 0, expected: 0 });
      a.qtyMin += Math.floor(y.exact); a.qtyMax += Math.ceil(y.exact); a.expected += y.exact;
    });
  });
  const items = Object.values(agg).map((a: any) => Object.assign(a, { expected: Math.round(a.expected * 100) / 100 }));
  return { items, gearCount, blocked };
};
E.salvage = function (state, uids, opts) {
  // Any number of uids in one call: one pass, one gain event, one log line (mass salvage of stacked commons).
  const allow = !!(opts && opts.allowProtected); const blocked = []; const got = {}; let n = 0; const gone = new Set();
  uidList(uids).forEach((uid) => {
    const g = findGear(state, uid); const why = salvageBlock(state, g, allow);
    if (why) { blocked.push({ uid, reason: why }); return; }
    salvageYield(g).forEach((y) => {
      const q = Math.floor(y.exact) + (rand() < y.exact % 1 ? 1 : 0);
      if (q > 0) { addItem(state, y.itemId, y.grade, q); const k = y.itemId + '|' + y.grade; got[k] = (got[k] || 0) + q; }
    });
    gone.add(uid); n++;
  });
  if (gone.size) state.gear = state.gear.filter((x) => !gone.has(x.uid));
  const items = Object.keys(got).map((k) => { const [itemId, grade] = k.split('|'); return { itemId, grade: Number(grade), qty: got[k] }; });
  if (!n) return { ok: false, reason: blocked.length ? blocked[0].reason : 'Pick something to salvage.', salvaged: 0, items, blocked };
  emitGain('salvage', items);
  const byItem = {}; items.forEach((i) => { byItem[i.itemId] = (byItem[i.itemId] || 0) + i.qty; });
  const list = Object.keys(byItem).map((id) => qtyName(byItem[id], id)).join(', ');
  const text = `Salvaged ${n} item${n === 1 ? '' : 's'} → ${list || 'nothing useful'}.`;
  pushEvent(state, 'loot', text, { qty: n });
  E.log(state, 'info', text);
  return { ok: true, reason: '', salvaged: n, items, blocked };
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
