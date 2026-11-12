<script lang="ts">
  import ItemIcon from '../art/ItemIcon.svelte';
  import { DATA } from '@guildwright/engine';
  import { engine } from '../engine/store.svelte';
  import { engineClient } from '../engine/client';
  import { ui } from '../ui.svelte';
  import { openItem } from '../overlays/itemRef.svelte';

  type Skill = { id: string; name: string; tier: string; blurb: string };
  type Action = { id: string; skill: string; kind: string; name: string; level?: number; sec?: number; xp?: number; inputs?: Record<string, number>; outputs?: Record<string, number>; enemy?: string };

  const skills: Skill[] = (DATA as any).skills;
  const actionsAll: Action[] = (DATA as any).actions;
  const itemsMap: Record<string, { name?: string }> = (DATA as any).items;
  const itemRarity: Record<string, string> = (DATA as any).itemRarity ?? {};
  const itemName = (id: string) => itemsMap[id]?.name ?? id;

  const CATS = [
    { id: 'gathering', label: 'Gather' }, { id: 'refining', label: 'Refine' },
    { id: 'crafting', label: 'Craft' }, { id: 'combat', label: 'Fight' },
  ] as const;
  const skillsByTier: Record<string, Skill[]> = {};
  for (const s of skills) (skillsByTier[s.tier] ||= []).push(s);
  const actionsBySkill: Record<string, Action[]> = {};
  for (const a of actionsAll) (actionsBySkill[a.skill] ||= []).push(a);
  for (const id of Object.keys(actionsBySkill)) actionsBySkill[id].sort((a, b) => (a.level ?? 1) - (b.level ?? 1));
  const skillOf = (id: string) => skills.find((s) => s.id === id);

  let snapS = $derived(engine.snapshot);
  let view = $derived(engine.derived);
  let activeId = $derived<string | null>(snapS?.active?.actionId ?? null);
  let activeAction = $derived(activeId ? actionsAll.find((a) => a.id === activeId) ?? null : null);
  let inv = $derived<Record<string, number[]>>(snapS?.inv ?? {});
  let reasons = $derived(view?.extras?.disabledReasons?.actions ?? {});
  let storeSlots = $derived<any[]>(view?.extras?.store?.slots ?? []);

  const have = (id: string) => (inv[id] ?? []).reduce((a, b) => a + (b || 0), 0);
  const levelOf = (id: string) => view?.skillLevels?.[id] ?? 0;
  const timeOf = (a: Action) => view?.actionTimes?.[a.id] ?? a.sec;
  const fmtSec = (s: number | undefined) => (s && isFinite(s) ? `${s.toFixed(1)}s` : '—');
  const locked = (a: Action) => levelOf(a.skill) < (a.level ?? 1);
  const short = (a: Action) => Object.entries(a.inputs ?? {}).some(([id, n]) => have(id) < n);
  const startable = (a: Action) => !locked(a) && !short(a);
  const outId = (a: Action) => Object.keys(a.outputs ?? {})[0] ?? null;
  const label = (a: Action) => a.name;
  const inShop = (itemId: string) => storeSlots.some((s) => s.itemId === itemId && s.qty > 0);

  // Category: last explicit choice this session, else the active job's, else Gather.
  let picked = $state<string | null>(ui.wsCat);
  let cat = $derived(picked ?? (activeAction ? skillOf(activeAction.skill)?.tier : null) ?? 'gathering');
  function pickCat(id: string) { picked = id; ui.wsCat = id; }
  // Deep link from the guide: switch category and open its skills.
  $effect(() => {
    if (!ui.wsOpen) return;
    picked = ui.wsCat; ui.wsOpen = false;
  });

  // Guide hooks: the first gather tile you can use, the Copper bar tile, the first craft tile you can make now.
  let guideGather = $derived(actionsAll.find((a) => a.kind === 'gather' && !locked(a))?.id ?? null);
  // First makeable craft; otherwise the unlocked one with the fewest missing inputs (its sheet shows what is missing).
  let guideCraft = $derived.by(() => {
    const crafts = actionsAll.filter((a) => a.kind === 'craft' && !locked(a));
    const ok = crafts.find((a) => startable(a));
    if (ok) return ok.id;
    const miss = (a: Action) => Object.entries(a.inputs ?? {}).reduce((t, [id, n]) => t + Math.max(0, n - have(id)) / n, 0);
    return [...crafts].sort((a, b) => miss(a) - miss(b))[0]?.id ?? null;
  });
  const guideOf = (a: Action) => (a.id === guideGather ? 'gather' : a.id === 'smelt_copper' ? 'refine' : a.id === guideCraft ? 'craft' : undefined);

  // Recently unlocked (levelled into, not yet dismissed).
  let recent = $derived<Action[]>((view?.extras?.recentUnlocks ?? []).map((id: string) => actionsAll.find((a) => a.id === id)).filter((a): a is Action => !!a));
  async function dismissRecent() {
    try { await engineClient.dismissUnlocks(recent.map((a) => a.id)); } catch (err) { console.error('dismiss failed', err); }
  }
  const openAction = (a: Action) => openItem({ itemId: outId(a) ?? '', actionId: a.id });
  const capNote = (id: string) => (view?.skillProgress?.[id]?.capped ? ' (cap)' : '');
