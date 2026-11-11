// Turns engine `gain` events into "things the player just obtained" for the item fountain (offline gains skipped).
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';
export type Gain = { itemId: string; qty: number; rarity: Rarity };
type Ev = { type: string; [k: string]: any };
type Item = { itemId: string; qty?: number; rarity?: string; uid?: string };

export const RARITY_RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };

const asRarity = (r: unknown, fallback: Rarity): Rarity => (typeof r === 'string' && r in RARITY_RANK ? (r as Rarity) : fallback);

export function gainsFromEvents(evs: Ev[] | null | undefined, itemRarity: Record<string, string>): Gain[] {
  if (!evs?.length) return [];
  const out: Gain[] = [];
  const push = (it: Item, rarity?: string) => {
    const qty = Math.floor(Number(it.qty ?? 1));
    if (!it.itemId || !(qty > 0)) return;
    out.push({ itemId: it.itemId, qty, rarity: asRarity(it.rarity ?? rarity, asRarity(itemRarity[it.itemId], 'common')) });
  };

  for (const e of evs) if (e.type === 'gain' && !e.offline) for (const it of e.items ?? []) push(it);
  return out;
}

export type Pop = { itemId: string; rarity: Rarity; more?: number };

/** One pop per unit. Past `cap` pops the surplus folds into the last pop as a "+N" badge, so it never stalls. */
export function toPops(gains: Gain[], cap: number): Pop[] {
  if (cap <= 0) return [];
  const pops: Pop[] = [];
  let surplus = 0;
  for (const g of gains) for (let i = 0; i < g.qty; i++) {
    if (pops.length < cap) pops.push({ itemId: g.itemId, rarity: g.rarity }); else surplus++;
  }
  if (surplus && pops.length) pops[pops.length - 1].more = surplus;
  return pops;
}
