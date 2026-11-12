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
/** escrow/release = gold moved into/out of contract escrow (reserved, not spent: show it neutral);
 *  contract = a contract paid a filler; payout = raid gold in (opening entry carries `opening: true`). */
export type TreasuryLogKind = 'payout' | 'contract' | 'escrow' | 'release'
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
export interface RecapPayoutContribution { contribution: number; crewContribution: number; yourShare: number; split: RaidGoldSplit }
/** recap.payout.split (2026-11-09): payout.gold = min(floor + byContribution, cap) */
export interface RaidGoldSplit {
  /** ECON.raidEvenShare of the payable pool, split evenly between attendees */
  floor: number;
  /** ECON.raidContribShare of the payable pool x pointShare */
  byContribution: number;
  /** your share of all attendees' check points (0..1) */
  pointShare: number;
  uncapped: number;
  /** ECON.raidCapIncomeHours x E.hourlyIncome(state) */
  cap: number;
  /** what the cap cut; added to the crew treasury (included in payout.crewGold) */
  cutToTreasury: number;
}
// E.hourlyIncome(state) → gold/hour: the H measure at the player's own levels (median of the four gathering
// skills' best unlocked action, sold at Standard after tax). H = this at level 40.
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
// Tick events: { type: 'levelup', skill, level, from } (from added 2026-11-11).
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
  /** level-up lines (cat 'skill', layout pass 2026-11-11): all levels gained in one E.tick or one
   *  E.applyOffline roll into ONE line per skill. text "Mining levelled up 1 → 39." (or "Mining reached level 5."
   *  for a single level). Older saved lines lack these fields. */
  skill?: string; from?: number; level?: number;
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
// ---- QoL pass 2026-11-11: salvage, discovery, encyclopedia (additive v6 field state.seen)
// E.salvagePreview(state, uids, opts?) → SalvagePreview; E.salvage(state, uids | uid, { allowProtected? }) → SalvageResult.
//   Returns ECON.salvagePct[rarity] of the recipe inputs (random rounding, seeded), at the piece's quality grade.
//   Protected unless allowProtected: equipped (always refused), in a saved loadout, rare or better.
// E.codex(state) → Codex (also DerivedExtras.codex); E.catalog() / DATA.catalog → Record<itemId, CatalogEntry>
//   (static; DATA.catalog is a lazy getter, main-thread safe); E.catalogEntry(id). Lore from DATA.itemLore[id].
export interface SalvageLine { itemId: string; grade: number; qtyMin: number; qtyMax: number; expected: number }
export interface SalvageBlocked { uid: string; reason: string }
export interface SalvagePreview { items: SalvageLine[]; gearCount: number; blocked: SalvageBlocked[] }
export interface SalvageResult { ok: boolean; reason: string; salvaged: number; items: { itemId: string; grade: number; qty: number }[]; blocked: SalvageBlocked[] }
export type CodexStatus = 'hidden' | 'hint' | 'known';
export interface CodexItem { id: string; status: CodexStatus; inputsSeen: number; inputsTotal: number; touched: boolean }
export interface Codex {
  items: Record<string, CodexItem>;
  /** units open contracts (not yours) can still take now, by item */
  demand: Record<string, number>;
}
export interface CatalogSource { actionId?: string; bossId?: string; source?: 'monster' | 'boss'; name: string; skill?: string; level?: number; chance: number; qty: number | [number, number] }
export interface CatalogEntry {
  id: string; name: string; rarity: RarityId; kind: string; tier: number;
  slot: string | null; role: string | null; stats: Record<string, number> | null; element: string | null; tags: Record<string, number> | null;
  heal: number | null; buff: { stat: string; pct: number } | null; value: number;
  /** lowest-level refine/craft recipe; secs = base seconds per rep (E.actionTime gives yours); xp per rep */
  recipe: { actionId: string; skill: string; level: number; inputs: Record<string, number>; outputQty: number; secs: number; xp: number } | null;
  usedIn: { actionId: string; name: string; skill: string; level: number; qty: number; outputs: string[] }[];
  gatheredBy: CatalogSource[]; dropsFrom: CatalogSource[];
  /** general store: buy at Standard; sell by grade 0..4 */
  store: { buy: number; sell: number[] };
  /** gear: salvage share by rarity and recipe inputs per piece (yield = inputs x pct) */
  salvage: { perRarity: Record<string, number>; inputs: Record<string, number> } | null;
  lore: string | null;
}
export interface DerivedExtras {
  store: StoreView;
  /** last 50, newest first */
  events: GameEvent[];
  raidPrep: RaidPrep;
  gatherSecs: Record<string, number | null>;
  codex: Codex;
  /** E.recapView(state) for the newest recap, or null (layout pass 2026-11-11) */
  lastRecapView: RecapView | null;
  /** E.crewActivity(state) — last 10 (layout pass 2026-11-11) */
  crewActivity: CrewActivity[];
  /** E.storeSellList(state) (layout pass 2026-11-11) */
  sellList: SellListRow[];
  /** E.disabledReasons(state) (layout pass 2026-11-11) */
  disabledReasons: DisabledReasons;
  /** E.gearInfo(state) per bag gear uid (gear pass 2026-11-12) */
  gearInfo?: Record<string, GearInfo>;
}
export interface SkillProgress { level: number; rawLevel: number; capped: boolean; xp: number; cur: number; next: number; pct: number }

