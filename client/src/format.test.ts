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

import { fmtDuration } from './format';
describe('fmtDuration', () => {
  it('never shows seconds', () => {
    expect(fmtDuration(2 * 86400 + 4 * 3600 + 5)).toBe('2d 4h');
    expect(fmtDuration(5340)).toBe('1h 29m');
    expect(fmtDuration(30)).toBe('<1m');
    expect(fmtDuration(0)).toBe('now');
  });
});

import { fmtAgo, rarityRank } from './format';
describe('fmtAgo / rarityRank', () => {
  it('relative times', () => {
    const now = Date.UTC(2026, 10, 8, 12, 0, 0);
    expect(fmtAgo(now - 10_000, now)).toBe('just now');
    expect(fmtAgo(now - 5 * 60_000, now)).toBe('5m ago');
    expect(fmtAgo(now - 2 * 3600_000, now)).toBe('2h ago');
  });
  it('ranks rarity', () => { expect(rarityRank('rare')).toBe(2); expect(rarityRank(undefined)).toBe(0); });
});

import { fmtSecs } from './format';
describe('fmtSecs', () => { it('formats', () => { expect(fmtSecs(100)).toBe('1m 40s'); expect(fmtSecs(17)).toBe('17s'); expect(fmtSecs(1.5)).toBe('1.5s'); }); });
