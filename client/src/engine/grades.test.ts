import { describe, it, expect } from 'vitest';
import { DATA } from '@guildwright/engine';
import { GRADE_NAMES, gradeName, gradeAtLeast, MIN_GRADE_LABELS } from './grades';

describe('one grade ladder', () => {
  it('comes from the engine data, so the client and engine texts use the same names', () => {
    expect(GRADE_NAMES).toEqual((DATA as any).grades.map((g: any) => g.name));
    expect(GRADE_NAMES).toEqual(['Rough', 'Standard', 'Fine', 'Superior', 'Pristine']);
    expect(gradeName(1)).toBe('Standard');
    expect(gradeName(9)).toBe('Pristine');
    expect(MIN_GRADE_LABELS).toEqual(['Any grade', 'Standard+', 'Fine+', 'Superior+', 'Pristine']);
    expect(gradeAtLeast(2)).toBe('Fine+');
  });
});
