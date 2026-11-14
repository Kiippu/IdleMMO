<script lang="ts">
  // Save-code sheet. For pre-launch testers only: TryCloudflare tunnel URLs
  // rotate on every wrangler restart, so the player exports a GW5 code from
  // the old URL and imports it into the new one. Cloud saves (phase 4) make
  // this obsolete.
  import { engineClient } from '../engine/client';
  import { sheet, confirmSheet } from './confirm.svelte';

  import { pushBack } from './backStack.svelte';
  type Props = { onClose: () => void };
  let { onClose }: Props = $props();
  $effect(() => pushBack(() => onClose()));

  let exportedCode = $state<string | null>(null);
  let copied = $state(false);
  let importText = $state('');
  let importError = $state<string | null>(null);
  let busy = $state(false);

  // Fetch the current save code once when the sheet opens. Re-fetching on
  // every state tick would churn the textarea — the player wants a stable
  // snapshot they can copy.
  $effect(() => {
    engineClient.export().then((c) => { exportedCode = c; }).catch((err) => {
      exportedCode = null;
      importError = String(err?.message ?? err);
    });
  });

  async function copy() {
    if (!exportedCode) return;
    try {
      await navigator.clipboard.writeText(exportedCode);
      copied = true;
      setTimeout(() => { copied = false; }, 1500);
    } catch (err) { console.error('copy failed', err); }
  }

  async function doImport() {
    const code = importText.trim();
    if (!code) { importError = 'Paste a backup code first.'; return; }
    if (!(await confirmSheet({ title: 'Load this backup?', body: 'This replaces your current game. There is no undo.', confirmLabel: 'Load backup', danger: true }))) return;
    importError = null;
    busy = true;
    try {
      await engineClient.import(code);
      // Give the worker a beat to flush its new state into the store.
      setTimeout(() => { busy = false; onClose(); location.reload(); }, 300);
    } catch (err: any) {
      busy = false;
      importError = String(err?.message ?? err);
    }
  }

  async function doReset() {
    if (!(await confirmSheet({ title: 'Start over?', body: 'All progress on this device will be lost. This cannot be undone.', confirmLabel: 'Start over', danger: true }))) return;
    busy = true;
    try {
      await engineClient.reset();
      setTimeout(() => { busy = false; onClose(); location.reload(); }, 300);
    } catch (err) {
      busy = false;
      console.error('reset failed', err);
    }
  }

  function onKey(ev: KeyboardEvent) {
    if (ev.key === 'Escape' && !sheet.opts) onClose();
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="scrim" onclick={onClose} role="presentation">
  <div
    class="sheet"
    role="dialog"
    aria-modal="true"
    aria-labelledby="save-menu-title"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
  >
    <header>
      <h2 id="save-menu-title">Save</h2>
      <button type="button" class="btn ghost" onclick={onClose} aria-label="Close">✕</button>
    </header>

    <p class="meta">Moving to a new link? Export your code first — a new link starts with an empty save.</p>

    <section>
      <h3>Back up your game</h3>
      <p class="meta">Your game saves itself on this device. To play somewhere else, copy this code and paste it into the other device under "Load a backup".</p>
      <textarea readonly rows="5" value={exportedCode ?? 'Preparing…'}></textarea>
      <div class="actions">
        <button type="button" class="btn primary" disabled={!exportedCode} onclick={copy}>
          {copied ? 'Copied' : 'Copy code'}
        </button>
      </div>
      {#if !exportedCode}<p class="why">The code is still being made. Give it a moment.</p>{/if}
    </section>

    <section>
      <h3>Load a backup</h3>
      <p class="meta">Paste a code from another device. This replaces the game on this device and cannot be undone.</p>
      <textarea
        rows="4"
        bind:value={importText}
        placeholder="Paste your code here (it starts with GW5|)"
      ></textarea>
      {#if importError}<p class="bad">{importError}</p>{/if}
      <div class="actions">
        <button type="button" class="btn" disabled={busy || !importText.trim()} onclick={doImport}>
          Load backup
        </button>
      </div>
      {#if !importText.trim()}<p class="why">Paste a code above to turn this on.</p>{/if}
    </section>

    <section class="danger">
      <h3>Start over</h3>
      <p class="meta">Deletes all progress on this device and starts a new game. Copy a backup first if you might want it back.</p>
      <div class="actions left">
        <button type="button" class="btn danger" disabled={busy} onclick={doReset}>Start over</button>
      </div>
    </section>
  </div>
</div>

<style>
  .scrim {
    position: fixed; inset: 0; z-index: 40;
    background: var(--scrim);
    display: flex; align-items: flex-end; justify-content: center;
  }
  .sheet {
    width: 100%; max-width: var(--col); max-height: 80dvh; overflow-y: auto;
    display: grid; gap: 16px; align-content: start;
    padding: 12px var(--gut-r) calc(16px + env(safe-area-inset-bottom, 0px)) var(--gut-l);
    background: var(--paper); border: 1px solid var(--rule); border-bottom: 0;
    box-shadow: 0 -8px 24px var(--shadow);
  }
  header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  header h2 { margin: 0; font: 600 var(--t-lg)/1.1 var(--f-display); color: var(--ink); }

  section h3 {
    margin: 0 0 4px; font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3);
    letter-spacing: .08em; text-transform: uppercase;
  }
  section.danger { margin-top: 8px; }
  .why { margin: 6px 0 0; color: var(--ink-3); font-size: var(--t-xs); text-align: right; }
  .meta { margin: 0 0 8px; color: var(--ink-3); font-size: var(--t-xs); }
  .bad { margin: 6px 0 0; color: var(--bad); font-size: var(--t-sm); }

  textarea {
    width: 100%; padding: 8px; font: 400 var(--t-xs)/1.3 ui-monospace, Menlo, monospace;
    border: 1px solid var(--rule); background: var(--sunk); color: var(--ink);
    resize: vertical;
  }

  .actions { margin-top: 8px; display: flex; justify-content: flex-end; }
  .actions.left { justify-content: flex-start; }

</style>
