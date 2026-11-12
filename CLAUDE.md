# Guildwright (repo: IdleMMO)

Guildwright is a mobile idle MMO about gathering, crafting and trading in a medieval guild town.
Core loop: idle gather → refine → craft through the week, then idle raid at the weekend.
Specialization forces players to trade and depend on each other.
Design pillars: time is the currency, interdependence, idle-first.

## Sources of truth
These live on claude.ai and are private (Claude Code cannot open them; ask the owner to paste what you need):
- Design doc (master spec): https://claude.ai/code/artifact/c3d56c6e-1bcd-44a9-b8e5-09c32e6a98fe
- PWA rebuild plan (stack, architecture, hosting, roadmap): https://claude.ai/code/artifact/d584a16e-2cf7-4f1f-9850-d681fba042c6
- Sprite review: https://claude.ai/code/artifact/c932467e-32ba-4257-a3f7-007bc7fc0e03
The legacy single-file prototype is `index.html` at the repo root. It is the behaviour reference; do not edit it.

## How the owner likes to work
- "Review" or "as a game designer" = critique and options only. Change nothing until the owner agrees.
- Keep replies short and plain. End with the decisions needed from the owner.
- After each change, flag knock-on effects and conflicts, and list unresolved items as open questions.
- Use subagents whenever the task allows (no need to ask). Model by job: Opus for game rules and complex
  systems, Sonnet for UI, screens and research, Haiku for checklists and simple lookups. Give each agent one
  area to own and send follow-ups back to that agent. Use a fresh agent for independent review/testing.
  Parallel agents must not edit the same files. At the end of a session, list the agents used and what each owned.
- Commit and push to GitHub. Work on branches; don't push to `main` without asking.
- Saves: schema v8 in IndexedDB (gear overhaul, 2026-11-12; v7 was phase 3). The owner (the only player) agreed that v7 and
  older saves and old backup codes are NOT migrated; the game starts fresh silently (`E.loadSave()` / `E.checkSave()`; old
  fixtures in `engine/test/fixtures/` are only used to prove they are refused). Settings (localStorage) are kept. The old
  "keep v7 loading" rule is replaced: from v8 on, builds must keep v8 saves loading, and later changes are additive
  (unless the owner says otherwise).
- Test at phone width (360 and 390px) in dark and light. Dark is the default theme; light is a choice in Menu › Settings
  (owner 2026-11-12, replaces the 2026-11-11 light-only rule).

## Settled decisions (don't reopen unless asked)
Game design
- Currency is "gold", written "g" in prices (e.g. 6g). Never "coin".
- No premium currency. The bond token ($5, 14 days of membership) is the only bridge between cash and gold.
- Town contracts list what the raid needs and pay gold only (reputation removed 2026-11-08). The gold comes from the
  crew/guild treasury and can be spent anywhere. Player-posted crew requests share the same Contracts board.
- Specialization: every profession skill levels to 70 without specialising; a spec is picked only once a skill hits 70
  and lets that skill go past 70. First pick is free.
- Resources submitted through contracts go only to crew/guild stock and are used in raids to heal and buff members,
  which raises their contribution.
- Every gold and resource movement in a treasury is logged; all crew/guild members can see the log.
- Raid gold payouts scale with turnout and contribution, capped per crew: 25% of the payable pool split evenly among
  turnout, 75% by share of crew contribution points; each player capped at 3x their OWN hourly income (excess goes to
  the crew treasury). Constants `raidEvenShare` / `raidContribShare` / `raidCapIncomeHours` in ECON (2026-11-09).
- Server supply board and war chest are dropped. Raid tokens are dropped: core tickets come only from turnout
  (floor) and contribution tier; retune the core-draw odds.
- One idle action slot per player. Helping a crewmate uses it.
- Specialization switch: allowed for free players, old skill drops to the level-70 cap with no XP lost,
  costs about 3 hours of level-40 income, one-week cooldown.
