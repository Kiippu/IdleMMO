<script lang="ts">
  import { toasts, expireToast } from './toast.svelte';

  const SHOW_MS = 2500;
  let blocked = $state(false);
  const timers = new Map<number, ReturnType<typeof setTimeout>>();

  // A toast is held back while a sheet is open, then shown for 2.5s.
  $effect(() => {
    const check = () => { blocked = !!document.querySelector('[role="dialog"], [role="alertdialog"]'); };
    check();
    const mo = new MutationObserver(check);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  });
  $effect(() => {
    if (blocked) return;
    for (const t of toasts.list) {
      if (!timers.has(t.id)) timers.set(t.id, setTimeout(() => { timers.delete(t.id); expireToast(t.id); }, SHOW_MS));
    }
  });
</script>

<div class="toasts" role="status" aria-live="polite">
  {#if !blocked}{#each toasts.list as t (t.id)}<p class:bad={t.bad}>{t.text}</p>{/each}{/if}
</div>

<style>
  .toasts { position: fixed; left: 0; right: 0; bottom: calc(var(--tabbar-h) + 12px + env(safe-area-inset-bottom, 0px)); z-index: 60; display: grid; gap: 6px; justify-items: center; pointer-events: none; padding: 0 var(--gut-r) 0 var(--gut-l); }
  p { margin: 0; max-width: var(--col); padding: 10px 14px; background: var(--ink); color: var(--paper); font: 700 var(--t-sm)/1.3 var(--f-body); font-variant-numeric: tabular-nums; border: 1px solid var(--rule); box-shadow: 0 4px 16px var(--shadow); }
  p.bad { background: var(--bad); color: var(--paper); }
</style>
