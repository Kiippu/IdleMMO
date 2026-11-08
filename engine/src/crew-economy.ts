// Crew economy: ranks, vault, treasury + audit log, contracts board (town + crew requests), feed.
// Ported from legacy/engine.js lines 2230-2570. Behaviour must stay identical to the
// legacy build (see test/parity.test.ts); design changes come in phase 1.
/* eslint-disable */
import { E, SLOTS, D, arr, num, cfg, grades, item, allActions, bosses, rand, clamp, randInt, pick, lcFirst, itemName, isStackable, nextId } from './core';
import { addItem } from './inventory';
import { findGear, clampHp } from './gear';
import { SCHEMA, FEED_CAP, TREASURY_LOG_CAP, mulberry, clone, rankDefs, rankDef, invCount, invAdd, invTake, BEST, WORST } from './v4-helpers';
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
  const e = { t: nowOf(state), kind, who: who || 'You', text };
  cr.feed.unshift(e); if (cr.feed.length > FEED_CAP) cr.feed.length = FEED_CAP;
  return e;
}
// Treasury audit log (phase 2.5: EVERY gold and vault movement lands here; all members see it).
// Entry: { t, week, kind, who, reason, delta, escrowDelta?, itemId?, qty?, grade?, uid?, gear? }
//   t           time (ms). Legacy entries written with `at` are normalised to `t` on load.
//   delta       change in TOTAL crew gold (free + escrowed). Free-gold change = delta - escrowDelta.
//   escrowDelta change in escrowed gold (omitted when 0).
//   itemId/qty  vault item movement; qty is signed (+ into the vault, - out). Gear rows carry uid + gear:true.
//   gold/paidBy contract rows: gold paid/escrowed and who funded it ('Treasury' or a player). A player-funded
//               crew request moves that player's gold, not the treasury's, so its delta is 0.
// kinds: payout, contract, contract-escrow, contract-release, release (retired requisitions), deposit,
//        withdraw, raid-stock. (fill/escrow may appear in pre-2.5-merge saves.) Entries with no gold and no item movement are dropped.
export function logTreasury(state, kind, delta, who, reason, extras?) {
  const cr = state.crew; if (!cr || !cr.treasury) return null;
  extras = extras || {};
  const esc = num(extras.escrowDelta, 0);
  if (!delta && !esc && !extras.itemId && !extras.gold) return null;
  if (!Array.isArray(cr.treasury.log)) cr.treasury.log = [];
  const e: any = { t: nowOf(state), week: num(state.week, 1), kind, who: who || 'You', delta: num(delta, 0), reason };
  if (esc) e.escrowDelta = esc;
  if (extras.gold) e.gold = extras.gold; // gold paid or escrowed by this movement (whoever paid it)
  if (extras.paidBy) e.paidBy = extras.paidBy; // 'Treasury' or the player who funded a crew request
  if (extras.itemId) { e.itemId = extras.itemId; if (extras.qty != null) e.qty = extras.qty; if (extras.grade != null) e.grade = extras.grade; if (extras.uid) { e.uid = extras.uid; e.gear = true; } }
  cr.treasury.log.unshift(e); if (cr.treasury.log.length > TREASURY_LOG_CAP) cr.treasury.log.length = TREASURY_LOG_CAP;
  return e;
}
export function normTreasuryLog(log) {
  return arr(log).filter((e) => e && typeof e === 'object').map((e) => {
    const o = Object.assign({}, e);
    if (!isFinite(o.t) && isFinite(o.at)) o.t = o.at;
    delete o.at;
    o.t = num(o.t, 0); o.delta = num(o.delta, 0);
    return o;
  }).slice(0, TREASURY_LOG_CAP);
}
export function econ(state, key, v) {
  const ec = state.economy || (state.economy = { raidGold: 0, reqPaid: 0, weeks: [] });
  ec[key] = num(ec[key], 0) + v;
  let w = ec.weeks.find((x) => x.week === state.week); if (!w) { w = { week: state.week, raidGold: 0, reqPaid: 0 }; ec.weeks.unshift(w); ec.weeks = ec.weeks.slice(0, 12); }
  w[key] = num(w[key], 0) + v;
}
E.economy = (state) => clone(state.economy || { raidGold: 0, reqPaid: 0, weeks: [] });
E.crewRanks = () => rankDefs().slice();
E.playerRank = (state) => (state.crew && state.crew.playerRank) || 'officer';
export const PERM_TEXT = { viewVault: 'view the vault', deposit: 'deposit', withdraw: 'withdraw from the vault', postRequisitions: 'post crew requests', setSchedule: 'set the raid schedule', marketList: 'list on the market for the crew', manageRoles: 'manage roles' };
E.can = function (state, perm) {
  const rk = rankDef(E.playerRank(state));
  const ok = !!(rk.perms && rk.perms[perm]);
  return { ok, reason: ok ? '' : `${rk.name}s can't ${PERM_TEXT[perm] || perm}. Ask an officer.` };
};
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
  invTake(state.inv, a, qty, order, 0).forEach((t) => { invAdd(state.crew.vault.inv, a, t.grade, t.qty); logTreasury(state, 'deposit', 0, 'You', `Deposited ${t.qty} ${it.name}`, { itemId: a, qty: t.qty, grade: t.grade }); });
  feedPush(state, 'vault', 'You', `Deposited ${qty} ${it.name}.`);
  return { ok: true, reason: '' };
};
E.vaultDepositGear = function (state, uid) {
  const c = E.can(state, 'deposit'); if (!c.ok) return Object.assign(c, { loadoutsAffected: [] });
  const g = findGear(state, uid); if (!g) return { ok: false, reason: 'That item is no longer in your bag.', loadoutsAffected: [] };
  SLOTS.forEach((s) => { if (state.equipped[s] === uid) state.equipped[s] = null; });
  state.gear = state.gear.filter((x) => x !== g); state.crew.vault.gear.push(g); clampHp(state);
  logTreasury(state, 'deposit', 0, 'You', `Deposited ${E.gearName(g)}`, { itemId: g.itemId, qty: 1, uid: g.uid });
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
  invTake(v, itemId, qty, order, 0).forEach((t) => { addItem(state, itemId, t.grade, t.qty); logTreasury(state, 'withdraw', 0, 'You', `Withdrew ${t.qty} ${itemName(itemId)}`, { itemId, qty: -t.qty, grade: t.grade }); });
  noteWithdraw(state, qty);
  feedPush(state, 'vault', 'You', `Withdrew ${qty} ${itemName(itemId)}.`);
  return { ok: true, reason: '' };
};
E.vaultWithdrawGear = function (state, uid) {
  const c = E.can(state, 'withdraw'); if (!c.ok) return c;
  if (E.withdrawCapLeft(state) < 1) return { ok: false, reason: 'Daily withdrawal cap reached.' };
  const g = findVaultGear(state, uid); if (!g) return { ok: false, reason: 'That item is not in the vault.' };
  state.crew.vault.gear = state.crew.vault.gear.filter((x) => x !== g); state.gear.push(g); noteWithdraw(state, 1);
  logTreasury(state, 'withdraw', 0, 'You', `Withdrew ${E.gearName(g)}`, { itemId: g.itemId, qty: -1, uid: g.uid });
  feedPush(state, 'vault', 'You', `Withdrew ${E.gearName(g)}.`);
  return { ok: true, reason: '' };
};
E.requestWithdrawal = function (state, spec, note) {
  spec = spec || {}; const cr = state.crew;
  if (spec.uid) { if (!findVaultGear(state, spec.uid)) return { ok: false, reason: 'That item is not in the vault.' }; }
  else { if (!item(spec.itemId)) return { ok: false, reason: 'Unknown item.' }; if (!(num(spec.qty, 0) >= 1)) return { ok: false, reason: 'Ask for at least 1.' }; }
  const req = { id: nextId(state, 'W'), who: 'You', isYou: true, itemId: spec.uid ? null : spec.itemId, grade: spec.grade == null ? null : clamp(Math.floor(spec.grade), 0, 4), qty: spec.uid ? 1 : Math.floor(spec.qty), uid: spec.uid || null,
    note: String(note || '').slice(0, 80), t: nowOf(state), status: 'pending', answeredBy: null, answerIn: randInt(45, 100) };
  cr.withdrawRequests.unshift(req); cr.withdrawRequests = cr.withdrawRequests.slice(0, 20);
  feedPush(state, 'request', 'You', `Asked an officer for ${spec.uid ? E.gearName(findVaultGear(state, spec.uid)) : req.qty + ' ' + itemName(req.itemId)}.`);
  return { ok: true, reason: '', request: Object.assign({}, req) };
};
export function moveFromVault(state, req, toPlayer) {
  const v = state.crew.vault; const to = toPlayer ? 'You' : (req.who || 'A crewmate');
  if (req.uid) {
    const g = findVaultGear(state, req.uid); if (!g) return false;
    v.gear = v.gear.filter((x) => x !== g); if (toPlayer) state.gear.push(g);
    logTreasury(state, 'withdraw', 0, to, `Withdrew ${E.gearName(g)} (approved request)`, { itemId: g.itemId, qty: -1, uid: g.uid });
    return true;
  }
  const order = req.grade == null ? BEST : [req.grade];
  const have = order.reduce((s, g) => s + num((v.inv[req.itemId] || [])[g], 0), 0); if (have < req.qty) return false;
  invTake(v.inv, req.itemId, req.qty, order, 0).forEach((t) => {
    if (toPlayer) addItem(state, req.itemId, t.grade, t.qty);
    logTreasury(state, 'withdraw', 0, to, `Withdrew ${t.qty} ${itemName(req.itemId)} (approved request)`, { itemId: req.itemId, qty: -t.qty, grade: t.grade });
  });
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
// Crew gold = free + escrowed (escrow is gold reserved for open contract / requisition rewards).
E.crewGold = function (state) {
  const t = (state.crew && state.crew.treasury) || { gold: 0, escrow: 0 };
  const free = Math.max(0, num(t.gold, 0)), escrowed = Math.max(0, num(t.escrow, 0));
  return { free, escrowed, total: free + escrowed };
};
E.treasury = function (state) {
  const t = state.crew.treasury; const g = E.crewGold(state);
  return { gold: t.gold, escrow: t.escrow, total: g.total, free: g.free, escrowed: g.escrowed, log: normTreasuryLog(t.log),
    history: arr(state.crew.feed).filter((f) => f.kind === 'payout' || f.kind === 'requisition').slice(0, 20) };
};
E.treasuryLog = (state) => normTreasuryLog(state.crew && state.crew.treasury && state.crew.treasury.log);
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
// crew simulation: crewmates fill contracts (Fri until the raid), officers answer requests, members lock in during the week
export function crewEconomyStep(state, dt, events) {
  const cr = state.crew; if (!cr || !cr.treasury) return;
  npcContractStep(state, dt, events);
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
      cr.withdrawRequests.unshift({ id: nextId(state, 'W'), who: m.name, isYou: false, itemId: id, grade: null, qty: Math.min(invCount(cr.vault.inv, id), randInt(1, 3)), uid: null, note: 'For the raid', t: nowOf(state), status: 'pending', answeredBy: null });
      cr.withdrawRequests = cr.withdrawRequests.slice(0, 20);
      events.push({ type: 'crewFeed', entry: feedPush(state, 'request', m.name, `Asked for ${itemName(id)} from the vault.`) });
    }
  }
}
export function crewWeekly(state, events) {
  const cr = state.crew; if (!cr) return;
  cr.members.forEach((m) => { m.pf = clamp(num(m.basePf, m.pf) * (0.92 + rand() * 0.16), 0.4, 2); m.food = randInt(3, 10); m.potions = randInt(1, 4); m.lockedWeek = 0; });
  // Phase 2.5: NPC leaders no longer auto-post requisitions. Town contracts for the coming raid
  // are generated from raid needs instead.
  closeContracts(state, 'A new week: unfilled contracts closed', 'town');
  postContracts(state, events);
}
export function crewLocksStep(state) { // crewmates lock in as the week goes on
  const cr = state.crew; if (!cr) return;
  const clk = E.clock(state); const frac = clamp((clk.weekday + (new Date(clk.now).getHours() / 24)) / 5.4, 0, 1);
  cr.members.forEach((m, i) => { if (num(m.lockedWeek, 0) !== state.week && ((i * 0.6180339) % 1) < frac) m.lockedWeek = state.week; });
}
export const CREW_ROLES = ['guardian', 'mender', 'striker'];
export function ensureCrewV5(state) {
  const cr = state.crew; if (!cr) return;
  const used = new Set(arr(cr.members).map((m) => m.name));
  // deterministic fill: the same save always grows the same roster, even if it is migrated twice before saving
  // Phase 1: backfill only up to the authored-roster size (4). Old saves with a bigger
  // procedural roster are kept as-is — nothing prunes existing members.
  const pool = shuffleWith((arr(D().npcNames).length ? D().npcNames : ['Wren', 'Ossian', 'Mira', 'Tobin', 'Kestrel', 'Ada']).filter((n) => !used.has(n)), mulberry(seedOf(Array.from(used).join('|'))));
  while (cr.members.length < 4 && pool.length) cr.members.push({ name: pool.shift(), skill: null });
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
  delete cr.viewAsMember; // phase 2.5 cut: "view as member" rank toggle
  if (!cr.vault || typeof cr.vault !== 'object') cr.vault = {};
  if (!cr.vault.inv || typeof cr.vault.inv !== 'object') cr.vault.inv = {};
  Object.keys(cr.vault.inv).forEach((id) => { if (!item(id) || !Array.isArray(cr.vault.inv[id])) delete cr.vault.inv[id]; });
  cr.vault.gear = arr(cr.vault.gear).filter((g) => g && g.uid && item(g.itemId));
  if (!cr.treasury || typeof cr.treasury !== 'object') {
    cr.treasury = { gold: num(cfg().crewStartTreasury, 120), escrow: 0, log: [] };
    if (!Array.isArray(cr.feed)) cr.feed = [];
    feedPush(state, 'payout', 'Raid', `Last weekend's raid payout: ${cr.treasury.gold}g to the treasury.`);
  }
  cr.treasury.gold = Math.max(0, num(cr.treasury.gold, 0)); cr.treasury.escrow = Math.max(0, num(cr.treasury.escrow, 0));
  cr.treasury.log = normTreasuryLog(cr.treasury.log);
  cr.contracts = arr(cr.contracts).filter((k) => k && k.id && item(k.itemId)).map((k) => {
    const o = Object.assign({ source: 'town', payer: 'treasury', postedBy: 'Town', filled: 0, escrow: 0, paid: 0, minGrade: 1, rewardPer: 0, status: 'open', submissions: [] }, k);
    delete o.repPer; delete o.repPaid; // reputation removed
    o.submissions = arr(o.submissions).map((x) => { const y = Object.assign({}, x); delete y.rep; return y; });
    return o;
  });
  migrateRequisitions(state);
  cr.contractSimIn = num(cr.contractSimIn, 1800);
  cr.withdrawRequests = arr(cr.withdrawRequests).filter((r) => r && r.id);
  cr.feed = arr(cr.feed).filter((f) => f && f.text).slice(0, FEED_CAP);
  if (!cr.withdrawn || typeof cr.withdrawn !== 'object') cr.withdrawn = { day: '', units: 0 };
  if (cr.schedule && typeof cr.schedule !== 'object') cr.schedule = null;
}
export function ensureV5(state) {
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
  delete r.farm; // phase 2.5 cut: farm raids
  if (!r.warned || typeof r.warned !== 'object') r.warned = { week: state.week, levels: [] };
  r.current = r.current || null;
  for (let i = 0; i < r.ladder; i++) { const rec = ensureRecord(state, i, state.week); if (rec.killedWeek == null) { rec.killedWeek = Math.max(0, state.week - 1); rec.hpLeft = 0; rec.revealedWeek = rec.revealedWeek == null ? 0 : rec.revealedWeek; } }
  const curDef = bosses()[r.ladder]; const fresh = !!curDef && !r.bosses[curDef.id];
  const cur = curRecord(state); if (cur && cur.revealedWeek == null && (fresh || cur.unlockedWeek < state.week)) cur.revealedWeek = state.week;
  if (!Array.isArray(state.loadouts)) state.loadouts = [];
  state.loadouts = state.loadouts.filter((l) => l && l.id).map((l) => ({ id: String(l.id), name: String(l.name || 'Loadout'), slots: cleanSlots(state, l.slots), goal: l.goal || null, boundTo: l.boundTo || null, createdAt: num(l.createdAt, nowOf(state)) }));
  if (!state.economy || typeof state.economy !== 'object') state.economy = { raidGold: 0, reqPaid: 0, weeks: [] };
  state.economy.weeks = arr(state.economy.weeks);
  ensureCrewV5(state);
  delete state.rep; // reputation removed (phase 2.5 owner decision); v6 saves that had it are stripped
  if (!state.spec || typeof state.spec !== 'object') state.spec = { skillId: null, lastSwitchAt: null };
  delete state.spec.capped; // the cap now follows from the rules (every non-spec profession skill), not a list
  // every week has contracts for its raid (only before that week's raid resolved)
  if (state.crew && !arr(state.crew.contracts).some((k) => k.week === state.week) && !raidDoneThisWeek(state)) postContracts(state, []);
  state.v = SCHEMA;
}

