// The ONE grade ladder for every player-facing grade name. It comes from the engine's DATA.grades
// (index 0..4 = Rough, Standard, Fine, Superior, Pristine), the same list the engine uses in its own
// texts ("no bread at Standard grade or better"), so a grade never has two names.
import { DATA } from '@guildwright/engine';

export const GRADE_NAMES: readonly string[] = ((DATA as any).grades as Array<{ name: string }>).map((g) => g.name);

const clampIdx = (i: number) => Math.max(0, Math.min(GRADE_NAMES.length - 1, Math.floor(Number(i) || 0)));

/** "Rough", "Standard", "Fine", "Superior", "Pristine". */
export function gradeName(i: number): string {
  return GRADE_NAMES[clampIdx(i)] ?? '';
}

/** A minimum-grade label for contracts/requests: 0 → "Any grade", 1 → "Standard+", top → "Pristine". */
export function gradeAtLeast(i: number): string {
  const k = clampIdx(i);
  if (k <= 0) return 'Any grade';
  if (k >= GRADE_NAMES.length - 1) return GRADE_NAMES[k];
  return GRADE_NAMES[k] + '+';
}

/** Options for a min-grade picker, index = minGrade. */
export const MIN_GRADE_LABELS: readonly string[] = GRADE_NAMES.map((_, i) => gradeAtLeast(i));
