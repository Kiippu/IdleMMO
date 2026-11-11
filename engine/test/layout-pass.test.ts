// Phase 3 step 1 (layout pass, 2026-11-11): engine data the new screens need. Additive only.
import { describe, expect, it } from 'vitest';
import { freshEngine, START, DAY } from './engine-helpers';


async function away(ms: number, setup: (E: any, s: any) => void, seed = 1) {
  const h = await freshEngine(seed);
  const s = h.E.newState();
  s.lastSeen = h.now();
  setup(h.E, s);
  h.advance(ms);
  const r = h.E.applyOffline(s, h.now());
  return { h, E: h.E, s, r };
}

describe('return moment: offline summary extras', () => {
  it('headline per skill with levels before/after and newly unlocked actions', async () => {
    const { E, s, r } = await away(6 * 3600000, (E, s) => E.start(s, 'mine_copper'));
    const m = r.summary.skills.find((x: any) => x.skill === 'mining');
    expect(m.from).toBe(1);
    expect(m.to).toBe(E.skillLevel(s, 'mining'));
    expect(m.to).toBeGreaterThan(1);
    const expected = E.actionsFor('mining').filter((a: any) => a.level > 1 && a.level <= m.to).map((a: any) => a.id);
    expect(m.unlocked).toEqual(expected);
    expect(m.unlockedCount).toBe(expected.length);
    expect(m.headline).toContain(`Mining 1 → ${m.to}`);
    if (expected.length) expect(m.headline).toMatch(/new nodes? unlocked/);
    expect(m.xp).toBe(r.summary.xp.mining);
  });

  it('loot grouped by item with per-grade totals that match summary.items; a best find', async () => {
    const { r } = await away(6 * 3600000, (E, s) => E.start(s, 'mine_copper'));
    const { loot, bestFind, items } = r.summary;
    expect(loot.length).toBeGreaterThan(0);
    for (const l of loot) {
      expect(l.qty).toBe(l.byGrade.reduce((a: number, b: number) => a + b, 0));
      expect(l.qty).toBe(items[l.itemId]);
      expect(l.value).toBeGreaterThan(0);
    }
    for (let i = 1; i < loot.length; i++) expect(loot[i - 1].value).toBeGreaterThanOrEqual(loot[i].value);
    expect(bestFind).not.toBeNull();
    expect(loot.some((l: any) => l.itemId === bestFind.itemId)).toBe(true);
    expect(bestFind.qty).toBeGreaterThan(0);
  });

  it('gold by source adds up to the net gold, raid payout separated over a week', async () => {
    const { r } = await away(7 * DAY, (E, s) => E.start(s, 'mine_copper'));
    const sum = r.summary.goldBySource.reduce((a: number, g: any) => a + g.gold, 0);
    expect(sum).toBe(r.summary.gold);
    const raid = r.summary.goldBySource.find((g: any) => g.source === 'raid');
    expect(raid.label).toBe('Raid payout');
    expect(raid.gold).toBeGreaterThan(0);
    // raid floor/chest loot shows up in the grouped loot with raidQty; summary.items keeps action loot only
    expect(r.summary.loot.some((l: any) => l.raidQty > 0)).toBe(true);
    for (const l of r.summary.loot) expect(l.qty - l.raidQty).toBe(r.summary.items[l.itemId] ?? 0);
  });

  it('combat gold is tagged as fighting', async () => {
    const { E, r } = await away(2 * 3600000, (E, s) => {
      const act = E.actionsFor('striker')[0];
      const ok = E.start(s, act.id);
      expect(ok.ok).toBe(true);
    });
    const combat = r.summary.goldBySource.find((g: any) => g.source === 'combat');
    expect(combat && combat.gold).toBeGreaterThan(0);
    void E;
  });

  it('short gaps keep the same summary shape', async () => {
    const h = await freshEngine(1);
    const s = h.E.newState(); s.lastSeen = h.now();
    const r = h.E.applyOffline(s, h.now());
    expect(r.summary.skills).toEqual([]);
    expect(r.summary.bestFind).toBeNull();
    expect(r.summary.loot).toEqual([]);
    expect(r.summary.goldBySource).toEqual([]);
  });
});

