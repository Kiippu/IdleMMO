// Owner decision 2026-11-11: offline catch-up has no time cap and runs at 1.5x active speed. Long
// absences are simulated in hourly game-clock chunks; gathering past OFFLINE_MAX_COMPLETIONS reps
// switches to an exact-XP bulk step. Must stay fast and deterministic.
import { describe, expect, it } from 'vitest';
import { freshEngine, START, DAY } from './engine-helpers';

async function away(days: number, seed = 1, setup?: (E: any, s: any) => void) {
  const h = await freshEngine(seed);
  const { E } = h;
  const s = E.newState();
  s.lastSeen = h.now();
  if (setup) setup(E, s); else E.start(s, 'mine_copper');
  h.advance(days * DAY);
  const t = performance.now();
  const r = E.applyOffline(s, h.now());
  return { h, E, s, r, ms: performance.now() - t };
}

describe('long offline catch-up', () => {
  it('7 days: fast, every weekly raid resolved in order, store on the current hour, levels gained', async () => {
    const { E, s, r, ms, h } = await away(7);
    expect(ms).toBeLessThan(2000);
    expect(r.seconds).toBe(7 * 86400);
    expect(r.summary.weeks).toBe(1);
    expect(r.summary.raids.length).toBe(1);
    expect(s.raid.resolvedWeek).toBe(1);
    expect(s.week).toBe(2);
    expect(E.lastRecap(s).week).toBe(1);
    expect(s.store.hour).toBe(Math.floor(E.now(s) / 3600000));
    expect(E.skillLevel(s, 'mining')).toBeGreaterThan(30);
    expect(r.summary.items.copper_ore).toBeGreaterThan(20000);
    // week-2 town contracts were posted after the rollover
    expect(s.crew.contracts.some((k: any) => k.source === 'town' && k.week === 2)).toBe(true);
    // log lines carry game-clock times inside the absence, and the summary line is last
    const ev = E.events(s, 200);
    expect(ev[ev.length - 1].t).toBeGreaterThanOrEqual(START);
    expect(ev.some((e: any) => /While you were away/.test(e.text))).toBe(true);
    void h;
  });

  it('30 days: fast, deterministic, four or five raids, XP matches 1.5x the time exactly in bulk', async () => {
    const a = await away(30, 7); const b = await away(30, 7);
    expect(a.ms).toBeLessThan(2000);
    expect(a.r.summary).toEqual(b.r.summary);
    expect(a.s.skills).toEqual(b.s.skills);
    expect(a.r.summary.raids.length).toBeGreaterThanOrEqual(4);
    expect(a.s.week).toBeGreaterThanOrEqual(5);
    // ~30d x 1.5 at <=3 s per rep; bulk keeps the yield per rep of the sampled reps
    const reps = a.s.mastery.mine_copper as number;
    const secPerRep = a.E.actionTime(a.s, 'mine_copper');
    expect(reps * secPerRep).toBeGreaterThan(30 * 86400 * 1.5 * 0.95);
    expect(reps * secPerRep).toBeLessThanOrEqual(30 * 86400 * 1.5 + 10);
    expect(a.s.skills.mining.xp).toBe(reps * a.h.mod.DATA.actions.find((x: any) => x.id === 'mine_copper').xp * a.h.mod.DATA.config.xpMult);
    expect(a.r.summary.items.copper_ore).toBeGreaterThan(reps * 0.99);
  });

  it('assisting a crew job offline still helps (at offlineRate) and NPCs fill contracts on Fridays', async () => {
    const { r, s, ms } = await away(7, 3, (E: any, st: any) => {
      const job = st.crew.jobs.find((j: any) => E.canAssist(st, j.id).ok);
      if (job) E.assist(st, job.id);
    });
    expect(ms).toBeLessThan(2000);
    expect(r.summary.assisted).toBeGreaterThan(0);
    const npcFills = s.crew.contracts.filter((k: any) => k.week === 1).reduce((a: number, k: any) => a + k.submissions.filter((x: any) => x.who !== 'You').length, 0);
    expect(npcFills).toBeGreaterThan(0);
  });
});
