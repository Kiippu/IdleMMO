// Why-disabled strings (phase 3 layout pass, 2026-11-11): one plain sentence for every button the client
// greys out, so a tap on a disabled control can say why. Read-only; reuses the engine's own checks
// (canStart, canAssist, listContracts, spec rules). Only disabled entries are listed.
/* eslint-disable */
import { E, arr, num, allActions, grades, lcFirst, itemName, fmtGold } from './core';
import { fmtDaysHours } from './skills';

export function contractReason(k) {
  if (!k) return 'That contract is gone.';
  if (k.status === 'filled') return 'This contract is already filled.';
  if (k.status === 'cancelled') return 'This request was cancelled.';
  if (k.canFill && k.canFill.ok) return null;
  if (k.status !== 'open') return 'This contract has closed.';
  if (k.mine) return 'You posted this request; a crewmate has to fill it.';
  if (!(num(k.capacity, 0) >= 1)) return k.remaining > 0 ? 'This contract has run out of gold.' : 'This contract has closed.';
  if (!(num(k.have, 0) > 0)) return `You have no ${lcFirst(itemName(k.itemId))} at ${(grades()[k.minGrade] || {}).name || 'that'} grade or better.`;
  return (k.canFill && k.canFill.reason) || 'You cannot hand this in now.';
}
export function specReason(state) {
  const sp = E.spec(state);
  if (!arr(sp.eligible).length) return sp.skillId ? `No other profession is at level ${sp.capLevel} yet.` : `Reach level ${sp.capLevel} in a profession to specialize.`;
  if (sp.skillId && sp.cooldownMs > 0) return `You can switch specialization again in ${fmtDaysHours(sp.cooldownMs)}.`;
  if (num(state.gold, 0) < sp.cost) return `Switching costs ${fmtGold(sp.cost)}; you have ${fmtGold(Math.floor(num(state.gold, 0)))}.`;
  return null;
}
E.disabledReasons = function (state) {
  const actions = {}; const jobs = {}; const contracts = {};
  allActions().forEach((a) => { if (!a || !a.id) return; const c = E.canStart(state, a.id); if (!c.ok) actions[a.id] = c.reason; });
  arr(state.crew && state.crew.jobs).forEach((j) => { const c = E.canAssist(state, j.id); if (!c.ok) jobs[j.id] = c.reason; });
  E.listContracts(state).forEach((k) => { const r = contractReason(k); if (r) contracts[k.id] = r; });
  return { actions, jobs, contracts, spec: specReason(state) };
};
