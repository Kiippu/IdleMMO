// `gain` events (juice pass 2026-11-12): one event per real item gain, for the client's pickup effects.
//   { type: 'gain', source, items: [{ itemId, qty, grade?, rarity, uid? }], offline?: true }
// source: gather | refine | craft | combat | assist | buy | salvage | raid | other.
// Never for selling, equipping, loadout swaps, vault withdrawals or contract hand-ins.
//
// Gains are queued here (module level, one engine per realm) because some come from RPC verbs that have
// no events array (store buys, salvage). E.tick appends the queue to its events; the worker calls
// E.takeEvents() after every other request so those gains ride that response's `events`.
// During an offline catch-up gains are aggregated per source (item + grade + rarity; gear pieces keep
// their uid up to a limit) and queued once at the end with offline: true.
/* eslint-disable */
import { E, arr, num, item, clamp } from './core';

export const GAIN_SOURCES = ['gather', 'refine', 'craft', 'combat', 'assist', 'buy', 'salvage', 'raid', 'other'];
const QUEUE_CAP = 500;
const OFFLINE_GEAR_UIDS = 200;

let queue: any[] = [];
let offline: any = null; // { [source]: { order: string[], map: { key: entry } } }

const rarityOf = (itemId) => { const it = item(itemId); return (it && it.rarity) || 'common'; };

/** items: [{ itemId, qty, grade?, uid?, rarity? }] (gear pieces: pass the instance's rarity + uid) */
export function emitGain(source, items) {
  const src = GAIN_SOURCES.includes(source) ? source : 'other';
  const list = arr(items).filter((i) => i && item(i.itemId) && num(i.qty, 0) > 0).map((i) => {
    const o: any = { itemId: i.itemId, qty: Math.floor(num(i.qty, 0)), rarity: i.rarity || rarityOf(i.itemId) };
    if (i.grade != null && isFinite(i.grade)) o.grade = clamp(Math.floor(i.grade), 0, 4);
    if (i.uid) o.uid = String(i.uid);
    return o;
  }).filter((i) => i.qty > 0);
  if (!list.length) return;
  if (offline) { addOffline(src, list); return; }
  queue.push({ type: 'gain', source: src, items: list });
  if (queue.length > QUEUE_CAP) queue.splice(0, queue.length - QUEUE_CAP);
}
function addOffline(src, list) {
  const b = offline[src] || (offline[src] = { order: [], map: {}, gearUids: 0 });
  list.forEach((i) => {
    let key = i.itemId + '|' + (i.grade == null ? '' : i.grade) + '|' + i.rarity;
    if (i.uid && b.gearUids < OFFLINE_GEAR_UIDS) { key = 'uid|' + i.uid; b.gearUids++; }
    const cur = b.map[key];
    if (cur) cur.qty += i.qty;
    else { const o = Object.assign({}, i); if (!key.startsWith('uid|')) delete o.uid; b.map[key] = o; b.order.push(key); }
  });
}
/** start aggregating (E.applyOffline); nested calls keep the outer aggregation */
export function beginOfflineGains() { if (offline) return false; offline = {}; return true; }
/** queue the aggregated catch-up gains, one event per source, flagged offline */
export function endOfflineGains() {
  const agg = offline; offline = null; if (!agg) return;
  GAIN_SOURCES.forEach((src) => {
    const b = agg[src]; if (!b || !b.order.length) return;
    queue.push({ type: 'gain', source: src, items: b.order.map((k) => b.map[k]), offline: true });
  });
  if (queue.length > QUEUE_CAP) queue.splice(0, queue.length - QUEUE_CAP);
}
/** drain queued gain events */
export function takeGains() { const q = queue; queue = []; return q; }
E.takeEvents = () => takeGains();
