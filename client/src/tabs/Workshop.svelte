<script lang="ts">
  import ItemIcon from '../art/ItemIcon.svelte';
  import { DATA } from '@guildwright/engine';
  import { engine } from '../engine/store.svelte';
  import { engineClient } from '../engine/client';
  import { ui } from '../ui.svelte';
  import { fmtN } from '../format';
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
    for (const s of skillsByTier[picked ?? 'gathering'] ?? []) open[s.id] = true;
  });

  // Accordions: the active job's skill auto-opens; others closed; several may be open.
  let open = $state<Record<string, boolean>>({});
  $effect(() => { if (activeAction) open[activeAction.skill] = true; });

  // "Ready now": prefer actions a fillable contract needs, then highest XP per second.
  let needed = $derived(new Set<string>((view?.contracts ?? []).filter((c: any) => c.status === 'open' && !c.mine && c.canFill?.ok === false && (c.remaining ?? 0) > 0 && c.capacity > 0).map((c: any) => c.itemId)));
  let ready = $derived.by(() => {
    const score = (a: Action) => (outId(a) && needed.has(outId(a)!) ? 1e6 : 0) + (a.xp ?? 0) / Math.max(0.5, timeOf(a) ?? 1);
    return actionsAll.filter((a) => skillOf(a.skill)?.tier === cat && startable(a) && a.id !== activeId).sort((a, b) => score(b) - score(a)).slice(0, 3);
  });

  async function start(id: string) {
    try { await engineClient.start(id); }
    catch (err) { console.error('start failed', err); }
  }
  function toShop() { ui.goTab = 'Shop'; }
  const capNote = (id: string) => (view?.skillProgress?.[id]?.capped ? ' (cap)' : '');
</script>

