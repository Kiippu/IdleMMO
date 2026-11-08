<script lang="ts">
  // The one bottom sheet for confirmations, quantity picks, name prompts and notices.
  import { sheet, closeSheet } from './confirm.svelte';

  let opts = $derived(sheet.opts);
  let num = $state(1);
  let str = $state('');
  let dlg = $state<HTMLElement | null>(null);
  let returnTo: Element | null = null;

  // Reset fields whenever a new request opens; remember where focus was.
  $effect(() => {
    if (!opts) return;
    num = opts.number?.value ?? 1;
    str = opts.text?.value ?? '';
    returnTo = document.activeElement;
    queueMicrotask(() => {
      const first = dlg?.querySelector<HTMLElement>('input') ?? dlg?.querySelector<HTMLElement>('.btn.primary, .btn.solid, .btn');
      first?.focus();
      if (first instanceof HTMLInputElement) first.select();
    });
    return () => { (returnTo as HTMLElement | null)?.focus?.(); };
  });

  const clamp = (n: number) => {
    const o = opts?.number;
    if (!o) return n;
    return Math.max(o.min, Math.min(o.max, Math.floor(Number.isFinite(n) ? n : o.min)));
  };
  function confirm() {
    if (!opts) return;
    if (opts.number) closeSheet({ value: clamp(num) });
    else if (opts.text) closeSheet({ value: str.trim() });
    else closeSheet({ value: null });
  }
  function cancel() { closeSheet(null); }

  function onKey(ev: KeyboardEvent) {
    if (!opts) return;
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); cancel(); return; }
    if (ev.key === 'Enter' && (ev.target as HTMLElement)?.tagName === 'INPUT') { ev.preventDefault(); confirm(); return; }
    if (ev.key !== 'Tab' || !dlg) return;
    const f = [...dlg.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, textarea, [tabindex]:not([tabindex="-1"])')];
    if (f.length === 0) return;
    const first = f[0], last = f[f.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    else if (!dlg.contains(document.activeElement)) { ev.preventDefault(); first.focus(); }
  }
</script>

<svelte:window onkeydown={onKey} />

{#if opts}
  <div class="scrim" onclick={cancel} role="presentation">
    <div
      class="sheet"
      role={opts.cancelLabel === null ? 'alertdialog' : 'dialog'}
      aria-modal="true"
      aria-labelledby="cs-title"
      aria-describedby={opts.body ? 'cs-body' : undefined}
      tabindex="-1"
      bind:this={dlg}
      onclick={(e) => e.stopPropagation()}
    >
      <h2 id="cs-title">{opts.title}</h2>
      {#if opts.body}<p id="cs-body">{opts.body}</p>{/if}

      {#if opts.number}
        {@const o = opts.number}
        <div class="field">
          {#if o.label}<label for="cs-num">{o.label}</label>{/if}
          <div class="stepper">
            <button type="button" class="btn" aria-label="Decrease" disabled={clamp(num) <= o.min} onclick={() => (num = clamp(num) - 1)}>−</button>
            <input id="cs-num" type="number" inputmode="numeric" min={o.min} max={o.max} step="1" bind:value={num} onblur={() => (num = clamp(num))} />
            <button type="button" class="btn" aria-label="Increase" disabled={clamp(num) >= o.max} onclick={() => (num = clamp(num) + 1)}>+</button>
          </div>
          <span class="range num">{o.min}–{o.max}{o.suffix ? ` ${o.suffix}` : ''}</span>
        </div>
      {:else if opts.text}
        <div class="field">
          {#if opts.text.label}<label for="cs-text">{opts.text.label}</label>{/if}
          <input id="cs-text" type="text" bind:value={str} placeholder={opts.text.placeholder} maxlength={opts.text.maxLength ?? 40} />
        </div>
      {/if}

      <div class="actions">
        {#if opts.cancelLabel !== null}
          <button type="button" class="btn ghost" onclick={cancel}>{opts.cancelLabel ?? 'Cancel'}</button>
        {/if}
        <button type="button" class="btn {opts.danger ? 'danger solid' : 'primary'}" onclick={confirm}>{opts.confirmLabel ?? 'Confirm'}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: fixed; inset: 0; z-index: 50; background: var(--scrim);
    display: flex; align-items: flex-end; justify-content: center;
  }
  .sheet {
    width: 100%; max-width: var(--col); display: grid; gap: 12px;
    padding: 16px var(--gut-r) calc(16px + env(safe-area-inset-bottom, 0px)) var(--gut-l);
    background: var(--paper); border: 1px solid var(--rule); border-bottom: 0;
    box-shadow: 0 -8px 24px var(--shadow);
    max-height: 90dvh; overflow-y: auto;
    animation: up 160ms ease-out;
  }
  @keyframes up { from { transform: translateY(24px); opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .sheet { animation: none; } }
  h2 { margin: 0; font: 600 var(--t-lg)/1.2 var(--f-display); color: var(--ink); }
  p { margin: 0; color: var(--ink-2); font-size: var(--t-md); }
  .field { display: grid; gap: 6px; }
  label { font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3); letter-spacing: .04em; text-transform: uppercase; }
  .stepper { display: grid; grid-template-columns: 44px 1fr 44px; gap: 8px; }
  .stepper input { text-align: center; width: 100%; }
  .range { color: var(--ink-3); font-size: var(--t-sm); text-align: center; }
  input[type="text"] { width: 100%; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
  .actions .btn { flex: 1 1 120px; }
</style>
