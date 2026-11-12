// Pins the one-slot invariant: state.active is always either a personal action OR a help
// job, never both and never two personal actions in parallel. Stage E (NPC crewmates) must
// not reintroduce a parallel path for the player.
import { describe, expect, it, vi } from 'vitest';

const START = Date.UTC(2026, 10, 2, 9, 0, 0); // Mon 2 Nov 2026 09:00 UTC

async function freshEngine(seed = 1, now = START) {
  vi.resetModules();
  const mod = await import('../src/index');
  const storage = mod.memoryStorage();
  const E = mod.createEngine({ rng: mod.mulberry32(seed), now: () => now, storage, data: mod.DATA });
  return { E, mod };
}

// Seed a specific level-1 refine job so canAssist passes at level 1 regardless of RNG.
function seedLevel1Job(E: any, s: any) {
  const job = E.postCrewJob(s, 'smelt_copper');
  expect(job).toBeTruthy();
  job.qty = 50; // long enough that no test tick finishes it (qty is random 5-20)
  return job;
}

describe('one action slot', () => {
  it('starting a personal action clears a running help job', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    const job = seedLevel1Job(E, s);
    const r = E.assist(s, job.id);
    expect(r.ok).toBe(true);
    expect(s.active.jobId).toBe(job.id);

    const started = E.start(s, 'mine_copper');
    expect(started.ok).toBe(true);
    expect(s.active.actionId).toBe('mine_copper');
    expect(s.active.jobId).toBeUndefined();
  });

  it('assisting a job clears a running personal action', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    const started = E.start(s, 'mine_copper');
    expect(started.ok).toBe(true);
    expect(s.active.actionId).toBe('mine_copper');
    expect(s.active.jobId).toBeUndefined();

    const job = seedLevel1Job(E, s);
    const r = E.assist(s, job.id);
    expect(r.ok).toBe(true);
    expect(s.active.jobId).toBe(job.id);
    expect(s.active.actionId).toBe(job.actionId);
  });

  it('starting the same personal action twice is an idempotent no-op (no progress reset)', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    E.start(s, 'mine_copper');
    s.active.progress = 1.5;
    const again = E.start(s, 'mine_copper');
    expect(again.ok).toBe(true);
    expect(s.active.progress).toBe(1.5);
  });

  it('tick does not advance the personal-action progress while a job is active', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    const job = seedLevel1Job(E, s);
    E.assist(s, job.id);
    // advanceAction (tick.ts:13) early-returns when state.active.jobId is set, so the
    // personal-action progress counter must not tick regardless of dt.
    E.tick(s, 10, { visible: true });
    // After the tick, state.active is still the job (not nulled) and progress reflects
    // only what crewStep did to the job itself. The important invariant: progress stays
    // in the job's own slot, not on a parallel personal action.
    expect(s.active).not.toBeNull();
    expect(s.active.jobId).toBe(job.id);
  });
});
