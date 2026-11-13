// Data access (GW.DATA with defaults), small utils, the E object, log + format.
// Ported from legacy/engine.js lines 9-152. Behaviour must stay identical to the
// legacy build (see test/parity.test.ts); design changes come in phase 1.
/* eslint-disable */
import { ctx } from './context';

// ---------------------------------------------------------------- data access
export const CFG_DEFAULTS = {
  saveKey: 'guildwright-proto-v1', startingGold: 150, xpMult: 4, xpCurveMult: 1, offlineCapSec: 43200, maxLevel: 99,
  marketTax: 0.05, pityThreshold: 40, rarityNonCommonCap: 0.6,
  baseHp: 120, hpPerCombatLevel: 8,
  // Every action's `sec` is multiplied by this factor at actionTimeWith. Phase 2.5 sets it
  // to 1 (the prototype's pace, owner's call). One knob — change here to retune.
  speedFactor: 1
};
export const RARITY_DEFAULTS = [
  { id: 'common', name: 'Common', baseChance: 0.85, affixSlots: 0, statMult: 1.00, durability: 100, valueMult: 1 },
  { id: 'uncommon', name: 'Uncommon', baseChance: 0.11, affixSlots: 1, statMult: 1.15, durability: 130, valueMult: 2.5 },
  { id: 'rare', name: 'Rare', baseChance: 0.0325, affixSlots: 2, statMult: 1.30, durability: 160, valueMult: 8 },
  { id: 'epic', name: 'Epic', baseChance: 0.0065, affixSlots: 3, statMult: 1.50, durability: 200, valueMult: 30 },
  { id: 'legendary', name: 'Legendary', baseChance: 0.001, affixSlots: 4, statMult: 1.75, durability: 300, valueMult: 120 },
  { id: 'mythic', name: 'Mythic', baseChance: 0, affixSlots: 5, statMult: 2.10, durability: 400, valueMult: 500 }
];
export const GRADE_DEFAULTS = [
  { id: 'rough', name: 'Rough', min: 1, max: 39, mult: 0.85, procMult: 0.9 },
  { id: 'standard', name: 'Standard', min: 40, max: 59, mult: 1.00, procMult: 1.0 },
  { id: 'fine', name: 'Fine', min: 60, max: 79, mult: 1.15, procMult: 1.15 },
  { id: 'superior', name: 'Superior', min: 80, max: 94, mult: 1.30, procMult: 1.3 },
  { id: 'pristine', name: 'Pristine', min: 95, max: 100, mult: 1.50, procMult: 1.45 }
];
export const MASTERY_DEFAULTS = [{ crafts: 0, mult: 1.0, name: 'Novice' }, { crafts: 10, mult: 1.1, name: 'Apprentice' },
  { crafts: 100, mult: 1.25, name: 'Journeyman' }, { crafts: 1000, mult: 1.5, name: 'Master' },
  { crafts: 10000, mult: 1.75, name: 'Grandmaster' }];
export const SKILL_DEFAULTS = [
  ['mining', 'gathering'], ['woodcutting', 'gathering'], ['herbalism', 'gathering'], ['fishing', 'gathering'],
  ['smelting', 'refining'], ['carpentry', 'refining'], ['tanning', 'refining'], ['weaving', 'refining'],
  ['smithing', 'crafting'], ['woodworking', 'crafting'], ['leatherworking', 'crafting'], ['tailoring', 'crafting'],
  ['jewelcrafting', 'crafting'], ['alchemy', 'crafting'], ['cooking', 'crafting'],
  ['guardian', 'combat'], ['mender', 'combat'], ['striker', 'combat']
].map(([id, tier]) => ({ id, name: id[0].toUpperCase() + id.slice(1), tier, blurb: '' }));
export const ELEMENT_DEFAULTS = ['fire', 'frost', 'venom', 'holy'];
// fight slots (gear overhaul 2026-11-12: ring1, ring2, amulet). Tools and the work outfit live in state.tools / state.workOutfit.
export const SLOTS = ['weapon', 'offhand', 'head', 'chest', 'legs', 'ring1', 'ring2', 'amulet'];
export const ROLES = ['striker', 'guardian', 'mender'];
export const STANCES = ['aggressive', 'balanced', 'defensive'];
export const TACTICS = ['focus', 'interrupt', 'endure'];
export const CHECKS = ['mitigation', 'healing', 'damage'];
export const LOG_CAP = 80;
export const OFFLINE_MAX_COMPLETIONS = 20000;
export const TICK_MAX_COMPLETIONS = 2000;
export const MARKET_REFRESH_SEC = 120;
export const MAX_PLAYER_LISTINGS = 8;
export const RAID_FRAMES = 60;

