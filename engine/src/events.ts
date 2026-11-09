// Player event log (the client's "Log" sheet). Additive save field `state.events` (schema stays v6).
// Separate from the legacy `state.log` (free-text, real-clock, 80 lines), which is kept as-is.
//
// Entry: { id, t (game-clock ms), cat: 'loot'|'gold'|'crew'|'raid'|'skill', text, qty?, itemId?, grade?, gold?, rarity? }
// Newest first, capped at EVENT_CAP. Repeated gains of the same item (or gold from the same source)
// within EVENT_MERGE_MS are merged into one line so idle loops don't flood the sheet.
/* eslint-disable */
import { E, arr, num, itemName, fmtGold } from './core';
import { nowOf } from './clock';

export const EVENT_CAP = 200;
/** entries exposed to the client per snapshot */
export const EVENT_VIEW = 50;
/** repeated gains of one item merge into a single line for this long (game clock) */
export const EVENT_MERGE_MS = 10 * 60 * 1000;
const MERGE_LOOKBACK = 12;
export const EVENT_CATS = ['loot', 'gold', 'crew', 'raid', 'skill'];

export function ensureEvents(state) {
  if (!Array.isArray(state.events)) state.events = [];
  state.events = state.events.filter((e) => e && typeof e.text === 'string' && EVENT_CATS.includes(e.cat)).slice(0, EVENT_CAP);
  state.eventSeq = Math.max(num(state.eventSeq, 0), state.events.reduce((m, e) => Math.max(m, num(e.id, 0)), 0));
  return state.events;
}

/**
 * Push one entry. `extra` may carry qty/itemId/grade/gold/rarity. When `merge` is given (a short
 * string describing the source, e.g. 'gather'), an entry with the same cat + merge key + itemId inside
 * EVENT_MERGE_MS is updated instead (qty and gold summed, text rebuilt by `textFor(total)`).
 */
export function pushEvent(state, cat, text, extra?, merge?, textFor?) {
  if (!state || !EVENT_CATS.includes(cat)) return null;
  if (!Array.isArray(state.events)) state.events = [];
  const t = nowOf(state);
  extra = extra || {};
  if (merge) {
    const list = state.events;
    for (let i = 0; i < Math.min(MERGE_LOOKBACK, list.length); i++) {
      const e = list[i];
      if (t - num(e.t, 0) > EVENT_MERGE_MS) break;
      if (e.cat !== cat || e.merge !== merge || (e.itemId || null) !== (extra.itemId || null)) continue;
      if (extra.qty != null) e.qty = num(e.qty, 0) + num(extra.qty, 0);
      if (extra.gold != null) e.gold = num(e.gold, 0) + num(extra.gold, 0);
      e.t = t;
      e.text = textFor ? textFor(e) : text;
      if (i > 0) { list.splice(i, 1); list.unshift(e); }
      return e;
    }
  }
  state.eventSeq = num(state.eventSeq, 0) + 1;
  const e: any = { id: state.eventSeq, t, cat, text: String(text) };
  ['qty', 'itemId', 'grade', 'gold', 'rarity'].forEach((k) => { if (extra[k] != null) e[k] = extra[k]; });
  if (merge) e.merge = merge;
  state.events.unshift(e);
  if (state.events.length > EVENT_CAP) state.events.length = EVENT_CAP;
  return e;
}

const VERB = { gather: 'Gathered', refine: 'Made', craft: 'Made', combat: 'Looted', offline: 'While away: gathered', assist: 'Helped make' };
/** one item gain (merged per item + source) */
export function lootEvent(state, source, itemId, qty, grade?) {
  if (!(qty > 0)) return;
  const verb = VERB[source] || 'Got';
  pushEvent(state, 'loot', `${verb} ${qty} ${itemName(itemId)}.`, { itemId, qty, grade }, source,
    (e) => `${verb} ${e.qty} ${itemName(itemId)}.`);
}
/** gold gain/loss from a repeating source (merged per source) */
export function goldEvent(state, source, gold, label) {
  if (!gold) return;
  pushEvent(state, 'gold', `${label}: ${gold > 0 ? '+' : ''}${fmtGold(gold)}.`, { gold }, source,
    (e) => `${label}: ${e.gold > 0 ? '+' : ''}${fmtGold(e.gold)}.`);
}

/** newest first; at most n entries, without the internal merge key */
export function eventView(state, n = EVENT_VIEW) {
  return arr(state && state.events).slice(0, n).map((e) => { const o = Object.assign({}, e); delete o.merge; return o; });
}
E.events = (state, n) => eventView(state, n == null ? EVENT_VIEW : n);
