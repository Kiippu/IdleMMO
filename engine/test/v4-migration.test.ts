// Pins the v4 → v5 save migration. Every entry in CLAUDE.md's "settled decisions" that
// changes save shape should add a case here so a real save from the field keeps loading.
import { describe, expect, it, vi } from 'vitest';

const START = Date.UTC(2026, 10, 2, 9, 0, 0); // Mon 2 Nov 2026 09:00 UTC

async function freshEngine(seed = 1, now = START) {
  vi.resetModules();
  const mod = await import('../src/index');
  const storage = mod.memoryStorage();
  const E = mod.createEngine({ rng: mod.mulberry32(seed), now: () => now, storage, data: mod.DATA });
  return { E, mod, storage };
}

// Build a plausible v4 save: start from a fresh (v5) state so every field the migrator
// expects is populated, then stamp v: 4 and re-attach the v4-only fields that phase 1 drops.
function v4SaveFrom(baseV5: any, extra: Record<string, any> = {}) {
  return JSON.parse(JSON.stringify(Object.assign({}, baseV5, { v: 4 }, extra)));
}

describe('v4 → v5 migration', () => {
  it('drops the supply board', async () => {
    const { E } = await freshEngine();
    const base = E.newState();
    const raw = v4SaveFrom(base, {
      supply: { week: base.week, requests: [{ itemId: 'wood', rate: 1.5 }], donated: { wood: 10 }, earned: 42 },
    });
    const out = E.migrate(raw);
    expect(out).not.toBeNull();
    expect(out.v).toBe(5);
    expect(out.supply).toBeUndefined();
  });

  it('drops raid tokens (state.tokens and raid.rules.tokens)', async () => {
    const { E } = await freshEngine();
    const base = E.newState();
    const raw = v4SaveFrom(base, {
      tokens: 7,
      raid: Object.assign({}, base.raid, { rules: Object.assign({}, base.raid.rules, { tokens: 3 }) }),
    });
    const out = E.migrate(raw);
    expect(out.tokens).toBeUndefined();
    expect(out.raid.rules.tokens).toBeUndefined();
  });

  it('renames treasury.coin → treasury.gold and economy.raidCoin → raidGold', async () => {
    const { E } = await freshEngine();
    const base = E.newState();
    // base already has v5 fields (gold, raidGold). Replace them with v4 names to simulate
    // a save from before the rename.
    const crew = Object.assign({}, base.crew, {
      treasury: { coin: 250, escrow: 10 },
    });
    const economy = {
      raidCoin: 540,
      reqPaid: 60,
      weeks: [
        { week: 1, raidCoin: 180, reqPaid: 20 },
        { week: 2, raidCoin: 360, reqPaid: 40 },
      ],
    };
    const raw = v4SaveFrom(base, { crew, economy });
    // strip the v5 .gold the base had, so we're really testing the .coin path
    delete raw.crew.treasury.gold;
    const out = E.migrate(raw);
    expect(out.crew.treasury.coin).toBeUndefined();
    expect(out.crew.treasury.gold).toBe(250);
    expect(out.crew.treasury.escrow).toBe(10);
    expect(out.economy.raidCoin).toBeUndefined();
    expect(out.economy.raidGold).toBe(540);
    expect(out.economy.weeks[0].raidCoin).toBeUndefined();
    expect(out.economy.weeks[0].raidGold).toBe(180);
    expect(out.economy.weeks[1].raidGold).toBe(360);
  });

  it('preserves player gold, hp, skills, inv, gear, equipped, crew, clock, server, economy, loadouts', async () => {
    const { E } = await freshEngine();
    const base = E.newState();
    base.gold = 1234;
    base.hp = 42;
    // bump the first skill so we can check it round-trips
    const firstSkillId = Object.keys(base.skills)[0];
    base.skills[firstSkillId].xp = 999;
    const raw = v4SaveFrom(base);
    const out = E.migrate(raw);
    expect(out.gold).toBe(1234);
    expect(out.hp).toBe(42);
    expect(out.skills[firstSkillId].xp).toBe(999);
    expect(out.inv).toEqual(base.inv);
    expect(out.gear.length).toBe(base.gear.length);
    expect(out.equipped).toEqual(base.equipped);
    expect(out.clock).toEqual(base.clock);
    expect(out.server).toEqual(base.server);
    expect(out.economy).toEqual(base.economy);
    expect(out.loadouts).toEqual(base.loadouts);
  });

  it('migrated state is playable: one live tick does not throw', async () => {
    const { E } = await freshEngine();
    const base = E.newState();
    const raw = v4SaveFrom(base, {
      supply: { week: base.week, requests: [], donated: {}, earned: 0 },
    });
    const out = E.migrate(raw);
    expect(() => E.tick(out, 0.25, { visible: true })).not.toThrow();
  });

  it('round-trips a fresh v5 save unchanged', async () => {
    const { E } = await freshEngine();
    const s5 = E.newState();
    const raw = JSON.parse(JSON.stringify(s5));
    const out = E.migrate(raw);
    expect(out).not.toBeNull();
    expect(out.v).toBe(5);
    expect(out.supply).toBeUndefined();
    expect(out.gold).toBe(s5.gold);
  });

  it('rejects unknown schema versions', async () => {
    const { E } = await freshEngine();
    expect(E.migrate({ v: 99, skills: {} })).toBeNull();
    expect(E.migrate({ v: 2, skills: {} })).toBeNull();
  });

  it('rejects malformed input', async () => {
    const { E } = await freshEngine();
    expect(E.migrate(null)).toBeNull();
    expect(E.migrate({})).toBeNull();
    expect(E.migrate({ skills: null })).toBeNull();
  });

  it('initialises an empty crew.treasury.log on v4 loads', async () => {
    const { E } = await freshEngine();
    const base = E.newState();
    // Simulate a v4 save: strip the v5-only log so we're really testing the default path.
    const crew = Object.assign({}, base.crew, {
      treasury: { gold: 300, escrow: 0 },
    });
    const raw = v4SaveFrom(base, { crew });
    const out = E.migrate(raw);
    expect(Array.isArray(out.crew.treasury.log)).toBe(true);
    expect(out.crew.treasury.log).toEqual([]);
  });
});

