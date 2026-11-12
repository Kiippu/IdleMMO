/// <reference lib="webworker" />
// The engine lives in this worker. The main thread never touches engine state
// directly — it issues RPC verbs and consumes snapshots. The worker owns the
// tick cadence (1Hz while a session is active) and calls E.applyOffline on
// resume so catch-up never blocks the UI.
declare const self: DedicatedWorkerGlobalScope;

import { createEngine, mulberry32, DATA } from '@guildwright/engine';
import { createIdbStorage } from '../save/idbStorage';
const SAVE_KEY = 'guildwright-proto-v1';
import { exportSave, importSave } from '../save/exportImport';
import { runTick, nextTickDelay } from './tickPlan';
import type { Req, FromWorker, OfflineSummary, EngineEvent, Derived } from './protocol';

const TICK_SEC = 1;

let E: any = null;
let state: any = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let storage: ReturnType<typeof createIdbStorage>;

function post(msg: FromWorker) { self.postMessage(msg); }

function derive(): Derived {
  lastDerived = deriveNow();
  return lastDerived;
}
function deriveNow(): Derived {
  const skillLevels: Record<string, number> = {};
  const skills = state && state.skills;
  if (skills) for (const id of Object.keys(skills)) skillLevels[id] = E.skillLevel(state, id);
  const activeTime = state && state.active ? (E.actionTime(state, state.active.actionId) as number) : null;
  const gearNames: Record<string, string> = {};
  const playerGear = (state && state.gear) || [];
  for (const g of playerGear) gearNames[g.uid] = E.gearName(g);
  const vaultGear = state && state.crew && state.crew.vault && state.crew.vault.gear;
  if (Array.isArray(vaultGear)) for (const g of vaultGear) gearNames[g.uid] = E.gearName(g);
  const actionTimes: Record<string, number> = {};
  for (const a of (DATA as any).actions) actionTimes[a.id] = E.actionTime(state, a.id) as number;
  const skillProgress: Record<string, any> = {};
  if (skills) for (const id of Object.keys(skills)) skillProgress[id] = E.skillProgress(state, id);
  return {
    actionTimes,
    skillProgress,
    contracts: state ? (E.listContracts(state) as any[]) : [],
    crewGold: state ? E.crewGold(state) : { free: 0, escrowed: 0, total: 0 },
    treasuryLog: state ? (E.treasuryLog(state) as any[]) : [],
    spec: state ? E.spec(state) : null,
    specCooldown: state ? E.specCooldown(state) : { ms: 0, text: '', ready: true },
    skillLevels,
    activeTime,
    gearNames,
    playerStats: state ? E.playerStats(state) : null,
    bossIntel: state ? E.bossIntel(state) : null,
    raidStatus: state ? E.raidStatus(state) : null,
    marketTax: state ? (E.marketTax(state) as number) : 0.05,
    crewMembers: state ? (E.crewMembers(state) as any[]) : [],
    crewJobs: state ? (E.crewJobs(state) as any[]) : [],
    now: state ? (E.now(state) as number) : Date.now(),
    extras: state ? E.derivedExtras(state) : null,
  };
}

// Ticks run at the exact moment the active rep completes (tickPlan.ts), at most 1s apart, so `complete` /
// `gain` events and the snapshot reach the UI within a frame of the bar reaching 100%. Each tick advances by
// the real wall time since the last one. Paused (no timer at all) while the page is hidden.
function tickOnce() {
  tickTimer = null;
  const now = Date.now();
  let events: EngineEvent[] = []; let delay = TICK_SEC * 1000;
  // A throw inside one tick must not freeze the game: log it and keep posting.
  try { const r = runTick(E, state, now, lastTickAt); events = r.events as EngineEvent[]; delay = r.delayMs; } catch (err) { console.error('engine tick failed', err); }
  lastTickAt = now;
  if (now - lastSaveAt >= 1000) { try { E.save(state); } catch (err) { console.error('engine save failed', err); } lastSaveAt = now; }
  let derived = lastDerived;
  try { derived = derive(); } catch (err) { console.error('engine derive failed', err); }
  if (derived) post({ type: 'tick', snapshot: state, derived, events });
  if (ticking) tickTimer = setTimeout(tickOnce, delay);
}
/** re-plan the next tick now (after a verb changed the active job) */
function reschedule() {
  if (!ticking) return;
  if (tickTimer != null) clearTimeout(tickTimer);
  const r = E.stampRep(state, Date.now());
  tickTimer = setTimeout(tickOnce, nextTickDelay(r ? r.secLeft : null));
}
function startTicking() {
  if (ticking) return;
  paused = false; ticking = true;
  lastTickAt = Date.now();
  reschedule();
}
let ticking = false;
let lastTickAt = 0;
let lastSaveAt = 0;
let paused = false;
let lastDerived: Derived | null = null;

