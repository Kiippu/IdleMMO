// Offline catch-up.
// Ported from legacy/engine.js lines 907-976. Behaviour must stay identical to the
// legacy build (see test/parity.test.ts); design changes come in phase 1.
/* eslint-disable */
import { ctx } from './context';
import { E, OFFLINE_MAX_COMPLETIONS, MARKET_REFRESH_SEC, num, cfg, action, clamp, flags, fmtGold } from './core';
import { completeOnce } from './actions';
import { crewStep } from './crew-assist';
import { marketFills } from './tick';
import { processClock } from './weekly';
import { crewEconomyStep, crewLocksStep } from './crew-economy';
import { marketEnabled } from './market';
import { pushEvent } from './events';
import { addXp, rawSkillLevel } from './skills';
import { addItem } from './inventory';
import { ensureStore } from './store';
import { sweepSeen } from './codex';
import { itemName } from './core';

// ---------------------------------------------------------------- offline
// Owner decisions 2026-11-11: offline catch-up runs at cfg.offlineRate (1.5x at first, lowered to 1x the same day:
// (1 = active speed, 1.5 = 1.5x, clamped to [0, OFFLINE_RATE_MAX]) and has no time cap (cfg.offlineCapSec
// null/0 = unlimited). Long absences are simulated in game-clock chunks (OFFLINE_CHUNK_SEC) with the
// engine clock moved to each chunk's end, so weekly rollovers, raids, NPC contract fills, crew jobs and
// store hours happen in order. Gathering past OFFLINE_MAX_COMPLETIONS individual reps switches to an
// exact-XP bulk step that adds items at the averages seen so far (deterministic).
export const OFFLINE_RATE_MAX = 5;
export const OFFLINE_CHUNK_SEC = 3600;
const CREW_FINE_SEC = 12 * 3600; // crew/economy step 5s for the first 12h, 60s after
function bulkGather(state, act, secs, sample, carry, events) {
  const xpRep = num(act.xp, 0) * num(cfg().xpMult, 1); let reps = 0;
  for (let guard = 0; guard < 400 && secs > 0; guard++) {
    const t = E.actionTime(state, act.id); if (!(t > 0) || !isFinite(t)) break;
    const raw = rawSkillLevel(state, act.skill); const max = Math.max(1, num(cfg().maxLevel, 99));
    const toNext = raw >= max || !(xpRep > 0) ? Infinity : Math.max(1, Math.ceil((E.xpForLevel(raw + 1) - num(state.skills[act.skill].xp, 0)) / xpRep));
    const n = Math.min(Math.floor(secs / t), toNext); if (n < 1) break;
    secs -= n * t; reps += n;
    Object.keys(sample.items).forEach((key) => {
      const exact = sample.items[key] / Math.max(1, sample.n) * n + num(carry[key], 0);
      const q = Math.floor(exact); carry[key] = exact - q; if (q < 1) return;
      const [id, g] = key.split('|'); addItem(state, id, Number(g), q);
      events.push({ type: 'complete', actionId: act.id, kind: act.kind, items: [{ itemId: id, grade: Number(g), qty: q }], xp: 0 });
    });
    state.mastery[act.id] = num(state.mastery[act.id], 0) + n;
    addXp(state, act.skill, xpRep * n, events);
  }
  return { left: secs, reps };
}
E.applyOffline = function (state, nowMs) {
  const now = num(nowMs, ctx.now());
  const summary = { items: {}, xp: {}, gold: 0, crafts: {}, kills: 0, stoppedReason: null, assisted: 0, tips: 0, raids: [], weeks: 0 };
  const last = num(state.lastSeen, now);
  const capSec = num(cfg().offlineCapSec, 0);
  const seconds = clamp((now - last) / 1000, 0, capSec > 0 ? capSec : Infinity);
  state.lastSeen = now;
  if (seconds < 1) { const cev = []; processClock(state, cev); summary.raids = cev.filter((e) => e.type === 'raidResolved').map((e) => e.recapId); return { seconds: 0, summary }; }
  const gold0 = state.gold; const xp0 = {};
  Object.keys(state.skills).forEach((k) => { xp0[k] = num(state.skills[k].xp, 0); });
  state.focus = 0;
  const rate = clamp(num(cfg().offlineRate, 1), 0, OFFLINE_RATE_MAX);
  const realNow = ctx.now; const t0 = now - seconds * 1000;
  const wk0 = state.week;
  const tally = (ev) => ev.forEach((e) => {
    if (e.type === 'complete') e.items.forEach((i) => { summary.items[i.itemId] = (summary.items[i.itemId] || 0) + i.qty; });
    else if (e.type === 'craft') summary.crafts[e.rarity] = (summary.crafts[e.rarity] || 0) + 1;
    else if (e.type === 'kill') summary.kills++;
    else if (e.type === 'faint') summary.stoppedReason = 'You fainted.';
    else if (e.type === 'stopped') summary.stoppedReason = e.reason;
    else if (e.type === 'assist') { summary.assisted++; if (e.rarity) summary.crafts[e.rarity] = (summary.crafts[e.rarity] || 0) + 1; }
    else if (e.type === 'jobDone') summary.tips += e.tip;
    else if (e.type === 'raidResolved') summary.raids.push(e.recapId);
  });
  flags.quiet = true;
  try {
    const a = state.active; const act = a && action(a.actionId);
    if (a && !act) state.active = null;
    const solo = !!(a && act && !a.jobId);
    if (solo) a.progress = num(a.progress, 0);
    let done = 0; const sample = { n: 0, items: {} }; const carry = {}; let restSec = 0;
    for (let el = 0; el < seconds;) {
      const dt = Math.min(OFFLINE_CHUNK_SEC, seconds - el); el += dt;
      const virt = t0 + el * 1000; ctx.now = () => virt; // the engine clock at this chunk's end
      // the solo action, at offlineRate
      if (solo && state.active === a) {
        let remaining = dt * rate;
        while (state.active === a && done < OFFLINE_MAX_COMPLETIONS) {
          const t = E.actionTime(state, act.id);
          const need = Math.max(0, t - a.progress);
          if (need > remaining) { a.progress += remaining; remaining = 0; break; }
          remaining -= need; a.progress = 0; done++;
          const ev = [];
          completeOnce(state, act, ev);
          if (act.kind === 'gather') ev.forEach((e) => { if (e.type === 'complete') { sample.n++; e.items.forEach((i) => { const k = i.itemId + '|' + i.grade; sample.items[k] = (sample.items[k] || 0) + i.qty; }); } });
          tally(ev);
        }
        if (state.active === a && remaining > 0 && done >= OFFLINE_MAX_COMPLETIONS) {
          if (act.kind === 'gather' && sample.n > 0) {
            const ev = []; const r = bulkGather(state, act, a.progress + remaining, sample, carry, ev); a.progress = r.left; tally(ev);
          } else a.progress = 0; // non-gather past the cap: the rest of the time is spent resting
        }
        if (state.active !== a) restSec += remaining;
      } else restSec += dt;
      // crew jobs (an assisting player helps at offlineRate) and the crew economy
      const step = el <= CREW_FINE_SEC || seconds - el < CREW_FINE_SEC ? 5 : 60;
      for (let t = 0; t < dt; t += step) {
        const cev = []; const d = Math.min(step, dt - t);
        // crewmates' own jobs only matter to the player while assisting one; otherwise simulate just the
        // last 12 h so the board looks current (keeps 30-day catch-ups fast)
        if ((state.active && state.active.jobId) || seconds - el < CREW_FINE_SEC) crewStep(state, d, cev, rate);
        crewEconomyStep(state, d, cev);
        tally(cev.filter((e) => e.type !== 'complete'));
      }
      if (marketEnabled()) {
        const ev = [];
        for (let t = 0; t < dt && state.market.mine.length; t += 5) marketFills(state, Math.min(5, dt - t), ev);
        state.market.age = num(state.market.age, 0) + dt;
        if (state.market.age >= MARKET_REFRESH_SEC) E.refreshMarket(state);
      }
      const cev = []; processClock(state, cev); crewLocksStep(state); tally(cev);
    }
    ctx.now = realNow;
    const ps = E.playerStats(state);
    if (!solo) state.hp = ps.maxHp;
    else if (!state.active || act.kind !== 'combat') state.hp = Math.min(ps.maxHp, state.hp + ps.maxHp * 0.01 * (state.active ? seconds : restSec));
    ensureStore(state); sweepSeen(state);
    summary.weeks = state.week - wk0;
  } finally { ctx.now = realNow; flags.quiet = false; }
  summary.gold = Math.round(state.gold - gold0);
  Object.keys(state.skills).forEach((k) => { const d = num(state.skills[k].xp, 0) - num(xp0[k], 0); if (d > 0) summary.xp[k] = d; });
  const nItems = Object.values(summary.items).reduce((x: number, y: any) => x + num(y, 0), 0);
  const xpTot = Object.values(summary.xp).reduce((x: number, y: any) => x + num(y, 0), 0);
  // event log: one line per item gained, plus the gold, stamped with the catch-up time
  if ((nItems as number) > 0 || summary.gold) pushEvent(state, 'loot', `While you were away (${E.fmtTime(seconds)}): ${E.fmt(nItems)} items${summary.gold ? `, ${summary.gold > 0 ? '+' : ''}${fmtGold(summary.gold)}` : ''}.`, summary.gold ? { gold: summary.gold } : {});
  if (summary.assisted) pushEvent(state, 'crew', `While away you helped your crew with ${summary.assisted} crafts${summary.tips ? `: +${fmtGold(summary.tips)} in tips` : ''}.`, summary.tips ? { gold: summary.tips } : {});
  Object.keys(summary.items).forEach((id) => { const q = num(summary.items[id], 0); if (q > 0) pushEvent(state, 'loot', `While away: ${E.fmt(q)} ${itemName(id)}.`, { itemId: id, qty: q }); });
  E.log(state, 'info', `While you were away (${E.fmtTime(seconds)}): ${E.fmt(nItems)} items, ${E.fmt(xpTot)} XP, ${fmtGold(summary.gold)}${summary.kills ? `, ${summary.kills} kills` : ''}${summary.assisted ? `, helped your crew with ${summary.assisted} crafts` : ''}.${summary.stoppedReason ? ' ' + summary.stoppedReason : ''}`);
  return { seconds: Math.floor(seconds), summary };
};
