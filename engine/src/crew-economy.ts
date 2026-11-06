// Crew economy: ranks, vault, treasury, requisitions, feed.
// Ported from legacy/engine.js lines 2230-2570. Behaviour must stay identical to the
// legacy build (see test/parity.test.ts); design changes come in phase 1.
/* eslint-disable */
import { ctx } from './context';
import { E, SLOTS, D, arr, num, cfg, grades, item, allActions, bosses, rand, clamp, randInt, pick, lcFirst, itemName, isStackable, nextId } from './core';
import { addItem } from './inventory';
import { findGear, clampHp } from './gear';
import { SCHEMA, FEED_CAP, mulberry, clone, rankDefs, rankDef, invCount, invAdd, invTake, BEST, WORST } from './v4-helpers';
import { mondayOf, addDays, dayKey, nowOf, ensureClock, schedule } from './clock';
import { ensureRecord, curRecord } from './server';
import { cleanSlots } from './loadouts';
import { normRules, lockedNow, raidDoneThisWeek } from './raid-rules';
import { shuffleWith } from './raid-sim';
import { gapItem, gapDraft } from './raid-payouts';

// ================================================================ v4: crew economy
export function feedPush(state, kind, who, text) {
  const cr = state.crew; if (!cr) return null;
  if (!Array.isArray(cr.feed)) cr.feed = [];
  const e = { t: ctx.now(), kind, who: who || 'You', text };
  cr.feed.unshift(e); if (cr.feed.length > FEED_CAP) cr.feed.length = FEED_CAP;
  return e;
}
export function econ(state, key, v) {
  const ec = state.economy || (state.economy = { raidGold: 0, reqPaid: 0, weeks: [] });
  ec[key] = num(ec[key], 0) + v;
  let w = ec.weeks.find((x) => x.week === state.week); if (!w) { w = { week: state.week, raidGold: 0, reqPaid: 0 }; ec.weeks.unshift(w); ec.weeks = ec.weeks.slice(0, 12); }
  w[key] = num(w[key], 0) + v;
}
E.economy = (state) => clone(state.economy || { raidGold: 0, reqPaid: 0, weeks: [] });
E.crewRanks = () => rankDefs().slice();
E.playerRank = (state) => (state.crew && state.crew.viewAsMember ? 'member' : (state.crew && state.crew.playerRank) || 'officer');
export const PERM_TEXT = { viewVault: 'view the vault', deposit: 'deposit', withdraw: 'withdraw from the vault', postRequisitions: 'post requisitions', setSchedule: 'set the raid schedule', marketList: 'list on the market for the crew', manageRoles: 'manage roles' };
E.can = function (state, perm) {
  const rk = rankDef(E.playerRank(state));
  const ok = !!(rk.perms && rk.perms[perm]);
  return { ok, reason: ok ? '' : `${rk.name}s can't ${PERM_TEXT[perm] || perm}. Ask an officer.` };
};
E.setViewAsMember = function (state, on) { if (state.crew) state.crew.viewAsMember = !!on; return { ok: true, reason: '' }; };
E.crewMembers = function (state) {
  const cr = state.crew || {};
  const you: any = { id: 'you', name: 'You', rank: E.playerRank(state), rankName: rankDef(E.playerRank(state)).name, skill: null, isYou: true };
  // stable order (you first, then the saved roster order) and a stable sprite seed per member, whatever the view
  you.seed = seedOf('you'); you.index = 0;
  return [you].concat(arr(cr.members).map((m, i) => ({ id: m.id, name: m.name, rank: m.rank, rankName: rankDef(m.rank).name, skill: m.skill, isYou: false, seed: num(m.seed, seedOf(m.id + ':' + m.name)), index: i + 1 })));
};
export function seedOf(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
E.setMemberRank = function (state, memberId, rank) {
  const c = E.can(state, 'manageRoles'); if (!c.ok) return c;
  const m = arr(state.crew.members).find((x) => x.id === memberId); if (!m) return { ok: false, reason: 'That crewmate is gone.' };
  if (!rankDefs().some((r) => r.id === rank)) return { ok: false, reason: 'Unknown rank.' };
  const mine = E.playerRank(state);
  if (mine !== 'leader' && (['leader', 'officer'].includes(m.rank) || ['leader', 'officer'].includes(rank))) return { ok: false, reason: 'Only the leader can change officers.' };
  if (m.rank === rank) return { ok: true, reason: '' };
  const before = m.rank; m.rank = rank;
  feedPush(state, 'role', 'You', `${m.name}: ${rankDef(before).name} → ${rankDef(rank).name}.`);
  return { ok: true, reason: '' };
};
export function findVaultGear(state, uid) { return arr(state.crew && state.crew.vault && state.crew.vault.gear).find((g) => g.uid === uid) || null; }
E.vault = function (state) {
  const v = (state.crew && state.crew.vault) || { inv: {}, gear: [] }; const can = E.can(state, 'viewVault').ok;
  return { canView: can, items: Object.keys(v.inv).filter((id) => invCount(v.inv, id) > 0 && item(id)).map((id) => ({ itemId: id, grades: v.inv[id].slice(), total: invCount(v.inv, id) }))
    .sort((a, b) => num(item(a.itemId).tier, 0) - num(item(b.itemId).tier, 0) || itemName(a.itemId).localeCompare(itemName(b.itemId))), gear: v.gear.map((g) => Object.assign({}, g)) };
};
E.vaultDeposit = function (state, a, grade, qty) {
  if (a && typeof a === 'object') { if (a.kind === 'gear' || a.uid) return E.vaultDepositGear(state, a.uid); return E.vaultDeposit(state, a.itemId, a.grade, a.qty); }
  const c = E.can(state, 'deposit'); if (!c.ok) return c;
  const it = item(a); if (!it || !isStackable(it)) return { ok: false, reason: 'Unknown item.' };
  qty = Math.floor(num(qty, 1)); if (qty < 1) return { ok: false, reason: 'Deposit at least 1.' };
  const order = grade == null ? WORST : [clamp(Math.floor(grade), 0, 4)];
  const have = order.reduce((s, g) => s + num((state.inv[a] || [])[g], 0), 0);
  if (have < qty) return { ok: false, reason: `You only have ${have} ${lcFirst(it.name)}${grade == null ? '' : ' of that grade'}.` };
  invTake(state.inv, a, qty, order, 0).forEach((t) => invAdd(state.crew.vault.inv, a, t.grade, t.qty));
  feedPush(state, 'vault', 'You', `Deposited ${qty} ${it.name}.`);
  return { ok: true, reason: '' };
};
E.vaultDepositGear = function (state, uid) {
  const c = E.can(state, 'deposit'); if (!c.ok) return Object.assign(c, { loadoutsAffected: [] });
  const g = findGear(state, uid); if (!g) return { ok: false, reason: 'That item is no longer in your bag.', loadoutsAffected: [] };
  SLOTS.forEach((s) => { if (state.equipped[s] === uid) state.equipped[s] = null; });
  state.gear = state.gear.filter((x) => x !== g); state.crew.vault.gear.push(g); clampHp(state);
  const affected = arr(state.loadouts).filter((l) => SLOTS.some((s) => l.slots[s] === uid)).map((l) => l.id);
  feedPush(state, 'vault', 'You', `Deposited ${E.gearName(g)}.`);
  return { ok: true, reason: '', loadoutsAffected: affected };
};
E.depositToVault = E.vaultDeposit; E.sendToVault = E.vaultDeposit;
export function withdrawUsed(state) { const day = dayKey(nowOf(state)); const w = state.crew.withdrawn; return w && w.day === day ? num(w.units, 0) : 0; }
E.withdrawCapLeft = function (state) { if (!E.can(state, 'withdraw').ok) return 0; const capN = num(rankDef(E.playerRank(state)).withdrawCap, 0); return capN === Infinity ? Infinity : Math.max(0, capN - withdrawUsed(state)); };
export function noteWithdraw(state, n) { const day = dayKey(nowOf(state)); state.crew.withdrawn = { day, units: withdrawUsed(state) + n }; }
E.vaultWithdraw = function (state, itemId, grade, qty) {
  if (itemId && typeof itemId === 'object') { if (itemId.uid) return E.vaultWithdrawGear(state, itemId.uid); return E.vaultWithdraw(state, itemId.itemId, itemId.grade, itemId.qty); }
  const c = E.can(state, 'withdraw'); if (!c.ok) return c;
  qty = Math.floor(num(qty, 1)); if (qty < 1) return { ok: false, reason: 'Withdraw at least 1.' };
  const left = E.withdrawCapLeft(state); if (qty > left) return { ok: false, reason: `Daily withdrawal cap: ${left} left today.` };
  const v = state.crew.vault.inv; const order = grade == null ? BEST : [clamp(Math.floor(grade), 0, 4)];
  const have = order.reduce((s, g) => s + num((v[itemId] || [])[g], 0), 0);
  if (have < qty) return { ok: false, reason: `The vault has ${have} ${lcFirst(itemName(itemId))}.` };
  invTake(v, itemId, qty, order, 0).forEach((t) => addItem(state, itemId, t.grade, t.qty));
  noteWithdraw(state, qty);
  feedPush(state, 'vault', 'You', `Withdrew ${qty} ${itemName(itemId)}.`);
  return { ok: true, reason: '' };
};
E.vaultWithdrawGear = function (state, uid) {
  const c = E.can(state, 'withdraw'); if (!c.ok) return c;
  if (E.withdrawCapLeft(state) < 1) return { ok: false, reason: 'Daily withdrawal cap reached.' };
  const g = findVaultGear(state, uid); if (!g) return { ok: false, reason: 'That item is not in the vault.' };
  state.crew.vault.gear = state.crew.vault.gear.filter((x) => x !== g); state.gear.push(g); noteWithdraw(state, 1);
  feedPush(state, 'vault', 'You', `Withdrew ${E.gearName(g)}.`);
  return { ok: true, reason: '' };
};
E.requestWithdrawal = function (state, spec, note) {
  spec = spec || {}; const cr = state.crew;
  if (spec.uid) { if (!findVaultGear(state, spec.uid)) return { ok: false, reason: 'That item is not in the vault.' }; }
  else { if (!item(spec.itemId)) return { ok: false, reason: 'Unknown item.' }; if (!(num(spec.qty, 0) >= 1)) return { ok: false, reason: 'Ask for at least 1.' }; }
  const req = { id: nextId(state, 'W'), who: 'You', isYou: true, itemId: spec.uid ? null : spec.itemId, grade: spec.grade == null ? null : clamp(Math.floor(spec.grade), 0, 4), qty: spec.uid ? 1 : Math.floor(spec.qty), uid: spec.uid || null,
    note: String(note || '').slice(0, 80), t: ctx.now(), status: 'pending', answeredBy: null, answerIn: randInt(45, 100) };
  cr.withdrawRequests.unshift(req); cr.withdrawRequests = cr.withdrawRequests.slice(0, 20);
  feedPush(state, 'request', 'You', `Asked an officer for ${spec.uid ? E.gearName(findVaultGear(state, spec.uid)) : req.qty + ' ' + itemName(req.itemId)}.`);
  return { ok: true, reason: '', request: Object.assign({}, req) };
};
export function moveFromVault(state, req, toPlayer) {
  const v = state.crew.vault;
  if (req.uid) { const g = findVaultGear(state, req.uid); if (!g) return false; if (toPlayer) { v.gear = v.gear.filter((x) => x !== g); state.gear.push(g); } else v.gear = v.gear.filter((x) => x !== g); return true; }
  const order = req.grade == null ? BEST : [req.grade];
  const have = order.reduce((s, g) => s + num((v.inv[req.itemId] || [])[g], 0), 0); if (have < req.qty) return false;
  invTake(v.inv, req.itemId, req.qty, order, 0).forEach((t) => { if (toPlayer) addItem(state, req.itemId, t.grade, t.qty); });
  return true;
}
E.resolveWithdrawal = function (state, id, approve) {
  const c = E.can(state, 'withdraw'); if (!c.ok) return c;
  const r = arr(state.crew.withdrawRequests).find((x) => x.id === id && x.status === 'pending' && !x.isYou); if (!r) return { ok: false, reason: 'That request is already answered.' };
  if (approve && !moveFromVault(state, r, false)) return { ok: false, reason: 'The vault no longer has that.' };
  r.status = approve ? 'approved' : 'denied'; r.answeredBy = 'You';
  feedPush(state, 'request', 'You', `${approve ? 'Approved' : 'Denied'} ${r.who}'s request for ${r.uid ? 'gear' : r.qty + ' ' + itemName(r.itemId)}.`);
  return { ok: true, reason: '' };
};
E.treasury = function (state) { const t = state.crew.treasury; return { gold: t.gold, escrow: t.escrow, total: t.gold + t.escrow, history: arr(state.crew.feed).filter((f) => f.kind === 'payout' || f.kind === 'requisition').slice(0, 20) }; };
export function postReq(state, d, who, source) {
  const cr = state.crew; const escrow = Math.max(0, Math.floor(d.qty * d.rewardPer));
  cr.treasury.gold -= escrow; cr.treasury.escrow += escrow;
  const req = { id: nextId(state, 'Q'), itemId: d.itemId, qty: d.qty, rewardPer: d.rewardPer, minGrade: d.minGrade, note: d.note || '', filled: 0, escrow, paid: 0,
    postedBy: who, postedAt: ctx.now(), week: state.week, source, status: 'open', submissions: [] };
  cr.requisitions.unshift(req); cr.requisitions = cr.requisitions.slice(0, 24);
  feedPush(state, 'requisition', who, `Posted a requisition: ${d.qty} ${itemName(d.itemId)}${d.rewardPer ? ` at ${d.rewardPer}g each (${escrow} escrowed)` : ''}.`);
  return req;
}
export function validDraft(state, d) {
  d = d || {}; const it = item(d.itemId);
  if (!it || !isStackable(it)) return { ok: false, reason: 'Pick an item.' };
  const qty = Math.floor(num(d.qty, 0)); if (qty < 1 || qty > 500) return { ok: false, reason: 'Ask for 1 to 500.' };
  const rewardPer = Math.max(0, Math.floor(num(d.rewardPer, 0))); const minGrade = clamp(Math.floor(num(d.minGrade, 0)), 0, 4);
  return { ok: true, draft: { itemId: d.itemId, qty, rewardPer, minGrade, note: String(d.note || '').slice(0, 120) } };
}
E.postRequisition = function (state, draft, opts) {
  const c = E.can(state, 'postRequisitions'); if (!c.ok) return c;
  const v = validDraft(state, draft); if (!v.ok) return v;
  const d = v.draft; const cost = d.qty * d.rewardPer;
  if (cost > state.crew.treasury.gold) return { ok: false, reason: `That needs ${cost}g in escrow; the treasury has ${Math.floor(state.crew.treasury.gold)}g free. Lower the reward or post it reward-free.`, escrow: cost, freeGold: Math.floor(state.crew.treasury.gold) };
  const req = postReq(state, d, 'You', (opts && opts.source) || 'manual');
  return { ok: true, reason: '', req: Object.assign({}, req) };
};
E.cancelRequisition = function (state, id) {
  const c = E.can(state, 'postRequisitions'); if (!c.ok) return c;
  const r = arr(state.crew.requisitions).find((x) => x.id === id); if (!r || r.status !== 'open') return { ok: false, reason: 'That requisition is closed.' };
  const back = r.escrow; state.crew.treasury.escrow -= back; state.crew.treasury.gold += back; r.escrow = 0; r.status = 'cancelled';
  feedPush(state, 'requisition', 'You', `Cancelled the ${itemName(r.itemId)} requisition; ${back}g back to the treasury.`);
  return { ok: true, reason: '', refunded: back };
};
export function submitToReq(state, r, who, grades) { // grades: [{grade, qty}] already removed from the submitter
  const cr = state.crew; const qty = grades.reduce((a, g) => a + g.qty, 0);
  const pay = Math.min(r.escrow, qty * r.rewardPer);
  r.escrow -= pay; cr.treasury.escrow -= pay; r.paid += pay; r.filled += qty;
  grades.forEach((g) => invAdd(cr.vault.inv, r.itemId, g.grade, g.qty));
  r.submissions.push({ who, qty, grade: grades[0] ? grades[0].grade : 1, paid: pay, t: ctx.now() });
  if (pay > 0) econ(state, 'reqPaid', pay);
  feedPush(state, 'payout', who, `${who} filled ${qty} ${itemName(r.itemId)}${pay ? `, +${pay}g` : ''}`);
  if (r.filled >= r.qty) { r.status = 'filled'; if (r.escrow > 0) { cr.treasury.escrow -= r.escrow; cr.treasury.gold += r.escrow; r.escrow = 0; } feedPush(state, 'requisition', 'Crew', `The ${itemName(r.itemId)} requisition is filled.`); }
  return pay;
}
E.fillRequisition = function (state, id, qty) {
  const r = arr(state.crew.requisitions).find((x) => x.id === id); if (!r || r.status !== 'open') return { ok: false, reason: 'That requisition is closed.', accepted: 0, paid: 0 };
  const rem = r.qty - r.filled; qty = Math.min(Math.floor(num(qty, rem)), rem); if (qty < 1) return { ok: false, reason: 'Submit at least 1.', accepted: 0, paid: 0 };
  const have = [0, 1, 2, 3, 4].filter((g) => g >= r.minGrade).reduce((s, g) => s + num((state.inv[r.itemId] || [])[g], 0), 0);
  if (have < 1) return { ok: false, reason: `You have no ${lcFirst(itemName(r.itemId))} at ${(grades()[r.minGrade] || {}).name || 'that'} grade or better.`, accepted: 0, paid: 0 };
  const taken = invTake(state.inv, r.itemId, Math.min(qty, have), WORST, r.minGrade);
  const n = taken.reduce((a, t) => a + t.qty, 0); const pay = submitToReq(state, r, 'You', taken);
  state.gold += pay;
  E.log(state, 'info', `Filled ${n} ${itemName(r.itemId)} for the crew${pay ? ` and earned ${pay}g` : ''}.`);
  return { ok: true, reason: '', accepted: n, paid: pay, grade: taken[0] ? taken[0].grade : null };
};
E.requisitions = function (state) {
  const cr = state.crew || {}; const seen = new Set(arr(cr.seenReqIds));
  return arr(cr.requisitions).map((r) => {
    const rem = Math.max(0, r.qty - r.filled);
    const have = [0, 1, 2, 3, 4].filter((g) => g >= r.minGrade).reduce((s, g) => s + num((state.inv[r.itemId] || [])[g], 0), 0);
    const rec = allActions().find((a) => a && a.outputs && a.outputs[r.itemId] && (a.kind === 'craft' || a.kind === 'refine'));
    return Object.assign(clone(r), { remaining: rem, label: `Saturday raid needs ${r.qty} ${itemName(r.itemId)}, ${r.filled} pledged`,
      canFill: r.status !== 'open' ? { ok: false, reason: 'Closed.', have } : have > 0 ? { ok: true, reason: '', have } : { ok: false, reason: `You have none at ${(grades()[r.minGrade] || {}).name || ''} grade or better.`, have },
      links: { recipeActionId: rec ? rec.id : null, vaultHas: invCount(cr.vault && cr.vault.inv, r.itemId), marketListingIds: arr(state.market.listings).filter((l) => l.itemId === r.itemId && l.grade >= r.minGrade).map((l) => l.id) },
      isNew: !seen.has(r.id) });
  }).sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || b.postedAt - a.postedAt);
};
E.neededByCrew = (state) => E.requisitions(state).filter((r) => r.status === 'open' && r.remaining > 0).map((r) => ({ itemId: r.itemId, minGrade: r.minGrade, remaining: r.remaining, rewardPer: r.rewardPer, reqId: r.id }));
E.isNeededByCrew = (state, itemId, grade) => E.requisitions(state).find((r) => r.status === 'open' && r.itemId === itemId && (grade == null || grade >= r.minGrade)) || null;
E.markRequisitionsSeen = function (state) { state.crew.seenReqIds = arr(state.crew.requisitions).map((r) => r.id); return { ok: true, reason: '' }; };
// post: true posts the draft as is (fails with a reason if the treasury can't escrow it); opts.rewardFree posts with no reward;
// opts.rewardPer overrides the per-unit reward
E.requisitionFromGap = function (state, gapId, post, opts) {
  opts = opts || {};
  const recs = arr(state.raid.recaps); let gap = null;
  for (const r of recs) { gap = arr(r.debrief && r.debrief.gaps).find((g) => g.id === gapId); if (gap) break; }
  if (!gap) return { ok: false, reason: 'That gap is no longer in a debrief.' };
  const draft = gapDraft(state, Object.assign({ shortUnits: gap.suggestion ? gap.suggestion.qty : 20 }, gap));
  if (opts.rewardFree) draft.rewardPer = 0; else if (opts.rewardPer != null) draft.rewardPer = Math.max(0, Math.floor(num(opts.rewardPer, draft.rewardPer)));
  draft.escrow = draft.qty * draft.rewardPer; draft.affordable = draft.escrow <= draft.freeGold;
  if (!post) return { ok: true, reason: '', draft };
  const res = E.postRequisition(state, draft, { source: 'debrief' });
  return Object.assign(res, { draft });
};
E.crewFeed = (state, kind) => arr(state.crew && state.crew.feed).filter((f) => !kind || f.kind === kind).slice();
E.setRaidSchedule = function (state, spec) {
  const c = E.can(state, 'setSchedule'); if (!c.ok) return c;
  if (raidDoneThisWeek(state) || E.isRaidWindow(state) || lockedNow(state)) return { ok: false, reason: 'Change the schedule before anyone locks in.' };
  spec = spec || {}; const sd = Math.floor(num(spec.startDay, 6)); const sh = Math.floor(num(spec.startHour, 10));
  if (![5, 6].includes(sd) || sh < 6 || sh > 20) return { ok: false, reason: 'Start Friday or Saturday, 06:00 to 20:00.' };
  const st = new Date(addDays(mondayOf(nowOf(state)), (sd + 6) % 7)); st.setHours(sh, 0, 0, 0); const en = new Date(st.getTime() + 36 * 3600000);
  state.crew.schedule = { startDay: sd, startHour: sh, endDay: en.getDay(), endHour: en.getHours() };
  feedPush(state, 'raid', 'You', `Raid window set: ${sd === 5 ? 'Fri' : 'Sat'} ${String(sh).padStart(2, '0')}:00 for 36 hours.`);
  return { ok: true, reason: '' };
};
// crew simulation: crewmates fill requisitions, officers answer requests, members lock in during the week
export function crewEconomyStep(state, dt, events) {
  const cr = state.crew; if (!cr || !cr.treasury) return;
  cr.reqSimIn = num(cr.reqSimIn, 60) - dt;
  if (cr.reqSimIn <= 0) {
    cr.reqSimIn = randInt(40, 90);
    const open = cr.requisitions.filter((r) => r.status === 'open' && r.qty > r.filled && r.source !== 'npc-request');
    if (open.length && cr.members.length) {
      const r = pick(open); const m = pick(cr.members);
      const q = Math.min(r.qty - r.filled, randInt(1, Math.max(1, Math.ceil((r.qty - r.filled) / 4))));
      submitToReq(state, r, m.name, [{ grade: Math.max(r.minGrade, randInt(1, 3)), qty: q }]);
      events.push({ type: r.status === 'filled' ? 'reqFilled' : 'reqPaid', reqId: r.id });
    }
  }
  arr(cr.withdrawRequests).forEach((w) => {
    if (w.status !== 'pending' || !w.isYou) return;
    w.answerIn = num(w.answerIn, 60) - dt; if (w.answerIn > 0) return;
    const officer = (cr.members.find((m) => m.rank === 'leader') || cr.members[0] || { name: 'An officer' }).name;
    const ok = moveFromVault(state, w, true);
    w.status = ok ? 'approved' : 'denied'; w.answeredBy = officer;
    const e = feedPush(state, 'request', officer, `${ok ? 'Approved' : 'Denied'} your request for ${w.uid ? 'gear' : w.qty + ' ' + itemName(w.itemId)}${ok ? '' : ' (the vault was short)'}.`);
    events.push({ type: 'crewFeed', entry: e });
  });
  cr.npcReqIn = num(cr.npcReqIn, 300) - dt;
  if (cr.npcReqIn <= 0) {
    cr.npcReqIn = randInt(300, 600);
    const v = Object.keys(cr.vault.inv).filter((id) => invCount(cr.vault.inv, id) > 0);
    if (v.length && cr.members.length && cr.withdrawRequests.filter((w) => w.status === 'pending' && !w.isYou).length < 2) {
      const id = pick(v); const m = pick(cr.members.filter((x) => x.rank !== 'leader').concat(cr.members.slice(0, 1)));
      cr.withdrawRequests.unshift({ id: nextId(state, 'W'), who: m.name, isYou: false, itemId: id, grade: null, qty: Math.min(invCount(cr.vault.inv, id), randInt(1, 3)), uid: null, note: 'For the raid', t: ctx.now(), status: 'pending', answeredBy: null });
      cr.withdrawRequests = cr.withdrawRequests.slice(0, 20);
      events.push({ type: 'crewFeed', entry: feedPush(state, 'request', m.name, `Asked for ${itemName(id)} from the vault.`) });
    }
  }
}
export function crewWeekly(state, events) {
  const cr = state.crew; if (!cr) return;
  cr.members.forEach((m) => { m.pf = clamp(num(m.basePf, m.pf) * (0.92 + rand() * 0.16), 0.4, 2); m.food = randInt(3, 10); m.potions = randInt(1, 4); m.lockedWeek = 0; });
  const leader = cr.members.find((m) => m.rank === 'leader');
  if (leader && cr.requisitions.filter((r) => r.status === 'open').length < 3 && cr.treasury.gold >= 20) {
    const itemId = gapItem(state, pick(['healing', 'food', 'mitigation'])); const qty = randInt(12, 30);
    const rewardPer = Math.min(Math.max(1, Math.round(E.itemValue(itemId, 1) * 0.3)), Math.floor(cr.treasury.gold * 0.5 / qty));
    const r = postReq(state, { itemId, qty, rewardPer: Math.max(0, rewardPer), minGrade: 1, note: 'Weekly raid stock' }, leader.name, 'leader');
    events.push({ type: 'reqPosted', reqId: r.id });
  }
}
export function crewLocksStep(state) { // crewmates lock in as the week goes on
  const cr = state.crew; if (!cr) return;
  const clk = E.clock(state); const frac = clamp((clk.weekday + (new Date(clk.now).getHours() / 24)) / 5.4, 0, 1);
  cr.members.forEach((m, i) => { if (num(m.lockedWeek, 0) !== state.week && ((i * 0.6180339) % 1) < frac) m.lockedWeek = state.week; });
}
export const CREW_ROLES = ['guardian', 'mender', 'striker'];
export function ensureCrewV4(state) {
  const cr = state.crew; if (!cr) return;
  const used = new Set(arr(cr.members).map((m) => m.name));
  // deterministic fill: the same save always grows the same roster, even if it is migrated twice before saving
  const pool = shuffleWith((arr(D().npcNames).length ? D().npcNames : ['Wren', 'Ossian', 'Mira', 'Tobin', 'Kestrel', 'Ada']).filter((n) => !used.has(n)), mulberry(seedOf(Array.from(used).join('|'))));
  while (cr.members.length < 15 && pool.length) cr.members.push({ name: pool.shift(), skill: null });
  cr.members.forEach((m, i) => {
    if (!m.id) m.id = 'c' + (i + 1);
    if (!rankDefs().some((r) => r.id === m.rank)) m.rank = i === 0 ? 'leader' : i === 1 ? 'officer' : i >= cr.members.length - 3 ? 'recruit' : 'member';
    if (!CREW_ROLES.includes(m.role)) m.role = CREW_ROLES[i % 3];
    if (!isFinite(m.seed)) m.seed = seedOf(m.id + ':' + m.name);
    const mr = mulberry(num(m.seed, 1));
    if (!isFinite(m.basePf)) m.basePf = Math.round((0.65 + mr() * 0.7) * 100) / 100;
    if (!isFinite(m.pf)) m.pf = m.basePf;
    if (!isFinite(m.attend)) m.attend = Math.round((0.7 + mr() * 0.27) * 100) / 100;
    if (!isFinite(m.food)) m.food = 3 + Math.floor(mr() * 8);
    if (!isFinite(m.potions)) m.potions = 1 + Math.floor(mr() * 4);
    m.lockedWeek = num(m.lockedWeek, 0);
  });
  if (!rankDefs().some((r) => r.id === cr.playerRank)) cr.playerRank = 'officer';
  cr.viewAsMember = !!cr.viewAsMember;
  if (!cr.vault || typeof cr.vault !== 'object') cr.vault = {};
  if (!cr.vault.inv || typeof cr.vault.inv !== 'object') cr.vault.inv = {};
  Object.keys(cr.vault.inv).forEach((id) => { if (!item(id) || !Array.isArray(cr.vault.inv[id])) delete cr.vault.inv[id]; });
  cr.vault.gear = arr(cr.vault.gear).filter((g) => g && g.uid && item(g.itemId));
  if (!cr.treasury || typeof cr.treasury !== 'object') {
    cr.treasury = { gold: num(cfg().crewStartTreasury, 120), escrow: 0 };
    if (!Array.isArray(cr.feed)) cr.feed = [];
    feedPush(state, 'payout', 'Raid', `Last weekend's raid payout: ${cr.treasury.gold}g to the treasury.`);
  }
  cr.treasury.gold = Math.max(0, num(cr.treasury.gold, 0)); cr.treasury.escrow = Math.max(0, num(cr.treasury.escrow, 0));
  cr.requisitions = arr(cr.requisitions).filter((r) => r && r.id && item(r.itemId));
  cr.withdrawRequests = arr(cr.withdrawRequests).filter((r) => r && r.id);
  cr.feed = arr(cr.feed).filter((f) => f && f.text).slice(0, FEED_CAP);
  cr.seenReqIds = arr(cr.seenReqIds);
  if (!cr.withdrawn || typeof cr.withdrawn !== 'object') cr.withdrawn = { day: '', units: 0 };
  if (cr.schedule && typeof cr.schedule !== 'object') cr.schedule = null;
}
export function ensureV4(state) {
  ensureClock(state);
  const base = num(cfg().serverPop, 1200);
  if (!state.server || typeof state.server !== 'object') state.server = {};
  const sv = state.server; sv.name = sv.name || 'Emberfall';
  sv.pop = Math.round(num(sv.pop, base * (0.97 + rand() * 0.06)));
  if (!Array.isArray(sv.popHistory) || !sv.popHistory.length) sv.popHistory = [0, 1, 2, 3].map(() => Math.round(base * (0.96 + rand() * 0.08)));
  sv.weekBuff = sv.weekBuff || null; sv.pendingBuff = sv.pendingBuff || null;
  const r = state.raid || (state.raid = {});
  r.ladder = clamp(Math.floor(num(r.ladder, 0)), 0, Math.max(0, bosses().length - 1));
  r.season = Math.max(1, Math.floor(num(r.season, 1)));
  if (!r.bosses || typeof r.bosses !== 'object') r.bosses = {};
  r.rules = normRules(state, r.rules);
  if (!r.plan || typeof r.plan !== 'object') r.plan = { role: null, loadoutId: null };
  if (!r.pouch || typeof r.pouch !== 'object') r.pouch = {};
  Object.keys(r.pouch).forEach((id) => { if (!item(id) || !Array.isArray(r.pouch[id])) delete r.pouch[id]; });
  if (r.lock && (typeof r.lock !== 'object' || !r.lock.slots)) r.lock = null;
  r.resolvedWeek = Math.floor(num(r.resolvedWeek, num(state.week, 1) - 1));
  r.recaps = arr(r.recaps).filter((x) => x && x.id);
  r.corePity = Math.max(0, Math.floor(num(r.corePity, 0))); r.coresWon = Math.max(0, Math.floor(num(r.coresWon, 0)));
  if (!r.farm || typeof r.farm !== 'object') r.farm = { day: '', runs: 0 };
  if (!r.warned || typeof r.warned !== 'object') r.warned = { week: state.week, levels: [] };
  r.current = r.current || null;
  for (let i = 0; i < r.ladder; i++) { const rec = ensureRecord(state, i, state.week); if (rec.killedWeek == null) { rec.killedWeek = Math.max(0, state.week - 1); rec.hpLeft = 0; rec.revealedWeek = rec.revealedWeek == null ? 0 : rec.revealedWeek; } }
  const curDef = bosses()[r.ladder]; const fresh = !!curDef && !r.bosses[curDef.id];
  const cur = curRecord(state); if (cur && cur.revealedWeek == null && (fresh || cur.unlockedWeek < state.week)) cur.revealedWeek = state.week;
  if (!Array.isArray(state.loadouts)) state.loadouts = [];
  state.loadouts = state.loadouts.filter((l) => l && l.id).map((l) => ({ id: String(l.id), name: String(l.name || 'Loadout'), slots: cleanSlots(state, l.slots), goal: l.goal || null, boundTo: l.boundTo || null, createdAt: num(l.createdAt, ctx.now()) }));
  if (!state.economy || typeof state.economy !== 'object') state.economy = { raidGold: 0, reqPaid: 0, weeks: [] };
  state.economy.weeks = arr(state.economy.weeks);
  ensureCrewV4(state);
  state.v = SCHEMA;
}

export function cap1(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
