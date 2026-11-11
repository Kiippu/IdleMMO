// Crew activity feed (phase 3 layout pass, 2026-11-11). A selector that merges what already gets recorded:
//   - state.crew.feed: contract hand-ins (yours and crewmates'), contracts filled/closed, town contracts
//     posted, raid payouts to the treasury, vault deposits/withdrawals, rank changes, withdrawal requests
//   - your own crew lines in state.events (assists, "started helping", catch-up assist summary)
//   - state.crew.jobsDone: crewmates' finished jobs (last JOBS_DONE_CAP; written by finishJob; part of fresh state)
// Your event-log lines that the crew feed already carries (hand-ins, posting/cancelling a request, a
// crewmate filling your request, a finished job you helped with) are dropped so nothing shows twice.
/* eslint-disable */
import { E, arr, num, itemName, fmtGold, lcFirst, qtyName } from './core';

// Contract (2026-11-11, QA): `text` never starts with `who` (the client shows who as its own label);
// `full` is the complete sentence for places that show one line without a name.
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export function withoutActor(text, who) {
  const t = String(text || '');
  return who && t.startsWith(who + ' ') ? cap(t.slice(who.length + 1)) : t;
}
import { nowOf } from './clock';

export const JOBS_DONE_CAP = 20;
export const CREW_ACTIVITY_N = 10;
// event-log 'crew' lines that have a crew-feed / jobsDone twin
const TWIN = /^(Filled |Posted a crew request|Cancelled the )| on your request \(|'s .* job is finished\./;

/** record a finished crewmate job (called from finishJob) */
export function noteJobDone(state, job, act, outId, tip) {
  const cr = state.crew; if (!cr) return;
  if (!Array.isArray(cr.jobsDone)) cr.jobsDone = [];
  cr.jobsDone.unshift({ t: nowOf(state), id: job.id, owner: job.owner, actionId: act.id, itemId: outId, qty: num(job.qty, 0), assisted: num(job.assisted, 0), tip: num(tip, 0) });
  if (cr.jobsDone.length > JOBS_DONE_CAP) cr.jobsDone.length = JOBS_DONE_CAP;
}
export function normJobsDone(list) {
  return arr(list).filter((j) => j && typeof j === 'object' && j.owner).slice(0, JOBS_DONE_CAP);
}

export function crewActivity(state, n = CREW_ACTIVITY_N) {
  const cr = state && state.crew; if (!cr) return [];
  const out = [];
  arr(cr.feed).forEach((f) => { if (f && f.text) { const who = f.who || 'Crew'; out.push({ t: num(f.t, 0), kind: f.kind || 'crew', who, text: withoutActor(f.text, who), full: f.text, mine: who === 'You' }); } });
  normJobsDone(cr.jobsDone).forEach((j) => {
    const what = qtyName(j.qty, j.itemId);
    const text = j.assisted > 0 ? `Finished ${what}. You helped with ${j.assisted}${j.tip ? `: +${fmtGold(j.tip)} tip` : ''}.` : `Finished ${what}.`;
    const e: any = { t: num(j.t, 0), kind: 'job', who: j.owner, text, full: `${j.owner} ${lcFirst(text)}`, mine: false, itemId: j.itemId, qty: j.qty };
    if (j.tip) e.gold = j.tip;
    out.push(e);
  });
  arr(state.events).forEach((e) => {
    if (!e || e.cat !== 'crew' || TWIN.test(e.text)) return;
    const o: any = { t: num(e.t, 0), kind: String(e.merge || '').startsWith('assist:') ? 'assist' : 'you', who: 'You', text: withoutActor(e.text, 'You'), full: e.text, mine: true };
    if (e.gold != null) o.gold = e.gold; if (e.itemId) o.itemId = e.itemId; if (e.qty != null) o.qty = e.qty;
    out.push(o);
  });
  // newest first; stable for equal times (feed, then jobs, then your lines, each already newest first)
  return out.map((x, i) => [x, i] as [any, number]).sort((a, b) => b[0].t - a[0].t || a[1] - b[1]).slice(0, Math.max(0, n)).map((x) => x[0]);
}
E.crewActivity = (state, n) => crewActivity(state, n == null ? CREW_ACTIVITY_N : n);
