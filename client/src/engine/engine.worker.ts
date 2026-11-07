/// <reference lib="webworker" />
// The engine lives in this worker. The main thread never touches engine state
// directly — it issues RPC verbs and consumes snapshots. The worker owns the
// tick cadence (1Hz while a session is active) and calls E.applyOffline on
// resume so catch-up never blocks the UI.
declare const self: DedicatedWorkerGlobalScope;

import { createEngine, mulberry32, DATA } from '@guildwright/engine';
import { createIdbStorage } from '../save/idbStorage';
import { importLegacyLocalStorage } from '../save/v4Import';
import { exportSave, importSave } from '../save/exportImport';
import type { Req, FromWorker, OfflineSummary, EngineEvent, Derived } from './protocol';

const SAVE_KEY = 'guildwright-proto-v1';
const TICK_SEC = 1;

let E: any = null;
let state: any = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let storage: ReturnType<typeof createIdbStorage>;

function post(msg: FromWorker) { self.postMessage(msg); }

function derive(): Derived {
  const skillLevels: Record<string, number> = {};
  const skills = state && state.skills;
  if (skills) for (const id of Object.keys(skills)) skillLevels[id] = E.skillLevel(state, id);
  const activeTime = state && state.active ? (E.actionTime(state, state.active.actionId) as number) : null;
  const gearNames: Record<string, string> = {};
  const playerGear = (state && state.gear) || [];
  for (const g of playerGear) gearNames[g.uid] = E.gearName(g);
  const vaultGear = state && state.crew && state.crew.vault && state.crew.vault.gear;
  if (Array.isArray(vaultGear)) for (const g of vaultGear) gearNames[g.uid] = E.gearName(g);
  return {
    skillLevels,
    activeTime,
    gearNames,
    playerStats: state ? E.playerStats(state) : null,
    bossIntel: state ? E.bossIntel(state) : null,
    raidStatus: state ? E.raidStatus(state) : null,
    marketTax: state ? (E.marketTax(state) as number) : 0.05,
    crewMembers: state ? (E.crewMembers(state) as any[]) : [],
    crewJobs: state ? (E.crewJobs(state) as any[]) : [],
  };
}

function startTicking() {
  if (tickTimer != null) return;
  tickTimer = setInterval(() => {
    const events = E.tick(state, TICK_SEC, { visible: true }) as EngineEvent[];
    E.save(state);
    post({ type: 'tick', snapshot: state, derived: derive(), events });
  }, TICK_SEC * 1000);
}

function stopTicking() {
  if (tickTimer == null) return;
  clearInterval(tickTimer);
  tickTimer = null;
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

  importLegacyLocalStorage(storage.storage, SAVE_KEY);

  state = E.load() ?? E.newState();
  const res = E.applyOffline(state, Date.now()) as { seconds: number; summary: OfflineSummary } | null;
  const offline = res && res.seconds >= 60 ? res.summary : null;
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
      E.start(state, req.actionId);
      return undefined;
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
    case 'runRaid': {
      const res = E.runRaid(state);
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
      E.save(state);
      await storage.flush();
      return undefined;
    case 'resume': {
      const res = E.applyOffline(state, Date.now()) as { seconds: number; summary: OfflineSummary } | null;
      E.save(state);
      startTicking();
      return res && res.seconds >= 60 ? res.summary : null;
    }
    case 'export':
      return await exportSave(JSON.stringify(state));
    case 'import': {
      const json = await importSave(req.code);
      const next = E.migrate(JSON.parse(json));
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

self.addEventListener('message', async (ev: MessageEvent<Req>) => {
  const req = ev.data;
  try {
    const result = await handle(req);
    post({ id: req.id, ok: true, snapshot: state, derived: derive(), events: [], result });
  } catch (err: any) {
    post({ id: req.id, ok: false, error: String(err?.message ?? err) });
  }
});