// ---- Phase 3 layout pass (2026-11-11). Additive.
// Return moment: E.applyOffline(state, nowMs) → { seconds, summary: OfflineSummary }. The worker already
//   spreads `summary` into its `offline` message, so these fields arrive with no worker change.
export interface ReturnSkillLine {
  skill: string; name: string;
  /** effective level before / after the catch-up (spec cap applied) */
  from: number; to: number;
  xp: number;
  /** action ids whose level requirement is in (from, to] */
  unlocked: string[]; unlockedCount: number;
  /** "Mining 1 → 39, 4 new nodes unlocked" (nodes / recipes / foes by skill tier); "Mining +1,200 XP" when no level */
  headline: string;
}
export interface ReturnLoot {
  itemId: string; name: string; qty: number;
  /** qty per grade 0..4 (gear: quality grade of each crafted piece) */
  byGrade: number[];
  /** item rarity (gear: the best rolled rarity) */
  rarity: RarityId;
  /** total gold value (E.itemValue per grade; gear E.gearValue) */
  value: number;
  /** part of qty that came from raid floor/tier/chest payouts */
  raidQty: number;
  gear: boolean; uids?: string[];
}
export interface ReturnBestFind { itemId: string; name: string; grade: number | null; qty: number; rarity: RarityId; value: number; uid: string | null }
export type GoldSource = 'combat' | 'sales' | 'raid' | 'tips' | 'other';
export interface GoldBySource { source: GoldSource; label: string; gold: number }
export interface OfflineSummary {
  /** itemId → qty from actions (raid loot is not in here; see loot) */
  items: Record<string, number>;
  xp: Record<string, number>; gold: number; crafts: Record<string, number>; kills: number;
  stoppedReason: string | null; /** true when the job stopped because it finished its count */ stoppedDone?: boolean; assisted: number; tips: number; raids: string[]; weeks: number;
  /** sorted by levels gained, then XP */
  skills: ReturnSkillLine[];
  /** rarest item gained, ties by unit value; null when nothing was gained */
  bestFind: ReturnBestFind | null;
  /** grouped by item id, highest total value first; includes raid payout items */
  loot: ReturnLoot[];
  /** sums to `gold`; 'other' = anything the named sources don't explain (escrow refunds, ...) */
  goldBySource: GoldBySource[];
}

// Raid recap view: E.recapView(state, recapId?) → RecapView | null (newest recap when no id); also
//   DerivedExtras.lastRecapView. Read-only over state.raid.recaps.
export interface RecapPay {
  /** what you got: turnoutPay + contributionPay - capCut */
  gold: number;
  /** ECON.raidEvenShare (25%) of the payable pool, split evenly among those who turned out */
  turnoutPay: number;
  /** ECON.raidContribShare (75%) of the payable pool x pointShare */
  contributionPay: number;
  /** what your income cap (cap) cut; it went to the crew treasury */
  capCut: number; cap: number | null; capped: boolean;
  /** your share of the crew's check points (what contributionPay is split by); use this, not payout.yourShare */
  pointShare: number | null; pointShareText: string | null;
  evenShare: number; contribShare: number;
  pool: number; poolCapped: boolean;
  /** all gold the treasury got from this raid (treasuryShare + capCut) */
  crewTreasury: number; treasuryShare: number;
  /** false for recaps written before 2026-11-09 (whole amount shown as turnoutPay) */
  hasSplit: boolean;
  /** the CREW's fill of what the raid needed (0..1, scales the pool) — not yours; pair it with crewContributionText */
  crewContribution: number;
  /** "Crew filled 77% of what the raid needed" */
  crewContributionText: string;
  /** "Your part of the crew's points: 3.7%" (null for old recaps) */
  pointShareLabel: string | null;
}
export interface RecapItem { itemId: string; name: string; qty: number; rarity: RarityId }
export type RecapHintKind = 'join' | 'survive' | 'tier' | 'crew';
export interface RecapHint { kind: RecapHintKind; text: string; tier?: ContributionTier; check?: string; itemId?: string | null }
export interface RecapView {
  id: string; week: number; won: boolean; joined: boolean;
  tier: ContributionTier;
  /** 'No tier yet' | 'Bronze' | ... (+ ' (carried over)'); 'Sat out' when not joined */
  tierLabel: string;
  pay: RecapPay;
  /** per chest: checkpoint (0..1) and its items summed over grades */
  chests: { at: number; items: RecapItem[] }[];
  /** all chest items summed over chests and grades */
  chestLoot: RecapItem[];
  /** every payout item (floor + tier + chests) summed over grades */
  loot: RecapItem[];
  /** join → survive (fainted) → tier (plain words, no tiny percentages) → crew ("The crew was short: ... Hand in X on Contracts.") */
  hints: RecapHint[];
  nextWeekHint: RecapHint | null;
}

