// Icon atlas lookup. The atlas and manifest are built by `npm run art` (scripts/art/build.py).
import manifest from './icons.json';

export type IconManifest = {
  cell: number; cols: number; rows: number;
  items: Record<string, number>; generic: Record<string, number>; named: Record<string, number>; pack: Record<string, string>;
};
export const ICONS = manifest as IconManifest;
export type ItemMeta = { sprite?: string; kind?: string; tint?: string | null };
export type ResolvedIcon = { index: number; col: number; row: number; fallback: boolean; tint: string | null };

const at = (index: number, fallback: boolean, tint: string | null): ResolvedIcon =>
  ({ index, col: index % ICONS.cols, row: Math.floor(index / ICONS.cols), fallback, tint });

/** Item id to atlas cell. Missing art falls back to the grey generic icon for the item's sprite kind (the client
 *  multiplies it by the item's tint), then the generic for its category, then the generic item icon. Never blank. */
export function resolveIcon(id: string, meta?: ItemMeta): ResolvedIcon {
  const own = ICONS.items[id];
  if (own !== undefined) return at(own, false, null);
  const tint = meta?.tint ?? null;
  const g = meta?.sprite ? ICONS.generic[meta.sprite] : undefined;
  if (g !== undefined) return at(g, true, tint);
  const k = meta?.kind ? ICONS.generic[meta.kind] : undefined;
  if (k !== undefined) return at(k, true, tint);
  return at(ICONS.generic.item, true, tint);
}

export function resolveNamed(name: string): ResolvedIcon {
  const i = ICONS.named[name];
  return i !== undefined ? at(i, false, null) : at(ICONS.generic.item, true, null);
}
