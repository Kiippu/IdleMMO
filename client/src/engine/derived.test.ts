import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createEngine, mulberry32, memoryStorage, DATA } from '@guildwright/engine';

const fixture = (n: string) => readFileSync(resolve(__dirname, '../../../engine/test/fixtures', n), 'utf8');
const KEY = 'guildwright-proto-v1';
const make = (saved?: string) => {
  const storage = memoryStorage();
  if (saved != null) storage.setItem(KEY, saved);
  return createEngine({ rng: mulberry32(1), now: () => Date.now(), storage, data: DATA });
};

describe('client save path (schema v7)', () => {
  const E = make();
  const state = E.newState();
  it('a fresh state exposes the data the client derives', () => {
    expect(Array.isArray(E.listContracts(state))).toBe(true);
    const cg = E.crewGold(state);
    expect(cg.total).toBe(cg.free + cg.escrowed);
    const sp = E.spec(state);
    expect(Array.isArray(sp.eligible)).toBe(true);
    for (const e of E.treasuryLog(state)) expect(typeof e.t).toBe('number');
  });
  it('actionTime is the single source for list and active card', () => {
    for (const a of (DATA as any).actions.slice(0, 20)) expect(E.actionTime(state, a.id)).toBeGreaterThan(0);
  });
  it('a saved v7 state loads back', () => {
    const E2 = make();
    E2.save(state);
    const r = E2.loadSave();
    expect(r.status).toBe('ok');
    expect(r.state).toBeTruthy();
  });
});

describe.each(['v4-save.json', 'v5-phase2-save.json', 'v6-phase25-save.json'])('old save %s', (name) => {
  it('is not loaded: the worker boots a fresh state instead', () => {
    const E = make(fixture(name));
    expect(E.loadSave().status).toBe('old-save');
    expect(E.load()).toBeNull();
    expect(E.checkSave(JSON.parse(fixture(name))).status).toBe('old-save');
    expect((E.load() ?? E.newState())).toBeTruthy();
  });
});