// Crew feed: E.crewActivity(state, n = 10) → CrewActivity[] (newest first); also DerivedExtras.crewActivity.
//   Merges state.crew.feed, state.crew.jobsDone (crewmates' finished jobs, last 20) and
//   your own 'crew' event-log lines, without duplicates.
export type CrewActivityKind = 'contract' | 'payout' | 'vault' | 'request' | 'role' | 'raid' | 'job' | 'assist' | 'you' | string;
export interface CrewActivity {
  /** game-clock ms */
  t: number;
  kind: CrewActivityKind;
  /** crewmate name, 'You', 'Town', 'Raid' or 'Crew'. Show it as its own label. */
  who: string;
  /** the line WITHOUT the leading actor name ("Finished 7 Training sword."); never starts with `who` */
  text: string;
  /** the whole sentence with the actor ("Branka finished 7 Training sword."), for one-line places */
  full: string;
  /** you did it */
  mine: boolean;
  gold?: number; itemId?: string; qty?: number;
}

// Shop sell list: E.storeSellList(state) → SellListRow[] (also DerivedExtras.sellList), stackables in the bag
//   grouped by item, sorted by name. E.storeSellAll(state, itemId) → StoreSellAllResult sells every grade at once
//   (one event-log line). Gear stays piece by piece (storeSellGear).
export interface SellListGrade { grade: number; gradeName: string; qty: number; /** store pays per unit */ price: number; gold: number }
export interface SellListRow { itemId: string; name: string; kind: string; rarity: RarityId; qty: number; /** all grades */ gold: number; grades: SellListGrade[] }
export interface StoreSellAllResult { ok: boolean; reason: string; qty: number; gold: number; grades: { grade: number; qty: number; gold: number }[] }

// Disabled reasons: E.disabledReasons(state) → DisabledReasons (also DerivedExtras.disabledReasons). One plain
//   sentence per control that can't be used now; ids that are usable are absent.
export interface DisabledReasons {
  /** Workshop Start, by action id (E.canStart): level, missing inputs, sealed raid pouch, no weapon, too hurt */
  actions: Record<string, string>;
  /** Assist, by crew job id (E.canAssist) */
  jobs: Record<string, string>;
  /** Hand in, by contract id: filled / closed / cancelled / your own request / out of gold / nothing at the grade */
  contracts: Record<string, string>;
  /** spec Switch: no eligible skill / cooldown "Xd Yh" / not enough gold; null when a switch is possible */
  spec: string | null;
}

// ---- Save schema v7 (owner decision 2026-11-11: this update wipes old saves; everyone starts fresh)
// Saves older than v7 (v1, v3, v4, v5, v6, or no version) are NOT migrated.
//   E.loadSave() → LoadSaveResult: the stored save with why it did or didn't load. Boot with
//     const r = E.loadSave(); const state = r.state ?? E.newState();
//     if (r.status === 'old-save') tell the player their old progress was reset (the next E.save overwrites it).
//   E.load() → state | null (null for none / old-save / corrupt; unchanged signature).
//   E.checkSave(parsedJson) → CheckSaveResult, without loading (use it for imported save codes before E.migrate).
//   E.migrate(parsedJson) → state | null: normalises a v7 save; null for anything checkSave refuses.
//   E.SCHEMA → 7.
// Removed with it: the v1/v3/v4/v5/v6 migration paths, xpScale rescaling (state.xpScale no longer exists),
//   the low-level-spec 3,000g refund, coin → gold folding, requisition → contract merging, `at` → `t` treasury
//   log normalising, open market listings returned to the bag on load, tax week-buff remapping (unknown buffs drop).
// state.crew.jobsDone is part of every fresh state.
export type SaveStatus = 'ok' | 'none' | 'old-save' | 'corrupt';
export interface CheckSaveResult { ok: boolean; status: SaveStatus; /** the save's `v`, or null */ version: number | null }
export interface LoadSaveResult { /** null unless status is 'ok' */ state: any | null; status: SaveStatus; version: number | null }

