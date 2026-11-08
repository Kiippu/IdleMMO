// Public type boundary for @guildwright/engine consumers.
//
// The implementation source is strict-lax on purpose (see engine/PORTING.md and
// engine/tsconfig.json) because it is a near-mechanical port of a dynamic JS
// file. Consumers with strict tsconfigs must not walk into that source, so
// package.json points the `types` export condition at this file. The runtime
// still resolves to src/index.ts.
//
// Keep the surface here in sync with src/index.ts.

export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface EngineContext {
  rng: () => number;
  now: () => number;
  storage: SaveStorage | null;
  data: any;
}

// ---- Phase 2.5 shapes (save schema v6). Engine methods stay `any`-typed; these interfaces
// describe what the new verbs return so the client can annotate its derived bundle.
// Verbs: E.listContracts(state) → Contract[]; E.fillContract(state, contractId, qty) → FillContractResult;
// E.crewGold(state) → CrewGold; E.treasury(state) → TreasuryView; E.treasuryLog(state) → TreasuryLogEntry[];
// E.spec(state) → SpecInfo; E.specCooldown(state) → SpecCooldown; E.switchSpec(state, skillId);
// E.skillProgress(state, skillId) → SkillProgress; E.actionTime(state, actionId) → seconds per rep.
// Removed in 2.5: startRaidNow, runRaid, raidStatus().canStartNow, farmRaids, runFarmRaid, setViewAsMember.

export type ContractPays = 'gold' | 'mixed' | 'reputation';
export interface Contract {
  id: string; week: number; check: string; itemId: string; itemName: string;
  qty: number; filled: number; remaining: number; minGrade: number;
  rewardPer: number; repPer: number; escrow: number; paid: number; repPaid: number;
  goldUnitsLeft: number; repUnits: number; pays: ContractPays;
  status: 'open' | 'filled' | 'closed'; postedAt: number; note: string;
  have: number; vaultHas: number; recipeActionId: string | null;
  canFill: { ok: boolean; reason: string };
  submissions: { who: string; qty: number; gold: number; rep: number; t: number }[];
}
export interface FillContractResult {
  ok: boolean; reason: string; accepted: number; gold: number; rep: number;
  partial?: boolean; status?: Contract['status'];
}
export interface CrewGold { free: number; escrowed: number; total: number }
export type TreasuryLogKind = 'payout' | 'contract' | 'contract-escrow' | 'contract-release' | 'fill' | 'escrow'
  | 'release' | 'deposit' | 'withdraw' | 'raid-stock';
export interface TreasuryLogEntry {
  /** time in ms (legacy `at` is normalised to `t` on load) */
  t: number; week: number; kind: TreasuryLogKind | string; who: string; reason: string;
  /** change in total crew gold (free + escrowed) */
  delta: number;
  /** change in escrowed gold; free-gold change = delta - escrowDelta */
  escrowDelta?: number;
  /** item rows: signed qty (+ into the vault, - out) */
  itemId?: string; qty?: number; grade?: number;
  /** gear rows */
  uid?: string; gear?: boolean;
}
export interface TreasuryView extends CrewGold { gold: number; escrow: number; log: TreasuryLogEntry[]; history: any[] }
export interface SpecCooldown { ms: number; /** "Xd Yh", never seconds */ text: string; ready: boolean }
export interface SpecInfo {
  skillId: string | null; lastSwitchAt: number | null; cooldownMs: number; cooldownText: string;
  cost: number; capLevel: number; /** skills held at the level-70 effective cap (XP kept) */ capped: string[];
}
export interface SkillProgress { level: number; rawLevel: number; capped: boolean; xp: number; cur: number; next: number; pct: number }

/** The engine object (GW.Engine in the prototype). Methods are called dynamically. */
export const Engine: any;

/** Configure the injected context and return the engine. One engine per JS realm. */
export function createEngine(opts: Partial<EngineContext>): any;

/** mulberry32: the seeded RNG used by the fixtures and tests. */
export function mulberry32(seed: number): () => number;

/** In-memory SaveStorage for tests. */
export function memoryStorage(): SaveStorage & { clear(): void };

/** Live engine context (rng/now/storage/data). */
export const ctx: EngineContext;

/** Static game content. */
export const DATA: any;

declare const _default: typeof createEngine;
export default _default;
