// Gear: the three sections (fight gear, work outfit, tools), their formulas, equip, repair, salvage, fuse.
// Gear overhaul 2026-11-12 (gear spec, docs: /home/claude/gear-spec.md). Every formula for gear stats and work
// effects lives here; constants in data/gear/model.ts, item families in data/gear/families.ts.
// Save shape per piece: { uid, itemId, rarity, quality, affixes: [{ id, roll }], dur/maxDur (fight) | cond (tools) }.
/* eslint-disable */
import { E, SLOTS, arr, num, rarities, grades, elements, item, allActions, rand, clamp, shuffle, article, itemName, nextId, gradeOf, gradeMult, rarityDef, rarityIdx, fmtGold, qtyName, lcFirst } from './core';
import { addItem, consume, lowestGrade, markSeen } from './inventory';
import { ECON } from './data';
import { pushEvent } from './events';
import { emitGain } from './gains';
import { statsFor, powersOf } from './stats';
import {
  TIER_BUDGET, GEAR_GRADE_MULT, PRIMARY_STEP, SECONDARY_SHARE, HP_PER_POINT, ROLL_MIN, ROLL_MAX, ENDURING_PCT, DURABILITY,
  ELEMENT_AFFIX, WARD_AFFIX, AFFIXES, WORK_POOL, ELEMENT_AFFIXES, WARD_AFFIXES, STAT_AFFIX, EFFECTS, EFFECT_IDS, GROUP_EFFECTS,
  SKILL_GROUP, GROUP_SET, WORK_AFFIX_VALUE, WEAR_STEPS, TOOL_REPAIR_PER10, TOOL_REPAIR_TIER, OUTFIT_SETS, OUTFIT_PIECES, TOOL_SKILLS,
  HP_DIV, shareOf, baseStatsRaw
} from './data/gear/model';

// ---------------------------------------------------------------- lookup + where a piece is worn
export function findGear(state, uid) { return uid ? arr(state && state.gear).find((g) => g.uid === uid) || null : null; }
export const sectionOf = (it) => (it ? it.section || 'fight' : null);
export const affixDef = (id) => AFFIXES.find((a) => a.id === id) || null;
const r2 = (v) => Math.round(v * 100) / 100;
const r1 = (v) => Math.round(v * 10) / 10;
const r4 = (v) => Math.round(v * 10000) / 10000;
export function emptyOutfit() { const o = {}; OUTFIT_SETS.forEach((s) => { o[s] = {}; OUTFIT_PIECES.forEach((p) => { o[s][p] = null; }); }); return o; }
export function emptyTools() { const o = {}; TOOL_SKILLS.forEach((s) => { o[s] = null; }); return o; }
/** where a piece is worn: { section: 'fight', slot } | { section: 'outfit', set, piece } | { section: 'tool', skill } | null */
export function wornAt(state, uid) {
  if (!uid || !state) return null;
  const eq = state.equipped || {};
  for (const s of SLOTS) if (eq[s] === uid) return { section: 'fight', slot: s };
  const wo = state.workOutfit || {};
  for (const set of OUTFIT_SETS) for (const p of OUTFIT_PIECES) if (wo[set] && wo[set][p] === uid) return { section: 'outfit', set, piece: p };
  const t = state.tools || {};
  for (const k of TOOL_SKILLS) if (t[k] === uid) return { section: 'tool', skill: k };
  return null;
}
export function isEquipped(state, uid) { return !!wornAt(state, uid); }
export const emptyElements = () => { const o = {}; elements().forEach((e) => { o[e] = 0; }); return o; };
const ELEMENT_LABEL = { fire: 'Fire', frost: 'Frost', venom: 'Poison', holy: 'Holy' };
export const elementLabel = (e) => ELEMENT_LABEL[e] || (e ? e[0].toUpperCase() + e.slice(1) : '');

// ---------------------------------------------------------------- creation (affix rolls)
export function affixPool(it) {
  const sec = sectionOf(it);
  if (sec === 'tool') return WORK_POOL[GROUP_SET[it.toolGroup || SKILL_GROUP[it.toolSkill]] || 'craft'].slice();
  if (sec === 'outfit') return WORK_POOL[it.outfitSet].slice();
  const pri = it.primary;
  const noPri = (ids) => ids.filter((id) => (affixDef(id) || {}).key !== pri);
  if (it.slot === 'weapon') return noPri([...ELEMENT_AFFIXES, pri === 'heal' ? 'savage' : 'soothing', 'hale', 'enduring']);
  if (it.slot === 'offhand') return noPri(['sturdy', 'hale', ...WARD_AFFIXES, ...(it.type === 'tome' ? ['soothing'] : []), 'enduring']);
  if (it.slot === 'ring' || it.slot === 'amulet') return noPri(['savage', 'sturdy', 'soothing', 'hale', ...ELEMENT_AFFIXES, ...WARD_AFFIXES]);
  return noPri(['sturdy', 'hale', ...WARD_AFFIXES, ...(it.armour === 'cloth' ? ['soothing'] : it.armour === 'leather' ? ['savage'] : []), 'enduring']);
}
/** rIdx affixes: the first is always the primary; the rest drawn from the slot's pool (no repeats until it runs out) */
export function rollAffixes(it, rIdx) {
  const n = Math.max(0, Math.floor(num(rIdx, 0))); if (!n || !it) return [];
  const out = [{ id: 'primary', roll: 1 }];
  let bag = [];
  for (let k = 1; k < n; k++) {
    if (!bag.length) bag = shuffle(affixPool(it));
    const id = bag.shift(); if (!id) break;
    out.push({ id, roll: r2(ROLL_MIN + rand() * (ROLL_MAX - ROLL_MIN)) });
  }
  return out;
}
export const maxDurOf = (rarity, affixes) => Math.round(num(DURABILITY[rarityIdx(rarity)], 100) * (1 + (arr(affixes).some((a) => a && a.id === 'enduring') ? ENDURING_PCT / 100 : 0)));
export function makeGear(state, itemId, rIdx, quality, opts?) {
  const it = item(itemId);
  const rar = rarities()[clamp(Math.floor(num(rIdx, 0)), 0, rarities().length - 1)];
  const affixes = rollAffixes(it, rarities().indexOf(rar));
  const g: any = { uid: nextId(state, 'g'), itemId, rarity: rar.id, quality: clamp(Math.round(num(quality, 50)), 1, 100), affixes };
  const sec = sectionOf(it);
  if (sec === 'fight') { g.maxDur = maxDurOf(rar.id, affixes); g.dur = g.maxDur; }
  else if (sec === 'tool') g.cond = 100;
  state.gear.push(g); markSeen(state, itemId);
  return g;
}

