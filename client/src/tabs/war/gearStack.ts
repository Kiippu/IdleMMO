// Groups identical spare common gear into one stack so a bag of 40 Bronze Swords reads as one row.
// Only plain pieces stack: common, unequipped, in no saved loadout, full durability. Same itemId and same grade
// means identical stats (gear stats depend on rarity and grade only), so any piece of a stack is interchangeable.
export type StackGear = { uid: string; itemId: string; rarity: string; quality: number; dur: number; maxDur: number };
export type GradeBand = { min?: number };

export function gradeIdx(quality: number, grades: GradeBand[]): number {
  const q = Math.max(1, Math.min(100, Math.round(Number(quality) || 50)));
  for (let i = grades.length - 1; i >= 0; i--) if (q >= (grades[i].min ?? 0)) return i;
  return 0;
}

/** uids that are worn or sit in a saved loadout. */
export function protectedUids(equipped: Record<string, string | null | undefined>, loadouts: Array<{ slots?: Record<string, string | null | undefined> }>): Set<string> {
  const s = new Set<string>();
  for (const u of Object.values(equipped ?? {})) if (u) s.add(u);
  for (const l of loadouts ?? []) for (const u of Object.values(l?.slots ?? {})) if (u) s.add(u);
  return s;
}

export const stackable = (g: StackGear, prot: Set<string>) => g.rarity === 'common' && !prot.has(g.uid) && g.dur >= g.maxDur;

/** Returns the stack key for a piece, or null when it stays a single row. */
export function stackKey(g: StackGear, prot: Set<string>, grades: GradeBand[]): string | null {
  return stackable(g, prot) ? `${g.itemId}|${gradeIdx(g.quality, grades)}` : null;
}

/** Groups pieces (order kept; a stack sits where its first piece was). Singles come back as a group of one with key null. */
export function groupGear<T extends StackGear>(list: T[], prot: Set<string>, grades: GradeBand[], keyOf?: (g: T) => string | null | undefined): Array<{ key: string | null; items: T[] }> {
  const out: Array<{ key: string | null; items: T[] }> = [];
  const at = new Map<string, number>();
  for (const g of list) {
    const k = keyOf ? (keyOf(g) ?? null) : stackKey(g, prot, grades);
    if (k === null) { out.push({ key: null, items: [g] }); continue; }
    const i = at.get(k);
    if (i === undefined) { at.set(k, out.length); out.push({ key: k, items: [g] }); } else out[i].items.push(g);
  }
  return out;
}

/** Tap-to-cycle selection count for a stack of n: 0 → 1 → 10 → all → 0 (steps >= n are skipped). */
export function nextSelCount(cur: number, n: number): number {
  const steps = [1, 10].filter((s) => s < n).concat(n);
  const i = steps.indexOf(cur);
  return i < 0 ? steps[0] : i + 1 >= steps.length ? 0 : steps[i + 1];
}

type PickTile = { key: string; rarity: string; uids?: string[] };

/** "Select all common": every common tile, counting only pieces that are not protected (worn or in a loadout). */
export function commonPicks(tiles: PickTile[], prot: Set<string>): Record<string, number> {
  const m: Record<string, number> = {};
  for (const t of tiles) {
    if (t.rarity !== 'common') continue;
    const n = (t.uids ?? []).filter((u) => !prot.has(u)).length;
    if (n > 0) m[t.key] = n;
  }
  return m;
}

/** Uids for the current picks, from every tile (visible or not) so the count and the confirm list always agree. */
export function pickedUids(tiles: PickTile[], sel: Record<string, number>): string[] {
  return tiles.flatMap((t) => (t.uids ?? []).slice(0, sel[t.key] ?? 0));
}

/** How many picked pieces sit on tiles the current filter hides. */
export function hiddenPicks(sel: Record<string, number>, visibleKeys: Set<string>): number {
  return Object.entries(sel).reduce((a, [k, n]) => a + (visibleKeys.has(k) ? 0 : n), 0);
}
