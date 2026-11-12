// Shared shop buying flow, used by the Shop tab and the item sheet.
import { DATA } from '@guildwright/engine';
import { engine } from '../engine/store.svelte';
import { engineClient } from '../engine/client';
import { GRADE_NAMES } from '../engine/grades';
import { fmtG } from '../format';
import { fmtEffect } from '../tabs/war/gearUi';
import { askNumber, noticeSheet } from './confirm.svelte';

const GRADE_LABEL = GRADE_NAMES;
const SLOT_LABEL: Record<string, string> = { weapon: 'Weapon', offhand: 'Offhand', head: 'Head', chest: 'Chest', legs: 'Legs', ring: 'Ring', amulet: 'Amulet', body: 'Body', hands: 'Hands', feet: 'Feet', tool: 'Tool' };
const itemsMap: Record<string, any> = (DATA as any).items;
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** The worn piece an item would replace: ring goes to an empty ring slot, else the weaker ring (as equip() picks); outfit by set and piece; tool by skill. */
function wornFor(it: any): any | null {
  const snap = engine.snapshot as any; const gear: any[] = snap?.gear ?? [];
  const find = (uid: string | null | undefined) => (uid ? gear.find((g) => g.uid === uid) ?? null : null);
  if (!it) return null;
  if (it.section === 'tool') return find(snap?.tools?.[it.toolSkill]);
  if (it.section === 'outfit') return find(snap?.workOutfit?.[it.outfitSet]?.[it.slot]);
  const eq = snap?.equipped ?? {};
  if (it.slot === 'ring') {
    const rings = [find(eq.ring1), find(eq.ring2)];
    if (!rings[0] || !rings[1]) return null; // an empty ring slot: everything is new
    const sum = (g: any) => Object.values<number>(itemsMap[g.itemId]?.stats ?? {}).reduce((x, y) => x + y, 0);
    return sum(rings[0]) <= sum(rings[1]) ? rings[0] : rings[1];
  }
  return find(eq[it.slot]);
}

function statDiff(itemId: string): string {
  const it = itemsMap[itemId];
  const worn = wornFor(it);
  const emptyText = it?.section === 'tool' ? 'Tool slot is empty: all effects are new' : it?.section === 'outfit' ? 'Nothing worn there: all effects are new' : 'Slot is empty: all stats are new';
  if (!worn) return emptyText;
  const wi = itemsMap[worn.itemId];
  let parts: string[];
  if (it.section === 'fight') {
    const a = it.stats ?? {}; const b = wi?.stats ?? {};
    const names: Record<string, string> = { atk: 'attack', def: 'defence', heal: 'healing', hp: 'HP' };
    parts = Object.keys(names).map((k) => ({ k, d: (a[k] ?? 0) - (b[k] ?? 0) })).filter((x) => x.d !== 0).map((x) => `${x.d > 0 ? '+' : '−'}${Math.abs(x.d)} ${names[x.k]}`);
  } else {
    const val = (x: any, id: string) => (x?.effects ?? []).filter((e: any) => e.id === id).reduce((n: number, e: any) => n + e.value, 0);
    const ids = new Set<string>([...(it.effects ?? []), ...(wi?.effects ?? [])].map((e: any) => e.id));
    parts = [...ids].map((id) => ({ id, d: Math.round((val(it, id) - val(wi, id)) * 100) / 100 })).filter((x) => x.d !== 0).map((x) => fmtEffect(x.id, x.d));
  }
  return parts.length ? `vs your worn piece: ${parts.join(', ')}` : 'Same stats as your worn piece';
}

/** Result of the last successful buy, so the caller can show inline feedback. */
export const lastBuy = { qty: 0, gold: 0 };

export function buyDetail(s: any): string {
  return s.kind === 'gear' ? `${SLOT_LABEL[itemsMap[s.itemId]?.slot] ?? 'Gear'} · ${cap(s.rarity)}. ${statDiff(s.itemId)}.` : `${GRADE_LABEL[s.grade] ?? ''} · ${cap(s.rarity)}.`;
}

export async function buyFromShop(s: any): Promise<boolean> {
  const gold = Math.floor(engine.snapshot?.gold ?? 0);
  if (s.qty < 1) return false;
  const afford = s.price > 0 ? Math.floor(gold / s.price) : s.qty;
  const max = Math.min(s.qty, afford);
  if (max < 1) { await noticeSheet('Not enough gold', `${s.name} costs ${fmtG(s.price)} and you have ${fmtG(gold)}.`); return false; }
  const detail = s.kind === 'gear' ? `${SLOT_LABEL[itemsMap[s.itemId]?.slot] ?? 'Gear'} · ${cap(s.rarity)}. ${statDiff(s.itemId)}.` : `${GRADE_LABEL[s.grade] ?? ''} · ${cap(s.rarity)}.`;
  const qty = await askNumber({
    title: `Buy ${s.name}`, body: `${detail} ${fmtG(s.price)} each.`,
    number: { min: 1, max, value: 1, label: 'How many?', lines: (n) => [`Total ${fmtG(n * s.price)}`, `Gold after ${fmtG(gold - n * s.price)}`] },
    confirmLabel: 'Buy',
  });
  if (qty == null) return false;
  try {
    const res = await engineClient.storeBuy(s.slot, qty);
    if (res.ok === false) { await noticeSheet('Could not complete', res.reason); return false; }
    lastBuy.qty = qty; lastBuy.gold = res.gold;
    return true;
  } catch (err) { console.error('storeBuy failed', err); return false; }
}
