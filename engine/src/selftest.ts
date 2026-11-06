// Headless smoke test (E._test), ported unchanged.
// Ported from legacy/engine.js lines 2695-3048. Behaviour must stay identical to the
// legacy build (see test/parity.test.ts); design changes come in phase 1.
/* eslint-disable */
import { ctx } from './context';
import { E, SLOTS, LOG_CAP, RAID_FRAMES, num, cfg, skillDefs, item, allActions, bosses, clamp, rarityIdx } from './core';
import { addItem } from './inventory';
import { findGear, isEquipped, makeGear } from './gear';
import { isGearCraft } from './actions';
import { CREW_MIN_JOBS, CREW_MAX_JOBS, isJobAction, postJob } from './crew-assist';
import { SCHEMA, V3_BOSS_HP, clone, rankDef, invCount } from './v4-helpers';
import { curRecord } from './server';
import { crewEconomyStep, ensureV4 } from './crew-economy';
import { migrate } from './state';

// ---------------------------------------------------------------- headless smoke test
E._test = function (opts) {
  opts = opts || {};
  const say = opts.silent ? () => {} : (m) => console.log('[engine test] ' + m);
  const assert = (c, m) => { if (!c) throw new Error('Engine test failed: ' + m); };
  const finite = (s) => {
    ['gold', 'tokens', 'week', 'hp', 'focus'].forEach((k) => assert(isFinite(s[k]), k + ' not finite: ' + s[k]));
    Object.keys(s.inv).forEach((id) => s.inv[id].forEach((x) => assert(x >= 0 && Number.isInteger(x), 'bad inv count ' + id)));
    s.gear.forEach((g) => assert(isFinite(g.dur) && isFinite(g.maxDur) && g.dur >= 0, 'bad gear dur'));
    Object.keys(s.skills).forEach((k) => assert(isFinite(s.skills[k].xp), 'xp nan ' + k));
    assert(s.log.length <= LOG_CAP, 'log too long');
  };
  const runTicks = (s, until, maxSec) => { let t = 0; const evs = []; while (t < maxSec && !until(evs, s)) { E.tick(s, 0.25, { visible: true }).forEach((e) => evs.push(e)); t += 0.25; } return evs; };
  assert(E.xpForLevel(1) === 0 && E.xpForLevel(2) === 83 && E.xpForLevel(99) === 13034431, 'xp curve');
  assert(E.levelFor(0) === 1 && E.levelFor(83) === 2 && E.levelFor(1e9) === num(cfg().maxLevel, 99), 'levelFor');
  E.save(null); E.load();
  const s = E.newState(); finite(s);
  assert(Object.keys(s.skills).length === skillDefs().length, 'skills missing');
  assert(s.hp === E.playerStats(s).maxHp, 'starting hp');
  assert(s.market.listings.length >= 12, 'market listings');
  assert(s.supply.requests.length >= 6, 'supply requests');
  // gather 20
  const gather = allActions().filter((a) => a.kind === 'gather' && num(a.level, 1) <= 1);
  assert(gather.length, 'no level-1 gather');
  let r = E.start(s, gather[0].id); assert(r.ok, 'start gather: ' + r.reason);
  let ev = runTicks(s, (e) => e.filter((x) => x.type === 'complete').length >= 20, 3600);
  assert(ev.filter((x) => x.type === 'complete').length >= 20, 'gathered 20');
  say(`gathered 20x ${gather[0].id}; ${E.itemCount(s, Object.keys(gather[0].outputs)[0])} in bag`);
  // feed a refine: grant inputs of the first level-1 refine
  const refine = allActions().find((a) => a.kind === 'refine' && num(a.level, 1) <= 1);
  if (refine) {
    Object.keys(refine.inputs || {}).forEach((id) => addItem(s, id, 1, refine.inputs[id] * 10));
    r = E.start(s, refine.id); assert(r.ok, 'start refine: ' + r.reason);
    ev = runTicks(s, (e) => !s.active, 3600);
    assert(ev.filter((x) => x.type === 'complete').length >= 10, 'refined 10');
    assert(ev.some((x) => x.type === 'stopped'), 'refine stops when out');
    say(`refined ${refine.id} until out of inputs`);
  }
  // craft 50 gear
  const craft = allActions().filter((a) => isGearCraft(a)).sort((a, b) => a.level - b.level)[0];
  assert(craft, 'no gear craft');
  Object.keys(craft.inputs || {}).forEach((id) => addItem(s, id, 2, craft.inputs[id] * 50));
  s.skills[craft.skill].xp = Math.max(s.skills[craft.skill].xp, E.xpForLevel(num(craft.level, 1)));
  const po = E.procOdds(s, craft.id);
  assert(po && Math.abs(po.odds.reduce((a, o) => a + o.chance, 0) - 1) < 1e-9, 'odds sum to 1');
  r = E.start(s, craft.id); assert(r.ok, 'start craft: ' + r.reason);
  ev = runTicks(s, (e) => !s.active, 20000);
  const crafts = ev.filter((x) => x.type === 'craft');
  assert(crafts.length === 50, 'crafted 50 (got ' + crafts.length + ')');
  const byR = {}; crafts.forEach((c) => { byR[c.rarity] = (byR[c.rarity] || 0) + 1; });
  assert(crafts.some((c) => rarityIdx(c.rarity) >= 2) || num(cfg().pityThreshold, 40) > 50, 'pity should guarantee a rare+ by 50');
  say(`crafted 50 ${craft.id}: ${JSON.stringify(byR)}`);
  // gear ops
  const loose = s.gear.filter((g) => !isEquipped(s, g.uid));
  assert(E.gearName(loose[0]).length > 0, 'gearName');
  assert(E.equip(s, loose[0].uid).ok, 'equip');
  const fc = E.fuseCandidates(s);
  if (fc.length) { r = E.fuse(s, fc[0].itemId); assert(r.ok && r.gear, 'fuse'); }
  const sv = s.gear.find((g) => !isEquipped(s, g.uid));
  if (sv) { r = E.salvage(s, sv.uid); assert(r.ok, 'salvage'); }
  const eq = s.gear.find((g) => isEquipped(s, g.uid)); eq.dur = 1;
  assert(E.repairCost(s, eq.uid).gold > 0, 'repair cost'); s.gold += 1000; assert(E.repair(s, eq.uid).ok, 'repair');
  // re-equip a weapon
  const weap = s.gear.find((g) => item(g.itemId).slot === 'weapon'); if (weap) E.equip(s, weap.uid);
  // combat
  const combat = allActions().filter((a) => a.kind === 'combat').sort((a, b) => a.level - b.level)[0];
  assert(combat, 'no combat');
  r = E.start(s, combat.id); assert(r.ok, 'start combat: ' + r.reason);
  ev = runTicks(s, (e) => e.filter((x) => x.type === 'kill').length >= 10 || !s.active, 3600);
  assert(ev.some((x) => x.type === 'kill' || x.type === 'faint'), 'combat produced kills');
  say(`combat: ${ev.filter((x) => x.type === 'kill').length} kills, ${ev.filter((x) => x.type === 'eat').length} eats, hp ${Math.round(s.hp)}`);
  E.stop(s);
  // market
  const l = s.market.listings[0]; s.gold += 5000;
  r = E.buy(s, l.id, 1); assert(r.ok, 'buy: ' + r.reason);
  const anyId = Object.keys(s.inv)[0]; const gr = s.inv[anyId].findIndex((x) => x > 0);
  r = E.list(s, anyId, gr, 1, 2); assert(r.ok, 'list: ' + r.reason);
  const before = s.gold; runTicks(s, () => !s.market.mine.length, 600);
  assert(s.market.mine.length === 0 && s.gold > before, 'cheap listing sold');
  assert(E.list(s, anyId, gr, 999999, 1).ok === false, 'list too many fails');
  // estimate
  const est = E.gatherEstimate(s, Object.keys(gather[0].outputs)[0]); assert(est > 0, 'gatherEstimate');
  // donate
  const req = s.supply.requests[0]; addItem(s, req.itemId, 0, 60);
  const q = E.supplyQuote(s, req.itemId, 60); r = E.donate(s, req.itemId, 60);
  assert(r.ok && r.coins === q.coins, 'donate');
  assert(E.supplyQuote(s, req.itemId, 10).coins <= Math.floor(req.rate * 10 * 0.5) + 1, 'diminishing returns');
  // raid
  E.setRaidRules(s, { eatAt: 0.9, stance: 'nonsense', tokens: 9999 });
  assert(s.raid.rules.eatAt === 0.8 && s.raid.rules.stance === 'balanced' && s.raid.rules.tokens === s.tokens, 'rules clamp');
  const pv = E.raidPreview(s); assert(pv.boss && Array.isArray(pv.advice), 'raidPreview');
  const wk = s.week; r = E.runRaid(s);
  assert(r.ok && r.timeline.length >= 6 && r.timeline.length <= RAID_FRAMES && r.result && r.recap && s.week === wk && s.raid.resolvedWeek === wk, 'runRaid: ' + r.reason);
  r.timeline.forEach((f) => assert(isFinite(f.bossHpPct) && isFinite(f.playerHpPct) && f.t >= 0 && f.t <= 1, 'frame finite'));
  assert(r.result.leaderboard.length <= 8 && r.result.leaderboard.some((e) => e.you), 'leaderboard');
  say(`raid: dealt ${r.result.damage}, share ${(r.result.sharePct * 100).toFixed(2)}%, boss ${E.fmt(r.result.bossHpBefore)} -> ${E.fmt(r.result.bossHpAfter)}, ate ${JSON.stringify(r.result.eaten)}`);
  // crew: posting
  assert(s.crew && s.crew.members.length >= 12 && s.crew.members.filter((m) => m.skill).length >= 4, 'crew members');
  s.crew.jobs = [];
  let cev = E.tick(s, 0.25);
  assert(cev.filter((x) => x.type === 'jobPosted').length >= CREW_MIN_JOBS && s.crew.jobs.length >= CREW_MIN_JOBS, 'jobs posted');
  s.crew.nextPostIn = 0.1; const nBefore = s.crew.jobs.length; cev = E.tick(s, 0.25);
  assert(nBefore >= CREW_MAX_JOBS || cev.some((x) => x.type === 'jobPosted'), 'job posted on timer');
  assert(s.crew.jobs.length <= CREW_MAX_JOBS, 'job cap');
  assert(E.crewJobs(s).every((j) => j.action && j.station && j.canAssist && isFinite(j.etaSec) && j.outputItemId), 'crewJobs shape');
  // crew: level lock
  const hard = allActions().filter((a) => isJobAction(a) && E.skillLevel(s, a.skill) < num(a.level, 1)).sort((a, b) => b.level - a.level)[0];
  if (hard) {
    const hj = postJob(s, hard.id);
    assert(!E.canAssist(s, hj.id).ok && !E.assist(s, hj.id).ok && !(s.active && s.active.jobId === hj.id), 'level-locked job refused');
    s.crew.jobs = s.crew.jobs.filter((j) => j !== hj);
  }
  // crew: assist start/stop
  const job = postJob(s, craft.id); job.qty = 6;
  r = E.assist(s, job.id); assert(r.ok && s.active && s.active.jobId === job.id, 'assist start: ' + r.reason);
  assert(E.activeInfo(s).kind === 'assist' && E.activeInfo(s).owner === job.owner, 'activeInfo assist');
  assert(E.crewJobs(s).find((j) => j.id === job.id).assisting, 'crewJobs assisting flag');
  E.stop(s); assert(s.active === null, 'assist stop');
  r = E.assist(s, job.id); assert(r.ok, 'assist again');
  const xpBefore = s.skills[craft.skill].xp, mBefore = num(s.mastery[craft.id], 0), gBefore = s.gold;
  ev = runTicks(s, (e) => e.some((x) => x.type === 'jobDone' && x.jobId === job.id), 600);
  const assists = ev.filter((x) => x.type === 'assist' && x.jobId === job.id);
  const done = ev.find((x) => x.type === 'jobDone' && x.jobId === job.id);
  assert(assists.length > 0 && done, 'assist crafts + jobDone');
  assert(Math.abs(s.skills[craft.skill].xp - xpBefore - assists.reduce((a, x) => a + x.xp, 0)) < 1e-6 && assists[0].xp > 0, 'assist xp');
  assert(num(s.mastery[craft.id], 0) - mBefore === assists.length, 'assist mastery');
  assert(assists.every((x) => x.rarity && x.items.length), 'gear job rolls rarity');
  assert(!ev.some((x) => x.type === 'complete'), 'no complete events for assist crafts');
  assert(done.assisted === assists.length && done.tip > 0 && s.gold >= gBefore + done.tip, 'tip paid');
  assert(s.active === null && ev.some((x) => x.type === 'stopped' && x.reason === 'Job finished.'), 'job finish stops assist');
  assert(!s.crew.jobs.some((j) => j.id === job.id), 'finished job removed');
  say(`assist: ${assists.length} crafts for ${job.owner}, ${assists.reduce((a, x) => a + x.xp, 0)} xp, tip ${done.tip}g`);
  // crew: offline assist (at offlineRate)
  const job2 = postJob(s, craft.id); job2.qty = 20; E.assist(s, job2.id);
  s.lastSeen = ctx.now() - 3600 * 1000;
  const offA = E.applyOffline(s, ctx.now());
  assert(offA.summary.assisted > 0 && offA.summary.xp[craft.skill] > 0, 'offline assist xp');
  // crew: v1 save migration
  const v1 = JSON.parse(JSON.stringify(s)); delete v1.crew; v1.active = { actionId: gather[0].id, progress: 1 };
  const mv = migrate(v1);
  assert(mv && mv.crew && mv.crew.members.length >= 12 && mv.crew.jobs.length >= CREW_MIN_JOBS && mv.active && !mv.active.jobId, 'v1 save migrates crew');
  const v1b = JSON.parse(JSON.stringify(s)); delete v1b.crew; v1b.active = { actionId: craft.id, progress: 0, jobId: 'gone' };
  assert(migrate(v1b).active === null, 'stale jobId dropped on migrate');
  finite(s);
  // offline
  E.start(s, gather[0].id); s.lastSeen = ctx.now() - 13 * 3600 * 1000;
  const t0 = ctx.now(); const off = E.applyOffline(s, ctx.now());
  assert(off.seconds === num(cfg().offlineCapSec, 43200), 'offline cap');
  assert(ctx.now() - t0 < 2000, 'offline fast');
  say(`offline ${E.fmtTime(off.seconds)}: ${JSON.stringify(off.summary.items)}`);
  // save round trip via migrate
  const back = migrate(JSON.parse(JSON.stringify(s))); assert(back && back.gold === s.gold, 'migrate round trip');
  assert(migrate({ junk: true }) === null, 'corrupt save rejected');
  finite(s);
  assert(E.fmt(1234) === '1.2k' && E.fmtTime(252) === '4m 12s' && E.fmtTime(7500) === '2h 5m', 'formatters');
  testV4(assert, say);
  say('all checks passed');
  return true;
};