describe('treasury log', () => {
  it('fresh state has an empty log and writes a payout entry after a raid resolves', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    expect(Array.isArray(s.crew.treasury.log)).toBe(true);
    expect(s.crew.treasury.log.length).toBe(0);

    const before = s.crew.treasury.gold;
    const r = E.runRaid(s);
    expect(r.ok).toBe(true);
    // Raid payout increased the gold → there must be a 'payout' entry recording it.
    const payout = s.crew.treasury.log.find((e: any) => e.kind === 'payout');
    expect(payout).toBeDefined();
    expect(payout.delta).toBeGreaterThan(0);
    expect(s.crew.treasury.gold - before).toBe(payout.delta);
    expect(payout.week).toBe(s.week);
    expect(payout.who).toBe('Raid');
  });

  it('writes a fill entry when a requisition is paid out to a submitter', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    // Find an item that's stackable and available as a craft/refine recipe output, so we
    // can grant ourselves some to fill a requisition.
    const anyItemId = Object.keys(s.inv)[0];
    expect(anyItemId).toBeTruthy();
    // Post a requisition for it as leader (treasury has starting gold).
    const r = E.postRequisition(s, { itemId: anyItemId, qty: 2, rewardPer: 10, minGrade: 0, note: 'test' });
    expect(r.ok).toBe(true);
    const openReq = s.crew.requisitions.find((x: any) => x.status === 'open');
    expect(openReq).toBeDefined();
    const logBefore = s.crew.treasury.log.length;
    const fill = E.fillRequisition(s, openReq.id, 1);
    expect(fill.ok).toBe(true);
    expect(fill.paid).toBeGreaterThan(0);
    // One new 'fill' entry, negative delta, who = 'You'.
    expect(s.crew.treasury.log.length).toBe(logBefore + 1);
    const entry = s.crew.treasury.log[0];
    expect(entry.kind).toBe('fill');
    expect(entry.delta).toBe(-fill.paid);
    expect(entry.who).toBe('You');
  });

  it('caps the log at 80 entries (oldest drops)', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    // Fake 100 payouts directly via the helper (through a tiny indirection — call logTreasury
    // via a resolved raid? Too heavy. Just push via the exported helper.)
    // The helper isn't exported on E; we test the cap via back-to-back raids instead would
    // take forever. Simpler: synthesise entries directly.
    for (let i = 0; i < 100; i++) {
      s.crew.treasury.log.unshift({ t: i, week: 1, kind: 'payout', who: 'Test', delta: 1, reason: 'x' });
    }
    // The helper enforces the cap only on insert; this test confirms that the helper's
    // next write trims the log back down to the cap.
    const resolve = E.runRaid(s);
    expect(resolve.ok).toBe(true);
    expect(s.crew.treasury.log.length).toBeLessThanOrEqual(80);
  });
});

