// Affix roll colours (owner 2026-11-13): every secondary affix line carries its range (tier value x 0.8 … x 1.2), where the
// roll sits in it (rollPct) and a colour band (rollTier). The primary bonus and fixed Enduring carry none.
import { describe, expect, it } from 'vitest';
import { freshEngine } from './engine-helpers';

describe('affix roll colours', () => {
  it('band edges: < 0.40 common, < 0.70 uncommon, < 0.88 rare, < 0.97 epic, >= 0.97 legendary', async () => {
    const { rollTierOf } = await import('../src/index');
    expect([0, 0.3999, 0.4, 0.6999, 0.7, 0.8799, 0.88, 0.9699, 0.97, 1].map(rollTierOf))
      .toEqual(['common', 'common', 'uncommon', 'uncommon', 'rare', 'rare', 'epic', 'epic', 'legendary', 'legendary']);
  });

  it('fight affix: range, value and band; the primary bonus and Enduring have no roll fields', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    // T1 sword slot budget 60 x 0.66 = 39.6; Hale = 39.6 x 5% x 2.5 x roll (x10 HP) / 5 → HP x2 scale; of Embers = 5% x roll
    s.gear.push({ uid: 'w', itemId: 'bronze_sword', rarity: 'epic', quality: 50, dur: 200, maxDur: 200,
      affixes: [{ id: 'primary', roll: 1 }, { id: 'hale', roll: 1.2 }, { id: 'of_embers', roll: 0.9 }, { id: 'enduring', roll: 1 }] });
    const a = E.gearDetail(s, 'w').affixes;
    expect(a[0]).toMatchObject({ id: 'primary', primary: true }); expect(a[0].rollTier).toBeUndefined(); expect(a[0].min).toBeUndefined();
    expect(a[1]).toMatchObject({ id: 'hale', primary: false, min: 0.8, max: 1.2, minText: '+0.8', maxText: '+1.2', rangeText: '+0.8 to +1.2', valueText: '+1.2', rollPct: 1, rollTier: 'legendary' });
    expect(a[2]).toMatchObject({ id: 'of_embers', min: 4, max: 6, minText: '+4.0%', maxText: '+6.0%', rangeText: '+4.0% to +6.0%', valueText: '+4.5%', rollPct: 0.25, rollTier: 'common' });
    expect(a[3]).toMatchObject({ id: 'enduring', fixed: true }); expect(a[3].rollTier).toBeUndefined();
  });

  it('work affix: range text with the effect formatter', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    // T1 Brisk = 0.3% speed x roll → 0.24 … 0.36; T3 Masterful = 2 quality pts x roll → 1.6 … 2.4
    s.gear.push({ uid: 't', itemId: 'bronze_pickaxe', rarity: 'rare', quality: 50, cond: 100, affixes: [{ id: 'primary', roll: 1 }, { id: 'brisk', roll: 1.15 }] });
    s.gear.push({ uid: 'c', itemId: 'silk_craft_cap', rarity: 'rare', quality: 50, affixes: [{ id: 'primary', roll: 1 }, { id: 'masterful', roll: 1.05 }] });
    const b = E.gearDetail(s, 't').affixes[1];
    expect(b).toMatchObject({ id: 'brisk', min: 0.24, max: 0.36, minText: '+0.24%', maxText: '+0.36%', rangeText: '+0.24% to +0.36%', valueText: '+0.35%', rollTier: 'rare' });
    expect(b.rollPct).toBeCloseTo(0.875, 9); // (1.15 - 0.8) / 0.4 = 0.875, just under the epic band (0.88)
    const m = E.gearDetail(s, 'c').affixes[1];
    expect(m).toMatchObject({ id: 'masterful', min: 1.6, max: 2.4, minText: '+1.6', maxText: '+2.4', rangeText: '+1.6 to +2.4', valueText: '+2.1', rollPct: 0.625, rollTier: 'uncommon' });
  });
});