// ---------------------------------------------------------------- v4 checks
export function testV4(assert, say) {
  const kit = (s, ids) => ids.forEach((id) => { const g = makeGear(s, id, 0, 70); E.equip(s, g.uid); });
  const fresh = () => { const s = E.newState(); s.raid.resolvedWeek = s.week - 1; return s; };
  // --- migration from a v3 save (v:1 shape, no v4 fields)
  const s0 = E.newState(); s0.week = 5; s0.tokens = 3;
  const v3 = clone(s0); v3.v = 1;
  ['clock', 'server', 'loadouts', 'economy'].forEach((k) => delete v3[k]);
  v3.raid = { ladder: 1, bossHp: V3_BOSS_HP[1] / 2, rules: { eatAt: 0.6, stance: 'defensive', tactic: 'interrupt', tokens: 2 }, last: { won: false, damage: 10 } };
  v3.crew = { name: 'Old crew', members: s0.crew.members.slice(0, 4).map((m) => ({ name: m.name, skill: m.skill })), jobs: s0.crew.jobs, nextPostIn: 30 };
  const m = migrate(clone(v3));
  assert(m && m.v === SCHEMA && m.week === 5 && E.weekNumber(m) === 5, 'v3 migrate: schema + week anchored');
  const mr = curRecord(m); const mb = E.currentBoss(m);
  assert(m.raid.ladder === 1 && mb.id === bosses()[1].id && Math.abs(mr.hpLeft / mr.maxHp - 0.5) < 0.01 && m.raid.bossHp === mr.hpLeft, 'v3 migrate: boss HP fraction carried');
  assert(m.raid.bosses[bosses()[0].id].killedWeek != null && mr.revealedWeek === 5, 'v3 migrate: ladder history + reveal');
  assert(m.raid.rules.stance === 'defensive' && m.raid.rules.tactic === 'interrupt' && m.raid.last && m.raid.last.damage === 10, 'v3 migrate: rules + last kept');
  assert(m.loadouts.length === 1 && SLOTS.every((sl) => m.loadouts[0].slots[sl] === m.equipped[sl]), 'v3 migrate: loadout seeded from equipped');
  assert(m.crew.name === 'Old crew' && m.crew.members.length >= 12 && m.crew.members[0].rank === 'leader' && m.crew.playerRank === 'officer' && m.crew.treasury.coin >= 0 && m.crew.vault, 'v3 migrate: crew v4 fields');
  assert(m.raid.resolvedWeek === 4 && !m.raid.lock && m.server.popHistory.length === 4, 'v3 migrate: raid pending this week');
  const m2 = migrate(clone(m)); assert(m2 && m2.v === SCHEMA && m2.raid.ladder === 1 && curRecord(m2).hpLeft === mr.hpLeft && m2.loadouts.length === 1, 'v4 round trip');
  say('v3 save migrates to v4');
  // --- clock + auto raid at window start
  const c = fresh(); const w = E.raidWindow(c);
  assert(w.end - w.start === 36 * 3600000 && new Date(w.start).getDay() === 6 && new Date(w.start).getHours() === 10, 'raid window Sat 10:00 +36h');
  const ck = E.clock(c); assert(typeof ck.live === 'boolean' && ck.ms > 0 && /^Week \d+ · /.test(ck.label), 'clock shape');
  let r = E.devSetClock(c, 'raid');
  assert(r.ok && E.isRaidWindow(c) && E.defaultTab(c) === 'raid' && r.events.some((e) => e.type === 'raidLocked' && e.auto) && r.events.some((e) => e.type === 'raidResolved'), 'auto-lock + fight at window start');
  assert(E.raidStatus(c).phase === 'live' && /Raid live/.test(E.clock(c).label) && E.lastRecap(c).auto, 'raid live status');
  const wk = c.week; r = E.devSetClock(c, 'nextWeek');
  assert(c.week === wk + 1 && r.events.some((e) => e.type === 'weekStart') && !c.raid.lock && E.defaultTab(c) === 'workshop', 'monday rollover');
  say('clock: window, auto-lock, rollover');
  // --- loadouts, tags, binding, vault flags incomplete
  const L = fresh(); kit(L, ['bronze_sword', 'leather_cap', 'leather_jerkin', 'leather_breeches']);
  const cow = makeGear(L, 'herbalist_cowl', 0, 60); const sat = makeGear(L, 'foragers_satchel', 0, 60);
  const ab = E.autoBuild(L, 'foraging', { save: true, name: 'Forager' });
  assert(ab.ok && ab.slots.head === cow.uid && ab.slots.offhand === sat.uid && ab.gain > 0 && ab.loadout, 'autoBuild foraging');
  const cmp = E.compareLoadout(L, ab.loadout.id);
  assert(cmp.deltas.some((d) => d.tag === 'foraging' && d.delta > 0 && /^\+\d+(\.\d)?% foraging yield vs\. equipped$/.test(d.text)), 'compare delta text: ' + JSON.stringify(cmp.deltas.map((d) => d.text)));
  E.bindLoadout(L, ab.loadout.id, 'herbalism');
  const herb = allActions().find((a) => a.skill === 'herbalism' && a.level <= 1);
  r = E.start(L, herb.id); assert(r.ok && r.loadoutId === ab.loadout.id && L.equipped.head === cow.uid, 'bound loadout equips on start');
  assert(E.skillBonus(L, 'herbalism').yield > 0.2 && E.skillBonus(L, 'mining').yield === 0, 'skill bonus applies to its skill');
  E.stop(L);
  r = E.vaultDeposit(L, { kind: 'gear', uid: cow.uid });
  assert(r.ok && r.loadoutsAffected.includes(ab.loadout.id) && !L.equipped.head, 'gear to vault');
  const lv = E.loadouts(L).find((x) => x.id === ab.loadout.id); assert(!lv.complete && lv.missing.includes('head') && E.badges(L).kit.on, 'loadout flagged incomplete');
  assert(E.roleCheck(L, 'striker', 'equipped').ok && !E.roleCheck(L, 'mender').ok, 'role pass/fail vs requirement');
  const up = E.saveLoadout(L, { id: ab.loadout.id, name: 'Renamed', goal: 'quality', slots: { weapon: L.equipped.weapon } });
  assert(up.ok && up.loadout.name === 'Renamed' && up.loadout.goal === 'quality' && up.loadout.slots.weapon === L.equipped.weapon && up.loadout.slots.head === null && up.loadout.slots.chest === null, 'saveLoadout update replaces slots/name/goal');
  say('loadouts: auto-build, compare, bind, incomplete flag');
  // --- pouch + lock-in
  const P = fresh(); kit(P, ['bronze_sword', 'leather_cap', 'leather_jerkin', 'leather_breeches']); addItem(P, 'mint_tonic', 1, 5);
  assert(E.packPouch(P, 'bread', 6).moved === 6 && E.itemCount(P, 'bread') === 4 && E.pouch(P).food === 6, 'pack pouch from bag');
  assert(!E.packPouch(P, 'copper_ore', 1).ok, 'pouch refuses materials');
  E.setRaidPlan(P, { role: 'striker' }); r = E.lockIn(P);
  assert(r.ok && P.raid.lock.role === 'striker' && !E.packPouch(P, 'mint_tonic', 1).ok && !E.setRaidPlan(P, { role: 'mender' }).ok && !E.setRaidRules(P, { stance: 'aggressive' }).ok, 'lock freezes plan/rules/pouch');
  const ls = E.lockSummary(P); assert(ls.locked && ls.roleCheck.ok && ls.tiers.list.length === 3 && ls.projected && ls.pouch.food === 6, 'lock summary');
  assert(E.crewReadiness(P).checks.length === 5 && !JSON.stringify(E.crewReadiness(P)).includes(P.crew.members[0].name), 'readiness: totals only, no names');
  assert(E.unlock(P).ok && !P.raid.lock, 'unlock before raid');
  say('pouch + lock-in');
  // --- contribution carry-over + checkpoint chests
  const K = fresh(); kit(K, ['iron_longsword', 'studded_jerkin', 'studded_leggings', 'hardened_hood']); addItem(K, 'herb_trout', 2, 30); E.packPouch(K, 'herb_trout', 30);
  E.setRaidPlan(K, { role: 'striker' });
  const rec = curRecord(K); rec.hpLeft = Math.round(rec.maxHp * 0.99) + 1e6;
  rec.hpLeft = Math.min(rec.maxHp, Math.round(rec.maxHp * 0.99));
  let a1 = E.startRaidNow(K); assert(a1.ok && !a1.recap.won, 'weekend 1 survives');
  const p1 = a1.recap.contribution.points;
  assert(a1.recap.cores.tickets >= 1 && !a1.recap.cores.drawn && a1.recap.pouchStart === 30, 'held tickets without a draw');
  assert(p1 > 0 && a1.recap.contribution.weekShare > 0 && a1.recap.checks.some((x) => x.helped && /you filled/.test(x.yourText)), 'weekend 1 contribution');
  const chest1 = a1.recap.payout.chests.map((x) => x.at);
  assert(chest1.length >= 1 && chest1.every((at) => rec.checkpointsPaid.includes(at)) && a1.recap.payout.crewCoin > 0, 'checkpoint chests paid: ' + chest1);
  const coin1 = K.crew.treasury.coin + K.crew.treasury.escrow;
  let a2 = E.startRaidNow(K);
  assert(K.week === a1.recap.week + 1 && a2.recap.bossId === a1.recap.bossId, 'same boss next weekend');
  assert(Math.abs(a2.recap.contribution.points - (p1 + a2.recap.contribution.weekPoints)) < 1e-6 && Math.abs(a2.recap.contribution.share - a2.recap.contribution.points / a2.recap.contribution.totalPoints) < 1e-9, 'contribution carries over');
  assert(!a2.recap.payout.chests.some((x) => chest1.includes(x.at)), 'checkpoint chests pay once');
  assert(a2.recap.payout.crewCoin <= num(cfg().crewCoinCap, 180) * (a2.recap.ladderIndex + 1) && a2.recap.payout.crewCoin === Math.min(num(cfg().crewCoinCap, 180), num(cfg().crewCoinPerAttendee, 10) * a2.recap.crew.attended) && K.crew.treasury.coin + K.crew.treasury.escrow === coin1 + a2.recap.payout.crewCoin, 'crew coin by turnout, capped');
  assert(a2.recap.moments.length > 0 && a2.recap.bestMoment && a2.recap.debrief && a2.recap.leaderboards.damage.totals.some((x) => x.mine) && a2.recap.leaderboards.attendance.averages.length > 1, 'recap shape');
  say(`carry-over: ${a1.recap.tier}/${a2.recap.tier}, share ${(a2.recap.contribution.share * 100).toFixed(3)}%, chests ${chest1}`);
  // --- lottery pity + kill + week buff
  const W = fresh(); kit(W, ['iron_longsword']); E.packPouch(W, 'bread', 10); E.setRaidPlan(W, { role: 'striker' });
  const wr = curRecord(W); wr.hpLeft = 1; W.raid.corePity = num(cfg().corePityMax, 3);
  assert(E.coreOdds(W).chance === 1, 'pity guarantees odds');
  const bossBefore = E.currentBoss(W); const coreId = bossBefore.coreItem;
  r = E.startRaidNow(W);
  assert(r.recap.won && r.recap.cores.drawn && r.recap.cores.won === 1 && W.raid.corePity === 0 && E.itemCount(W, coreId) === 1, 'pity core awarded');
  assert(W.raid.ladder === 1 && curRecord(W).revealedWeek == null && E.bossIntel(W).weakTo === null, 'ladder unlock, next boss hidden until Monday');
  const pend = W.server.pendingBuff; assert(pend && pend.week === W.week + 1 && !E.weekBuff(W), 'buff pending for next week');
  W.server.pendingBuff = { kind: 'repair', value: 0.3, label: 'Repairs 30% cheaper', week: W.week + 1 };
  const eq = findGear(W, W.equipped.weapon); eq.dur = 10;
  const cost0 = E.repairCost(W, eq.uid).gold;
  E.devSetClock(W, 'nextWeek');
  assert(E.weekBuff(W) && E.weekBuff(W).kind === 'repair' && E.repairCost(W, eq.uid).discount > 0 && curRecord(W).revealedWeek === W.week, 'repair buff applied next week + boss revealed');
  W.server.pendingBuff = { kind: 'tax', value: 0.02, label: 'Market tax 2%', week: W.week + 1 };
  assert(E.marketTax(W) === num(cfg().marketTax, 0.05), 'tax normal before buff');
  E.devSetClock(W, 'nextWeek'); assert(E.marketTax(W) === 0.02 && E.repairCost(W, eq.uid).discount === 0, 'tax buff applied, repair buff expired');
  // pity counter rises on a losing draw
  const W2 = fresh(); kit(W2, ['training_sword']); curRecord(W2).hpLeft = 1; W2.server.pop = 1e6; W2.raid.corePity = 0;
  r = E.startRaidNow(W2); assert(r.recap.won && (r.recap.cores.won === 1 ? W2.raid.corePity === 0 : W2.raid.corePity === 1), 'pity counter increments on a miss');
  assert(r.recap.tiers && r.recap.tiers.list.length === 3 && r.recap.pouchStart >= r.recap.pouchLeft, 'recap tier snapshot + pouch units');
  say('lottery pity, ladder unlock, week buffs');
  // --- requisitions: escrow + first-in-best-dressed
  const Q = fresh(); Q.crew.treasury.coin = 100; Q.crew.treasury.escrow = 0;
  assert(!E.postRequisition(Q, { itemId: 'mint_tonic', qty: 30, rewardPer: 5, minGrade: 1 }).ok, 'cannot promise more than treasury');
  r = E.postRequisition(Q, { itemId: 'mint_tonic', qty: 10, rewardPer: 5, minGrade: 2 });
  assert(r.ok && Q.crew.treasury.coin === 50 && Q.crew.treasury.escrow === 50 && r.req.escrow === 50, 'escrow at posting');
  const id = r.req.id; addItem(Q, 'mint_tonic', 1, 20);
  assert(!E.fillRequisition(Q, id, 5).ok, 'min grade enforced');
  addItem(Q, 'mint_tonic', 3, 6);
  Q.crew.reqSimIn = 0; Q.crew.members.length = Math.max(1, Q.crew.members.length); crewEconomyStep(Q, 0.1, []);
  const rq = () => Q.crew.requisitions.find((x) => x.id === id);
  const npcQty = rq().submissions[0].qty; assert(rq().submissions.length === 1 && rq().submissions[0].who !== 'You' && rq().paid === npcQty * 5, 'crewmate submits first, paid');
  const g0 = Q.gold; r = E.fillRequisition(Q, id, 99);
  const accept = Math.min(6, 10 - npcQty);
  assert(r.ok && r.accepted === accept && r.paid === accept * 5 && Q.gold === g0 + accept * 5 && rq().submissions[1].who === 'You', 'player paid in submission order');
  assert(invCount(Q.crew.vault.inv, 'mint_tonic') === npcQty + accept, 'goods go to the vault');
  if (rq().status === 'open') { Q.crew.reqSimIn = 0; for (let k = 0; k < 40 && rq().status === 'open'; k++) { Q.crew.reqSimIn = 0; crewEconomyStep(Q, 0.1, []); } }
  assert(rq().status === 'filled' && rq().filled === 10 && rq().escrow === 0 && rq().paid === 50 && !E.fillRequisition(Q, id, 1).ok, 'filled closes; later submissions unpaid');
  assert(Q.crew.treasury.escrow === 0 && Q.crew.treasury.coin === 50 && Q.crew.feed.some((f) => f.kind === 'payout'), 'treasury balances + feed');
  r = E.postRequisition(Q, { itemId: 'bread', qty: 4, rewardPer: 5, minGrade: 0 }); const cr2 = E.cancelRequisition(Q, r.req.id);
  assert(cr2.ok && cr2.refunded === 20 && Q.crew.treasury.coin === 50, 'cancel refunds escrow');
  assert(E.neededByCrew(Q).every((n) => n.remaining > 0), 'needed by crew');
  assert(Q.crew.feed.some((f) => f.who !== 'You' && f.kind === 'payout' && new RegExp('^' + f.who + ' filled \\d+ Mint tonic, \\+\\d+g$').test(f.text)), 'feed logs crewmate fills');
  const big = E.postRequisition(Q, { itemId: 'bread', qty: 50, rewardPer: 5 }); assert(!big.ok && /treasury has/.test(big.reason), 'reject beyond free coin');
  say('requisitions: escrow, ordering, payouts');
  // --- permissions + ask an officer
  const M = fresh(); addItem(M, 'bread', 1, 5); E.vaultDeposit(M, 'bread', null, 5);
  E.setViewAsMember(M, true);
  assert(!E.can(M, 'withdraw').ok && /Ask an officer/.test(E.vaultWithdraw(M, 'bread', null, 1).reason) && !E.postRequisition(M, { itemId: 'bread', qty: 1, rewardPer: 0 }).ok, 'member perms greyed');
  r = E.requestWithdrawal(M, { itemId: 'bread', qty: 2 }); assert(r.ok, 'withdrawal request');
  const b0 = E.itemCount(M, 'bread'); crewEconomyStep(M, 200, []);
  assert(E.itemCount(M, 'bread') === b0 + 2 && M.crew.withdrawRequests[0].status === 'approved', 'officer answers request');
  E.setViewAsMember(M, false); assert(E.vaultWithdraw(M, 'bread', null, 1).ok && E.withdrawCapLeft(M) === num(rankDef('officer').withdrawCap, 40) - 1, 'officer withdraw + daily cap');
  const mem = M.crew.members.find((x) => x.rank === 'member'); assert(E.setMemberRank(M, mem.id, 'recruit').ok && !E.setMemberRank(M, M.crew.members[0].id, 'member').ok, 'manage roles');
  say('crew permissions');
  // --- debrief gap -> requisition
  const G = fresh(); G.crew.members.forEach((x) => { x.pf = 0.4; x.basePf = 0.4; x.food = 0; }); G.crew.treasury.coin = 500;
  r = E.startRaidNow(G); const gap = r.recap.debrief.gaps[0];
  assert(gap && gap.suggestion && gap.suggestion.itemId, 'debrief reports a gap');
  const gr = E.requisitionFromGap(G, gap.id, true); assert(gr.ok && gr.req && gr.req.source === 'debrief', 'gap -> requisition');
  // --- offline across a raid window
  const O = fresh(); E.devSetClock(O, 'friday'); O.raid.resolvedWeek = O.week - 1;
  O.clock.offsetMs += (E.raidWindow(O).start - E.now(O)) + 3600000; O.lastSeen = ctx.now() - 3600 * 1000;
  const off = E.applyOffline(O, ctx.now()); assert(off.summary.raids.length === 1 && O.raid.resolvedWeek === O.week, 'offline progress resolves the weekend raid');
  // --- farm raids
  const F = fresh(); kit(F, ['iron_longsword']); F.raid.ladder = 1; ensureV4(F);
  const fr = E.farmRaids(F); if (fr.allowed) { r = E.runFarmRaid(F, bosses()[0].id); assert(r.ok && E.farmRaids(F).runsLeft === fr.runsLeft - 1, 'farm raid'); }
  say('debrief gap, offline raid, farm raid');
  // --- QA-04: tier, share and tickets agree and use the carried-over share
  const T = fresh(); kit(T, ['iron_longsword', 'studded_jerkin']); addItem(T, 'herb_trout', 2, 20); E.packPouch(T, 'herb_trout', 20); E.setRaidPlan(T, { role: 'striker' });
  const tr = curRecord(T); tr.hpLeft = Math.round(tr.maxHp * 0.95);
  const t1 = E.startRaidNow(T).recap; curRecord(T).hpLeft = 1;
  const t2 = E.startRaidNow(T).recap;
  [t1, t2].forEach((rc) => {
    const exp = rc.tiers.list.filter((x) => rc.contribution.share >= x.share - 1e-12).map((x) => x.tier).pop() || 'none';
    assert(rc.tier === exp, 'tier from carried share');
    const tk = cfg().tierTickets; const bd = rc.cores.breakdown;
    assert(bd.floor === num(tk.floor, 1) && bd.tier === num(tk[rc.tier], 0) && rc.cores.tickets === bd.floor + bd.tier + bd.tokens && rc.payout.tier.tier === rc.tier && rc.cores.tier === rc.tier, 'tickets breakdown matches tier');
  });
  assert(t2.won && t2.bossId === t1.bossId && t2.tierBasis === 'carried' && /carried over/.test(t2.tierLabel) && Math.abs(t2.contribution.share - (t1.contribution.weekPoints + t2.contribution.weekPoints) / t2.contribution.totalPoints) < 1e-9, 'carried basis on weekend 2');
  // --- QA-08: event times fall inside the window, also for Start raid now
  [t1, t2].forEach((rc) => {
    const all = rc.moments.map((x) => x.at).concat(rc.bestMoment ? [rc.bestMoment.at] : []).concat((rc.timeline || []).map((f) => f.at));
    assert(all.length && all.every((x) => x >= rc.windowStart && x <= rc.windowEnd) && rc.startedAt >= rc.windowStart, 'recap times inside the raid window');
    const st = new Date(rc.startedAt); assert(st.getDay() === 6 || st.getDay() === 0, 'fight starts on the weekend');
  });
  // --- QA-07: clock shows the done state after a Start raid now run
  const ckd = E.clock(T); assert(ckd.raidDone && !ckd.live && /^Week \d+ · Raid done · next in /.test(ckd.label) && ckd.nextRaidStart > ckd.now && ckd.ms === ckd.nextRaidStart - ckd.now, 'clock done state: ' + ckd.label);
  assert(E.raidStatus(T).phase === 'done' && E.raidStatus(T).fightPct === 1, 'instant raid status done');
  // --- QA-05: each debrief check has one state
  [t1, t2].forEach((rc) => { assert(rc.debrief.checks.length === 5 && rc.debrief.checks.every((x) => (x.state === 'gap') === rc.debrief.gaps.some((g) => g.check === x.id)) && rc.debrief.gaps.every((g) => g.check !== 'food' || g.pct < 0.85), 'one state per check'); });
  // --- QA-03: coin requisition without free coin fails unless coin-free
  const G2 = fresh(); G2.crew.members.forEach((x) => { x.food = 0; x.potions = 0; }); const gp = E.startRaidNow(G2).recap.debrief.gaps[0];
  assert(gp, 'starved crew shows a gap');
  G2.crew.treasury.coin = 0;
  const no = E.requisitionFromGap(G2, gp.id, true); assert(!no.ok && /coin-free/.test(no.reason) && !no.draft.affordable, 'gap post refused without coin');
  const yes = E.requisitionFromGap(G2, gp.id, true, { coinFree: true }); assert(yes.ok && yes.req.rewardPer === 0 && yes.req.escrow === 0, 'explicit coin-free post');
  // --- QA-26: stable roster across loads and views
  const R1 = fresh(); const ids1 = E.crewMembers(R1).map((x) => x.id + ':' + x.seed).join();
  E.setViewAsMember(R1, true); const ids2 = E.crewMembers(R1).map((x) => x.id + ':' + x.seed).join(); E.setViewAsMember(R1, false);
  assert(ids1 === ids2 && E.crewMembers(migrate(clone(R1))).map((x) => x.id + ':' + x.seed).join() === ids1, 'roster stable');
  const v3r = clone(R1); v3r.v = 1; ['clock', 'server', 'loadouts', 'economy'].forEach((k) => delete v3r[k]);
  v3r.crew = { name: 'C', members: R1.crew.members.slice(0, 4).map((x) => ({ name: x.name, skill: x.skill })), jobs: [], nextPostIn: 30 };
  const sig = (st) => st.crew.members.map((x) => x.name + x.seed + x.basePf).join();
  assert(sig(migrate(clone(v3r))) === sig(migrate(clone(v3r))), 'v3 roster fill deterministic');
  // --- coverage: sealed pouch blocks crafting; aura weakening per wave
  const B = fresh(); addItem(B, 'minnow', 1, 10); addItem(B, 'grilled_minnows', 1, 2); E.packPouch(B, 'grilled_minnows', 2); E.lockIn(B);
  assert(E.canStart(B, 'grill_minnows').ok, 'weekday crafting allowed while locked');
  B.clock.offsetMs += E.raidWindow(B).start - E.now(B) + 60000;
  const pbr = E.canStart(B, 'grill_minnows'); assert(!pbr.ok && pbr.pouchBlocked, 'mid-raid consumable crafting blocked');
  const aw = t2.checks.concat(t1.checks); assert(aw.every((x) => isFinite(x.auraTier) && isFinite(x.auraTierMin) && x.auraTierMin <= x.auraTier && isFinite(x.auraLoss) && typeof x.auraWeakened === 'boolean'), 'aura weakening per wave');
  say('QA-03/04/05/07/08/26 + pouch block + aura weakening');
}
