// Skills and XP curve.
// Ported from legacy/engine.js lines 153-198. Behaviour must stay identical to the
// legacy build (see test/parity.test.ts); design changes come in phase 1.
/* eslint-disable */
import { ctx } from './context';
import { E, num, arr, cfg, skillDefs, clamp, logq } from './core';
import { WEEK_MS } from './v4-helpers';
import { nowOf } from './clock';

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
// Raw level from XP (ignores the specialization cap).
export function rawSkillLevel(state, skillId) {
  const s = state && state.skills && state.skills[skillId];
  return E.levelFor(s ? s.xp : 0);
}
// Profession skills (gathering / refining / crafting) can be levelled to SPEC_CAP_LEVEL by anyone.
// Past that only your specialization levels further; every other profession skill is held at an
// EFFECTIVE level of 70 while its XP keeps accruing (kept for if you specialize in it later).
// Combat skills are not professions: never capped, never a specialization.
export const PROFESSION_TIERS = ['gathering', 'refining', 'crafting'];
export function isProfession(skillId) { const d = skillDefs().find((x) => x.id === skillId); return !!d && PROFESSION_TIERS.includes(d.tier); }
export function isSpecCapped(state, skillId) {
  return isProfession(skillId) && !(state && state.spec && state.spec.skillId === skillId);
}
E.skillLevel = function (state, skillId) {
  const raw = rawSkillLevel(state, skillId);
  return isSpecCapped(state, skillId) ? Math.min(raw, SPEC_CAP_LEVEL) : raw;
};
E.skillProgress = function (state, skillId) {
  const s = state && state.skills && state.skills[skillId];
  const xp = s ? num(s.xp, 0) : 0;
  const rawLevel = E.levelFor(xp); const capped = isSpecCapped(state, skillId) && rawLevel > SPEC_CAP_LEVEL;
  const level = capped ? SPEC_CAP_LEVEL : rawLevel;
  const max = capped ? SPEC_CAP_LEVEL : num(cfg().maxLevel, 99);
  const cur = E.xpForLevel(level); const next = level >= max ? cur : E.xpForLevel(level + 1);
  const pct = level >= max ? 1 : clamp((xp - cur) / Math.max(1, next - cur), 0, 1);
  return { level, rawLevel, capped, xp, cur, next, pct };
};
export function addXp(state, skillId, amount, events) {
  if (!skillId || !(amount > 0)) return 0;
  if (!state.skills[skillId]) state.skills[skillId] = { xp: 0 };
  const s = state.skills[skillId];
  const before = E.skillLevel(state, skillId);
  s.xp = num(s.xp, 0) + amount; // XP keeps accruing even while the spec cap holds the level
  const after = E.skillLevel(state, skillId);
  if (after > before) {
    events.push({ type: 'levelup', skill: skillId, level: after });
    const def = skillDefs().find((d) => d.id === skillId);
    logq(state, 'level', `${def ? def.name : skillId} reached level ${after}.`);
  }
  return amount;
}

// Specialization (CLAUDE.md "Settled decisions"; phase 2.5 owner rules):
// - only a profession skill at (raw) level 70+ can be chosen
// - the FIRST pick is free and starts no cooldown
// - switching later costs cfg.specSwitchCost (about 3 hours of level-40 income) + a one-week cooldown
//   on the game clock; the old skill drops back to effective level 70 with its XP kept, and switching
//   back restores its full level. Open to free players.
export const SPEC_COOLDOWN_MS = WEEK_MS;
export const SPEC_CAP_LEVEL = 70;
const HOUR_MS = 3600000, DAY_MS_ = 86400000;

/** "Xd Yh" for a cooldown; hours round up so it never shows 0h while time is left. Never seconds. */
export function fmtDaysHours(ms) {
  ms = Math.max(0, num(ms, 0));
  let d = Math.floor(ms / DAY_MS_); let h = Math.ceil((ms - d * DAY_MS_) / HOUR_MS);
  if (h >= 24) { d += 1; h -= 24; }
  return `${d}d ${h}h`;
}
export function specCooldownMs(state) {
  const sp = state && state.spec; const at = sp && sp.lastSwitchAt;
  return at ? Math.max(0, SPEC_COOLDOWN_MS - (nowOf(state) - at)) : 0;
}
E.specCooldown = function (state) { const ms = specCooldownMs(state); return { ms, text: fmtDaysHours(ms), ready: ms <= 0 }; };
export const specSwitchCost = () => Math.max(0, Math.floor(num(cfg().specSwitchCost, 45000)));
/** gold the NEXT pick costs: 0 for the first pick, the switch cost after that */
export const specCostFor = (state) => (state && state.spec && state.spec.skillId ? specSwitchCost() : 0);
export const specEligible = (state) => skillDefs().filter((d) => isProfession(d.id) && rawSkillLevel(state, d.id) >= SPEC_CAP_LEVEL).map((d) => d.id);

E.switchSpec = function (state, newSkillId) {
  const def = skillDefs().find((d) => d.id === newSkillId);
  if (!def) return { ok: false, reason: 'Unknown skill.' };
  if (!isProfession(newSkillId)) return { ok: false, reason: `${def.name} is not a profession; only gathering, refining and crafting skills can be a specialization.` };
  const spec = state.spec || (state.spec = { skillId: null, lastSwitchAt: null });
  if (spec.skillId === newSkillId) return { ok: false, reason: `Already specialized in ${def.name}.` };
  if (rawSkillLevel(state, newSkillId) < SPEC_CAP_LEVEL) return { ok: false, reason: `Reach ${def.name} level ${SPEC_CAP_LEVEL} to specialize in it.` };
  const first = !spec.skillId;
  if (!first) {
    const left = specCooldownMs(state);
    if (left > 0) return { ok: false, reason: `You can switch specialization again in ${fmtDaysHours(left)}.`, cooldownMs: left, cooldownText: fmtDaysHours(left) };
  }
  const cost = first ? 0 : specSwitchCost();
  if (num(state.gold, 0) < cost) return { ok: false, reason: `Needs ${cost}g; you have ${Math.floor(num(state.gold, 0))}g.` };
  const old = spec.skillId;
  state.gold = num(state.gold, 0) - cost;
  spec.skillId = newSkillId;
  if (!first) spec.lastSwitchAt = nowOf(state); // the first pick starts no cooldown
  const oldName = old ? (skillDefs().find((d) => d.id === old) || { name: old }).name : '';
  logq(state, 'info', first ? `Specialized in ${def.name}.` : `Switched specialization to ${def.name} for ${cost}g. ${oldName} is held at level ${SPEC_CAP_LEVEL} (XP kept).`);
  return { ok: true, reason: '', cost, first };
};

E.spec = function (state) {
  const spec = state.spec || { skillId: null, lastSwitchAt: null };
  const cooldownMs = spec.skillId ? specCooldownMs(state) : 0;
  return { skillId: spec.skillId, lastSwitchAt: spec.lastSwitchAt, cooldownMs, cooldownText: fmtDaysHours(cooldownMs),
    cost: specCostFor(state), switchCost: specSwitchCost(), firstPickFree: !spec.skillId, capLevel: SPEC_CAP_LEVEL,
    eligible: specEligible(state).filter((id) => id !== spec.skillId),
    capped: skillDefs().filter((d) => isSpecCapped(state, d.id) && rawSkillLevel(state, d.id) > SPEC_CAP_LEVEL).map((d) => d.id) };
};