describe('level-ups roll into one log line per skill', () => {
  it('many level-ups in one tick → one line with from → to', async () => {
    const h = await freshEngine(1);
    const s = h.E.newState();
    h.E.start(s, 'mine_copper');
    const ev = h.E.tick(s, 3600);
    const ups = ev.filter((e: any) => e.type === 'levelup' && e.skill === 'mining');
    expect(ups.length).toBeGreaterThan(1);
    expect(ups[0].from).toBe(1);
    const lines = h.E.events(s, 200).filter((e: any) => e.cat === 'skill');
    expect(lines.length).toBe(1);
    const to = h.E.skillLevel(s, 'mining');
    expect(lines[0]).toMatchObject({ skill: 'mining', from: 1, level: to });
    expect(lines[0].text).toBe(`Mining levelled up 1 → ${to}.`);
  });

  it('a single level keeps the old wording; the next tick gets its own line', async () => {
    const h = await freshEngine(1);
    const s = h.E.newState();
    h.E.start(s, 'mine_copper');
    let guard = 0;
    while (h.E.skillLevel(s, 'mining') < 2 && guard++ < 10000) h.E.tick(s, 1);
    const lines = h.E.events(s, 200).filter((e: any) => e.cat === 'skill');
    expect(lines.length).toBe(1);
    expect(lines[0].text).toBe('Mining reached level 2.');
    expect(lines[0]).toMatchObject({ skill: 'mining', from: 1, level: 2 });
  });

  it('offline catch-up writes one line per skill', async () => {
    const { E, s } = await away(6 * 3600000, (E, s) => E.start(s, 'mine_copper'));
    const lines = E.events(s, 200).filter((e: any) => e.cat === 'skill');
    expect(lines.length).toBe(1);
    expect(lines[0].from).toBe(1);
    expect(lines[0].level).toBe(E.skillLevel(s, 'mining'));
  });
});