// ---------------------------------------------------------------- fight stats (x10 scale)
const gm = (quality) => GEAR_GRADE_MULT[gradeOf(quality)] || 1;
/**
 * A fight stat: base x (grade + 12% per rarity step). The rarity bonus (the "primary" affix) lifts every base stat of the
 * piece, and a backstop keeps rarity r at Rough at least 1 above rarity r-1 at Pristine, so a higher rarity always wins
 * at any grade on every stat (and so on the piece's role power).
 */
export function primaryValue(base, gIdx, r) {
  let v = Math.max(base > 0 ? 1 : 0, Math.round(base * ((GEAR_GRADE_MULT[gIdx] || 1) + PRIMARY_STEP * r)));
  if (r > 0 && base > 0) v = Math.max(v, primaryValue(base, GEAR_GRADE_MULT.length - 1, r - 1) + 1);
  return v;
}
// ---- the ONE work-effect number format (tester 2026-11-13): >= 1 → one decimal ("+1.0%"), < 1 → two ("+0.25%")
/** the value as shown: rounded to 1 decimal when it shows >= 1, else to 2 */
export function effectShown(v) { const a = Math.abs(num(v, 0)); const r2v = Math.round(a * 100) / 100; const out = r2v >= 1 ? Math.round(a * 10) / 10 : r2v; return v < 0 ? -out : out; }
/** "1.0", "0.25", "12.5" (no sign, no unit) */
export function fmtEffectNum(v) { const sh = Math.abs(effectShown(v)); return sh >= 1 ? sh.toFixed(1) : sh.toFixed(2); }
/** "+1.0%", "+0.25%", "+2.0" (pts): use for every work effect the player sees */
export function fmtEffect(v, unit?) { return `${num(v, 0) < 0 ? '−' : '+'}${fmtEffectNum(v)}${unit === 'pts' ? '' : '%'}`; }
E.fmtEffect = fmtEffect;
const shownStep = (shown) => (Math.abs(shown) >= 1 ? 0.1 : 0.01);
/** a work piece's primary effect: base x (grade + 12% per rarity step), backstopped so rarity r at Rough SHOWS at least one
 *  display step above rarity r-1 at Pristine */
export function workPrimaryValue(base, gIdx, r) {
  let v = base * ((GEAR_GRADE_MULT[gIdx] || 1) + PRIMARY_STEP * r);
  if (r > 0 && base > 0) { const prev = effectShown(workPrimaryValue(base, GEAR_GRADE_MULT.length - 1, r - 1)); v = Math.max(v, prev + shownStep(prev) + 1e-9); }
  return Math.round(v * 10000) / 10000;
}
const slotBudget = (it) => TIER_BUDGET[clamp(num(it.tier, 1), 1, 5)] * shareOf(it.slot, it.hands);
const isJewel = (it) => it && (it.slot === 'ring' || it.slot === 'amulet');
/** one secondary affix's value in its own units (stat points x10, element/ward %, work effect display units) */
export function affixValue(it, af) {
  const d = affixDef(af && af.id); if (!d || !it) return 0;
  const tier = clamp(num(it.tier, 1), 1, 5); const roll = num(af.roll, 1);
  if (d.id === 'primary' || d.key === 'dur') return 0;
  if (d.kind === 'work') return r2(num((WORK_AFFIX_VALUE[d.key] || [])[tier], 0) * roll);
  if (d.key === 'hp') return Math.max(1, Math.round(slotBudget(it) * SECONDARY_SHARE * roll * HP_PER_POINT)) / HP_DIV; // HP: x2 scale
  if (['atk', 'def', 'heal'].includes(d.key)) return Math.max(1, Math.round(slotBudget(it) * SECONDARY_SHARE * roll));
  if (d.key.startsWith('ward_')) return r1(WARD_AFFIX[tier] * roll);
  return r1(ELEMENT_AFFIX[tier] * roll * (isJewel(it) ? 0.5 : 1)); // element share
}
/** nominal stats of a fight piece (ignores durability): { atk, def, heal, hp, elements, wards } */
export function fightStats(g) {
  const out = { atk: 0, def: 0, heal: 0, hp: 0, elements: emptyElements(), wards: emptyElements() };
  const it = g && item(g.itemId); if (!it || sectionOf(it) !== 'fight') return out;
  const raw = baseStatsRaw(it); const gIdx = gradeOf(g.quality); const r = rarityIdx(g.rarity);
  const hasPrimary = arr(g.affixes).some((a) => a && a.id === 'primary') || r > 0;
  Object.keys(raw).forEach((k) => {
    const v = primaryValue(raw[k], gIdx, hasPrimary ? r : 0);
    out[k] = num(out[k], 0) + v;
  });
  if (it.element) out.elements[it.element] = num(out.elements[it.element], 0) + num(it.elementShare, 0);
  arr(g.affixes).forEach((af) => {
    const d = affixDef(af && af.id); if (!d || d.kind !== 'fight') return;
    const v = affixValue(it, af);
    if (['atk', 'def', 'heal', 'hp'].includes(d.key)) out[d.key] += d.key === 'hp' ? v * HP_DIV : v; // hp summed on x10 first
    else if (d.key.startsWith('ward_')) { const e = d.key.slice(5); out.wards[e] = r1(num(out.wards[e], 0) + v); }
    else if (d.key !== 'dur') out.elements[d.key] = r1(num(out.elements[d.key], 0) + v);
  });
  if (num(it.bowBonus, 0) > 0) Object.keys(out.elements).forEach((e) => { if (out.elements[e] > 0) out.elements[e] = r1(out.elements[e] + it.bowBonus); });
  out.hp = Math.round(out.hp) / HP_DIV; // health: x2 scale (exactly the x10 value / 5)
  return out;
}
/** stats that count now: zero for a broken fight piece and for tools / outfit pieces */
E.gearStats = function (g) {
  const it = g && item(g.itemId);
  if (!it || sectionOf(it) !== 'fight' || !(num(g.dur, 0) > 0)) return { atk: 0, def: 0, heal: 0, hp: 0, elements: emptyElements(), wards: emptyElements() };
  return fightStats(g);
};
E.playerStats = function (state) { return statsFor(state, state.equipped); };

