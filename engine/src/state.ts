// State lifecycle: newState, migrate, load/save/reset, UI helpers.
// Ported from legacy/engine.js lines 2571-2694. Behaviour must stay identical to the
// legacy build (see test/parity.test.ts); design changes come in phase 1.
/* eslint-disable */
import { ctx } from './context';
import { E, SLOTS, LOG_CAP, D, arr, num, cfg, skillDefs, item, action, clamp, zeros5, gradeOf, rarityDef, grades } from './core';
import { addItem } from './inventory';
import { makeGear, clampHp, emptyOutfit, emptyTools, sectionOf, maxDurOf, affixDef, normMaker } from './gear';
import { OUTFIT_SETS, OUTFIT_PIECES, TOOL_SKILLS, ROLL_MIN, ROLL_MAX } from './data/gear/model';
import { isGearCraft } from './actions';
import { makeCrew, loadCrew } from './crew-assist';
import { SCHEMA } from './v4-helpers';
import { windowFor, weekStartOf } from './clock';
import { curRecord } from './server';
import { normRules } from './raid-rules';
import { ensureV5 } from './crew-economy';
import { isProfession, rawSkillLevel, SPEC_CAP_LEVEL } from './skills';
import { marketEnabled } from './market';
import { ensureEvents } from './events';
import { normStore } from './store';
import { sweepSeen, seedSeen } from './codex';
import { normSeenUnlocks, seedSeenUnlocks } from './unlocks';
import { emptyGuide, normGuide } from './guide';

