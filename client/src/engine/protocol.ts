// Message protocol between the main thread and the engine worker.
// Every request carries an id so the RPC layer can correlate the response.
// Unsolicited pushes (tick) are keyed only by `type`.

export type Snapshot = any; // see engine/src/public.d.ts — the state object is loose-typed.
export type EngineEvent = { type: string; [k: string]: any };

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';
export type GainSource = 'gather' | 'refine' | 'craft' | 'combat' | 'assist' | 'buy' | 'salvage' | 'raid' | 'other';
/** One real item gain (never sells, equips, loadout swaps or contract hand-ins). Catch-up gains: one per source, offline: true. */
export interface GainEvent {
  type: 'gain';
  source: GainSource;
  items: Array<{ itemId: string; qty: number; grade?: number; rarity: Rarity; uid?: string }>;
  offline?: true;
}
/** A quantity job reached its count: `{ type: 'stopped', reason: 'Made 10 Copper bars.', done: true }`. Other stops have no `done`. */
export interface StoppedEvent { type: 'stopped'; reason: string; done?: true; actionId?: string }
export type RaidRole = 'guardian' | 'mender' | 'striker';
export interface Readiness {
  /** the current boss's power requirement */
  req: number;
  power: { guardian: number; mender: number; striker: number };
  bestRole: RaidRole;
  best: number;
  ok: boolean;
  /** 1-3 short lines on what raises the best role's power */
  tips: string[];
}

// Lightweight precomputed view that rides every snapshot. Keeps the main
// thread off engine methods (E.skillLevel, E.actionTime, etc.) without
// hand-rolling the same maths over on this side.
export interface Derived {
  skillLevels: Record<string, number>;
  activeTime: number | null;
  /** uid -> human-readable gear name (player bag + crew vault). */
  gearNames: Record<string, string>;
  /** E.playerStats(state): x10 scale; elements = share % of weapon damage, wards = % less damage taken. */
  playerStats: PlayerStats | null;
  /** E.bossIntel(state) — current-week boss + hpLeft/maxHp, or null. */
  bossIntel: any;
  /** E.raidStatus(state) — phase, window, secToStart, secLeft, etc. */
  raidStatus: any;
  /** E.marketTax(state) — current sell-side tax (0..1). */
  marketTax: number;
  /** E.crewMembers(state) — roster with ranks + specializations. */
  crewMembers: any[];
  /** E.crewJobs(state) — open jobs with assist state and ETA. */
  crewJobs: any[];
  /** E.actionTime for every action: THE seconds-per-rep used by list and active card. */
  actionTimes: Record<string, number>;
  /** E.skillProgress per skill: {level, rawLevel, capped, ...}. */
  skillProgress: Record<string, any>;
  /** E.listContracts(state). */
  contracts: any[];
  /** E.crewGold(state): {free, escrowed, total}. */
  crewGold: { free: number; escrowed: number; total: number };
  /** E.treasuryLog(state), newest first. */
  treasuryLog: any[];
  /** E.spec(state) plus E.specCooldown(state). */
  spec: any;
  specCooldown: { ms: number; text: string; ready: boolean };
  /** Game-clock ms (E.now) at the time of this snapshot; events[].t is on the same clock. */
  now: number;
  /** E.derivedExtras(state): {store, events (last 50, newest first), raidPrep, gatherSecs}. */
  extras: { store: any; events: any[]; raidPrep: any; gatherSecs: Record<string, number | null>; codex?: { items: Record<string, { id: string; status: 'hidden' | 'hint' | 'known'; inputsSeen: number; inputsTotal: number; touched: boolean }>; demand: Record<string, number> };
    lastRecapView?: RecapView | null; crewActivity?: CrewActivity[]; sellList?: SellListRow[]; disabledReasons?: DisabledReasons;
    /** juice pass: reps the bag can pay for right now per action id (null = needs no inputs: gather/fight) */
    maxMake: Record<string, number | null>;
    readiness: Readiness;
    /** action ids unlocked by levelling and not dismissed (never level-1 starters), highest level first */
    recentUnlocks: string[];
    /** per unequipped bag gear uid */
    equipDeltas: Record<string, EquipDelta>;
    /** gear pass: per bag gear uid { section, worn, grade, equipped, inLoadout, stackKey, ... }; group rows by non-null stackKey */
    gearInfo: Record<string, GearInfo>;
    /** gear overhaul: tools + matching outfit set per work skill (15) */
    workBonus: Record<string, WorkBonus>;
    /** the current job's tool / outfit, or null (idle, combat) */
    activeWork: ActiveWork | null;
    /** what repairAllTools would do now */
    toolRepair: { count: number; gold: number };
    /** raw (pre-cap) effect change per bag tool / outfit piece vs what is in its slot */
    workDeltas: Record<string, Partial<Record<EffectId, number>>>;
    /** worn outfit pieces of each set alone (no tool), soft-capped */
    outfitTotals: Record<OutfitSet, OutfitSetTotals> } | null;
}

