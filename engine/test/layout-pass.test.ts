// Phase 3 step 1 (layout pass, 2026-11-11): engine data the new screens need. Additive only.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { freshEngine, START, DAY } from './engine-helpers';

const fixture = (name: string) => JSON.parse(readFileSync(resolve(__dirname, 'fixtures', name), 'utf8'));

async function away(ms: number, setup: (E: any, s: any) => void, seed = 1) {
  const h = await freshEngine(seed);
  const s = h.E.newState();
  s.lastSeen = h.now();
  setup(h.E, s);
  h.advance(ms);
  const r = h.E.applyOffline(s, h.now());
  return { h, E: h.E, s, r };
}

describe('return moment: offline summary extras', () => {
  it('headline per skill with levels before/after and newly unlocked actions', async () => {
    const { E, s, r } = await away(6 * 3600000, (E, s) => E.start(s, 'mine_copper'));
    const m = r.summary.skills.find((x: any) => x.skill === 'mining');
    expect(m.from).toBe(1);
    expect(m.to).toBe(E.skillLevel(s, 'mining'));
    expect(m.to).toBeGreaterThan(1);
    const expected = E.actionsFor('mining').filter((a: any) => a.level > 1 && a.level <= m.to).map((a: any) => a.id);
    expect(m.unlocked).toEqual(expected);
    expect(m.unlockedCount).toBe(expected.length);
    expect(m.headline).toContain(`Mining 1 → ${m.to}`);
    if (expected.length) expect(m.headline).toMatch(/new nodes? unlocked/);
    expect(m.xp).toBe(r.summary.xp.mining);
  });

  it('loot grouped by item with per-grade totals that match summary.items; a best find', async () => {
    const { r } = await away(6 * 3600000, (E, s) => E.start(s, 'mine_copper'));
    const { loot, bestFind, items } = r.summary;
    expect(loot.length).toBeGreaterThan(0);
    for (const l of loot) {
      expect(l.qty).toBe(l.byGrade.reduce((a: number, b: number) => a + b, 0));
      expect(l.qty).toBe(items[l.itemId]);
      expect(l.value).toBeGreaterThan(0);
    }
    for (let i = 1; i < loot.length; i++) expect(loot[i - 1].value).toBeGreaterThanOrEqual(loot[i].value);
    expect(bestFind).not.toBeNull();
    expect(loot.some((l: any) => l.itemId === bestFind.itemId)).toBe(true);
    expect(bestFind.qty).toBeGreaterThan(0);
  });

  it('gold by source adds up to the net gold, raid payout separated over a week', async () => {
    const { r } = await away(7 * DAY, (E, s) => E.start(s, 'mine_copper'));
    const sum = r.summary.goldBySource.reduce((a: number, g: any) => a + g.gold, 0);
    expect(sum).toBe(r.summary.gold);
    const raid = r.summary.goldBySource.find((g: any) => g.source === 'raid');
    expect(raid.label).toBe('Raid payout');
    expect(raid.gold).toBeGreaterThan(0);
    // raid floor/chest loot shows up in the grouped loot with raidQty; summary.items keeps action loot only
    expect(r.summary.loot.some((l: any) => l.raidQty > 0)).toBe(true);
    for (const l of r.summary.loot) expect(l.qty - l.raidQty).toBe(r.summary.items[l.itemId] ?? 0);
  });

  it('combat gold is tagged as fighting', async () => {
    const { E, r } = await away(2 * 3600000, (E, s) => {
      const act = E.actionsFor('striker')[0];
      const ok = E.start(s, act.id);
      expect(ok.ok).toBe(true);
    });
    const combat = r.summary.goldBySource.find((g: any) => g.source === 'combat');
    expect(combat && combat.gold).toBeGreaterThan(0);
    void E;
  });

  it('short gaps keep the same summary shape', async () => {
    const h = await freshEngine(1);
    const s = h.E.newState(); s.lastSeen = h.now();
    const r = h.E.applyOffline(s, h.now());
    expect(r.summary.skills).toEqual([]);
    expect(r.summary.bestFind).toBeNull();
    expect(r.summary.loot).toEqual([]);
    expect(r.summary.goldBySource).toEqual([]);
  });
});
