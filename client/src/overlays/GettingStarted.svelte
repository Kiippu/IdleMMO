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
  {#if !guide.done[STEPS[0].id]}
    <!-- Fresh save: one clear thing to do. -->
    <section class="card fresh" aria-labelledby="gs-title">
      <h2 id="gs-title">Welcome to the guild</h2>
      <button type="button" class="btn primary first" onclick={() => showMe(next.tab, next.selector, next.subs ?? {})}>
        <span class="lbl">Do this first</span><span class="what">{next.text}</span>
      </button>
      <p class="after">Then: {STEPS.slice(1, 4).map((s) => s.text.toLowerCase()).join(', ')} and more. A guide line will keep you on track.</p>
    </section>
  {:else}
    <section class="line" aria-label="Getting started">
      <span class="tx"><span class="num">{doneCount}/{STEPS.length}</span> Next: {next.text}</span>
      <button type="button" class="btn" onclick={() => showMe(next.tab, next.selector, next.subs ?? {})}>Show me</button>
      <button type="button" class="btn ghost" onclick={dismissGuide} aria-label="Dismiss getting started">✕</button>
    </section>
  {/if}
{/if}

<style>
  .card { margin: 0 0 12px; padding: 12px; background: var(--woad-soft); border: 1px solid var(--woad); display: grid; gap: 8px; }
  h2 { margin: 0; font: 600 var(--t-md)/1.2 var(--f-display); }
  .first { min-height: 64px; display: grid; gap: 2px; justify-items: center; padding: 8px 12px; }
  .first .lbl { font: 400 var(--t-xs)/1 var(--f-label); letter-spacing: .08em; text-transform: uppercase; opacity: .85; }
  .first .what { font: 700 var(--t-lg)/1.1 var(--f-body); text-transform: none; letter-spacing: 0; }
  .after { margin: 0; color: var(--ink-2); font-size: var(--t-xs); }
  .line { min-height: 44px; display: flex; align-items: center; gap: 6px; margin: 0 0 12px; padding: 0 0 0 10px; background: var(--woad-soft); border: 1px solid var(--woad); }
  .line .tx { flex: 1; min-width: 0; padding: 4px 0; font-size: var(--t-sm); line-height: 1.25; color: var(--ink); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .line .num { color: var(--ink-2); margin-right: 4px; }
  .line .btn { padding: 0 10px; }
</style>
