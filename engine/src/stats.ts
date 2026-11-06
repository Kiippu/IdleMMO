// Stats, roles and tags.
// Ported from legacy/engine.js lines 1284-1373. Behaviour must stay identical to the
// legacy build (see test/parity.test.ts); design changes come in phase 1.
/* eslint-disable */
import { E, SLOTS, num, cfg, skillDefs, elements, item, action, combatSkillIds, clamp, lcFirst, gradeOf, gradeMult, rarityDef } from './core';
import { findGear, emptyElements } from './gear';
import { roleDefs, roleDef, tagDefs } from './v4-helpers';
import { bossReq } from './server';
import { pouchHealTotal } from './raid-rules';

// ================================================================ v4: stats, roles, tags
export function statsFor(state, slots) {
  const c = cfg();
  const out = { atk: 0, def: 0, heal: 0, maxHp: 0, power: 0, elements: emptyElements(), speed: 0 };
  let gearHp = 0;
  SLOTS.forEach((slot) => {
    const g = findGear(state, slots && slots[slot]); if (!g) return;
    const s = E.gearStats(g);
    out.atk += s.atk; out.def += s.def; out.heal += s.heal; gearHp += s.hp; out.speed += s.speed;
    Object.keys(s.elements).forEach((e) => { out.elements[e] = num(out.elements[e], 0) + s.elements[e]; });
  });
  const combatSum = combatSkillIds().reduce((a, id) => a + E.skillLevel(state, id), 0);
  out.maxHp = Math.max(1, Math.round(num(c.baseHp, 60) + num(c.hpPerCombatLevel, 4) * (combatSum - 3) + gearHp));
  const elemSum: number = (Object.values(out.elements) as number[]).reduce<number>((a, b: any) => a + (num(b, 0) as number), 0);
  out.power = Math.round(out.atk + out.def + out.heal + out.maxHp / 10 + elemSum * 0.5);
  out.speed = Math.min(50, out.speed);
  return out;
}
export function powersOf(ps, boss) {
  const weak = boss ? num(ps.elements[boss.weakTo], 0) : 0;
  const other = Object.keys(ps.elements).filter((e) => !boss || e !== boss.weakTo).reduce((a, e) => a + ps.elements[e], 0);
  return { striker: Math.round(ps.atk * 3 + weak * 3 + other), guardian: Math.round(ps.def * 2.5 + ps.maxHp * 0.1), mender: Math.round(ps.heal * 3), supply: 0 };
}
export function slotsOf(state, ref) {
  if (ref && typeof ref === 'object') return ref;
  if (ref == null || ref === 'equipped') return state.equipped;
  const l = E.loadout(state, ref); return l ? l.slots : state.equipped;
}
E.raidRoles = () => roleDefs().slice();
E.rolePower = function (state, role, slots) { return role === 'supply' ? pouchHealTotal(state) : num(powersOf(statsFor(state, slotsOf(state, slots)), E.currentBoss(state))[role], 0); };
E.roleRequirement = (state, role) => (role === 'supply' ? 0 : bossReq(E.currentBoss(state)));
E.roleCheck = function (state, role, ref) {
  const rd = roleDef(role); const slots = slotsOf(state, ref);
  const missing = SLOTS.filter((s) => slots[s] && !findGear(state, slots[s]));
  if (role === 'supply') return { role: 'supply', ok: true, power: pouchHealTotal(state), need: 0, label: rd.powerLabel || 'Supplies', missing, reason: '' };
  const power = E.rolePower(state, role, slots); const need = E.roleRequirement(state, role);
  const ok = power >= need;
  return { role, ok, power, need, label: rd.powerLabel || 'Power', missing,
    reason: ok ? (missing.length ? 'Some pieces are no longer in your bag.' : '') : `${rd.name} needs ${need} ${lcFirst(rd.powerLabel || 'power')} (you have ${power}).` };
};
export const TAG_PHRASE = { damage: 'damage', defence: 'defence', healing: 'healing', vitality: 'HP', mining: 'mining speed', woodcutting: 'woodcutting speed',
  foraging: 'foraging yield', fishing: 'fishing yield', hunting: 'hunting drops', quality: 'quality', speed: 'action speed' };