describe('raid recap view', () => {
  it('turnout pay + contribution pay − cap cut = gold; chest loot as ids + qty; a next-week hint', async () => {
    const { E, s } = await away(7 * DAY, (E, s) => E.start(s, 'mine_copper'));
    const recap = E.lastRecap(s);
    const v = E.recapView(s);
    expect(v.id).toBe(recap.id);
    expect(v.pay.hasSplit).toBe(true);
    expect(v.pay.gold).toBe(recap.payout.gold);
    expect(v.pay.turnoutPay + v.pay.contributionPay - v.pay.capCut).toBe(v.pay.gold);
    expect(v.pay.turnoutPay).toBeGreaterThan(0);
    expect(v.pay.pointShare).toBe(recap.payout.split.pointShare);
    expect(v.pay.crewTreasury).toBe(recap.payout.crewGold);
    expect(v.pay.treasuryShare + v.pay.capCut).toBe(v.pay.crewTreasury);
    const rawChest = recap.payout.chests.flatMap((c: any) => c.items).reduce((a: number, x: any) => a + x.qty, 0);
    expect(v.chestLoot.reduce((a: number, x: any) => a + x.qty, 0)).toBe(rawChest);
    expect(v.chests.length).toBe(recap.payout.chests.length);
    for (const x of v.loot) { expect(typeof x.itemId).toBe('string'); expect(x.qty).toBeGreaterThan(0); }
    expect(new Set(v.loot.map((x: any) => x.itemId)).size).toBe(v.loot.length);
    expect(v.nextWeekHint).toEqual(v.hints[0] ?? null);
    expect(E.derivedExtras(s).lastRecapView.id).toBe(recap.id);
  });

  it('cap overflow shows as capCut; old recaps without a split still read', async () => {
    const h = await freshEngine(1);
    const s = h.E.newState();
    s.raid.recaps = [{ id: 'R1', week: 1, joined: true, won: false, faints: 2, contribution: { weekShare: 0 },
      tiers: { list: [{ tier: 'bronze', share: 0.01, label: 'Bronze', pctText: '1.00%' }] },
      debrief: { gaps: [{ check: 'healing', text: 'Healing ran dry by wave 2', suggestion: { itemId: 'mint_tonic' } }] },
      payout: { gold: 900, pool: 5000, crewGold: 400, chests: [{ at: 0.25, items: [{ itemId: 'coal', grade: 1, qty: 3 }, { itemId: 'coal', grade: 2, qty: 2 }] }], items: [] } }];
    const v = h.E.recapView(s, 'R1');
    expect(v.pay).toMatchObject({ gold: 900, turnoutPay: 900, contributionPay: 0, capCut: 0, hasSplit: false, pointShare: null });
    expect(v.chestLoot).toEqual([{ itemId: 'coal', name: 'Coal', qty: 5, rarity: expect.any(String) }]);
    expect(v.hints.map((x: any) => x.kind)).toEqual(['survive', 'tier', 'crew']);
    expect(v.hints[1].text).toBe('Take part in more checks next weekend to reach Bronze.');
    expect(v.hints[2].text).toBe('The crew was short: healing ran dry by wave 2. Hand in Mint tonic on Contracts.');
    for (const x of v.hints) expect(x.text).not.toMatch(/\d\.\d{2,}%/);
    expect(v.tierLabel).toBe('No tier yet');
    s.raid.recaps[0].contribution.weekShare = 0.0025; // a quarter of the way to Bronze
    expect(h.E.recapView(s).hints[1].text).toBe('Help fill more checks next weekend to reach Bronze (you got 25% of the way there).');
    s.raid.recaps[0].payout.split = { floor: 1000, byContribution: 3000, pointShare: 0.4, uncapped: 4000, cap: 2500, cutToTreasury: 1500 };
    s.raid.recaps[0].payout.gold = 2500;
    const v2 = h.E.recapView(s);
    expect(v2.pay).toMatchObject({ turnoutPay: 1000, contributionPay: 3000, capCut: 1500, capped: true, gold: 2500, pointShareText: '40%' });
    s.raid.recaps[0].payout.crewContribution = 0.77;
    const v3 = h.E.recapView(s);
    expect(v3.pay.crewContribution).toBe(0.77);
    expect(v3.pay.crewContributionText).toBe('Crew filled 77% of what the raid needed');
    expect(v3.pay.pointShareLabel).toBe("Your part of the crew's points: 40%");
  });

  it('a player who sat out gets the join hint', async () => {
    const h = await freshEngine(1);
    const s = h.E.newState();
    s.raid.recaps = [{ id: 'R2', week: 1, joined: false, payout: { gold: 0 } }];
    expect(h.E.recapView(s).nextWeekHint.kind).toBe('join');
    expect(h.E.recapView(s).tierLabel).toBe('Sat out');
    s.raid.recaps = [];
    expect(h.E.recapView(s)).toBeNull();
  });
});