</script>

{#snippet tile(a: Action)}
  {@const out = outId(a)}
  {@const sh = short(a)}
  {@const running = activeId === a.id}
  <button type="button" class="tile" class:running class:dim={sh} data-kind={a.kind} data-guide={guideOf(a)} aria-pressed={running}
    aria-label="{out ? itemName(out) : a.name}{running ? ', running' : ''}{sh ? ', missing materials' : ''}" onclick={() => openAction(a)}>
    <span class="slot" style:border-color={running ? undefined : out ? `var(--r-${itemRarity[out] ?? 'common'})` : undefined}>
      {#if out}<ItemIcon id={out} rarity={itemRarity[out] ?? 'common'} />{:else}<ItemIcon named="fight:{a.id}" />{/if}
      {#if sh}<i class="mark" aria-hidden="true">!</i>{/if}
      {#if running}<i class="run" aria-hidden="true"></i>{/if}
    </span>
    <span class="tn">{out ? itemName(out) : (a.enemy as any)?.name ?? a.name}</span>
  </button>
{/snippet}

<div class="chips" role="group" aria-label="Category">
  {#each CATS as c (c.id)}<button type="button" class="btn chip" aria-pressed={cat === c.id} onclick={() => pickCat(c.id)}>{c.label}</button>{/each}
</div>

{#if recent.length}
  <section class="recent" aria-labelledby="ru-title">
    <div class="rh"><h3 id="ru-title">Recently unlocked</h3><button type="button" class="btn ghost x" aria-label="Dismiss recently unlocked" onclick={dismissRecent}>×</button></div>
    <div class="grid">{#each recent as a (a.id)}{@render tile(a)}{/each}</div>
  </section>
{/if}

{#if (skillsByTier[cat] ?? []).some((sk) => (actionsBySkill[sk.id] ?? []).some((a) => !locked(a) && short(a)))}
  <p class="legend"><i class="mark" aria-hidden="true">!</i> = missing materials. Tap the tile to see what is needed.</p>
{/if}

{#each skillsByTier[cat] ?? [] as skill (skill.id)}
  {@const lvl = levelOf(skill.id)}
  {@const prog = view?.skillProgress?.[skill.id]}
  {@const acts = actionsBySkill[skill.id] ?? []}
  {@const unlocked = acts.filter((a) => !locked(a))}
  {@const lockedActs = acts.filter((a) => locked(a))}
  <section class="skill">
    <h4>
      <span class="sq" aria-hidden="true"><ItemIcon skill={skill.id} /></span>
      <span class="skill-name">{skill.name}</span>
      <span class="skill-lvl">Lv <span class="num">{lvl}</span>{capNote(skill.id)}</span>
      <span class="xp" role="progressbar" aria-label="{skill.name} XP to next level" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round((prog?.pct ?? 0) * 100)}><i style="width: {Math.round((prog?.pct ?? 0) * 100)}%"></i></span>
    </h4>
    <div class="grid">{#each unlocked as a (a.id)}{@render tile(a)}{/each}</div>
    {#if lockedActs.length}
      <p class="next">Next: {lockedActs[0].name} <span class="num">{`at Lv ${lockedActs[0].level}${lockedActs.length > 1 ? ` · ${lockedActs.length - 1} more locked` : ''}`}</span></p>
    {/if}
  </section>
{/each}

<style>
  .chips { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 4px; margin: 0 0 12px; }
  .chip { padding: 0 4px; }
  h3 { margin: 0; font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3); letter-spacing: .08em; text-transform: uppercase; }
  .recent { margin: 0 0 12px; padding: 8px 10px 10px; background: var(--paper); border: 1px solid var(--woad); display: grid; gap: 6px; }
  .rh { display: flex; align-items: center; justify-content: space-between; }
  .x { width: 44px; padding: 0; font-size: var(--t-lg); }
  .skill { margin-bottom: 8px; padding: 8px 10px 10px; background: var(--paper); border: 1px solid var(--rule); display: grid; gap: 8px; }
  h4 { margin: 0; display: grid; grid-template-columns: 32px 1fr auto; grid-template-areas: "i n l" "i x x"; column-gap: 10px; row-gap: 4px; align-items: center; }
  .sq { grid-area: i; width: 32px; height: 32px; display: grid; place-items: center; }
  .skill-name { grid-area: n; font: 600 var(--t-md)/1.1 var(--f-display); color: var(--ink); }
  .skill-lvl { grid-area: l; font: 700 var(--t-sm)/1 var(--f-body); color: var(--ink-3); white-space: nowrap; }
  .xp { grid-area: x; height: 4px; background: var(--sunk); border: 1px solid var(--rule); overflow: hidden; display: block; }
  .xp i { display: block; height: 100%; background: var(--woad); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(56px, 1fr)); gap: 6px 4px; }
  .tile { min-height: 44px; padding: 2px 0 0; display: grid; justify-items: center; align-content: start; gap: 2px; border: 0; background: none; color: var(--ink); }
  .slot { position: relative; width: 44px; height: 44px; display: grid; place-items: center; background: var(--sunk); border: 2px solid var(--rule); }
  .tile.dim .slot { opacity: .5; }
  .tile.running .slot { border-color: var(--woad); box-shadow: 0 0 0 2px var(--woad-soft), 0 0 0 3px var(--woad); }
  .mark { position: absolute; right: -4px; top: -4px; width: 14px; height: 14px; display: grid; place-items: center; background: var(--brass-fill); color: var(--ink); font: 700 10px/1 var(--f-num); font-style: normal; border: 1px solid var(--ink); }
  .run { position: absolute; left: 2px; right: 2px; bottom: 2px; height: 3px; background: var(--woad); animation: runbar 1.4s ease-in-out infinite; transform-origin: left; }
  @keyframes runbar { 0% { transform: scaleX(.1); } 100% { transform: scaleX(1); } }
  @media (prefers-reduced-motion: reduce) { .run { animation: none; } }
  .tn { max-width: 100%; font: 400 11px/1.1 var(--f-body); color: var(--ink-2); text-align: center; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
  .legend { margin: 0 0 8px; display: flex; align-items: center; gap: 6px; color: var(--ink-3); font-size: var(--t-xs); }
  .legend .mark { position: static; flex: none; }
  .next { margin: 0; color: var(--ink-3); font-size: var(--t-sm); }
</style>
