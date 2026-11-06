// Loadouts.
// Ported from legacy/engine.js lines 1374-1466. Behaviour must stay identical to the
// legacy build (see test/parity.test.ts); design changes come in phase 1.
/* eslint-disable */
import { ctx } from './context';
import { E, SLOTS, arr, num, item, lcFirst, nextId } from './core';
import { findGear, clampHp } from './gear';
import { tagDefs } from './v4-helpers';
import { statsFor, powersOf, slotsOf, TAG_PHRASE, tagUnit, tagIds, slotsTags, tagScore } from './stats';
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
      tags: slotsTags(state, l.slots), roleChecks: rc, isRaid: plan.loadoutId === l.id, locked: !!(lock && lock.loadoutId === l.id) });
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
    l = { id: nextId(state, 'L'), name, slots, goal: spec.goal || null, boundTo: null, createdAt: ctx.now() };
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
  const missing = []; let n = 0;
  SLOTS.forEach((s) => {
    const u = l.slots[s];
    if (!u) return;
    if (findGear(state, u)) { state.equipped[s] = u; n++; } else missing.push(s);
  });
  clampHp(state);
  return { ok: true, reason: missing.length ? `Missing: ${missing.join(', ')}.` : '', missing, equipped: n };
};
E.autoBuild = function (state, tag, opts) {
  opts = opts || {}; const boss = E.currentBoss(state);
  const slots = emptySlots(); let score = 0;
  SLOTS.forEach((s) => {
    const cands = arr(state.gear).filter((g) => item(g.itemId) && item(g.itemId).slot === s && num(g.dur, 0) > 0);
    if (!cands.length) return;
    const general = (g) => { const st = E.gearStats(g); return st.atk + st.def + st.heal + st.hp / 10; };
    cands.sort((a, b) => (tagScore(b, tag, boss) - tagScore(a, tag, boss)) || (general(b) - general(a)));
    const best = cands[0];
    if (tagScore(best, tag, boss) > 0) { slots[s] = best.uid; score += tagScore(best, tag, boss); }
    else { const eq = findGear(state, state.equipped[s]); slots[s] = eq ? eq.uid : best.uid; }
  });
  const before = SLOTS.reduce((a, s) => { const g = findGear(state, state.equipped[s]); return a + (g ? tagScore(g, tag, boss) : 0); }, 0);
  const res: any = { ok: true, reason: '', slots, score: Math.round(score * 1000) / 1000, gain: Math.round((score - before) * 1000) / 1000 };
  if (opts.save) { const sv = E.saveLoadout(state, { id: opts.id, name: opts.name || ('Best ' + lcFirst(TAG_PHRASE[tag] || tag)), slots, goal: tag }); res.loadout = sv.loadout; res.ok = sv.ok; res.reason = sv.reason; }
  return res;
};
E.bindLoadout = function (state, id, skillId) {
  const l = E.loadout(state, id); if (!l) return { ok: false, reason: 'That loadout is gone.' };
  if (skillId) arr(state.loadouts).forEach((x) => { if (x !== l && x.boundTo === skillId) x.boundTo = null; });
  l.boundTo = skillId || null;
  return { ok: true, reason: '' };
};
E.boundLoadout = (state, skillId) => arr(state.loadouts).find((l) => l.boundTo === skillId) || null;
export function deltasBetween(state, slotsA, slotsB, vsName) {
  const a = slotsTags(state, slotsA), b = slotsTags(state, slotsB); const out = [];
  tagIds().forEach((t) => {
    const d = Math.round((num(a[t], 0) - num(b[t], 0)) * 1000) / 1000; if (!d) return;
    const unit = tagUnit(t);
    const v = unit === 'pct' ? Math.round(d * 1000) / 10 + '%' : String(Math.round(d));
    out.push({ tag: t, label: (tagDefs().find((x) => x.id === t) || {}).name || t, from: b[t], to: a[t], delta: d, unit,
      text: (d > 0 ? '+' : '') + v + ' ' + TAG_PHRASE[t] + ' vs. ' + vsName });
  });
  return out;
}
E.compareLoadout = function (state, a, b) {
  const sa = slotsOf(state, a), sb = slotsOf(state, b);
  const vs = b == null || b === 'equipped' ? 'equipped' : (typeof b === 'object' ? 'current' : ((E.loadout(state, b) || {}).name || 'equipped'));
  const boss = E.currentBoss(state); const pa = powersOf(statsFor(state, sa), boss), pb = powersOf(statsFor(state, sb), boss);
  const power = {}; ['guardian', 'mender', 'striker'].forEach((r) => { power[r] = { from: pb[r], to: pa[r], delta: pa[r] - pb[r] }; });
  return { deltas: deltasBetween(state, sa, sb, vs), power };
};
E.compareGear = function (state, uid) {
  const g = findGear(state, uid) || findVaultGear(state, uid); if (!g) return { slot: null, vsUid: null, deltas: [] };
  const slot = (item(g.itemId) || {}).slot; const next = Object.assign({}, state.equipped); next[slot] = uid;
  if (!findGear(state, uid)) return { slot, vsUid: state.equipped[slot] || null, deltas: [] };
  return { slot, vsUid: state.equipped[slot] || null, deltas: deltasBetween(state, next, state.equipped, 'equipped') };
};