export function cap1(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

// ================================================================ phase 2.5: the contracts board
// One board, two sources:
//   town  what the coming raid needs (generated each Monday from raid needs), paid from the crew
//         treasury's escrow; closes when the raid resolves.
//   crew  a request posted by a player (E.postCrewRequest), paid from that player's own escrowed gold;
//         stays open until filled, out of escrow, or cancelled.
// Filling always pays gold (never nothing): a contract accepts only as many units as its escrow
// covers and closes when the escrow runs out. Items go to the crew vault only. Every movement is
// logged in the treasury log with who paid (paidBy).
// payer: 'treasury' (escrow counted in crew.treasury.escrow) | 'player' (escrow taken from state.gold).
export function contractNeeds(state) {
  const rd = E.crewReadiness(state); const row = (id) => rd.checks.find((c) => c.id === id) || { have: 0, need: 0, pct: 1 };
  const attending = Math.max(1, rd.attending);
  const needs = [];
  const food = row('food'); needs.push({ check: 'food', qty: clamp(Math.ceil(food.need - food.have), 10, 40), why: 'Food to keep the crew fighting' });
  const pots = row('consumables'); needs.push({ check: 'consumables', qty: clamp(Math.ceil(pots.need - pots.have), 10, 40), why: 'Healing potions for the raid' });
  // buff potions: the check last weekend's debrief flagged, else the crew's weakest check
  const last = E.lastRecap(state);
  const gaps = arr(last && last.debrief && last.debrief.gaps).filter((g) => ['damage', 'healing', 'mitigation'].includes(g.check));
  const checks = gaps.length ? gaps.map((g) => g.check) : [['damage', 'healing', 'mitigation'].map((id) => row(id)).sort((a, b) => a.pct - b.pct)[0].id];
  checks.forEach((ck) => needs.push({ check: ck, qty: clamp(attending, 5, 20), buff: true, why: `${ck === 'mitigation' ? 'Defence' : cap1(ck)} buffs for the raid` }));
  return needs.map((n) => Object.assign(n, { itemId: n.buff ? buffItemFor(state, n.check) : gapItem(state, n.check) })).filter((n) => item(n.itemId));
}
export function buffItemFor(state, check) {
  if (check === 'damage') return 'fury_draught';
  if (check === 'mitigation') return gapItem(state, 'mitigation');
  const ids = Object.keys(D().items || {}).filter((id) => { const it = item(id); return it && it.kind === 'potion' && it.buff && it.buff.stat === 'heal'; });
  return ids.length ? ids.sort((a, b) => num(item(a).tier, 1) - num(item(b).tier, 1))[0] : gapItem(state, 'healing');
}
export const contractRewardPer = (itemId) => Math.max(1, Math.round(E.itemValue(itemId, 1) * num(cfg().contractRewardMult, 1.1)));
const payerName = (k) => (k.payer === 'player' ? k.postedBy || 'You' : 'Treasury');
function addEscrow(state, k, amount) { // reserve gold for k from its payer
  if (!(amount > 0)) return;
  k.escrow += amount;
  if (k.payer === 'player') {
    state.gold = num(state.gold, 0) - amount;
    logTreasury(state, 'contract-escrow', 0, k.postedBy, `${k.postedBy} escrowed ${amount}g for a crew request: ${k.qty} ${itemName(k.itemId)}`, { gold: amount, paidBy: payerName(k) });
  } else {
    const cr = state.crew; cr.treasury.gold -= amount; cr.treasury.escrow += amount;
    logTreasury(state, 'contract-escrow', 0, k.source === 'town' ? 'Town' : k.postedBy, `Escrowed ${amount}g for the ${itemName(k.itemId)} contract`, { escrowDelta: amount, gold: amount, paidBy: 'Treasury' });
  }
}
export function postContracts(state, events) {
  const cr = state.crew; if (!cr || !cr.treasury) return [];
  if (!Array.isArray(cr.contracts)) cr.contracts = [];
  const merged = [];
  contractNeeds(state).forEach((n) => { const m = merged.find((x) => x.itemId === n.itemId); if (m) m.qty = Math.min(60, m.qty + n.qty); else merged.push(Object.assign({}, n)); });
  let budget = Math.floor(Math.max(0, num(cr.treasury.gold, 0)) * clamp(num(cfg().contractBudgetShare, 0.75), 0, 1));
  const out = [];
  merged.forEach((n) => {
    const rewardPer = contractRewardPer(n.itemId);
    const units = Math.min(n.qty, Math.floor(budget / rewardPer)); // only post what the treasury can pay for
    if (units < 1) return;
    budget -= units * rewardPer;
    const k = { id: nextId(state, 'K'), source: 'town', payer: 'treasury', postedBy: 'Town', week: state.week, check: n.check, itemId: n.itemId, qty: units, filled: 0, minGrade: 1, rewardPer,
      escrow: 0, paid: 0, status: 'open', postedAt: nowOf(state), note: `${n.why}: ${units} ${itemName(n.itemId)}`, submissions: [] };
    addEscrow(state, k, units * rewardPer);
    cr.contracts.unshift(k); out.push(k);
    if (events) events.push({ type: 'contractPosted', contractId: k.id });
  });
  trimContracts(state);
  if (out.length) feedPush(state, 'contract', 'Town', `New town contracts for this weekend's raid: ${out.map((k) => k.qty + ' ' + itemName(k.itemId)).join(', ')}.`);
  return out;
}
function trimContracts(state) { // keep every open contract, and the newest closed ones for history
  const cr = state.crew; const open = cr.contracts.filter((k) => k.status === 'open'); const done = cr.contracts.filter((k) => k.status !== 'open');
  cr.contracts = open.concat(done.slice(0, Math.max(0, 30 - open.length)));
}
export function releaseContractEscrow(state, k, why) {
  const back = Math.max(0, num(k.escrow, 0)); if (!back) return 0;
  k.escrow = 0;
  if (k.payer === 'player') {
    if (k.postedBy === 'You') state.gold = num(state.gold, 0) + back;
    logTreasury(state, 'contract-release', 0, k.postedBy, `${why}: ${back}g escrow back to ${k.postedBy === 'You' ? 'you' : k.postedBy} from the ${itemName(k.itemId)} request`, { gold: back, paidBy: payerName(k) });
  } else {
    const cr = state.crew; cr.treasury.escrow = Math.max(0, cr.treasury.escrow - back); cr.treasury.gold += back;
    logTreasury(state, 'contract-release', 0, 'Town', `${why}: ${back}g escrow back from the ${itemName(k.itemId)} contract`, { escrowDelta: -back, gold: back, paidBy: 'Treasury' });
  }
  return back;
}
export function closeContracts(state, why, source?) {
  arr(state.crew && state.crew.contracts).forEach((k) => { if (k.status === 'open' && (!source || k.source === source)) { k.status = 'closed'; releaseContractEscrow(state, k, why); } });
}
/** units a contract can still take: what is left of qty AND what its escrow can pay for */
export function contractCapacity(k) {
  if (k.status !== 'open' || !(k.rewardPer > 0)) return 0;
  return Math.max(0, Math.min(k.qty - k.filled, Math.floor(num(k.escrow, 0) / k.rewardPer)));
}
// grades: [{grade, qty}] already removed from the filler, at most contractCapacity(k). Returns gold paid.
export function submitToContract(state, k, who, grades) {
  const cr = state.crew; const n = grades.reduce((a, g) => a + g.qty, 0);
  const gold = n * k.rewardPer;
  k.escrow -= gold; if (k.payer !== 'player') cr.treasury.escrow = Math.max(0, cr.treasury.escrow - gold);
  k.paid += gold; k.filled += n;
  grades.forEach((g) => invAdd(cr.vault.inv, k.itemId, g.grade, g.qty));
  k.submissions.push({ who, qty: n, gold, t: nowOf(state) }); if (k.submissions.length > 40) k.submissions = k.submissions.slice(-40);
  if (gold > 0 && k.payer !== 'player') econ(state, 'reqPaid', gold);
  const treas = k.payer !== 'player';
  logTreasury(state, 'contract', treas ? -gold : 0, who, `${who} filled ${n} ${itemName(k.itemId)} (${k.source === 'crew' ? `${k.postedBy}'s request` : 'town contract'} ${k.id}), paid ${gold}g by ${payerName(k)}`,
    Object.assign({ itemId: k.itemId, qty: n, grade: grades[0] ? grades[0].grade : null, gold, paidBy: payerName(k) }, treas ? { escrowDelta: -gold } : {}));
  feedPush(state, 'contract', who, `${who} filled ${n} ${itemName(k.itemId)} for the crew, +${gold}g.`);
  if (k.filled >= k.qty) { k.status = 'filled'; releaseContractEscrow(state, k, 'Contract filled'); feedPush(state, 'contract', 'Crew', `The ${itemName(k.itemId)} ${k.source === 'crew' ? 'request' : 'contract'} is filled.`); }
  else if (contractCapacity(k) < 1) { k.status = 'closed'; releaseContractEscrow(state, k, 'Escrow ran out'); feedPush(state, 'contract', 'Crew', `The ${itemName(k.itemId)} ${k.source === 'crew' ? 'request' : 'contract'} ran out of gold and closed.`); }
  return gold;
}
const haveAtGrade = (state, itemId, minGrade) => [0, 1, 2, 3, 4].filter((g) => g >= minGrade).reduce((s, g) => s + num((state.inv[itemId] || [])[g], 0), 0);
const isMine = (k) => k.source === 'crew' && k.postedBy === 'You';
function contractOpenNow(state, k) {
  if (k.status !== 'open') return false;
  if (k.source === 'town' && (k.week !== state.week || raidDoneThisWeek(state))) return false;
  return true;
}
E.fillContract = function (state, contractId, qty) {
  const k = arr(state.crew && state.crew.contracts).find((x) => x.id === contractId);
  const fail = (reason) => ({ ok: false, reason, accepted: 0, gold: 0 });
  if (!k || k.status !== 'open') return fail('That contract is closed.');
  if (!contractOpenNow(state, k)) return fail('That contract has expired.');
  if (isMine(k)) return fail('You posted this request; a crewmate has to fill it.');
  const cap = contractCapacity(k);
  if (cap < 1) { k.status = 'closed'; releaseContractEscrow(state, k, 'Escrow ran out'); return fail('That contract has run out of gold.'); }
  qty = Math.min(Math.floor(num(qty, cap)), cap); if (!(qty >= 1)) return fail('Submit at least 1.');
  const have = haveAtGrade(state, k.itemId, k.minGrade);
  if (have < 1) return fail(`You have no ${lcFirst(itemName(k.itemId))} at ${(grades()[k.minGrade] || {}).name || 'that'} grade or better.`);
  const taken = invTake(state.inv, k.itemId, Math.min(qty, have), WORST, k.minGrade); // partial fill: hand in what you have
  const n = taken.reduce((a, t) => a + t.qty, 0);
  const gold = submitToContract(state, k, 'You', taken);
  state.gold = num(state.gold, 0) + gold;
  E.log(state, 'info', `Filled ${n} ${itemName(k.itemId)} for the crew's stock and earned ${gold}g.`);
  return { ok: true, reason: '', accepted: n, gold, partial: n < qty, status: k.status };
};
// A player posts a request on the crew board, paying from their own gold (escrowed now, refunded on cancel).
E.postCrewRequest = function (state, spec) {
  spec = spec || {}; const it = item(spec.itemId);
  if (!it || !isStackable(it)) return { ok: false, reason: 'Pick an item.' };
  const qty = Math.floor(num(spec.qty, 0)); if (qty < 1 || qty > 500) return { ok: false, reason: 'Ask for 1 to 500.' };
  const rewardPer = Math.floor(num(spec.rewardPer, 0)); if (rewardPer < 1) return { ok: false, reason: 'Pay at least 1g per item.' };
  const minGrade = clamp(Math.floor(num(spec.minGrade, 1)), 0, 4);
  const escrow = qty * rewardPer;
  if (escrow > num(state.gold, 0)) return { ok: false, reason: `That needs ${escrow}g in escrow; you have ${Math.floor(num(state.gold, 0))}g.`, escrow };
  const k = { id: nextId(state, 'K'), source: 'crew', payer: 'player', postedBy: 'You', week: state.week, check: null, itemId: spec.itemId, qty, filled: 0, minGrade, rewardPer,
    escrow: 0, paid: 0, status: 'open', postedAt: nowOf(state), note: String(spec.note || '').slice(0, 120) || `Wanted: ${qty} ${it.name}`, submissions: [] };
  addEscrow(state, k, escrow);
  state.crew.contracts.unshift(k); trimContracts(state);
  feedPush(state, 'contract', 'You', `Posted a crew request: ${qty} ${it.name} at ${rewardPer}g each (${escrow}g escrowed).`);
  return { ok: true, reason: '', contract: clone(k), escrow };
};
E.cancelCrewRequest = function (state, contractId) {
  const k = arr(state.crew && state.crew.contracts).find((x) => x.id === contractId);
  if (!k || !isMine(k)) return { ok: false, reason: 'You can only cancel your own requests.', refunded: 0 };
  if (k.status !== 'open') return { ok: false, reason: 'That request is already closed.', refunded: 0 };
  k.status = 'cancelled';
  const refunded = releaseContractEscrow(state, k, 'Request cancelled');
  feedPush(state, 'contract', 'You', `Cancelled the ${itemName(k.itemId)} request${refunded ? `; ${refunded}g refunded` : ''}.`);
  return { ok: true, reason: '', refunded };
};
E.listContracts = function (state) {
  const cr = state.crew || {};
  return arr(cr.contracts).map((k) => {
    const open = contractOpenNow(state, k); const remaining = Math.max(0, k.qty - k.filled);
    const capacity = open ? contractCapacity(k) : 0; const have = haveAtGrade(state, k.itemId, k.minGrade);
    const rec = allActions().find((a) => a && a.outputs && a.outputs[k.itemId] && (a.kind === 'craft' || a.kind === 'refine'));
    const canFill = !open ? { ok: false, reason: k.status === 'filled' ? 'Filled.' : k.status === 'cancelled' ? 'Cancelled.' : 'Closed.' }
      : isMine(k) ? { ok: false, reason: 'Your request.' }
      : capacity < 1 ? { ok: false, reason: 'Out of gold.' }
      : have > 0 ? { ok: true, reason: '' } : { ok: false, reason: `You have no ${lcFirst(itemName(k.itemId))} at ${(grades()[k.minGrade] || {}).name || ''} grade or better.` };
    return Object.assign(clone(k), { remaining, capacity, have, paidBy: payerName(k), mine: isMine(k), canCancel: isMine(k) && k.status === 'open', canFill,
      itemName: itemName(k.itemId), vaultHas: invCount(cr.vault && cr.vault.inv, k.itemId), recipeActionId: rec ? rec.id : null });
  }).sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || (a.source === b.source ? 0 : a.source === 'town' ? -1 : 1) || b.postedAt - a.postedAt);
};
// NPC crewmates fill board contracts (town and crew) only from Friday (game clock) until the raid
// window opens, and only up to cfg.contractNpcShare of each one, so there is always work left for
// the player during the week.
export function npcFillWindow(state) {
  if (raidDoneThisWeek(state)) return false;
  const clk = E.clock(state); return clk.weekday >= 4 && clk.now < clk.raidStart;
}
export function npcContractStep(state, dt, events) {
  const cr = state.crew; if (!cr || !cr.members.length) return;
  if (!npcFillWindow(state)) return;
  cr.contractSimIn = num(cr.contractSimIn, 1800) - dt; if (cr.contractSimIn > 0) return;
  cr.contractSimIn = randInt(1800, 3600);
  const share = clamp(num(cfg().contractNpcShare, 0.5), 0, 1);
  const open = arr(cr.contracts).filter((k) => contractOpenNow(state, k) && contractCapacity(k) > 0 && npcFilled(k) < Math.floor(k.qty * share));
  if (!open.length) return;
  const k = pick(open); const m = pick(cr.members);
  const room = Math.min(Math.floor(k.qty * share) - npcFilled(k), contractCapacity(k));
  const q = Math.min(room, randInt(1, Math.max(1, Math.ceil(k.qty / 6))));
  if (q < 1) return;
  submitToContract(state, k, m.name, [{ grade: Math.max(k.minGrade, randInt(1, 3)), qty: q }]);
  events.push({ type: 'contractFill', contractId: k.id, who: m.name });
}
const npcFilled = (k) => arr(k.submissions).filter((x) => x.who !== 'You').reduce((a, x) => a + num(x.qty, 0), 0);
// Pre-merge saves: crew.requisitions → the contracts board. NPC-posted (leader / npc-request) ones are
// retired with escrow released to the treasury. Open player-posted ones with a reward become crew
// contracts that keep their treasury escrow (payer 'treasury'), capped to what the escrow can pay;
// reward-free ones are closed (contracts never pay nothing). Closed requisitions are dropped (the
// treasury log keeps their history). Then the requisition fields are deleted.
export function migrateRequisitions(state) {
  const cr = state.crew; if (!cr || !('requisitions' in cr)) { if (cr) { delete cr.seenReqIds; delete cr.reqSimIn; } return; }
  const t = cr.treasury;
  const releaseT = (r, why) => {
    const back = Math.max(0, num(r.escrow, 0)); if (!back) return;
    t.escrow = Math.max(0, t.escrow - back); t.gold += back;
    logTreasury(state, 'release', 0, 'Crew', `${why}: ${back}g escrow released (${itemName(r.itemId)})`, { escrowDelta: -back, gold: back, paidBy: 'Treasury' });
  };
  arr(cr.requisitions).filter((r) => r && r.id && item(r.itemId) && r.status === 'open').forEach((r) => {
    if (r.source === 'leader' || r.source === 'npc-request') { releaseT(r, 'Retired NPC requisition'); return; }
    const rewardPer = Math.floor(num(r.rewardPer, 0)); const remaining = Math.max(0, num(r.qty, 0) - num(r.filled, 0));
    const units = rewardPer > 0 ? Math.min(remaining, Math.floor(num(r.escrow, 0) / rewardPer)) : 0;
    if (units < 1) { releaseT(r, 'Requisition moved to the contracts board without a reward; closed'); return; }
    const keep = units * rewardPer; const extra = num(r.escrow, 0) - keep;
    if (extra > 0) releaseT({ escrow: extra, itemId: r.itemId }, 'Requisition escrow above its remaining reward');
    cr.contracts = arr(cr.contracts);
    cr.contracts.unshift({ id: String(r.id), source: 'crew', payer: 'treasury', postedBy: r.postedBy === 'You' ? 'You' : String(r.postedBy || 'Crew'), week: num(r.week, state.week), check: null,
      itemId: r.itemId, qty: num(r.filled, 0) + units, filled: num(r.filled, 0), minGrade: clamp(Math.floor(num(r.minGrade, 0)), 0, 4), rewardPer, escrow: keep, paid: num(r.paid, 0),
      status: 'open', postedAt: num(r.postedAt, nowOf(state)), note: String(r.note || ''), submissions: arr(r.submissions).map((x) => ({ who: x.who, qty: x.qty, gold: num(x.paid, 0), t: num(x.t, 0) })) });
  });
  delete cr.requisitions; delete cr.seenReqIds; delete cr.reqSimIn;
}