/** The engine object (GW.Engine in the prototype). Methods are called dynamically. */
export const Engine: any;

// ---- Juice pass 2026-11-12 (docs/juice-pass-contract.md; save stays v7, new fields additive)
// Quantity jobs: E.start(state, actionId, count?) — count reps then { type: 'stopped', reason, done: true }
//   (reason e.g. "Made 10 Copper bars.", "Gathered 40 Copper ore.", "Defeated 10 Mangy wolves."). state.active
//   gains left / count / got; no `left` = unlimited. Offline catch-up respects it (summary.stoppedDone).
//   E.maxMake(state) → Record<actionId, number | null> (null = needs no inputs).
// Gain events: { type: 'gain', source, items: [{ itemId, qty, grade?, rarity, uid? }], offline?: true } — appended
//   to E.tick's events; gains from verbs (storeBuy, salvage) and E.applyOffline are queued: E.takeEvents() drains.
// Readiness: E.raidReadiness(state) → { req, power: { guardian, mender, striker }, bestRole, best, ok, tips }.
// E.equipDeltas(state) → Record<uid, { hp, atk, def, heal, power, speed, elements }> (unequipped bag gear).
// Recently unlocked: E.recentUnlocks(state) → actionId[]; E.dismissUnlocks(state, ids) → { ok, reason, dismissed };
//   state.seenUnlocks (additive; seeded on load for saves made before it).
// Grades: E.gradeName(i), E.gradeAtLeast(i) ('Any grade', 'Standard+', ..., 'Pristine') from DATA.grades.
//   Store prices step >= 1g per grade (E.storeSellPrice / E.storeBuyPrice), never below value x mult.
// Crew: E.crewJobs()[i].reward { xp, skill, gold (tip per assisted rep), items: [] }, etaSec whole seconds >= 1
//   while work is left; E.crewMembers()[i].npc. Treasury log kinds: escrow / release (was contract-escrow /
//   contract-release); a new crew's opening payout is logged (opening: true).
// Max HP: equip/unequip/loadout/repair raise current HP by any max-HP gain; a drop clamps.

// ---- Gear pass 2026-11-12 (gear-pass-contract.md). Additive.
// E.gearDetail(state, uid) → GearDetail | null (bag, else crew vault). Stats are nominal (shown even when broken).
// E.gearInfo(state) → Record<uid, GearInfo> (also DerivedExtras.gearInfo).
// E.salvage(state, uids[], opts): any number of uids in one call; deduped; one gain event; one log line.
// Craft gains: { type: 'gain', source: 'craft', items: [{ itemId, qty: 1, grade, rarity, uid }] } per rep
//   (offline catch-up: aggregated, offline: true).
export interface StatLine { key: string; label: string; value: number }
export interface GearDetail {
  uid: string; itemId: string; name: string;
  slot: string; rarity: string; grade: number; gradeName: string;
  dur: number; maxDur: number; value: number;
  stats: StatLine[];
  affixes: Array<{ id: string; label: string; value: number; stat: string }>;
  equipped: boolean;
  compare: null | {
    uid: string; name: string; rarity: string; grade: number;
    stats: StatLine[];
    diff: Array<{ key: string; label: string; mine: number; theirs: number; delta: number }>;
    /** the equipped piece is at 0 durability (counts for nothing until repaired) */
    broken?: boolean;
  };
  /** at 0 durability: stats are what it gives once repaired */
  broken?: boolean;
  /** part of a saved loadout */
  inLoadout?: boolean;
}
export interface GearInfo {
  grade: number; equipped: boolean; inLoadout: boolean;
  /** `${itemId}|${grade}` when common, unequipped, in no loadout, never repaired and at full durability; else null */
  stackKey: string | null;
}

// Progress sync (2026-11-12): E.repTiming(state) → { repSec, elapsedSec, secLeft } | null;
//   E.stampRep(state, wallMs) writes state.active.repStartedAt / repMs (wall-clock ms; bar = (now - repStartedAt) / repMs).

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
  raidEvenShare: number; raidContribShare: number; raidCapIncomeHours: number;
  salvagePct: Record<string, number>;
};

declare const _default: typeof createEngine;
export default _default;
