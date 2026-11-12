// Job hold (2026-11-12, craft card pause): while state.active.held the active job makes no progress, everything
// else keeps running, and the held time is never credited later (next tick, offline catch-up, load).
import { describe, expect, it } from 'vitest';
import { freshEngine, invTotal } from './engine-helpers';

const MIN = 60000;

describe('job hold', () => {
  it('a held job gains no reps or progress over many ticks while other systems still tick', async () => {
    const h = await freshEngine(7);
    const { E } = h;
    const s = E.newState();
    E.start(s, 'mine_copper');
    E.tick(s, 1.3); h.advance(1300);
    const p0 = s.active.progress; const ore0 = invTotal(s.inv, 'copper_ore'); const xp0 = s.skills.mining.xp;
    const crewNext0 = s.crew ? s.crew.nextPostIn : null;
    const r = E.holdJob(s, true);
    expect(r).toMatchObject({ ok: true, held: true });
    expect(s.active.held).toBe(true);
    s.hp = 1;
    for (let i = 0; i < 120; i++) { const ev = E.tick(s, 1); h.advance(1000); expect(ev.some((e: any) => e.type === 'complete')).toBe(false); }
    expect(s.active.progress).toBe(p0);
    expect(invTotal(s.inv, 'copper_ore')).toBe(ore0);
    expect(s.skills.mining.xp).toBe(xp0);
    expect(s.hp).toBeGreaterThan(1); // regen still runs
    if (crewNext0 != null) expect(s.crew.nextPostIn).not.toBe(crewNext0); // crew sim still runs
    expect(s.active.held).toBe(true);
  });

  it('stampRep freezes the bar (heldFrac, secLeft Infinity); release continues from the same fraction', async () => {
    const h = await freshEngine(3);
    const { E } = h;
    const s = E.newState();
    E.start(s, 'mine_copper');
    const t = E.actionTime(s, 'mine_copper');
    E.tick(s, t * 0.4); h.advance(t * 400);
    let wall = 1_000_000;
    E.holdJob(s, true);
    const r = E.stampRep(s, wall);
    expect(r.secLeft).toBe(Infinity);
    expect(s.active.heldFrac).toBeCloseTo(0.4, 5);
    for (let i = 0; i < 30; i++) { E.tick(s, 1); h.advance(1000); wall += 1000; E.stampRep(s, wall); }
    expect(s.active.heldFrac).toBeCloseTo(0.4, 5);
    E.holdJob(s, false);
    expect(s.active.held).toBeUndefined();
    const r2 = E.stampRep(s, wall);
    expect(s.active.heldFrac).toBeUndefined();
    expect((wall - s.active.repStartedAt) / s.active.repMs).toBeCloseTo(0.4, 2);
    expect(r2.secLeft).toBeCloseTo(t * 0.6, 3);
    // and it really does continue: the rep completes after the remaining 60%
    const ev = E.tick(s, t * 0.6 + 0.001);
    expect(ev.some((e: any) => e.type === 'complete')).toBe(true);
  });

  it('a held crew assist adds nothing from the player; the crewmate keeps working', async () => {
    const h = await freshEngine(5);
    const { E } = h;
    const s = E.newState();
    const job = E.postCrewJob(s, 'smelt_copper');
    E.assist(s, job.id);
    E.holdJob(s, true);
    const xp0 = s.skills[E.action('smelt_copper').skill].xp;
    for (let i = 0; i < 300; i++) { const ev = E.tick(s, 1); h.advance(1000); expect(ev.some((e: any) => e.type === 'assist')).toBe(false); }
    expect(s.skills[E.action('smelt_copper').skill].xp).toBe(xp0);
  });

  it('clears after 10 minutes, and when the job changes', async () => {
    const h = await freshEngine(2);
    const { E } = h;
    const s = E.newState();
    E.start(s, 'mine_copper');
    E.holdJob(s, true);
    for (let i = 0; i < 9; i++) { h.advance(MIN); E.tick(s, 1); }
    expect(s.active.held).toBe(true);
    h.advance(MIN + 1000); E.tick(s, 1);
    expect(s.active.held).toBeUndefined();
    // same action again (new count) clears it
    E.holdJob(s, true); E.start(s, 'mine_copper', 5);
    expect(s.active.held).toBeUndefined();
    // a different job clears it
    E.holdJob(s, true); E.start(s, 'chop_pine');
    expect(s.active && s.active.held).toBeFalsy();
    // nothing running: hold is a no-op
    E.stop(s);
    expect(E.holdJob(s, true).ok).toBe(false);
    expect(s.active).toBeNull();
  });

  it('offline catch-up after a held save credits only the real time away and clears the flag', async () => {
    const h = await freshEngine(11);
    const { E } = h;
    const s = E.newState();
    E.start(s, 'mine_copper');
    const t = E.actionTime(s, 'mine_copper');
    E.holdJob(s, true);
    // 5 held minutes on screen, saved every second like the worker does
    for (let i = 0; i < 300; i++) { h.advance(1000); E.tick(s, 1); E.save(s); }
    expect(s.active.progress).toBe(0);
    const ore0 = invTotal(s.inv, 'copper_ore');
    // away 10 minutes, then the catch-up on the live (still held) state, as the worker's resume does
    h.advance(10 * MIN);
    const res = E.applyOffline(s, h.now());
    expect(res.seconds).toBe(600);
    expect(s.active.held).toBeUndefined();
    const reps = Math.floor(600 / t);
    const ore = invTotal(s.inv, 'copper_ore') - ore0;
    expect(ore).toBeGreaterThan(0);
    // no more reps than 10 minutes allow (the 5 held minutes are not credited)
    expect(s.mastery.mine_copper || 0).toBeLessThanOrEqual(reps + 1);
  });

  it('a saved held job loads unheld (v7 save, field optional either way)', async () => {
    const h = await freshEngine(4);
    const { E } = h;
    const s = E.newState();
    E.start(s, 'mine_copper');
    E.tick(s, 1);
    E.holdJob(s, true);
    E.save(s);
    const loaded = E.load();
    expect(loaded).toBeTruthy();
    expect(loaded.v).toBe(8);
    expect(loaded.active.actionId).toBe('mine_copper');
    expect(loaded.active.held).toBeUndefined();
    expect(loaded.active.heldAt).toBeUndefined();
    // v7 save without the field (written before this change) loads and runs
    const raw = JSON.parse(JSON.stringify(s)); delete raw.active.held; delete raw.active.heldAt; delete raw.active.heldFrac;
    const m = E.migrate(raw);
    expect(m.active.actionId).toBe('mine_copper');
    expect(m.active.held).toBeUndefined();
    const p = m.active.progress; E.tick(m, 0.5);
    expect(m.active.progress).toBeGreaterThan(p);
  });
});