// ---------------------------------------------------------------- work effects (tools + outfit)
const zeroEffects = () => { const o: any = {}; EFFECT_IDS.forEach((id) => { o[id] = 0; }); return o; };
export const effectDef = (id) => EFFECTS.find((e) => e.id === id) || null;
/** groups a work piece applies to */
export function pieceGroups(it) {
  if (!it) return [];
  if (sectionOf(it) === 'tool') return [it.toolGroup || SKILL_GROUP[it.toolSkill]];
  if (sectionOf(it) === 'outfit') return Object.keys(GROUP_SET).filter((gr) => GROUP_SET[gr] === it.outfitSet);
  return [];
}
/** a work piece's raw (pre-cap) effects in display units; group = the skill group it is used for (null = every group it serves) */
export function pieceEffects(g, group?) {
  const out = zeroEffects();
  const it = g && item(g.itemId); const sec = sectionOf(it); if (!it || (sec !== 'tool' && sec !== 'outfit')) return out;
  const groups = group ? [group] : pieceGroups(it);
  const allowed = new Set(); groups.forEach((gr) => (GROUP_EFFECTS[gr] || []).forEach((e) => allowed.add(e)));
  const r = rarityIdx(g.rarity); const hasPrimary = arr(g.affixes).some((a) => a && a.id === 'primary') || r > 0;
  arr(it.effects).forEach((e) => {
    if (e.group && !groups.includes(e.group)) return;
    if (!allowed.has(e.id)) return;
    out[e.id] = r4(out[e.id] + workPrimaryValue(num(e.value, 0), gradeOf(g.quality), hasPrimary ? r : 0));
  });
  arr(g.affixes).forEach((af) => {
    const d = affixDef(af && af.id); if (!d || d.kind !== 'work' || !allowed.has(d.key)) return;
    out[d.key] = r4(out[d.key] + affixValue(it, af));
  });
  return out;
}
/** soft cap (lead 2026-11-12): linear up to half the cap, then cap/2 + cap/2 x (1 - e^(-(x - cap/2)/(cap/2))); never above cap */
export const softCap = (total, cap) => {
  const x = Math.max(0, total); if (!(cap > 0)) return x; const h = cap / 2;
  return x <= h ? x : h + h * (1 - Math.exp(-(x - h) / h));
};
export function effectLine(id, value, labelExtra?) {
  const d = effectDef(id) || { name: id, unit: 'pct' }; const unit = d.unit === 'pts' ? 'pts' : 'pct';
  const label = labelExtra ? `${d.name} ${labelExtra}` : d.name;
  return { key: id, label, value: effectShown(value), unit, text: `${label} ${fmtEffect(value, unit)}` };
}
/** EffectLine[] for a work piece's own contribution (craft outfit: quality for gear crafts, double for food/potions) */
export function pieceEffectLines(g) {
  const it = g && item(g.itemId); if (!it) return [];
  const sec = sectionOf(it); if (sec !== 'tool' && sec !== 'outfit') return [];
  const groups = pieceGroups(it);
  if (groups.length <= 1) { const e = pieceEffects(g, groups[0]); return EFFECT_IDS.filter((id) => e[id]).map((id) => effectLine(id, e[id])); }
  // craft outfit: one line per effect; the two primaries say where they apply
  const gc = pieceEffects(g, 'gearcraft'), co = pieceEffects(g, 'consumables'); const out = [];
  EFFECT_IDS.forEach((id) => {
    const a = num(gc[id], 0), b = num(co[id], 0);
    if (a && b && Math.abs(a - b) < 1e-9) out.push(effectLine(id, a));
    else { if (a) out.push(effectLine(id, a, b ? '(gear crafts)' : '(gear crafts)')); if (b) out.push(effectLine(id, b, '(food, potions)')); }
  });
  return out;
}
export const wearPct = (cond) => { const c = num(cond, 100); for (const w of WEAR_STEPS) if (c < w.below) return w.pct; return 0; };
const wearCache = new WeakMap();
/** E.workBonus(state, skillId): what the skill's tool + the matching outfit set give now (soft-capped) */
export function workBonus(state, skillId) {
  const group = SKILL_GROUP[skillId]; if (!group || !state) return null;
  const set = GROUP_SET[group];
  const tool = findGear(state, state.tools && state.tools[skillId]);
  const pieces = OUTFIT_PIECES.map((p) => findGear(state, state.workOutfit && state.workOutfit[set] && state.workOutfit[set][p])).filter(Boolean);
  const key = skillId + '|' + (tool ? tool.uid + ':' + tool.itemId + ':' + wearPct(tool.cond) : '-') + '|' + pieces.map((g) => g.uid + ':' + g.itemId).join(',');
  let c = wearCache.get(state); if (!c || c.gear !== state.gear) { c = { gear: state.gear, map: {} }; wearCache.set(state, c); }
  if (c.map[skillId] && c.map[skillId].key === key) return c.map[skillId].val;
  const raw = zeroEffects();
  [tool, ...pieces].forEach((g) => { if (!g) return; const e = pieceEffects(g, group); EFFECT_IDS.forEach((id) => { raw[id] = r4(raw[id] + e[id]); }); });
  EFFECT_IDS.forEach((id) => { raw[id] = r2(raw[id]); });
  const totals = zeroEffects(); const caps = {};
  EFFECTS.forEach((d) => { caps[d.id] = d.cap; totals[d.id] = r2(softCap(raw[d.id], d.cap)); });
  const wear = tool ? wearPct(tool.cond) : 0;
  const lines = (GROUP_EFFECTS[group] || []).filter((id) => totals[id]).sort((a, b) => EFFECT_IDS.indexOf(a) - EFFECT_IDS.indexOf(b)).map((id) => effectLine(id, totals[id]));
  const val = { skill: skillId, set, group, toolUid: tool ? tool.uid : null, toolItemId: tool ? tool.itemId : null,
    toolCond: tool ? Math.max(1, Math.round(num(tool.cond, 100))) : null, wear, totals, raw, caps, lines,
    wearText: wear ? `Worn tool: −${wear}% speed. Repair it.` : null };
  c.map[skillId] = { key, val };
  return val;
}
E.workBonus = workBonus;
/** soft-capped totals of the worn outfit pieces of each set alone (no tool) */
export function outfitTotals(state) {
  const out = {};
  OUTFIT_SETS.forEach((set) => {
    const groups = Object.keys(GROUP_SET).filter((gr) => GROUP_SET[gr] === set);
    const pieces = OUTFIT_PIECES.map((p) => findGear(state, state.workOutfit && state.workOutfit[set] && state.workOutfit[set][p])).filter(Boolean);
    const perGroup = groups.map((gr) => { const raw = zeroEffects(); pieces.forEach((g) => { const e = pieceEffects(g, gr); EFFECT_IDS.forEach((id) => { raw[id] += e[id]; }); });
      const t = zeroEffects(); EFFECTS.forEach((d) => { t[d.id] = r2(softCap(raw[d.id], d.cap)); }); return t; });
    const totals = zeroEffects(); perGroup.forEach((t) => EFFECT_IDS.forEach((id) => { totals[id] = Math.max(totals[id], t[id]); }));
    const lines = [];
    EFFECT_IDS.forEach((id) => {
      if (perGroup.length > 1) {
        const a = perGroup[0][id], b = perGroup[1][id];
        if (a && b && Math.abs(a - b) < 1e-9) lines.push(effectLine(id, a));
        else { if (a) lines.push(effectLine(id, a, '(gear crafts)')); if (b) lines.push(effectLine(id, b, '(food, potions)')); }
      } else if (totals[id]) lines.push(effectLine(id, totals[id]));
    });
    out[set] = { totals, lines };
  });
  return out;
}
E.outfitTotals = outfitTotals;
/** tool wear: −1% condition per hour of work, / (1 + 0.2 x rarity index); never below 1. Returns true when it crossed 50%. */
export function wearTool(state, skillId, secs) {
  const g = findGear(state, state && state.tools && state.tools[skillId]); if (!g || !(secs > 0)) return false;
  const before = num(g.cond, 100);
  g.cond = Math.max(1, before - (secs / 3600) / (1 + 0.2 * rarityIdx(g.rarity)));
  return before >= 50 && g.cond < 50;
}