// ---------------------------------------------------------------- state lifecycle
E.newState = function () {
  const c = cfg(); const now = ctx.now();
  const s = {
    v: SCHEMA, createdAt: now, lastSeen: now, gold: num(c.startingGold, 150), week: 1, hp: 1, focus: 0,
    spec: { skillId: null, lastSwitchAt: null },
    skills: {}, mastery: {}, pity: {}, inv: {}, gear: [],
    equipped: { weapon: null, offhand: null, head: null, chest: null, legs: null, ring1: null, ring2: null, amulet: null },
    // gear overhaul (v8): work outfit sets and one tool per work skill, used automatically
    workOutfit: emptyOutfit(), tools: emptyTools(),
    active: null, settings: { matPriority: 'best', useCatalyst: false, useCore: false },
    market: { listings: [], mine: [], refreshedAt: now, age: 0 },
    raid: { ladder: 0, bossHp: 0, rules: { eatAt: 0.5, stance: 'balanced', tactic: 'focus' }, last: null, resolvedWeek: 0, satOutWeek: 0 },
    log: [], seq: 1,
    // 2026-11-08 additive v6 fields: player event log (events.ts) and the NPC general store (store.ts)
    events: [], eventSeq: 0, store: null,
    // discovery (codex.ts, 2026-11-11): item ids the player has touched
    seen: {},
    // recently unlocked actions the player has dismissed (unlocks.ts, 2026-11-12)
    seenUnlocks: {},
    // first-hour guide progress (guide.ts, 2026-11-14); null on a loaded save that predates it
    guide: emptyGuide()
  };
  skillDefs().forEach((d) => { s.skills[d.id] = { xp: 0 }; });
  const st = D().starter || {};
  Object.keys(st.items || {}).forEach((id) => {
    if (!item(id)) return; const v = st.items[id];
    if (Array.isArray(v)) v.slice(0, 5).forEach((q, g) => addItem(s, id, g, q)); else addItem(s, id, 1, v);
  });
  arr(st.gear).forEach((g) => {
    const id = typeof g === 'string' ? g : g && g.itemId; if (!item(id)) return;
    const ge = makeGear(s, id, 0, typeof g === 'object' && g.quality != null ? g.quality : 50, { maker: { kind: 'starter' } });
    if (typeof g === 'string' || g.equip !== false) E.equip(s, ge.uid);
  });
  // a free Common tool (Standard) of the starter tier in every tool slot
  const toolTier = num(st.toolTier, 1);
  TOOL_SKILLS.forEach((skill) => {
    const id = Object.keys(D().items || {}).find((k) => { const it = item(k); return it && it.section === 'tool' && it.toolSkill === skill && num(it.tier, 1) === toolTier; });
    if (id) { const g = makeGear(s, id, 0, 50, { maker: { kind: 'starter' } }); g.starter = true; s.tools[skill] = g.uid; } // starter data (maker line); sold/salvaged like any Common T1 tool (owner 2026-11-14)
  });
  s.hp = E.playerStats(s).maxHp;
  const b = E.currentBoss(s); s.raid.bossHp = b ? Math.max(1, num(b.hp, 1)) : 0;
  if (marketEnabled()) E.refreshMarket(s); // parked: the general store replaces the market
  makeCrew(s);
  // A save created after this week's raid window opened sits that raid out: it joins next week's.
  // Without this, resolvedWeek defaulted to week-1 and the first tick resolved a raid that started
  // before the save existed (auto-locking the new player and paying them). Marked before ensureV5 so
  // no town contracts are posted for a raid that is already under way.
  const sitOut = ctx.now() >= windowFor(s, weekStartOf(s, s.week)).start;
  s.raid.resolvedWeek = sitOut ? s.week : s.week - 1;
  if (sitOut) s.raid.satOutWeek = s.week; // E.raidStatus().sittingOut
  ensureV5(s);
  curRecord(s).revealedWeek = s.week;
  if (SLOTS.some((sl) => s.equipped[sl])) E.saveLoadout(s, { name: 'Starter kit', fromEquipped: true });
  sweepSeen(s);
  E.log(s, 'info', 'Welcome to Guildwright. Pick a skill and start gathering.');
  return s;
};
// Save schema v7 (owner decision 2026-11-11): saves older than v7 are NOT migrated. They read as
// 'old-save' and the caller starts a fresh state (everyone starts from the beginning). A v7 save is
// normalised field by field against a fresh state so a hand-edited or partial save can't break the engine.
export type SaveStatus = 'ok' | 'none' | 'old-save' | 'corrupt';
/** classify a parsed save object without loading it */
export function checkSave(raw) {
  if (raw == null) return { ok: false, status: 'none', version: null };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, status: 'corrupt', version: null };
  const version = isFinite(raw.v) ? Number(raw.v) : null;
  if (version == null || version < SCHEMA) return { ok: false, status: 'old-save', version };
  if (version > SCHEMA || typeof raw.skills !== 'object' || !raw.skills) return { ok: false, status: 'corrupt', version };
  return { ok: true, status: 'ok', version };
}
export function migrate(raw) {
  if (!checkSave(raw).ok) return null;
  try { raw = JSON.parse(JSON.stringify(raw)); } catch (e) { return null; } // never mutate the caller's object
  const s = E.newState(); const fresh = s;
  const out = Object.assign({}, fresh, raw, { v: SCHEMA });
  ['gold', 'week', 'hp', 'focus', 'createdAt', 'lastSeen', 'seq'].forEach((k) => { out[k] = num(raw[k], fresh[k]); });
  out.week = Math.max(1, Math.floor(out.week)); out.focus = clamp(out.focus, 0, 100);
  out.skills = {}; skillDefs().forEach((d) => { out.skills[d.id] = { xp: Math.max(0, num(raw.skills[d.id] && raw.skills[d.id].xp, 0)) }; });
  const rawSpec = (raw.spec && typeof raw.spec === 'object') ? raw.spec : {};
  const specOk = typeof rawSpec.skillId === 'string' && isProfession(rawSpec.skillId) && rawSkillLevel(out, rawSpec.skillId) >= SPEC_CAP_LEVEL;
  out.spec = {
    skillId: specOk ? rawSpec.skillId : null,
    lastSwitchAt: specOk && isFinite(rawSpec.lastSwitchAt) && rawSpec.lastSwitchAt > 0 ? Math.floor(rawSpec.lastSwitchAt) : null,
  };
  out.mastery = raw.mastery && typeof raw.mastery === 'object' ? raw.mastery : {};
  out.pity = raw.pity && typeof raw.pity === 'object' ? raw.pity : {};
  out.inv = {};
  Object.keys(raw.inv || {}).forEach((id) => {
    const g = raw.inv[id]; if (!item(id) || !Array.isArray(g)) return;
    const v = zeros5().map((_, i) => Math.max(0, Math.floor(num(g[i], 0))));
    if (v.some((x) => x > 0)) out.inv[id] = v;
  });
  out.gear = arr(raw.gear).filter((g) => g && g.uid && item(g.itemId) && item(g.itemId).kind === 'gear').map((g) => normGearPiece(g));
  const has = (u, pred) => !!u && out.gear.some((g) => g.uid === u && pred(item(g.itemId)));
  const used = new Set();
  const take = (u, pred) => { if (!has(u, pred) || used.has(u)) return null; used.add(u); return u; };
  out.equipped = {};
  SLOTS.forEach((sl) => { const u = raw.equipped && raw.equipped[sl]; out.equipped[sl] = take(u, (it) => sectionOf(it) === 'fight' && (it.slot === sl || (it.slot === 'ring' && (sl === 'ring1' || sl === 'ring2')))); });
  out.workOutfit = emptyOutfit();
  OUTFIT_SETS.forEach((set) => OUTFIT_PIECES.forEach((p) => { const u = raw.workOutfit && raw.workOutfit[set] && raw.workOutfit[set][p];
    out.workOutfit[set][p] = take(u, (it) => sectionOf(it) === 'outfit' && it.outfitSet === set && it.slot === p); }));
  out.tools = emptyTools();
  TOOL_SKILLS.forEach((k) => { const u = raw.tools && raw.tools[k]; out.tools[k] = take(u, (it) => sectionOf(it) === 'tool' && it.toolSkill === k); });
  loadCrew(out, raw.crew);
  out.active = raw.active && action(raw.active.actionId) ? { actionId: raw.active.actionId, progress: Math.max(0, num(raw.active.progress, 0)) } : null;
  if (out.active && raw.active.jobId) {
    if (out.crew.jobs.some((j) => j.id === raw.active.jobId)) out.active.jobId = raw.active.jobId; else out.active = null;
  }
  // quantity jobs (additive, 2026-11-12): a save without `left` runs unlimited
  if (out.active && !out.active.jobId && raw.active.left != null) {
    const left = Math.floor(num(raw.active.left, 0));
    if (left >= 1) { out.active.left = left; out.active.count = Math.max(left, Math.floor(num(raw.active.count, left))); out.active.got = Math.max(0, num(raw.active.got, 0)); }
    else out.active = null; // a finished count never resumes
  }
  out.settings = Object.assign({}, fresh.settings, raw.settings || {});
  const rm = raw.market || {};
  out.market = marketEnabled()
    ? { listings: arr(rm.listings).filter((l) => l && item(l.itemId)), mine: arr(rm.mine).filter((l) => l && item(l.itemId)), refreshedAt: num(rm.refreshedAt, ctx.now()), age: num(rm.age, 0) }
    : fresh.market; // player market parked: nothing to keep
  ensureEvents(out);
  out.store = normStore(raw.store);
  const rr = raw.raid || {};
  out.clock = raw.clock; out.server = raw.server; out.economy = raw.economy;
  out.loadouts = arr(raw.loadouts).filter((l) => l && l.id).slice(0, 12).map((l) => {
    const slots = {}; SLOTS.forEach((sl) => { const u = l.slots && l.slots[sl]; slots[sl] = typeof u === 'string' && u ? u : null; });
    return { id: String(l.id), name: String(l.name || 'Loadout').slice(0, 24), slots, goal: l.goal || null, createdAt: num(l.createdAt, ctx.now()) };
  });
  out.raid = Object.assign({}, rr, { rules: normRules(out, rr.rules) });
  out.log = arr(raw.log).filter((l) => l && l.text).slice(0, LOG_CAP);
  ensureV5(out);
  out.raid.bossHp = curRecord(out).hpLeft;
  clampHp(out);
  seedSeen(out, raw); // discovery: the save's seen list + what it owns now + its event history
  // recently unlocked (additive, 2026-11-12): a save from before this field existed marks everything it
  // has already unlocked as seen, so only unlocks gained from now on show up
  out.seenUnlocks = raw.seenUnlocks && typeof raw.seenUnlocks === 'object' && !Array.isArray(raw.seenUnlocks)
    ? normSeenUnlocks(raw.seenUnlocks) : seedSeenUnlocks(out);
  // guide progress (additive, 2026-11-14): null when the save has none, so the client can seed it once from localStorage
  out.guide = normGuide(raw.guide);
  return out;
}
/** a v8 gear piece, normalised: fight gear keeps dur/maxDur, tools cond (1..100), outfit pieces neither */
export function normGearPiece(g) {
  const it = item(g.itemId); const sec = sectionOf(it); const rarity = rarityDef(g.rarity).id;
  const affixes = arr(g.affixes).filter((a) => a && affixDef(a.id)).map((a) => ({ id: a.id, roll: a.id === 'primary' ? 1 : clamp(num(a.roll, 1), ROLL_MIN, ROLL_MAX) }));
  const out: any = { uid: String(g.uid), itemId: g.itemId, rarity, quality: clamp(num(g.quality, 50), 1, 100), affixes };
  if (sec === 'fight') { out.maxDur = Math.max(1, num(g.maxDur, maxDurOf(rarity, affixes))); out.dur = clamp(num(g.dur, out.maxDur), 0, out.maxDur); }
  else if (sec === 'tool') out.cond = clamp(num(g.cond, 100), 1, 100);
  if (g.starter === true) out.starter = true;
  const mk = normMaker(g.maker); if (mk) out.maker = mk; // additive (gear card): pieces made before it show no maker
  return out;
}
export const hasLS = () => ctx.storage != null;
/**
 * Load the stored save with its status. status 'old-save' = a save from before schema v7 (not loaded:
 * start fresh and tell the player); 'corrupt' = unreadable; 'none' = nothing stored. state is null unless 'ok'.
 */
