import { plural } from '../engine/format';
// Pure helpers for GearCard.svelte: rows, element bar, compare arrows, maker text. The engine's final field names
// (score, maker, specials, lore, statRows, value, compare.scoreDelta) are read defensively; older detail shapes
// (stats / effects / affixes) still produce a card.
import type { GearDetail } from '../engine/protocol';

export type Maker = { text?: string | null; kind: 'crafted' | 'raid' | 'starter' | 'shop' | 'unknown'; name?: string } | string | null | undefined;
export type Special = { id: string; name: string; text: string };
export type CardRow = { key: string; label: string; icon: string; text: string; value: number | null; delta: number | null };
export type CardDetail = Omit<GearDetail, 'compare' | 'maker' | 'specials' | 'statRows' | 'lore' | 'score' | 'levelReq'> & {
  sellPrice?: number; salvage?: Array<{ itemId: string; grade: number; qtyMin: number; qtyMax: number }> | null;
  score?: number; levelReq?: number; maker?: Maker; lore?: string | null; specials?: Special[]; value: number;
  statRows?: Array<{ key: string; label: string; icon?: string; valueText: string; value: number }>;
  compare: (NonNullable<GearDetail['compare']> & { scoreDelta?: number }) | null;
};

const ICON: Record<string, string> = {
  atk: 'stat_atk', def: 'stat_def', heal: 'stat_heal', hp: 'stat_hp', fire: 'el_fire', frost: 'el_frost', venom: 'el_venom', holy: 'el_holy',
  speed: 'fx_speed', double: 'fx_double', save: 'fx_save', quality: 'fx_quality', find: 'fx_find', rarity: 'fx_rarity',
};
export const statIconKey = (key: string) => (key.startsWith('ward_') ? 'ward' : ICON[key] ?? key);
const isElementKey = (k: string) => /^(fire|frost|venom|holy|ward_(fire|frost|venom|holy))$/.test(k);
export const elementOf = (k: string) => k.replace(/^ward_/, '');

const num = (n: number) => String(Math.round(n * 100) / 100);
const sgn = (n: number) => (n > 0 ? '+' : '');

/** One row per stat / effect: the engine's statRows when present, else built from stats (non-element) and effects. */
export function cardRows(d: CardDetail): CardRow[] {
  const diff = new Map<string, number>();
  for (const x of d.compare?.diff ?? []) diff.set(x.key, x.delta);
  for (const e of d.effects ?? []) {
    const w = d.compare?.effects?.find((c) => c.key === e.key);
    if (w) diff.set(String(e.key), Math.round((e.value - w.value) * 100) / 100);
  }
  const delta = (k: string) => (diff.has(k) ? diff.get(k)! : null);
  if (d.statRows?.length) {
    return d.statRows.filter((r) => !isElementKey(r.key)).map((r) => ({ key: r.key, label: r.label, icon: r.icon ?? statIconKey(r.key), text: r.valueText, value: r.value, delta: delta(r.key) }));
  }
  const rows: CardRow[] = [];
  for (const s of d.stats ?? []) if (!isElementKey(s.key)) rows.push({ key: s.key, label: s.label, icon: statIconKey(s.key), text: num(s.value) + (s.unit === 'pct' ? '%' : ''), value: s.value, delta: delta(s.key) });
  for (const e of d.effects ?? []) rows.push({ key: String(e.key), label: e.label, icon: statIconKey(String(e.key)), text: sgn(e.value) + num(e.value) + (e.unit === 'pct' ? '%' : ''), value: e.value, delta: delta(String(e.key)) });
  return rows;
}

/** Element share and wards, one line each ("Fire damage +3.3%"), tagged with the element for colouring. */
export function elementLines(d: CardDetail): Array<{ key: string; element: string; ward: boolean; text: string }> {
  return (d.stats ?? []).filter((s) => isElementKey(s.key)).map((s) => ({
    key: s.key, element: elementOf(s.key), ward: s.key.startsWith('ward_'), text: s.text ?? `${s.label} ${sgn(s.value)}${num(s.value)}${s.unit === 'pct' ? '%' : ''}`,
  }));
}

