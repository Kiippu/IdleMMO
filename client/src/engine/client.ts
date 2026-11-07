// Main-thread RPC client. Holds the worker handle, correlates requests by id,
// and pipes every incoming snapshot into the reactive engine store.
import type { Req, FromWorker, OfflineSummary } from './protocol';
import { engine } from './store.svelte';

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
  const init = await rpc<{ offline: OfflineSummary | null; defaultTab: 'workshop' | 'raid' }>({ id: nextId(), type: 'init' });
  engine.offline = init.offline ?? null;
  engine.defaultTab = init.defaultTab;
  engine.ready = true;
}

export const engineClient = {
  start: (actionId: string) => rpc<void>({ id: nextId(), type: 'start', actionId }),
  stop: () => rpc<void>({ id: nextId(), type: 'stop' }),
  pause: () => rpc<void>({ id: nextId(), type: 'pause' }),
  resume: () => rpc<OfflineSummary | null>({ id: nextId(), type: 'resume' }),
  equip: (uid: string) => rpc<void>({ id: nextId(), type: 'equip', uid }),
  unequip: (slot: string) => rpc<void>({ id: nextId(), type: 'unequip', slot }),
  saveLoadout: (name?: string) => rpc<void>({ id: nextId(), type: 'saveLoadout', name, fromEquipped: true }),
  deleteLoadout: (loadoutId: string) => rpc<void>({ id: nextId(), type: 'deleteLoadout', loadoutId }),
  equipLoadout: (loadoutId: string) => rpc<void>({ id: nextId(), type: 'equipLoadout', loadoutId }),
  setRaidRules: (rules: { eatAt?: number; stance?: string; tactic?: string }) =>
    rpc<void>({ id: nextId(), type: 'setRaidRules', rules }),
  runRaid: () => rpc<{ ok: boolean; reason?: string }>({ id: nextId(), type: 'runRaid' }),
  buyListing: (listingId: string, qty: number) =>
    rpc<{ ok: boolean; reason?: string }>({ id: nextId(), type: 'buyListing', listingId, qty }),
  listItem: (itemId: string, grade: number, qty: number, price: number) =>
    rpc<{ ok: boolean; reason?: string }>({ id: nextId(), type: 'listItem', itemId, grade, qty, price }),
  cancelListing: (listingId: string) =>
    rpc<void>({ id: nextId(), type: 'cancelListing', listingId }),
  assistJob: (jobId: string) =>
    rpc<{ ok: boolean; reason?: string }>({ id: nextId(), type: 'assistJob', jobId }),
  export: () => rpc<string>({ id: nextId(), type: 'export' }),
  import: (code: string) => rpc<void>({ id: nextId(), type: 'import', code }),
  reset: () => rpc<void>({ id: nextId(), type: 'reset' }),
};