function stopTicking() {
  if (!ticking) return;
  ticking = false;
  if (tickTimer != null) clearTimeout(tickTimer);
  tickTimer = null;
  // bring the state up to now so a pause never drops the time since the last tick
  try { E.tick(state, Math.max(0, (Date.now() - lastTickAt) / 1000), { visible: true }); } catch (err) { console.error('engine tick failed', err); }
  lastTickAt = Date.now();
}
/** catch up and tick again; always restarts the ticker, even if the catch-up throws */
function resumeNow(): OfflineSummary | null {
  try {
    // job hold: the catch-up credits the hidden time as normal offline time and clears the hold; the craft card
    // is still on screen after a tab hide/show, so put the hold back if the same job is still running
    const a0 = state && state.active;
    const heldJob = a0 && a0.held ? { actionId: a0.actionId, jobId: a0.jobId } : null;
    const res = E.applyOffline(state, Date.now()) as { seconds: number; summary: OfflineSummary } | null;
    const a1 = state && state.active;
    if (heldJob && a1 && a1.actionId === heldJob.actionId && a1.jobId === heldJob.jobId) E.holdJob(state, true);
    E.save(state);
    return res && res.seconds >= 60 ? { ...res.summary, awaySec: res.seconds } : null;
  } finally { startTicking(); }
}

async function init(): Promise<{ offline: OfflineSummary | null; defaultTab: 'workshop' | 'raid' }> {
  storage = createIdbStorage();
  await storage.hydrate([SAVE_KEY]);

  // Per-session RNG seed. The engine's determinism guarantees are for tests;
  // production sessions get a fresh seed each boot.
  const seed = (crypto.getRandomValues(new Uint32Array(1))[0] >>> 0) || 1;

  E = createEngine({
    rng: mulberry32(seed),
    now: () => Date.now(),
    storage: storage.storage,
    data: DATA,
  });

  // Saves older than schema v7 (and missing or corrupt ones) are not loaded: everyone starts fresh, silently.
  // The next E.save below overwrites the old record.
  state = E.load() ?? E.newState();
  const res = E.applyOffline(state, Date.now()) as { seconds: number; summary: OfflineSummary } | null;
  const offline = res && res.seconds >= 60 ? { ...res.summary, awaySec: res.seconds } : null;
  const defaultTab = E.defaultTab(state) as 'workshop' | 'raid';

  E.save(state);
  await storage.flush();
  startTicking();
  return { offline, defaultTab };
}

