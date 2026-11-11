// State lifecycle: newState, migrate, load/save/reset, UI helpers.
// Ported from legacy/engine.js lines 2571-2694. Behaviour must stay identical to the
// legacy build (see test/parity.test.ts); design changes come in phase 1.
/* eslint-disable */
import { ctx } from './context';
import { E, SLOTS, LOG_CAP, D, arr, num, cfg, skillDefs, item, action, clamp, zeros5, gradeOf, rarityDef, fmtGold, itemName } from './core';
import { addItem } from './inventory';
import { makeGear, clampHp } from './gear';
import { isGearCraft } from './actions';
import { makeCrew, migrateCrew } from './crew-assist';
import { SCHEMA, V3_BOSS_HP } from './v4-helpers';
import { mondayOf, addDays, windowFor, weekStartOf } from './clock';
import { curRecord } from './server';
import { normRules } from './raid-rules';
import { ensureV5 } from './crew-economy';
import { isProfession, rawSkillLevel, SPEC_CAP_LEVEL, xpCurveMult } from './skills';
import { marketEnabled, parkMarket } from './market';
import { ensureEvents, pushEvent } from './events';
import { normStore } from './store';
import { sweepSeen, seedSeen } from './codex';

/** what switchSpec charged for every pick before the phase 2.5 rework (refunded when a spec is cleared on load) */
export const LEGACY_SPEC_CHARGE = 3000;

