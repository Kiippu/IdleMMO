// Skills and XP curve.
// Ported from legacy/engine.js lines 153-198. Behaviour must stay identical to the
// legacy build (see test/parity.test.ts); design changes come in phase 1.
/* eslint-disable */
import { ctx } from './context';
import { E, num, cfg, skillDefs, clamp, logq } from './core';
import { WEEK_MS } from './v4-helpers';

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

// Specialization switch (CLAUDE.md "Settled decisions"):
// - costs ~3000 gold (cfg.specSwitchCost, default 3000)
// - one-week cooldown
// - the OLD spec skill's XP is clamped to the level-70 cap on switch (no XP lost,
//   just capped — members in a later phase lift the cap for their chosen spec)
// Free/member tier isn't modelled in the engine yet; for now the switch is open to
// anyone and the 70-cap is applied only on switch-out, matching the design doc.
export const SPEC_COOLDOWN_MS = WEEK_MS;
export const SPEC_CAP_LEVEL = 70;

E.switchSpec = function (state, newSkillId) {
  const def = skillDefs().find((d) => d.id === newSkillId);
  if (!def) return { ok: false, reason: 'Unknown skill.' };
  const spec = state.spec || (state.spec = { skillId: null, lastSwitchAt: null });
  if (spec.skillId === newSkillId) return { ok: false, reason: `Already specialized in ${def.name}.` };
  const now = ctx.now();
  if (spec.lastSwitchAt && now - spec.lastSwitchAt < SPEC_COOLDOWN_MS) {
    const left = Math.ceil((SPEC_COOLDOWN_MS - (now - spec.lastSwitchAt)) / 1000);
    return { ok: false, reason: `Specialization switch is on cooldown for ${left} more seconds.` };
  }
  const cost = Math.max(0, Math.floor(num(cfg().specSwitchCost, 3000)));
  if (num(state.gold, 0) < cost) return { ok: false, reason: `Needs ${cost}g; you have ${Math.floor(num(state.gold, 0))}g.` };
  // Clamp the OLD spec skill's XP to the level-70 cap. No clamp for the FIRST pick
  // (spec.skillId === null) since there's no "old" spec to cap.
  if (spec.skillId && state.skills[spec.skillId]) {
    const cap = E.xpForLevel(SPEC_CAP_LEVEL);
    state.skills[spec.skillId].xp = Math.min(num(state.skills[spec.skillId].xp, 0), cap);
  }
  state.gold = num(state.gold, 0) - cost;
  spec.skillId = newSkillId;
  spec.lastSwitchAt = now;
  logq(state, 'info', `Specialized in ${def.name} for ${cost}g.`);
  return { ok: true, reason: '', cost };
};

E.spec = function (state) {
  const spec = state.spec || { skillId: null, lastSwitchAt: null };
  const now = ctx.now();
  const cooldownMs = spec.lastSwitchAt ? Math.max(0, SPEC_COOLDOWN_MS - (now - spec.lastSwitchAt)) : 0;
  return { skillId: spec.skillId, lastSwitchAt: spec.lastSwitchAt, cooldownMs, cost: Math.max(0, Math.floor(num(cfg().specSwitchCost, 3000))) };
};
