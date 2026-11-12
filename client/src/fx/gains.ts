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

export type Pop = { itemId: string; rarity: Rarity; /** units this pop stands for when a haul is bigger than the cap (shown as "x3") */ stack?: number };

/** One pop per unit. When the haul is bigger than `cap`, each item gets a share of the pops
 *  (at least one) and every pop stands for several units, so a huge haul still reads as everything popping. */
export function toPops(gains: Gain[], cap: number): Pop[] {
  if (cap <= 0) return [];
  const total = gains.reduce((n, g) => n + g.qty, 0);
  const pops: Pop[] = [];
  if (total <= cap) {
    for (const g of gains) for (let i = 0; i < g.qty; i++) pops.push({ itemId: g.itemId, rarity: g.rarity });
    return pops;
  }
  // rarest first so the cap never drops the best find; every item gets at least one pop while there is room
  const order = [...gains].sort((a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity]);
  let room = cap;
  for (let k = 0; k < order.length && room > 0; k++) {
    const g = order[k];
    const left = order.length - k - 1;
    const n = Math.max(1, Math.min(g.qty, Math.floor((g.qty * cap) / total), room - left));
    const per = Math.ceil(g.qty / n);
    let rest = g.qty;
    let used = 0;
    for (let i = 0; i < n && rest > 0; i++) { used++; const st = Math.min(per, rest); rest -= st; pops.push({ itemId: g.itemId, rarity: g.rarity, stack: st > 1 ? st : undefined }); }
    room -= used;
  }
  return pops;
}
