import { describe, it, expect } from 'vitest';
import { createEngine, mulberry32, DATA } from '@guildwright/engine';
import { nextTickDelay, runTick, TICK_MAX_MS, TICK_MIN_MS } from './tickPlan';

describe('progress sync: ticks land on rep completion', () => {
  it('delay = time to the rep end (+slack), clamped to [4ms, 1s]; idle = 1s', () => {
    expect(nextTickDelay(null)).toBe(TICK_MAX_MS);
    expect(nextTickDelay(5)).toBe(TICK_MAX_MS);
    expect(nextTickDelay(0.3)).toBe(301);
    expect(nextTickDelay(0)).toBe(TICK_MIN_MS);
  });

  it('every completion is processed within one frame of the time the bar shows 100%', () => {
    let wall = Date.UTC(2026, 10, 3, 9, 0, 0);
    const E: any = createEngine({ rng: mulberry32(3), now: () => wall, storage: null, data: DATA });
    const s = E.newState();
    E.start(s, 'mine_copper');
    let last = wall;
    E.stampRep(s, wall);
    let due = s.active.repStartedAt + s.active.repMs;
    let delay = Math.ceil(s.active.repMs) + 1;
    let reps = 0;
    for (let i = 0; i < 400 && reps < 30; i++) {
      wall += delay;
      const r = runTick(E, s, wall, last); last = wall; delay = r.delayMs;
      if (r.events.some((e: any) => e.type === 'complete')) {
        expect(wall - due).toBeGreaterThanOrEqual(0);
        expect(wall - due).toBeLessThanOrEqual(16); // within one frame
        expect(r.events.some((e: any) => e.type === 'gain')).toBe(true);
        reps++;
      }
      // the bar the UI draws from the snapshot: same clock as the completion
      expect(s.active.repStartedAt).toBeLessThanOrEqual(wall);
      due = s.active.repStartedAt + s.active.repMs;
      expect(Math.abs(due - (wall + E.repTiming(s).secLeft * 1000))).toBeLessThanOrEqual(1);
    }
    expect(reps).toBe(30);
  });

  it('assisting a crew job is timed the same way', () => {
    let wall = Date.UTC(2026, 10, 3, 9, 0, 0);
    const E: any = createEngine({ rng: mulberry32(4), now: () => wall, storage: null, data: DATA });
    const s = E.newState();
    const job = E.crewJobs(s).find((j: any) => j.canAssist.ok);
    if (!job) return;
    E.assist(s, job.id);
    const r0 = E.stampRep(s, wall);
    expect(r0.repSec).toBeGreaterThan(0);
    let last = wall; let delay = Math.ceil(r0.secLeft * 1000) + 1; let due = s.active.repStartedAt + s.active.repMs;
    let crafts = 0;
    for (let i = 0; i < 200 && crafts < 3 && s.active; i++) {
      wall += delay;
      const r = runTick(E, s, wall, last); last = wall; delay = r.delayMs;
      if (r.events.some((e: any) => e.type === 'assist')) { expect(wall - due).toBeLessThanOrEqual(16); crafts++; }
      if (s.active) due = s.active.repStartedAt + s.active.repMs;
    }
    expect(crafts).toBeGreaterThan(0);
  });

  it('a held job ticks at the idle rate, makes no progress, and resumes from the same bar fraction', () => {
    let wall = Date.UTC(2026, 10, 3, 9, 0, 0);
    const E: any = createEngine({ rng: mulberry32(9), now: () => wall, storage: null, data: DATA });
    const s = E.newState();
    E.start(s, 'mine_copper');
    let last = wall; E.stampRep(s, wall);
    wall += Math.round(s.active.repMs * 0.5); runTick(E, s, wall, last); last = wall;
    const p = s.active.progress;
    E.holdJob(s, true);
    for (let i = 0; i < 20; i++) {
      wall += 1000; const r = runTick(E, s, wall, last); last = wall;
      expect(r.delayMs).toBe(TICK_MAX_MS);
      expect(r.events.some((e: any) => e.type === 'complete')).toBe(false);
    }
    expect(s.active.progress).toBe(p);
    expect(s.active.heldFrac).toBeCloseTo(0.5, 2);
    E.holdJob(s, false);
    const r = E.stampRep(s, wall);
    expect((wall - s.active.repStartedAt) / s.active.repMs).toBeCloseTo(0.5, 2);
    expect(nextTickDelay(r.secLeft)).toBeLessThan(TICK_MAX_MS + 1);
  });
});
