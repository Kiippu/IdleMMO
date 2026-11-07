// Crew assist jobs (helping a crewmate uses the idle slot).
// Ported from legacy/engine.js lines 668-851. Behaviour must stay identical to the
// legacy build (see test/parity.test.ts); design changes come in phase 1.
/* eslint-disable */
import { ctx } from './context';
import { E, D, arr, num, cfg, rarities, skillDefs, item, allActions, action, rand, clamp, randInt, pick, shuffle, nextId, gradeOf, rarityIdx, rarityDef, logq } from './core';
import { addXp } from './skills';
import { rarityOdds } from './actions';
import { schedule } from './clock';
import { ensureCrewV5 } from './crew-economy';

// ---------------------------------------------------------------- crew assist (v2, SPEC 4.1)
export const STATIONS = {
  mining: 'Copper hill', woodcutting: 'Timber stand', herbalism: 'Herb garden', fishing: 'River dock',
  smelting: 'Smelter', carpentry: 'Sawpit', tanning: 'Tannery', weaving: 'Loom house',
  smithing: 'Forge', woodworking: "Bowyer's bench", leatherworking: 'Leather bench', tailoring: 'Sewing table',
  jewelcrafting: "Jeweller's bench", alchemy: 'Cauldron', cooking: 'Hearth',
  guardian: 'Wilds', mender: 'Wilds', striker: 'Wilds'
};
export const CREW_MIN_JOBS = 3, CREW_MAX_JOBS = 5;
E.station = function (skillId) {
  if (STATIONS[skillId]) return STATIONS[skillId];
  const d = skillDefs().find((s) => s.id === skillId);
  if (d && d.tier === 'combat') return 'Wilds';
  return d ? `${d.name} workshop` : 'Workshop';
};
export const isJobAction = (a) => !!a && (a.kind === 'refine' || a.kind === 'craft') && !!a.outputs && Object.keys(a.outputs).some((id) => item(id));
export const jobActions = (skill) => allActions().filter((a) => isJobAction(a) && a.skill === skill);
export const jobOutput = (act) => Object.keys((act && act.outputs) || {}).find((id) => item(id)) || null;
export const ownerRate = (act) => 1 / Math.max(0.5, num(act.sec, 3) * 1.6);
export const playerRate = (state, act) => 1 / Math.max(0.25, E.actionTime(state, act.id));
export const skillName = (id) => { const d = skillDefs().find((x) => x.id === id); return d ? d.name : id; };
// Authored stand-in roster: four NPCs with heterogeneous refine/craft specs so the market
// and requisition flow has real pressure in solo play. Design doc's "Crew: Up to 10" is the
// hard cap; phase 1 ships four — Stage E stand-ins. Later phases can grow the roster up to
// the cap or back to procedural fill.
export const CREW_NPCS = [
  { id: 'c_merrick', name: 'Merrick', skill: 'smelting' },   // ore → bars
  { id: 'c_aldis',   name: 'Aldis',   skill: 'carpentry' },  // logs → planks
  { id: 'c_branka',  name: 'Branka',  skill: 'smithing' },   // bars → gear
  { id: 'c_osric',   name: 'Osric',   skill: 'tailoring' },  // cloth → gear
];