// ---------------------------------------------------------------- health display (owner 2026-11-13)
// Health is stored with one decimal (steps of 0.2) so fights match the x10 maths exactly; the screen shows:
//   current HP rounded UP (never "0" while alive), max HP and totals rounded to whole,
//   small amounts (gear lines, change chips, heals, hits) with one decimal under 10 and whole from 10 up; never "+0".
const hpR1 = (v) => Math.round(v * 10) / 10;
/** current HP: rounded up, so a living hero never shows 0 */
export function fmtHpNow(v) { const n = num(v, 0); return n <= 0 ? '0' : String(Math.ceil(hpR1(n))); }
/** max HP and totals: nearest whole number */
export function fmtHpTotal(v) { return String(Math.round(num(v, 0))); }
/** small HP amounts (unsigned): "0.2", "3.6", "17", "24" */
export function fmtHpAmount(v) {
  const a = Math.abs(hpR1(num(v, 0)));
  if (a === 0) return '0';
  if (a < 10) return Number.isInteger(a) ? String(a) : a.toFixed(1);
  return String(Math.round(a));
}
/** signed HP change for chips and compares: "+0.2", "−3.6", "+17" */
export function fmtHpDelta(v) { const n = num(v, 0); return (n < 0 ? '−' : '+') + fmtHpAmount(n); }
E.fmtHpNow = fmtHpNow; E.fmtHpTotal = fmtHpTotal; E.fmtHpAmount = fmtHpAmount; E.fmtHpDelta = fmtHpDelta;

