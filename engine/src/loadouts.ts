// Loadouts.
// Ported from legacy/engine.js lines 1374-1466. Behaviour must stay identical to the
// legacy build (see test/parity.test.ts); design changes come in phase 1.
/* eslint-disable */
import { ctx } from './context';
import { E, SLOTS, arr, num, item, lcFirst, nextId } from './core';
import { findGear, gearHp } from './gear';
import { statsFor, powersOf, slotsOf } from './stats';
import { findVaultGear } from './crew-economy';

// ================================================================ v4: loadouts
export const emptySlots = () => { const o = {}; SLOTS.forEach((s) => { o[s] = null; }); return o; };
export function cleanSlots(state, slots) { const o = emptySlots(); SLOTS.forEach((s) => { const u = slots && slots[s]; if (u && typeof u === 'string') o[s] = u; }); return o; }
E.loadout = (state, id) => arr(state.loadouts).find((l) => l.id === id) || null;
E.loadouts = function (state) {
  const plan = state.raid.plan || {}; const lock = state.raid.lock;
  return arr(state.loadouts).map((l) => {
    const missing = SLOTS.filter((s) => l.slots[s] && !findGear(state, l.slots[s]));
    const rc = {}; ['guardian', 'mender', 'striker'].forEach((r) => { rc[r] = E.roleCheck(state, r, l.slots); });
    return Object.assign({}, l, { slots: Object.assign({}, l.slots), missing, complete: missing.length === 0, pieces: SLOTS.filter((s) => l.slots[s]).length,
      roleChecks: rc, isRaid: plan.loadoutId === l.id, locked: !!(lock && lock.loadoutId === l.id) });
  });
};
E.saveLoadout = function (state, spec) {
  spec = spec || {};
  if (!Array.isArray(state.loadouts)) state.loadouts = [];
  let l = spec.id ? E.loadout(state, spec.id) : null;
  const slots = spec.slots ? cleanSlots(state, spec.slots) : (l && !spec.fromEquipped ? l.slots : cleanSlots(state, state.equipped));
  const name = String(spec.name || (l && l.name) || 'Loadout ' + (state.loadouts.length + 1)).slice(0, 24);
  if (!l) {
    if (state.loadouts.length >= 12) return { ok: false, reason: 'You can keep up to 12 loadouts.' };
    l = { id: nextId(state, 'L'), name, slots, goal: spec.goal || null, createdAt: ctx.now() };
    state.loadouts.push(l);
  } else { l.name = name; l.slots = slots; if (spec.goal !== undefined) l.goal = spec.goal || null; }
  return { ok: true, reason: '', loadout: l };
};
E.deleteLoadout = function (state, id) {
  const l = E.loadout(state, id); if (!l) return { ok: false, reason: 'That loadout is gone.' };
  if (state.raid.lock && state.raid.lock.loadoutId === id) return { ok: false, reason: 'It is locked in for this week\'s raid.' };
  state.loadouts = state.loadouts.filter((x) => x !== l);
  if (state.raid.plan && state.raid.plan.loadoutId === id) state.raid.plan.loadoutId = null;
  return { ok: true, reason: '' };
};
E.equipLoadout = function (state, id) {
  const l = E.loadout(state, id); if (!l) return { ok: false, reason: 'That loadout is gone.', missing: [], equipped: 0 };
  const missing = []; let n = 0; const max0 = E.playerStats(state).maxHp;
  SLOTS.forEach((s) => {
    const u = l.slots[s];
    if (!u) return;
    if (findGear(state, u)) { state.equipped[s] = u; n++; } else missing.push(s);
  });
  const w = item((findGear(state, state.equipped.weapon) || {}).itemId); if (w && w.hands === 2) state.equipped.offhand = null;
  gearHp(state, max0);
  return { ok: true, reason: missing.length ? `Missing: ${missing.join(', ')}.` : '', missing, equipped: n };
};
E.compareLoadout = function (state, a, b) {
  const sa = slotsOf(state, a), sb = slotsOf(state, b);
  const boss = E.currentBoss(state); const pa = powersOf(statsFor(state, sa), boss), pb = powersOf(statsFor(state, sb), boss);
  const power = {}; ['guardian', 'mender', 'striker'].forEach((r) => { power[r] = { from: pb[r], to: pa[r], delta: pa[r] - pb[r] }; });
  return { power };
};
