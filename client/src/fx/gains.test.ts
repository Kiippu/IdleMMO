import { describe, it, expect } from 'vitest';
import { gainsFromEvents, toPops } from './gains';

const R = { copper_ore: 'common', sword: 'rare' };
describe('gainsFromEvents', () => {
  it('uses gain events only and skips offline ones', () => {
    const g = gainsFromEvents([
      { type: 'complete', items: [{ itemId: 'copper_ore', qty: 3 }] },
      { type: 'gain', source: 'gather', items: [{ itemId: 'copper_ore', qty: 3, rarity: 'common' }] },
      { type: 'gain', source: 'gather', offline: true, items: [{ itemId: 'copper_ore', qty: 50, rarity: 'common' }] },
    ], R);
    expect(g).toEqual([{ itemId: 'copper_ore', qty: 3, rarity: 'common' }]);
  });
});
describe('toPops', () => {
  it('one pop per unit up to the cap', () => {
    expect(toPops([{ itemId: 'a', qty: 50, rarity: 'common' }], 200)).toHaveLength(50);
    expect(toPops([{ itemId: 'a', qty: 39, rarity: 'uncommon' }], 150)).toHaveLength(39);
    expect(toPops([{ itemId: 'a', qty: 3, rarity: 'common' }], 0)).toEqual([]);
  });
  it('a haul over the cap becomes stacked pops that still add up', () => {
    const gains = [{ itemId: 'a', qty: 3000, rarity: 'common' as const }, { itemId: 'b', qty: 2, rarity: 'epic' as const }];
    const p = toPops(gains, 120);
    expect(p.length).toBeLessThanOrEqual(120);
    expect(p.some((x) => x.itemId === 'b')).toBe(true);
    const sum = (id: string) => p.filter((x) => x.itemId === id).reduce((n, x) => n + (x.stack ?? 1), 0);
    expect(sum('a')).toBe(3000); expect(sum('b')).toBe(2);
  });
});