export const D = (): any => ctx.data || {};
export const arr = (x: any): any[] => (Array.isArray(x) ? x : []);
// num(x) short form (no default) was common in legacy; preserve it by making `d` optional.
export const num = (x: any, d?: any): any => (typeof x === 'number' && isFinite(x) ? x : d);

export let cfgCache = { src: undefined, val: null };
export function cfg() {
  const src = D().config;
  if (cfgCache.src !== src || !cfgCache.val) {
    const c = Object.assign({}, CFG_DEFAULTS, src || {});
    cfgCache = { src, val: c };
  }
  return cfgCache.val;
}
export const rarities = () => (arr(D().rarities).length ? D().rarities : RARITY_DEFAULTS);
export const grades = () => (arr(D().grades).length ? D().grades : GRADE_DEFAULTS);
export const masteryTiers = () => (arr(D().masteryTiers).length ? D().masteryTiers : MASTERY_DEFAULTS);
export const skillDefs = () => (arr(D().skills).length ? D().skills : SKILL_DEFAULTS);
export const elements = () => (arr(D().elements).length ? D().elements : ELEMENT_DEFAULTS);
export const itemsMap = () => D().items || {};
export const item = (id) => (id != null ? itemsMap()[id] || null : null);
export const allActions = () => arr(D().actions);
export const bosses = () => arr(D().bosses);
export const affixDefs = () => arr(D().affixes);

export let actCache = { src: undefined, map: null };
export function action(id) {
  const src = D().actions;
  if (actCache.src !== src || !actCache.map) {
    const map = {};
    arr(src).forEach((a) => { if (a && a.id) map[a.id] = a; });
    actCache = { src, map };
  }
  return actCache.map[id] || null;
}
export const combatSkillIds = () => {
  const ids = skillDefs().filter((s) => s.tier === 'combat').map((s) => s.id);
  return ids.length ? ids : ['guardian', 'mender', 'striker'];
};

// ---------------------------------------------------------------- small utils
export const rand = (): number => ctx.rng();
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const randInt = (a, b) => { a = Math.ceil(a); b = Math.floor(b); return b <= a ? a : a + Math.floor(rand() * (b - a + 1)); };
export const pick = (list) => list[Math.floor(rand() * list.length)];
export const shuffle = (list) => { const l = list.slice(); for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; } return l; };
export const lcFirst = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);
export const article = (w) => (/^[aeiou]/i.test(w || '') ? 'an' : 'a');
export const itemName = (id) => (item(id) ? item(id).name : id);
// Plurals for player-facing text ("12 Copper bars", "3 Rubies", "40 Copper ore"). Works on the last word;
// mass nouns stay as they are, names that are already plural ("Leather breeches") too.
const MASS = new Set(['ore', 'coal', 'resin', 'grain', 'bloodmoss', 'trout', 'salmon', 'silk', 'essence', 'leather', 'drakeskin',
  'thread', 'cloth', 'canvas', 'moonweave', 'silver', 'bread', 'varnish', 'broth', 'chainmail', 'armour', 'gold', 'xp']);
