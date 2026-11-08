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
// describe what the verbs return so the client can annotate its derived bundle.
// Contracts board: E.listContracts(state) → Contract[]; E.fillContract(state, contractId, qty) → FillContractResult;
//   E.postCrewRequest(state, CrewRequestSpec) → PostCrewRequestResult; E.cancelCrewRequest(state, contractId) → CancelCrewRequestResult.
// Treasury: E.crewGold(state) → CrewGold; E.treasury(state) → TreasuryView; E.treasuryLog(state) → TreasuryLogEntry[].
// Spec: E.spec(state) → SpecInfo; E.specCooldown(state) → SpecCooldown; E.switchSpec(state, skillId) → SwitchSpecResult;
//   E.skillProgress(state, skillId) → SkillProgress.
// Raid recap payout gains: gold (player's share), pool, perAttendee, capped, turnout, contribution.
// Pace: E.actionTime(state, actionId) → seconds per rep (THE time-per-rep function);
//   E.incomePerHour(state, actionId) → gold/hour selling the outputs at Standard value after tax.
// Removed in 2.5: startRaidNow, runRaid, raidStatus().canStartNow, farmRaids, runFarmRaid, setViewAsMember,
//   postRequisition, cancelRequisition, fillRequisition, requisitions, neededByCrew, isNeededByCrew,
//   markRequisitionsSeen, requisitionFromGap; state.rep and every reputation field.

export type ContractSource = 'town' | 'crew';
export type ContractStatus = 'open' | 'filled' | 'closed' | 'cancelled';
export interface Contract {
  id: string;
  /** town = raid needs paid from the treasury; crew = a player's request paid from their own gold */
  source: ContractSource;
  /** where the escrow lives: crew treasury, or the posting player's gold */
  payer: 'treasury' | 'player';
  /** 'Treasury' or the posting player's name */
  paidBy: string;
  postedBy: string; week: number; check: string | null; itemId: string; itemName: string;
  qty: number; filled: number; remaining: number; minGrade: number;
  rewardPer: number; escrow: number; paid: number;
  /** units it can still take now (limited by remaining qty AND by escrow) */
  capacity: number;
  status: ContractStatus; postedAt: number; note: string;
  have: number; vaultHas: number; recipeActionId: string | null;
  /** your own crew request */
  mine: boolean; canCancel: boolean;
  canFill: { ok: boolean; reason: string };
  submissions: { who: string; qty: number; gold: number; t: number }[];
}
export interface FillContractResult { ok: boolean; reason: string; accepted: number; gold: number; partial?: boolean; status?: ContractStatus }
export interface CrewRequestSpec { itemId: string; qty: number; rewardPer: number; minGrade?: number; note?: string }
export interface PostCrewRequestResult { ok: boolean; reason: string; contract?: Contract; escrow?: number }
export interface CancelCrewRequestResult { ok: boolean; reason: string; refunded: number }
export interface CrewGold { free: number; escrowed: number; total: number }
export type TreasuryLogKind = 'payout' | 'contract' | 'contract-escrow' | 'contract-release' | 'release'
  | 'deposit' | 'withdraw' | 'raid-stock';
export interface TreasuryLogEntry {
  /** game-clock time in ms (legacy `at` is normalised to `t` on load) */
  t: number; week: number; kind: TreasuryLogKind | string; who: string; reason: string;
  /** change in total crew gold (free + escrowed); 0 for player-funded crew requests */
  delta: number;
  /** change in escrowed treasury gold; free-gold change = delta - escrowDelta */
  escrowDelta?: number;
  /** contract rows: gold paid / escrowed / released, and who funded it ('Treasury' or a player) */
  gold?: number; paidBy?: string;
  /** item rows: signed qty (+ into the vault, - out) */
  itemId?: string; qty?: number; grade?: number;
  /** gear rows */
  uid?: string; gear?: boolean;
}
export interface TreasuryView extends CrewGold { gold: number; escrow: number; log: TreasuryLogEntry[]; history: any[] }
export interface SpecCooldown { ms: number; /** "Xd Yh", never seconds */ text: string; ready: boolean }
export interface SpecInfo {
  skillId: string | null; lastSwitchAt: number | null; cooldownMs: number; cooldownText: string;
  /** what the next pick costs: 0 for the first pick, else switchCost */
  cost: number; switchCost: number; firstPickFree: boolean; capLevel: number;
  /** profession skills at level 70+ you could pick (excludes the current spec) */
  eligible: string[];
  /** profession skills held at effective 70 with XP past it */
  capped: string[];
}
export interface SwitchSpecResult { ok: boolean; reason: string; cost?: number; first?: boolean; cooldownMs?: number; cooldownText?: string }
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

/** Economy unit: one hour of a typical level-40 player's income, in gold (see data.ts). */
export const H: number;
/** Hour-based economy knobs that every hours-priced amount derives from. */
export const ECON: {
  H: number; specSwitchHours: number; raidPayHours: number; raidTierGrowth: number;
  raidTreasuryShare: number; raidCapAttendees: number; contractRewardMult: number;
};

declare const _default: typeof createEngine;
export default _default;
