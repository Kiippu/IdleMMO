<script lang="ts">
  import { DATA } from '@guildwright/engine';
  import { engine } from '../engine/store.svelte';
  import { guide, markDone, dismissGuide, setBaseEquipped, STEPS, nextStep } from '../guide.svelte';
  import { showMe } from '../ui.svelte';

  const actions: Array<{ id: string; kind: string }> = (DATA as any).actions;
  const kindOf = (k: string) => actions.filter((a) => a.kind === k).map((a) => a.id);
  const gatherIds = kindOf('gather'), craftIds = kindOf('craft');

  let snap = $derived(engine.snapshot);
  // Auto-tick from state. Once ticked a step stays ticked.
  $effect(() => {
    if (!snap) return;
    const m = snap.mastery ?? {};
    if (gatherIds.some((id) => (m[id] ?? 0) > 0)) markDone('gather');
    if (craftIds.some((id) => (m[id] ?? 0) > 0)) markDone('craft');
    const eq = Object.values(snap.equipped ?? {}).filter(Boolean) as string[];
    if (guide.baseEquipped == null) setBaseEquipped(eq);
    else if (eq.some((u) => !guide.baseEquipped!.includes(u))) markDone('equip');
    if (engine.derived?.raidStatus?.locked) markDone('lock');
  });
  let doneCount = $derived(STEPS.filter((s) => guide.done[s.id]).length);
  let next = $derived(nextStep());
</script>

{#if !guide.dismissed && next}
  <section class="card" aria-labelledby="gs-title">
    <header>
      <h2 id="gs-title">Getting started <span class="num">{doneCount}/{STEPS.length}</span></h2>
      <button type="button" class="btn ghost" onclick={dismissGuide} aria-label="Dismiss getting started">✕</button>
    </header>
    <ol>
      {#each STEPS as s (s.id)}
        <li class:done={guide.done[s.id]}>
          <span class="tick" aria-hidden="true">{guide.done[s.id] ? '✓' : ''}</span>
          <span class="tx">{s.text}{#if guide.done[s.id]}<span class="sr"> (done)</span>{/if}</span>
          {#if !guide.done[s.id]}<button type="button" class="btn" onclick={() => showMe(s.tab, s.selector, s.subs ?? {})}>Show me</button>{/if}
        </li>
      {/each}
    </ol>
  </section>
{/if}

<style>
  .card { margin: 0 0 16px; padding: 12px; background: var(--woad-soft); border: 1px solid var(--woad); }
  header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  h2 { margin: 0; font: 600 var(--t-md)/1.2 var(--f-display); }
  h2 .num { font-family: var(--f-num); color: var(--ink-2); }
  ol { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 4px; }
  li { display: flex; align-items: center; gap: 8px; min-height: 44px; }
  .tick { flex: none; width: 22px; height: 22px; display: grid; place-items: center; border: 1px solid var(--woad); background: var(--paper); color: var(--ok); font-weight: 700; }
  .tx { flex: 1; min-width: 0; font-size: var(--t-sm); color: var(--ink); }
  li.done .tx { color: var(--ink-3); text-decoration: line-through; }
  .btn { padding: 0 10px; }
</style>