import type { OfflineSummary as EngineOfflineSummary, RecapView, CrewActivity, SellListRow, DisabledReasons, GearDetail, StatLine, EffectLine, GearInfo,
  GearSection, FightSlot, OutfitSet, OutfitPiece, EffectId, SkillGroup, WornAt, GearItem, GearPiece, EquipResult, RepairResult, RepairAllResult,
  AffixLine, GearCompare, WorkBonus, ActiveWork, OutfitSetTotals, StoreToolRow, WornToolLine, PlayerStats, EquipDelta, CraftQuality,
  GearMaker, GearMakerView, GearStatRow, GearSpecial } from '@guildwright/engine';
/** Gear overhaul 2026-11-12: see gear-overhaul-contract.md "Engine interface". */
export type { GearDetail, StatLine, EffectLine, GearInfo, GearSection, FightSlot, OutfitSet, OutfitPiece, EffectId, SkillGroup, WornAt, GearItem, GearPiece,
  EquipResult, RepairResult, RepairAllResult, AffixLine, GearCompare, WorkBonus, ActiveWork, OutfitSetTotals, StoreToolRow, WornToolLine, PlayerStats, EquipDelta, CraftQuality,
  GearMaker, GearMakerView, GearStatRow, GearSpecial };
/** Engine summary (items, xp, gold, skills, bestFind, loot, goldBySource, ...) plus the real seconds away added by the worker. */
export type OfflineSummary = EngineOfflineSummary & { awaySec?: number };

export type Req =
  | { id: string; type: 'init' }
  | { id: string; type: 'start'; actionId: string; count?: number | null }
  | { id: string; type: 'dismissUnlocks'; actionIds: string[] }
  | { id: string; type: 'stop' }
  /** craft card pause: hold (true) / release (false) the active job. Snapshot: state.active.held === true while held. */
  | { id: string; type: 'holdJob'; on: boolean }
  | { id: string; type: 'pause' }
  | { id: string; type: 'resume' }
  | { id: string; type: 'equip'; uid: string; slot?: 'ring1' | 'ring2' }
  | { id: string; type: 'unequip'; slot: string }
  | { id: string; type: 'unequipGear'; uid: string }
  | { id: string; type: 'repair'; uid: string }
  | { id: string; type: 'repairAllTools' }
  | { id: string; type: 'storeBuyTool'; itemId: string }
  | { id: string; type: 'saveLoadout'; name?: string; fromEquipped?: boolean }
  | { id: string; type: 'deleteLoadout'; loadoutId: string }
  | { id: string; type: 'equipLoadout'; loadoutId: string }
  | { id: string; type: 'setRaidRules'; rules: { eatAt?: number; stance?: string; tactic?: string } }
  | { id: string; type: 'storeBuy'; slot: number; qty: number }
  | { id: string; type: 'storeSell'; itemId: string; grade: number; qty: number }
  | { id: string; type: 'storeSellGear'; uid: string }
  | { id: string; type: 'storeSellAll'; itemId: string }
  | { id: string; type: 'salvagePreview'; uids: string[]; allowProtected: boolean }
  | { id: string; type: 'salvage'; uids: string[]; allowProtected: boolean }
  | { id: string; type: 'gearDetail'; uid: string }
  | { id: string; type: 'gearPreview'; itemId: string; rarity?: string; quality?: number }
  | { id: string; type: 'lockIn' }
  | { id: string; type: 'unlock' }
  | { id: string; type: 'buyListing'; listingId: string; qty: number }
  | { id: string; type: 'listItem'; itemId: string; grade: number; qty: number; price: number }
  | { id: string; type: 'cancelListing'; listingId: string }
  | { id: string; type: 'assistJob'; jobId: string }
  | { id: string; type: 'fillContract'; contractId: string; qty: number }
  | { id: string; type: 'postCrewRequest'; spec: { itemId: string; qty: number; rewardPer: number; minGrade?: number; note?: string } }
  | { id: string; type: 'cancelCrewRequest'; contractId: string }
  | { id: string; type: 'switchSpec'; skillId: string }
  | { id: string; type: 'export' }
  | { id: string; type: 'import'; code: string }
  | { id: string; type: 'reset' };

export type Resp =
  | { id: string; ok: true; snapshot: Snapshot; derived: Derived; events: EngineEvent[]; result?: unknown }
  | { id: string; ok: false; error: string };

export type Push =
  | { type: 'tick'; snapshot: Snapshot; derived: Derived; events: EngineEvent[] };

export type FromWorker = Resp | Push;
