// Weekly flow (farm raids cut in phase 2.5).
// Ported from legacy/engine.js lines 2028-2229. Behaviour must stay identical to the
// legacy build (see test/parity.test.ts); design changes come in phase 1.
/* eslint-disable */
import { E, SLOTS, CHECKS, arr, num, cfg, item, bosses, rand, clamp, randInt, lcFirst, itemName, qtyRange, gradeOf } from './core';
import { addXp } from './skills';
import { findGear, autoEat } from './gear';
import { drainDurability } from './actions';
import { ROLE_CHECK, OFF_ROLE, ROLE_MIX, invCount } from './v4-helpers';
import { mondayOf, addDays, dayKey, nowOf, ensureClock, weekNum, weekStartOf, windowFor } from './clock';
import { curRecord, bossReq } from './server';
import { statsFor, powersOf } from './stats';
import { lockedNow, raidDoneThisWeek, lockWarnings, makeLock, prepLock } from './raid-rules';
import { grant, resolveRaid } from './raid-payouts';
import { crewWeekly } from './crew-economy';

// ================================================================ v4: weekly flow
export function weekRollover(state, events) {
  state.week = num(state.week, 1) + 1;
  const sv = state.server; const base = num(cfg().serverPop, 1200);
  sv.pop = Math.round(clamp(num(sv.pop, base) * (0.96 + rand() * 0.08), base * 0.8, base * 1.25));
  sv.popHistory = arr(sv.popHistory).concat([sv.pop]).slice(-4);
  sv.weekBuff = sv.pendingBuff && sv.pendingBuff.week === state.week ? sv.pendingBuff : null;
  if (sv.pendingBuff && sv.pendingBuff.week <= state.week) sv.pendingBuff = null;
  const rec = curRecord(state); const wasHidden = rec.revealedWeek == null; rec.revealedWeek = rec.revealedWeek == null ? state.week : rec.revealedWeek;
  state.raid.lock = null; state.raid.warned = { week: state.week, levels: [] };
  crewWeekly(state, events);
  E.refreshMarket(state);
  const boss = E.currentBoss(state);
  events.push({ type: 'weekStart', week: state.week, revealed: wasHidden ? boss.id : null });
  E.log(state, 'info', `Week ${state.week} begins. ${wasHidden ? `New boss revealed: ${boss.name}, weak to ${boss.weakTo}.` : `${boss.name} returns at ${Math.ceil(rec.hpLeft / rec.maxHp * 100)}% HP.`}${sv.weekBuff ? ' Server buff: ' + sv.weekBuff.label + '.' : ''}`);
}
export function processClock(state, events) {
  ensureClock(state);
  const now = nowOf(state);
  for (let guard = 0; guard < 40; guard++) {
    const wk = weekNum(state, now);
    if (!raidDoneThisWeek(state)) {
      const w = windowFor(state, weekStartOf(state, state.week));
      if (now >= w.start) { resolveRaid(state, { startedAt: w.start, absent: wk - state.week > 2 }, events); continue; }
    }
    if (state.week < wk) { weekRollover(state, events); continue; }
    break;
  }
  // readiness warnings 24h / 2h before start
  const w = windowFor(state, now); const secTo = (w.start - now) / 1000;
  if (!raidDoneThisWeek(state) && secTo > 0 && secTo <= 86400) {
    const level = secTo <= 7200 ? '2h' : '24h';
    if (!state.raid.warned || state.raid.warned.week !== state.week) state.raid.warned = { week: state.week, levels: [] };
    if (!state.raid.warned.levels.includes(level)) {
      state.raid.warned.levels.push(level);
      const rf = E.readinessFlags(state);
      events.push({ type: 'raidWarn', level, reasons: rf.reasons });
      if (rf.reasons.length) E.log(state, 'warn', `Raid in ${level === '2h' ? '2 hours' : 'a day'}: ${rf.reasons.join(' ')}`);
    }
  }
}
// Phase 2.5: the dev shortcuts startRaidNow / runRaid / canStartNow are gone. The weekend raid
// resolves only on the game clock (processClock, at the crew's raid-window start).
function prepFields(state) { const p = prepLock(state); return { prepPhase: p.phase, prepLocked: p.locked, prepReason: p.reason }; }
E.raidStatus = function (state) {
  const now = nowOf(state); const w = windowFor(state, now); const live = now >= w.start && now < w.end;
  const resolved = raidDoneThisWeek(state); const cur = state.raid.current && state.raid.current.week === state.week ? state.raid.current : null;
  const phase = live ? 'live' : resolved ? 'done' : lockedNow(state) ? 'locked' : 'prep';
  const chargeMs = num(cfg().raidChargeHours, 10) * 3600000;
  return { week: state.week, phase, locked: lockedNow(state), lock: state.raid.lock, windowStart: w.start, windowEnd: w.end,
    secToStart: Math.max(0, (w.start - now) / 1000), secLeft: live ? (w.end - now) / 1000 : 0, resolved, recapId: cur ? cur.recapId : null,
    fightPct: cur ? (cur.instant && !live ? 1 : clamp((now - cur.startedAt) / chargeMs, 0, 1)) : 0,
    // true when the player takes no part in this week's raid (a save created after it opened)
    sittingOut: num(state.raid.satOutWeek, 0) === state.week,
    // game-clock ms of the start of the next raid the player can take part in (this week's window
    // while it is still to be fought, else next week's)
    nextRaidAt: !resolved && now < w.end ? w.start : windowFor(state, addDays(mondayOf(now), 7)).start,
    // War Room prep lock (gear, loadouts, Hunt rules): 'prep' | 'live' | 'recap'; locked only while live
    ...prepFields(state) };
};
E.readinessFlags = function (state) {
  const now = nowOf(state); const w = windowFor(state, now); const secTo = (w.start - now) / 1000;
  const lock = lockedNow(state) ? state.raid.lock : null; const plan = E.raidPlan(state);
  const role = lock ? lock.role : plan.role; const slots = lock ? lock.slots : plan.slots;
  const rc = E.roleCheck(state, role, slots);
  const missingItems = SLOTS.filter((s) => slots[s] && !findGear(state, slots[s])).map((s) => s);
  const missingNames = lock && lock.loadoutId ? missingItems : (plan.loadoutId ? missingItems : []);
  const reasons = [];
  if (!rc.ok) reasons.push(rc.reason);
  if (missingItems.length) reasons.push('Your loadout uses items you no longer own (' + missingItems.join(', ') + ').');
  if (!lock && !raidDoneThisWeek(state)) reasons.push('Not locked in yet: you will be auto-locked at raid start.');
  const level = raidDoneThisWeek(state) || secTo <= 0 ? null : secTo <= 7200 ? '2h' : secTo <= 86400 ? '24h' : null;
  return { badge: !!level && (!rc.ok || missingItems.length > 0 || !lock), level, reasons, notLocked: !lock, failsRole: !rc.ok, missingItems: missingNames };
};
E.lockSummary = function (state) {
  const locked = lockedNow(state); const plan = E.raidPlan(state);
  const lock = locked ? state.raid.lock : Object.assign(makeLock(state, false), { role: plan.role, slots: plan.slots });
  const l = lock.loadoutId ? E.loadout(state, lock.loadoutId) : null;
  const pieces = SLOTS.map((s) => findGear(state, lock.slots[s])).filter(Boolean);
  const pcts = pieces.map((g) => g.dur / Math.max(1, g.maxDur));
  const w = windowFor(state, nowOf(state));
  return { locked, lock: locked ? lock : null, role: lock.role, roleCheck: E.roleCheck(state, lock.role, lock.slots),
    loadout: { id: l ? l.id : null, name: l ? l.name : 'Equipped gear', complete: !SLOTS.some((s) => lock.slots[s] && !findGear(state, lock.slots[s])), missing: SLOTS.filter((s) => lock.slots[s] && !findGear(state, lock.slots[s])) },
    durability: { minPct: pcts.length ? Math.min(...pcts) : 0, avgPct: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : 0, low: pieces.filter((g) => g.dur / Math.max(1, g.maxDur) < 0.25).map((g) => ({ uid: g.uid, name: E.gearName(g), pct: g.dur / Math.max(1, g.maxDur) })) },
    pouch: E.pouch(state), rules: Object.assign({}, lock.rules), tiers: E.tierThresholds(state), projected: E.projectRaid(state), warnings: lockWarnings(state, lock),
    canLock: !locked && !raidDoneThisWeek(state), canUnlock: locked && !raidDoneThisWeek(state) && !E.isRaidWindow(state), autoLockAt: w.start };
};
E.crewReadiness = function (state) {
  const boss = E.currentBoss(state); const fair = bossReq(boss);
  const members = arr(state.crew && state.crew.members);
  const attending = members.reduce((a, m) => a + num(m.attend, 0.85), 0) + 1;
  const plan = lockedNow(state) ? state.raid.lock : E.raidPlan(state);
  const pw = powersOf(statsFor(state, plan.slots), boss);
  const have = { damage: 0, healing: 0, mitigation: 0 };
  members.forEach((m) => CHECKS.forEach((ck) => { have[ck] += num(m.attend, 0.85) * num(m.pf, 1) * fair * (ROLE_CHECK[m.role] === ck ? 1 : OFF_ROLE); }));
  CHECKS.forEach((ck) => { const r = Object.keys(ROLE_CHECK).find((x) => ROLE_CHECK[x] === ck); have[ck] += plan.role === 'supply' ? 0 : pw[r] * (plan.role === r ? 1 : OFF_ROLE); });
  const vault = (state.crew && state.crew.vault && state.crew.vault.inv) || {};
  let food = members.reduce((a, m) => a + num(m.attend, 0.85) * num(m.food, 5), 0), pots = members.reduce((a, m) => a + num(m.attend, 0.85) * num(m.potions, 1), 0);
  Object.keys(vault).forEach((id) => { const it = item(id); if (it && it.kind === 'food') food += invCount(vault, id); if (it && it.kind === 'potion') pots += invCount(vault, id); });
  const pp = E.pouch(state); food += pp.food; pots += pp.potions;
  const need = attending * fair * ROLE_MIX;
  const rows = [
    { id: 'damage', label: 'Damage', have: have.damage, need }, { id: 'healing', label: 'Healing', have: have.healing, need },
    { id: 'mitigation', label: 'Defence', have: have.mitigation, need }, { id: 'food', label: 'Food', have: food, need: attending * 6 },
    { id: 'consumables', label: 'Consumables', have: pots, need: attending * 2 }
  ].map((r) => Object.assign(r, { have: Math.round(r.have), need: Math.round(r.need), pct: r.have / Math.max(1, r.need), ok: r.have >= r.need * 0.95 }));
  const short = rows.filter((r) => !r.ok).sort((a, b) => a.pct - b.pct).map((r) => r.id);
  const locked = members.filter((m) => num(m.lockedWeek, 0) === state.week).length + (lockedNow(state) ? 1 : 0);
  return { attending: Math.round(attending), roster: members.length + 1, lockedCount: locked, checks: rows, short,
    message: short.length ? 'We need more ' + lcFirst(rows.find((r) => r.id === short[0]).label === 'Defence' ? 'defence' : rows.find((r) => r.id === short[0]).label) : 'Crew is ready' };
};
E.badges = function (state) {
  const rf = E.readinessFlags(state); const last = E.lastRecap(state);
  const raidOn = rf.badge || !!(last && !last.seen && last.week === state.week);
  const inc = E.loadouts(state).filter((l) => !l.complete);

  const pend = arr(state.crew && state.crew.withdrawRequests).filter((r) => r.status === 'pending' && !r.isYou);
  const canAnswer = E.can(state, 'withdraw').ok;
  const fillable = E.listContracts(state).filter((k) => k.canFill.ok);
  const count = fillable.length + (canAnswer ? pend.length : 0);
  return { raid: { on: raidOn, reason: rf.badge ? rf.reasons[0] : raidOn ? 'Raid recap ready.' : '' },
    kit: { on: inc.length > 0, reason: inc.length ? `${inc[0].name} is incomplete.` : '' },
    crew: { on: count > 0, count, reason: fillable.length ? 'A contract you can fill.' : count ? 'A crewmate is asking for a withdrawal.' : '' } };
};

