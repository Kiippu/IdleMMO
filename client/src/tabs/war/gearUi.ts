// Shared labels and helpers for the three Loadout sections (Fight, Work outfit, Tools). Numbers are shown as the engine returns them.
import { DATA } from '@guildwright/engine';

export const FIGHT_SLOTS = ['weapon', 'offhand', 'head', 'chest', 'legs', 'ring1', 'ring2', 'amulet'] as const;
export type FightSlot = (typeof FIGHT_SLOTS)[number];
export const SLOT_LABEL: Record<string, string> = { weapon: 'Weapon', offhand: 'Offhand', head: 'Head', chest: 'Chest', legs: 'Legs', ring: 'Ring', ring1: 'Ring 1', ring2: 'Ring 2', amulet: 'Amulet', body: 'Body', hands: 'Hands', feet: 'Feet' };
export const SET_LABEL: Record<string, string> = { gather: 'Gather', refine: 'Refine', craft: 'Craft' };
export const SET_BLURB: Record<string, string> = { gather: 'Mining, woodcutting, herbalism, fishing', refine: 'Smelting, carpentry, tanning, weaving', craft: 'Smithing, woodworking, leatherworking, tailoring, jewelcrafting, alchemy, cooking' };
export const OUTFIT_PIECES = ['head', 'body', 'hands', 'feet'] as const;
export const ELEMENT_NAME: Record<string, string> = { fire: 'Fire', frost: 'Frost', venom: 'Poison', holy: 'Holy' };
export const STAT_LABEL: Record<string, string> = { hp: 'HP', atk: 'Attack', def: 'Defence', heal: 'Healing', power: 'Power' };
export const elementName = (e: string | null | undefined) => (e ? ELEMENT_NAME[e] ?? e[0].toUpperCase() + e.slice(1) : '');

const FALLBACK_EFFECTS = [
  { id: 'speed', name: 'Speed', unit: 'pct' }, { id: 'double', name: 'Double output', unit: 'pct' }, { id: 'save', name: 'Save input', unit: 'pct' },
  { id: 'quality', name: 'Quality', unit: 'pts' }, { id: 'find', name: 'Bonus find', unit: 'pct' }, { id: 'rarity', name: 'Rarity odds', unit: 'pct' },
];
export const EFFECTS: Array<{ id: string; name: string; unit: string; cap?: number }> = ((DATA as any).effects as any[] | undefined) ?? FALLBACK_EFFECTS;
export const effectName = (id: string) => EFFECTS.find((e) => e.id === id)?.name ?? id;
const trim = (v: number) => (Math.round(v * 100) / 100).toString();
/** "+1.0%" or "+2" (quality points), in display units. */
export function fmtEffectValue(id: string, v: number): string {
  const unit = EFFECTS.find((e) => e.id === id)?.unit ?? 'pct';
  const r = Math.round(Math.abs(v) * 100) / 100;
  const s = unit === 'pts' ? trim(r) : Number.isInteger(Math.round(r * 10 * 1e6) / 1e6) ? r.toFixed(1) : r.toFixed(2);
  return `${v < 0 ? '−' : '+'}${s}${unit === 'pts' ? '' : '%'}`;
}
export const fmtEffect = (id: string, v: number) => `${effectName(id)} ${fmtEffectValue(id, v)}`;

const AFFIX_TAG: Record<string, string> = {
  savage: 'atk', sturdy: 'def', soothing: 'heal', hale: 'hp', of_embers: 'fire', of_rime: 'frost', of_venom: 'venom', of_dawn: 'holy',
  warded_fire: 'fire', warded_frost: 'frost', warded_venom: 'venom', warded_holy: 'holy',
  brisk: 'speed', bountiful: 'double', prolific: 'double', keen_eyed: 'find', thrifty: 'save', masterful: 'quality', fortunate: 'rarity',
};
/** Filter tags for a fight piece: its stats, its element and its affixes. */
export function fightTags(piece: any, item: any): Set<string> {
  const t = new Set<string>();
  for (const k of ['atk', 'def', 'heal', 'hp']) if ((item?.stats?.[k] ?? 0) > 0) t.add(k);
  if (item?.element) t.add(item.element);
  for (const a of piece?.affixes ?? []) { const x = AFFIX_TAG[a.id]; if (x) t.add(x); }
  return t;
}
/** Filter tags for a tool or outfit piece: the effects it gives. */
export function workTags(piece: any, item: any, effectLines?: Array<{ key: string }>): Set<string> {
  const t = new Set<string>();
  for (const e of item?.effects ?? []) t.add(e.id);
  for (const e of effectLines ?? []) t.add(e.key);
  for (const a of piece?.affixes ?? []) { const x = AFFIX_TAG[a.id]; if (x) t.add(x); }
  return t;
}

export const TIER_FACTOR = [1, 2, 4, 7, 12];
/** Fallback only; the engine's gearInfo.repairGold wins. */
export const repairCostGuess = (cond: number, tier: number) => Math.ceil(Math.max(0, 100 - cond) / 10) * 100 * (TIER_FACTOR[(tier || 1) - 1] ?? 1);
/** Action speed lost to a worn tool at this condition. */
export const wearOf = (cond: number) => (cond < 10 ? 8 : cond < 25 ? 5 : cond < 50 ? 3 : 0);

export type DeltaChip = { text: string; d: number };
/** Stat-change chips for a fight piece vs what it would replace (numbers as the engine returns them). */
export function fightDeltaChips(dl: any): DeltaChip[] {
  if (!dl) return [];
  const out: DeltaChip[] = [];
  const sign = (d: number) => (d > 0 ? '+' : '−');
  for (const k of ['atk', 'def', 'heal', 'hp', 'power'] as const) {
    const d = Math.round((dl[k] ?? 0) * 10) / 10;
    if (d) out.push({ d, text: `${sign(d)}${Math.abs(d)} ${STAT_LABEL[k]}` });
  }
  for (const [e, v] of Object.entries<number>(dl.elements ?? {})) { const d = Math.round(v * 10) / 10; if (d) out.push({ d, text: `${sign(d)}${Math.abs(d)}% ${elementName(e)} damage` }); }
  for (const [e, v] of Object.entries<number>(dl.wards ?? {})) { const d = Math.round(v * 10) / 10; if (d) out.push({ d, text: `${sign(d)}${Math.abs(d)}% ${elementName(e)} resist` }); }
  return out;
}
/** Raw effect deltas (pre-cap) for a tool or outfit piece. */
export function workDeltaChips(dl: Record<string, number> | undefined): DeltaChip[] {
  return Object.entries(dl ?? {}).filter(([, v]) => Math.abs(v) >= 0.005).map(([k, v]) => ({ d: v, text: fmtEffect(k, v) }));
}
