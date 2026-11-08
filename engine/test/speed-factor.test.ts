// Phase 2.5: speed matches the prototype (speedFactor 1); offline catch-up stays at 12 h, 10%.
// E.actionTime is the single time-per-rep function; the active card (E.activeInfo) reads it,
// so the action list and the active card always show the same time per rep.
import { describe, expect, it } from 'vitest';
import { freshEngine } from './engine-helpers';

describe('speed factor (phase 2.5)', () => {
  it('cfg.speedFactor is 1 and offline is capped at 12 h at 10% speed', async () => {
    const { mod } = await freshEngine();
    const cfg = mod.DATA.config || {};
    expect(cfg.speedFactor).toBe(1);
    expect(cfg.offlineCapSec).toBe(12 * 3600);
    expect(cfg.offlineRate).toBe(0.1);
  });

  it('E.actionTime equals the prototype seconds on a fresh state', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    // mine_copper has sec=3 in the data table.
    const t = E.actionTime(s, 'mine_copper');
    expect(t).toBeGreaterThanOrEqual(3 * 0.95);
    expect(t).toBeLessThan(3 * 1.05);
  });

  it('the active card shows the same time per rep as the action list', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    expect(E.start(s, 'mine_copper').ok).toBe(true);
    const info = E.activeInfo(s);
    expect(info.secLeft).toBeCloseTo(E.actionTime(s, 'mine_copper'), 9);
  });

  it('offline catch-up stops at 12 h and runs at 10% speed', async () => {
    const { E, advance, now } = await freshEngine();
    const s = E.newState();
    s.lastSeen = now();
    E.start(s, 'mine_copper');
    advance(48 * 3600000);
    const r = E.applyOffline(s, now());
    expect(r.seconds).toBe(12 * 3600);
    const reps = Object.values(r.summary.items).reduce((a: number, b: any) => a + b, 0) as number;
    // 12 h x 10% = 4320 s of work at ~3 s per rep ≈ 1440 reps (yield per rep may exceed 1)
    expect(reps).toBeGreaterThan(1000);
    expect(reps).toBeLessThan(1440 * 4);
  });
});
