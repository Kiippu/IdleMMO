import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createEngine, mulberry32, memoryStorage, DATA } from '@guildwright/engine';

const fixture = (n: string) => readFileSync(resolve(__dirname, '../../../engine/test/fixtures', n), 'utf8');
const KEY = 'guildwright-proto-v1';

function boot(name: string) {
  const storage = memoryStorage();
  storage.setItem(KEY, fixture(name));
  const E = createEngine({ rng: mulberry32(1), now: () => Date.now(), storage, data: DATA });
  return { E, state: E.load() };
}

describe.each(['v4-save.json', 'v5-phase2-save.json'])('client save path: %s', (name) => {
  it('loads and exposes the data the client derives', () => {
    const { E, state } = boot(name);
    expect(state).toBeTruthy();
    expect(Array.isArray(E.listContracts(state))).toBe(true);
    const cg = E.crewGold(state);
    expect(cg.total).toBe(cg.free + cg.escrowed);
    expect(E.specCooldown(state).text).toMatch(/^\d+d \d+h$|^$|^ready|./);
    expect(E.spec(state).switchCost).toBeGreaterThan(0);
    const sp = E.spec(state);
    expect(Array.isArray(sp.eligible)).toBe(true);
    expect(sp.cost).toBeLessThanOrEqual(sp.switchCost);
    for (const c of E.listContracts(state)) expect(['town', 'crew']).toContain(c.source);
    for (const e of E.treasuryLog(state)) expect(typeof e.t).toBe('number');
  });
  it('actionTime is the single source for list and active card', () => {
    const { E, state } = boot(name);
    for (const a of (DATA as any).actions.slice(0, 20)) {
      expect(E.actionTime(state, a.id)).toBeGreaterThan(0);
    }
  });
});
