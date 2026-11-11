import { describe, it, expect } from 'vitest';
import { fmtG, fmtN, fmtFull, fmtCompact, hasPayout } from './format';

describe('format', () => {
  it('formats small gold with separators', () => { expect(fmtG(640)).toBe('640g'); expect(fmtG(9999.9)).toBe('9,999g'); });
  it('formats big gold compactly', () => { expect(fmtG(55000.9)).toBe('55k\u00a0g'); expect(fmtG(12699)).toBe('12.6k\u00a0g'); });
  it('formats big numbers compactly', () => { expect(fmtN(1728000)).toBe('1.7M'); expect(fmtN(12640)).toBe('12.6k'); expect(fmtN(1234567)).toBe('1.2M'); });
  it('compact never overstates or shows .0', () => { expect(fmtCompact(10000)).toBe('10k'); expect(fmtCompact(999999)).toBe('999.9k'); expect(fmtCompact(1e6)).toBe('1M'); expect(fmtCompact(2.5e9)).toBe('2.5B'); });
  it('compact handles odd input', () => { expect(fmtCompact(NaN)).toBe('0'); expect(fmtCompact(-12640)).toBe('−12.6k'); expect(fmtCompact(-0.4)).toBe('0'); });
  it('fmtFull keeps every digit', () => expect(fmtFull(1728000)).toBe('1,728,000'));
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
