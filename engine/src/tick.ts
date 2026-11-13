// Main tick.
// Ported from legacy/engine.js lines 852-906. Behaviour must stay identical to the
// legacy build (see test/parity.test.ts); design changes come in phase 1.
/* eslint-disable */
import { E, TICK_MAX_COMPLETIONS, MARKET_REFRESH_SEC, arr, num, cfg, grades, action, rand, clamp, itemName, logq, fmtGold, qtyName } from './core';
import { pouchBlock, completeOnce, clearHold, HOLD_MAX_MS } from './actions';
import { ctx } from './context';
import { crewStep, ownerRate, playerRate, isJobAction } from './crew-assist';
import { processClock } from './weekly';
import { crewEconomyStep, crewLocksStep } from './crew-economy';
import { marketEnabled } from './market';
import { ensureStore } from './store';
import { sweepSeen } from './codex';
import { beginLevelBatch, endLevelBatch } from './skills';
import { takeGains } from './gains';
import { stopIfNoTool } from './gear';

// ---------------------------------------------------------------- tick
export function advanceAction(state, dt, events, maxN) {
  const a = state.active; if (!a || a.jobId) return 0;
  const act = action(a.actionId);
  if (!act) { state.active = null; events.push({ type: 'stopped', reason: 'That action no longer exists.' }); return 0; }
  a.progress = num(a.progress, 0) + dt;
  let n = 0;
  while (state.active === a && n < maxN) {
    const t = E.actionTime(state, act.id);
    if (a.progress < t) break;
    a.progress -= t; n++;
    completeOnce(state, act, events);
  }
  if (state.active === a && n >= maxN) a.progress = Math.min(a.progress, E.actionTime(state, act.id) * 0.99);
  return n;
}
export function marketFills(state, dt, events) {
  const tax = state.server ? E.marketTax(state) : clamp(num(cfg().marketTax, 0.05), 0, 1);
  const mine = arr(state.market.mine);
  for (let i = mine.length - 1; i >= 0; i--) {
    const l = mine[i]; if (!(l.qty > 0)) { mine.splice(i, 1); continue; }
    const fair = E.itemValue(l.itemId, l.grade);
    const chance = clamp(0.08 * Math.pow(clamp(fair / Math.max(1, l.price), 0, 2), 3), 0, 0.95);
    const p = 1 - Math.pow(1 - chance, dt);
    if (rand() >= p) continue;
    const units = Math.min(l.qty, 1 + Math.floor(rand() * Math.max(1, Math.ceil(l.qty / 4))));
    const gold = Math.round(l.price * units * (1 - tax));
    l.qty -= units; state.gold += gold;
    events.push({ type: 'sold', itemId: l.itemId, grade: l.grade, qty: units, gold });
    logq(state, 'market', `Sold ${qtyName(units, l.itemId)} (${(grades()[l.grade] || {}).name || 'Standard'}) for ${fmtGold(gold)} after tax.`);
    if (l.qty <= 0) mine.splice(i, 1);
  }
}
E.tick = function (state, dtSec, opts) {
  const events = [];
  if (!state) return events;
  const dt = clamp(num(dtSec, 0), 0, 86400); if (dt <= 0) return events;
  beginLevelBatch();
  try { tickBody(state, dt, opts, events); } finally { endLevelBatch(state); }
  takeGains().forEach((g) => events.push(g)); // gain events (gains.ts), incl. any queued by verbs since the last tick
  return events;
};
function tickBody(state, dt, opts, events) {
  const visible = !opts || opts.visible !== false;
  state.focus = clamp(num(state.focus, 0) + (visible && state.active ? 2 : -5) * dt, 0, 100);
  const ps = E.playerStats(state);
  const act = state.active && action(state.active.actionId);
  if (!act || act.kind !== 'combat') state.hp = Math.min(ps.maxHp, num(state.hp, 0) + ps.maxHp * 0.01 * dt); // gentle regen out of combat
  state.hp = clamp(state.hp, 0, ps.maxHp);
  stopIfNoTool(state, events); // safety net: an empty tool slot ends the job that needs it (owner 2026-11-14)
  // a held job (craft card on screen) makes no progress; everything else runs. Held time is never credited later.
  if (!(state.active && state.active.jobId) && !(state.active && state.active.held)) advanceAction(state, dt, events, TICK_MAX_COMPLETIONS);
  crewStep(state, dt, events, 1);
  crewEconomyStep(state, dt, events);
  processClock(state, events);
  crewLocksStep(state);
  if (state.active && !state.active.jobId) { const pb = pouchBlock(state, action(state.active.actionId)); if (pb) { state.active = null; events.push({ type: 'stopped', reason: pb }); } }
  if (marketEnabled()) {
    state.market.age = num(state.market.age, 0) + dt;
    if (state.market.age >= MARKET_REFRESH_SEC) E.refreshMarket(state);
    marketFills(state, dt, events);
  }
  ensureStore(state);
  sweepSeen(state);
  // safety: a hold never outlives 10 minutes (the card queue lives in the client's memory only)
  const ha = state.active;
  if (ha && ha.held && !(ctx.now() - num(ha.heldAt, 0) < HOLD_MAX_MS)) clearHold(ha);
}

