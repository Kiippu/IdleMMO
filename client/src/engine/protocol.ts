// Message protocol between the main thread and the engine worker.
// Every request carries an id so the RPC layer can correlate the response.
// Unsolicited pushes (tick) are keyed only by `type`.

export type Snapshot = any; // see engine/src/public.d.ts — the state object is loose-typed.
export type EngineEvent = { type: string; [k: string]: any };

// Lightweight precomputed view that rides every snapshot. Keeps the main
// thread off engine methods (E.skillLevel, E.actionTime, etc.) without
// hand-rolling the same maths over on this side.
export interface Derived {
  skillLevels: Record<string, number>;
  activeTime: number | null;
  /** uid -> human-readable gear name (player bag + crew vault). */
  gearNames: Record<string, string>;
}

export interface OfflineSummary {
  items: Record<string, number>;
  xp: Record<string, number>;
  gold: number;
  crafts: Record<string, number>;
  kills: number;
  stoppedReason: string | null;
  assisted: number;
  tips: number;
  raids: string[];
  weeks: number;
}

export type Req =
  | { id: string; type: 'init' }
  | { id: string; type: 'start'; actionId: string }
  | { id: string; type: 'stop' }
  | { id: string; type: 'pause' }
  | { id: string; type: 'resume' }
  | { id: string; type: 'equip'; uid: string }
  | { id: string; type: 'unequip'; slot: string }
  | { id: string; type: 'export' }
  | { id: string; type: 'import'; code: string }
  | { id: string; type: 'reset' };

export type Resp =
  | { id: string; ok: true; snapshot: Snapshot; derived: Derived; events: EngineEvent[]; result?: unknown }
  | { id: string; ok: false; error: string };

export type Push =
  | { type: 'tick'; snapshot: Snapshot; derived: Derived; events: EngineEvent[] };

export type FromWorker = Resp | Push;