export const tagUnit = (id) => { const t = tagDefs().find((x) => x.id === id); return t ? t.unit : (['mining', 'woodcutting', 'foraging', 'fishing', 'hunting', 'speed'].includes(id) ? 'pct' : 'pts'); };
export const tagIds = () => (tagDefs().length ? tagDefs().map((t) => t.id) : Object.keys(TAG_PHRASE));
E.statTags = () => tagDefs().slice();
E.gearTags = function (g) {
  const out: any = {}; tagIds().forEach((t) => { out[t] = 0; });
  const it = g && item(g.itemId); if (!it) return out;
  const st = E.gearStats(g);
  out.damage = st.atk; out.defence = st.def; out.healing = st.heal; out.vitality = st.hp; out.speed = Math.round(st.speed * 10) / 1000;
  if (!(num(g.dur, 0) > 0)) return out;
  const m = num(rarityDef(g.rarity).statMult, 1) * gradeMult(gradeOf(g.quality));
  Object.keys(it.tags || {}).forEach((k) => { const v = num(it.tags[k], 0) * m; out[k] = num(out[k], 0) + (tagUnit(k) === 'pts' ? Math.round(v) : Math.round(v * 1000) / 1000); });
  return out;
};
export function slotsTags(state, slots) {
  const out: any = {}; tagIds().forEach((t) => { out[t] = 0; });
  SLOTS.forEach((s) => { const g = findGear(state, slots && slots[s]); if (!g) return; const t = E.gearTags(g); Object.keys(t).forEach((k) => { out[k] = Math.round((num(out[k], 0) + t[k]) * 1000) / 1000; }); });
  return out;
}
export function tagScore(g, tag, boss) {
  const st = E.gearStats(g);
  if (tag === 'damage') { const w = boss ? num(st.elements[boss.weakTo], 0) : 0; return st.atk * 3 + w * 3 + (Object.values(st.elements) as number[]).reduce<number>((a, b: any) => a + (num(b, 0) as number), 0) - w; }
  if (tag === 'defence') return st.def * 2.5 + st.hp * 0.1;
  if (tag === 'healing') return st.heal * 3;
  return num(E.gearTags(g)[tag], 0);
}
E.tagValue = (g, tag) => tagScore(g, tag, null);
E.activityTag = function (skillId) {
  const map = { mining: 'mining', woodcutting: 'woodcutting', herbalism: 'foraging', fishing: 'fishing', guardian: 'defence', mender: 'healing', striker: 'damage' };
  return map[skillId] || 'quality';
};
E.skillBonus = function (state, skillId, slots) {
  const t = slotsTags(state, slots || state.equipped);
  const def = skillDefs().find((s) => s.id === skillId) || {};
  const out = { speed: 0, yield: 0, quality: 0, drops: 0 };
  tagDefs().forEach((td) => {
    const v = num(t[td.id], 0); if (!v || td.kind !== 'skill' || td.id === 'speed') return;
    const applies = td.skill === skillId || (td.skill === 'combat' && def.tier === 'combat') || (td.skill === 'crafting' && (def.tier === 'crafting' || def.tier === 'refining' || def.tier === 'gathering'));
    if (!applies) return;
    if (td.effect === 'speed') out.speed += v; else if (td.effect === 'yield') out.yield += v; else if (td.effect === 'quality') out.quality += v; else if (td.effect === 'drops') out.drops += v;
  });
  out.speed = clamp(out.speed, 0, 0.6); out.yield = clamp(out.yield, 0, 1);
  return out;
};
E.loadoutStats = function (state, ref) {
  const slots = slotsOf(state, ref); const ps = statsFor(state, slots);
  return Object.assign(ps, { tags: slotsTags(state, slots), powers: powersOf(ps, E.currentBoss(state)) });
};
