// Main-thread RPC client. Holds the worker handle, correlates requests by id,
// and pipes every incoming snapshot into the reactive engine store.
import type { Req, FromWorker, OfflineSummary, GearDetail, EquipResult, RepairResult, RepairAllResult, GuideSave } from './protocol';
import { engine } from './store.svelte';

export type StoreAllResult = { ok: boolean; reason: string; qty: number; gold: number; grades: { grade: number; qty: number; gold: number }[] };
export type StoreResult = { ok: boolean; reason: string; qty: number; gold: number; itemId?: string; uids?: string[] };

export type SalvagePreview = { items: Array<{ itemId: string; grade: number; qtyMin: number; qtyMax: number; expected: number }>; gearCount: number; blocked: Array<{ uid: string; reason: string }> };
export type SalvageResult = { ok: boolean; reason: string; salvaged: number; items: Array<{ itemId: string; grade: number; qty: number }>; blocked: Array<{ uid: string; reason: string }> };

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
const pending = new Map<string, Pending>();
let seq = 0;
const nextId = () => String(++seq);

function send(req: Req) {
  if (!worker) throw new Error('Engine worker not initialized. Call initEngineClient() first.');
  worker.postMessage(req);
}

function rpc<T = unknown>(req: Req): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    pending.set(req.id, { resolve: resolve as (v: unknown) => void, reject });
    send(req);
  });
}

function onMessage(ev: MessageEvent<FromWorker>) {
  const msg = ev.data;
  if (!('id' in msg)) {
    if (msg.type === 'tick') {
      engine.snapshot = msg.snapshot;
      engine.derived = msg.derived;
      engine.lastEvents = msg.events;
    }
    return;
  }
  const p = pending.get(msg.id);
  if (!p) return;
  pending.delete(msg.id);
  if (msg.ok) {
    engine.snapshot = msg.snapshot;
    engine.derived = msg.derived;
    engine.lastEvents = msg.events;
    p.resolve(msg.result);
  } else {
    engine.lastError = msg.error;
    p.reject(new Error(msg.error));
  }
}

export async function initEngineClient(): Promise<void> {
  if (worker) return;
  worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('message', onMessage);
  // The old prototype's localStorage save is no longer imported (schema v7 starts fresh). Clear it once.
  try { localStorage.removeItem('guildwright-proto-v1'); } catch { /* storage blocked */ }
  const init = await rpc<{ offline: OfflineSummary | null; defaultTab: 'workshop' | 'raid' }>({ id: nextId(), type: 'init' });
  engine.offline = init.offline ?? null;
  engine.defaultTab = init.defaultTab;
  engine.ready = true;
}