describe('crew activity feed', () => {
  it('merges crew feed, finished crewmate jobs and your assists; newest first, no twins', async () => {
    const h = await freshEngine(1);
    const { E } = h;
    const s = E.newState();
    const job = E.crewJobs(s).find((j: any) => j.canAssist.ok);
    expect(job).toBeTruthy();
    E.assist(s, job.id);
    for (let i = 0; i < 4 * 3600 && (s.crew.jobsDone?.length ?? 0) < 3; i++) { h.advance(1000); E.tick(s, 1); }
    expect(s.crew.jobsDone.length).toBeGreaterThan(0);
    const act = E.crewActivity(s, 50);
    expect(act.length).toBeGreaterThan(0);
    for (let i = 1; i < act.length; i++) expect(act[i - 1].t).toBeGreaterThanOrEqual(act[i].t);
    expect(act.some((x: any) => x.kind === 'job')).toBe(true);
    const helped = s.crew.jobsDone.find((j: any) => j.assisted > 0);
    expect(helped).toBeTruthy();
    expect(act.some((x: any) => x.kind === 'job' && x.gold === helped.tip && /You helped with/.test(x.text))).toBe(true);
    expect(act.some((x: any) => /job is finished/.test(x.text))).toBe(false); // the event-log twin is dropped
    expect(act.some((x: any) => x.kind === 'assist')).toBe(true);
    // text never repeats the actor's name (QA: "Branka Branka finished ..."); full is the whole sentence
    for (const x of act) {
      expect(x.text.startsWith(x.who + ' ')).toBe(false);
      expect(x.full.includes(x.text.slice(1))).toBe(true);
    }
    const jobLine = act.find((x: any) => x.kind === 'job');
    expect(jobLine.text).toMatch(/^Finished \d+ /);
    expect(jobLine.full).toBe(`${jobLine.who} ${jobLine.text[0].toLowerCase()}${jobLine.text.slice(1)}`);
    expect(act.some((x: any) => /^Started helping/.test(x.text) && x.mine)).toBe(true);
    expect(E.crewActivity(s).length).toBeLessThanOrEqual(10);
    expect(E.derivedExtras(s).crewActivity.length).toBeLessThanOrEqual(10);
    // survives save + load (additive v6 field)
    E.save(s);
    const back = E.load();
    expect(back.crew.jobsDone.length).toBe(s.crew.jobsDone.length);
  });

  it('a contract hand-in shows once (from the crew feed)', async () => {
    const h = await freshEngine(1);
    const { E } = h;
    const s = E.newState();
    const k = E.listContracts(s).find((c: any) => c.status === 'open' && c.source === 'town');
    expect(k).toBeTruthy();
    s.inv[k.itemId] = [0, 0, 3, 0, 0];
    const r = E.fillContract(s, k.id, 3);
    expect(r.ok).toBe(true);
    const act = E.crewActivity(s, 50).filter((x: any) => x.text.includes('filled') || x.text.startsWith('Filled'));
    expect(act.filter((x: any) => x.mine).length).toBe(1);
    expect(act[0].kind).toBe('contract');
    expect(act[0].who).toBe('You');
    expect(act[0].text).toMatch(/^Filled 3 /);
    expect(act[0].full).toMatch(/^You filled 3 /);
    // a crewmate's feed line loses its leading name too
    s.crew.feed.unshift({ t: h.E.now(s), kind: 'contract', who: 'Branka', text: 'Branka filled 2 Coal for the crew, +10g.' });
    const b = h.E.crewActivity(s, 1)[0];
    expect(b).toMatchObject({ who: 'Branka', text: 'Filled 2 Coal for the crew, +10g.', full: 'Branka filled 2 Coal for the crew, +10g.' });
  });

  it('a reloaded v7 save gives every new view (and old saves are refused: see saves-v7.test.ts)', async () => {
    {
      const h = await freshEngine(3, START + 3600000);
      const s = h.E.migrate(JSON.parse(JSON.stringify(h.E.newState())));
      expect(s.v).toBe(7);
      expect(s.crew.jobsDone).toEqual([]);
      expect(Array.isArray(h.E.crewActivity(s))).toBe(true);
      const x = h.E.derivedExtras(s);
      expect(Array.isArray(x.sellList)).toBe(true);
      expect(x.disabledReasons).toBeTruthy();
      expect(x.lastRecapView === null || typeof x.lastRecapView.pay.gold === 'number').toBe(true);
      // and a catch-up from the fixture's own lastSeen still produces the return fields
      s.lastSeen = h.now(); h.advance(2 * 3600000);
      const r = h.E.applyOffline(s, h.now());
      expect(Array.isArray(r.summary.goldBySource)).toBe(true);
      expect(r.summary.goldBySource.reduce((a: number, g: any) => a + g.gold, 0)).toBe(r.summary.gold);
    }
  });
});

