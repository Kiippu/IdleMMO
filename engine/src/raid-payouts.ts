// Raid payouts and resolution.
// Ported from legacy/engine.js lines 1817-2027. Behaviour must stay identical to the
// legacy build (see test/parity.test.ts); design changes come in phase 1.
/* eslint-disable */
import { E, SLOTS, CHECKS, D, arr, num, cfg, itemsMap, item, bosses, rand, clamp, randInt, itemName, nextId, fmtGold } from './core';
import { addItem } from './inventory';
import { pushEvent } from './events';
import { findGear } from './gear';
import { CHECK_LABEL, TIER_NAME, ROLE_MIX, mulberry, clone, roleDef, invTake, WORST } from './v4-helpers';
import { nowOf, weekStartOf, windowFor } from './clock';
import { ensureRecord, curRecord } from './server';
import { autoLock, tierFor } from './raid-rules';
import { simulateFight, fightCtx } from './raid-sim';
import { feedPush, econ, logTreasury, closeContracts } from './crew-economy';

// ================================================================ v4: payouts + resolution
export function pickLootItem(state, b, kind) {
  const tier = clamp(1 + Math.floor(num(b.reqPower, 30) / 30), 1, 5);
  if (kind === 'buff') { const l = Object.keys(itemsMap()).filter((id) => item(id).kind === 'potion' && item(id).buff && num(item(id).tier, 1) <= tier + 1); return l.length ? l[Math.floor(rand() * l.length)] : null; }
  if (kind === 'catalyst') { const l = Object.keys(itemsMap()).filter((id) => item(id).kind === 'catalyst' && num(item(id).tier, 1) <= Math.max(2, tier)); return l.length ? l.sort((a, c) => item(c).tier - item(a).tier)[0] : null; }
  return null;
}
export function grant(state, list, itemId, grade, qty) { if (!item(itemId) || !(qty > 0)) return; addItem(state, itemId, grade, qty); list.push({ itemId, grade, qty }); }
export function mergeItems(lists) { const m = {}; lists.forEach((l) => l.forEach((x) => { const k = x.itemId + ':' + x.grade; m[k] = m[k] ? Object.assign({}, m[k], { qty: m[k].qty + x.qty }) : Object.assign({}, x); })); return Object.values(m); }
export function guildBoards(state, sim, rng) {
  const fair = sim.fair; const frames = sim.frames;
  const rows = arr(D().npcGuilds).filter((g) => g && g.name).map((g) => {
    const roster = 15 + Math.floor(rng() * 46); const att = Math.max(3, Math.round(roster * (0.55 + rng() * 0.4))); const pf = 0.7 + rng() * 0.6;
    const t = {}; CHECKS.forEach((ck) => { t[ck] = att * fair * ROLE_MIX * frames * pf * (g.aura === ck ? 1.35 : 0.85) * (0.85 + rng() * 0.3); });
    return { guild: g.name, members: att, roster, t, mine: false };
  });
  const mineT = {}; CHECKS.forEach((ck) => { mineT[ck] = sim.crewTot[ck] + sim.totals[ck]; });
  rows.push({ guild: (state.crew && state.crew.name) || 'Your crew', members: sim.attendCount, roster: arr(state.crew && state.crew.members).length + 1, t: mineT, mine: true });
  const board = (val, avg) => ({ totals: rows.map((r) => ({ guild: r.guild, value: Math.round(val(r)), members: r.members, avg: Math.round(avg(r) * 100) / 100, mine: r.mine })).sort((a, b) => b.value - a.value),
    averages: rows.map((r) => ({ guild: r.guild, value: Math.round(avg(r) * 100) / 100, members: r.members, avg: Math.round(avg(r) * 100) / 100, mine: r.mine })).sort((a, b) => b.value - a.value) });
  const out: any = {};
  CHECKS.forEach((ck) => { out[ck] = board((r) => r.t[ck], (r) => r.t[ck] / Math.max(1, r.members)); });
  out.attendance = board((r) => r.members, (r) => r.members / Math.max(1, r.roster));
  return out;
}
export function gapItem(state, check) {
  const idx = clamp(Math.floor(num(state.raid.ladder, 0)), 0, 5);
  const pickTier = (list) => list[Math.min(list.length - 1, idx)];
  if (check === 'food') return pickTier(['bread', 'herb_trout', 'bloodmoss_broth', 'salmon_pie', 'frostcap_salmon', 'angler_feast']);
  if (check === 'damage') return 'fury_draught';
  if (check === 'mitigation') return pickTier(['ironskin_draught', 'ironskin_draught', 'ironskin_draught', 'frostward_tonic', 'frostward_tonic', 'rimeheart_draught']);
  return pickTier(['mint_tonic', 'wisplight_salve', 'restoring_elixir', 'restoring_elixir', 'sunpetal_elixir', 'sunpetal_elixir']);
}
export function gapDraft(state, gap) {
  const itemId = gapItem(state, gap.check); const it = item(itemId) || { name: itemId };
  const qty = clamp(Math.ceil(num(gap.shortUnits, 20)), 10, 40);
  const rewardPer = Math.max(1, Math.round(E.itemValue(itemId, 1) * 0.4));
  const gold = Math.floor(num(state.crew && state.crew.treasury && state.crew.treasury.gold, 0));
  const escrow = qty * rewardPer;
  return { itemId, qty, rewardPer, minGrade: 1, note: `${gap.text}. Saturday raid needs ${qty} ${it.name}.`,
    escrow, freeGold: gold, affordable: escrow <= gold, maxRewardPer: Math.floor(gold / qty) };
}
export function buildDebrief(state, sim) {
  const gaps = []; const fine = [];
  CHECKS.forEach((ck) => {
    const ws = sim.waves.filter((w) => w.check === ck && w.result !== 'unfinished');
    const bad = ws.find((w) => w.crewHave < w.crewNeed * 0.9);
    if (bad) {
      const pct = bad.crewHave / Math.max(1, bad.crewNeed);
      const text = ck === 'healing' ? `Healing ran dry by wave ${bad.wave}` : ck === 'mitigation' ? `Mitigation cracked in wave ${bad.wave}` : `Damage fell short in wave ${bad.wave}`;
      gaps.push({ id: 'gap_' + ck, check: ck, label: CHECK_LABEL[ck], text, wave: bad.wave, have: Math.round(bad.crewHave), need: Math.round(bad.crewNeed), pct, shortUnits: 10 + (1 - pct) * 60 });
    } else fine.push(CHECK_LABEL[ck]);
  });
  // food: a gap only if it ran out with at least 15% of the fight still to go; pct = share of the fight the crew stayed fed
  const fedFrac = sim.foodOutFrame == null ? 1 : sim.foodOutFrame / Math.max(1, sim.frames);
  if (fedFrac < 0.85) gaps.push({ id: 'gap_food', check: 'food', label: 'Food', text: `Food ran out in wave ${sim.foodOutWave}`, wave: sim.foodOutWave, have: sim.crewFoodStart, need: sim.crewFoodStart + Math.ceil(sim.crewFoodShort), pct: fedFrac, shortUnits: Math.max(sim.attendCount * 2, sim.crewFoodShort) });
  else fine.push('Food');
  const potNeed = sim.attendCount * 2;
  if (sim.crewPotions < potNeed * 0.85) gaps.push({ id: 'gap_consumables', check: 'consumables', label: 'Consumables', text: `Potions ran short (${sim.crewPotions} of ${potNeed})`, wave: null, have: sim.crewPotions, need: potNeed, pct: sim.crewPotions / Math.max(1, potNeed), shortUnits: potNeed - sim.crewPotions });
  else fine.push('Consumables');
  gaps.forEach((g) => { g.suggestion = gapDraft(state, g); delete g.shortUnits; });
  const gapIds = new Set(gaps.map((g) => g.check));
  const checks = ['mitigation', 'healing', 'damage', 'food', 'consumables'].map((id) => {
    const g = gaps.find((x) => x.check === id);
    return { id, label: CHECK_LABEL[id], state: gapIds.has(id) ? 'gap' : 'held', pct: g ? g.pct : 1, gapId: g ? g.id : null };
  });
  return { gaps, fine: checks.filter((x) => x.state === 'held').map((x) => x.label), checks };
}
export function resolveRaid(state, opts, events) {
  opts = opts || {}; events = events || [];
  const boss = E.currentBoss(state); if (!boss) return null;
  const rec = curRecord(state); const c = cfg();
  const joined = opts.absent !== true;
  if (joined) autoLock(state, events);
  const lock = joined ? state.raid.lock : null;
  const sim = simulateFight(state, fightCtx(state, lock, rand, joined));
  const win = windowFor(state, weekStartOf(state, state.week)); const chargeMs = num(c.raidChargeHours, 10) * 3600000;
  const startedAt = clamp(num(opts.startedAt, nowOf(state)), win.start, Math.max(win.start, win.end - chargeMs)); // always inside the window
  const frameMs = chargeMs / Math.max(1, Math.round(num(c.raidChargeHours, 10) * 6));
  // apply consumption + wear
  if (joined) {
    state.raid.pouch = sim.pouch;
    const wear = lock.role === 'supply' ? 2 : 6 + num(c.reviveDurability, 2) * sim.faints;
    SLOTS.forEach((s) => { const g = findGear(state, lock.slots[s]); if (g && g.dur > 0) { g.dur = Math.max(0, Math.round((g.dur - wear) * 100) / 100); if (g.dur <= 0) E.log(state, 'warn', `Your ${E.gearName(g)} broke in the raid.`); } });
    const mx = E.playerStats(state).maxHp; state.hp = Math.max(1, Math.round(sim.endHp > 0 ? Math.min(mx, sim.endHp) : mx * 0.3));
  }
  const hpBefore = rec.hpLeft;
  rec.hpLeft = Math.max(0, Math.round(sim.hpAfter)); rec.weekends++;
  if (joined) { rec.joinedWeekends++; }
  rec.myPoints += joined ? sim.weekPoints : 0; rec.totalPoints += sim.weekTotal;
  const weekShare = joined ? sim.weekPoints / Math.max(1e-9, sim.weekTotal) : 0;
  const share = rec.myPoints / Math.max(1e-9, rec.totalPoints);
  const tierWeek = joined ? tierFor(state, weekShare) : 'none'; const cumTier = rec.joinedWeekends ? tierFor(state, share) : 'none';
  const tier = joined ? cumTier : 'none'; // one rule: tier (drops + core tickets) comes from the share carried over for this boss
  // payouts
  const tiersSnap = E.tierThresholds(state);
  const floorItems = [], tierItems = [], chests = [];
  if (joined) {
    grant(state, floorItems, boss.floorItem || 'coal', 1, randInt(2, 4));
    if (rand() < 0.5) grant(state, floorItems, boss.bossMat, 2, 1);
    const nMat = { none: 0, bronze: 1, silver: 2, gold: 3 }[tier];
    if (nMat) grant(state, tierItems, boss.bossMat, 2, nMat);
    if (tier === 'silver') grant(state, tierItems, pickLootItem(state, boss, 'buff'), 2, 1);
    if (tier === 'gold') grant(state, tierItems, pickLootItem(state, boss, 'catalyst'), 2, 1);
    sim.cpHit.forEach((at) => { const ci = []; grant(state, ci, boss.bossMat, 2, 1); grant(state, ci, boss.floorItem || 'coal', 1, randInt(3, 6)); grant(state, ci, pickLootItem(state, boss, 'buff'), 1, 1); chests.push({ at, items: ci }); });
  }
  sim.cpHit.forEach((at) => { if (!rec.checkpointsPaid.includes(at)) rec.checkpointsPaid.push(at); });
  // Crew vault stock (filled through town contracts) used in the raid. The sim drew only what
  // members needed (see raid-sim vaultTake) and credited each unit to the member it healed or
  // buffed. Remove exactly that from the real vault and log every item so members can audit it.
  if (state.crew && state.crew.vault && state.crew.vault.inv && sim.vaultConsumed) {
    Object.keys(sim.vaultConsumed).forEach((id) => {
      const qty = num(sim.vaultConsumed[id], 0); if (!(qty > 0)) return;
      const users = arr(sim.vaultUse).filter((u) => u.items[id] > 0).map((u) => `${u.name} ${u.items[id]}`);
      invTake(state.crew.vault.inv, id, qty, WORST, 0).forEach((t) => {
        logTreasury(state, 'raid-stock', 0, 'Raid', `${t.qty} ${itemName(id)} used in the raid (${users.join(', ')})`, { itemId: id, qty: -t.qty, grade: t.grade });
      });
    });
  }
  // the raid has happened: this week's town contracts close and any unspent escrow goes back
  closeContracts(state, 'Raid over', 'town'); // crew requests stay open
  // Raid gold (phase 2.5, priced in hours of play; constants in data.ts ECON). Scales with turnout and
  // contribution, never with boss HP:
  //   avgContribution = crew's filled share of its fair-share work, 0..1
  //   turnoutFactor   = 0.5 + 0.5 x (attended / roster)
  //   tierScale       = raidTierGrowth ^ (boss tier - 1)
  //   pool = min(perAttendee x attended x tierScale x avgContribution x turnoutFactor,
  //              perAttendee x raidCapAttendees x tierScale)
  // raidTreasuryShare of the pool goes to the crew treasury (logged; funds next week's town
  // contracts); the rest is split evenly between attendees, so a joined player earns their share.
  const crewHave = sim.waves.reduce((a: number, w: any) => a + num(w.crewHave, 0), 0);
  const crewNeed = sim.waves.reduce((a: number, w: any) => a + num(w.crewNeed, 0), 0);
  const avgContribution = crewNeed > 0 ? clamp(crewHave / crewNeed, 0, 1) : 0;
  const pay = raidGoldSplit(state, num(rec.index, 0) + 1, sim.attendCount, avgContribution, joined);
  const crewGold = pay.treasury;
  if (state.crew && state.crew.treasury) {
    state.crew.treasury.gold += crewGold;
    feedPush(state, 'payout', 'Raid', `Raid payout: ${fmtGold(pay.pool)} pool, ${fmtGold(crewGold)} to the treasury, ${fmtGold(pay.perAttendee)} each (${sim.attendCount} turned out, ${(avgContribution * 100).toFixed(0)}% contribution).`);
    logTreasury(state, 'payout', +crewGold, 'Raid', `Raid payout: ${fmtGold(crewGold)} of a ${fmtGold(pay.pool)} pool (${sim.attendCount} turned out, ${(avgContribution * 100).toFixed(0)}% contribution)`);
    econ(state, 'raidGold', crewGold);
  }
  if (pay.player > 0) state.gold = num(state.gold, 0) + pay.player;
  // kill: lottery, ladder, buff
  const held = rec.joinedWeekends > 0 ? coreOddsFor(state, rec, boss, cumTier) : null;
  let cores = { drawn: false, tickets: held ? held.tickets : 0, breakdown: held ? held.breakdown : { floor: 0, tier: 0 }, tier, won: 0, coreItemId: boss.coreItem || null, chance: 0, pityBefore: num(state.raid.corePity, 0), pityAfter: num(state.raid.corePity, 0) };
  let weekBuff = null;
  const won = sim.killed;
  if (won) {
    rec.killedWeek = state.week;
    if (rec.joinedWeekends > 0) {
      const odds = coreOddsFor(state, rec, boss, cumTier);
      const win = odds.guaranteed || rand() < odds.chance;
      cores = Object.assign(cores, { drawn: true, tickets: odds.tickets, chance: odds.chance, won: win ? 1 : 0 });
      if (win) { addItem(state, boss.coreItem, 3, 1); state.raid.corePity = 0; state.raid.coresWon = num(state.raid.coresWon, 0) + 1; }
      else state.raid.corePity = num(state.raid.corePity, 0) + 1;
      cores.pityAfter = state.raid.corePity;
    }
    const buffs = arr(c.weekBuffs).length ? c.weekBuffs : [{ kind: 'repair', value: 0.3, label: 'Repairs 30% cheaper' }];
    const bf = buffs[Math.floor(rand() * buffs.length)];
    weekBuff = { kind: bf.kind, value: bf.value, label: bf.label, week: state.week + 1 };
    state.server.pendingBuff = weekBuff;
    // ladder unlock (next boss revealed Monday)
    if (num(state.raid.ladder, 0) + 1 >= bosses().length) {
      state.raid.season = num(state.raid.season, 1) + 1; state.raid.ladder = 0; state.raid.bosses = {};
      E.log(state, 'raid', `The ladder is cleared! Season ${state.raid.season} begins with stronger bosses.`);
    } else state.raid.ladder = num(state.raid.ladder, 0) + 1;
    const nr = ensureRecord(state, state.raid.ladder, state.week); nr.revealedWeek = null; state.raid.bossHp = nr.hpLeft;
  } else state.raid.bossHp = rec.hpLeft;
  const rng2 = mulberry(Math.floor(rand() * 1e9));
  const boards = guildBoards(state, sim, rng2);
  const debrief = buildDebrief(state, sim);
  const moments = sim.moments.slice().sort((a, b) => b.score - a.score).slice(0, 5).sort((a, b) => a.frame - b.frame).map((m) => ({ frame: m.frame, t: m.t, at: startedAt + m.frame * frameMs, kind: m.kind, text: m.text, value: m.value }));
  const best = sim.moments.slice().sort((a, b) => b.score - a.score)[0];
  sim.timeline.forEach((f, k) => { f.at = startedAt + k * frameMs; });
  const foodTotal = Object.values(sim.eaten).reduce((a: number, b: any) => a + num(b, 0), 0);
  const recap = {
    id: nextId(state, 'R'), week: state.week, season: num(state.raid.season, 1), bossId: boss.id, bossName: boss.name, ladderIndex: rec.index, joined, auto: !!(lock && lock.auto),
    role: joined ? lock.role : null, roleName: joined ? roleDef(lock.role).name : null, startedAt, won,
    bossMaxHp: rec.maxHp, hpBefore: Math.round(hpBefore), hpAfter: rec.hpLeft, hpPctBefore: hpBefore / rec.maxHp, hpPctAfter: rec.hpLeft / rec.maxHp, damageDealtPct: (hpBefore - rec.hpLeft) / rec.maxHp,
    tier, tierWeek, tierBasis: rec.joinedWeekends > 1 ? 'carried' : 'weekend', tierLabel: TIER_NAME[tier] + (rec.joinedWeekends > 1 ? ' (carried over)' : ''),
    contribution: { points: rec.myPoints, weekPoints: sim.weekPoints, totalPoints: rec.totalPoints, weekShare, share, fairShare: 1 / Math.max(1, rec.pop), cumulativeTier: cumTier, weekends: rec.joinedWeekends },
    foodEaten: { total: foodTotal, items: sim.eaten },
    stockRanOut: arr(sim.stockShortfall).length > 0, stockShortfall: arr(sim.stockShortfall), stockOutAt: sim.stockOutFrame == null ? null : sim.stockOutFrame / Math.max(1, sim.timeline.length - 1),
    crewStock: { used: Object.assign({}, sim.vaultConsumed), byMember: arr(sim.vaultUse).map((u) => Object.assign({}, u, { items: Object.assign({}, u.items) })), yourCredit: Math.round(num(sim.vaultCredit && sim.vaultCredit.you, 0)) }, potionsUsed: sim.potionsUsed, pouchLeft: sim.pouchLeft, pouchStart: sim.pouchStart, supplyDelivered: sim.supplyDelivered, tiers: tiersSnap,
    faints: sim.faints, reviveCost: { food: sim.reviveFood, durability: sim.faints * num(c.reviveDurability, 2) },
    checks: sim.waves.map((w) => ({ wave: w.wave, phase: w.phase, phaseName: w.phaseName, check: w.check, label: w.label, result: w.result, overtime: w.overtime,
      yourShare: w.yourShare, yourText: w.yourText, your: Math.round(w.your), total: Math.round(w.total), need: Math.round(w.need), crewHave: Math.round(w.crewHave), crewNeed: Math.round(w.crewNeed), helped: w.your > 0,
      auraTier: w.auraTier, auraTierMin: w.auraTierMin, auraWeakened: w.auraWeakened, auraLoss: w.auraLoss, auraWeakFrames: w.auraWeakFrames, fainted: w.fainted })),
    payout: { floor: { items: floorItems, tickets: joined ? num((c.tierTickets || {}).floor, 1) : 0 }, tier: { tier, items: tierItems, tickets: joined ? num((c.tierTickets || {})[tier], 0) : 0 }, chests, crewGold, gold: pay.player, pool: pay.pool, perAttendee: pay.perAttendee, capped: pay.capped, turnout: pay.turnout, contribution: avgContribution, items: mergeItems([floorItems, tierItems].concat(chests.map((x) => x.items))) },
    cores, weekBuff, auras: sim.auras.map((a) => ({ guild: a.guild, type: a.type, tier: a.tier, strength: num((cfg().auraStrength || [])[a.tier], 0), mine: a.mine })), auraWeakenedWave: sim.auraWeakenedWave,
    moments, bestMoment: best ? { frame: best.frame, t: best.t, at: startedAt + best.frame * frameMs, kind: best.kind, text: best.text, value: best.value } : null,
    windowStart: win.start, windowEnd: win.end, frameMs, instant: !!opts.instant,
    debrief, crew: { name: (state.crew && state.crew.name) || 'Your crew', roster: arr(state.crew && state.crew.members).length + 1, attended: sim.attendCount,
      totals: { damage: Math.round(sim.crewTot.damage + sim.totals.damage), healing: Math.round(sim.crewTot.healing + sim.totals.healing), mitigation: Math.round(sim.crewTot.mitigation + sim.totals.mitigation), food: sim.crewFoodStart, consumables: sim.crewPotions } },
    leaderboards: boards, timeline: sim.timeline, seen: false, frames: sim.frames, participants: sim.participants
  };
  state.raid.recaps = [recap].concat(arr(state.raid.recaps).map((r) => { const o = Object.assign({}, r); delete o.timeline; return o; })).slice(0, 6);
  state.raid.resolvedWeek = state.week;
  state.raid.current = { week: state.week, startedAt, recapId: recap.id, instant: !!opts.instant };
  // v3-shaped result for the old raid screen
  const lb = boards.damage.totals.slice(0, 8).map((r, i) => ({ name: r.guild, guild: r.guild, role: 'striker', value: r.value, rank: i + 1, you: r.mine }));
  if (!lb.some((r) => r.you)) { const mine = boards.damage.totals.findIndex((r) => r.mine); const r = boards.damage.totals[mine]; if (r) lb[7] = { name: r.guild, guild: r.guild, role: 'striker', value: r.value, rank: mine + 1, you: true }; }
  const eatenAll = Object.assign({}, sim.eaten); Object.keys(sim.potionsUsed).forEach((k) => { eatenAll[k] = (eatenAll[k] || 0) + sim.potionsUsed[k]; });
  const result = { won, bossHpBefore: Math.round(hpBefore), bossHpAfter: rec.hpLeft, damage: Math.round(sim.totals.damage), healing: Math.round(sim.totals.healing), mitigated: Math.round(sim.totals.mitigation),
    sharePct: weekShare, eaten: eatenAll, loot: recap.payout.items, gold: pay.player, leaderboard: lb, faints: sim.faints,
    checksPassed: sim.waves.filter((w) => w.result !== 'unfinished').map((w) => w.result === 'passed'), bossId: boss.id, bossName: boss.name, week: state.week, rules: joined ? Object.assign({}, lock.rules) : null, recapId: recap.id, tier };
  state.raid.last = clone(result);
  if (joined) E.log(state, 'raid', won ? `${boss.name} defeated! ${recap.tierLabel} (${(share * 100).toFixed(3)}% share). ${cores.won ? 'You won a core!' : `${cores.tickets} core tickets, no core this time.`}`
    : `Raid on ${boss.name}: ${recap.tierLabel} (${(share * 100).toFixed(3)}% share), ${foodTotal} food eaten${sim.faints ? `, fainted ${sim.faints}x` : ''}. Boss left at ${Math.ceil(rec.hpLeft / rec.maxHp * 100)}%.`);
  chests.forEach((ch) => E.log(state, 'raid', `Server chest (${Math.round(ch.at * 100)}% checkpoint): ${ch.items.map((x) => x.qty + ' ' + itemName(x.itemId)).join(', ')}.`));
  if (joined) {
    pushEvent(state, 'raid', won ? `${boss.name} defeated! ${recap.tierLabel}.${cores.won ? ' You won a core!' : ''}` : `Raid on ${boss.name}: ${recap.tierLabel}. Boss left at ${Math.ceil(rec.hpLeft / rec.maxHp * 100)}%.`);
    if (pay.player > 0) pushEvent(state, 'gold', `Raid payout: +${fmtGold(pay.player)}.`, { gold: pay.player });
    recap.payout.items.forEach((x: any) => pushEvent(state, 'loot', `Raid loot: ${x.qty} ${itemName(x.itemId)}.`, { itemId: x.itemId, qty: x.qty, grade: x.grade }));
  } else pushEvent(state, 'raid', `The crew fought ${boss.name} without you.`);
  events.push({ type: 'raidResolved', recapId: recap.id, won });
  return { recap, result, timeline: sim.timeline };
}
export function coreOddsFor(state, rec, boss, cumTier) {
  const tk = cfg().tierTickets || { floor: 1, bronze: 2, silver: 4, gold: 8 };
  // v5 formula: turnout floor (if you joined this boss once) + contribution tier (from fight share).
  // Stage C enriches the tier basis to also account for pouch submissions via contracts.
  const breakdown = { floor: rec.joinedWeekends > 0 ? num(tk.floor, 1) : 0, tier: num(tk[cumTier], 0) };
  const tickets = breakdown.floor + breakdown.tier;
  const pity = num(state.raid.corePity, 0); const pityMax = pityMaxFor(cumTier);
  // Phase 2.5: raid tokens are gone, so the old +0.8 token share is dropped. Every participant
  // holds the floor ticket plus, on average, cfg.serverAvgTierTickets from their tier.
  const parts = Math.round(num(state.server.pop, 1200) * num(cfg().serverTurnout, 0.85));
  const serverTickets = parts * serverTicketsPerPlayer();
  const cores = num(boss.cores, 20);
  const eff = tickets * (1 + pity);
  const chance = tickets <= 0 ? 0 : pity >= pityMax ? 1 : clamp(1 - Math.pow(1 - eff / (serverTickets + eff), cores), 0, 1);
  return { tickets, breakdown, tier: cumTier, serverTickets: Math.round(serverTickets), cores, chance, pity, pityMax, guaranteed: tickets > 0 && pity >= pityMax, coreItemId: boss.coreItem || null };
}
// Pity scales with contribution tier: a guaranteed core after this many empty joined kills
// (gold 3, silver 4, bronze 5, no tier 6).
export function pityMaxFor(tier) { const m = cfg().corePityByTier || {}; return Math.max(0, Math.floor(num(m[tier], num(cfg().corePityMax, 3)))); }
export function raidGoldSplit(state, bossTier, attendCount, avgContribution, joined) {
  const c = cfg(); const per = num(c.raidGoldPerAttendee, 0);
  const roster = arr(state.crew && state.crew.members).length + 1;
  const turnout = clamp(attendCount / Math.max(1, roster), 0, 1);
  const tierScale = Math.pow(num(c.raidTierGrowth, 1.25), Math.max(0, bossTier - 1));
  const raw = per * attendCount * tierScale * clamp(avgContribution, 0, 1) * (0.5 + 0.5 * turnout);
  const cap = per * num(c.raidCapAttendees, 18) * tierScale;
  const pool = Math.round(Math.min(raw, cap));
  const treasury = Math.round(pool * clamp(num(c.raidTreasuryShare, 0), 0, 1));
  const perAttendee = attendCount > 0 ? Math.floor((pool - treasury) / attendCount) : 0;
  return { pool, treasury, perAttendee, player: joined ? perAttendee : 0, capped: raw > cap, turnout, tierScale };
}
export function serverTicketsPerPlayer() { const tk = cfg().tierTickets || { floor: 1 }; return num(tk.floor, 1) + num(cfg().serverAvgTierTickets, 2.6); }
E.coreOdds = function (state) {
  const boss = E.currentBoss(state); const rec = curRecord(state);
  const share = rec.myPoints / Math.max(1e-9, rec.totalPoints);
  const r = coreOddsFor(state, rec.joinedWeekends ? rec : Object.assign({}, rec, { joinedWeekends: 1 }), boss, rec.joinedWeekends ? tierFor(state, share) : 'none');
  return r;
};
E.lastRecap = (state) => arr(state.raid.recaps)[0] || null;
E.recaps = (state) => arr(state.raid.recaps).slice();
E.markRecapSeen = function (state, id) { const r = arr(state.raid.recaps).find((x) => x.id === (id || (E.lastRecap(state) || {}).id)); if (r) r.seen = true; return { ok: !!r, reason: r ? '' : 'No such recap.' }; };
E.leaderboards = (state) => { const r = E.lastRecap(state); return r ? r.leaderboards : null; };
E.weekBuff = (state) => { const b = state.server && state.server.weekBuff; return b && b.week === state.week ? b : null; };
E.marketTax = function (state) { const b = E.weekBuff(state); const t = clamp(num(cfg().marketTax, 0.05), 0, 1); return b && b.kind === 'tax' ? Math.min(t, num(b.value, t)) : t; };