// ---------------------------------------------------------------- state lifecycle
E.newState = function () {
  const c = cfg(); const now = ctx.now();
  const s = {
    v: SCHEMA, createdAt: now, lastSeen: now, gold: num(c.startingGold, 150), week: 1, hp: 1, focus: 0,
    spec: { skillId: null, lastSwitchAt: null },
    skills: {}, mastery: {}, pity: {}, inv: {}, gear: [],
    equipped: { weapon: null, offhand: null, head: null, chest: null, legs: null, ring: null },
    active: null, settings: { matPriority: 'best', useCatalyst: false, useCore: false },
    market: { listings: [], mine: [], refreshedAt: now, age: 0 },
    raid: { ladder: 0, bossHp: 0, rules: { eatAt: 0.5, stance: 'balanced', tactic: 'focus' }, last: null, resolvedWeek: 0, satOutWeek: 0 },
    log: [], seq: 1,
    // 2026-11-08 additive v6 fields: player event log (events.ts) and the NPC general store (store.ts)
    events: [], eventSeq: 0, store: null,
    // the xpCurveMult this save's XP is stored at (2026-11-11); migrate rescales when it differs
    xpScale: xpCurveMult(),
    // discovery (codex.ts, 2026-11-11): item ids the player has touched
    seen: {}
  };
  skillDefs().forEach((d) => { s.skills[d.id] = { xp: 0 }; });
  const st = D().starter || {};
  Object.keys(st.items || {}).forEach((id) => {
    if (!item(id)) return; const v = st.items[id];
    if (Array.isArray(v)) v.slice(0, 5).forEach((q, g) => addItem(s, id, g, q)); else addItem(s, id, 1, v);
  });
  arr(st.gear).forEach((g) => {
    const id = typeof g === 'string' ? g : g && g.itemId; if (!item(id)) return;
    const ge = makeGear(s, id, 0, 50);
    const slot = item(id).slot;
    if ((typeof g === 'string' || g.equip !== false) && SLOTS.includes(slot) && !s.equipped[slot]) s.equipped[slot] = ge.uid;
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
export function migrate(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.skills !== 'object' || !raw.skills) return null;
  // Accepted: v6 (current), v5 (phase 2), v4, v1, and null (implicit v3 from the prototype).
  // v4/v5 → v6 adds: crew.contracts (+ contractSimIn), treasury log `at` → `t`; merges crew.requisitions
  // into the contracts board; strips cut features: crew.viewAsMember, raid.farm, state.rep, spec.capped,
  // NPC-posted requisitions (escrow released). A spec below level 70 is cleared and refunded (see below).
  if (raw.v != null && raw.v !== 1 && raw.v !== 4 && raw.v !== 5 && raw.v !== SCHEMA) return null;
  try { raw = JSON.parse(JSON.stringify(raw)); } catch (e) { return null; } // never mutate the caller's object
  // v3 and earlier predate clock/server/economy/loadouts and the v4 raid shape.
  const legacyV3 = raw.v == null || raw.v === 1;
  const s = E.newState(); const fresh = s;
  const out = Object.assign({}, fresh, raw, { v: SCHEMA });
  ['gold', 'week', 'hp', 'focus', 'createdAt', 'lastSeen', 'seq'].forEach((k) => { out[k] = num(raw[k], fresh[k]); });
  out.week = Math.max(1, Math.floor(out.week)); out.focus = clamp(out.focus, 0, 100);
  out.skills = {}; skillDefs().forEach((d) => { out.skills[d.id] = { xp: Math.max(0, num(raw.skills[d.id] && raw.skills[d.id].xp, 0)) }; });
  // XP curve change (2026-11-11): stored XP was earned against the curve x raw.xpScale (1 before the
  // field existed). Rescale so every skill keeps its level and its progress within the level. Idempotent.
  const xpFrom = Math.max(0.01, num(raw.xpScale, 1)); const xpTo = xpCurveMult();
  if (xpFrom !== xpTo) skillDefs().forEach((d) => { out.skills[d.id].xp = Math.round(out.skills[d.id].xp * xpTo / xpFrom); });
  out.xpScale = xpTo;
  // v5+ spec field: carry over if present and well-formed; v1/v3/v4 saves get the default.
  let specNote = '';
  const rawSpec = (raw.spec && typeof raw.spec === 'object') ? raw.spec : {};
  const specSkillOk = typeof rawSpec.skillId === 'string' && skillDefs().some((d) => d.id === rawSpec.skillId);
  out.spec = {
    skillId: specSkillOk ? rawSpec.skillId : null,
    lastSwitchAt: (isFinite(rawSpec.lastSwitchAt) && rawSpec.lastSwitchAt > 0) ? Math.floor(rawSpec.lastSwitchAt) : null,
  };
  // Phase 2.5 spec rule: only a profession skill at level 70+ can be a specialization. Before this rule
  // a spec could be picked at any level, and every pick went through switchSpec, which charged
  // LEGACY_SPEC_CHARGE (3,000g). A save whose spec breaks the rule gets the spec cleared, the cooldown
  // reset and 3,000g refunded once (only the last charge is knowable from the save).
  if (out.spec.skillId && (!isProfession(out.spec.skillId) || rawSkillLevel(out, out.spec.skillId) < SPEC_CAP_LEVEL)) {
    const name = (skillDefs().find((d) => d.id === out.spec.skillId) || { name: out.spec.skillId }).name;
    out.spec = { skillId: null, lastSwitchAt: null };
    out.gold += LEGACY_SPEC_CHARGE;
    specNote = `Specializations now need level 70. Your ${name} specialization was cleared and ${fmtGold(LEGACY_SPEC_CHARGE)} refunded.`;
  }
  delete out.rep; // reputation removed
  out.mastery = raw.mastery && typeof raw.mastery === 'object' ? raw.mastery : {};
  out.pity = raw.pity && typeof raw.pity === 'object' ? raw.pity : {};
  out.inv = {};
  Object.keys(raw.inv || {}).forEach((id) => {
    const g = raw.inv[id]; if (!item(id) || !Array.isArray(g)) return;
    const v = zeros5().map((_, i) => Math.max(0, Math.floor(num(g[i], 0))));
    if (v.some((x) => x > 0)) out.inv[id] = v;
  });
  out.gear = arr(raw.gear).filter((g) => g && g.uid && item(g.itemId)).map((g) => ({
    uid: String(g.uid), itemId: g.itemId, rarity: rarityDef(g.rarity).id, quality: clamp(num(g.quality, 50), 1, 100),
    affixes: arr(g.affixes).filter((a) => a && a.id), maxDur: Math.max(1, num(g.maxDur, 100)), dur: Math.max(0, num(g.dur, num(g.maxDur, 100)))
  }));
  out.equipped = {};
  SLOTS.forEach((sl) => { const u = raw.equipped && raw.equipped[sl]; out.equipped[sl] = u && out.gear.some((g) => g.uid === u) ? u : null; });
  migrateCrew(out, raw.crew);
  out.active = raw.active && action(raw.active.actionId) ? { actionId: raw.active.actionId, progress: Math.max(0, num(raw.active.progress, 0)) } : null;
  if (out.active && raw.active.jobId) {
    if (out.crew.jobs.some((j) => j.id === raw.active.jobId)) out.active.jobId = raw.active.jobId; else out.active = null;
  }
  out.settings = Object.assign({}, fresh.settings, raw.settings || {});
  const rm = raw.market || {};
  out.market = { listings: arr(rm.listings).filter((l) => l && item(l.itemId)), mine: arr(rm.mine).filter((l) => l && item(l.itemId)), refreshedAt: num(rm.refreshedAt, ctx.now()), age: num(rm.age, 0) };
  if (!out.market.listings.length) out.market.listings = fresh.market.listings;
  // Player market parked (2026-11-08): open listings go back to the bag, the NPC board is dropped.
  const marketBack = marketEnabled() ? [] : parkMarket(out);
  // additive v6 fields (older saves get the defaults)
  ensureEvents(out);
  out.store = normStore(raw.store);
  marketBack.forEach((b) => pushEvent(out, 'loot', `The market closed: your listing of ${b.qty} ${itemName(b.itemId)} came back to your bag.`, { itemId: b.itemId, qty: b.qty, grade: b.grade }));
  const rr = raw.raid || {};
  if (legacyV3) {
    // v3 save: weeks advanced per raid; anchor the calendar so this real week is the save's week
    out.clock = { epoch: addDays(mondayOf(ctx.now()), -7 * (out.week - 1)), offsetMs: 0 };
    out.server = null; out.economy = null; out.loadouts = [];
    out.raid = { ladder: Math.max(0, Math.floor(num(rr.ladder, 0))), rules: normRules(out, rr.rules), last: rr.last || null, resolvedWeek: out.week - 1 };
  } else {
    out.clock = raw.clock; out.server = raw.server; out.economy = raw.economy; out.loadouts = raw.loadouts;
    out.raid = Object.assign({}, rr, { rules: normRules(out, rr.rules) });
  }
  out.log = arr(raw.log).filter((l) => l && l.text).slice(0, LOG_CAP);
  if (specNote) E.log(out, 'info', specNote);
  // v5: supply board removed. Any carried-over state.supply from v1/v3/v4 is dropped.
  delete out.supply;
  // v5: raid tokens removed. Hoarded tokens on v4 saves are discarded; stale rec.tokens
  // on per-boss records is left as dead data (nothing reads it after the raid-payouts rewrite).
  delete out.tokens;
  // v5: coin → gold on the crew treasury and the economy ledger. migrateCrew already
  // normalised out.crew.treasury.gold to 0 if the raw save only had .coin; fold the legacy
  // value in and drop it. Same for state.economy.raidCoin (incl. per-week entries).
  if (out.crew && out.crew.treasury && 'coin' in out.crew.treasury) {
    out.crew.treasury.gold = num(out.crew.treasury.gold, 0) + num(out.crew.treasury.coin, 0);
    delete out.crew.treasury.coin;
  }
  if (out.economy) {
    if ('raidCoin' in out.economy) {
      out.economy.raidGold = num(out.economy.raidGold, 0) + num(out.economy.raidCoin, 0);
      delete out.economy.raidCoin;
    }
    arr(out.economy.weeks).forEach((w) => {
      if (w && 'raidCoin' in w) { w.raidGold = num(w.raidGold, 0) + num(w.raidCoin, 0); delete w.raidCoin; }
    });
  }
  ensureV5(out);
  if (legacyV3) {
    const rec = curRecord(out); const v3max = num(V3_BOSS_HP[out.raid.ladder], 0);
    const pctLeft = v3max > 0 && isFinite(rr.bossHp) && rr.bossHp > 0 ? clamp(rr.bossHp / v3max, 0.05, 1) : 1;
    rec.hpLeft = Math.round(rec.maxHp * pctLeft); rec.revealedWeek = out.week; rec.weekends = pctLeft < 1 ? 1 : 0;
    out.raid.bossHp = rec.hpLeft;
    if (SLOTS.some((sl) => out.equipped[sl])) E.saveLoadout(out, { name: 'Current gear', fromEquipped: true });
    E.log(out, 'info', 'Guildwright v4: weekend raids now follow the real calendar. Your current gear was saved as a loadout.');
  } else {
    out.raid.bossHp = curRecord(out).hpLeft;
  }
  clampHp(out);
  seedSeen(out, raw); // discovery: what the save owns now + its event history
  return out;
}
export const hasLS = () => ctx.storage != null;
E.load = function () {
  if (!hasLS()) return null;
  try {
    const raw = ctx.storage!.getItem(cfg().saveKey);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch (e) { return null; }
};
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

// ---------------------------------------------------------------- extra helpers for the UI
E.gradeOf = gradeOf;
E.item = item;
E.action = action;
E.isGearCraft = (actionId) => isGearCraft(action(actionId));
E.SLOTS = SLOTS.slice();
