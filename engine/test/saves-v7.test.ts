// Save schema v7 (owner decision 2026-11-11): this update wipes old saves. Saves older than v7 are NOT
// migrated: checkSave() reports 'old-save', migrate() returns null, E.loadSave() returns status 'old-save'
// with no state, and the caller starts E.newState(). Fixtures: real v4 (prototype), v5 (phase 2) and
// v6 (phase 2.5) saves, kept only to prove they are refused.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { freshEngine, START } from './engine-helpers';

const fixture = (name: string) => JSON.parse(readFileSync(resolve(__dirname, 'fixtures', name), 'utf8'));
const OLD = [['v4-save.json', 4], ['v5-phase2-save.json', 5], ['v6-phase25-save.json', 6]] as const;

describe('save schema v7', () => {
  it('fresh states are v7 with every field the game uses, and no legacy shims', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    expect(s.v).toBe(7);
    expect(E.SCHEMA).toBe(7);
    expect(s.crew.jobsDone).toEqual([]);
    expect('xpScale' in s).toBe(false);
    expect(s.crew.requisitions).toBeUndefined();
    expect(E.checkSave(JSON.parse(JSON.stringify(s)))).toEqual({ ok: true, status: 'ok', version: 7 });
  });

  for (const [f, v] of OLD) {
    it(`a v${v} save (${f}) is refused as 'old-save' and the game starts fresh`, async () => {
      const h = await freshEngine(3, START + 3600000);
      const raw = fixture(f);
      expect(raw.v).toBe(v);
      expect(h.E.checkSave(raw)).toEqual({ ok: false, status: 'old-save', version: v });
      expect(h.E.migrate(raw)).toBeNull();
      // stored: loadSave says why, load() gives null, and the caller's fresh state saves over it
      h.storage.setItem(h.mod.DATA.config.saveKey, JSON.stringify(raw));
      expect(h.E.loadSave()).toEqual({ state: null, status: 'old-save', version: v });
      expect(h.E.load()).toBeNull();
      const s = h.E.load() ?? h.E.newState();
      expect(s.v).toBe(7);
      expect(s.gold).toBe(h.mod.DATA.config.startingGold);
      h.E.save(s);
      expect(h.E.loadSave().status).toBe('ok');
    });
  }

  it('pre-v4 shapes (no version, v1, v3) are old saves too', async () => {
    const { E } = await freshEngine();
    const base = JSON.parse(JSON.stringify(E.newState()));
    for (const v of [undefined, 1, 3]) expect(E.checkSave({ ...base, v }).status).toBe('old-save');
  });

  it('none / corrupt / newer-than-known are told apart', async () => {
    const h = await freshEngine();
    expect(h.E.loadSave()).toEqual({ state: null, status: 'none', version: null });
    h.storage.setItem(h.mod.DATA.config.saveKey, '{not json');
    expect(h.E.loadSave()).toEqual({ state: null, status: 'corrupt', version: null });
    expect(h.E.checkSave('x').status).toBe('corrupt');
    expect(h.E.checkSave({ v: 8, skills: {} })).toEqual({ ok: false, status: 'corrupt', version: 8 });
    expect(h.E.checkSave({ v: 7 })).toEqual({ ok: false, status: 'corrupt', version: 7 });
    expect(h.E.migrate({ v: 8, skills: {} })).toBeNull();
  });

  it('a v7 save round-trips through save/load and keeps playing', async () => {
    const h = await freshEngine(1);
    const s = h.E.newState();
    h.E.start(s, 'mine_copper');
    for (let i = 0; i < 30; i++) { h.advance(1000); h.E.tick(s, 1); }
    h.E.save(s);
    const r = h.E.loadSave();
    expect(r.status).toBe('ok');
    expect(r.version).toBe(7);
    const back = r.state;
    expect(back.gold).toBe(s.gold);
    expect(back.skills.mining.xp).toBe(s.skills.mining.xp);
    expect(back.inv).toEqual(s.inv);
    expect(back.active).toEqual({ actionId: 'mine_copper', progress: s.active.progress });
    expect(back.crew.jobsDone).toEqual(s.crew.jobsDone);
    expect(() => h.E.tick(back, 1)).not.toThrow();
  });
});
