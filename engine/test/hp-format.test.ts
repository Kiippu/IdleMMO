import { describe, it, expect } from 'vitest';
import { fmtHpNow, fmtHpTotal, fmtHpAmount, fmtHpDelta, statText } from '../src/gear';

// Health display rule (owner 2026-11-13): never "0" while alive, never "+0", whole totals,
// one decimal only for small amounts under 10.
describe('health display', () => {
  it('current HP rounds up so a living hero never shows 0', () => {
    expect(fmtHpNow(0.2)).toBe('1');
    expect(fmtHpNow(0.6)).toBe('1');
    expect(fmtHpNow(137.4)).toBe('138');
    expect(fmtHpNow(137)).toBe('137');
    expect(fmtHpNow(0)).toBe('0');
  });
  it('max HP and totals are whole', () => {
    expect(fmtHpTotal(137.4)).toBe('137');
    expect(fmtHpTotal(67.6)).toBe('68');
  });
  it('small amounts keep one decimal under 10, whole from 10 up', () => {
    expect(fmtHpAmount(0.2)).toBe('0.2');
    expect(fmtHpAmount(3.6)).toBe('3.6');
    expect(fmtHpAmount(3)).toBe('3');
    expect(fmtHpAmount(17.4)).toBe('17');
    expect(fmtHpAmount(20.4)).toBe('20');
  });
  it('changes never read +0', () => {
    for (let k = 1; k <= 500; k++) {
      const v = k * 0.2;
      expect(fmtHpDelta(v)).not.toBe('+0');
      expect(fmtHpDelta(-v)).not.toBe('−0');
    }
    expect(fmtHpDelta(-3.6)).toBe('−3.6');
    expect(statText('hp', 0.2)).toBe('Max HP +0.2');
    expect(statText('hp', 17.4)).toBe('Max HP +17');
  });
});
