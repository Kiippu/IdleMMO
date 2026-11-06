# Engine port notes

This document tracks the port of the single-file prototype's JavaScript engine
(`index.html` → sliced into `engine/legacy/engine.js`) into the TypeScript module
at `engine/src/`.

Phase 0 was a behavioural port. Phase 1 applies the "Settled decisions" from
`CLAUDE.md` (gold-only, supply/tokens/war-chest out, town contracts from
treasury, treasury log, one action slot, specialization switch, real-speed
tuning, NPC stand-ins). The phase-0 parity harness (11 scenario fixtures,
`record-fixtures.mjs`, `test/parity.test.ts`, `test/helpers.ts`) was removed
at the start of phase 1 because every fixture encoded numbers the new rules
deliberately break. See §4 for how to read back that history if a regression
shows up.

## Gate status (current)

- `node engine/scripts/extract-legacy.mjs` from the repo root re-slices
  `engine/legacy/data.js` and `engine/legacy/engine.js` from `index.html` with no
  diff against the checked-in copy — the legacy sources match the prototype
  byte-for-byte. The prototype is still the behaviour reference for anything
  the phase-1 rules don't touch.
- `npm run typecheck -w @guildwright/engine` is clean.
- `npm run test -w @guildwright/engine` runs the 5-seed legacy `E._test` smoke
  (`test/legacy-selftest.test.ts`): seeds `1`, `2`, `3`, `42`, `1337` boot the
  byte-for-byte legacy engine under a seeded RNG + fake clock and run the
  prototype's own assertions. This is a "the prototype still works" tripwire,
  not a parity gate on the TS port.

## 1. What is ported

All modules live under `engine/src/`. Each file carries a one-line "Ported from
legacy/engine.js lines N-M" header and the public `E.*` names are preserved so
the parity scenarios drive the TS engine with the same calls they made against
the prototype.

