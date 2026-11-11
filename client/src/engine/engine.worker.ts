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

function startTicking() {
  if (tickTimer != null) return;
  paused = false;
  tickTimer = setInterval(() => {
    // A throw inside one tick must not freeze the game: the UI would keep showing the last snapshot
    // (e.g. a crew job stuck at 17/18, "ETA 0s"). Log it and keep posting.
    let events: EngineEvent[] = [];
    try { events = E.tick(state, TICK_SEC, { visible: true }) as EngineEvent[]; } catch (err) { console.error('engine tick failed', err); }
    try { E.save(state); } catch (err) { console.error('engine save failed', err); }
    let derived = lastDerived;
    try { derived = derive(); } catch (err) { console.error('engine derive failed', err); }
    if (derived) post({ type: 'tick', snapshot: state, derived, events });
  }, TICK_SEC * 1000);
}
let paused = false;
let lastDerived: Derived | null = null;

function stopTicking() {
  if (tickTimer == null) return;
  clearInterval(tickTimer);
  tickTimer = null;
}
/** catch up and tick again; always restarts the ticker, even if the catch-up throws */
function resumeNow(): OfflineSummary | null {
  try {
    const res = E.applyOffline(state, Date.now()) as { seconds: number; summary: OfflineSummary } | null;
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
const PASSIVE = new Set(['init', 'pause', 'resume', 'export', 'import', 'reset', 'salvagePreview']);

self.addEventListener('message', async (ev: MessageEvent<Req>) => {
  const req = ev.data;
  try {
    if (paused && E && state && !PASSIVE.has(req.type)) resumeNow();
    const result = await handle(req);
    // gain events made by this request (store buys, salvage, an offline catch-up on init/resume) ride its
    // response, so they reach engine.lastEvents the same way tick events do
    const events = (E && typeof E.takeEvents === 'function' ? E.takeEvents() : []) as EngineEvent[];
    post({ id: req.id, ok: true, snapshot: state, derived: derive(), events, result });
  } catch (err: any) {
    post({ id: req.id, ok: false, error: String(err?.message ?? err) });
  }
});