const IRREGULAR = { leaf: 'leaves', staff: 'staves', lens: 'lenses', aegis: 'aegises', wolf: 'wolves' };
export function plural(name, qty?) {
  const s = String(name == null ? '' : name);
  if (qty === 1 || !s) return s;
  const m = /^(.*?)([A-Za-z'-]+)$/.exec(s); if (!m) return s;
  const [, head, word] = m; const w = word.toLowerCase();
  const keepCase = (p) => (word[0] === word[0].toUpperCase() ? p[0].toUpperCase() + p.slice(1) : p);
  if (MASS.has(w)) return s;
  if (IRREGULAR[w]) return head + keepCase(IRREGULAR[w]);
  if (/(ss|x|ch|sh|z)$/.test(w)) return s + 'es';
  if (/s$/.test(w)) return s; // already plural (breeches, leggings, salts)
  if (/[^aeiou]y$/.test(w)) return s.slice(0, -1) + 'ies';
  return s + 's';
}
/** "12 Copper bars", "1 Copper bar" */
export const qtyName = (qty, id) => `${qty} ${plural(itemName(id), qty)}`;
export const qtyRange = (q) => (Array.isArray(q) ? randInt(num(q[0], 1), num(q[1], num(q[0], 1))) : Math.max(1, Math.round(num(q, 1))));
export const qtyAvg = (q) => (Array.isArray(q) ? (num(q[0], 1) + num(q[1], num(q[0], 1))) / 2 : num(q, 1));
export const zeros5 = () => [0, 0, 0, 0, 0];
export const isStackable = (it) => !!it && it.kind !== 'gear';
export const nextId = (state, prefix) => { state.seq = num(state.seq, 1) + 1; return prefix + state.seq.toString(36); };
export const flags = { quiet: false }; // suppress per-event log lines (offline simulation)

export function gradeOf(quality) {
  const g = grades(); const q = clamp(Math.round(num(quality, 50)), 1, 100);
  for (let i = g.length - 1; i >= 0; i--) if (q >= num(g[i].min, 0)) return i;
  return 0;
}
export function gradeMid(i) { const g = grades()[clamp(i, 0, grades().length - 1)] || GRADE_DEFAULTS[1]; return (num(g.min, 40) + num(g.max, 59)) / 2; }
export const gradeMult = (i) => num((grades()[i] || {}).mult, 1);
export const gradeProcMult = (i) => num((grades()[i] || {}).procMult, 1);
export function rarityIdx(id) { const i = rarities().findIndex((r) => r.id === id); return i < 0 ? 0 : i; }
export const rarityDef = (id) => rarities()[rarityIdx(id)] || RARITY_DEFAULTS[0];

// ---------------------------------------------------------------- engine object
export const E: any = {};

// ---------------------------------------------------------------- log + format
E.log = function (state, kind, text) {
  if (!state) return;
  if (!Array.isArray(state.log)) state.log = [];
  state.log.unshift({ t: ctx.now(), kind: kind || 'info', text: String(text) });
  if (state.log.length > LOG_CAP) state.log.length = LOG_CAP;
};
export const logq = (state, kind, text) => { if (!flags.quiet) E.log(state, kind, text); };

/** Gold for player-facing engine text: rounded, thousands separators, "g" suffix ("1,908g", "-12g"). */
export function fmtGold(n) {
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? '-' : '') + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + 'g';
}
E.fmtGold = fmtGold;
E.fmt = function (n) {
  n = Number(n);
  if (!isFinite(n)) return n > 0 ? '∞' : (n < 0 ? '-∞' : '0');
  const a = Math.abs(n), s = n < 0 ? '-' : '';
  const trim = (x, d) => x.toFixed(d).replace(/\.0+$/, '');
  if (a < 1000) return s + (a < 10 && a % 1 ? trim(a, 1) : String(Math.round(a)));
  const units: [string, number][] = [['t', 1e12], ['b', 1e9], ['m', 1e6], ['k', 1e3]];
  for (const [u, v] of units) if (a >= v) { const x = a / v; return s + trim(x, x < 10 ? 1 : 0) + u; }
  return s + String(Math.round(a));
};
E.fmtTime = function (sec) {
  sec = Number(sec);
  if (!isFinite(sec)) return '∞';
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return sec + 's';
  if (sec < 3600) { const m = Math.floor(sec / 60), s = sec % 60; return s ? `${m}m ${s}s` : `${m}m`; }
  if (sec < 86400) { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return m ? `${h}h ${m}m` : `${h}h`; }
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600); return h ? `${d}d ${h}h` : `${d}d`;
};
