// Shared shop buying flow, used by the Shop tab and the item sheet.
import { DATA } from '@guildwright/engine';
import { engine } from '../engine/store.svelte';
import { engineClient } from '../engine/client';
import { fmtG } from '../format';
import { askNumber, noticeSheet } from './confirm.svelte';
import { toast } from './toasts.svelte';

const GRADE_LABEL = ['Rough', 'Fine', 'Sharp', 'Keen', 'Pristine'];
const SLOT_LABEL: Record<string, string> = { weapon: 'Weapon', offhand: 'Offhand', head: 'Head', chest: 'Chest', legs: 'Legs', ring: 'Ring' };
const itemsMap: Record<string, any> = (DATA as any).items;
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function statDiff(itemId: string): string {
  const snap = engine.snapshot; const gear: any[] = snap?.gear ?? []; const equipped = snap?.equipped ?? {};
  const it = itemsMap[itemId];
  const wornUid = equipped[it?.slot];
  const worn = wornUid ? gear.find((g) => g.uid === wornUid) : null;
  const a = it?.stats ?? {}; const b = worn ? itemsMap[worn.itemId]?.stats ?? {} : {};
  const names: Record<string, string> = { atk: 'attack', def: 'defence', heal: 'heal', hp: 'HP' };
  const parts = Object.keys(names).map((k) => ({ k, d: (a[k] ?? 0) - (b[k] ?? 0) })).filter((x) => x.d !== 0)
    .map((x) => `${x.d > 0 ? '+' : '−'}${Math.abs(x.d)} ${names[x.k]}`);
  return worn ? (parts.length ? `vs your worn piece: ${parts.join(', ')}` : 'Same stats as your worn piece') : 'Slot is empty: all stats are new';
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
    toast(`Bought ${qty} ${s.name} for ${fmtG(res.gold)}`);
    return true;
  } catch (err) { console.error('storeBuy failed', err); return false; }
}
