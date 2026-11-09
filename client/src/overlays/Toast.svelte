<script lang="ts">
  import { toasts } from './toast.svelte';
</script>

<div class="toasts" role="status" aria-live="polite">
  {#each toasts.list as t (t.id)}<p class:bad={t.bad}>{t.text}</p>{/each}
</div>

<style>
  .toasts { position: fixed; left: 0; right: 0; bottom: calc(var(--tabbar-h) + 12px + env(safe-area-inset-bottom, 0px)); z-index: 60; display: grid; gap: 6px; justify-items: center; pointer-events: none; padding: 0 var(--gut-r) 0 var(--gut-l); }
  p { margin: 0; max-width: var(--col); padding: 10px 14px; background: var(--ink); color: var(--paper); font: 700 var(--t-sm)/1.3 var(--f-body); font-variant-numeric: tabular-nums; border: 1px solid var(--rule); box-shadow: 0 4px 16px var(--shadow); }
  p.bad { background: var(--bad); color: var(--paper); }
</style>