// compat preview (v3 raid screen)
E.raidPreview = function (state) {
  const boss = E.currentBoss(state);
  const pp = E.pouch(state); const fp = foodAndPotions(state);
  if (!boss) return { boss: null, bossHp: 0, bossHpPct: 0, playerPower: E.playerStats(state).power, expectedShare: 0, foodCount: fp.food, potionCount: fp.potion, weakMatch: false, advice: ['No raid boss is scheduled in this build.'] };
  const rec = curRecord(state); const proj = E.projectRaid(state); const plan = E.raidPlan(state);
  const ps = statsFor(state, plan.slots); const rc = E.roleCheck(state, plan.role, plan.slots);
  const advice = [];
  if (!rc.ok) advice.push(rc.reason);
  if (pp.units === 0) advice.push('Pack your raid pouch: the fight only uses food and potions in the pouch.');
  const weakMatch = num(ps.elements[boss.weakTo], 0) > 0;
  if (boss.weakTo && rec.revealedWeek != null) advice.push(weakMatch ? `Your ${boss.weakTo} damage exploits ${boss.name}'s weakness.` : `${boss.name} is weak to ${boss.weakTo}.`);
  return { boss, bossHp: rec.hpLeft, bossHpPct: rec.hpLeft / rec.maxHp, playerPower: ps.power, expectedShare: proj.weekShare, foodCount: pp.food + fp.food, potionCount: pp.potions + fp.potion, weakMatch, advice, tier: proj.tier };
};
export function foodAndPotions(state) {
  let food = 0, potion = 0;
  Object.keys(state.inv).forEach((id) => { const it = item(id); if (!it) return; if (it.kind === 'food') food += E.itemCount(state, id); if (it.kind === 'potion') potion += E.itemCount(state, id); });
  return { food, potion };
}
export function bossPhases(boss) {
  const p = arr(boss.phases).filter((x) => x).map((x) => ({ name: x.name || 'Onslaught', check: CHECKS.includes(x.check) ? x.check : 'damage' }));
  return p.length ? p : [{ name: 'Onslaught', check: 'damage' }];
}
