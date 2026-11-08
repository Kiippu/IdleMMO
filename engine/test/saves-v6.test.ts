// Phase 2.5 saves: schema v6. Real fixtures:
//   fixtures/v4-save.json         written by the legacy prototype engine (index.html, schema v4)
//   fixtures/v5-phase2-save.json  written by the phase-2 TS engine (schema v5) with spec, a manual
//                                 requisition, viewAsMember, farm runs and a legacy `at` log entry
// Both must load, play, and survive a week rollover and a raid.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { freshEngine, resolveRaidByClock, START, DAY } from './engine-helpers';

const fixture = (name: string) => JSON.parse(readFileSync(resolve(__dirname, 'fixtures', name), 'utf8'));

function playAWeek(h: any, s: any) {
  // tick through to next Monday, then through that week's raid
  h.setNow(START + 7 * DAY + 3600000);
  h.E.tick(s, 1);
  expect(s.week).toBe(2);
  const open = h.E.listContracts(s).filter((k: any) => k.status === 'open');
  expect(open.length).toBeGreaterThan(0);
  const { recap } = resolveRaidByClock(h, s);
  expect(recap.week).toBe(2);
}

describe('v4 fixture (legacy prototype save) → v6', () => {
  it('loads, folds coin into gold, strips cut fields and plays', async () => {
    const h = await freshEngine(3, START + 3600000);
    const raw = fixture('v4-save.json');
    expect(raw.v).toBe(4);
    const s = h.E.migrate(raw);
    expect(s).not.toBeNull();
    expect(s.v).toBe(6);
    expect(s.gold).toBe(4321);
    expect(s.skills.mining.xp).toBe(raw.skills.mining.xp);
    expect(s.tokens).toBeUndefined();
    expect(s.supply).toBeUndefined();
    expect(s.crew.viewAsMember).toBeUndefined();
    expect(s.raid.farm).toBeUndefined();
    expect(s.crew.treasury.coin).toBeUndefined();
    expect(s.crew.treasury.gold + s.crew.treasury.escrow).toBe(raw.crew.treasury.coin + raw.crew.treasury.escrow);
    expect(s.rep).toBe(0);
    expect(s.spec).toEqual({ skillId: null, lastSwitchAt: null, capped: [] });
    expect(Array.isArray(s.crew.contracts)).toBe(true);
    expect(() => h.E.tick(s, 1)).not.toThrow();
    playAWeek(h, s);
  });

  it('round-trips through save/load', async () => {
    const h = await freshEngine(3, START + 3600000);
    const s = h.E.migrate(fixture('v4-save.json'));
    h.E.save(s);
    const back = h.E.load();
    expect(back.v).toBe(6);
    expect(back.gold).toBe(s.gold);
  });
});

describe('phase-2 v5 fixture → v6', () => {
  it('loads with spec kept, cut fields stripped, legacy `at` log entry normalised', async () => {
    const h = await freshEngine(4, START + 3600000);
    const raw = fixture('v5-phase2-save.json');
    expect(raw.v).toBe(5);
    const s = h.E.migrate(raw);
    expect(s.v).toBe(6);
    expect(s.gold).toBe(raw.gold);
    expect(s.spec.skillId).toBe('mining');
    expect(s.spec.capped).toEqual([]);
    expect(s.crew.viewAsMember).toBeUndefined();
    expect(s.raid.farm).toBeUndefined();
    const legacy = s.crew.treasury.log.find((e: any) => e.reason === 'legacy at entry');
    expect(legacy).toBeTruthy();
    expect(typeof legacy.t).toBe('number');
    expect(legacy.at).toBeUndefined();
    // the player's own (manual) requisition survives with its escrow
    const manual = s.crew.requisitions.find((r: any) => r.source === 'manual');
    expect(manual.status).toBe('open');
    expect(manual.escrow).toBe(15);
    expect(() => h.E.tick(s, 1)).not.toThrow();
    playAWeek(h, s);
  });

  it('open NPC-posted (leader) requisitions are closed and their escrow returned to free gold', async () => {
    const h = await freshEngine(4, START + 3600000);
    const raw = fixture('v5-phase2-save.json');
    raw.crew.requisitions.unshift({ id: 'Qnpc', itemId: 'bread', qty: 20, rewardPer: 2, minGrade: 1, note: 'Weekly raid stock', filled: 0, escrow: 40, paid: 0,
      postedBy: 'Merrick', postedAt: START, week: 1, source: 'leader', status: 'open', submissions: [] });
    raw.crew.treasury.escrow += 40;
    const total = raw.crew.treasury.gold + raw.crew.treasury.escrow;
    const s = h.E.migrate(raw);
    const r = s.crew.requisitions.find((x: any) => x.id === 'Qnpc');
    expect(r.status).toBe('cancelled');
    expect(r.escrow).toBe(0);
    expect(h.E.crewGold(s).total).toBe(total);
    expect(s.crew.treasury.log.some((e: any) => e.kind === 'release' && e.escrowDelta === -40)).toBe(true);
  });

  it('a v6 save round-trips unchanged in shape', async () => {
    const h = await freshEngine();
    const s = h.E.newState();
    s.rep = 12; s.spec.capped = ['mining'];
    const out = h.E.migrate(JSON.parse(JSON.stringify(s)));
    expect(out.v).toBe(6);
    expect(out.rep).toBe(12);
    expect(out.spec.capped).toEqual(['mining']);
    expect(out.crew.contracts.map((k: any) => k.id)).toEqual(s.crew.contracts.map((k: any) => k.id));
  });
});
