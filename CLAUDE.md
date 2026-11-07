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
- Builds must keep existing player saves working (save schema v4 in localStorage today; `migrate()` handles v1, v3).
- Test at phone width (max 460px column) in light and dark mode.

## Settled decisions (don't reopen unless asked)
Game design
- Currency is "gold", written "g" in prices (e.g. 6g). Never "coin".
- No premium currency. The bond token ($5, 14 days of membership) is the only bridge between cash and gold.
- Town contracts list what the raid needs and pay gold or reputation. The gold comes from the crew/guild treasury
  and can be spent anywhere.
- Resources submitted through contracts go only to crew/guild stock and are used in raids to heal and buff members,
  which raises their contribution.
- Every gold and resource movement in a treasury is logged; all crew/guild members can see the log.
- Raid gold payouts scale with turnout and contribution, capped per crew.
- Server supply board and war chest are dropped. Raid tokens are dropped: core tickets come only from turnout
  (floor) and contribution tier; retune the core-draw odds.
- One idle action slot per player. Helping a crewmate uses it.
- Specialization switch: allowed for free players, old skill drops to the level-70 cap with no XP lost,
  costs about 3,000 gold, one-week cooldown.
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

## Current state (2026-11-07) — phase 1 complete on `rebuild/phase-1`
Branch cut from phase-0 merge (`a22a399` on main). Engine: `npm run test -w @guildwright/engine` is green —
**40/40** (migration + single-slot + crew roster + spec switch + speed factor + 5 legacy-selftest seeds).
`npm run typecheck -w @guildwright/engine` is clean. Phase 1 gate per roadmap ("new rule tests pass; v4 saves
still load") is met.

Design decisions confirmed in session 2026-11-07 against the game design doc (claude.ai artifact
c3d56c6e-...): currency = gold only (no premium, no raid tokens); town contracts = existing requisition
system; crew vault items consumed in raids as hybrid pool (food + heal potions → crew food survival; buff
potions → crew check multiplier capped at +50%; weakness potions → extra mitigation); treasury payout =
`min(cap × bossTier, perAttendee × bossTier × attendCount × avgContribution)` where avgContribution =
crewHave / crewNeed clamped 0..1; crew roster = 4 authored NPCs (Merrick/Aldis/Branka/Osric) with
smelting/carpentry/smithing/tailoring specs; speed factor = 10x (anchored to the design doc's "1000g/hr
at level 40" combat target).

Phase 1 commits (11 on `rebuild/phase-1`, bottom-up):
- `ab376a9` phase-0 parity harness removed (fixtures + scenarios + record-fixtures + parity.test; 16→5 tests)
- `33f0448` schema v4 → v5 + supply board dropped (`state.supply`, `supply.ts`, generateSupply, cfg)
- `a1d16a5` raid tokens dropped (`state.tokens`, `raid.rules.tokens`, `rec.tokens`); core odds = floor+tier
- `68e4c26` coin → gold end-to-end (schema + API + config + migration folds)
- `c5a9aa8` treasury audit log (`state.crew.treasury.log`, cap 80) + `ensureV4 → ensureV5` rename
- `f8d1358` crew vault consumption in raids + payout by turnout × contribution
- `2437f49` D1: single-slot invariant test (engine was already correct by construction)
- `a8b5632` G: remove `E.devSetClock` and the "already raided this week" auto-advance
- `6c9b8a7` D2: specialization switch (3000g cost, 7-day cooldown, old-skill XP clamped to level 70)
- `320bf54` E: NPC crewmate stand-ins — four authored members, roster cap 10
- `444c0c8` F: real-speed tuning via `cfg.speedFactor` (default 10x; one knob to retune)

Next: phase 2 (Solo PWA — Svelte rebuild of the five tabs, IndexedDB saves v5 with v4 import, save export
code, catch-up worker, collect reveal, 160x64 scene strip + LPC hero, installable). Start by merging phase 1
to main (not done yet — branch still unpushed as of this edit), then cut `rebuild/phase-2`.

Not reverified on this Windows checkout: `wrangler dev` + `/api/health` + `--test-scheduled` (workerd crashed
in Linux VM during phase 0). Pick up when a server change lands.
`.npmrc` still sets `legacy-peer-deps=true` to dodge an npm 10.9 vitest install crash.
