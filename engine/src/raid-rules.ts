// Raid rules, plan, pouch and lock-in.
// Ported from legacy/engine.js lines 1467-1595. Behaviour must stay identical to the
// legacy build (see test/parity.test.ts); design changes come in phase 1.
/* eslint-disable */
import { E, SLOTS, STANCES, TACTICS, num, cfg, grades, item, clamp, lcFirst, gradeMult } from './core';
import { addItem, ownedOfKind } from './inventory';
import { findGear } from './gear';
import { RAID_ROLE_IDS, TIER_NAME, clone, roleDef, sumInv, invCount, invAdd, invTake, BEST, WORST } from './v4-helpers';
import { nowOf } from './clock';
import { avgPop, curRecord, bossReq } from './server';
import { statsFor, powersOf } from './stats';
import { cleanSlots } from './loadouts';

// ================================================================ v4: raid rules, plan, pouch, lock
export function normRules(state, r) {
  const out = Object.assign({ eatAt: 0.5, stance: 'balanced', tactic: 'focus' }, r || {});
  out.eatAt = Math.round(clamp(num(Number(out.eatAt), 0.5), 0.3, 0.8) * 100) / 100;
  if (!STANCES.includes(out.stance)) out.stance = 'balanced';
  if (!TACTICS.includes(out.tactic)) out.tactic = 'focus';
  return { eatAt: out.eatAt, stance: out.stance, tactic: out.tactic };
}
export function lockedNow(state) { return !!(state.raid.lock && state.raid.lock.week === state.week); }
export function raidDoneThisWeek(state) { return num(state.raid.resolvedWeek, 0) >= state.week; }
export function prepBlocked(state) {
  if (raidDoneThisWeek(state)) return 'This week\'s raid has been fought.';
  if (lockedNow(state)) return 'You are locked in. Unlock to change your plan.';
  return '';
}
E.setRaidRules = function (state, rules) {
  const b = prepBlocked(state); if (b && lockedNow(state)) return { ok: false, reason: b, rules: Object.assign({}, state.raid.rules) };
  state.raid.rules = normRules(state, Object.assign({}, state.raid.rules, rules || {}));
  return { ok: true, reason: '', rules: Object.assign({}, state.raid.rules) };
};
export function bestRole(state, slots) {
  const p = powersOf(statsFor(state, slots), E.currentBoss(state)); const need = bossReq(E.currentBoss(state));
  const r = ['striker', 'guardian', 'mender'].sort((a, b) => p[b] - p[a])[0];
  return p[r] >= need * 0.5 ? r : 'supply';
}
E.setRaidPlan = function (state, spec) {
  const b = prepBlocked(state); if (b) return { ok: false, reason: b, plan: Object.assign({}, state.raid.plan) };
  spec = spec || {}; const plan = state.raid.plan || (state.raid.plan = { role: null, loadoutId: null });
  if (spec.role !== undefined) { if (!RAID_ROLE_IDS.includes(spec.role)) return { ok: false, reason: 'Unknown role.', plan: Object.assign({}, plan) }; plan.role = spec.role; }
  if (spec.loadoutId !== undefined) { if (spec.loadoutId && !E.loadout(state, spec.loadoutId)) return { ok: false, reason: 'That loadout is gone.', plan: Object.assign({}, plan) }; plan.loadoutId = spec.loadoutId || null; }
  return { ok: true, reason: '', plan: Object.assign({}, plan) };
};
E.raidPlan = function (state) {
  const plan = state.raid.plan || {}; const l = plan.loadoutId ? E.loadout(state, plan.loadoutId) : null;
  const slots = cleanSlots(state, l ? l.slots : state.equipped);
  return { role: RAID_ROLE_IDS.includes(plan.role) ? plan.role : bestRole(state, slots), roleChosen: !!plan.role, loadoutId: l ? l.id : null, slots };
};
export function healOfAny(id, gr) { const it = item(id); return it ? Math.max(0, Math.round(num(it.heal, 0) * gradeMult(Math.max(0, gr)))) : 0; }
export function pouchHealTotal(state) { const p = state.raid.pouch || {}; let h = 0; Object.keys(p).forEach((id) => p[id].forEach((q, g) => { h += q * healOfAny(id, g); })); return h; }
E.pouch = function (state) {
  const p = state.raid.pouch || {}; let food = 0, potions = 0;
  const items = Object.keys(p).filter((id) => invCount(p, id) > 0).map((id) => {
    const it = item(id) || {}; const total = invCount(p, id);
    if (it.kind === 'food') food += total; else potions += total;
    return { itemId: id, grades: p[id].slice(), total, heal: healOfAny(id, 1), kind: it.kind, buff: it.buff || null };
  });
  return { items, food, potions, units: food + potions, cap: num(cfg().pouchCap, 60), totalHeal: pouchHealTotal(state), locked: lockedNow(state) || raidDoneThisWeek(state) };
};
E.packPouch = function (state, itemId, qty, grade) {
  if (lockedNow(state)) return { ok: false, reason: 'The pouch is sealed once you lock in.', moved: 0 };
  const it = item(itemId); if (!it || (it.kind !== 'food' && it.kind !== 'potion')) return { ok: false, reason: 'Only food and potions go in the raid pouch.', moved: 0 };
  qty = Math.floor(num(qty, 0)); if (qty < 1) return { ok: false, reason: 'Pack at least 1.', moved: 0 };
  const room = num(cfg().pouchCap, 60) - sumInv(state.raid.pouch);
  if (room <= 0) return { ok: false, reason: `The pouch holds ${num(cfg().pouchCap, 60)} items.`, moved: 0 };
  qty = Math.min(qty, room);
  const order = grade != null ? [clamp(Math.floor(grade), 0, 4)] : BEST;
  const taken = invTake(state.inv, itemId, qty, order, 0);
  const moved = taken.reduce((a, t) => a + t.qty, 0);
  if (!moved) return { ok: false, reason: `You have no ${lcFirst(it.name)}${grade != null ? ' of that grade' : ''}.`, moved: 0 };
  taken.forEach((t) => invAdd(state.raid.pouch, itemId, t.grade, t.qty));
  return { ok: true, reason: '', moved };
};
E.unpackPouch = function (state, itemId, qty) {
  if (lockedNow(state)) return { ok: false, reason: 'The pouch is sealed once you lock in.', moved: 0 };
  qty = Math.floor(num(qty, invCount(state.raid.pouch, itemId)));
  const taken = invTake(state.raid.pouch, itemId, qty, WORST, 0);
  taken.forEach((t) => addItem(state, itemId, t.grade, t.qty));
  return { ok: true, reason: '', moved: taken.reduce((a, t) => a + t.qty, 0) };
};
E.autoPackPouch = function (state) {
  if (lockedNow(state)) return { ok: false, reason: 'The pouch is sealed once you lock in.', moved: 0 };
  let moved = 0;
  ['atk', 'def', 'heal'].forEach((stat) => { // one buff potion per stat
    if (Object.keys(state.raid.pouch).some((id) => item(id) && item(id).buff && item(id).buff.stat === stat)) return;
    const best = ownedOfKind(state, 'potion').filter((id) => item(id).buff && item(id).buff.stat === stat).sort((a, b) => item(b).buff.pct - item(a).buff.pct)[0];
    if (best) moved += E.packPouch(state, best, 1).moved;
  });
  const healers = Object.keys(state.inv).filter((id) => item(id) && (item(id).kind === 'food' || item(id).kind === 'potion') && num(item(id).heal, 0) > 0)
    .sort((a, b) => num(item(b).heal, 0) - num(item(a).heal, 0));
  for (const id of healers) { const room = num(cfg().pouchCap, 60) - sumInv(state.raid.pouch); if (room <= 0 || sumInv(state.raid.pouch) >= 30) break; moved += E.packPouch(state, id, Math.min(room, 30 - sumInv(state.raid.pouch))).moved; }
  return { ok: true, reason: moved ? '' : 'Nothing to pack.', moved };
};
export function lockWarnings(state, lock) {
  const w = []; const rc = E.roleCheck(state, lock.role, lock.slots);
  if (!rc.ok) w.push(rc.reason);
  if (rc.missing.length) w.push('Uses items you no longer own: ' + rc.missing.join(', ') + '.');
  const pw = E.pouch(state);
  if (lock.role !== 'supply' && pw.food + pw.potions === 0) w.push('Your pouch is empty: you will faint as soon as your HP runs out.');
  else if (lock.role === 'supply' && pw.units === 0) w.push('Supply line carries your pouch. Pack food or potions to contribute.');
  const low = SLOTS.map((s) => findGear(state, lock.slots[s])).filter((g) => g && g.dur / Math.max(1, g.maxDur) < 0.25);
  if (low.length) w.push('Low durability: ' + low.map((g) => E.gearName(g)).join(', ') + '.');
  if (!findGear(state, lock.slots.weapon) && lock.role !== 'supply') w.push('No weapon in this loadout.');
  return w;
}
export function makeLock(state, auto) {
  const plan = E.raidPlan(state);
  return { week: state.week, lockedAt: nowOf(state), auto: !!auto, role: plan.role, loadoutId: plan.loadoutId, slots: plan.slots,
    rules: normRules(state, state.raid.rules), pouch: clone(state.raid.pouch || {}) };
}
E.lockIn = function (state) {
  if (raidDoneThisWeek(state)) return { ok: false, reason: 'This week\'s raid has been fought.', warnings: [] };
  if (lockedNow(state)) return { ok: true, reason: '', lock: state.raid.lock, warnings: lockWarnings(state, state.raid.lock) };
  const lock = makeLock(state, false); state.raid.lock = lock;
  E.log(state, 'raid', `Locked in as ${roleDef(lock.role).name} for week ${state.week}.`);
  return { ok: true, reason: '', lock, warnings: lockWarnings(state, lock) };
};
E.unlock = function (state) {
  if (raidDoneThisWeek(state) || E.isRaidWindow(state)) return { ok: false, reason: 'No changes once the raid has started.' };
  state.raid.lock = null; return { ok: true, reason: '' };
};
export function autoLock(state, events) {
  if (lockedNow(state)) return;
  if (sumInv(state.raid.pouch) === 0) E.autoPackPouch(state);
  state.raid.lock = makeLock(state, true);
  events.push({ type: 'raidLocked', auto: true });
  E.log(state, 'raid', `Auto-locked as ${roleDef(state.raid.lock.role).name} at raid start.`);
}
E.tierThresholds = function (state) {
  const rec = curRecord(state); const pop = Math.max(1, num(rec && rec.pop, avgPop(state)));
  const fair = 1 / pop; const ts = cfg().tierShares || { bronze: 0.5, silver: 1, gold: 2 }; const tk = cfg().tierTickets || { floor: 1, bronze: 2, silver: 4, gold: 8 };
  const drops = { bronze: '+1 boss material', silver: '+2 boss materials, a buff potion', gold: '+3 boss materials, a catalyst' };
  const pctText = (x) => { const p = x * 100; return (p < 0.1 ? p.toFixed(3) : p.toFixed(2)) + '%'; };
  return { fairShare: fair, pop, basis: 'Your share of the phase checks you helped fill this weekend',
    floor: { tickets: num(tk.floor, 1), drops: 'Boss materials + 1 core ticket' },
    list: ['bronze', 'silver', 'gold'].map((t) => ({ tier: t, share: num(ts[t], 1) * fair, label: TIER_NAME[t], pctText: pctText(num(ts[t], 1) * fair), tickets: num(tk[t], 0), drops: drops[t] })) };
};
export function tierFor(state, share) { const th = E.tierThresholds(state).list; let t = 'none'; th.forEach((x) => { if (share >= x.share - 1e-12) t = x.tier; }); return t; }
