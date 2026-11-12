<script lang="ts">
  import { DATA } from '@guildwright/engine';
  import { guide, STEPS, nextStep } from '../guide.svelte';
  import { showMe } from '../ui.svelte';
  import { engineClient } from '../engine/client';

  const actions: Array<{ id: string; kind: string; skill?: string; level?: number; outputs?: Record<string, number> }> = (DATA as any).actions;
  // The welcome button starts the first gather straight away (one tap); the guide strip then takes over.
  async function begin() {
    if (!next) return;
    const a = actions.find((x) => x.kind === 'gather' && (x.level ?? 1) <= 1);
    if (a) { try { await engineClient.start(a.id); } catch (e) { console.error(e); } }
    showMe(next.tab, next.selector, next.subs ?? {});
  }
  let next = $derived(nextStep());
</script>

{#if !guide.dismissed && next && !guide.done[STEPS[0].id]}
  <section class="card fresh" aria-label="Welcome to the guild">
    <span class="tx">Welcome! Start here.</span>
    <button type="button" class="btn primary first" onclick={begin}>Gather copper ore</button>
  </section>
{/if}

<style>
  .card { margin: 0 0 12px; padding: 6px 6px 6px 12px; background: var(--woad-soft); border: 1px solid var(--woad); display: flex; align-items: center; gap: 8px; }
  .card .tx { flex: 1; min-width: 0; font: 600 var(--t-sm)/1.2 var(--f-body); }
  .first { flex: none; padding: 0 12px; }
</style>