describe('shop sell list + sell all grades', () => {
  it('groups bag stacks by item with per-grade qty and value; sell all empties every grade', async () => {
    const h = await freshEngine(1);
    const { E } = h;
    const s = E.newState();
    s.inv.copper_ore = [2, 5, 0, 1, 0];
    const list = E.storeSellList(s);
    const row = list.find((r: any) => r.itemId === 'copper_ore');
    expect(row.qty).toBe(8);
    expect(row.grades.map((g: any) => [g.grade, g.qty])).toEqual([[0, 2], [1, 5], [3, 1]]);
    for (const g of row.grades) { expect(g.price).toBe(E.storeSellPrice('copper_ore', g.grade)); expect(g.gold).toBe(g.qty * g.price); }
    expect(row.gold).toBe(row.grades.reduce((a: number, g: any) => a + g.gold, 0));
    expect(list.every((r: any) => r.kind !== 'gear')).toBe(true);
    for (let i = 1; i < list.length; i++) expect(list[i - 1].name.localeCompare(list[i].name)).toBeLessThanOrEqual(0);
    expect(E.derivedExtras(s).sellList).toEqual(list);
    const gold0 = s.gold;
    const r = E.storeSellAll(s, 'copper_ore');
    expect(r).toMatchObject({ ok: true, qty: 8, gold: row.gold });
    expect(s.gold).toBe(gold0 + row.gold);
    expect(E.itemCount(s, 'copper_ore')).toBe(0);
    expect(E.storeSellList(s).some((x: any) => x.itemId === 'copper_ore')).toBe(false);
    expect(E.events(s, 1)[0]).toMatchObject({ cat: 'gold', itemId: 'copper_ore', qty: 8, gold: row.gold });
    expect(E.events(s, 1)[0].text).toContain('(all grades)');
    expect(E.storeSellAll(s, 'copper_ore').ok).toBe(false);
    expect(E.storeSellAll(s, 'nope').ok).toBe(false);
  });
});

describe('disabled-action reasons', () => {
  it('lists a reason for every action, job, contract and spec switch that cannot be used', async () => {
    const h = await freshEngine(1);
    const { E } = h;
    const s = E.newState();
    const d = E.disabledReasons(s);
    expect(d.actions.mine_copper).toBeUndefined();
    const iron = E.actionsFor('mining').find((a: any) => a.level > 1);
    expect(d.actions[iron.id]).toBe(E.canStart(s, iron.id).reason);
    expect(d.actions[iron.id]).toMatch(/^Requires Mining level \d+\.$/);
    // a refine with no inputs says what is missing
    const refine = E.actionsFor('smelting')[0];
    expect(d.actions[refine.id]).toMatch(/^(Out of|Need )/);
    // jobs: exactly the ones canAssist refuses
    for (const j of E.crewJobs(s)) expect(d.jobs[j.id]).toBe(j.canAssist.ok ? undefined : j.canAssist.reason);
    // contracts: no items in the bag → explains the grade; own request → crewmate has to fill it
    const town = E.listContracts(s).find((k: any) => k.status === 'open' && k.source === 'town');
    expect(d.contracts[town.id]).toMatch(/^You have no .* grade or better\.$/);
    s.gold = 1e6;
    const post = E.postCrewRequest(s, { itemId: 'copper_ore', qty: 5, rewardPer: 3 });
    expect(post.ok).toBe(true);
    expect(E.disabledReasons(s).contracts[post.contract.id]).toBe('You posted this request; a crewmate has to fill it.');
    s.inv[town.itemId] = [0, 0, 5, 0, 0];
    expect(E.disabledReasons(s).contracts[town.id]).toBeUndefined();
    // spec
    expect(d.spec).toBe('Reach level 70 in a profession to specialize.');
    expect(E.derivedExtras(s).disabledReasons.spec).toBe(d.spec);
  });

  it('spec reasons: cooldown, then gold', async () => {
    const h = await freshEngine(1);
    const { E } = h;
    const s = E.newState();
    const x70 = E.xpForLevel(70);
    s.skills.mining.xp = x70; s.skills.woodcutting.xp = x70; s.skills.fishing.xp = x70;
    expect(E.disabledReasons(s).spec).toBeNull();
    expect(E.switchSpec(s, 'mining').ok).toBe(true); // first pick free
    s.gold = 1e9;
    expect(E.switchSpec(s, 'woodcutting').ok).toBe(true); // starts the cooldown
    expect(E.disabledReasons(s).spec).toMatch(/^You can switch specialization again in \d+d \d+h\.$/);
    h.advance(8 * DAY); s.gold = 0;
    expect(E.disabledReasons(s).spec).toMatch(/^Switching costs .*g; you have 0g\.$/);
  });
});
