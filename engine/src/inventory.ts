// Items, inventory stacks and grades.
// Ported from legacy/engine.js lines 199-241. Behaviour must stay identical to the
// legacy build (see test/parity.test.ts); design changes come in phase 1.
/* eslint-disable */
import { E, num, grades, item, clamp, itemName, zeros5, gradeMid } from './core';

// ---------------------------------------------------------------- inventory
export function addItem(state, itemId, grade, qty) {
  qty = Math.floor(num(qty, 0)); if (qty <= 0 || !itemId) return;
  grade = clamp(Math.floor(num(grade, 1)), 0, 4);
  if (!Array.isArray(state.inv[itemId])) state.inv[itemId] = zeros5();
  state.inv[itemId][grade] += qty;
}
export function cleanInv(state, itemId) {
  const g = state.inv[itemId];
  if (g && g.every((x) => !(x > 0))) delete state.inv[itemId];
}
E.itemCount = function (state, itemId) {
  const g = state && state.inv && state.inv[itemId];
  return Array.isArray(g) ? g.reduce((a, b) => a + (b > 0 ? b : 0), 0) : 0;
};
// Takes qty units of itemId by priority ('best' = highest grade first). dry=true doesn't mutate.
export function consume(state, itemId, qty, priority, dry?) {
  const g = (state.inv[itemId] || zeros5()).slice();
  const used = zeros5(); let need = qty, qsum = 0;
  const order = priority === 'best' ? [4, 3, 2, 1, 0] : [0, 1, 2, 3, 4];
  for (const i of order) {
    if (need <= 0) break;
    const take = Math.min(need, Math.max(0, g[i] || 0));
    if (take > 0) { g[i] -= take; used[i] += take; need -= take; qsum += take * gradeMid(i); }
  }
  const taken = qty - need;
  if (!dry && taken > 0) { state.inv[itemId] = g; cleanInv(state, itemId); }
  return { ok: need <= 0, taken, used, qsum };
}
export function lowestGrade(state, itemId) {
  const g = state.inv[itemId]; if (!g) return -1;
  for (let i = 0; i < 5; i++) if (g[i] > 0) return i;
  return -1;
}
export function ownedOfKind(state, kind) {
  return Object.keys(state.inv).filter((id) => item(id) && item(id).kind === kind && E.itemCount(state, id) > 0);
}
E.inventoryList = function (state) { // helper for the UI: stackables sorted by kind/tier/name
  const order = { material: 0, food: 1, potion: 2, catalyst: 3, core: 4 };
  return Object.keys(state.inv).filter((id) => E.itemCount(state, id) > 0).map((id) => ({ itemId: id, item: item(id), grades: state.inv[id].slice(), total: E.itemCount(state, id) }))
    .sort((a, b) => (num(order[(a.item || {}).kind], 9) - num(order[(b.item || {}).kind], 9)) || (num((a.item || {}).tier, 0) - num((b.item || {}).tier, 0)) || String(itemName(a.itemId)).localeCompare(itemName(b.itemId)));
};
