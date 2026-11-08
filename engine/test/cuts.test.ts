// Phase 2.5 fix 7 + cuts: dev shortcuts (startRaidNow / runRaid / canStartNow, devSetClock) and
// cut features (farm raids, "view as member", NPC auto-posted requisitions) are gone from the engine.
import { describe, expect, it } from 'vitest';
import { freshEngine, resolveRaidByClock } from './engine-helpers';

describe('dev shortcuts removed', () => {
  it('no start-raid-now verbs, no canStartNow flag, no dev clock setter', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    expect(E.startRaidNow).toBeUndefined();
    expect(E.runRaid).toBeUndefined();
    expect(E.devSetClock).toBeUndefined();
    expect('canStartNow' in E.raidStatus(s)).toBe(false);
  });

  it('the raid only resolves on the game clock, at the raid window', async () => {
    const h = await freshEngine();
    const s = h.E.newState();
    h.E.tick(s, 60); // Monday: nothing
    expect(h.E.lastRecap(s)).toBeNull();
    expect(h.E.raidStatus(s).phase).toBe('prep');
    const { recap } = resolveRaidByClock(h, s);
    expect(recap).toBeTruthy();
    expect(recap.instant).toBe(false);
    expect(h.E.raidStatus(s).resolved).toBe(true);
  });
});

describe('cut features', () => {
  it('farm raids are gone (verbs, state, config)', async () => {
    const { E, mod } = await freshEngine();
    const s = E.newState();
    expect(E.farmRaids).toBeUndefined();
    expect(E.runFarmRaid).toBeUndefined();
    expect(s.raid.farm).toBeUndefined();
    expect(mod.DATA.config.farmRunsPerDay).toBeUndefined();
  });

  it('"view as member" toggle is gone; rank comes from the save', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    expect(E.setViewAsMember).toBeUndefined();
    expect(s.crew.viewAsMember).toBeUndefined();
    s.crew.viewAsMember = true; // stale field from an old save is ignored
    expect(E.playerRank(s)).toBe('officer');
  });

  it('weekly rollover posts contracts, not NPC requisitions', async () => {
    const h = await freshEngine();
    const s = h.E.newState();
    const reqs0 = s.crew.requisitions.length;
    resolveRaidByClock(h, s);
    h.setNow(h.E.raidWindow(s).start + 3 * 86400000);
    h.E.tick(s, 1);
    expect(s.week).toBe(2);
    expect(s.crew.requisitions.length).toBe(reqs0);
    expect(s.crew.contracts.some((k: any) => k.week === 2 && k.status === 'open')).toBe(true);
  });
});