| File | Role | Legacy source |
|---|---|---|
| `context.ts` | Injects RNG, clock, storage and DATA so rules stay deterministic. mulberry32 + memoryStorage helpers for tests. | (new, phase-0 shim) |
| `core.ts` | `E` object, data accessors (cfg, rarities, grades, actions, bosses, items, affixes), numeric utils, `log`/`fmt`. | 9-152 |
| `data.ts` | Static game content (items, actions, bosses, raid roles, rules). The giant `G/R/C/F/b/d` push-builders live here. | legacy/data.js (sliced from index.html) |
| `skills.ts` | XP curve, level-up, skill table. | 153-198 |
| `inventory.ts` | Stacks, `addItem`/`consume`, lowestGrade, ownedOfKind. | 199-241 |
| `gear.ts` | Rarity rolls, affixes, stats, durability, repair, salvage, fuse, food/potions, autoEat. | 242-405 |
| `actions.ts` | Start/stop, action timing, craft rolls, pity, procMods, completeOnce. | 406-667 |
| `crew-assist.ts` | NPC crewmates posting jobs, assisting, finishing. | 668-851 |
| `tick.ts` | Live tick: active action → completeOnce in a loop, crewStep, market. | 852-906 |
| `offline.ts` | Catch-up: capped seconds, 5s steps for crew/market, weekly rollover, summary. | 907-976 |
| `market.ts` | Buyer listings, tier cap, refresh, player listings, fills. | 977-1086 |
| `supply.ts` | Weekly supply board (donations), counter items, quote, tokens. (Dropped in phase 1 design; kept for parity.) | 1087-1151 |
| `v4-helpers.ts` | Save schema constants, `migrate` v1/v3 shapes, rank defs, ROLE_CHECK/MIX, mulberry fast RNG, inv helpers. | 1152-1182 and various |
| `clock.ts` | Week-start maths, raid window, `E.clock`, `defaultTab`. | 1183-1230 |
| `server.ts` | Server-wide record (hpLeft, participants, pendingBuff) and avg pop. | 1231-1283 |
| `stats.ts` | Stat totals, role powers, tag scores, skill bonuses. | 1284-1373 |
| `loadouts.ts` | Save/delete/equip/autoBuild/bind/compare loadouts. | 1374-1466 |
| `raid-rules.ts` | Normalising rules, lock-in, warnings, pouch sealing. | 1467-1595 |
| `raid-sim.ts` | Pure wave-by-wave fight simulation, timeline, moments. | 1596-1816 |
| `raid-payouts.ts` | Payouts, chests, core odds, debrief, gap drafts, resolveRaid. | 1817-2027 |
| `weekly.ts` | processClock, weekRollover, dev clock, raid status, readiness, farm raids. | 2028-2229 |
| `crew-economy.ts` | Vault, treasury, requisitions, feed, withdrawal flow, officer answers, crewEconomyStep, lock sim. | 2230-2570 |
| `state.ts` | Fresh state, save/load, `migrate` dispatch, clamp HP. | 2571-2694 |
| `selftest.ts` | `E._test` (the prototype's headless smoke run, used by `test/legacy-selftest.test.ts` indirectly via the legacy vm). | 2695-3048 |
| `index.ts` | Public entry. Imports modules in the legacy source order so side-effect `E.*` assignments happen in the same order; exports `createEngine`, `mulberry32`, `memoryStorage`, `DATA`. | (new) |

## 2. What is NOT ported yet / deferred

None of the "Settled decisions" from `CLAUDE.md` are applied in phase 0 — this
port is strictly behavioural. Phase 1 will:

- Rename `coin` to `gold` end-to-end; today both tokens and supply board still
  exist and are tested for parity.
- Drop the supply board, server war-chest, raid tokens, server market tier cap.
- Add the treasury log (every gold/resource movement visible to crew).
- Collapse the two idle slots so helping a crewmate uses the same slot.
- Specialization switch at level 70 with gold + weekly cooldown.
- Real-speed tuning (prototype actions are ~60x faster than designed).
- Remove dev-only hooks still shipped in the prototype: `E.devSetClock` and the
  "Testing" crew panel in the single-file UI.

Everything in `data.ts` (items, recipes, bosses, raid roles, affixes, etc.) is
left alone until the design updates land; adding or renaming items would break
save migration.

## 3. Old-engine quirks preserved on purpose

These were preserved during the phase-0 port because the recorded fixtures
encoded them. The fixtures are gone in phase 1, but the quirks still shape the
TS engine. Treat them as design decisions, not bugs — "cleaning them up"
changes rules that the owner has not signed off on.

RNG and iteration order
- The legacy build consumes RNG inside `Object.keys(x).forEach(...)` loops
  (e.g. material consumption order in `inputQuality`, pouch iteration in
  `takeOne`, ingredient loops in craft completion). The TS port keeps those as
  `Object.keys().forEach` to preserve insertion-order iteration and the
  resulting RNG call order; switching to `for (const k of x)` or
  `Object.entries(x)` would re-order calls and drift the fixtures.
- `shuffle` in `core.ts` and the parallel `shuffleWith(list, rng)` in
  `raid-sim.ts` use the legacy Fisher-Yates loop verbatim (descending `i`,
  swap with `Math.floor(rand() * (i + 1))`). Do not replace with `Array.sort`
  or a different loop direction.
- `mulberry32` is reused verbatim and `mulberry` (the shorter variant inside
  `v4-helpers`) also exists — the legacy code uses both and the fixtures
  depend on both call sequences.
- `rarityOdds` renormalises common vs. uncommon with the legacy branch order,
  including the "if rare+ > 1, floor uncommon to 0" quirk.
- Pity-roll fallback: when forced pity fires but `tot === 0` (no rare+
  probability mass), the legacy code returns `rIdx = Math.min(2, odds.length-1)`
  without rolling. Kept.

Numeric / data quirks
- `grade` is a 0..4 index but many legacy functions take either a raw quality
  number or a grade index. `addItem` clamps `grade` to 0..4 via `Math.floor`;
  callers mix both. Preserved.
- `E.itemValue(itemId, grade)` clamps grade to 0..4, but `gearValue` goes via
  `gradeOf(g.quality)` (quality → grade). Both are kept because tests rely on
  the same numbers the prototype produced.
- Combat crit chance uses `rand() < (stance === 'aggressive' ? 0.15 : 0.1)` —
  the "balanced" branch and "defensive" branch collapse to the same 0.1. Kept.
- `elemSum * 0.5` in `statsFor` uses the sum of ALL element powers (not just
  the weakness one). The raid sim and preview compute weakness-vs-other
  differently. Preserved on both sides.
- `E.fmt` uses `t`/`b`/`m`/`k` suffixes with its own trimming (`toFixed`,
  trailing-zero strip). Do not replace with `Intl.NumberFormat`.
- `E.fmtTime` returns `∞` for non-finite input and uses the legacy
  "1m 30s" / "2h 15m" shape. Fixtures that compare log text depend on it.
- Weekly clock computes `mondayOf` using the local time zone (`setHours`,
  `setDate`). `vitest.config.ts` pins `TZ=UTC` so this stays deterministic.

State and migration
- `migrate()` only knows v1 and v3 → v4 upgrades (there is no v2 in the
  legacy code). State has `clock`, `raid`, `crew`, `server`, `economy`,
  `supply`, `market`, `loadouts`, `pity`, `mastery`, `skills`, `inv`, `gear`,
  `equipped`, `focus`, `hp`, `gold`, `tokens`, `week`, `lastSeen`, `seq`,
  `settings`, `log` — every field has a legacy default. Any new field added
  during phase 1 must gate on a schema bump (v5), not land silently.
- `state.gold` is always a number but the legacy code writes `state.gold +=`
  with occasional non-integer values (market fees). Kept as-is; UI formats.
- `state.focus` is reset to 0 at the start of offline catch-up (the legacy
  behaviour — focus is a live-tick-only reward).
- The logger stores the newest entry at index 0 (`unshift`) and truncates
  at `LOG_CAP = 80`. Fixtures with log diffs will drift if you push instead.

Harness and timing
- `freshEngine` in `test/helpers.ts` calls `vi.resetModules()` so every parity
  scenario starts with fresh module-level caches (`cfgCache`, `actCache`,
  `bonusCache`, `projCache`, `flags`). The legacy build runs in a fresh
  Node vm per scenario; the TS port must match that cache-cold state.
- `flags.quiet = true` during offline catch-up suppresses per-event log lines
  (only the one summary line is kept). `logq` reads this at call time.

Typing notes (for anyone who tightens `tsconfig.json` later)
- `core.ts` `num(x, d?)` returns `any` on purpose. The legacy code uses
  `num(x)` without a default to mean "defined and numeric or NaN"; tightening
  to `number` breaks the dozens of `if (num(x, 0) > 0)` call sites.
- A handful of locally-built records are annotated `any` at creation
  (`procMods.mods`, `loadouts.autoBuild.res`, `crew-economy.you`,
  `raid-sim.w`, the dynamic `out: any` maps in `stats.ts`/`raid-payouts.ts`).
  These are objects that legacy code builds a base of, then stuffs extra keys
  into on later lines; tightening them requires separate interfaces that are
  just noise for a one-off port. See phase 1 for cleanup.
- Reduce callbacks over `Object.values(someMap)` use an explicit
  `.reduce<number>((a, b: any) => a + (num(b, 0) as number), 0)` to pin the
  accumulator type when the map's value type is lost through `any` helpers.
- `cfgCache`, `actCache`, `projCache`, `bonusCache` are module-level `let`s
  so a stale src from a previous realm can invalidate them; `vi.resetModules()`
  resets everything per parity run.

## 4. Phase-0 parity harness (removed, how to resurrect)

The parity harness is deleted on `rebuild/phase-1` but still lives on the
phase-0 merge commit. If a phase-1 change breaks something that worked in
phase 0 and you want to bisect:

1. `git show origin/main:engine/scripts/record-fixtures.mjs > /tmp/record.mjs`
   (and `engine/scenarios/index.mjs`, `engine/test/parity.test.ts`,
   `engine/test/helpers.ts`, `engine/fixtures/*.json`) — all of them lived at
   paths you can pull back with `git show` or `git checkout origin/main --`.
2. Run the harness against the suspect commit.
3. Delete again when you're done — phase 1 rules make a parity gate
   meaningless, so these files should never be checked back in on the
   phase-1 branch.

## 5. Public API shape (don't drift)

`engine/src/index.ts` exports:
- `Engine` (the raw `E` object — same shape as `GW.Engine` in the prototype).
- `createEngine({ rng, now, storage, data })` — returns `E` after configuring.
- `mulberry32(seed)` — the seeded RNG.
- `memoryStorage()` — an in-memory `SaveStorage` for tests.
- `DATA` — the static game content object.
- `EngineContext`, `SaveStorage` — types.

The parity scenarios in `engine/scenarios/index.mjs` call `E.*` by name. If a
phase 1 change renames or re-signatures a method, update the scenario file
and re-record the fixtures (see section 4), do not patch the engine to keep
the old call shape alive.
