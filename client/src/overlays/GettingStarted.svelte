<script lang="ts">
  import { DATA } from '@guildwright/engine';
  import { engine } from '../engine/store.svelte';
  import { guide, markDone, dismissGuide, setBaseEquipped, STEPS, nextStep, resolveStep } from '../guide.svelte';
  import { showMe } from '../ui.svelte';
  import { engineClient } from '../engine/client';

  const actions: Array<{ id: string; kind: string; skill?: string; level?: number; outputs?: Record<string, number> }> = (DATA as any).actions;
  const kindOf = (k: string) => actions.filter((a) => a.kind === k).map((a) => a.id);
  const gatherIds = kindOf('gather'), craftIds = kindOf('craft');
  const refineIds = ['smelt_copper'];

  let snap = $derived(engine.snapshot);
  // Auto-tick from state. Once ticked a step stays ticked.
  $effect(() => {
    if (!snap) return;
    const m = snap.mastery ?? {};
    if (gatherIds.some((id) => (m[id] ?? 0) > 0)) markDone('gather');
    if (refineIds.some((id) => (m[id] ?? 0) > 0)) markDone('refine');
    if (craftIds.some((id) => (m[id] ?? 0) > 0)) markDone('craft');
    const eq = Object.values(snap.equipped ?? {}).filter(Boolean) as string[];
    if (guide.baseEquipped == null) setBaseEquipped(eq);
    else if (eq.some((u) => !guide.baseEquipped!.includes(u))) markDone('equip');
    if ((engine.derived?.treasuryLog ?? []).some((e: any) => e.kind === 'contract' && e.who === 'You' && e.itemId === 'bread')) markDone('contract');
  });
  let next = $derived(nextStep());
  let spare = $derived(((snap?.gear ?? []) as any[]).some((g) => !Object.values(snap?.equipped ?? {}).includes(g.uid) && (DATA as any).items[g.itemId]?.slot));
  let shown = $derived(next ? resolveStep(next, spare) : null);
  // The welcome button starts the first gather straight away (one tap); the guide then advances by itself.
  async function begin() {
    if (!next) return;
    if (next.id === 'gather') {
      const a = actions.find((x) => x.kind === 'gather' && (x.level ?? 1) <= 1);
      if (a) { try { await engineClient.start(a.id); } catch (e) { console.error(e); } }
    }
    showMe(next.tab, next.selector, next.subs ?? {});
  }
  let doneCount = $derived(STEPS.filter((s) => guide.done[s.id]).length);
</script>

{#if !guide.dismissed && next}
  {#if !guide.done[STEPS[0].id]}
    <!-- Fresh save: one clear thing to do. -->
    <section class="card fresh" aria-label="Welcome to the guild">
      <span class="tx">Welcome! Start here.</span>
      <button type="button" class="btn primary first" onclick={begin}>Gather copper ore</button>
    </section>
  {:else}
    <section class="line" aria-label="Getting started">
      <span class="tx"><span class="num">{doneCount}/{STEPS.length}</span> Next: {shown?.text}</span>
      <button type="button" class="btn" onclick={() => shown && showMe(shown.tab, shown.selector, shown.subs ?? {})}>Show me</button>
      <button type="button" class="btn ghost" onclick={dismissGuide} aria-label="Dismiss getting started">✕</button>
    </section>
  {/if}
{/if}

<style>
  .card { margin: 0 0 12px; padding: 6px 6px 6px 12px; background: var(--woad-soft); border: 1px solid var(--woad); display: flex; align-items: center; gap: 8px; }
  .card .tx { flex: 1; min-width: 0; font: 600 var(--t-sm)/1.2 var(--f-body); }
  .first { flex: none; padding: 0 12px; }
  .line { min-height: 44px; display: flex; align-items: center; gap: 6px; margin: 0 0 12px; padding: 0 0 0 10px; background: var(--woad-soft); border: 1px solid var(--woad); }
  .line .tx { flex: 1; min-width: 0; padding: 4px 0; font-size: var(--t-sm); line-height: 1.25; color: var(--ink); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .line .num { color: var(--ink-2); margin-right: 4px; }
  .line .btn { padding: 0 10px; }
</style>