// ---------------------------------------------------------------- names, values, labels
const STAT_LABEL = { atk: 'Attack', def: 'Defence', heal: 'Healing', hp: 'Max HP' };
export const statLabel = (key) => STAT_LABEL[key] || (key.startsWith('ward_') ? `${elementLabel(key.slice(5))} resistance` : elements().includes(key) ? `${elementLabel(key)} damage` : key);
const isPts = (k) => ['atk', 'def', 'heal', 'hp'].includes(k);
/** the ONE stat wording: "Attack +47", "Max HP +150", "Fire damage +3.3%" (share of weapon damage), "Fire resistance +2.0%" */
export function statText(key, value) {
  const v = num(value, 0); const sign = v < 0 ? '−' : '+';
  if (key === 'hp') return `${statLabel(key)} ${sign}${fmtHpAmount(Math.abs(v))}`;
  return isPts(key) ? `${statLabel(key)} ${sign}${Math.abs(Math.round(v))}` : `${statLabel(key)} ${sign}${Math.abs(Math.round(v * 10) / 10).toFixed(1)}%`;
}
E.statText = statText;
export const statLine = (k, v) => ({ key: k, label: statLabel(k), value: v, unit: isPts(k) ? 'pts' : 'pct', text: statText(k, v) });
const statOrder = () => ['atk', 'def', 'heal', 'hp'].concat(elements(), elements().map((e) => 'ward_' + e));
/** fight piece stat lines (nominal: a broken piece shows what repairing it gives back) */
export function statLines(g) {
  const it = g && item(g.itemId); if (!it || sectionOf(it) !== 'fight') return [];
  const s = fightStats(g); const flat = { atk: s.atk, def: s.def, heal: s.heal, hp: s.hp };
  elements().forEach((e) => { flat[e] = num(s.elements[e], 0); flat['ward_' + e] = num(s.wards[e], 0); });
  return statOrder().filter((k) => num(flat[k], 0) !== 0).map((k) => statLine(k, flat[k]));
}
E.gearName = function (g) {
  if (!g) return '';
  const it = item(g.itemId); const base = it ? it.name : String(g.itemId);
  let pre = null, suf = null;
  arr(g.affixes).forEach((af) => {
    const d = affixDef(af && af.id); if (!d || d.id === 'primary') return;
    if (/^of\s/i.test(d.name)) { if (!suf) suf = d.name; } else if (!pre) pre = d.name;
  });
  return [pre, base, suf].filter(Boolean).join(' ');
};
E.itemValue = function (itemId, grade) {
  const it = item(itemId); if (!it) return 0;
  return Math.max(1, Math.round(num(it.value, 1) * gradeMult(clamp(Math.floor(num(grade, 1)), 0, 4))));
};
/** 0.5..1: worn fight gear (durability) and tools (condition) are worth less */
export function wearFactor(g) {
  const it = g && item(g.itemId); const sec = sectionOf(it);
  if (sec === 'tool') return 0.5 + 0.5 * clamp(num(g.cond, 100) / 100, 0, 1);
  if (sec === 'fight') return 0.5 + 0.5 * clamp(num(g.dur, 0) / Math.max(1, num(g.maxDur, 1)), 0, 1);
  return 1;
}
E.gearValue = function (g) {
  const it = g && item(g.itemId); if (!it) return 0;
  return Math.max(1, Math.round(num(it.value, 1) * num(rarityDef(g.rarity).valueMult, 1) * gradeMult(gradeOf(g.quality)) * wearFactor(g)));
};
function affixLines(g) {
  const it = item(g.itemId); if (!it) return [];
  const sec = sectionOf(it); const r = rarityIdx(g.rarity);
  return arr(g.affixes).map((af) => {
    const d = affixDef(af && af.id); if (!d) return null;
    if (d.id === 'primary') {
      const gIdx = gradeOf(g.quality); const name = `${rarityDef(g.rarity).name} bonus`;
      if (sec === 'fight') {
        // the rarity bonus lifts every base stat; the line lists each gain vs the same piece at Common
        const raw = baseStatsRaw(it); const parts = [];
        ['atk', 'def', 'heal', 'hp'].forEach((k) => { if (!(raw[k] > 0)) return; const dv = (primaryValue(raw[k], gIdx, r) - primaryValue(raw[k], gIdx, 0)) / (k === 'hp' ? HP_DIV : 1); if (dv) parts.push(statText(k, dv)); });
        const v = primaryValue(raw[it.primary] || 0, gIdx, r) - primaryValue(raw[it.primary] || 0, gIdx, 0);
        return { id: 'primary', name, key: it.primary, value: v, unit: 'pts', label: `${name}: ${parts.join(', ')}` };
      }
      const parts = []; let first = null;
      arr(it.effects).forEach((e) => {
        const dv = effectShown(workPrimaryValue(num(e.value, 0), gIdx, r)) - effectShown(workPrimaryValue(num(e.value, 0), gIdx, 0));
        const unit = (effectDef(e.id) || {}).unit === 'pts' ? 'pts' : 'pct';
        if (!first) first = { key: e.id, value: effectShown(dv), unit };
        parts.push(`${(effectDef(e.id) || {}).name}${e.group ? (e.group === 'gearcraft' ? ' (gear crafts)' : ' (food, potions)') : ''} ${fmtEffect(dv, unit)}`);
      });
      if (!first) return null;
      return { id: 'primary', name, key: first.key, value: first.value, unit: first.unit, label: `${name}: ${parts.join(', ')}` };
    }
    if (d.key === 'dur') return { id: d.id, name: d.name, key: 'dur', value: ENDURING_PCT, unit: 'pct', label: `${d.name}: +${ENDURING_PCT}% max durability` };
    const v = affixValue(it, af);
    if (d.kind === 'work') { const unit = (effectDef(d.key) || {}).unit === 'pts' ? 'pts' : 'pct'; return { id: d.id, name: d.name, key: d.key, value: effectShown(v), unit, label: `${d.name}: ${(effectDef(d.key) || {}).name} ${fmtEffect(v, unit)}` }; }
    return { id: d.id, name: d.name, key: d.key, value: v, unit: isPts(d.key) ? 'pts' : 'pct', label: `${d.name}: ${statText(d.key, v)}` };
  }).filter(Boolean);
}

