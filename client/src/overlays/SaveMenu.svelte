<script lang="ts">
  // Save-code sheet. For pre-launch testers only: TryCloudflare tunnel URLs
  // rotate on every wrangler restart, so the player exports a GW5 code from
  // the old URL and imports it into the new one. Cloud saves (phase 4) make
  // this obsolete.
  import { engineClient } from '../engine/client';
  import { sheet, confirmSheet } from './confirm.svelte';

  type Props = { onClose: () => void };
  let { onClose }: Props = $props();

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
    if (!code) { importError = 'Paste a save code first.'; return; }
    if (!(await confirmSheet({ title: 'Import this save?', body: 'Importing replaces your current save. There is no undo.', confirmLabel: 'Import', danger: true }))) return;
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
    if (!(await confirmSheet({ title: 'Reset your save?', body: 'All progress will be lost. This cannot be undone.', confirmLabel: 'Reset save', danger: true }))) return;
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

    <section>
      <h3>Your save code</h3>
      <p class="meta">Paste this into another install to pick up where you left off.</p>
      <textarea readonly rows="6" value={exportedCode ?? 'Preparing…'}></textarea>
      <div class="actions">
        <button type="button" class="btn" disabled={!exportedCode} onclick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </section>

    <section>
      <h3>Import a save code</h3>
      <p class="meta">Replaces your current save. There is no undo.</p>
      <textarea
        rows="4"
        bind:value={importText}
        placeholder="Paste a GW5|… code here"
      ></textarea>
      {#if importError}<p class="bad">{importError}</p>{/if}
      <div class="actions">
        <button type="button" class="btn primary" disabled={busy || !importText.trim()} onclick={doImport}>
          Import
        </button>
      </div>
    </section>

    <section class="danger">
      <h3>Reset save</h3>
      <p class="meta">Wipes everything and starts over. The engine will mint a fresh state on next boot.</p>
      <div class="actions">
        <button type="button" class="btn danger" disabled={busy} onclick={doReset}>Reset save</button>
      </div>
    </section>
  </div>
</div>

<style>
  .scrim {
    position: fixed; inset: 0; z-index: 30;
    background: var(--scrim);
    display: flex; align-items: flex-start; justify-content: center;
    padding: 24px 12px calc(var(--tabbar-h) + 24px);
    overflow-y: auto;
  }
  .sheet {
    width: 100%; max-width: var(--col);
    display: grid; gap: 16px; padding: 16px;
    background: var(--paper); border: 1px solid var(--rule);
    box-shadow: 0 8px 24px var(--shadow);
  }
  header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  header h2 { margin: 0; font: 600 var(--t-lg)/1.1 var(--f-display); color: var(--ink); }

  section h3 {
    margin: 0 0 4px; font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3);
    letter-spacing: .08em; text-transform: uppercase;
  }
  section.danger { border-top: 1px solid var(--rule); padding-top: 12px; }
  .meta { margin: 0 0 8px; color: var(--ink-3); font-size: var(--t-xs); }
  .bad { margin: 6px 0 0; color: var(--bad); font-size: var(--t-sm); }

  textarea {
    width: 100%; padding: 8px; font: 400 var(--t-xs)/1.3 ui-monospace, Menlo, monospace;
    border: 1px solid var(--rule); background: var(--sunk); color: var(--ink);
    resize: vertical;
  }

  .actions { margin-top: 8px; display: flex; justify-content: flex-end; }

</style>
