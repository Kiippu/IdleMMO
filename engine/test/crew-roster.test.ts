// Phase 1 Stage E: NPC crewmates stand-in. The roster is 4 authored NPCs with
// fixed names and heterogeneous refine/craft specs so the market has real
// pressure in solo play. The roster size is hard-capped at 10 by the design.
import { describe, expect, it, vi } from 'vitest';

async function freshEngine(seed = 1) {
  vi.resetModules();
  const mod = await import('../src/index');
  const E = mod.createEngine({ rng: mod.mulberry32(seed), now: () => Date.UTC(2026, 10, 2, 9), storage: mod.memoryStorage(), data: mod.DATA });
  return { E, mod };
}

describe('crew roster (Stage E)', () => {
  it('fresh state ships four authored NPCs with distinct refine/craft specs', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    expect(s.crew.members.length).toBe(4);
    const names = s.crew.members.map((m: any) => m.name).sort();
    expect(names).toEqual(['Aldis', 'Branka', 'Merrick', 'Osric']);
    const skills = s.crew.members.map((m: any) => m.skill).sort();
    expect(skills).toEqual(['carpentry', 'smelting', 'smithing', 'tailoring']);
  });

  it('each NPC can own a job for their own spec', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    // crewJobs returns the live jobs with owner names.
    const jobs = E.crewJobs(s);
    expect(jobs.length).toBeGreaterThan(0);
    const smelterJob = jobs.find((j: any) => j.skill === 'smelting');
    expect(smelterJob).toBeDefined();
    expect(smelterJob.owner).toBe('Merrick');
  });

  it('a save with a bigger roster is kept as-is (no pruning)', async () => {
    const { E } = await freshEngine();
    const base = E.newState();
    const extraNames = ['Wren', 'Ossian', 'Mira', 'Tobin', 'Kestrel', 'Ada'];
    for (const name of extraNames) base.crew.members.push({ id: 'c_' + name.toLowerCase(), name, skill: null });
    const raw = JSON.parse(JSON.stringify(base));
    const out = E.migrate(raw);
    expect(out.crew.members.length).toBe(10);
  });

  it('backfills a sparse save up to the authored roster size', async () => {
    const { E } = await freshEngine();
    const base = E.newState();
    // Simulate a save with only 1 member: migration should fill up to 4.
    base.crew.members = [{ id: 'c_merrick', name: 'Merrick', skill: 'smelting' }];
    const raw = JSON.parse(JSON.stringify(base));
    const out = E.migrate(raw);
    expect(out.crew.members.length).toBe(4);
  });
});
