import { describe, it, expect } from 'vitest';
import { groupGear, nextSelCount, protectedUids, commonPicks, pickedUids, hiddenPicks } from './gearStack';

const grades = [{ min: 1 }, { min: 40 }, { min: 60 }, { min: 80 }, { min: 95 }];
const g = (uid: string, over: any = {}) => ({ uid, itemId: 'bronze_sword', rarity: 'common', quality: 50, dur: 10, maxDur: 10, ...over });

describe('groupGear', () => {
  it('stacks identical common pieces and keeps others single', () => {
    const prot = protectedUids({ weapon: 'e' }, [{ slots: { head: 'l' } }]);
    const rows = groupGear([g('a'), g('b'), g('c', { quality: 70 }), g('d', { rarity: 'uncommon' }), g('e'), g('l'), g('m', { dur: 5 }), g('n')], prot, grades);
    expect(rows.map((r) => r.items.map((x) => x.uid).join(''))).toEqual(['abn', 'c', 'd', 'e', 'l', 'm']);
    expect(rows[0].key).toBe('bronze_sword|1');
    expect(rows[3].key).toBeNull();
  });
});
describe('nextSelCount', () => {
  it('cycles 1, 10, all, none', () => {
    expect([0, 1, 10, 25].map((c) => nextSelCount(c, 25))).toEqual([1, 10, 25, 0]);
    expect(nextSelCount(0, 1)).toBe(1); expect(nextSelCount(1, 1)).toBe(0);
    expect(nextSelCount(1, 5)).toBe(5);
  });
});

describe('selection helpers', () => {
  const tiles = [
    { key: 'gs:a', rarity: 'common', uids: ['a1', 'a2', 'a3'] },
    { key: 'g:l', rarity: 'common', uids: ['l'] },
    { key: 'g:r', rarity: 'rare', uids: ['r'] },
    { key: 'g:x', rarity: 'common', uids: ['x'] },
  ];
  it('commonPicks skips protected pieces and non-commons', () => {
    expect(commonPicks(tiles, new Set(['l', 'a2']))).toEqual({ 'gs:a': 2, 'g:x': 1 });
  });
  it('pickedUids covers all tiles, hiddenPicks counts picks on hidden tiles', () => {
    const sel = { 'gs:a': 2, 'g:x': 1 };
    expect(pickedUids(tiles, sel)).toEqual(['a1', 'a2', 'x']);
    expect(hiddenPicks(sel, new Set(['g:x']))).toBe(2);
    expect(hiddenPicks(sel, new Set(['gs:a', 'g:x']))).toBe(0);
  });
});
