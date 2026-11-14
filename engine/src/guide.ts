// First-hour guide progress in the save (friends-test fix 2026-11-14). Before this the client kept it in
// localStorage only, so a save code or a new link replayed the guide.
// state.guide = { dismissed: boolean, done: { [stepId]: true }, baseEquipped: string[] | null } (additive save field;
// same shape as client/src/guide.svelte.ts). A new game starts with an empty guide. A save from before the field
// existed loads with state.guide === null: the client seeds it once from its old localStorage copy via E.setGuide.
/* eslint-disable */
import { E, arr } from './core';

export const emptyGuide = () => ({ dismissed: false, done: {}, baseEquipped: null });
const MAX_STEPS = 64, MAX_ID = 40, MAX_UIDS = 64;
const okId = (k) => typeof k === 'string' && k.length > 0 && k.length <= MAX_ID;
function normDone(raw) {
  const out = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) Object.keys(raw).filter((k) => okId(k) && raw[k]).slice(0, MAX_STEPS).forEach((k) => { out[k] = true; });
  return out;
}
const normUids = (raw) => (Array.isArray(raw) ? arr(raw).filter((u) => typeof u === 'string' && u && u.length <= MAX_ID).slice(0, MAX_UIDS) : null);
/** a saved guide, normalised; null when the save has none (or it is not an object) */
export function normGuide(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return { dismissed: raw.dismissed === true, done: normDone(raw.done), baseEquipped: normUids(raw.baseEquipped) };
}
/** the guide progress, or null when this save has none yet (seed it with E.setGuide) */
E.guide = function (state) {
  const g = state && normGuide(state.guide);
  return g ? { dismissed: g.dismissed, done: Object.assign({}, g.done), baseEquipped: g.baseEquipped ? g.baseEquipped.slice() : null } : null;
};
/**
 * Set the guide progress. patch fields replace the saved ones when given (done is replaced whole, not merged);
 * missing fields keep their saved value (or the empty guide's). Returns the saved guide.
 */
E.setGuide = function (state, patch) {
  const cur = normGuide(state.guide) || emptyGuide();
  const p = patch && typeof patch === 'object' ? patch : {};
  const next = {
    dismissed: 'dismissed' in p ? p.dismissed === true : cur.dismissed,
    done: 'done' in p ? normDone(p.done) : cur.done,
    baseEquipped: 'baseEquipped' in p ? normUids(p.baseEquipped) : cur.baseEquipped,
  };
  state.guide = next;
  return { ok: true, reason: '', guide: E.guide(state) };
};