- Speed: `speedFactor: 1` (prototype pace). Prefer income too high over too low; price things in hours of play.
- Core-draw pity scales with contribution tier (3 / 4 / 5 / 6 empty kills, top tier to none).
- NPC crewmates (stand-ins) fill at most 50% of a contract, only from Friday until the raid opens.
- Economy is priced in H = one hour of level-40 income (`H`/`ECON` in engine data.ts): raid pool sized at 1.5 H per player
  at full contribution (x1.25 per boss tier; split and capped as above), 2.5% of each raid pool to the crew treasury, contracts pay 1.1x item value,
  spec switch 3 H. Any rank can post crew requests. No refund for 3,000g first picks made at 70+ before 2026-11-08.
- Navigation: Workshop, Stores (Mine/Crew), Shop, War Room (Loadout/Raid), Crew (Roster/Jobs/Contracts/Treasury).
  Hunt merged into Raid, which runs prep → live → recap; stance/tactic/eat threshold lock at lock-in, gear swaps stay
  allowed during a live raid. The log opens as a sheet from the top strip (2026-11-09).
- Juice pass (owner 2026-11-12): when a job ends it ends — the slot stays empty until the player picks a job (no
  auto-resume). Refine/craft ask how many (`start(actionId, count)`). Number prompts: − [qty] + then +10 (adds 10) · Max (· Until out);
  no "1" button (owner 2026-11-13). Top bar = gold, HP, raid timer, cog menu only;
  job name/progress/Stop sit under the Workshop scene. Workshop = skill headers + item icon tiles (time/XP live in the
  item sheet), no "Ready now", a dismissible "Recently unlocked" card. Gear is equipped in War Room › Loadout (hero
  preview + slots + filterable gear list), not Stores. No toasts: item gains burst from the tab bar as a fountain
  (one pop per item, rarity glow). Grade ladder is the engine's: Rough, Standard, Fine, Superior, Pristine.
- Player market PARKED until the shared world (phase 5). The Shop is an NPC general store: 6 resources + 3 gear
  (Tier 1 fight gear only since the gear overhaul) each game hour, weighted to the player's levels, and also sells Uncommon
  Tier 1 tools (~600g each); sells at 1.5x (resources) / 2x (gear) value, buys
  anything at 0.4x. Old open listings return to the bag on load. Bond-token-for-gold exchange needs a home by launch.
- Weekly market-tax buff removed (old saves get the repairs buff).
- Fun-testing tuning (2026-11-11, revisit before launch): XP per level x5 (`config.xpCurveMult`; old saves have stored
  XP rescaled once via `state.xpScale`, levels kept); level 70 ≈ 27 h active per skill. Offline catch-up runs at 1x
  active speed (was 1.5x; lowered 2026-11-11) with NO time cap (`offlineRate`); long gaps step hour by hour, gathering past 20k reps bulk-steps,
  combat/crafting past 20k reps rests, crewmates' own jobs simulated for the last 12 h only.
