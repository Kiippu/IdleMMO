// Server population and boss ladder.
// Ported from legacy/engine.js lines 1231-1283. Behaviour must stay identical to the
// legacy build (see test/parity.test.ts); design changes come in phase 1.
/* eslint-disable */
import { E, arr, num, cfg, bosses, clamp } from './core';
import { CHECK_LABEL, HP_K } from './v4-helpers';
import { bossPhases } from './weekly';

// ================================================================ v4: server + boss ladder
export function avgPop(state) { const h = arr(state.server && state.server.popHistory).filter((x) => x > 0); return h.length ? h.reduce((a, b) => a + b, 0) / h.length : num(cfg().serverPop, 1200); }
export const seasonMult = (state) => 1 + 0.25 * (Math.max(1, num(state.raid.season, 1)) - 1);
export function bossMaxHp(state, b, pop) { return Math.max(1000, Math.round(pop * num(b.reqPower, 300) * HP_K * num(b.weekends, 2) * seasonMult(state))); }
export function ensureRecord(state, idx, week) {
  const b = bosses()[idx]; if (!b) return null;
  const R = state.raid.bosses || (state.raid.bosses = {});
  if (!R[b.id]) {
    const pop = Math.round(avgPop(state)); const hp = bossMaxHp(state, b, pop);
    R[b.id] = { bossId: b.id, index: idx, maxHp: hp, hpLeft: hp, pop, unlockedWeek: num(week, state.week), revealedWeek: null, killedWeek: null,
      weekends: 0, myPoints: 0, totalPoints: 0, joinedWeekends: 0, checkpointsPaid: [] };
  }
  return R[b.id];
}
export function curRecord(state) {
  const idx = clamp(Math.floor(num(state.raid.ladder, 0)), 0, Math.max(0, bosses().length - 1));
  const r = ensureRecord(state, idx, state.week);
  if (r) state.raid.bossHp = r.hpLeft;
  return r;
}
export const bossReq = (b) => Math.max(50, num(b && b.reqPower, 300));
E.currentBoss = function (state) {
  const b = bosses(); if (!b.length) return null;
  const def = b[clamp(Math.floor(num(state && state.raid && state.raid.ladder, 0)), 0, b.length - 1)];
  if (!state || !state.raid || !state.raid.bosses) return def;
  const r = curRecord(state);
  return Object.assign({}, def, { hp: r ? r.maxHp : def.hp, revealed: !!(r && r.revealedWeek != null) });
};
E.bossRecord = function (state, bossId) {
  if (!bossId) return curRecord(state);
  const i = bosses().findIndex((b) => b.id === bossId); if (i < 0) return null;
  return (state.raid.bosses || {})[bossId] || null;
};
E.bossIntel = function (state) {
  const boss = E.currentBoss(state); if (!boss) return null;
  const rec = curRecord(state); const rev = rec.revealedWeek != null;
  const dealt = 1 - rec.hpLeft / Math.max(1, rec.maxHp);
  return { boss, record: Object.assign({}, rec), revealed: rev, name: rev ? boss.name : 'Unknown boss', title: boss.title,
    weakTo: rev ? boss.weakTo || null : null, hits: rev ? boss.hits || null : null,
    phases: rev ? bossPhases(boss).map((p) => ({ name: p.name, check: p.check, label: CHECK_LABEL[p.check] })) : [],
    maxHp: rec.maxHp, hpLeft: rec.hpLeft, hpPct: rec.hpLeft / Math.max(1, rec.maxHp), damageDealtPct: dealt,
    checkpoints: arr(cfg().checkpoints).map((at) => ({ at, reached: dealt >= at - 1e-9, paidWeek: rec.checkpointsPaid.includes(at) ? true : null })),
    pop: rec.pop, reqPower: bossReq(boss), cores: num(boss.cores, 20), weekends: rec.weekends, carryOver: rec.weekends > 0 };
};
E.ladder = function (state) {
  const idx = num(state.raid.ladder, 0);
  return bosses().map((b, i) => {
    const r = (state.raid.bosses || {})[b.id];
    return { bossId: b.id, name: (i <= idx && (!r || r.revealedWeek != null || i < idx)) ? b.name : '???', index: i,
      status: i < idx ? 'killed' : i === idx ? 'current' : 'locked', hpPct: r ? r.hpLeft / Math.max(1, r.maxHp) : 1, killedWeek: r ? r.killedWeek : null };
  });
};
