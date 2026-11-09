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
import { itemName } from './core';

// ---------------------------------------------------------------- offline
E.applyOffline = function (state, nowMs) {
  const now = num(nowMs, ctx.now());
  const summary = { items: {}, xp: {}, gold: 0, crafts: {}, kills: 0, stoppedReason: null, assisted: 0, tips: 0, raids: [], weeks: 0 };
  const last = num(state.lastSeen, now);
  const seconds = clamp((now - last) / 1000, 0, num(cfg().offlineCapSec, 43200));
  state.lastSeen = now;
  if (seconds < 1) { const cev = []; processClock(state, cev); summary.raids = cev.filter((e) => e.type === 'raidResolved').map((e) => e.recapId); return { seconds: 0, summary }; }
  const gold0 = state.gold; const xp0 = {};
  Object.keys(state.skills).forEach((k) => { xp0[k] = num(state.skills[k].xp, 0); });
  state.focus = 0;
  flags.quiet = true;
  try {
    const a = state.active; const act = a && action(a.actionId);
    if (a && act && !a.jobId) {
      let remaining = seconds * clamp(num(cfg().offlineRate, 1), 0, 1), done = 0;
      a.progress = num(a.progress, 0);
      while (state.active === a && done < OFFLINE_MAX_COMPLETIONS) {
        const t = E.actionTime(state, act.id);
        const need = Math.max(0, t - a.progress);
        if (need > remaining) { a.progress += remaining; remaining = 0; break; }
        remaining -= need; a.progress = 0; done++;
        const ev = [];
        completeOnce(state, act, ev);
        ev.forEach((e) => {
          if (e.type === 'complete') e.items.forEach((i) => { summary.items[i.itemId] = (summary.items[i.itemId] || 0) + i.qty; });
          else if (e.type === 'craft') summary.crafts[e.rarity] = (summary.crafts[e.rarity] || 0) + 1;
          else if (e.type === 'kill') summary.kills++;
          else if (e.type === 'faint') summary.stoppedReason = 'You fainted.';
          else if (e.type === 'stopped') summary.stoppedReason = e.reason;
        });
      }
      if (state.active === a && done >= OFFLINE_MAX_COMPLETIONS) a.progress = 0;
      // time left over after a stop: rest
      const ps = E.playerStats(state);
      if (!state.active || act.kind !== 'combat') state.hp = Math.min(ps.maxHp, state.hp + ps.maxHp * 0.01 * (state.active ? seconds : remaining));
    } else {
      if (a && !act) state.active = null;
      state.hp = E.playerStats(state).maxHp;
    }
    // crew: owners keep working; an assisting player helps at offlineRate (coarse 5s steps)
    const oRate = clamp(num(cfg().offlineRate, 1), 0, 1);
    for (let t = 0; t < seconds; t += 5) {
      const cev = [];
      crewStep(state, Math.min(5, seconds - t), cev, oRate);
      crewEconomyStep(state, Math.min(5, seconds - t), cev);
      cev.forEach((e) => {
        if (e.type === 'assist') { summary.assisted++; if (e.rarity) summary.crafts[e.rarity] = (summary.crafts[e.rarity] || 0) + 1; }
        else if (e.type === 'jobDone') summary.tips += e.tip;
        else if (e.type === 'stopped') summary.stoppedReason = e.reason;
      });
    }
    // market: coarse 5s steps
    const ev = [];
    if (marketEnabled()) {
      for (let t = 0; t < seconds && state.market.mine.length; t += 5) marketFills(state, Math.min(5, seconds - t), ev);
      state.market.age = num(state.market.age, 0) + seconds;
      if (state.market.age >= MARKET_REFRESH_SEC) E.refreshMarket(state);
    }
    const wk0 = state.week; const cev = [];
    processClock(state, cev); crewLocksStep(state);
    summary.raids = cev.filter((e) => e.type === 'raidResolved').map((e) => e.recapId);
    summary.weeks = state.week - wk0;
  } finally { flags.quiet = false; }
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
