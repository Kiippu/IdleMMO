<script lang="ts">
  import ItemIcon from '../art/ItemIcon.svelte';
  import { DATA } from '@guildwright/engine';
  import { engine } from '../engine/store.svelte';
  import { engineClient } from '../engine/client';
  import { fmtN, fmtSecs } from '../format';
  import { quantity, closeQuantity } from './quantity.svelte';

  const actions: any[] = (DATA as any).actions;
  const itemsMap: Record<string, { name?: string }> = (DATA as any).items;
  const itemRarity: Record<string, string> = (DATA as any).itemRarity ?? {};
  const itemName = (id: string) => itemsMap[id]?.name ?? id;

  let a = $derived(quantity.actionId ? actions.find((x) => x.id === quantity.actionId) ?? null : null);
  let snap = $derived(engine.snapshot);
  let view = $derived(engine.derived);
  const have = (id: string) => (snap?.inv?.[id] ?? []).reduce((x: number, y: number) => x + (y || 0), 0);
  let max = $derived<number>(a ? (view?.extras?.maxMake?.[a.id] ?? 9999) : 0);
  let per = $derived<number>(a ? (view?.actionTimes?.[a.id] ?? a.sec ?? 0) : 0);
  let n = $state(1);
  let untilOut = $state(false);
  let err = $state('');
  let stops = $derived.by(() => {
    const cur = snap?.active?.actionId;
    return cur && a && cur !== a.id ? (actions.find((x) => x.id === cur)?.name ?? null) : null;
  });
  $effect(() => { if (a) { n = Math.max(1, Math.min(1, max)); untilOut = false; err = ''; } });
  let count = $derived(untilOut ? Math.max(max, 0) : Math.min(n, Math.max(max, 0)));
  const set = (v: number) => { untilOut = false; n = Math.max(1, Math.min(Math.max(1, max), Math.floor(v) || 1)); };

  async function go() {
    if (!a || max < 1) return;
    err = '';
    try {
      await engineClient.start(a.id, untilOut ? null : count);
      closeQuantity();
    } catch (e: any) { err = String(e?.message ?? e); }
  }
  function onKey(ev: KeyboardEvent) { if (a && ev.key === 'Escape') { ev.stopPropagation(); closeQuantity(); } }
</script>

<svelte:window onkeydown={onKey} />

{#if a}
  <div class="scrim" onclick={closeQuantity} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="q-title" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <h2 id="q-title">How many?</h2>
      <p class="meta">{a.name}{max < 1 ? ' · you are out of materials' : ''}</p>
      <div class="step">
        <button type="button" class="btn" aria-label="Fewer" disabled={max < 1 || (!untilOut && count <= 1)} onclick={() => set((untilOut ? max : n) - 1)}>−</button>
        <input class="num" type="number" inputmode="numeric" min="1" max={Math.max(1, max)} value={count} aria-label="Quantity" onchange={(e) => set(Number((e.currentTarget as HTMLInputElement).value))} />
        <button type="button" class="btn" aria-label="More" disabled={max < 1 || (!untilOut && count >= max)} onclick={() => set((untilOut ? max : n) + 1)}>+</button>
      </div>
      <div class="quick" role="group" aria-label="Quick amounts">
        <button type="button" class="btn" aria-label="Add 10" disabled={max < 1 || (!untilOut && count >= max)} onclick={() => set((untilOut ? max : n) + 10)}>+10</button>
        <button type="button" class="btn" aria-pressed={!untilOut && n >= max && max > 0} disabled={max < 1} onclick={() => set(max)}>Max <span class="num">{fmtN(Math.max(max, 0))}</span></button>
        <button type="button" class="btn" aria-pressed={untilOut} disabled={max < 1} onclick={() => (untilOut = true)}>Until out</button>
      </div>
      <p class="sum">Total time <b class="num">{fmtSecs(count * per)}</b>{untilOut ? ' (until materials run out)' : ''}</p>
      <ul class="use">
        {#each Object.entries((a.inputs ?? {}) as Record<string, number>) as [id, k]}
          <li><span class="ic"><ItemIcon {id} rarity={itemRarity[id] ?? 'common'} /></span><span>{itemName(id)}</span><b class="num" class:short={count * k > have(id)}>{fmtN(count * k)} of {fmtN(have(id))}</b></li>
        {/each}
      </ul>
      {#if stops}<p class="meta">This stops {stops}.</p>{/if}
      {#if err}<p class="err" role="alert">{err}</p>{/if}
      <div class="actions">
        <button type="button" class="btn ghost" onclick={closeQuantity}>Cancel</button>
        <button type="button" class="btn primary" disabled={max < 1} onclick={go}>{stops ? `Start · stops ${stops}` : 'Start'}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 50; background: var(--scrim); display: flex; align-items: flex-end; justify-content: center; }
  .sheet { width: 100%; max-width: var(--col); display: grid; gap: 10px; padding: 16px var(--gut-r) calc(16px + env(safe-area-inset-bottom, 0px)) var(--gut-l); background: var(--paper); border: 1px solid var(--rule); border-bottom: 0; box-shadow: 0 -8px 24px var(--shadow); }
  h2 { margin: 0; font: 600 var(--t-lg)/1.2 var(--f-display); }
  .meta { margin: 0; color: var(--ink-3); font-size: var(--t-sm); }
  .quick { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .quick .btn { padding: 0 4px; }
  .quick .btn[aria-pressed="true"] { background: var(--woad-soft); border-color: var(--woad); }
  .step { display: flex; gap: 8px; justify-content: center; align-items: center; }
  .step .btn { width: 56px; padding: 0; font-size: var(--t-lg); }
  .step input { width: 96px; min-height: 44px; text-align: center; font: 700 var(--t-lg)/1 var(--f-num); background: var(--sunk); color: var(--ink); border: 1px solid var(--rule); }
  .sum { margin: 0; text-align: center; font-size: var(--t-sm); color: var(--ink-2); }
  .use { list-style: none; margin: 0; padding: 8px 10px; display: grid; gap: 4px; background: var(--sunk); border: 1px solid var(--rule-2); }
  .use li { display: flex; align-items: center; gap: 8px; font-size: var(--t-sm); }
  .use li span:nth-child(2) { flex: 1; }
  .ic { display: grid; }
  .short { color: var(--bad); }
  .err { margin: 0; color: var(--bad); font-size: var(--t-sm); }
  .actions { display: flex; gap: 8px; justify-content: flex-end; }
</style>
