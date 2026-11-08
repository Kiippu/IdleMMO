// Pins the v4 → v5 save migration. Every entry in CLAUDE.md's "settled decisions" that
// changes save shape should add a case here so a real save from the field keeps loading.
import { describe, expect, it } from 'vitest';
import { freshEngine, resolveRaidByClock } from './engine-helpers';

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
    expect(out.v).toBe(6);
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
    expect(out.v).toBe(6);
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
  it('fresh state has only contract escrow entries and writes a payout entry after a raid resolves', async () => {
    const { E, setNow } = await freshEngine();
    const s = E.newState();
    expect(Array.isArray(s.crew.treasury.log)).toBe(true);
    // phase 2.5: a fresh state already escrowed gold for this week's town contracts; nothing else
    expect(s.crew.treasury.log.every((e: any) => e.kind === 'contract-escrow' && e.delta === 0)).toBe(true);

    const h = { E, setNow }; const before = E.crewGold(s).total;
    const { recap } = resolveRaidByClock(h, s);
    expect(recap).toBeTruthy();
    // Raid payout increased the gold → there must be a 'payout' entry recording it.
    const payout = s.crew.treasury.log.find((e: any) => e.kind === 'payout');
    expect(payout).toBeDefined();
    expect(payout.delta).toBeGreaterThan(0);
    expect(E.crewGold(s).total - before).toBe(payout.delta);
    expect(payout.week).toBe(s.week);
    expect(payout.who).toBe('Raid');
  });

  it('caps the log at 200 entries (oldest drops)', async () => {
    const { E, setNow } = await freshEngine();
    const s = E.newState();
    // Synthesise entries directly; the helper trims back to the cap on its next write.
    for (let i = 0; i < 250; i++) {
      s.crew.treasury.log.unshift({ t: i, week: 1, kind: 'payout', who: 'Test', delta: 1, reason: 'x' });
    }
    resolveRaidByClock({ E, setNow }, s);
    expect(s.crew.treasury.log.length).toBe(200);
  });
});

describe('raid payouts by turnout', () => {
  it('payout scales with turnout: full crew pays more than a solo player', async () => {
    const full = await freshEngine();
    const fullState = full.E.newState();
    const fullBefore = full.E.crewGold(fullState).total;
    resolveRaidByClock(full, fullState);
    const fullDelta = full.E.crewGold(fullState).total - fullBefore;

    const solo = await freshEngine();
    const soloState = solo.E.newState();
    soloState.crew.members = []; // player joins alone
    const soloBefore = solo.E.crewGold(soloState).total;
    resolveRaidByClock(solo, soloState);
    const soloDelta = solo.E.crewGold(soloState).total - soloBefore;
    expect(fullDelta).toBeGreaterThan(soloDelta);
    expect(fullDelta).toBeGreaterThan(0);
  });
});
