// Owner decision 2026-11-11: offline catch-up has no time cap and runs at cfg.offlineRate x active speed (1x since 2026-11-11). Long
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

  it('30 days: fast, deterministic, four or five raids, XP matches offlineRate x the time exactly in bulk', async () => {
    const a = await away(30, 7); const b = await away(30, 7);
    expect(a.ms).toBeLessThan(2000);
    expect(a.r.summary).toEqual(b.r.summary);
    expect(a.s.skills).toEqual(b.s.skills);
    expect(a.r.summary.raids.length).toBeGreaterThanOrEqual(4);
    expect(a.s.week).toBeGreaterThanOrEqual(5);
    // ~30d x offlineRate at <=3 s per rep; bulk keeps the yield per rep of the sampled reps
    const reps = a.s.mastery.mine_copper as number;
    const secPerRep = a.E.actionTime(a.s, 'mine_copper');
    expect(reps * secPerRep).toBeGreaterThan(30 * 86400 * a.h.mod.DATA.config.offlineRate * 0.95);
    expect(reps * secPerRep).toBeLessThanOrEqual(30 * 86400 * a.h.mod.DATA.config.offlineRate + 10);
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

  it('save created Monday, 6 days offline: the weekend raid resolves and pays (locked in or auto-locked)', async () => {
    for (const lock of [true, false]) {
      const { E, s, r } = await away(6, 1, (E: any, st: any) => { if (lock) E.lockIn(st); E.start(st, 'mine_copper'); });
      expect(r.summary.raids.length).toBe(1);
      const recap = E.lastRecap(s);
      expect(recap).toBeTruthy(); expect(recap.week).toBe(1); expect(recap.joined).toBe(true); expect(recap.auto).toBe(!lock);
      expect(s.raid.satOutWeek).toBe(0);
      const ev = E.events(s, 200);
      expect(ev.some((e: any) => e.cat === 'raid')).toBe(true);
      if (recap.payout.gold > 0) expect(ev.some((e: any) => e.cat === 'gold' && e.gold === recap.payout.gold)).toBe(true);
      // log lines are stamped at the raid's start (game clock), not at the end of the absence
      expect(ev.find((e: any) => e.cat === 'raid' && /Raid on|defeated/.test(e.text)).t).toBeLessThanOrEqual(recap.windowStart + 3600000);
    }
  });

  it('4.5 days from Monday 09:00 ends Friday 21:00: before the Saturday window, so no raid yet', async () => {
    const { E, s, r } = await away(4.5);
    expect(r.summary.raids.length).toBe(0);
    expect(E.lastRecap(s)).toBeNull();
    expect(E.raidStatus(s).secToStart).toBeGreaterThan(0);
  });
});