export const engineClient = {
  /** count = reps to run, then the job stops with { type: 'stopped', done: true }; null/undefined = keep going */
  start: (actionId: string, count?: number | null) => rpc<void>({ id: nextId(), type: 'start', actionId, count: count ?? null }),
  /** hide these from derived.extras.recentUnlocks for good (saved) */
  dismissUnlocks: (actionIds: string[]) => rpc<{ ok: boolean; reason: string; dismissed: number }>({ id: nextId(), type: 'dismissUnlocks', actionIds }),
  stop: () => rpc<void>({ id: nextId(), type: 'stop' }),
  /**
   * Craft card pause: hold (true) or release (false) the active job's progress; everything else keeps running.
   * While held: snapshot.active.held === true and snapshot.active.heldFrac = the frozen bar fraction (0..1).
   * On release the worker re-stamps repStartedAt so the bar continues from that fraction. The hold clears itself
   * on load, after 10 minutes, and when the job changes; it survives a tab hide/show (the hidden time is credited
   * as normal offline time and the hold comes back after the catch-up).
   */
  holdJob: (on: boolean) => rpc<void>({ id: nextId(), type: 'holdJob', on }),
  pause: () => rpc<void>({ id: nextId(), type: 'pause' }),
  resume: async () => {
    const s = await rpc<OfflineSummary | null>({ id: nextId(), type: 'resume' });
    if (s) engine.offline = s;
    return s;
  },
  /** routes by section: fight slot (rings: given slot, else first empty, else the weaker ring), outfit set+piece, or tool slot */
  equip: (uid: string, slot?: 'ring1' | 'ring2') => rpc<EquipResult>({ id: nextId(), type: 'equip', uid, ...(slot ? { slot } : {}) }),
  /** fight slots only */
  unequip: (slot: string) => rpc<void>({ id: nextId(), type: 'unequip', slot }),
  /** take a piece off wherever it is worn (fight, outfit or tool slot) */
  unequipGear: (uid: string) => rpc<{ ok: boolean; reason: string; /** set when emptying a tool slot ended the running job */ stopped?: string }>({ id: nextId(), type: 'unequipGear', uid }),
  /** fight gear: today's rule (max durability -20%); tools: back to 100% for 100g per 10% x tier factor */
  repair: (uid: string) => rpc<RepairResult>({ id: nextId(), type: 'repair', uid }),
  repairAllTools: () => rpc<RepairAllResult>({ id: nextId(), type: 'repairAllTools' }),
  /** kept for compatibility: the shop sells NO tools (owner 2026-11-13), so this always refuses and extras.store.tools is [] */
  storeBuyTool: (itemId: string) => rpc<StoreResult>({ id: nextId(), type: 'storeBuyTool', itemId }),
  saveLoadout: (name?: string) => rpc<void>({ id: nextId(), type: 'saveLoadout', name, fromEquipped: true }),
  deleteLoadout: (loadoutId: string) => rpc<void>({ id: nextId(), type: 'deleteLoadout', loadoutId }),
  equipLoadout: (loadoutId: string) => rpc<void>({ id: nextId(), type: 'equipLoadout', loadoutId }),
  setRaidRules: (rules: { eatAt?: number; stance?: string; tactic?: string }) =>
    rpc<void>({ id: nextId(), type: 'setRaidRules', rules }),
  storeBuy: (slot: number, qty: number) =>
    rpc<StoreResult>({ id: nextId(), type: 'storeBuy', slot, qty }),
  storeSell: (itemId: string, grade: number, qty: number) =>
    rpc<StoreResult>({ id: nextId(), type: 'storeSell', itemId, grade, qty }),
  storeSellAll: (itemId: string) => rpc<StoreAllResult>({ id: nextId(), type: 'storeSellAll', itemId }),
  storeSellGear: (uid: string) => rpc<StoreResult>({ id: nextId(), type: 'storeSellGear', uid }),
  salvagePreview: (uids: string[], allowProtected: boolean) =>
    rpc<SalvagePreview>({ id: nextId(), type: 'salvagePreview', uids, allowProtected }),
  salvage: (uids: string[], allowProtected: boolean) =>
    rpc<SalvageResult>({ id: nextId(), type: 'salvage', uids, allowProtected }),
  /** stats, affixes and a compare against the piece worn in the same slot; null when the uid is gone */
  gearDetail: (uid: string) => rpc<GearDetail | null>({ id: nextId(), type: 'gearDetail', uid }),
  /** gear card for a piece you don't own (shop offer): uid ''; default Common, Rough (shop pieces) */
  gearPreview: (itemId: string, rarity?: string, quality?: number) => rpc<GearDetail | null>({ id: nextId(), type: 'gearPreview', itemId, rarity, quality }),
  lockIn: () => rpc<{ ok: boolean; reason?: string; warnings?: string[] }>({ id: nextId(), type: 'lockIn' }),
  unlock: () => rpc<{ ok: boolean; reason?: string }>({ id: nextId(), type: 'unlock' }),
  buyListing: (listingId: string, qty: number) =>
    rpc<{ ok: boolean; reason?: string }>({ id: nextId(), type: 'buyListing', listingId, qty }),
  listItem: (itemId: string, grade: number, qty: number, price: number) =>
    rpc<{ ok: boolean; reason?: string }>({ id: nextId(), type: 'listItem', itemId, grade, qty, price }),
  cancelListing: (listingId: string) =>
    rpc<void>({ id: nextId(), type: 'cancelListing', listingId }),
  assistJob: (jobId: string) =>
    rpc<{ ok: boolean; reason?: string }>({ id: nextId(), type: 'assistJob', jobId }),
  fillContract: (contractId: string, qty: number) =>
    rpc<{ ok: boolean; reason?: string; accepted?: number; gold?: number; partial?: boolean }>({ id: nextId(), type: 'fillContract', contractId, qty }),
  postCrewRequest: (spec: { itemId: string; qty: number; rewardPer: number; minGrade?: number; note?: string }) =>
    rpc<{ ok: boolean; reason?: string; escrow?: number }>({ id: nextId(), type: 'postCrewRequest', spec }),
  cancelCrewRequest: (contractId: string) =>
    rpc<{ ok: boolean; reason?: string; refunded?: number }>({ id: nextId(), type: 'cancelCrewRequest', contractId }),
  switchSpec: (skillId: string) =>
    rpc<{ ok: boolean; reason?: string; cost?: number; first?: boolean }>({ id: nextId(), type: 'switchSpec', skillId }),
  /**
   * Guide progress into the save. Fields given replace the saved ones (done is replaced whole). Returns the saved guide;
   * the snapshot carries it as snapshot.guide. snapshot.guide === null on a save from before the field: seed it once
   * from the old localStorage copy (guildwright-guide-v1).
   */
  setGuide: (guide: Partial<GuideSave>) => rpc<GuideSave>({ id: nextId(), type: 'setGuide', guide }),
  export: () => rpc<string>({ id: nextId(), type: 'export' }),
  import: (code: string) => rpc<void>({ id: nextId(), type: 'import', code }),
  reset: () => rpc<void>({ id: nextId(), type: 'reset' }),
};