// ---------------------------------------------------------------- equip
export function inAnyLoadout(state, uid) { return arr(state && state.loadouts).some((l) => l && l.slots && SLOTS.some((s) => l.slots[s] === uid)); }
const ringScore = (state, uid) => { const g = findGear(state, uid); if (!g) return -1; const s = E.gearStats(g); return s.atk + s.def + s.heal + s.hp / 2; }; // hp on the x2 scale (/10 on x10)
/** the fight slot equip(uid) would use for this piece (rings: given slot, else first empty, else the weaker ring) */
export function targetFightSlot(state, it, slot?) {
  if (!it) return null;
  if (it.slot === 'ring') {
    if (slot === 'ring1' || slot === 'ring2') return slot;
    if (!state.equipped.ring1) return 'ring1';
    if (!state.equipped.ring2) return 'ring2';
    return ringScore(state, state.equipped.ring2) < ringScore(state, state.equipped.ring1) ? 'ring2' : 'ring1';
  }
  return SLOTS.includes(it.slot) ? it.slot : null;
}
/** the WornAt a piece would take if equipped now */
export function targetFor(state, g, slot?) {
  const it = g && item(g.itemId); const sec = sectionOf(it); if (!it) return null;
  if (sec === 'tool') return { section: 'tool', skill: it.toolSkill };
  if (sec === 'outfit') return { section: 'outfit', set: it.outfitSet, piece: it.slot };
  const s = targetFightSlot(state, it, slot); return s ? { section: 'fight', slot: s } : null;
}
const uidAt = (state, at) => !at ? null : at.section === 'fight' ? state.equipped[at.slot] : at.section === 'tool' ? state.tools[at.skill] : state.workOutfit[at.set][at.piece];
function setAt(state, at, uid) {
  if (at.section === 'fight') state.equipped[at.slot] = uid;
  else if (at.section === 'tool') state.tools[at.skill] = uid;
  else state.workOutfit[at.set][at.piece] = uid;
}
export function ensureWorkSlots(state) {
  if (!state.workOutfit || typeof state.workOutfit !== 'object') state.workOutfit = emptyOutfit();
  OUTFIT_SETS.forEach((s) => { if (!state.workOutfit[s]) state.workOutfit[s] = {}; OUTFIT_PIECES.forEach((p) => { if (state.workOutfit[s][p] === undefined) state.workOutfit[s][p] = null; }); });
  if (!state.tools || typeof state.tools !== 'object') state.tools = emptyTools();
  TOOL_SKILLS.forEach((k) => { if (state.tools[k] === undefined) state.tools[k] = null; });
}
E.equip = function (state, uid, slot?) {
  const fail = (reason, section = null) => ({ ok: false, reason, section, at: null, replaced: null });
  const g = findGear(state, uid); if (!g) return fail('That item is no longer in your bag.');
  const it = item(g.itemId); if (!it || it.kind !== 'gear') return fail('That item cannot be equipped.');
  ensureWorkSlots(state);
  const at = targetFor(state, g, slot); const sec = sectionOf(it); if (!at) return fail('That item cannot be equipped.', sec);
  const max0 = E.playerStats(state).maxHp;
  if (at.section === 'fight') {
    if (at.slot === 'offhand') { const w = item((findGear(state, state.equipped.weapon) || {}).itemId); if (w && w.hands === 2) return fail('Your two-handed weapon needs both hands.', sec); }
  }
  const cur = wornAt(state, uid);
  if (cur && JSON.stringify(cur) === JSON.stringify(at)) return { ok: true, reason: '', section: sec, at, replaced: null };
  if (cur) setAt(state, cur, null); // moving a ring between ring slots
  const replaced = uidAt(state, at) || null;
  setAt(state, at, uid);
  if (at.section === 'fight' && at.slot === 'weapon' && it.hands === 2 && state.equipped.offhand) state.equipped.offhand = null;
  gearHp(state, max0);
  return { ok: true, reason: '', section: sec, at, replaced };
};
E.unequip = function (state, slot) {
  const max0 = E.playerStats(state).maxHp;
  if (SLOTS.includes(slot)) state.equipped[slot] = null;
  gearHp(state, max0);
  return { ok: true };
};
E.unequipGear = function (state, uid) {
  const at = wornAt(state, uid); if (!at) return { ok: false, reason: findGear(state, uid) ? 'It is not being worn.' : 'That item is no longer in your bag.' };
  const max0 = E.playerStats(state).maxHp; setAt(state, at, null); gearHp(state, max0);
  return { ok: true, reason: '' };
};
export function clampHp(state) { const max = E.playerStats(state).maxHp; state.hp = clamp(num(state.hp, max), 0, max); }
/**
 * After a gear change (equip, unequip, loadout, repair): when max HP rose, current HP rises by the same
 * amount (full health stays full); when it dropped, HP is clamped. `maxBefore` = E.playerStats(state).maxHp before.
 */
export function gearHp(state, maxBefore) {
  const max = E.playerStats(state).maxHp; const before = num(maxBefore, max);
  if (max > before) state.hp = num(state.hp, before) + (max - before);
  clampHp(state);
}

// ---------------------------------------------------------------- repair
export function toolRepairGold(g) {
  const it = g && item(g.itemId); if (!it || sectionOf(it) !== 'tool') return 0;
  const missing = Math.max(0, 100 - num(g.cond, 100)); if (missing <= 1e-9) return 0;
  return Math.max(1, Math.ceil(missing / 10 * TOOL_REPAIR_PER10 * num(TOOL_REPAIR_TIER[clamp(num(it.tier, 1), 1, 5)], 1)));
}
const repairDiscount = (state) => { const b = state && state.server ? E.weekBuff(state) : null; return b && b.kind === 'repair' ? clamp(num(b.value, 0), 0, 0.9) : 0; };
E.repairCost = function (state, uid) {
  const g = findGear(state, uid); if (!g) return { gold: 0, newMaxDur: 0 };
  const it = item(g.itemId); const disc = repairDiscount(state);
  if (sectionOf(it) === 'tool') { const full = toolRepairGold(g); return { gold: full > 0 ? Math.max(1, Math.ceil(full * (1 - disc))) : 0, cond: 100, discount: disc }; }
  if (sectionOf(it) !== 'fight') return { gold: 0, newMaxDur: 0, discount: 0 };
  const newMaxDur = Math.max(10, Math.round(num(g.maxDur, 100) * 0.8));
  const missing = clamp(1 - num(g.dur, 0) / Math.max(1, g.maxDur), 0, 1);
  const full = Math.max(1, Math.round(num(it.value, 1) * num(rarityDef(g.rarity).valueMult, 1) * gradeMult(gradeOf(g.quality))));
  return { gold: missing > 0 ? Math.max(1, Math.ceil(full * 0.25 * missing * (1 - disc))) : 0, newMaxDur, discount: disc };
};
function repairCheck(state, g) {
  const it = g && item(g.itemId); if (!g) return { can: false, reason: 'That item is no longer in your bag.', gold: 0 };
  const c = E.repairCost(state, g.uid); const sec = sectionOf(it);
  if (sec === 'outfit') return { can: false, reason: 'Work clothes never wear out.', gold: 0 };
  if (sec === 'tool') {
    if (num(g.cond, 100) >= 100) return { can: false, reason: 'It is already in perfect condition.', gold: 0 };
  } else {
    if (g.dur >= g.maxDur) return { can: false, reason: 'It is already in perfect condition.', gold: 0, newMaxDur: c.newMaxDur };
    if (g.dur >= c.newMaxDur) return { can: false, reason: `Still at ${Math.round(g.dur)} durability; repairing now would only lower its maximum to ${c.newMaxDur}.`, gold: c.gold, newMaxDur: c.newMaxDur };
  }
  if (num(state.gold, 0) < c.gold) return { can: false, reason: `Repairing costs ${fmtGold(c.gold)} and you have ${fmtGold(Math.floor(state.gold))}.`, gold: c.gold, newMaxDur: c.newMaxDur };
  return { can: true, reason: '', gold: c.gold, newMaxDur: c.newMaxDur };
}
E.repair = function (state, uid) {
  const g = findGear(state, uid); const chk = repairCheck(state, g);
  if (!chk.can) return { ok: false, reason: chk.reason, gold: 0 };
  const it = item(g.itemId); state.gold -= chk.gold;
  if (sectionOf(it) === 'tool') {
    g.cond = 100;
    E.log(state, 'info', `Repaired your ${E.gearName(g)} for ${fmtGold(chk.gold)}.`);
    return { ok: true, reason: '', gold: chk.gold, cond: 100 };
  }
  const max0 = E.playerStats(state).maxHp;
  g.dur = chk.newMaxDur; g.maxDur = chk.newMaxDur;
  gearHp(state, max0); // a broken equipped piece counts again
  E.log(state, 'info', `Repaired your ${E.gearName(g)} for ${fmtGold(chk.gold)} (max durability now ${chk.newMaxDur}).`);
  return { ok: true, reason: '', gold: chk.gold, maxDur: chk.newMaxDur };
};
const toolsBelowFull = (state) => arr(state.gear).filter((g) => sectionOf(item(g.itemId)) === 'tool' && num(g.cond, 100) < 100);
E.toolRepairAll = function (state) {
  const list = toolsBelowFull(state); const disc = repairDiscount(state);
  return { count: list.length, gold: list.reduce((a, g) => a + Math.max(1, Math.ceil(toolRepairGold(g) * (1 - disc))), 0) };
};
E.repairAllTools = function (state) {
  const t = E.toolRepairAll(state);
  if (!t.count) return { ok: false, reason: 'Every tool is in perfect condition.', gold: 0, count: 0 };
  if (num(state.gold, 0) < t.gold) return { ok: false, reason: `Repairing every tool costs ${fmtGold(t.gold)} and you have ${fmtGold(Math.floor(state.gold))}.`, gold: 0, count: 0 };
  toolsBelowFull(state).forEach((g) => { g.cond = 100; });
  state.gold -= t.gold;
  E.log(state, 'info', `Repaired ${t.count} tool${t.count === 1 ? '' : 's'} for ${fmtGold(t.gold)}.`);
  return { ok: true, reason: '', gold: t.gold, count: t.count };
};