describe('vault consumption in raids', () => {
  it('consumes food and buff potions from the vault when the raid resolves', async () => {
    const { E, mod } = await freshEngine();
    const s = E.newState();
    // Seed the vault with food + a buff potion. Pick items that exist in DATA.
    const foodId = Object.keys(mod.DATA.items).find((id: string) => mod.DATA.items[id].kind === 'food') as string;
    const potionId = Object.keys(mod.DATA.items).find((id: string) => {
      const it = mod.DATA.items[id]; return it.kind === 'potion' && it.buff && it.buff.pct > 0;
    }) as string;
    expect(foodId).toBeTruthy();
    expect(potionId).toBeTruthy();
    s.crew.vault.inv[foodId] = [0, 5, 0, 0, 0];   // 5 Standard-grade food
    s.crew.vault.inv[potionId] = [0, 3, 0, 0, 0]; // 3 Standard-grade buff potions
    const logBefore = s.crew.treasury.log.length;
    const r = E.runRaid(s);
    expect(r.ok).toBe(true);
    // Both items are gone from the vault.
    expect((s.crew.vault.inv[foodId] || []).reduce((a: number, b: number) => a + b, 0)).toBe(0);
    expect((s.crew.vault.inv[potionId] || []).reduce((a: number, b: number) => a + b, 0)).toBe(0);
    // Two new 'vault' log entries (one per item) with itemId + negative qty.
    const vaultEntries = s.crew.treasury.log.slice(0, s.crew.treasury.log.length - logBefore).filter((e: any) => e.kind === 'vault');
    expect(vaultEntries.length).toBe(2);
    vaultEntries.forEach((e: any) => {
      expect(e.itemId).toBeDefined();
      expect(e.qty).toBeLessThan(0);
      expect(e.delta).toBe(0);
    });
  });

  it('payout scales with turnout: full crew pays more than a solo player', async () => {
    const full = await freshEngine();
    const solo = await freshEngine();
    const fullState = full.E.newState();
    const soloState = solo.E.newState();
    soloState.crew.members = []; // player joins alone

    const fullBefore = fullState.crew.treasury.gold;
    const soloBefore = soloState.crew.treasury.gold;
    const fullR = full.E.runRaid(fullState);
    const soloR = solo.E.runRaid(soloState);
    expect(fullR.ok).toBe(true);
    expect(soloR.ok).toBe(true);
    const fullDelta = fullState.crew.treasury.gold - fullBefore;
    const soloDelta = soloState.crew.treasury.gold - soloBefore;
    // Full-crew payout is strictly larger than a solo-player payout (same boss tier, same
    // seed → same avgContribution in each case; the difference is attendCount).
    expect(fullDelta).toBeGreaterThan(soloDelta);
    expect(fullDelta).toBeGreaterThan(0);
  });
});
