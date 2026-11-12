// v4 helpers.
// Ported from legacy/engine.js lines 1152-1182. Behaviour must stay identical to the
// legacy build (see test/parity.test.ts); design changes come in phase 1.
/* eslint-disable */
import { D, arr, num, clamp, zeros5 } from './core';
import { cap1 } from './crew-economy';

// ================================================================ v4: helpers
export const DAY_MS = 86400000, WEEK_MS = 7 * DAY_MS;
// Save schema (2026-11-12: v8, gear overhaul; older saves are not loaded, see state.ts checkSave)
export const SCHEMA = 8;
export const CHECK_LABEL = { mitigation: 'Mitigation', healing: 'Healing', damage: 'Damage', food: 'Food', consumables: 'Consumables' };
export const ROLE_CHECK = { guardian: 'mitigation', mender: 'healing', striker: 'damage' };
export const RAID_ROLE_IDS = ['guardian', 'mender', 'striker', 'supply'];
export const TIERS = ['none', 'bronze', 'silver', 'gold'];
export const TIER_NAME = { none: 'No tier', bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };
export const OFF_ROLE = 0.3, ROLE_MIX = (1 + 2 * OFF_ROLE) / 3; // avg output per stat of a player at "fair" power
export const HP_K = 30; // expected server damage per participant-weekend, in units of the boss requirement
export const FEED_CAP = 80;
export const TREASURY_LOG_CAP = 200; // phase 2.5: every vault + gold movement is logged, so keep more history
export function mulberry(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const clone = (x) => JSON.parse(JSON.stringify(x));
export const roleDefs = () => (arr(D().raidRoles).length ? D().raidRoles : RAID_ROLE_IDS.map((id) => ({ id, name: cap1(id), check: ROLE_CHECK[id] || null, takesHits: id !== 'supply' })));
export const roleDef = (id) => roleDefs().find((r) => r.id === id) || roleDefs()[2];
export const rankDefs = () => (arr(D().crewRanks).length ? D().crewRanks : [{ id: 'leader', name: 'Leader', perms: {}, withdrawCap: Infinity }, { id: 'officer', name: 'Officer', perms: {}, withdrawCap: 40 }, { id: 'member', name: 'Member', perms: {}, withdrawCap: 0 }]);
export const rankDef = (id) => rankDefs().find((r) => r.id === id) || rankDefs()[rankDefs().length - 1];
export const sumInv = (m) => Object.keys(m || {}).reduce((a, id) => a + arr(m[id]).reduce((x, y) => x + (y > 0 ? y : 0), 0), 0);
export const invCount = (m, id) => arr(m && m[id]).reduce((x, y) => x + (y > 0 ? y : 0), 0);
export function invAdd(m, id, grade, qty) { if (!(qty > 0)) return; if (!Array.isArray(m[id])) m[id] = zeros5(); m[id][clamp(Math.floor(num(grade, 1)), 0, 4)] += qty; }
export function invTake(m, id, qty, order, minGrade) { // returns [{grade, qty}] taken
  const g = m[id]; const out = []; if (!g) return out;
  let need = qty;
  for (const i of order) { if (need <= 0) break; if (i < num(minGrade, 0)) continue; const t = Math.min(need, Math.max(0, g[i] || 0)); if (t > 0) { g[i] -= t; need -= t; out.push({ grade: i, qty: t }); } }
  if (g.every((x) => !(x > 0))) delete m[id];
  return out;
}
export const BEST = [4, 3, 2, 1, 0], WORST = [0, 1, 2, 3, 4];
