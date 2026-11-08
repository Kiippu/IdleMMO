<script lang="ts">
  // Placeholder bottom sheet for the event log. Filled in when the engine's event-log API lands.
  type Props = { onClose: () => void };
  let { onClose }: Props = $props();
  let dlg = $state<HTMLElement | null>(null);
  $effect(() => { dlg?.focus(); });
  function onKey(ev: KeyboardEvent) { if (ev.key === 'Escape') onClose(); }
</script>

<svelte:window onkeydown={onKey} />
<div class="scrim" onclick={onClose} role="presentation">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="log-title" tabindex="-1" bind:this={dlg} onclick={(e) => e.stopPropagation()}>
    <header>
      <h2 id="log-title">Log</h2>
      <button type="button" class="btn ghost" onclick={onClose} aria-label="Close">✕</button>
    </header>
    <p>Your recent activity will show here.</p>
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 40; background: var(--scrim); display: flex; align-items: flex-end; justify-content: center; }
  .sheet {
    width: 100%; max-width: var(--col); min-height: 40dvh; max-height: 85dvh; overflow-y: auto; display: grid; gap: 12px; align-content: start;
    padding: 12px var(--gut-r) calc(16px + env(safe-area-inset-bottom, 0px)) var(--gut-l);
    background: var(--paper); border: 1px solid var(--rule); border-bottom: 0; box-shadow: 0 -8px 24px var(--shadow);
  }
  header { display: flex; align-items: center; justify-content: space-between; }
  h2 { margin: 0; font: 600 var(--t-lg)/1.1 var(--f-display); }
  p { margin: 0; color: var(--ink-3); }
</style>
