// Phase 3 step 1 (layout pass, 2026-11-11): engine data the new screens need. Additive only.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { freshEngine, START, DAY } from './engine-helpers';

const fixture = (name: string) => JSON.parse(readFileSync(resolve(__dirname, 'fixtures', name), 'utf8'));

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
    expect(v.hints[2].text).toContain('Contracts');
    s.raid.recaps[0].payout.split = { floor: 1000, byContribution: 3000, pointShare: 0.4, uncapped: 4000, cap: 2500, cutToTreasury: 1500 };
    s.raid.recaps[0].payout.gold = 2500;
    const v2 = h.E.recapView(s);
    expect(v2.pay).toMatchObject({ turnoutPay: 1000, contributionPay: 3000, capCut: 1500, capped: true, gold: 2500, pointShareText: '40%' });
  });

  it('a player who sat out gets the join hint', async () => {
    const h = await freshEngine(1);
    const s = h.E.newState();
    s.raid.recaps = [{ id: 'R2', week: 1, joined: false, payout: { gold: 0 } }];
    expect(h.E.recapView(s).nextWeekHint.kind).toBe('join');
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
  });

  it('old saves without jobsDone load and give an empty-safe feed', async () => {
    for (const f of ['v4-save.json', 'v5-phase2-save.json', 'v6-phase25-save.json']) {
      const h = await freshEngine(3, START + 3600000);
      const s = h.E.migrate(fixture(f));
      expect(s.v).toBe(6);
      expect(Array.isArray(h.E.crewActivity(s))).toBe(true);
      expect(h.E.derivedExtras(s)).toBeTruthy();
    }
  });
});
