// Scripted scenarios shared by the fixture recorder (legacy build) and the parity test
// (TypeScript engine). Each scenario only talks to the engine through its public API plus
// plain state edits that a save file could contain, so both engines see the same calls in
// the same order. `t` provides: E, now(), advance(ms), storage, step(label, payload).

const TICK = 0.25;
const H = 3600 * 1000;

export const give = (s, id, grade, qty) => {
  if (!Array.isArray(s.inv[id])) s.inv[id] = [0, 0, 0, 0, 0];
  s.inv[id][grade] += qty;
};
const setLevel = (E, s, skill, lvl) => { s.skills[skill].xp = Math.max(s.skills[skill].xp, E.xpForLevel(lvl)); };

function summarize(evs) {
  const byType = {};
  evs.forEach((e) => { byType[e.type] = (byType[e.type] || 0) + 1; });
  return { count: evs.length, byType, head: evs.slice(0, 25), tail: evs.slice(-10) };
}
// tick in 0.25 s steps and move the fake clock with it, like the UI's frame loop
function tickFor(t, s, sec, until) {
  const evs = []; let el = 0;
  while (el < sec) {
    E_tick(t, s).forEach((e) => evs.push(e));
    el += TICK;
    if (until && until(evs, s)) break;
  }
  return { seconds: el, events: summarize(evs), all: evs };
}
function E_tick(t, s) { const ev = t.E.tick(s, TICK, { visible: true }); t.advance(TICK * 1000); return ev; }
const evOut = (r) => ({ seconds: r.seconds, events: r.events });

