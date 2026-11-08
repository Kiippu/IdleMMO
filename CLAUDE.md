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
- Builds must keep existing player saves working (save schema v6 in IndexedDB since phase 2.5; `migrate()` loads v1, v3, v4, v5, v6; fixtures in `engine/test/fixtures/`).
- Test at phone width (max 460px column) in light and dark mode.

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
- Raid gold payouts scale with turnout and contribution, capped per crew.
- Server supply board and war chest are dropped. Raid tokens are dropped: core tickets come only from turnout
  (floor) and contribution tier; retune the core-draw odds.
- One idle action slot per player. Helping a crewmate uses it.
- Specialization switch: allowed for free players, old skill drops to the level-70 cap with no XP lost,
  costs about 3 hours of level-40 income, one-week cooldown.
- Speed: `speedFactor: 1` (prototype pace). Prefer income too high over too low; price things in hours of play.
- Core-draw pity scales with contribution tier (3 / 4 / 5 / 6 empty kills, top tier to none).
- NPC crewmates (stand-ins) fill at most 50% of a contract, only from Friday until the raid opens.
- Economy is priced in H = one hour of level-40 income (`H`/`ECON` in engine data.ts): raid payout 1.5 H per player at
  full contribution (x1.25 per boss tier), 2.5% of each raid pool to the crew treasury, contracts pay 1.1x item value,
  spec switch 3 H. Any rank can post crew requests. No refund for 3,000g first picks made at 70+ before 2026-11-08.
- Navigation: Workshop, Stores (Mine/Crew), Market, War Room (Loadout/Hunt/Raid), Crew. The log opens as a sheet.
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
- Repo stays public, so no "no redistribution" art packs.
Art and UI
- Cozy pixel art at 32px. Hero built from LPC layers so worn gear shows everywhere. Remap packs to DawnBringer 32.
- Free assets only (CC0 / CC-BY / OGA-BY). Record every pack, author, licence and link in `art/CREDITS.md`
  and the in-game credits screen. Share-alike (CC-BY-SA) LPC Revised tiles are allowed pre-launch, tagged in
  CREDITS so they can be swapped; decide at launch whether to replace them.
- Keep the existing design tokens: plaster background, flat paper panels, woad blue accent, brass for gold,
  rarity inks from common grey to mythic crimson.

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
- Save schema v6; fixtures v4 (prototype), v5 (phase 2), v6 (pre-decision phase 2.5) all load.
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
  activates on user click.
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

Next (after 2.5): UI/UX review (see `docs/phase-2.5-plan.md` "Next"), then phase 3 (art + credits). Phase-3 scope: CC0/CC-BY/OGA-BY
art pack (DawnBringer 32 remap), LPC hero layer composite driven by equipped slots in SceneStrip (the
placeholder goes away), per-action animation variety, `art/CREDITS.md` + in-game credits screen.
