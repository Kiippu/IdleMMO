<script lang="ts">
  // One menu for the rarely used things: Log, Save, Credits, Settings.
  import { settings, setSetting } from '../settings.svelte';
  import { CREDITS } from '../art/credits';

  type Props = { onClose: () => void; onLog: () => void; onSave: () => void };
  let { onClose, onLog, onSave }: Props = $props();

  let view = $state<'menu' | 'credits' | 'settings'>('menu');
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
        <li><button type="button" class="item" onclick={() => (view = 'settings')}><span>Settings</span><small>Sound and motion</small></button></li>
        <li><button type="button" class="item" onclick={() => (view = 'credits')}><span>Credits</span><small>Art, fonts and licences</small></button></li>
      </ul>
    {:else if view === 'settings'}
      <ul class="items">
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
      </ul>
    {:else}
      <div class="credits">
        <p>Everything here is free to use. Tap a name to open its page. Art is remapped to the DawnBringer 32 palette.</p>
        <ul class="crl">
          {#each CREDITS as c (c.asset)}
            <li>
              <b>{c.asset}</b>
              <span>{c.author} · {c.licence}{c.shareAlike ? ' · share-alike' : ''}</span>
              {#if c.note}<small>{c.note}</small>{/if}
              {#if c.url}<a href={c.url} target="_blank" rel="noopener noreferrer">{c.url.replace(/^https?:\/\//, '')}</a>{/if}
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
  .toggle { grid-template-columns: 1fr auto; }
  .toggle small { grid-column: 1; }
  .sw { grid-row: 1 / span 2; grid-column: 2; align-self: center; min-width: 48px; text-align: center; padding: 6px 8px; border: 1px solid var(--rule); background: var(--paper); color: var(--ink-2); font: 700 var(--t-sm)/1 var(--f-body); }
  .sw.on { background: var(--woad); border-color: var(--woad); color: var(--on-woad); }
  .credits { color: var(--ink-2); font-size: var(--t-sm); }
  .credits p { margin: 0 0 12px; }
  .crl { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .crl li { display: grid; gap: 2px; padding: 8px 10px; background: var(--sunk); border: 1px solid var(--rule); }
  .crl b { color: var(--ink); font-weight: 700; }
  .crl small { color: var(--ink-3); font-size: var(--t-xs); }
  .crl a { display: inline-flex; align-items: center; min-height: 44px; color: var(--woad); overflow-wrap: anywhere; }
</style>
