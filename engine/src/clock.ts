// Weekly clock and raid window.
// Ported from legacy/engine.js lines 1183-1230. Behaviour must stay identical to the
// legacy build (see test/parity.test.ts); design changes come in phase 1.
/* eslint-disable */
import { ctx } from './context';
import { E, num, cfg } from './core';
import { WEEK_MS } from './v4-helpers';
import { curRecord } from './server';

// ================================================================ v4: clock
export function mondayOf(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }
export function addDays(ms, n) { const d = new Date(ms); d.setDate(d.getDate() + n); return d.getTime(); }
export function dayKey(ms) { const d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
export const nowOf = (state, realMs?) => num(realMs, ctx.now()) + num(state && state.clock && state.clock.offsetMs, 0);
export function ensureClock(state) {
  if (!state.clock || typeof state.clock !== 'object') state.clock = {};
  const c = state.clock; c.offsetMs = num(c.offsetMs, 0);
  if (!isFinite(c.epoch)) c.epoch = addDays(mondayOf(ctx.now() + c.offsetMs), -7 * (Math.max(1, Math.floor(num(state.week, 1))) - 1));
  return c;
}
export function weekNum(state, ms) { const c = ensureClock(state); return Math.max(1, Math.round((mondayOf(ms) - mondayOf(c.epoch)) / WEEK_MS) + 1); }
export function weekStartOf(state, wk) { const c = ensureClock(state); return addDays(mondayOf(c.epoch), 7 * (wk - 1)); }
export function schedule(state) { return Object.assign({ startDay: 6, startHour: 10, endDay: 0, endHour: 22 }, cfg().raidWindow || {}, (state.crew && state.crew.schedule) || {}); }
export function windowFor(state, ms) {
  const sc = schedule(state); const mon = mondayOf(ms);
  const sd = (num(sc.startDay, 6) + 6) % 7; let ed = (num(sc.endDay, 0) + 6) % 7; if (ed < sd) ed += 7;
  const st = new Date(addDays(mon, sd)); st.setHours(num(sc.startHour, 10), 0, 0, 0);
  const en = new Date(addDays(mon, ed)); en.setHours(num(sc.endHour, 22), 0, 0, 0);
  if (en <= st) en.setDate(en.getDate() + 7);
  return { start: st.getTime(), end: en.getTime() };
}
export const durTxt = (ms) => E.fmtTime(Math.max(0, ms) / 1000);
E.now = (state) => nowOf(state);
E.weekNumber = (state, realMs) => weekNum(state, nowOf(state, realMs));
E.raidWindow = (state, realMs) => windowFor(state, nowOf(state, realMs));
E.isRaidWindow = function (state, realMs) { const n = nowOf(state, realMs); const w = windowFor(state, n); return n >= w.start && n < w.end; };
E.clock = function (state, realMs) {
  ensureClock(state);
  const now = nowOf(state, realMs); const w = windowFor(state, now);
  const live = now >= w.start && now < w.end;
  const week = Math.max(num(state.week, 1), weekNum(state, now));
  const raidDone = num(state.raid && state.raid.resolvedWeek, 0) >= week;
  let ms, short;
  const nextWeekStart = windowFor(state, addDays(mondayOf(now), 7)).start;
  let nextStart;
  if (live) { ms = w.end - now; nextStart = nextWeekStart; short = 'Raid live · ' + durTxt(ms) + ' left'; }
  else if (now < w.start && !raidDone) { ms = w.start - now; nextStart = w.start; short = 'Raid in ' + durTxt(ms); }
  else { nextStart = nextWeekStart; ms = nextStart - now; short = 'Raid done · next in ' + durTxt(ms); }
  const rec = state.raid && state.raid.bosses ? curRecord(state) : null;
  const weekday = (new Date(now).getDay() + 6) % 7;
  return { live, ms, now, week, weekday, isWeekend: weekday >= 5, raidOpen: live, raidStart: w.start, raidEnd: w.end,
    secToRaid: Math.max(0, (w.start - now) / 1000), secLeftInRaid: live ? (w.end - now) / 1000 : 0, raidDone, nextRaidStart: nextStart, state: live ? 'live' : raidDone ? 'done' : 'upcoming',
    revealed: !!(rec && rec.revealedWeek != null), label: 'Week ' + week + ' · ' + short, short, landingTab: live ? 'raid' : 'workshop' };
};
E.raidClock = E.clock;
E.defaultTab = (state) => (E.isRaidWindow(state) ? 'raid' : 'workshop');