- Gear and tool overhaul (owner-approved 2026-11-12; master: Claude Doc "Guildwright — Gear, tools and items spec",
  https://claude.ai/artifact/JecuCFLLwR9FvMWAi9mSBt, plain copy may be in the session as `gear-spec.md`; the doc wins).
  This release is T1–T3 (~170 items); T4–T5 later, the data model must allow them. Branch `feat/gear-overhaul`.
  - Three equipment sections, each used automatically (no swapping, no binding a loadout to an activity): 15 tool slots
    (one per work skill), three work-outfit sets (Gather, Refine, Craft) x head/body/hands/feet, and the fight loadout
    (weapon, offhand, head, chest, legs, ring1, ring2, amulet; two rings and an amulet). Raid lock, readiness and saved
    loadouts use only fight slots; tools and outfits add nothing to raid power.
  - Tier ladder T1–T5 (levels 1–14 / 15–29 / 30–44 / 45–59 / 60–70+), material per tier in the spec.
  - Stat formula: base = tier budget (60, x1.5 a tier) x slot share x stat weight x grade (0.97–1.06). Rarity adds one affix
    per step; the first is always the primary stat (+12% of base per step), so higher rarity always beats one rarity lower.
    Fight durability 100/130/160/200/300/400. Stats AND boss requirements are shown x10 (boss 1 needs 300 power).
    Health is on its own x2 scale (owner 2026-11-13): base HP 120, +8 per combat level, chest HP 0.5 x defence, food heals
    and enemy damage = old values / 5; computed on the x10 scale then divided by 5, so outcomes match exactly (HP can show
    one decimal, steps of 0.2; test engine/test/hp-scale.test.ts).
  - Swift is removed. Tags foraging/hunting/speed/quality are replaced by effect ids speed, double, save, quality, find, rarity.
    The `boundTo` auto-equip-on-start and the flat 14-affix list are gone.
  - Tools wear but never break: condition 100 to 1, -3% / -5% / -8% action speed below 50 / 25 / 10%. Repair is gold only,
    100g per 10% condition x tier factor (x1/2/4/7/12). Work outfits don't wear. Fight gear wear/repair/salvage unchanged.
  - Shop sells no tools (every new save gets a free Common T1 set) and only T1 fight gear plus resources; every Shop item
    is Rough grade (owner playtest 2026-11-13). Shop is a grid of tiles (icon, name, price); details and Buy live in the item sheet. Other
    tools: crafting, or raid boss drops (T3+, Rare+).
  - Crafted quality uses crafter level and tier: 0.5 x avg input quality + 25 + clamp(crafter level - recipe level, -10, +30)
    - 3 x (tier - 1) + mastery + tool/outfit quality points +-4. A new save gets a free Common T1 starter tool in all 15 slots.
  - H (14,820g/h) and the raid payout cap are measured with NO tools or outfits.
  - Final tuning (2026-11-13, differs from the spec doc): work-effect caps speed 4%, double 5%, save 5%, quality 10, find 30%,
    rarity odds 25%; soft cap is linear to half the cap, then curves. Role power: striker atk x2.16 x element factor,
    guardian def x1.16 + max HP x0.05, mender heal x2.05 (full Common kit = 1.0–1.15x its tier boss). Rarity bonus raises
    every base stat; higher rarity beats one lower at any grade (tested over all items). Crafted tool recipes scaled to
    pay back in 20–50 h; starter tools can't be sold or salvaged. One effect formatter (engine fmtEffect): >=1 one decimal,
    <1 two decimals, never +0.0.
- Name stays Guildwright.
Tech
- Stack: Svelte 5 UI, plain Canvas 2D scenes, Vite, rules engine in TypeScript running in a Web Worker.
- Hosting: Cloudflare Workers (Paid, $5/mo) at launch with D1 + Durable Objects; the same TS engine runs on the server.
  Before launch the game runs on the owner's PC under `wrangler dev`, exposed with a TryCloudflare quick tunnel.
  The quick-tunnel URL changes every restart: testers reopen the new link, and need a save export code
  until cloud saves exist. A custom domain + named tunnel comes later (not bought yet).
- Accounts: username + password in D1 (PBKDF2-SHA256 via Web Crypto, per-user salt, iteration count stored;
  Workers appears to cap PBKDF2 at 100,000). Session = random token in an HttpOnly Secure SameSite=Lax cookie,
  only its hash stored, 30-day rolling expiry. No email: the owner resets passwords by hand pre-launch.
- Repo stays public: never commit raw art packs whose licence forbids redistribution (see Art and UI for the one allowed pattern).
Art and UI
- Cozy pixel art at 32px. Hero built from LPC layers so worn gear shows everywhere. Remap packs to DawnBringer 32.
- Free assets only. CC0 / CC-BY / OGA-BY preferred. A non-CC free pack is allowed when its licence permits commercial use and
  modification and we commit only our built atlas, never the raw files (owner 2026-11-12). Record every pack, author, licence and link in `art/CREDITS.md`
  and the in-game credits screen. Share-alike (CC-BY-SA) LPC Revised tiles are allowed pre-launch, tagged in
  CREDITS so they can be swapped; decide at launch whether to replace them.
- Keep the existing design tokens: plaster background, flat paper panels, woad blue accent, brass for gold,
  rarity inks from common grey to mythic crimson.
- Numbers render in Atkinson Hyperlegible with tabular digits (`--f-num`); Pixelify Sans for titles, Silkscreen for
  short letter labels only. Fonts are bundled (OFL 1.1), not loaded from Google. Buttons ≥44px; no browser dialogs.
- Art is FREE packs only (owner 2026-11-11; no paid packs). Full list with licences in `art/CREDITS.md` (the single
  credits file; Menu → Credits is generated from it and a test fails if a shipped pack or LPC layer is uncredited).
- Item icons from 2026-11-12: the Seveneves "1,000+ RPG Icons" pack (32px) for all items, remapped to DB32 with
  `scripts/art/remap.py`; 7 tool icons (sickle, bellows, chisel, needle, gem file, mortar and pestle, rolling pin) are drawn by
  us. The raw pack lives in a gitignored private folder and is never committed; only the built atlas is. Credits say the item
  icons are by Seveneves AI, AI-generated then hand-modified (author's answer, 2026-11-13). The line below describes the
  older icon sources and is superseded for item icons.
- Icon pipeline: one 32px atlas, `npm run art` → `scripts/art/build.py`, mapping in `art/icon-map.json`. Idylwild and Kyrise
  item icons are retired (2026-11-13); Shikashi stays for tab icons only, Ninja Adventure for scene art. Everything is
  remapped to DawnBringer 32 by one shared tool, `scripts/art/remap.py`. Not Kenney.
- UI frames: own rounded pixel frames (dark/light) in client/src/ui-art/frames/ drawn by `scripts/art/ui-frames.py`;
  slot tiles keep square frames; the app texture is own art too (ETA's
  pack went paid, Mounir Tohami's page is gone). Tab icons from Shikashi. Sounds are synthesised (Web Audio), no files.
- Hero/crew: LPC layers (OGA-BY 3.0 / CC-BY 4.0 / CC0 options only, NO share-alike). Guardian plate/chainmail, Striker
  leather, Mender longsleeve2 shirt + hood (the LPC robe is SA-only, not used). Backdrops + boss portraits: Ninja
  Adventure (CC0). Rebuild with `scripts/art/build-scene.sh <LPC clone> <Ninja dir>`.

## Roadmap (each phase ends in a gate)
0. Foundations: split repo into engine/client/server/art; port engine + data to TS UNCHANGED in behaviour;
   old `E._test` cases in Vitest; CI; `wrangler dev` + tunnel running.
   Gate: TS engine matches old-build fixtures under a seeded RNG.
1. Design update: apply the settled rules above to the engine (gold only, tokens/supply board/war chest out,
   town contracts from treasury, contract stock used in raids, treasury log, one action slot, specialization
   switch, real-speed tuning — prototype actions are ~60x faster than designed). NPC crewmates stand in.
   Gate: new rule tests pass; v4 saves still load.
2. Solo PWA: Svelte rebuild of the five tabs, IndexedDB saves (v5, v4 import), save export code, catch-up worker,
   collect reveal, 160x64 scene strip + LPC hero from the start, installable.
   Gate: installs on Android and iOS; v4 saves import; phone width, light and dark.
3. Art and credits. 4. Accounts and cloud save. 5. Shared world (Durable Objects, WebSockets, Cron raids).
6. Launch (move to Workers Paid, payments, quality pass).
Also: remove dev-only tools before players see them (devSetClock / Raid "next week" button, crew "Testing" panel).

## Phase 2.5 (2026-11-08) — rules fixes, merged to `main`
Plan: `docs/phase-2.5-plan.md`, plus owner decisions the same day (see Settled decisions). Done:
- Contracts: one Crew → Contracts board with Town contracts (raid needs, paid from treasury escrow) and player-posted
  Crew requests (paid from the poster's escrow). Gold only, 1.1x item value; a contract closes when its gold runs out.
  Items go to crew vault only. NPC stand-ins fill <=50%, Friday until the raid opens.
- Specialization: profession skills level to 70 freely; pick a spec only at 70+ (first pick free); switch costs 3 H
  (44,000g) with a 1-week cooldown shown "Xd Yh"; old skill back to effective 70, XP kept. Combat skills never capped.
- Treasury log covers every movement (game-clock `t`, items x qty, gear, escrow, raid stock, payouts, who paid).
- Raids: core odds without tokens, tiered pity; vault stock used on a member credits their contribution; players get
  raid gold (1.5 H at full contribution, x1.25 per boss tier), 2.5% of the pool to the treasury.
- Economy constants in `H`/`ECON` (engine data.ts), H = median level-40 income (~14,820g/h); `speedFactor: 1`;
  `E.actionTime` used by Workshop list + active card; early game matches the prototype.
- Removed: dev raid start, reputation, farm raids, view-as-member, NPC-posted requisitions, old requisition verbs.
- Save schema v6 at the time; fixtures v4 (prototype), v5 (phase 2), v6 (pre-decision phase 2.5) all load.
  (Superseded: saves are now schema v7 and older saves are not loaded, see Saves above.)
- Tests: engine 87, client 18, server 3. Live tunnel checked at 400px light + dark.
Open for the UI/UX pass: pixel-font digits (5 reads as 9), sparse raid recap card, plus the list in the plan's "Next".

## Current state (2026-11-07) — phase 2 feature-complete on `rebuild/phase-2`
Phase 1 is merged to `main` (`445cb69`); `rebuild/phase-2` is cut from there and pushed, 12 commits on top.
Engine: 40/40 tests still green (`npm run test -w @guildwright/engine`); engine typecheck clean.
Client: `npm run typecheck -w @guildwright/client` clean; `npm run test -w @guildwright/client` is 11/11
(save-layer round-trip + IDB facade coalescing). Prod build chunks to main 195 KB (67 KB gz) + worker 155 KB
+ css 7 KB.

**Phase 2 gate per roadmap** (`installs on Android and iOS; v4 saves import; phone width, light and dark`):
- v4 saves import — shipped in slice A (silent localStorage → IDB migration on first boot; engine `migrate()`
  handles v4 → v5).
- Phone width — everything clamped to `max-width: 460px`; Playwright smoke-tests in that column.
- Installable — manifest + SW active, SW state verified as `activated` in Playwright with the full shell
  precached on second load.
- **Not device-verified** — iOS and Android installs; dark-mode visual pass. Components use design tokens
  that honour `prefers-color-scheme: dark` and `[data-theme]`, but no dark-mode snapshot was taken.

Phase 2 architectural decisions confirmed in session 2026-11-07 (all captured before any code moved):
- **Save adapter:** sync `SaveStorage` facade over IndexedDB with 500 ms debounced flush. Engine stays
  synchronous; async-rewrite rejected as too invasive.
- **Export format:** `GW5|<base64url(gzip(json))>` via `CompressionStream` — no dependency.
- **v4 import:** silent one-shot on first boot (fallback from empty IDB → legacy localStorage key).
- **Worker RPC:** hand-rolled tagged-union over `postMessage` with correlation ids; no Comlink.
- **Snapshot cost:** `postMessage` clones the whole state object every tick (~tens of KB); diff-patches
  deferred until a profile shows a problem.
- **Hidden-tab behaviour:** worker stops ticking on `visibilitychange:hidden`, runs `E.applyOffline(state,
  now)` on resume so catch-up never blocks the UI.
- **SW update UX:** install does NOT call `self.skipWaiting()`; the client shows a "Restart" toast and only
  activates on user click. (Toasts are superseded 2026-11-12; the restart prompt must not be a toast.)
- **Engine package type boundary:** `engine/src/public.d.ts` + conditional `exports` map so the client's
  strict tsconfig sees a strict-safe surface. The implementation source stays `noImplicitAny` per
  PORTING.md; without this, client svelte-check walks into the loose source and rejects legal engine code.
- **Per-snapshot `derived` bundle:** the worker precomputes `{skillLevels, activeTime, gearNames,
  playerStats, bossIntel, raidStatus, marketTax, crewMembers, crewJobs}` on every outbound message so the
  main thread never needs to call engine methods. Keeps `DATA` the only engine import on main.
- **First tab built:** Workshop (highest-leverage exercise of the stack: worker RPC, autosave, action
  start/stop, progress bar).
- **Scene strip scope for phase 2:** a 160×64 Canvas 2D with placeholder hero that bobs when
  `state.active` is set. LPC hero layers driven by equipped gear + per-action animation variety are
  **phase 3** once the art pack lands.

Phase 2 commits (12 on `rebuild/phase-2`, bottom-up):
- `62f312b` A: client save layer + engine type boundary (sync IDB facade with debounced flush, GW5|…
  gzipped base64url export/import, one-shot v4-from-localStorage importer, engine `public.d.ts` + conditional
  exports map).
- `44761e2` A2: vitest on the client + 11 save-layer tests (GW5 round-trip across byte lengths that hit
  every base64url padding mode; facade coalescing, forced flush, in-flight-flush safety).
- `ba85114` B: engine Web Worker (`engine.worker.ts`), tagged-union protocol, Svelte 5 `$state` snapshot
  store, main-thread RPC client. Verbs for this slice: `init / start / stop / pause / resume / export /
  import / reset`.
- `5e0e721` C: boot flow + first-tab selection. Loading splash until `engine.ready`; seeds the active tab
  from `E.defaultTab(state)` exactly once (raid window → War Room); wires `visibilitychange / pagehide /
  beforeunload` to pause/resume the worker.
- `134365c` D: Workshop tab + per-snapshot `derived` view. Active-action card with progress bar; skills
  grouped by tier (Gather/Refine/Craft/Fight); locked actions render with level requirement.
- `8e0ec9a` E: PWA shell — `manifest.webmanifest`, `public/sw.js` (plain JS, no plugin), SVG icons incl.
  maskable, `src/pwa.ts` registration + waiting-SW handshake, "A new version is ready. [Restart]" toast.
- `d85dc9d` F: 160×64 `SceneStrip.svelte` (pixel-art placeholder hero, bob on active) at the top of
  Workshop; proper `CollectReveal.svelte` sheet replacing the one-line banner (per-bucket breakdown
  with human-readable item/skill names).
- `d8d5cb3` G: Stores tab (Mine + Crew sub-tabs). Equipped slots, bag gear, materials with per-grade
  hint; vault views. Adds `equip` / `unequip` verbs; Derived gains `gearNames`.
- `c945395` H: War Room tab (Loadout / Hunt / Raid). Loadout save/equip/delete; boss intel HP bar;
  stance + tactic pickers; eatAt slider 30%–80%; `runRaid` button. Derived gains `playerStats`,
  `bossIntel`, `raidStatus`.
- `95d4315` I: Market tab (Buy / Sell). Buyer-listing board with Buy button + qty prompt; My listings
  with cancel; list-new-item form with grade picker (shows `have N` per grade) + live after-tax preview.
  Derived gains `marketTax`.
- `5c68851` J: Crew tab (Roster / Jobs / Treasury). Roster shows You + the four phase-1 NPCs with rank
  + skill spec. Jobs lists open jobs with Assist button + ETA. Treasury shows crew gold + the audit
  ledger. Derived gains `crewMembers`, `crewJobs`.
- `79c0ecd` K: Save menu overlay (export / import / reset). Modal sheet with copyable GW5 code, paste
  target for import (reloads on success), danger-coloured Reset button (double confirm). Dismisses on
  scrim click, ✕ button, or Esc.

**Playable surface today**: boot → scene strip + Workshop → pick a gather action → watch skill level ticks
up and materials stack; swap gear via Stores; save a loadout and run a raid in War Room; buy/sell on the
Market; assist a crewmate's job; export a 12 KB GW5 code that round-trips. Autosave to IndexedDB; survives
reload.

Not verified on this Windows checkout: `wrangler dev` + `/api/health` + `--test-scheduled` (workerd crashed
in Linux VM during phase 0). Pick up when a server change lands.
`.npmrc` still sets `legacy-peer-deps=true` to dodge an npm 10.9 vitest install crash.

## UI/UX pass (2026-11-09) — branch `ui/ux-pass`, not merged
Review → owner decisions → built: legible numbers, 44px buttons, confirm/stepper sheets, sticky top strip (gold, raid
chip, job, HP, Stop/next, Log, Save), tab badges, Log sheet, full-screen collect reveal, Workshop = Ready now +
category chips + skill accordions (mockup A, no horizontal strip), War Room Loadout/Raid with hero card + chest
checkpoints + recap sheet, Getting started guide (progress in localStorage), Contracts rows + hand-in sheet, Stores
bag grid + item sheet, Shop (NPC store). Engine: item rarity, gather secs, raid prep phases, store, event log (last 200,
additive in save v6), payout split/cap. Tests: engine 113, client 23, server 3. Independent QA at 360/400 light/dark.
## Quality pass (2026-11-11) — branch `qol/pass`, merged
Gear salvage by rarity (common 20 / uncommon 40 / rare 60 / epic 75 / legendary 90 / mythic 100% of recipe inputs,
`ECON.salvagePct`; equipped never, loadout + rare+ only with "Include protected"); single + "Salvage shown" mass
salvage. Discovery `state.seen` → Codex (Stores → Mine/Crew/Codex): crafted item = silhouette once one input
touched, full once all inputs touched; raw material = silhouette within 10 levels of its source; boss loot/cores
hidden until touched. One shared item sheet from every item tap; draft descriptions in `engine/src/item-lore.ts`
(owner to review). Bag/vault search, rarity, category, sort. Return "fountain" from the tab bar + vibrate.
Next: phase 3 art (icons per item with tints OK, LPC crew sprites hitting the node when assisting, full UI art
overhaul: framed panels replace flat paper — owner confirmed 2026-11-11).

Open: crew activity feed (agreed in the UI review, not built yet); credits screen in game; guide progress not in the save export; Workshop/Shop not yet seen on the live tunnel.

Phase 3 plan (owner-approved 2026-11-11): https://claude.ai/artifact/R52AF1BRcyedWQ8J9AQQhs — order: layout pass
(no art) → style frame on a real phone → pipeline (+credits log) → icons (32px grid) → UI frames (5 component
types) → hero/crew/scenes → bosses → sound (mute) → credits screen. LIGHT MODE ONLY from now: no dark mode, no
themes (test at 360 and 390px, light). [Superseded 2026-11-12: dark is the default, light is a Settings choice.] Whole-number pixel scaling only.

## Phase 3 step 1: layout pass (2026-11-11/12) — merged to `main` with phase 3
No art. Engine: return summary (per-skill headline, best find, grouped loot, gold by source), one Log line per skill per
level-up batch, `E.recapView` (turnout vs contribution pay, `pointShare` not `yourShare`, tier label, plain next-week hint),
`E.crewActivity` (+ `crew.jobsDone`, last 20), `E.storeSellList` / `E.storeSellAll`, `E.disabledReasons`; save schema v7.
Client: one Menu (Log, Save, Settings: mute stub + reduced motion, Credits placeholder), one-line guide + "Do this first",
~156px pixelated scene on Workshop only (52px native, 3x) + slim strip elsewhere, numbered tab badges, disabled-button
reasons, empty states with a next step, compact numbers everywhere ("12.6k g" from 10,000; owner OK'd), grouped sell list +
atomic "Sell all grades", rebuilt return reveal and raid recap, crew feed on Crew > Roster + toasts
(toasts superseded 2026-11-12 by the tab-bar fountain and inline results: no toasts).
Build/test: a Linux clone on the owner's PC VM (`$HOME/work/IdleMMO`, own node_modules); the PC has no GitHub credentials,
so commits are bundled and pushed from the cloud; QA screenshots via cloud Playwright (no browser on the PC VM).

## Phase 3 steps 2-9: art and credits (2026-11-12) — branch `phase3/art`, merged to `main`
Owner asked to finish the whole phase in one go, so the step 2 style-frame phone check happens on the merged build.
- Pipeline + icons: all 159 items have icons (no letter tiles); `ItemIcon` (32/64px, rarity corner shape + colour,
  grade pips, tinted generic fallback, codex silhouettes). Atlas ~34 KB.
- UI frames on 5 component types, tab bar icons, plaster texture; item slot tiles are a fixed 44px.
- Workshop scene: 64px native at 3x (~192px), hero composited at runtime from an LPC layer atlas by equipped gear, a
  work pose for every action (tools for mine/chop/smith/fish, hand gestures for herb/cook/alchemy/tailoring), one
  crewmate beside you when you assist a crew job; 30 fps cap, paused when hidden, still pose under reduced motion.
- Six boss portraits on the raid card and recap (hidden until the boss is revealed).
- Sound: tap, collect, level-up, fountain; only after the first gesture; Menu → Settings → Mute.
- Known gaps: no engine notion of crewmates assisting YOUR action (only you assisting theirs), so that isn't drawn;
  the fishing rod tip clips ~9px at the top of the scene; weak icons (scales, cores, essences, tin vs silver ore).
- Open: the owner's real-phone check of the art (style frame), offline cache size budget.
- Final QA 2026-11-12 (5795c3f): gate passed, 192 tests green. Left for a follow-up pass: combat weapon is dark on the
  dark ground and one big swing covers the foe; reveal floating pieces briefly overlap the headline; at 360px the gear item
  sheet scrolls so Salvage/Equip sit below the fold; Shikashi credit name is long with a raw URL; salvage "Skipped" list
  repeats one piece per reason; the service worker caches at runtime (no install-time precache, ~0.9 MB).

## Phase 4-lite (owner-approved trimmed plan, 2026-11-12)
Accounts are made by the owner with a script (no invite codes, no public sign-up), username + password. Cloud save with
a revision number and 409 on a stale write; backups = last 5 hourly snapshots plus the losing copy of every conflict.
The server refuses future-dated saves. Raids run on Sydney time (engine task, later). Share-alike art allowed pre-launch.
Save schema was v7 here; the gear overhaul bumps it to v8 (see Saves). Later fields are additive.
- M0 PC setup (branch `phase4/m0-pc-setup`): server data lives OUTSIDE the repo (`wrangler dev --persist-to`, default
  `<repo parent>/guildwright-data`, backups in `<repo parent>/guildwright-backups`; override with `GW_DATA_DIR` /
  `GW_BACKUP_DIR`). Scripts in `scripts/server/` (dev applies migrations first; backup keeps 14; restore-check loads a
  backup into a temp DB). `/api/health` reports `db` + table count; `LOG_HEADERS=1` in `server/.dev.vars` logs what the
  tunnel forwards. Runbook: `docs/pc-server.md`. Run on port 4173 so the current tunnel URL keeps working.
- Start it with `npm run serve` (port 4173). Verified on the owner's Windows PC 2026-11-12: `/api/health` through the
  tunnel returns `db:true, tables:5`.
- Quality craft card (2026-11-12): the active job is held (no progress, no held time credited later; `engineClient.holdJob`,
  `state.active.held`) while a card is on screen. Settings › Craft celebration picks which rarities show the card (default all).
- SHELVED after M0 (owner 2026-11-12): the gear and tool overhaul comes first. When M1 resumes, first capture one
  `[headers]` line from the server window (request made through the tunnel) for the Origin check.

## Gear and tool overhaul (2026-11-12) — in progress on branch `feat/gear-overhaul`, not merged
Spec: https://claude.ai/artifact/JecuCFLLwR9FvMWAi9mSBt (see Settled decisions). Scope: T1–T3 first, T4–T5 later; save schema v8
(v7 saves start fresh). Contract and file ownership for the agents: the session's `gear-overhaul-contract.md`. Phase 4-lite M1 stays
shelved until this lands. Roadmap: this overhaul comes before M1.
Superseded by the overhaul (don't rely on these older notes): equipping gear "in War Room › Loadout" now covers the fight loadout only
(tools and work outfits are automatic); the single ring slot; Shop gear "tier <=2"; the foraging/hunting/speed/quality tags and Swift.
