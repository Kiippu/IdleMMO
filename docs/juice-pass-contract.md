# Juice pass (branch `ui/juice-pass`): shared rules and interfaces

Four agents work at the same time in `/home/claude/kiippu/idlemmo` on branch `ui/juice-pass`.

## Ground rules (all agents)
- Edit ONLY the files your brief says you own. You can READ anything. If you need a change in a file you don't own,
  message the owner (SendMessage to their name) or tell main in your final report.
- Do NOT run git commit/checkout/stash/reset/clean. Main commits per area.
- Do NOT run `npm run build`. Use `npm run typecheck -w @guildwright/client`, `npm run test -w @guildwright/engine`,
  `npm run test -w @guildwright/client`. Errors in files you don't own are expected while others work; ignore them.
- Visual checks: run vite on your own port (`npx vite --port <yours> --strictPort` inside client/) and use Python
  Playwright (`python3`, chromium) at 360x780 and 390x844, dark and light. Kill your server when done.
  Ports: ui-workshop 5181, ui-panels 5182, ui-juice 5183.
- Keep v7 saves loading. New save fields must be additive and optional (no schema bump).
- No dev shortcuts, no browser dialogs, buttons >= 44px, numbers in `--f-num` (Atkinson), gold written like `6g`.
- Design tokens only (plaster, paper, woad, brass, rarity inks). Component styles go in the component's own <style>;
  only ui-juice edits `client/src/app.css`.
- Toasts are being removed. `toast()` stays exported as a no-op until the end; remove every call in files you own and
  show feedback inline (button state, line in the sheet, the fountain) instead. Real errors: inline message near the
  control that failed.

## Owner decisions (2026-11-12)
1. When a job ends it ends. The slot stays empty until the player picks a new job. No auto-resume, no "start next job".
2. Crafting and refining ask "how many".
3. Guide: replace "Lock in for the raid" with "Hand in bread to a contract".
4. Dark mode is the default; light is an option in Settings.
5. Fix the review issues.
Plus the Workshop/top bar/War Room/juice/screen-space requests in each brief.

## Interfaces (rules agent implements; UI agents code against these)
- `engineClient.start(actionId: string, count?: number | null)` — `count` = number of reps; null/undefined = keep going
  (current behaviour: until stopped, or until inputs run out). When the count is reached the job stops with a
  `stopped` event `{ type: 'stopped', reason: string, done: true }`.
- `snapshot.active.left?: number` — reps left when a count was given.
- `derived.extras.maxMake: Record<actionId, number | null>` — how many reps the bag can pay for right now (null = no
  inputs needed, e.g. gather/fight).
- `derived.extras.readiness: { req: number; power: { guardian: number; mender: number; striker: number };
  bestRole: 'guardian'|'mender'|'striker'; best: number; ok: boolean; tips: string[] }`.
- `derived.crewJobs[i].reward: { xp: number; skill: string; gold: number; items: Array<{ itemId: string; qty: number }> }`
  — what one assist rep / finishing gives you.
- `derived.crewMembers[i].npc: boolean` — stand-in crewmates.
- `derived.treasuryLog[i].kind: string` — includes `'escrow'` and `'release'` for gold moved to/from contract escrow
  (not spent), so the UI can show it neutral.
- `derived.extras.recentUnlocks: string[]` — action ids unlocked by levelling that the player hasn't dismissed
  (never the level-1 starters). `engineClient.dismissUnlocks(actionIds: string[])` hides them for good (saved).
- `gain` engine event, emitted with the existing events, delivered in `engine.lastEvents`:
  `{ type: 'gain', source: 'gather'|'refine'|'craft'|'combat'|'assist'|'buy'|'salvage'|'raid'|'other',
     items: Array<{ itemId: string; qty: number; grade?: number; rarity: 'common'|'uncommon'|'rare'|'epic'|'legendary'|'mythic'; uid?: string }>,
     offline?: true }`
  One event per real gain. Never for selling, equipping/unequipping, loadout swaps or contract hand-ins.
  Offline catch-up gains carry `offline: true` (the return reveal shows those).

## Shared guide hooks (`data-guide` attributes)
ui-workshop owns the guide; the owners of each screen put these attributes on the target element:
- `data-guide="gather"` first Workshop gather tile (ui-workshop)
- `data-guide="sell"` first row of the Shop's sell list (ui-panels)
- `data-guide="refine"` Copper bar tile in Workshop › Refine (ui-workshop)
- `data-guide="craft"` first craftable tile in Workshop › Craft (ui-workshop)
- `data-guide="equip"` first gear row in the War Room gear inventory (ui-panels)
- `data-guide="assist"` first enabled Assist button in Crew › Jobs (ui-panels)
- `data-guide="contract"` the Bread contract's hand-in button in Crew › Contracts (ui-panels)
Guide deep-link targets: Shop sell view, War Room `war: 'loadout'`, Crew `crew: 'jobs'` / `crew: 'contracts'`
(see `showMe` in `client/src/ui.svelte.ts`).