{#snippet inputsLine(a: Action)}
  {#if a.inputs && Object.keys(a.inputs).length}
    <span class="inputs">
      {#each Object.entries(a.inputs) as [id, n]}
        <button type="button" class="inp num" class:short={have(id) < n} onclick={() => openItem({ itemId: id })}>{n} {itemName(id)} · have {fmtN(have(id))}</button>
      {/each}
    </span>
  {/if}
{/snippet}

{#snippet row(a: Action)}
  {@const out = outId(a)}
  {@const sh = short(a)}
  {@const running = activeId === a.id}
  <li class="arow" class:running>
    <div class="r1">
    <button type="button" class="action main" data-kind={a.kind} data-ic={out ? '1' : undefined} aria-pressed={running} disabled={sh} onclick={() => start(a.id)}>
      {#if out}<span class="aic"><ItemIcon id={out} rarity={itemRarity[out] ?? 'common'} /></span>{/if}
      <span class="a-name" style:color={out ? `var(--r-${itemRarity[out] ?? 'common'})` : undefined}>{out ? itemName(out) : label(a)}{#if out && label(a) !== itemName(out)}<small>{` · ${label(a)}`}</small>{/if}</span>
      <span class="a-meta num">{fmtSec(timeOf(a)) + (a.xp ? ` · ${fmtN(a.xp)} XP` : '')}</span>
    </button>
    {#if out}<button type="button" class="btn info" aria-label="Details: {itemName(out)}" onclick={() => openItem({ itemId: out })}>i</button>{/if}
    {#if sh}
      {@const miss = Object.entries(a.inputs ?? {}).find(([id, n]) => have(id) < n && inShop(id))}
      {#if miss}<button type="button" class="btn shop" onclick={toShop}>Get from Shop</button>{:else}<span class="btn dis" aria-disabled="true">Need items</span>{/if}
    {:else}
      <button type="button" class="btn start" class:primary={!running} disabled={running} onclick={() => start(a.id)}>{running ? 'Running' : 'Start'}</button>
    {/if}
    </div>
    {@render inputsLine(a)}
    {#if reasons[a.id] && !running}<p class="why">{reasons[a.id]}</p>{/if}
  </li>
{/snippet}

<div class="chips" role="group" aria-label="Category">
  {#each CATS as c (c.id)}<button type="button" class="btn chip" aria-pressed={cat === c.id} onclick={() => pickCat(c.id)}>{c.label}</button>{/each}
</div>

{#if ready.length}
  <section class="ready" aria-labelledby="rd-title">
    <h3 id="rd-title">Ready now</h3>
    <ul>
      {#each ready as a (a.id)}
        <li>
          <button type="button" class="action main" data-ic={outId(a) ? '1' : undefined} onclick={() => start(a.id)}>
            {#if outId(a)}<span class="aic"><ItemIcon id={outId(a)!} rarity={itemRarity[outId(a)!] ?? 'common'} /></span>{/if}
            <span class="a-name" style:color={outId(a) ? `var(--r-${itemRarity[outId(a)!] ?? 'common'})` : undefined}>{outId(a) ? itemName(outId(a)!) : a.name}</span>
            <span class="a-meta num">{fmtSec(timeOf(a)) + (a.xp ? ` · ${fmtN(a.xp)} XP` : '')}</span>
          </button>
          {#if outId(a)}<button type="button" class="btn info" aria-label="Details: {itemName(outId(a)!)}" onclick={() => openItem({ itemId: outId(a)! })}>i</button>{/if}
          <button type="button" class="btn primary start" onclick={() => start(a.id)}>Start</button>
        </li>
      {/each}
    </ul>
  </section>
{/if}

{#each skillsByTier[cat] ?? [] as skill (skill.id)}
  {@const lvl = levelOf(skill.id)}
  {@const prog = view?.skillProgress?.[skill.id]}
  {@const acts = actionsBySkill[skill.id] ?? []}
  {@const unlocked = acts.filter((a) => !locked(a))}
  {@const lockedActs = acts.filter((a) => locked(a))}
  {@const can = unlocked.some((a) => startable(a))}
  <section class="skill" class:isopen={!!open[skill.id]}>
    <h4>
      <button type="button" class="head" aria-expanded={!!open[skill.id]} aria-controls="sk-{skill.id}" onclick={() => (open[skill.id] = !open[skill.id])}>
        <span class="sq" aria-hidden="true">{skill.name[0]}</span>
        <span class="mid">
          <span class="skill-name">{skill.name}{#if can}<i class="dot" aria-label="Something can be made now"></i>{/if}</span>
          <span class="xp" role="progressbar" aria-label="{skill.name} XP to next level" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round((prog?.pct ?? 0) * 100)}><i style="width: {Math.round((prog?.pct ?? 0) * 100)}%"></i></span>
        </span>
        <span class="skill-lvl">Lv <span class="num">{lvl}</span>{capNote(skill.id)}</span>
        <span class="chev" aria-hidden="true">{open[skill.id] ? '▾' : '▸'}</span>
      </button>
    </h4>
    {#if open[skill.id]}
      <div id="sk-{skill.id}" class="body">
        <p class="blurb">{skill.blurb}</p>
        <ul class="alist">
          {#each unlocked as a (a.id)}{@render row(a)}{/each}
        </ul>
        {#if lockedActs.length}
          <p class="next">Next: {lockedActs[0].name} <span class="num">{`at Lv ${lockedActs[0].level}${lockedActs.length > 1 ? ` · ${lockedActs.length - 1} more locked` : ''}`}</span></p>
        {/if}
      </div>
    {/if}
  </section>
{/each}

<style>
  .ready { margin: 0 0 12px; padding: 10px; background: var(--paper); border: 1px solid var(--woad); }
  h3 { margin: 0 0 6px; font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3); letter-spacing: .08em; text-transform: uppercase; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .ready li, .r1 { display: flex; gap: 6px; align-items: stretch; }
  .arow { display: grid; gap: 2px; }
  .inputs { display: flex; flex-wrap: wrap; gap: 0 12px; }
  .inp { display: inline-flex; align-items: center; min-height: 44px; padding: 0 2px; border: 0; background: none; font: 400 var(--t-xs)/1.2 var(--f-num); color: var(--ink-3); text-decoration: underline; text-align: left; }
  .chips { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 4px; margin: 0 0 12px; }
  .chip { padding: 0 4px; }

  .skill { margin-bottom: 8px; background: var(--paper); border: 1px solid var(--rule); }
  h4 { margin: 0; }
  .head { width: 100%; min-height: 56px; display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 0; background: transparent; text-align: left; }
  .sq { flex: none; width: 36px; height: 36px; display: grid; place-items: center; border: 2px solid var(--woad); color: var(--woad); background: var(--sunk); font: 700 var(--t-md)/1 var(--f-display); }
  .mid { flex: 1; min-width: 0; display: grid; gap: 6px; }
  .skill-name { font: 600 var(--t-md)/1.1 var(--f-display); color: var(--ink); display: inline-flex; align-items: center; gap: 6px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--brass-fill); display: inline-block; }
  .xp { height: 4px; background: var(--sunk); border: 1px solid var(--rule); overflow: hidden; display: block; }
  .xp i { display: block; height: 100%; background: var(--woad); }
  .skill-lvl { font: 700 var(--t-sm)/1 var(--f-body); color: var(--ink-3); white-space: nowrap; }
  .chev { color: var(--ink-3); width: 12px; }
  .body { padding: 0 10px 10px; }
  .blurb { margin: 0 0 8px; color: var(--ink-2); font-size: var(--t-sm); }
  .next { margin: 8px 0 0; color: var(--ink-3); font-size: var(--t-sm); }

  .action.main {
    flex: 1; min-width: 0; min-height: 44px; display: grid; gap: 2px; align-content: center; text-align: left;
    padding: 6px 10px; border: 1px solid var(--rule); background: var(--sunk);
  }
  .action.main:hover:not(:disabled) { background: var(--woad-soft); border-color: var(--woad); }
  .action.main:disabled { opacity: .85; cursor: not-allowed; }
  .action.main[data-ic] { grid-template-columns: 32px 1fr; column-gap: 8px; align-items: center; }
  .aic { grid-row: 1 / span 2; display: grid; }
  .arow.running .action.main, .action[aria-pressed="true"] { background: var(--woad-soft); border-color: var(--woad); }
  .a-name { font: 700 var(--t-sm)/1.15 var(--f-body); }
  .a-name small { font-weight: 400; color: var(--ink-3); }
  .inp.short { color: var(--bad); font-weight: 700; }
  .a-meta { font-size: var(--t-xs); color: var(--ink-3); font-weight: 700; }
  .info { flex: none; padding: 0; font: 700 var(--t-md)/1 var(--f-body); text-transform: none; }
  .start, .shop, .dis { flex: none; min-width: 72px; padding: 0 8px; }
  .shop { font: 700 var(--t-xs)/1.15 var(--f-body); text-transform: none; letter-spacing: 0; max-width: 84px; }
  .why { margin: 0; color: var(--ink-2); font-size: var(--t-xs); }
  .dis { opacity: .6; font: 700 var(--t-xs)/1.15 var(--f-body); text-transform: none; letter-spacing: 0; }
</style>
