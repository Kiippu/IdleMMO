# Phase 2.5 — rules fixes (before the UI/UX review and phase 3 art)

Decided 2026-11-08 (option C): fix the game rules now; fold the UX losses into the phase 3 UI/art pass.
Work is done by Claude from claude.ai against this folder, not by Claude Code.

## Fixes
1. **Town contracts.** A contract lists what the coming raid needs (items + qty), paid in gold or reputation
   from the crew/guild treasury (gold can be spent anywhere). Submitted resources go only to crew/guild stock.
   Add engine verbs + a client screen (Crew tab, Contracts sub-tab) to view and fill contracts.
2. **Specialization switch.** No XP lost: the old skill is capped at level 70 for *effective* level, XP is kept
   (switching back restores it). ~3,000g, one-week cooldown, allowed for free players. Reachable from the UI.
   Cooldown message in days/hours, not seconds.
3. **Treasury log covers every movement:** contract fills, vault deposits/withdrawals (items and gear), escrow,
   raid stock used, raid payouts. Fix the ledger date (`entry.t`, not `entry.at`) and show item rows as item × qty.
   "Crew gold" shows free + escrowed.
4. **Core-draw odds retuned** without tokens: drop the +0.8 token share from `serverTickets`
   (engine/src/raid-payouts.ts) and re-check the expected cores per player.
5. **Contract stock raises contribution.** Vault food/potions used to heal and buff a member count toward that
   member's contribution. The raid draws only what it needs, not the whole stock.
6. **Speed matches the prototype artifact** (owner liked it): `speedFactor: 1`; keep offline at 12 h, 10%.
   Action list and active card must show the same time per rep.
7. **Remove dev shortcuts:** War Room "start raid now" on any day (`startRaidNow`/`canStartNow`), the
   "canStartNow" developer text, the "Week 1 · result?" placeholder.

## Cut (not in the design; owner doesn't want them)
Farm raids, the "view as member" rank toggle, NPC auto-posted requisitions.

## Smaller fixes in the same pass
Market header "Buyer listings" → "For sale"; roster "You you"; selected action text contrast;
PORTING.md out of date (supply board).

## Checks
- Engine + client tests pass; new tests for 1–5 and 7; v4 saves still load; v5 saves from phase 2 still load.
- Build the client and check the live tunnel at phone width in light and dark mode.
- node_modules on the PC is installed for Windows; Linux-side work uses a separate copy with its own install.

## Next
After 2.5: a full UI/UX review of how the game should *present like a game* (art, layout, feedback, the
lost UX-review items: top bar, workshop rows with inputs/icons, market time-to-gather + search/filter/sort,
raid screen portrait/weakness/chest thresholds, bag grid, item sheet, crew feed, guided first hour,
log sheet). Then phase 3 art.
