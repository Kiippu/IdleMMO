// Fight stats and role power (x10 scale). Gear overhaul 2026-11-12: tags, Swift and E.skillBonus are gone;
// work bonuses (tools + outfit) are E.workBonus in gear.ts.
/* eslint-disable */
import { E, SLOTS, num, cfg, elements, combatSkillIds, lcFirst } from './core';
import { findGear, emptyElements } from './gear';
import { roleDefs, roleDef } from './v4-helpers';
import { bossReq } from './server';
import { pouchHealTotal } from './raid-rules';
import { ELEMENT_SHARE_CAP, WARD_CAP, ELEMENT_MULT, ROLE_POWER, HP_DIV } from './data/gear/model';

/** { atk, def, heal, maxHp, power, elements (share % of weapon damage, total <= 50), wards (% less damage, each <= 20) } */
export function statsFor(state, slots) {
  const c = cfg();
  const out = { atk: 0, def: 0, heal: 0, maxHp: 0, power: 0, elements: emptyElements(), wards: emptyElements() };
  let gearHp = 0;
  SLOTS.forEach((slot) => {
    const g = findGear(state, slots && slots[slot]); if (!g) return;
    const s = E.gearStats(g);
    out.atk += s.atk; out.def += s.def; out.heal += s.heal; gearHp += s.hp;
    Object.keys(s.elements).forEach((e) => { out.elements[e] = num(out.elements[e], 0) + num(s.elements[e], 0); });
    Object.keys(s.wards).forEach((e) => { out.wards[e] = num(out.wards[e], 0) + num(s.wards[e], 0); });
  });
  const share = Object.values(out.elements).reduce((a: number, b: any) => a + num(b, 0), 0) as number;
  const k = share > ELEMENT_SHARE_CAP ? ELEMENT_SHARE_CAP / share : 1;
  Object.keys(out.elements).forEach((e) => { out.elements[e] = Math.round(out.elements[e] * k * 10) / 10; });
  Object.keys(out.wards).forEach((e) => { out.wards[e] = Math.round(Math.min(WARD_CAP, out.wards[e]) * 10) / 10; });
  const combatSum = combatSkillIds().reduce((a, id) => a + E.skillLevel(state, id), 0);
  // health on the x2 scale: rounded on the x10 scale, then / 5 (exact, so fights play out as before)
  out.maxHp = Math.max(1, Math.round((num(c.baseHp, 120) + num(c.hpPerCombatLevel, 8) * (combatSum - 3) + gearHp) * HP_DIV)) / HP_DIV;
  out.power = Math.round(out.atk + out.def + out.heal + out.maxHp / 2);
  return out;
}
/** element multiplier for the striker: 1 + sum over elements of share x (m - 1), m 1.25 weak / 0.75 the boss's own / 1 */
export function elementFactor(ps, boss) {
  if (!boss) return 1;
  let f = 1;
  elements().forEach((e) => {
    const s = num(ps.elements && ps.elements[e], 0) / 100; if (!s) return;
    const m = e === boss.weakTo ? ELEMENT_MULT.weak : e === boss.hits ? ELEMENT_MULT.own : 1;
    f += s * (m - 1);
  });
  return f;
}
export function powersOf(ps, boss) {
  const P = ROLE_POWER;
  return { striker: Math.round(ps.atk * P.striker.atk * elementFactor(ps, boss)), guardian: Math.round(ps.def * P.guardian.def + ps.maxHp * HP_DIV * (P.guardian.maxHp / HP_DIV)),
    mender: Math.round(ps.heal * P.mender.heal), supply: 0 };
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
E.loadoutStats = function (state, ref) {
  const slots = slotsOf(state, ref); const ps = statsFor(state, slots);
  return Object.assign(ps, { powers: powersOf(ps, E.currentBoss(state)) });
};