export function makeCrew(state) {
  const members = CREW_NPCS.map((n) => ({ id: n.id, name: n.name, skill: n.skill }));
  state.crew = { name: 'Copperbell crew', members, jobs: [], nextPostIn: randInt(60, 90) };
  ensureCrewV5(state);
  // Seed one job per authored member so the Workshop isn't empty on day one.
  for (let i = 0; i < members.length && i < CREW_MAX_JOBS; i++) postJob(state);
}
// posts one job; ~half within the player's level, ~30% just above it (up to +10)
export function postJob(state, forcedActionId?) {
  const crew = state.crew; if (!crew) return null;
  const members = arr(crew.members);
  let act = forcedActionId ? action(forcedActionId) : null, owner;
  if (forcedActionId && !isJobAction(act)) return null;
  if (act) {
    const m = members.find((x) => x.skill === act.skill) || (members.length ? pick(members) : null);
    owner = m ? m.name : 'A crewmate';
  } else {
    const busy = new Set(arr(crew.jobs).map((j) => j.owner));
    const able = members.filter((m) => m.skill && jobActions(m.skill).length);
    const free = able.filter((m) => !busy.has(m.name));
    const m = free.length ? pick(free) : able.length ? pick(able) : null;
    owner = m ? m.name : (members.length ? pick(members).name : 'A crewmate');
    let list = m ? jobActions(m.skill) : [];
    if (!list.length) list = allActions().filter(isJobAction);
    if (!list.length) return null;
    const within = list.filter((a) => num(a.level, 1) <= E.skillLevel(state, a.skill)).sort((a, b) => num(b.level, 1) - num(a.level, 1));
    const above = list.filter((a) => { const d = num(a.level, 1) - E.skillLevel(state, a.skill); return d > 0 && d <= 10; });
    const r = rand();
    act = r < 0.5 && within.length ? pick(within.slice(0, 4)) : r < 0.8 && above.length ? pick(above) : (within.length && r < 0.9 ? pick(within) : pick(list));
  }
  const rarCounts = {}; rarities().forEach((x) => { rarCounts[x.id] = 0; });
  const job = { id: nextId(state, 'j'), owner, actionId: act.id, qty: randInt(5, 20), done: 0, progress: 0, assisted: 0, postedAt: ctx.now(), rarities: rarCounts };
  crew.jobs.push(job);
  return job;
}
export function jobCraft(state, job, act, helping, events) {
  const outId = jobOutput(act); const it = item(outId);
  const q = Math.max(1, Math.round(num(act.outputs[outId], 1)));
  const grade = gradeOf(45 + rand() * 30);
  let rarity = null;
  if (it && it.kind === 'gear') {
    const total = 1.25 * (helping ? 1 + 0.2 * clamp(num(state.focus, 0), 0, 100) / 100 : 1);
    const odds = rarityOdds(total, false);
    let r = rand(), idx = 0;
    for (let i = 0; i < odds.length; i++) { r -= odds[i]; if (r < 0) { idx = i; break; } }
    rarity = rarities()[idx].id;
    job.rarities[rarity] = num(job.rarities[rarity], 0) + 1;
  }
  if (!helping) return;
  job.assisted++;
  state.mastery[act.id] = num(state.mastery[act.id], 0) + 1;
  const xp = num(act.xp, 0) * num(cfg().xpMult, 1) * 0.75;
  events.push({ type: 'assist', jobId: job.id, owner: job.owner, actionId: act.id, xp, items: it ? [{ itemId: outId, grade, qty: q }] : [], rarity });
  addXp(state, act.skill, xp, events);
  if (rarity && rarityIdx(rarity) >= 2) logq(state, 'craft', `${job.owner}'s ${it.name} came out ${rarityDef(rarity).name}. You helped!`);
}
export function finishJob(state, job, act, events) {
  state.crew.jobs = state.crew.jobs.filter((j) => j !== job);
  const outId = jobOutput(act);
  const tip = job.assisted > 0 ? Math.round(E.itemValue(outId, 1) * 0.15 * job.assisted) : 0;
  if (job.assisted > 0) {
    state.gold += tip;
    events.push({ type: 'jobDone', jobId: job.id, owner: job.owner, actionId: act.id, tip, assisted: job.assisted });
    logq(state, 'info', `${job.owner}'s ${act.name} job is finished. You helped with ${job.assisted} and got a ${tip}g tip.`);
  }
  if (state.active && state.active.jobId === job.id) { state.active = null; events.push({ type: 'stopped', reason: 'Job finished.' }); }
}
// advances every open job; playerMult scales the player's contribution (1 live, offlineRate offline)
export function crewStep(state, dt, events, playerMult) {
  if (!state.crew || !Array.isArray(state.crew.jobs)) makeCrew(state);
  const crew = state.crew;
  const a = state.active;
  if (a && a.jobId && !crew.jobs.some((j) => j.id === a.jobId)) { state.active = null; events.push({ type: 'stopped', reason: 'Job finished.' }); }
  crew.nextPostIn = num(crew.nextPostIn, 60) - dt;
  let posts = 0;
  while (posts < CREW_MAX_JOBS && crew.jobs.length < CREW_MAX_JOBS && (crew.jobs.length < CREW_MIN_JOBS || crew.nextPostIn <= 0)) {
    const j = postJob(state); posts++;
    crew.nextPostIn = randInt(60, 90);
    if (!j) break;
    events.push({ type: 'jobPosted', jobId: j.id, owner: j.owner, actionId: j.actionId });
  }
  if (crew.nextPostIn <= 0) crew.nextPostIn = randInt(60, 90); // board full: wait another round
  for (const job of crew.jobs.slice()) {
    const act = action(job.actionId);
    if (!isJobAction(act)) {
      crew.jobs = crew.jobs.filter((j) => j !== job);
      if (state.active && state.active.jobId === job.id) { state.active = null; events.push({ type: 'stopped', reason: 'Job finished.' }); }
      continue;
    }
    const helping = !!(state.active && state.active.jobId === job.id);
    const rate = ownerRate(act) + (helping ? playerRate(state, act) * playerMult : 0);
    job.progress = num(job.progress, 0) + dt * rate;
    let guard = 0;
    while (job.progress >= 1 && job.done < job.qty && guard++ < 1000) { job.progress -= 1; job.done++; jobCraft(state, job, act, helping, events); }
    if (job.done >= job.qty) finishJob(state, job, act, events);
    else if (helping) state.active.progress = job.progress / rate;
  }
}
E.postCrewJob = (state, actionId) => postJob(state, actionId); // helper (tests / debugging)
E.canAssist = function (state, jobId) {
  const job = state && state.crew && arr(state.crew.jobs).find((j) => j.id === jobId);
  if (!job) return { ok: false, reason: 'That job is no longer open.' };
  const act = action(job.actionId);
  if (!isJobAction(act)) return { ok: false, reason: 'That job can no longer be worked.' };
  if (E.skillLevel(state, act.skill) < num(act.level, 1)) return { ok: false, reason: `Requires ${skillName(act.skill)} level ${act.level}.` };
  return { ok: true, reason: '' };
};
E.assist = function (state, jobId) {
  const c = E.canAssist(state, jobId); if (!c.ok) return c;
  if (state.active && state.active.jobId === jobId) return { ok: true, reason: '' };
  const job = state.crew.jobs.find((j) => j.id === jobId);
  state.active = { actionId: job.actionId, progress: 0, jobId };
  return { ok: true, reason: '' };
};
E.crewJobs = function (state) {
  const crew = state && state.crew; if (!crew) return [];
  const a = state.active;
  return arr(crew.jobs).map((job) => {
    const act = action(job.actionId); if (!isJobAction(act)) return null;
    const assisting = !!(a && a.jobId === job.id);
    const rate = ownerRate(act) + (assisting ? playerRate(state, act) : 0);
    const left = Math.max(0, job.qty - job.done - num(job.progress, 0));
    return Object.assign({}, job, { rarities: Object.assign({}, job.rarities), action: act, skill: act.skill, station: E.station(act.skill),
      canAssist: E.canAssist(state, job.id), assisting, etaSec: left / rate, outputItemId: jobOutput(act) });
  }).filter(Boolean);
};
E.activeInfo = function (state) {
  const a = state && state.active; if (!a) return null;
  const act = action(a.actionId); if (!act) return null;
  if (a.jobId) {
    const job = state.crew && arr(state.crew.jobs).find((j) => j.id === a.jobId);
    if (!job) return null;
    const rate = ownerRate(act) + playerRate(state, act);
    const p = clamp(num(job.progress, 0), 0, 1);
    return { kind: 'assist', actionId: act.id, skill: act.skill, station: E.station(act.skill), label: `Helping ${job.owner} · ${act.name} ${job.done}/${job.qty}`,
      owner: job.owner, jobId: job.id, done: job.done, qty: job.qty, pct: p, secLeft: Math.max(0, (1 - p) / rate) };
  }
  const t = E.actionTime(state, act.id);
  return { kind: 'action', actionId: act.id, skill: act.skill, station: E.station(act.skill), label: act.name,
    pct: isFinite(t) && t > 0 ? clamp(num(a.progress, 0) / t, 0, 1) : 0, secLeft: isFinite(t) ? Math.max(0, t - num(a.progress, 0)) : 0 };
};
export function migrateCrew(out, rc) {
  if (rc && typeof rc === 'object' && Array.isArray(rc.jobs) && Array.isArray(rc.members) && rc.members.some((m) => m && m.name)) {
    out.crew = {
      name: typeof rc.name === 'string' && rc.name ? rc.name : 'Copperbell crew',
      members: rc.members.filter((m) => m && m.name).map((m) => Object.assign({}, m, { name: String(m.name), skill: m.skill || null })),
      jobs: rc.jobs.filter((j) => j && j.id && isJobAction(action(j.actionId))).map((j) => {
        const qty = Math.max(1, Math.floor(num(j.qty, 5)));
        return { id: String(j.id), owner: String(j.owner || 'A crewmate'), actionId: j.actionId, qty, done: clamp(Math.floor(num(j.done, 0)), 0, qty),
          progress: clamp(num(j.progress, 0), 0, 1), assisted: Math.max(0, Math.floor(num(j.assisted, 0))), postedAt: num(j.postedAt, ctx.now()),
          rarities: j.rarities && typeof j.rarities === 'object' ? j.rarities : {} };
      }),
      nextPostIn: clamp(num(rc.nextPostIn, 60), 0, 600)
    };
    ['playerRank', 'viewAsMember', 'vault', 'treasury', 'requisitions', 'withdrawRequests', 'feed', 'withdrawn', 'schedule', 'seenReqIds', 'reqSimIn', 'npcReqIn'].forEach((k) => { if (rc[k] !== undefined) out.crew[k] = rc[k]; });
    ensureCrewV5(out);
  } else makeCrew(out);
}