async function handle(req: Req): Promise<unknown> {
  switch (req.type) {
    case 'init':
      return await init();
    case 'start':
      E.start(state, req.actionId, req.count ?? null);
      E.save(state);
      return undefined;
    case 'dismissUnlocks': {
      const res = E.dismissUnlocks(state, req.actionIds);
      E.save(state);
      return res;
    }
    case 'stop':
      E.stop(state);
      return undefined;
    case 'holdJob':
      // passive: never triggers the paused→resume catch-up. While ticking, the message loop's pre-tick has
      // already brought progress up to now (credited on hold, nothing credited on release) and reschedule()
      // re-stamps repStartedAt afterwards so a released bar continues from the same fraction. While paused
      // it only sets the flag; the next resume's catch-up handles it (see resumeNow).
      E.holdJob(state, !!req.on);
      return undefined;
    case 'equip':
      E.equip(state, req.uid);
      E.save(state);
      return undefined;
    case 'unequip':
      E.unequip(state, req.slot);
      E.save(state);
      return undefined;
    case 'saveLoadout':
      E.saveLoadout(state, { name: req.name, fromEquipped: !!req.fromEquipped });
      E.save(state);
      return undefined;
    case 'deleteLoadout':
      E.deleteLoadout(state, req.loadoutId);
      E.save(state);
      return undefined;
    case 'equipLoadout':
      E.equipLoadout(state, req.loadoutId);
      E.save(state);
      return undefined;
    case 'setRaidRules':
      E.setRaidRules(state, req.rules);
      E.save(state);
      return undefined;
    case 'storeBuy': {
      const res = E.storeBuy(state, req.slot, req.qty);
      E.save(state);
      return res;
    }
    case 'storeSell': {
      const res = E.storeSell(state, req.itemId, req.grade, req.qty);
      E.save(state);
      return res;
    }
    case 'storeSellAll': {
      const res = E.storeSellAll(state, req.itemId);
      E.save(state);
      return res;
    }
    case 'storeSellGear': {
      const res = E.storeSellGear(state, req.uid);
      E.save(state);
      return res;
    }
    case 'salvagePreview':
      return E.salvagePreview(state, req.uids, { allowProtected: req.allowProtected });
    case 'salvage': {
      const res = E.salvage(state, req.uids, { allowProtected: req.allowProtected });
      E.save(state);
      return res;
    }
    case 'gearDetail':
      return E.gearDetail(state, req.uid);
    case 'lockIn': {
      const res = E.lockIn(state);
      E.save(state);
      return res;
    }
    case 'unlock': {
      const res = E.unlock(state);
      E.save(state);
      return res;
    }
    case 'fillContract': {
      const res = E.fillContract(state, req.contractId, req.qty);
      E.save(state);
      return res;
    }
    case 'postCrewRequest': {
      const res = E.postCrewRequest(state, req.spec);
      E.save(state);
      return res;
    }
    case 'cancelCrewRequest': {
      const res = E.cancelCrewRequest(state, req.contractId);
      E.save(state);
      return res;
    }
    case 'switchSpec': {
      const res = E.switchSpec(state, req.skillId);
      E.save(state);
      return res;
    }
    case 'buyListing': {
      const res = E.buy(state, req.listingId, req.qty);
      E.save(state);
      return res;
    }
    case 'listItem': {
      const res = E.list(state, req.itemId, req.grade, req.qty, req.price);
      E.save(state);
      return res;
    }
    case 'cancelListing':
      E.cancelListing(state, req.listingId);
      E.save(state);
      return undefined;
    case 'assistJob': {
      const res = E.assist(state, req.jobId);
      E.save(state);
      return res;
    }
    case 'pause':
      stopTicking();
      paused = true;
      E.save(state);
      await storage.flush();
      return undefined;
    case 'resume':
      return resumeNow();
    case 'export':
      return await exportSave(JSON.stringify(state));
    case 'import': {
      const json = await importSave(req.code);
      let parsed: unknown;
      try { parsed = JSON.parse(json); } catch { throw new Error('Save code is not a valid Guildwright save.'); }
      const check = E.checkSave(parsed) as { ok: boolean; status: string };
      if (check.status === 'old-save') throw new Error("This backup is from an older version and can't be loaded.");
      const next = check.ok ? E.migrate(parsed) : null;
      if (!next) throw new Error('Save code is not a valid Guildwright save.');
      state = next;
      E.save(state);
      await storage.flush();
      return undefined;
    }
    case 'reset':
      stopTicking();
      state = E.reset();
      E.save(state);
      await storage.flush();
      startTicking();
      return undefined;
  }
}

// Requests that mean "the player is using the game": if the worker is still paused (e.g. a pause from
// beforeunload/pagehide that was never followed by a resume), catch up and tick again first.
const PASSIVE = new Set(['init', 'pause', 'resume', 'holdJob', 'export', 'import', 'reset', 'salvagePreview', 'gearDetail']);

self.addEventListener('message', async (ev: MessageEvent<Req>) => {
  const req = ev.data;
  try {
    if (paused && E && state && !PASSIVE.has(req.type)) resumeNow();
    // bring the game up to this instant first, so the verb acts on current progress and the rep timing
    // stamped below is exact (any completions that were due ride this response)
    let pre: EngineEvent[] = [];
    if (ticking && E && state && req.type !== 'pause') {
      const now = Date.now();
      try { pre = E.tick(state, Math.max(0, (now - lastTickAt) / 1000), { visible: true }) as EngineEvent[]; } catch (err) { console.error('engine tick failed', err); }
      lastTickAt = now;
    }
    const result = await handle(req);
    // gain events made by this request (store buys, salvage, an offline catch-up on init/resume) ride its
    // response, so they reach engine.lastEvents the same way tick events do
    const events = pre.concat((E && typeof E.takeEvents === 'function' ? E.takeEvents() : []) as EngineEvent[]);
    if (ticking && E && state) { lastTickAt = Date.now(); reschedule(); } // also stamps active.repStartedAt / repMs
    post({ id: req.id, ok: true, snapshot: state, derived: derive(), events, result });
  } catch (err: any) {
    post({ id: req.id, ok: false, error: String(err?.message ?? err) });
  }
});