// ---------------------------------------------------------------- detail (item card) + info (lists)
const findAnyGear = (state, uid) => findGear(state, uid) || arr(state && state.crew && state.crew.vault && state.crew.vault.gear).find((g) => g && g.uid === uid) || null;
E.gearDetail = function (state, uid) {
  const g = findAnyGear(state, uid); if (!g) return null;
  const it = item(g.itemId) || {}; const sec = sectionOf(it); const grade = gradeOf(g.quality);
  const worn = wornAt(state, g.uid); const inBag = !!findGear(state, g.uid);
  const d: any = {
    uid: g.uid, itemId: g.itemId, name: E.gearName(g), section: sec, slot: it.slot || '', type: it.type || '', material: it.material || '', tier: num(it.tier, 1),
    rarity: g.rarity, grade, gradeName: (grades()[grade] || {}).name || '', value: E.gearValue(g),
    worn, equipped: !!worn, inLoadout: inAnyLoadout(state, g.uid),
    stats: statLines(g), effects: pieceEffectLines(g), affixes: affixLines(g), repair: null, compare: null
  };
  if (sec === 'fight') Object.assign(d, { role: it.role, hands: it.hands, dur: num(g.dur, 0), maxDur: num(g.maxDur, 0), broken: !(num(g.dur, 0) > 0) });
  if (sec === 'tool') Object.assign(d, { toolSkill: it.toolSkill, cond: Math.max(1, Math.round(num(g.cond, 100))), wear: wearPct(g.cond) });
  if (sec === 'outfit') d.outfitSet = it.outfitSet;
  if (sec !== 'outfit' && inBag) { const chk = repairCheck(state, g); d.repair = { gold: chk.gold, can: chk.can, reason: chk.reason }; if (sec === 'fight') d.repair.newMaxDur = chk.newMaxDur; }
  if (sec === 'tool' && inBag) {
    const now = workBonus(state, it.toolSkill).totals; const prev = state.tools[it.toolSkill];
    state.tools[it.toolSkill] = g.uid; const ifWorn = Object.assign({}, workBonus(state, it.toolSkill).totals); state.tools[it.toolSkill] = prev;
    d.final = { now: Object.assign({}, now), ifWorn };
  }
  // compare against what equip(uid) would replace
  const at = inBag && !worn ? targetFor(state, g) : null;
  const curUid = at ? uidAt(state, at) : null; const cur = curUid ? findGear(state, curUid) : null;
  if (cur) {
    const c: any = { uid: cur.uid, name: E.gearName(cur), rarity: cur.rarity, grade: gradeOf(cur.quality), at, stats: statLines(cur), effects: pieceEffectLines(cur) };
    let mine = {}, theirs = {}, keys = [], unitOf = {}, labelOf = {};
    if (sec === 'fight') {
      d.stats.forEach((l) => { mine[l.key] = l.value; unitOf[l.key] = l.unit; labelOf[l.key] = l.label; });
      c.stats.forEach((l) => { theirs[l.key] = l.value; unitOf[l.key] = l.unit; labelOf[l.key] = l.label; });
      keys = statOrder().filter((k) => k in mine || k in theirs);
      const boss = E.currentBoss(state); const nowP = powersOf(statsFor(state, state.equipped), boss);
      const next = Object.assign({}, state.equipped, { [at.slot]: g.uid }); if (at.slot === 'weapon' && it.hands === 2) next.offhand = null;
      const toP = powersOf(statsFor(state, next), boss);
      c.power = {}; ['guardian', 'mender', 'striker'].forEach((r) => { c.power[r] = { from: nowP[r], to: toP[r], delta: toP[r] - nowP[r] }; });
      c.broken = !(num(cur.dur, 0) > 0);
    } else {
      const groups = pieceGroups(it);
      const sum = (x) => { const o = {}; groups.forEach((gr) => { const e = pieceEffects(x, gr); EFFECT_IDS.forEach((id) => { o[id] = Math.max(num(o[id], 0), e[id]); }); }); return o; };
      mine = sum(g); theirs = sum(cur);
      keys = EFFECT_IDS.filter((id) => mine[id] || theirs[id]);
      keys.forEach((k) => { unitOf[k] = (effectDef(k) || {}).unit === 'pts' ? 'pts' : 'pct'; labelOf[k] = (effectDef(k) || {}).name; });
      if (sec === 'tool') c.cond = Math.max(1, Math.round(num(cur.cond, 100)));
    }
    c.diff = keys.map((k) => { const a = num(mine[k], 0), b = num(theirs[k], 0); return { key: k, label: labelOf[k], unit: unitOf[k] || 'pts', mine: a, theirs: b, delta: r2(a - b) }; });
    d.compare = c;
  }
  return d;
};
/** E.gearInfo(state) → Record<uid, GearInfo> for every bag gear piece */
E.gearInfo = function (state) {
  const out = {}; if (!state) return out;
  const inLo = new Set(); arr(state.loadouts).forEach((l) => { if (l && l.slots) SLOTS.forEach((s) => { if (l.slots[s]) inLo.add(l.slots[s]); }); });
  const common = rarities()[0].id;
  arr(state.gear).forEach((g) => {
    const it = item(g.itemId); const sec = sectionOf(it);
    const grade = gradeOf(g.quality); const worn = wornAt(state, g.uid); const inLoadout = inLo.has(g.uid);
    const fresh = sec === 'tool' ? num(g.cond, 100) >= 100 : sec === 'fight' ? num(g.dur, 0) >= num(g.maxDur, 0) && num(g.maxDur, 0) >= maxDurOf(g.rarity, g.affixes) : true;
    const stack = g.rarity === common && !worn && !inLoadout && fresh && !arr(g.affixes).length;
    const info: any = { section: sec, worn, grade, equipped: !!worn, inLoadout, stackKey: stack && !g.starter ? `${g.itemId}|${grade}` : null };
    if (g.starter) info.starter = true;
    if (sec === 'tool') Object.assign(info, { cond: Math.max(1, Math.round(num(g.cond, 100))), wear: wearPct(g.cond), repairGold: toolRepairGold(g), low: num(g.cond, 100) < 50 });
    if (sec === 'fight') info.low = num(g.dur, 0) / Math.max(1, num(g.maxDur, 1)) < 0.25;
    if (sec !== 'fight') info.effectLines = pieceEffectLines(g);
    out[g.uid] = info;
  });
  return out;
};
/** raw (pre-cap) effect change per bag tool / outfit piece vs what is in its slot now */
export function workDeltas(state) {
  const out = {}; if (!state) return out;
  arr(state.gear).forEach((g) => {
    const it = item(g.itemId); const sec = sectionOf(it); if ((sec !== 'tool' && sec !== 'outfit') || wornAt(state, g.uid)) return;
    const at = targetFor(state, g); const cur = findGear(state, uidAt(state, at));
    const groups = pieceGroups(it); const d = {};
    EFFECT_IDS.forEach((id) => {
      let a = 0, b = 0; groups.forEach((gr) => { a = Math.max(a, pieceEffects(g, gr)[id]); b = Math.max(b, cur ? pieceEffects(cur, gr)[id] : 0); });
      if (Math.abs(a - b) > 1e-9) d[id] = r2(a - b);
    });
    out[g.uid] = d;
  });
  return out;
}
E.workDeltas = workDeltas;

