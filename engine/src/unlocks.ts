// Recently unlocked (juice pass 2026-11-12): actions the player unlocked by levelling and hasn't dismissed.
// state.seenUnlocks = { [actionId]: true } (additive save field). Level-1 starters never show. A save
// from before the field existed is seeded with everything it had already unlocked (state.ts migrate),
// so only unlocks gained from then on appear.
/* eslint-disable */
import { E, arr, num, allActions, action } from './core';

const unlockedNow = (state, a) => !!a && a.id && num(a.level, 1) > 1 && E.skillLevel(state, a.skill) >= num(a.level, 1);

export function normSeenUnlocks(raw) {
  const out = {};
  if (raw && typeof raw === 'object') Object.keys(raw).forEach((id) => { if (raw[id] && action(id)) out[id] = true; });
  return out;
}
/** every action this state has already unlocked, marked seen */
export function seedSeenUnlocks(state) {
  const out = {};
  allActions().forEach((a) => { if (unlockedNow(state, a)) out[a.id] = true; });
  return out;
}
/** action ids unlocked by levelling and not dismissed; highest unlock level first */
export function recentUnlocks(state) {
  if (!state) return [];
  const seen = state.seenUnlocks && typeof state.seenUnlocks === 'object' ? state.seenUnlocks : {};
  return allActions().filter((a) => unlockedNow(state, a) && !seen[a.id])
    .sort((a, b) => num(b.level, 1) - num(a.level, 1) || String(a.name).localeCompare(String(b.name))).map((a) => a.id);
}
E.recentUnlocks = recentUnlocks;
/** hide these from recentUnlocks for good (saved) */
E.dismissUnlocks = function (state, actionIds) {
  if (!state.seenUnlocks || typeof state.seenUnlocks !== 'object' || Array.isArray(state.seenUnlocks)) state.seenUnlocks = {};
  let n = 0;
  arr(Array.isArray(actionIds) ? actionIds : [actionIds]).forEach((id) => { if (action(id) && !state.seenUnlocks[id]) { state.seenUnlocks[id] = true; n++; } });
  return { ok: true, reason: '', dismissed: n };
};
