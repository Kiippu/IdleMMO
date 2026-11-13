<script lang="ts">
  // Shop buy sheet with 1 / 10 / Max quick buttons. Inline errors, no toasts.
  import { engineClient } from '../../engine/client';
  import { fmtG } from '../../format';

  import { pushBack } from '../../overlays/backStack.svelte';
  type Props = { s: any; gold: number; detail: string; onClose: () => void; onBought: (qty: number, spent: number) => void };
  let { s, gold, detail, onClose, onBought }: Props = $props();
  $effect(() => pushBack(() => onClose()));

  let max = $derived(Math.max(1, Math.min(s.qty, s.price > 0 ? Math.floor(gold / s.price) : s.qty)));
  let n = $state(1);
  let err = $state('');
  let busy = $state(false);
  const set = (v: number) => { n = Math.max(1, Math.min(max, Math.floor(Number(v)) || 1)); };
  let dlg = $state<HTMLElement | null>(null);
  $effect(() => { queueMicrotask(() => dlg?.querySelector<HTMLElement>('button.primary')?.focus()); });

  async function go() {
    if (busy) return;
    busy = true; err = '';
    try {
      const res: any = await engineClient.storeBuy(s.slot, n);
      if (res.ok === false) { err = res.reason || 'Could not complete.'; return; }
      onBought(n, res.gold);
    } catch (e: any) { err = String(e?.message ?? e); } finally { busy = false; }
  }
  function onKey(ev: KeyboardEvent) {
    if (ev.key === 'Escape') { onClose(); return; }
    if (ev.key !== 'Tab' || !dlg) return;
    const f = [...dlg.querySelectorAll<HTMLElement>('button:not(:disabled), input')];
    if (!f.length) return;
    if (ev.shiftKey && document.activeElement === f[0]) { ev.preventDefault(); f[f.length - 1].focus(); }
    else if (!ev.shiftKey && document.activeElement === f[f.length - 1]) { ev.preventDefault(); f[0].focus(); }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="scrim" onclick={onClose} role="presentation">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="by-title" tabindex="-1" bind:this={dlg} onclick={(e) => e.stopPropagation()}>
    <h2 id="by-title">Buy {s.name}</h2>
    <p class="meta">{detail} <span class="num">{fmtG(s.price)}</span> each.</p>
    <div class="quick" role="group" aria-label="Quantity">
      {#if max >= 11}<button type="button" class="btn" aria-label="Add 10" disabled={n >= max} onclick={() => set(n + 10)}>+10</button>{/if}
      <button type="button" class="btn" aria-pressed={n === max && max > 1} disabled={max < 2} onclick={() => set(max)}>Max <span class="num">{max}</span></button>
    </div>
    <div class="step">
      <button type="button" class="btn" aria-label="Fewer" disabled={n <= 1} onclick={() => set(n - 1)}>−</button>
      <input class="num" type="number" inputmode="numeric" min="1" max={max} value={n} aria-label="Quantity" onchange={(e) => set(Number((e.currentTarget as HTMLInputElement).value))} />
      <button type="button" class="btn" aria-label="More" disabled={n >= max} onclick={() => set(n + 1)}>+</button>
    </div>
    <ul class="sum num"><li>Total {fmtG(n * s.price)}</li><li>Gold after {fmtG(gold - n * s.price)}</li></ul>
    {#if err}<p class="err" role="alert">{err}</p>{/if}
    <div class="actions">
      <button type="button" class="btn ghost" onclick={onClose}>Cancel</button>
      <button type="button" class="btn primary" disabled={busy} onclick={go}>Buy <span class="num">{n}</span></button>
    </div>
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 52; background: var(--scrim); display: flex; align-items: flex-end; justify-content: center; }
  .sheet { width: 100%; max-width: var(--col); display: grid; gap: 10px; padding: 16px var(--gut-r) calc(16px + env(safe-area-inset-bottom, 0px)) var(--gut-l); background: var(--paper); border: 1px solid var(--rule); border-bottom: 0; box-shadow: 0 -8px 24px var(--shadow); }
  h2 { margin: 0; font: 600 var(--t-lg)/1.2 var(--f-display); }
  .meta { margin: 0; color: var(--ink-3); font-size: var(--t-sm); }
  .quick { display: flex; gap: 6px; } .quick .btn { flex: 1; }
  .step { display: grid; grid-template-columns: 52px 1fr 52px; gap: 6px; }
  .step input { text-align: center; }
  .sum { list-style: none; margin: 0; padding: 8px; display: grid; gap: 2px; background: var(--sunk); border: 1px solid var(--rule); color: var(--ink-2); font-size: var(--t-sm); }
  .err { margin: 0; color: var(--bad); font-weight: 700; font-size: var(--t-sm); }
  .actions { display: flex; gap: 8px; justify-content: flex-end; }
</style>
