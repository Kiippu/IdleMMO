<script lang="ts">
  // One menu for the rarely used things: Log, Save, Credits, Settings.
  import { settings, setSetting } from '../settings.svelte';
  import { CRAFT_RARITIES, type CraftRarity } from '../settings-core';
  const SHORT: Record<CraftRarity, string> = { uncommon: 'Unc', rare: 'Rare', epic: 'Epic', legendary: 'Leg', mythic: 'Myth' };
  const toggleCard = (r: CraftRarity) => setSetting('craftCards', { ...settings.craftCards, [r]: !settings.craftCards[r] });
  import { CREDITS } from '../art/credits';

  import { pushBack } from './backStack.svelte';
  type Props = { onClose: () => void; onLog: () => void; onSave: () => void };
  let { onClose, onLog, onSave }: Props = $props();

  const hostOf = (u: string) => u.replace(/^https?:\/\//, '').replace(/\/$/, '');
  let view = $state<'menu' | 'credits' | 'settings'>('menu');
  // Back = Escape: up one level inside Settings/Credits, then close.
  $effect(() => pushBack(() => { if (view === 'menu') onClose(); else view = 'menu'; }));
  let dlg = $state<HTMLElement | null>(null);
  $effect(() => { view; dlg?.focus(); });

  const title = $derived(view === 'menu' ? 'Menu' : view === 'credits' ? 'Credits' : 'Settings');
  function onKey(ev: KeyboardEvent) {
    if (ev.key === 'Escape') { if (view === 'menu') onClose(); else view = 'menu'; return; }
    if (ev.key !== 'Tab' || !dlg) return;
    const f = [...dlg.querySelectorAll<HTMLElement>('button:not(:disabled)')];
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (ev.shiftKey && (document.activeElement === first || document.activeElement === dlg)) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  }
  const go = (fn: () => void) => { onClose(); fn(); };
</script>

<svelte:window onkeydown={onKey} />
<div class="scrim" onclick={onClose} role="presentation">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="menu-title" tabindex="-1" bind:this={dlg} onclick={(e) => e.stopPropagation()}>
    <header>
      {#if view !== 'menu'}<button type="button" class="btn ghost" onclick={() => (view = 'menu')} aria-label="Back to menu">←</button>{/if}
      <h2 id="menu-title">{title}</h2>
      <button type="button" class="btn ghost close" onclick={onClose} aria-label="Close">✕</button>
    </header>

    {#if view === 'menu'}
      <ul class="items">
        <li><button type="button" class="item" onclick={() => go(onLog)}><span>Log</span><small>What you found and earned</small></button></li>
        <li><button type="button" class="item" onclick={() => go(onSave)}><span>Save</span><small>Back up or move your game</small></button></li>
        <li><button type="button" class="item" onclick={() => (view = 'settings')}><span>Settings</span><small>Theme, sound, motion and craft cards</small></button></li>
        <li><button type="button" class="item" onclick={() => (view = 'credits')}><span>Credits</span><small>Art, fonts and licences</small></button></li>
      </ul>
    {:else if view === 'settings'}
      <ul class="items">
        <li class="theme">
          <span id="theme-l">Theme</span><small>Dark is the default.</small>
          <div class="seg" role="group" aria-labelledby="theme-l">
            <button type="button" class="btn" aria-pressed={settings.theme === 'dark'} onclick={() => setSetting('theme', 'dark')}>Dark</button>
            <button type="button" class="btn" aria-pressed={settings.theme === 'light'} onclick={() => setSetting('theme', 'light')}>Light</button>
          </div>
        </li>
        <li>
          <button type="button" class="item toggle" role="switch" aria-checked={settings.muted} onclick={() => setSetting('muted', !settings.muted)}>
            <span>Mute sound</span><small>{settings.muted ? 'On. The game stays quiet.' : 'Off. Soft taps, chimes and level-ups.'}</small>
            <b class="sw" class:on={settings.muted} aria-hidden="true">{settings.muted ? 'On' : 'Off'}</b>
          </button>
        </li>
        <li>
          <button type="button" class="item toggle" role="switch" aria-checked={settings.reduceMotion} onclick={() => setSetting('reduceMotion', !settings.reduceMotion)}>
            <span>Reduce motion</span><small>{settings.reduceMotion ? 'On. No floating text, flashes or count-ups.' : 'Off. Your device setting still applies.'}</small>
            <b class="sw" class:on={settings.reduceMotion} aria-hidden="true">{settings.reduceMotion ? 'On' : 'Off'}</b>
          </button>
        </li>
        <li class="cc">
          <span id="cc-l">Craft celebration</span>
          <div class="chips" role="group" aria-labelledby="cc-l">
            {#each CRAFT_RARITIES as r (r)}
              <button type="button" class="chip" style:--ink-r={`var(--r-${r})`} aria-pressed={settings.craftCards[r]} aria-label={r[0].toUpperCase() + r.slice(1)} onclick={() => toggleCard(r)}>{SHORT[r]}</button>
            {/each}
          </div>
          <small>Show the full-screen card for these crafts.</small>
        </li>
      </ul>
    {:else}
      <div class="credits">
        <p>Everything here is free to use. Tap a name to open its page. Art is remapped to the DawnBringer 32 palette.</p>
        <ul class="crl">
          {#each CREDITS as c (c.asset)}
            <li>
              {#if c.url}<a class="nm" href={c.url} target="_blank" rel="noopener noreferrer">{c.asset}</a>{:else}<b class="own">{c.asset}</b>{/if}
              <span>{c.author} · {c.licence}{c.shareAlike ? ' · share-alike' : ''}</span>
              {#if c.note}<small>{c.note}</small>{/if}
              {#if c.urls.length > 1 && c.urls.length <= 3}
                <span class="links">{#each c.urls as u (u)}<a href={u} target="_blank" rel="noopener noreferrer">{hostOf(u)}</a>{/each}</span>
              {:else if c.url}<small class="host">{hostOf(c.url)}</small>{/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 40; background: var(--scrim); display: flex; align-items: flex-end; justify-content: center; }
  .sheet {
    width: 100%; max-width: var(--col); max-height: 80dvh; overflow-y: auto; display: flex; flex-direction: column; gap: 12px;
    padding: 12px var(--gut-r) calc(16px + env(safe-area-inset-bottom, 0px)) var(--gut-l);
    background: var(--paper); border: 1px solid var(--rule); border-bottom: 0; box-shadow: 0 -8px 24px var(--shadow);
  }
  header { display: flex; align-items: center; gap: 8px; }
  h2 { margin: 0; font: 600 var(--t-lg)/1.1 var(--f-display); flex: 1; }
  .items { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .item {
    width: 100%; min-height: 56px; display: grid; gap: 2px; align-content: center; text-align: left; padding: 8px 12px;
    border: 1px solid var(--rule); background: var(--sunk); color: var(--ink);
  }
  .item:hover { background: var(--woad-soft); border-color: var(--woad); }
  .item span { font: 700 var(--t-md)/1.1 var(--f-body); }
  .item small { color: var(--ink-3); font-size: var(--t-xs); }
  .theme { display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; align-items: center; min-height: 56px; padding: 8px 12px; border: 1px solid var(--rule); background: var(--sunk); }
  .theme span { font: 700 var(--t-md)/1.1 var(--f-body); }
  .theme small { grid-column: 1; color: var(--ink-3); font-size: var(--t-xs); }
  .theme .seg { grid-column: 2; grid-row: 1 / span 2; display: flex; }
  .theme .seg .btn { min-width: 64px; }
  .toggle { grid-template-columns: 1fr auto; }
  .toggle small { grid-column: 1; }
  .sw { grid-row: 1 / span 2; grid-column: 2; align-self: center; min-width: 48px; text-align: center; padding: 6px 8px; border: 1px solid var(--rule); background: var(--paper); color: var(--ink-2); font: 700 var(--t-sm)/1 var(--f-body); }
  .sw.on { background: var(--woad); border-color: var(--woad); color: var(--on-woad); }
  .cc { display: grid; gap: 6px; padding: 8px 12px; border: 1px solid var(--rule); background: var(--sunk); }
  .cc span { font: 700 var(--t-md)/1.1 var(--f-body); }
  .cc small { color: var(--ink-3); font-size: var(--t-xs); }
  .chips { display: flex; gap: 6px; }
  .chip { flex: 1; min-width: 44px; min-height: 44px; padding: 0 4px; border: 1px solid var(--rule); background: var(--paper); color: var(--ink-3); font: 700 var(--t-sm)/1 var(--f-body); }
  .chip[aria-pressed='true'] { border: 2px solid var(--ink-r); color: var(--ink-r); background: color-mix(in srgb, var(--ink-r) 16%, var(--paper)); }
  .credits { color: var(--ink-2); font-size: var(--t-sm); }
  .credits p { margin: 0 0 12px; }
  .crl { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .crl li { display: grid; gap: 2px; padding: 8px 10px; background: var(--sunk); border: 1px solid var(--rule); }
  .crl b { color: var(--ink); font-weight: 700; }
  .crl .links { display: flex; flex-wrap: wrap; gap: 4px 16px; }
  .crl .links a { display: inline-flex; align-items: center; min-height: 44px; color: var(--woad); font-size: var(--t-xs); text-decoration: underline; overflow-wrap: anywhere; }
  .crl small { color: var(--ink-3); font-size: var(--t-xs); }
  .crl a.nm { display: flex; align-items: center; min-height: 44px; color: var(--woad); font-weight: 700; text-decoration: underline; overflow-wrap: anywhere; }
</style>