export const arrow = (delta: number | null | undefined): '' | 'up' | 'down' | 'same' => (delta == null ? '' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'same');
export const arrowText = (delta: number | null | undefined) => (delta == null ? '' : delta === 0 ? '=' : `${delta > 0 ? '▲' : '▼'} ${num(Math.abs(delta))}`);

export function makerText(m: Maker): string | null {
  if (!m) return null;
  if (typeof m !== 'string' && m.text !== undefined) return m.kind === 'unknown' ? null : m.text;
  const k = typeof m === 'string' ? { kind: 'crafted' as const, name: m } : m;
  if (k.kind === 'crafted') return k.name ? `Made by ${k.name}` : 'Player made';
  if (k.kind === 'raid') return 'Found in a raid';
  if (k.kind === 'starter') return 'Starter kit';
  if (k.kind === 'shop') return 'Shop';
  return null;
}
export const makerIcon = (m: Maker) => (!m ? null : `badge_${typeof m === 'string' ? 'crafted' : m.kind === 'unknown' ? null : m.kind}`);

/** Epic and above get the richer gilt corners. */
export const isGilt = (rarity: string) => ['epic', 'legendary', 'mythic'].includes(rarity);

/** Footer: "Sells for 120g" on the left, "Salvage: 2–4 bronze bars" on the right (nothing when there is no salvage info). */
export function footerText(d: CardDetail, itemName: (id: string) => string = (id) => id): { gold: number | null; salvage: string | null; note: string | null } {
  const gold = d.sellPrice ?? d.value ?? null;
  if (d.sellPrice === 0) return { gold: null, salvage: null, note: "Starter kit: can't be sold or salvaged" };
  const parts = (d.salvage ?? []).slice(0, 2).map((s) => `${s.qtyMin === s.qtyMax ? s.qtyMin : s.qtyMin <= 0 ? `up to ${s.qtyMax}` : `${s.qtyMin}–${s.qtyMax}`} ${plural(itemName(s.itemId), s.qtyMax).toLowerCase()}`);
  return { gold, salvage: parts.length ? `Salvage: ${parts.join(', ')}` : null, note: null };
}

// ---- Affix roll colours (engine AffixLine): secondary affixes carry valueText, rangeText, rollPct, rollTier ('common'..'legendary');
// the primary line has `primary: true`; Enduring has `fixed: true`; neither has roll fields (plain line, no pip, not tappable).
export type RollAffix = { id: string; name: string; label: string; primary?: boolean; fixed?: boolean; valueText?: string; rangeText?: string; rollPct?: number; rollTier?: string };
const TIERS = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
/** rollTier -> the rarity ink token: grey, green, blue, purple, orange. */
export const tierInk = (tier: string | undefined | null): string | null => (tier && TIERS.includes(tier) ? `var(--r-${tier})` : null);
/** "top 5% roll": 1 - rollPct as a whole percent, never below 1%. */
export const topPct = (rollPct: number) => Math.max(1, Math.round((1 - rollPct) * 100));
/** Split "Savage: Attack +21" into the name part and the value part (the value is what gets the roll colour). */
export function splitAffix(label: string): { head: string; value: string } {
  const i = label.indexOf(': ');
  return i < 0 ? { head: '', value: label } : { head: label.slice(0, i + 1), value: label.slice(i + 2) };
}
/** Detail line: "+3.3% · range +2.4% to +3.6% · top 5% roll" (null for primary, fixed or range-less lines). */
export function affixDetail(a: RollAffix): string | null {
  if (a.primary || a.fixed || !a.rangeText || a.rollPct == null) return null;
  return `${a.valueText ?? ''} · range ${a.rangeText} · top ${topPct(a.rollPct)}% roll`.replace(/^ · /, '');
}
export const isPrimaryAffix = (a: RollAffix, i: number) => (a.primary ?? i === 0);
