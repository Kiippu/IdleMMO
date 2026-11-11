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
  it('one pop per unit, surplus folded into the last pop', () => {
    expect(toPops([{ itemId: 'a', qty: 50, rarity: 'common' }], 200)).toHaveLength(50);
    const p = toPops([{ itemId: 'a', qty: 300, rarity: 'common' }], 120);
    expect(p).toHaveLength(120); expect(p[119].more).toBe(180);
    expect(toPops([{ itemId: 'a', qty: 3, rarity: 'common' }], 0)).toEqual([]);
  });
});