E.loadSave = function () {
  const res = (status, version, state) => ({ state, status, version });
  if (!hasLS()) return res('none', null, null);
  let parsed;
  try {
    const text = ctx.storage!.getItem(cfg().saveKey);
    if (!text) return res('none', null, null);
    parsed = JSON.parse(text);
  } catch (e) { return res('corrupt', null, null); }
  const c = checkSave(parsed);
  if (!c.ok) return res(c.status, c.version, null);
  const st = migrate(parsed);
  return st ? res('ok', c.version, st) : res('corrupt', c.version, null);
};
/** the stored save, or null (none, old-save or corrupt: use E.loadSave() to tell which) */
E.load = function () { return E.loadSave().state; };
E.save = function (state) {
  if (!state) return;
  state.lastSeen = ctx.now();
  if (!hasLS()) return;
  try { ctx.storage!.setItem(cfg().saveKey, JSON.stringify(state)); } catch (e) { /* quota or privacy mode */ }
};
E.reset = function () {
  if (hasLS()) { try { ctx.storage!.removeItem(cfg().saveKey); } catch (e) { /* ignore */ } }
  return E.newState();
};
E.migrate = migrate;
E.checkSave = checkSave;
E.SCHEMA = SCHEMA;

// ---------------------------------------------------------------- extra helpers for the UI
E.gradeOf = gradeOf;
// The ONE grade ladder (DATA.grades): 0 Rough, 1 Standard, 2 Fine, 3 Superior, 4 Pristine. Every player-facing
// grade name comes from here (client: client/src/engine/grades.ts reads the same list).
E.gradeName = (i) => ((grades()[clamp(Math.floor(num(i, 1)), 0, grades().length - 1)] || {}).name || '');
E.gradeAtLeast = (i) => { const k = clamp(Math.floor(num(i, 0)), 0, grades().length - 1); return k <= 0 ? 'Any grade' : k >= grades().length - 1 ? E.gradeName(k) : E.gradeName(k) + '+'; };
E.item = item;
E.action = action;
E.isGearCraft = (actionId) => isGearCraft(action(actionId));
E.SLOTS = SLOTS.slice();