export const scenarios = [
  {
    name: 'new-state', seed: 101,
    run(t) {
      const { E } = t; const s = E.newState();
      t.step('newState', { state: s });
      t.step('views', { result: { stats: E.playerStats(s), inv: E.inventoryList(s), clock: E.clock(s), ladder: E.ladder(s), crew: E.crewMembers(s), boss: E.currentBoss(s), intel: E.bossIntel(s), badges: E.badges(s), status: E.raidStatus(s), defaultTab: E.defaultTab(s), fmt: [E.fmt(1234), E.fmt(2.5e6), E.fmtTime(252), E.fmtTime(7500)], xp: [E.xpForLevel(2), E.xpForLevel(50), E.levelFor(1e6)] }, state: s });
    },
  },
  {
    name: 'gather-ticks', seed: 202,
    run(t) {
      const { E } = t; const s = E.newState();
      t.step('start mine_copper', { result: E.start(s, 'mine_copper'), state: s });
      t.step('tick 30s', { result: evOut(tickFor(t, s, 30)), state: s });
      t.step('tick 120s (market refresh)', { result: evOut(tickFor(t, s, 120)), state: s });
      t.step('tick 600s', { result: evOut(tickFor(t, s, 600)), state: s });
      t.step('estimates', { result: { est: E.gatherEstimate(s, 'copper_ore'), prog: E.skillProgress(s, 'mining'), time: E.actionTime(s, 'mine_copper'), info: E.activeInfo(s), locked: E.canStart(s, 'mine_iron') }, state: s });
      t.step('switch to pick_mint', { result: E.start(s, 'pick_mint'), state: s });
      t.step('tick 300s hidden', { result: (() => { const evs = []; for (let i = 0; i < 1200; i++) { E.tick(s, TICK, { visible: false }).forEach((e) => evs.push(e)); t.advance(250); } return summarize(evs); })(), state: s });
      t.step('stop', { result: E.stop(s), state: s });
    },
  },
  {
    name: 'offline', seed: 303,
    run(t) {
      const { E } = t; const s = E.newState();
      E.start(s, 'mine_copper'); E.save(s);
      t.step('saved', { result: t.storage.getItem('guildwright-proto-v1') !== null, state: s });
      t.advance(1 * H);
      t.step('offline 1h', { result: E.applyOffline(s, t.now()), state: s });
      t.advance(13 * H);
      t.step('offline 13h (capped)', { result: E.applyOffline(s, t.now()), state: s });
      t.step('offline 0s', { result: E.applyOffline(s, t.now()), state: s });
      give(s, 'copper_ore', 1, 40); E.start(s, 'smelt_copper');
      t.advance(1 * H);
      t.step('offline refine 1h', { result: E.applyOffline(s, t.now()), state: s });
      E.start(s, 'fight_wolfwood');
      t.advance(2 * H);
      t.step('offline combat 2h', { result: E.applyOffline(s, t.now()), state: s });
      const job = E.postCrewJob(s, 'smelt_copper'); if (job) job.qty = 40;
      t.step('assist job', { result: job ? E.assist(s, job.id) : null, state: s });
      t.advance(1 * H);
      t.step('offline assist 1h', { result: E.applyOffline(s, t.now()), state: s });
    },
  },
  {
    name: 'craft', seed: 404,
    run(t) {
      const { E } = t; const s = E.newState();
      give(s, 'copper_ore', 1, 40);
      t.step('start smelt_copper', { result: E.start(s, 'smelt_copper'), state: s });
      t.step('refine until out', { result: evOut(tickFor(t, s, 3600, () => !s.active)), state: s });
      give(s, 'copper_bar', 2, 50); give(s, 'pine_plank', 2, 50);
      t.step('odds', { result: { odds: E.procOdds(s, 'training_sword'), max: E.maxRepeats(s, 'training_sword'), gear: E.isGearCraft('training_sword') }, state: s });
      t.step('start training_sword', { result: E.start(s, 'training_sword'), state: s });
      const r = tickFor(t, s, 20000, () => !s.active);
      t.step('craft 50 (pity)', { result: { seconds: r.seconds, events: r.events, crafts: r.all.filter((e) => e.type === 'craft').map((e) => [e.rarity, e.grade, e.pity, e.uid]) }, state: s });
      give(s, 'mint_leaf', 2, 30); give(s, 'mint_leaf', 4, 6);
      E.start(s, 'mint_tonic');
      t.step('alchemy until out', { result: evOut(tickFor(t, s, 3600, () => !s.active)), state: s });
      const fc = E.fuseCandidates(s);
      t.step('fuse', { result: { fc, fuse: fc.length ? E.fuse(s, fc[0].itemId) : null }, state: s });
      const loose = s.gear.filter((g) => !Object.values(s.equipped).includes(g.uid));
      t.step('salvage', { result: loose.length ? E.salvage(s, loose[0].uid) : null, state: s });
      t.step('names + values', { result: s.gear.map((g) => [E.gearName(g), E.gearValue(g), E.gearStats(g), E.gearTags(g)]), state: s });
    },
  },
  {
    name: 'gear-loadouts', seed: 505,
    run(t) {
      const { E } = t; const s = E.newState();
      [['smithing', 8], ['leatherworking', 8], ['tailoring', 4], ['woodworking', 1]].forEach(([k, l]) => setLevel(E, s, k, l));
      const mats = { copper_bar: 40, pine_plank: 40, rough_leather: 40, copper_rivet: 80, linen_thread: 40, linen_cloth: 20, bronze_bar: 30 };
      Object.keys(mats).forEach((id) => give(s, id, 2, mats[id]));
      const batch = (id, n) => { E.start(s, id); const r = tickFor(t, s, 20000, (e) => e.filter((x) => x.type === 'craft').length >= n || !s.active); E.stop(s); return evOut(r); };
      t.step('craft kit', { result: ['bronze_sword', 'leather_cap', 'leather_jerkin', 'leather_breeches', 'foragers_satchel', 'pine_buckler'].map((id) => batch(id, 2)), state: s });
      const g = (itemId) => s.gear.find((x) => x.itemId === itemId);
      t.step('equip', { result: ['bronze_sword', 'leather_cap', 'leather_jerkin', 'leather_breeches'].map((id) => E.equip(s, g(id).uid)), state: s });
      t.step('compare + stats', { result: { cmp: E.compareGear(s, g('pine_buckler').uid), stats: E.playerStats(s), roles: E.raidRoles().map((r) => [r.id, E.rolePower(s, r.id), E.roleCheck(s, r.id)]), tags: E.statTags(), bonus: E.skillBonus(s, 'herbalism') }, state: s });
      t.step('unequip head', { result: E.unequip(s, 'head'), state: s });
      t.step('save current', { result: E.saveLoadout(s, { name: 'Current', fromEquipped: true }), state: s });
      const ab = E.autoBuild(s, 'foraging', { save: true, name: 'Forager' });
      t.step('autoBuild foraging', { result: ab, state: s });
      t.step('compare loadout', { result: ab.loadout ? E.compareLoadout(s, ab.loadout.id) : null, state: s });
      t.step('bind herbalism', { result: ab.loadout ? E.bindLoadout(s, ab.loadout.id, 'herbalism') : null, state: s });
      t.step('start pick_mint (bound)', { result: E.start(s, 'pick_mint'), state: s });
      t.step('loadouts view', { result: { list: E.loadouts(s), stats: E.loadoutStats(s, 'equipped'), bound: E.boundLoadout(s, 'herbalism') }, state: s });
      E.stop(s);
      const first = E.loadouts(s)[0];
      t.step('equipLoadout first', { result: E.equipLoadout(s, first.id), state: s });
      const w = s.gear.find((x) => x.uid === s.equipped.weapon); w.dur = 3;
      t.step('repair', { result: { cost: E.repairCost(s, w.uid), r: E.repair(s, w.uid) }, state: s });
      t.step('delete loadout', { result: E.deleteLoadout(s, first.id), state: s });
      s.hp = 10;
      t.step('eat bread', { result: E.eat(s, 'bread'), state: s });
    },
  },
  {
    name: 'market', seed: 606,
    run(t) {
      const { E } = t; const s = E.newState(); s.gold = 5000;
      t.step('refresh', { result: E.refreshMarket(s), state: s });
      const l0 = s.market.listings[0]; const l1 = s.market.listings[1];
      t.step('buy 1', { result: E.buy(s, l0.id, 1), state: s });
      t.step('buy too many', { result: E.buy(s, l1.id, 99999), state: s });
      give(s, 'copper_ore', 1, 50); give(s, 'mint_leaf', 3, 10);
      t.step('list cheap', { result: E.list(s, 'copper_ore', 1, 20, 1), state: s });
      t.step('list dear', { result: E.list(s, 'mint_leaf', 3, 10, 9999), state: s });
      t.step('list too many', { result: E.list(s, 'copper_ore', 1, 999999, 1), state: s });
      t.step('tick 600s fills', { result: evOut(tickFor(t, s, 600)), state: s });
      const mine = s.market.mine[0];
      t.step('cancel', { result: mine ? E.cancelListing(s, mine.id) : null, state: s });
      t.step('pricing', { result: { tax: E.marketTax(s), v: ['copper_ore', 'copper_bar', 'training_sword', 'mint_tonic', 'bread'].map((id) => [0, 1, 2, 3, 4].map((gr) => E.itemValue(id, gr))) }, state: s });
    },
  },
  {
    name: 'crew', seed: 707,
    run(t) {
      const { E } = t; const s = E.newState(); s.raid.resolvedWeek = s.week - 1;
      t.step('jobs', { result: E.crewJobs(s), state: s });
      setLevel(E, s, 'smithing', 1);
      const job = E.postCrewJob(s, 'training_sword'); job.qty = 6;
      t.step('assist', { result: { can: E.canAssist(s, job.id), r: E.assist(s, job.id), info: E.activeInfo(s) }, state: s });
      t.step('assist until done', { result: evOut(tickFor(t, s, 900, (e) => e.some((x) => x.type === 'jobDone' && x.jobId === job.id))), state: s });
      s.crew.treasury.coin = 300;
      const rq = E.postRequisition(s, { itemId: 'mint_tonic', qty: 10, rewardPer: 5, minGrade: 1 });
      t.step('post requisition', { result: rq, state: s });
      t.step('post too big', { result: E.postRequisition(s, { itemId: 'bread', qty: 500, rewardPer: 5 }), state: s });
      give(s, 'mint_tonic', 2, 6);
      t.step('fill requisition', { result: rq.ok ? E.fillRequisition(s, rq.req.id, 4) : null, state: s });
      t.step('crew econ 300s', { result: evOut(tickFor(t, s, 300)), state: s });
      const rq2 = E.postRequisition(s, { itemId: 'bread', qty: 4, rewardPer: 2, minGrade: 0 });
      t.step('cancel requisition', { result: rq2.ok ? E.cancelRequisition(s, rq2.req.id) : rq2, state: s });
      t.step('vault deposit', { result: E.vaultDeposit(s, 'bread', 1, 5), state: s });
      t.step('vault withdraw', { result: E.vaultWithdraw(s, 'bread', 1, 2), state: s });
      E.setViewAsMember(s, true);
      t.step('member view', { result: { can: E.can(s, 'withdraw'), w: E.vaultWithdraw(s, 'bread', 1, 1), req: E.requestWithdrawal(s, { itemId: 'bread', qty: 2 }) }, state: s });
      t.step('officer answers', { result: evOut(tickFor(t, s, 200)), state: s });
      E.setViewAsMember(s, false);
      const mem = s.crew.members.find((x) => x.rank === 'member');
      t.step('ranks', { result: { a: mem ? E.setMemberRank(s, mem.id, 'recruit') : null, b: E.setMemberRank(s, s.crew.members[0].id, 'member'), cap: E.withdrawCapLeft(s) }, state: s });
      t.step('views', { result: { treasury: E.treasury(s), reqs: E.requisitions(s), needed: E.neededByCrew(s), feed: E.crewFeed(s), vault: E.vault(s), economy: E.economy(s), ranks: E.crewRanks(), readiness: E.crewReadiness(s) }, state: s });
    },
  },
  {
    name: 'supply', seed: 808,
    run(t) {
      const { E } = t; const s = E.newState();
      const req = s.supply.requests[0]; give(s, req.itemId, 0, 300);
      t.step('quote', { result: [10, 50, 60, 200, 300].map((q) => E.supplyQuote(s, req.itemId, q)), state: s });
      t.step('donate 60', { result: E.donate(s, req.itemId, 60), state: s });
      t.step('quote after', { result: E.supplyQuote(s, req.itemId, 10), state: s });
      t.step('donate 200', { result: E.donate(s, req.itemId, 200), state: s });
      t.step('donate missing', { result: E.donate(s, 'nonexistent_item', 1), state: s });
    },
  },
  {
    name: 'weekly-clock', seed: 909,
    run(t) {
      const { E } = t; const s = E.newState();
      t.step('clock monday', { result: { c: E.clock(s), w: E.raidWindow(s), wk: E.weekNumber(s), live: E.isRaidWindow(s) }, state: s });
      t.step('dev friday', { result: E.devSetClock(s, 'friday'), state: s });
      t.step('clock friday', { result: E.clock(s), state: s });
      t.step('dev raid', { result: E.devSetClock(s, 'raid'), state: s });
      t.step('raid tick 60s', { result: evOut(tickFor(t, s, 60)), state: s });
      t.step('raid status', { result: { st: E.raidStatus(s), c: E.clock(s), recap: E.lastRecap(s) }, state: s });
      t.step('dev nextWeek', { result: E.devSetClock(s, 'nextWeek'), state: s });
      t.step('dev reset', { result: E.devSetClock(s, 'reset'), state: s });
      t.step('dev bogus', { result: E.devSetClock(s, 'bogus'), state: s });
      // real (fake-clock) time across a whole week, live ticks near Monday 00:00
      const w = E.raidWindow(s); t.advance(w.end - E.now(s) + 6 * H);
      t.step('after window (sunday night)', { result: evOut(tickFor(t, s, 10)), state: s });
      E.save(s);
      t.advance(3 * 24 * H);
      t.step('offline over monday', { result: E.applyOffline(s, t.now()), state: s });
      t.step('clock after', { result: { c: E.clock(s), wk: E.weekNumber(s), buff: E.weekBuff(s) }, state: s });
    },
  },
  {
    name: 'raid', seed: 1010,
    run(t) {
      const { E } = t; const s = E.newState(); s.raid.resolvedWeek = s.week - 1;
      give(s, 'bread', 1, 12); give(s, 'mint_tonic', 2, 6); give(s, 'grilled_minnows', 1, 8);
      t.step('pack pouch', { result: [E.packPouch(s, 'bread', 6), E.packPouch(s, 'copper_ore', 1), E.packPouch(s, 'mint_tonic', 3, 2), E.unpackPouch(s, 'bread', 2), E.autoPackPouch(s)], state: s });
      t.step('plan + rules', { result: [E.setRaidPlan(s, { role: 'striker' }), E.setRaidRules(s, { eatAt: 0.9, stance: 'aggressive', tactic: 'focus', tokens: 9999 }), E.raidPlan(s)], state: s });
      t.step('previews', { result: { pv: E.raidPreview(s), proj: E.projectRaid(s), odds: E.coreOdds(s), tiers: E.tierThresholds(s), flags: E.readinessFlags(s), ready: E.crewReadiness(s), pouch: E.pouch(s) }, state: s });
      t.step('lock in', { result: { r: E.lockIn(s), sum: E.lockSummary(s), blocked: E.setRaidPlan(s, { role: 'mender' }) }, state: s });
      const w = E.raidWindow(s); t.advance(w.start - E.now(s) + 60000);
      t.step('window opens (tick)', { result: evOut(tickFor(t, s, 5)), state: s });
      t.step('mid raid', { result: { st: E.raidStatus(s), c: E.clock(s) }, state: s });
      t.advance(20 * H);
      t.step('later in window', { result: evOut(tickFor(t, s, 5)), state: s });
      const rc = E.lastRecap(s);
      t.step('recap seen', { result: { seen: rc ? E.markRecapSeen(s, rc.id) : null, lb: E.leaderboards(s), recaps: E.recaps(s).length }, state: s });
      t.step('startRaidNow (next week)', { result: E.startRaidNow(s), state: s });
      t.step('runRaid again', { result: E.runRaid(s), state: s });
      // lottery with pity: boss at 1 hp, pity maxed
      E.devSetClock(s, 'nextWeek');
      const boss = E.currentBoss(s); s.raid.bosses[boss.id].hpLeft = 1; s.raid.corePity = 3;
      t.step('core odds pity', { result: E.coreOdds(s), state: s });
      t.step('kill + core lottery', { result: E.startRaidNow(s), state: s });
      t.step('ladder after kill', { result: { ladder: E.ladder(s), intel: E.bossIntel(s), buff: E.weekBuff(s), pending: s.server.pendingBuff }, state: s });
      t.step('next week buff', { result: { r: E.devSetClock(s, 'nextWeek'), buff: E.weekBuff(s), tax: E.marketTax(s) }, state: s });
      const fr = E.farmRaids(s);
      t.step('farm raid', { result: { fr, run: fr.allowed ? E.runFarmRaid(s, fr.bosses[0].bossId) : null }, state: s });
      s.crew.members.forEach((x) => { x.pf = 0.4; x.basePf = 0.4; x.food = 0; x.potions = 0; }); s.crew.treasury.coin = 500;
      const weak = E.startRaidNow(s);
      t.step('starved crew raid', { result: weak, state: s });
      const gap = weak.recap && weak.recap.debrief.gaps[0];
      t.step('gap -> requisition', { result: gap ? E.requisitionFromGap(s, gap.id, true) : null, state: s });
    },
  },
  {
    name: 'migrate', seed: 1111,
    run(t) {
      const { E } = t; const clone = (x) => JSON.parse(JSON.stringify(x));
      const s = E.newState(); E.start(s, 'mine_copper');
      tickFor(t, s, 30);
      const v1 = clone(s); delete v1.crew; v1.active = { actionId: 'mine_copper', progress: 1 };
      t.step('v1 save', { result: E.migrate(clone(v1)) });
      const v1b = clone(s); delete v1b.crew; v1b.active = { actionId: 'training_sword', progress: 0, jobId: 'gone' };
      t.step('v1 stale job', { result: E.migrate(v1b) });
      const s0 = E.newState(); s0.week = 5; s0.tokens = 3;
      const v3 = clone(s0); v3.v = 1;
      ['clock', 'server', 'loadouts', 'economy'].forEach((k) => delete v3[k]);
      v3.raid = { ladder: 1, bossHp: 2400000, rules: { eatAt: 0.6, stance: 'defensive', tactic: 'interrupt', tokens: 2 }, last: { won: false, damage: 10 } };
      v3.crew = { name: 'Old crew', members: s0.crew.members.slice(0, 4).map((m) => ({ name: m.name, skill: m.skill })), jobs: s0.crew.jobs, nextPostIn: 30 };
      const m3 = E.migrate(clone(v3));
      t.step('v3 save', { result: m3 });
      t.step('v4 round trip', { result: E.migrate(clone(m3)) });
      t.step('corrupt', { result: [E.migrate({ junk: true }), E.migrate(null), E.migrate({ v: 99 })] });
      E.save(s);
      t.step('save', { result: t.storage.getItem('guildwright-proto-v1'), state: s });
      t.advance(60000);
      t.step('load', { result: E.load() });
      t.step('reset', { result: { fresh: E.reset(), stored: t.storage.getItem('guildwright-proto-v1') } });
      t.step('load empty', { result: E.load() });
    },
  },
];
