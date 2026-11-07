<script lang="ts">
  import { engine } from './engine/store.svelte';
  import { initEngineClient, engineClient } from './engine/client';
  import { registerServiceWorker } from './pwa';
  import Workshop from './tabs/Workshop.svelte';
  import CollectReveal from './overlays/CollectReveal.svelte';

  const tabs = ['Workshop', 'Stores', 'Market', 'War Room', 'Crew'] as const;
  type Tab = (typeof tabs)[number];

  let active = $state<Tab>('Workshop');
  let bootError = $state<string | null>(null);
  let updateReady = $state<null | (() => void)>(null);
  let seeded = false;

  $effect(() => {
    void initEngineClient().catch((err) => { bootError = String(err?.message ?? err); });
    registerServiceWorker((restart) => { updateReady = restart; });
  });

  // One-shot: when the engine reports ready, seed the active tab from the
  // engine's defaultTab (raid window → War Room). Manual tab switches after
  // boot are never overridden by subsequent raid-window transitions.
  $effect(() => {
    if (engine.ready && !seeded) {
      seeded = true;
      if (engine.defaultTab === 'raid') active = 'War Room';
    }
  });

  // Visibility: when the tab goes away, pause the worker (also flushes the
  // save). When it returns, resume — the worker runs applyOffline before
  // starting to tick again so catch-up never happens on the main thread.
  $effect(() => {
    if (!engine.ready) return;
    const onVis = () => {
      if (document.hidden) void engineClient.pause();
      else void engineClient.resume();
    };
    const onHide = () => { void engineClient.pause(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
    };
  });

</script>

<div class="shell">
  <header class="topbar">
    <span class="brand">Guildwright</span>
    {#if engine.snapshot}
      <span class="gold">{engine.snapshot.gold}g</span>
    {/if}
  </header>

  {#if updateReady}
    <div class="update">
      <p>A new version is ready.</p>
      <button type="button" onclick={updateReady}>Restart</button>
    </div>
  {/if}

  <main class="panel">
    {#if bootError}
      <h1>Couldn't start.</h1>
      <p class="bad">{bootError}</p>
    {:else if !engine.ready}
      <h1>Loading…</h1>
      <p>Opening the ledger and catching up on your idle time.</p>
    {:else}
      <CollectReveal />
      {#if active === 'Workshop'}
        <Workshop />
      {:else}
        <h1>{active}</h1>
        <p>Placeholder screen. This tab lands in a later slice.</p>
      {/if}
    {/if}
  </main>
</div>

{#if engine.ready && !bootError}
  <nav class="tabbar" aria-label="Main">
    <div class="row">
      {#each tabs as tab}
        <button type="button" aria-current={active === tab ? 'page' : undefined} onclick={() => (active = tab)}>
          {tab}
        </button>
      {/each}
    </div>
  </nav>
{/if}
