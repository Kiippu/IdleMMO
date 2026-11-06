// Skills and XP curve.
// Ported from legacy/engine.js lines 153-198. Behaviour must stay identical to the
// legacy build (see test/parity.test.ts); design changes come in phase 1.
/* eslint-disable */
import { E, num, cfg, skillDefs, clamp, logq } from './core';

// ---------------------------------------------------------------- skills / XP
export const xpTable = [0, 0];
E.xpForLevel = function (level) {
  level = Math.floor(num(level, 1));
  if (level <= 1) return 0;
  level = Math.min(level, 200);
  while (xpTable.length <= level) {
    let pts = 0; const L = xpTable.length;
    for (let l = 1; l < L; l++) pts += Math.floor(l + 300 * Math.pow(2, l / 7));
    xpTable.push(Math.floor(pts / 4));
  }
  return xpTable[level];
};
E.levelFor = function (xp) {
  xp = num(xp, 0); const max = Math.max(1, num(cfg().maxLevel, 99));
  let lo = 1, hi = max;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (E.xpForLevel(mid) <= xp) lo = mid; else hi = mid - 1; }
  return lo;
};
E.skillLevel = function (state, skillId) {
  const s = state && state.skills && state.skills[skillId];
  return E.levelFor(s ? s.xp : 0);
};
E.skillProgress = function (state, skillId) {
  const s = state && state.skills && state.skills[skillId];
  const xp = s ? num(s.xp, 0) : 0;
  const level = E.levelFor(xp); const max = num(cfg().maxLevel, 99);
  const cur = E.xpForLevel(level); const next = level >= max ? cur : E.xpForLevel(level + 1);
  const pct = level >= max ? 1 : clamp((xp - cur) / Math.max(1, next - cur), 0, 1);
  return { level, xp, cur, next, pct };
};
export function addXp(state, skillId, amount, events) {
  if (!skillId || !(amount > 0)) return 0;
  if (!state.skills[skillId]) state.skills[skillId] = { xp: 0 };
  const s = state.skills[skillId];
  const before = E.levelFor(s.xp);
  s.xp = num(s.xp, 0) + amount;
  const after = E.levelFor(s.xp);
  if (after > before) {
    events.push({ type: 'levelup', skill: skillId, level: after });
    const def = skillDefs().find((d) => d.id === skillId);
    logq(state, 'level', `${def ? def.name : skillId} reached level ${after}.`);
  }
  return amount;
}
