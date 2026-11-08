import { describe, it, expect } from 'vitest';
import { fmtG, fmtN, hasPayout } from './format';

describe('format', () => {
  it('formats gold with separators', () => expect(fmtG(55000.9)).toBe('55,000g'));
  it('formats big numbers with separators', () => expect(fmtN(1728000)).toBe('1,728,000'));
  it('hasPayout is false for a recap saved before payouts existed', () => {
    expect(hasPayout(undefined)).toBe(false);
    expect(hasPayout({ items: {} })).toBe(false);
    expect(hasPayout({ gold: 12 })).toBe(false);
  });
  it('hasPayout is true for a recap with a pool', () => {
    expect(hasPayout({ pool: 0, gold: 0 })).toBe(true);
    expect(hasPayout({ pool: 85409, gold: 16654, turnout: 1, contribution: 0.75 })).toBe(true);
  });
});
