// Phase 2.5: speed matches the prototype (speedFactor 1). Offline (owner 2026-11-11): 1.5x active speed, no time cap.
// E.actionTime is the single time-per-rep function; the active card (E.activeInfo) reads it,
// so the action list and the active card always show the same time per rep.
import { describe, expect, it } from 'vitest';
import { freshEngine } from './engine-helpers';

describe('speed factor (phase 2.5)', () => {
  it('cfg.speedFactor is 1; offline runs at 1.5x with no cap', async () => {
    const { mod } = await freshEngine();
    const cfg = mod.DATA.config || {};
    expect(cfg.speedFactor).toBe(1);
    expect(cfg.offlineCapSec).toBe(0);
    expect(cfg.offlineRate).toBe(1.5);
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

  it('offline catch-up has no cap and runs at 1.5x active speed', async () => {
    const { E, advance, now } = await freshEngine();
    const s = E.newState();
    s.lastSeen = now();
    E.start(s, 'mine_copper');
    advance(8 * 3600000);
    const r = E.applyOffline(s, now());
    expect(r.seconds).toBe(8 * 3600);
    const ore = r.summary.items.copper_ore as number;
    // 8 h x 1.5 = 43,200 s of work at ~3 s per rep ≈ 14,400 reps (yield bonus can add a few)
    expect(ore).toBeGreaterThan(14400 * 0.95);
    expect(ore).toBeLessThan(14400 * 1.3);
  });
});
