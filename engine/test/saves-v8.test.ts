// Save schema v8 (gear overhaul 2026-11-12; v7 was 2026-11-11): saves older than v8 are NOT migrated:
// checkSave() reports 'old-save', migrate() returns null, E.loadSave() returns status 'old-save' with no state,
// and the caller starts E.newState(). Fixtures: real v4 (prototype), v5 (phase 2), v6 (phase 2.5) and v7 (phase 3)
// saves, kept only to prove they are refused; v8-gear-save.json is a real v8 save that must keep loading.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { freshEngine, START } from './engine-helpers';

const fixture = (name: string) => JSON.parse(readFileSync(resolve(__dirname, 'fixtures', name), 'utf8'));
const OLD = [['v4-save.json', 4], ['v5-phase2-save.json', 5], ['v6-phase25-save.json', 6], ['v7-phase3-save.json', 7]] as const;

describe('save schema v8', () => {
  it('fresh states are v8 with every field the game uses, and no legacy shims', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    expect(s.v).toBe(8);
    expect(E.SCHEMA).toBe(8);
    expect(s.crew.jobsDone).toEqual([]);
    expect('xpScale' in s).toBe(false);
    expect(s.crew.requisitions).toBeUndefined();
    expect(E.checkSave(JSON.parse(JSON.stringify(s)))).toEqual({ ok: true, status: 'ok', version: 8 });
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
      expect(s.v).toBe(8);
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
    expect(h.E.checkSave({ v: 9, skills: {} })).toEqual({ ok: false, status: 'corrupt', version: 9 });
    expect(h.E.checkSave({ v: 8 })).toEqual({ ok: false, status: 'corrupt', version: 8 });
    expect(h.E.migrate({ v: 9, skills: {} })).toBeNull();
  });

  it('a v8 save round-trips through save/load and keeps playing', async () => {
    const h = await freshEngine(1);
    const s = h.E.newState();
    h.E.start(s, 'mine_copper');
    for (let i = 0; i < 30; i++) { h.advance(1000); h.E.tick(s, 1); }
    h.E.save(s);
    const r = h.E.loadSave();
    expect(r.status).toBe('ok');
    expect(r.version).toBe(8);
    const back = r.state;
    expect(back.gold).toBe(s.gold);
    expect(back.skills.mining.xp).toBe(s.skills.mining.xp);
    expect(back.inv).toEqual(s.inv);
    expect(back.active).toEqual({ actionId: 'mine_copper', progress: s.active.progress });
    expect(back.crew.jobsDone).toEqual(s.crew.jobsDone);
    expect(() => h.E.tick(back, 1)).not.toThrow();
  });

  it('fresh state: fight starter kit worn, a Common T1 tool in all 15 tool slots, empty work outfit', async () => {
    const { E, mod } = await freshEngine();
    const s = E.newState();
    expect(Object.keys(s.equipped)).toEqual(['weapon', 'offhand', 'head', 'chest', 'legs', 'ring1', 'ring2', 'amulet']);
    expect(mod.DATA.items[s.gear.find((g: any) => g.uid === s.equipped.weapon).itemId].id).toBe('bronze_sword');
    expect(Object.keys(s.tools)).toHaveLength(15);
    for (const k of Object.keys(s.tools)) {
      const g = s.gear.find((x: any) => x.uid === s.tools[k]); const it = mod.DATA.items[g.itemId];
      expect(it.section).toBe('tool'); expect(it.toolSkill).toBe(k); expect(it.tier).toBe(1);
      expect(g.rarity).toBe('common'); expect(g.cond).toBe(100); expect(g.dur).toBeUndefined();
    }
    for (const set of ['gather', 'refine', 'craft']) expect(Object.values(s.workOutfit[set])).toEqual([null, null, null, null]);
    expect(s.loadouts[0].boundTo).toBeUndefined();
  });

  it('a real v8 save (v8-gear-save.json) loads: rings, outfit, tools and worn condition kept', async () => {
    const h = await freshEngine(2, START + 3600000);
    const raw = fixture('v8-gear-save.json');
    h.storage.setItem(h.mod.DATA.config.saveKey, JSON.stringify(raw));
    const r = h.E.loadSave(); expect(r.status).toBe('ok'); const s = r.state;
    expect(s.equipped.ring1).toBe('g9001');
    expect(s.workOutfit.gather.hands).toBe('g9002');
    expect(s.gear.find((g: any) => g.uid === s.tools.mining).cond).toBeCloseTo(41.5);
    expect(h.E.workBonus(s, 'mining').wear).toBe(3);
    h.advance(1000); expect(() => h.E.tick(s, 1)).not.toThrow();
  });

  it('migrate drops worn uids that are in the wrong section or slot', async () => {
    const { E } = await freshEngine();
    const s = JSON.parse(JSON.stringify(E.newState()));
    const tool = s.tools.mining; s.equipped.head = tool; s.tools.woodcutting = tool; s.workOutfit.craft.head = s.equipped.weapon;
    const m = E.migrate(s);
    expect(m.equipped.head).toBeNull(); expect(m.tools.woodcutting).toBeNull(); expect(m.tools.mining).toBe(tool);
    expect(m.workOutfit.craft.head).toBeNull();
  });
});