// ---------------------------------------------------------------- salvage
export function recipeFor(itemId) {
  return allActions().find((a) => a && a.kind === 'craft' && a.outputs && a.outputs[itemId]) || null;
}
// Salvage (QoL pass 2026-11-11; all three sections since the gear overhaul): returns ECON.salvagePct[rarity] of the
// recipe inputs, each rounded up or down at random, at the grade of the piece's quality. Worn pieces never;
// pieces in a saved loadout and Rare+ only with opts.allowProtected.
export const salvagePctOf = (rarity) => num((ECON.salvagePct || {})[rarity], num((ECON.salvagePct || {}).common, 0.2));
export const IN_USE_REASON = 'In use. Take it off first.';
export const STARTER_REASON = 'A starter tool: it can\'t be sold or salvaged.';
export function salvageBlock(state, g, allowProtected) {
  if (!g) return 'That item is no longer in your bag.';
  if (isEquipped(state, g.uid)) return IN_USE_REASON;
  if (g.starter) return STARTER_REASON;
  if (allowProtected) return '';
  if (inAnyLoadout(state, g.uid)) return 'Part of a saved loadout.';
  if (rarityIdx(g.rarity) >= 2) return `${rarityDef(g.rarity).name} or better: protected.`;
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
  const use = cand.uids.slice(0, 5);
  const qs = use.map((u) => findGear(state, u).quality);
  state.gear = state.gear.filter((g) => !use.includes(g.uid));
  const rIdx = rand() < 0.15 ? Math.min(2, rarities().length - 1) : Math.min(1, rarities().length - 1);
  const g = makeGear(state, itemId, rIdx, qs.reduce((a, b) => a + b, 0) / 5);
  E.log(state, 'craft', `Fused 5 Commons into ${article(rarities()[rIdx].name)} ${rarities()[rIdx].name} ${itemName(itemId)}.`);
  return { ok: true, gear: g };
};

// ---------------------------------------------------------------- food
/** heal on the x2 HP scale, rounded on the x10 scale first (so it is exactly the old heal / 5) */
export function healOf(itemId, grade) { const it = item(itemId); return it ? Math.max(1, Math.round(num(it.heal, 0) * HP_DIV * gradeMult(Math.max(0, grade)))) / HP_DIV : 0; }
E.eat = function (state, itemId) {
  const it = item(itemId);
  if (!it || !(num(it.heal, 0) > 0)) return { ok: false, reason: 'That is not something you can eat.' };
  if (E.itemCount(state, itemId) <= 0) return { ok: false, reason: `You have no ${lcFirst(it.name)}.` };
  const max = E.playerStats(state).maxHp;
  if (state.hp >= max) return { ok: false, reason: 'You are already at full HP.' };
  const gr = lowestGrade(state, itemId); const h = healOf(itemId, gr);
  consume(state, itemId, 1, 'worst');
  const before = state.hp; state.hp = Math.min(max, state.hp + h);
  return { ok: true, heal: r1(state.hp - before) };
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
    events.push({ type: 'eat', itemId: c.id, heal: r1(state.hp - before) });
  }
}
