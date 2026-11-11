<script lang="ts">
  // Workshop-only scene: the pixel scene plus floating "+n Item" text on each completed rep.
  import { untrack } from 'svelte';
  import { DATA } from '@guildwright/engine';
  import { engine } from '../engine/store.svelte';
  import { reducedMotion } from '../settings.svelte';
  import SceneStrip from './SceneStrip.svelte';
  import JobBar from './JobBar.svelte';

  // Floating "+n Item" over the scene on each completed rep while the app is open.
  const itemsMap: Record<string, { name?: string }> = (DATA as any).items;
  const itemRarity: Record<string, string> = (DATA as any).itemRarity ?? {};
  let floats = $state<Array<{ id: number; text: string; rarity: string }>>([]);
  let floatId = 0;
  const reduced = reducedMotion;
  $effect(() => {
    const evs = engine.lastEvents;
    if (!evs?.length || reduced() || document.hidden) return;
    untrack(() => {
    for (const e of evs) {
      if (e.type !== 'complete') continue;
      for (const it of (e.items ?? []).slice(0, 2)) {
        const id = ++floatId;
        floats.push({ id, text: `+${it.qty} ${itemsMap[it.itemId]?.name ?? it.itemId}`, rarity: itemRarity[it.itemId] ?? 'common' });
        setTimeout(() => { floats = floats.filter((f) => f.id !== id); }, 800);
      }
    }
    if (floats.length > 4) floats = floats.slice(-4);
    });
  });

</script>

<div class="scene">
  <SceneStrip />
  {#each floats as f (f.id)}<span class="float" style:border-left-color={`var(--r-${f.rarity})`}>{f.text}</span>{/each}
</div>
<JobBar />

<style>
  .scene { position: relative; margin: 0; }
  .float {
    position: absolute; left: 50%; top: 4px; transform: translateX(-50%); white-space: nowrap; pointer-events: none;
    padding: 2px 6px; background: var(--paper); color: var(--ink); border: 1px solid var(--ink); border-left-width: 4px; font: 700 var(--t-xs)/1.2 var(--f-num);
    animation: floatup 800ms ease-out forwards; z-index: 2;
  }
  @keyframes floatup { from { opacity: 1; transform: translate(-50%, 0); } to { opacity: 0; transform: translate(-50%, -6px); } }
  @media (prefers-reduced-motion: reduce) { .float { display: none; } }
</style>
