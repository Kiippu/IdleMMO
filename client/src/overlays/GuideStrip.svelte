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
  let spare = $derived(((snap?.gear ?? []) as any[]).some((g) => !Object.values(snap?.equipped ?? {}).includes(g.uid) && (DATA as any).items[g.itemId]?.section === 'fight'));
  let shown = $derived(next ? resolveStep(next, spare) : null);
  let doneCount = $derived(STEPS.filter((s) => guide.done[s.id]).length);
</script>

{#if engine.ready && !guide.dismissed && next && guide.done[STEPS[0].id]}
  <section class="line" aria-label="Getting started">
    <span class="tx"><span class="num">{doneCount}/{STEPS.length}</span> {shown?.text}</span>
    <button type="button" class="btn" onclick={() => shown && showMe(shown.tab, shown.selector, shown.subs ?? {})}>Show me</button>
    <button type="button" class="btn ghost x" onclick={dismissGuide} aria-label="Dismiss getting started">✕</button>
  </section>
{/if}

<style>
  .line { height: 48px; box-sizing: border-box; display: flex; align-items: center; gap: 6px; margin: 6px 0 0; padding: 0 0 0 10px; background: var(--woad-soft); border: 1px solid var(--woad); }
  .line .tx { flex: 1; min-width: 0; font-size: var(--t-xs); line-height: 1.2; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .line .num { color: var(--ink-2); margin-right: 4px; }
  .line .btn { padding: 0 8px; flex: none; }
  .line .x { width: 44px; padding: 0; }
</style>
