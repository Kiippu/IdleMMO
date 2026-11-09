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
// E.raidStatus(state) gains: sittingOut (boolean), nextRaidAt (game-clock ms of the next raid the player can join).
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
export interface RaidStatus {
  week: number; phase: 'live' | 'done' | 'locked' | 'prep'; locked: boolean; lock: any;
  windowStart: number; windowEnd: number; secToStart: number; secLeft: number; resolved: boolean;
  recapId: string | null; fightPct: number;
  /** the player takes no part in this week's raid (save created after it opened) */
  sittingOut: boolean;
  /** game-clock ms when the next raid the player can join starts */
  nextRaidAt: number;
  /** War Room prep lock (2026-11-08). NOTE `locked` above means "locked in", not this. */
  prepPhase: RaidPrepPhase;
  /** true while the raid is live: setRaidRules / setRaidPlan refuse with prepReason. Gear and loadout swaps stay allowed (the raid uses the lock snapshot). */
  prepLocked: boolean;
  prepReason: string;
  /** while live: your contribution at the replay's current point (null when not live or not joined) */
  liveContribution: LiveContribution | null;
}
export type ContributionTier = 'none' | 'bronze' | 'silver' | 'gold';
export interface LiveContribution {
  /** how far through the fight the replay is, 0..1 (= fightPct) */
  pct: number;
  /** boss HP left (0..1) at the replay's current point. The recap's hpPctAfter is the END of the fight;
   *  show this while live so progress and boss HP agree. */
  bossHpPct: number;
  /** your check points so far / all check points so far this weekend */
  points: number; totalPoints: number;
  /** points / totalPoints */
  share: number;
  /** tier that share reaches so far (E.tierThresholds) and its label ('No tier', 'Bronze', ...) */
  tier: ContributionTier; tierLabel: string;
}
/** Recap payout fields: payout.contribution / payout.crewContribution = the CREW's fill of its fair-share
 *  work (0..1, scales the pool); payout.yourShare = your share of the weekend's check points. */
export interface RecapPayoutContribution { contribution: number; crewContribution: number; yourShare: number }
/** Recap fields (E.lastRecap(state)), added 2026-11-08 */
export interface RecapStockShortfall {
  /** 'you' or the crewmate's id */
  who: string; name: string;
  /** times the crew vault had no food / healing potion left when this member needed one */
  heal: number;
  /** times it had no role buff left for them */
  buff: number;
}
export interface RecapStockFields {
  /** crew vault healing/buff stock ran out during the fight (a need went unmet for a kind the vault started with) */
  stockRanOut: boolean;
  stockShortfall: RecapStockShortfall[];
  /** fight progress 0..1 when stock first ran out, or null */
  stockOutAt: number | null;
}

// ---- 2026-11-08 additions (save schema stays v6; state.events / state.eventSeq / state.store are additive)
// Worker: E.derivedExtras(state) → DerivedExtras (one call per snapshot), or the pieces below.
// Rarity: DATA.itemRarity[itemId] (static, main-thread safe) and DATA.items[id].rarity. Stackables by tier
//   (1 common, 2 uncommon, 3 rare, 4 epic, 5 legendary), boss cores mythic. Gear instances carry their own
//   rolled `rarity`, which wins. Rank = index in DATA.rarities (common 0 .. mythic 5).
// Gather time: E.gatherSecs(state) → Record<itemId, number|null> (cached); E.gatherEstimates(state, ids);
//   E.gatherEstimate(state, id) → seconds per unit to gather/make it yourself now (null = can't yet).
// Raid prep: E.raidPrep(state) → RaidPrep; E.raidStatus(state) gains prepPhase / prepLocked / prepReason.
// Store: E.storeView(state) → StoreView; E.storeBuy(state, slot, qty) → StoreBuyResult;
//   E.storeSell(state, itemId, grade, qty) → StoreSellResult; E.storeSellGear(state, uid) → StoreSellResult;
//   E.storeBuyPrice(itemId, grade); E.storeSellPrice(itemId, grade).
// Event log: E.events(state, n = 50) → GameEvent[] (newest first; state.events keeps the last 200).
// Player market parked: DATA.config.playerMarket = false; E.buy / E.list return { ok: false, reason }.
export type RarityId = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';
export type RaidPrepPhase = 'prep' | 'live' | 'recap';
export interface RaidPrep { phase: RaidPrepPhase; locked: boolean; reason: string }
export type GameEventCat = 'loot' | 'gold' | 'crew' | 'raid' | 'skill';
export interface GameEvent {
  /** stable, increasing id (use as a list key; a merged line keeps its id) */
  id: number;
  /** game-clock ms (E.now(state)) of the latest update */
  t: number;
  cat: GameEventCat; text: string;
  qty?: number; itemId?: string; grade?: number | null;
  /** signed gold change carried by this line */
  gold?: number;
  /** gear crafted / sold: the instance rarity */
  rarity?: RarityId;
}
export interface StoreSlot {
  /** pass to storeBuy */
  slot: number;
  itemId: string; name: string; kind: 'resource' | 'gear';
  /** grade index for resources (0 Rough .. 4 Pristine); null for gear (sold Common, Standard quality) */
  grade: number | null;
  rarity: RarityId;
  /** left to buy this hour */
  qty: number; stock: number;
  /** gold per unit */
  price: number;
  /** seconds per unit to gather/make it yourself at your current levels; null = you can't yet */
  gatherSecs: number | null;
}
export interface StoreView {
  /** game-clock hour index (floor(game ms / 3,600,000)) */
  hour: number;
  /** game-clock ms when the stock rotates */
  refreshesAt: number;
  slots: StoreSlot[];
  buyMult: { resource: number; gear: number };
  sellMult: number;
  /** what the store pays per unit, by grade 0..4, for every stackable in your bag */
  sellPrices: Record<string, number[]>;
  /** what the store pays for each gear piece in your bag, by uid */
  gearSellPrices: Record<string, number>;
}
export interface StoreBuyResult { ok: boolean; reason: string; qty: number; gold: number; itemId?: string; /** gear bought */ uids?: string[] }
export interface StoreSellResult { ok: boolean; reason: string; qty: number; gold: number }
export interface DerivedExtras {
  store: StoreView;
  /** last 50, newest first */
  events: GameEvent[];
  raidPrep: RaidPrep;
  gatherSecs: Record<string, number | null>;
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

/** Economy unit: one hour of a typical level-40 player's income, in gold (see data.ts). */
export const H: number;
/** Hour-based economy knobs that every hours-priced amount derives from. */
export const ECON: {
  H: number; specSwitchHours: number; raidPayHours: number; raidTierGrowth: number;
  raidTreasuryShare: number; raidCapAttendees: number; contractRewardMult: number;
  storeResourceMult: number; storeGearMult: number; storeSellMult: number;
  storeResourceSlots: number; storeGearSlots: number; storeGearMaxTier: number;
};

declare const _default: typeof createEngine;
export default _default;