/**
 * Hold or release the active job (craft card pause). While held the job's progress does not advance
 * (solo action: no reps; crew assist: the player adds nothing and gets no assist crafts) and the held time
 * is never credited later. Releasing keeps the progress where it was; the worker re-stamps repStartedAt so
 * the bar continues from the same fraction. Holding with nothing running is a no-op.
 */
E.holdJob = function (state, on) {
  const a = state && state.active;
  if (!on) { clearHold(a); return { ok: true, held: false }; }
  if (!a) return { ok: false, reason: 'Nothing is running.', held: false };
  if (!a.held) { a.held = true; a.heldAt = ctx.now(); }
  return { ok: true, held: true };
};

// Rep timing (2026-11-12, progress-bar sync): how far the active rep is and how long it takes, in seconds.
// The worker schedules its next tick for the moment the rep completes, and stamps wall-clock fields on
// state.active so the UI's progress bar runs on the same clock as the completion.
//   { repSec, elapsedSec, secLeft } or null when nothing is running.
E.repTiming = function (state) {
  const a = state && state.active; if (!a) return null;
  const act = action(a.actionId); if (!act) return null;
  if (a.jobId) {
    const job = state.crew && arr(state.crew.jobs).find((j) => j.id === a.jobId);
    if (!job || !isJobAction(act)) return null;
    const rate = ownerRate(act) + playerRate(state, act);
    if (!(rate > 0) || !isFinite(rate)) return null;
    const p = clamp(num(job.progress, 0), 0, 1);
    return { repSec: 1 / rate, elapsedSec: p / rate, secLeft: (1 - p) / rate };
  }
  const t = E.actionTime(state, act.id);
  if (!(t > 0) || !isFinite(t)) return null;
  const el = clamp(num(a.progress, 0), 0, t);
  return { repSec: t, elapsedSec: el, secLeft: t - el };
};
/**
 * Stamp state.active.repStartedAt / repMs (wall-clock ms, additive, not needed on load) from E.repTiming.
 * The bar is (wallNow - repStartedAt) / repMs; the rep completes at repStartedAt + repMs.
 */
E.stampRep = function (state, wallMs) {
  const a = state && state.active; if (!a) return null;
  const r = E.repTiming(state);
  if (!r) { delete a.repStartedAt; delete a.repMs; delete a.heldFrac; return null; }
  a.repMs = Math.round(r.repSec * 1000);
  a.repStartedAt = Math.round(num(wallMs, 0) - r.elapsedSec * 1000);
  if (a.held) {
    // frozen: the bar stays at heldFrac; nothing completes, so the worker just ticks at its idle rate
    a.heldFrac = r.repSec > 0 ? clamp(r.elapsedSec / r.repSec, 0, 1) : 0;
    return Object.assign({}, r, { secLeft: Infinity });
  }
  delete a.heldFrac;
  return r;
};
