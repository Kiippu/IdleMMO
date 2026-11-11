<script lang="ts">
    import TopStrip from './TopStrip.svelte';
  import LogSheet from './overlays/LogSheet.svelte';
  import { engine } from './engine/store.svelte';
  import { initEngineClient, engineClient } from './engine/client';
  import { registerServiceWorker } from './pwa';
  import Workshop from './tabs/Workshop.svelte';
  import Stores from './tabs/Stores.svelte';
  import WarRoom from './tabs/WarRoom.svelte';
  import Store from './tabs/Store.svelte';
  import Toast from './overlays/Toast.svelte';
  import { ui } from './ui.svelte';
  import { toast } from './overlays/toasts.svelte';
  import GettingStarted from './overlays/GettingStarted.svelte';
  import WorkshopScene from './scene/WorkshopScene.svelte';
  import Crew from './tabs/Crew.svelte';
  import CollectReveal from './overlays/CollectReveal.svelte';
  import MenuSheet from './overlays/MenuSheet.svelte';
  import SaveMenu from './overlays/SaveMenu.svelte';
  import ConfirmSheet from './overlays/ConfirmSheet.svelte';
  import ItemSheet from './overlays/ItemSheet.svelte';
  import SalvageSheet from './overlays/SalvageSheet.svelte';

  import icoWorkshop from './ui-art/tab-workshop.png';
  import icoStores from './ui-art/tab-stores.png';
  import icoShop from './ui-art/tab-shop.png';
  import icoWar from './ui-art/tab-war.png';
  import icoCrew from './ui-art/tab-crew.png';
  const tabs = ['Workshop', 'Stores', 'Shop', 'War Room', 'Crew'] as const;
  const tabIcon: Record<(typeof tabs)[number], string> = { Workshop: icoWorkshop, Stores: icoStores, Shop: icoShop, 'War Room': icoWar, Crew: icoCrew };
  type Tab = (typeof tabs)[number];

  let active = $state<Tab>('Workshop');
  let bootError = $state<string | null>(null);
  let updateReady = $state<null | (() => void)>(null);
  let saveMenuOpen = $state(false);
  let logOpen = $state(false);
  let menuOpen = $state(false);
  let seeded = false;
  $effect(() => { if (ui.goTab) { active = ui.goTab as Tab; ui.goTab = null; } });

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

  // Toast a line for new crew activity that is not yours. The first read and big catch-up batches only set the baseline.
  const seenFeed = new Set<string>();
  let feedPrimed = false;
  $effect(() => {
    const feed = engine.derived?.extras?.crewActivity;
    if (!engine.ready || !feed) return;
    const fresh = feed.filter((e) => !seenFeed.has(`${e.t}|${e.who}|${e.text}`));
    feed.forEach((e) => seenFeed.add(`${e.t}|${e.who}|${e.text}`));
    if (!feedPrimed) { feedPrimed = true; return; }
    if (engine.offline) return;
    const theirs = fresh.filter((e) => !e.mine);
    if (theirs.length === 0 || theirs.length > 3) return;
    const e = theirs[0];
    toast(theirs.length > 1 ? `${e.full ?? `${e.who}: ${e.text}`} (+${theirs.length - 1} more in Crew)` : (e.full ?? `${e.who}: ${e.text}`));
  });

  // Tab badges from existing snapshot/derived data only. `n` is shown as a number; no `n` means a plain dot.
  type Badge = { n?: number; text: string };
  let badges = $derived.by(() => {
    const out: Partial<Record<Tab, Badge>> = {};
    if (!engine.ready) return out;
    if (!engine.snapshot?.active) out['Workshop'] = { text: 'Nothing is running' };
    const r = engine.derived?.raidStatus;
    if (r) {
      if (r.phase === 'live' && !r.sittingOut) out['War Room'] = { n: 1, text: 'Raid is live' };
      else if (r.phase === 'prep' && !r.locked) out['War Room'] = { n: 1, text: 'You have not locked in for the raid' };
    }
    const n = (engine.derived?.contracts ?? []).filter((c: any) => c.status === 'open' && !c.mine && c.canFill?.ok && Math.min(c.remaining ?? 0, c.have ?? 0, c.capacity ?? Infinity) >= 1).length;
    if (n > 0) out['Crew'] = { n, text: `${n} ${n === 1 ? 'contract' : 'contracts'} you can fill` };
    return out;
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
  {#if engine.ready}
    <TopStrip onMenu={() => (menuOpen = true)} onStart={() => (active = 'Workshop')} />
  {/if}

  {#if updateReady}
    <div class="update">
      <p>A new version is ready.</p>
      <button type="button" class="btn primary" onclick={updateReady}>Restart</button>
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
        <WorkshopScene />
        <GettingStarted />
        <Workshop />
      {:else if active === 'Stores'}
        <Stores />
      {:else if active === 'War Room'}
        <WarRoom />
      {:else if active === 'Shop'}
        <Store onContracts={() => { ui.crewSub = 'contracts'; active = 'Crew'; }} />
      {:else if active === 'Crew'}
        <Crew />
      {/if}
    {/if}
  </main>
</div>

<ItemSheet />
<SalvageSheet />
<ConfirmSheet />
<Toast />

{#if menuOpen}
  <MenuSheet onClose={() => (menuOpen = false)} onLog={() => (logOpen = true)} onSave={() => (saveMenuOpen = true)} />
{/if}

{#if logOpen}
  <LogSheet onClose={() => (logOpen = false)} />
{/if}

{#if saveMenuOpen}
  <SaveMenu onClose={() => (saveMenuOpen = false)} />
{/if}

{#if engine.ready && !bootError}
  <nav class="tabbar" aria-label="Main">
    <div class="row">
      {#each tabs as tab}
        <button type="button" aria-current={active === tab ? 'page' : undefined} onclick={() => (active = tab)}>
          <img class="ico" src={tabIcon[tab]} alt="" width="32" height="32" /><span class="lbl">{tab}</span>{#if badges[tab]}{#if badges[tab].n != null}<span class="count num" aria-hidden="true">{badges[tab].n > 9 ? '9+' : badges[tab].n}</span>{:else}<span class="dot" aria-hidden="true"></span>{/if}<span class="sr">{badges[tab].text}</span>{/if}
        </button>
      {/each}
    </div>
  </nav>
{/if}
