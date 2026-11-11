// War Room views (juice pass 2026-11-12), read-only:
//   E.raidReadiness(state) → { req, power: { guardian, mender, striker }, bestRole, best, ok, tips }
//     Built from statsFor / powersOf / bossReq (the same maths the raid uses). Slots = this week's lock
//     snapshot when locked in, else what you are wearing. tips: 1-3 short lines on what raises the best
//     role's power (empty slots, broken gear, the boss's weakness).
//   E.equipDeltas(state) → { [uid]: { hp, atk, def, heal, power, speed, elements } } for every unequipped
//     bag gear piece: the change in your stats if you wore it instead of what is in its slot now.
/* eslint-disable */
import { E, SLOTS, arr, num, item } from './core';
import { findGear } from './gear';
import { statsFor, powersOf } from './stats';
import { bossReq } from './server';
import { lockedNow } from './raid-rules';

const ROLES3 = ['guardian', 'mender', 'striker'];
// which skill crafts each role's pieces (data: craft actions by item role + slot)
const WEAPON_SKILL = { guardian: 'Smithing', mender: 'Woodworking', striker: 'Smithing' };
const WEAPON_WORD = { guardian: 'a mace', mender: 'a staff', striker: 'a weapon' };
const ARMOUR = { guardian: 'Craft armour at Smithing', mender: 'Craft robes at Tailoring', striker: 'Craft leather armour at Leatherworking' };

function bagHas(state, slot, slots) {
  const worn = new Set(SLOTS.map((s) => slots[s]).filter(Boolean));
  return arr(state.gear).some((g) => !worn.has(g.uid) && num(g.dur, 0) > 0 && item(g.itemId) && item(g.itemId).slot === slot);
}

export function raidReadiness(state) {
  const slots = lockedNow(state) && state.raid.lock && state.raid.lock.slots ? state.raid.lock.slots : state.equipped;
  const boss = E.currentBoss(state);
  const req = bossReq(boss);
  const ps = statsFor(state, slots);
  const p = powersOf(ps, boss);
  const power = { guardian: num(p.guardian, 0), mender: num(p.mender, 0), striker: num(p.striker, 0) };
  // highest power; ties go to striker, then guardian, then mender (the order raid-rules bestRole uses)
  const bestRole = ['striker', 'guardian', 'mender'].reduce((a, r) => (power[r] > power[a] ? r : a), 'striker');
  const best = power[bestRole];
  const ok = best >= req;
  const tips = [];
  const piece = (s) => findGear(state, slots && slots[s]);
  const weapon = piece('weapon');
  if (!weapon) tips.push(bagHas(state, 'weapon', slots) ? 'Equip a weapon' : `Craft ${WEAPON_WORD[bestRole]} at ${WEAPON_SKILL[bestRole]}`);
  if (SLOTS.some((s) => { const g = piece(s); return g && !(num(g.dur, 0) > 0); })) tips.push('Repair your broken gear');
  const noArmour = ['head', 'chest', 'legs'].filter((s) => !piece(s));
  if (noArmour.length) tips.push(noArmour.some((s) => bagHas(state, s, slots)) ? 'Equip armour from your bag' : ARMOUR[bestRole]);
  if (bestRole === 'guardian' && !piece('offhand')) tips.push(bagHas(state, 'offhand', slots) ? 'Equip a shield' : 'Craft a shield at Woodworking');
  if (bestRole === 'striker' && boss && boss.weakTo && !(num(ps.elements[boss.weakTo], 0) > 0)) tips.push(`${boss.name} is weak to ${boss.weakTo}: use a ${boss.weakTo} weapon`);
  if (!piece('ring')) tips.push(bagHas(state, 'ring', slots) ? 'Equip a ring' : 'Craft a ring at Jewelcrafting');
  if (!tips.length) tips.push(ok ? 'Higher grades and rarities raise your share' : 'Craft higher-tier gear for your role');
  return { req, power, bestRole, best, ok, tips: tips.slice(0, 3) };
}
E.raidReadiness = raidReadiness;

export function equipDeltas(state) {
  const out = {};
  if (!state) return out;
  const cur = statsFor(state, state.equipped);
  const worn = new Set(SLOTS.map((s) => state.equipped[s]).filter(Boolean));
  arr(state.gear).forEach((g) => {
    const it = item(g.itemId); if (!it || worn.has(g.uid) || !SLOTS.includes(it.slot)) return;
    const next = Object.assign({}, state.equipped, { [it.slot]: g.uid });
    const ns = statsFor(state, next);
    const elements = {};
    Object.keys(ns.elements).forEach((e) => { const d = num(ns.elements[e], 0) - num(cur.elements[e], 0); if (d) elements[e] = d; });
    out[g.uid] = { hp: ns.maxHp - cur.maxHp, atk: ns.atk - cur.atk, def: ns.def - cur.def, heal: ns.heal - cur.heal, power: ns.power - cur.power, speed: ns.speed - cur.speed, elements };
  });
  return out;
}
E.equipDeltas = equipDeltas;
