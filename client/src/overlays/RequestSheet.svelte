<script lang="ts">
  // Post a crew request (paid from your own escrowed gold). Opens from Crew > Contracts "+ Request".
  import { DATA } from '@guildwright/engine';
  import { engineClient } from '../engine/client';
  import { fmtG } from '../format';

  type Props = { gold: number; onClose: () => void; onDone: (text: string) => void };
  let { gold, onClose, onDone }: Props = $props();

  const itemsMap: Record<string, { id?: string; name?: string; kind?: string }> = (DATA as any).items;
  const sellable = Object.values(itemsMap).filter((i) => i.kind !== 'gear' && i.id).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  const GRADES = ['Any grade', 'Fine+', 'Sharp+', 'Keen+', 'Pristine'];

  let item = $state(''); let grade = $state(0); let qty = $state(10); let reward = $state(5);
  let err = $state('');
  let escrow = $derived(Math.max(0, Math.floor(qty || 0)) * Math.max(0, Math.floor(reward || 0)));
  let valid = $derived(!!item && qty >= 1 && qty <= 500 && reward >= 1 && escrow <= gold);
  let dlg = $state<HTMLElement | null>(null);
  $effect(() => { dlg?.querySelector<HTMLElement>('select')?.focus(); });

  async function post() {
    err = '';
    try {
      const res = await engineClient.postCrewRequest({ itemId: item, qty: Math.floor(qty), rewardPer: Math.floor(reward), minGrade: grade || undefined });
      if (res && res.ok === false) { err = res.reason || 'Could not post.'; return; }
      onDone(`Request posted. ${fmtG(res?.escrow ?? escrow)} held in escrow.`);
      onClose();
    } catch (e: any) { err = String(e?.message ?? e); }
  }
  function onKey(ev: KeyboardEvent) {
    if (ev.key === 'Escape') { onClose(); return; }
    if (ev.key !== 'Tab' || !dlg) return;
    const f = [...dlg.querySelectorAll<HTMLElement>('button:not(:disabled), input, select')];
    const first = f[0], last = f[f.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  }
</script>

<svelte:window onkeydown={onKey} />
<div class="scrim" onclick={onClose} role="presentation">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="rq-title" tabindex="-1" bind:this={dlg} onclick={(e) => e.stopPropagation()}>
    <h2 id="rq-title">Post a request</h2>
    <label>Item
      <select bind:value={item}><option value="">Choose an item</option>{#each sellable as i (i.id)}<option value={i.id}>{i.name}</option>{/each}</select>
    </label>
    <div class="fields">
      <label>Min grade<select bind:value={grade}>{#each GRADES as g, i}<option value={i}>{g}</option>{/each}</select></label>
      <label>Qty (1-500)<input type="number" min="1" max="500" bind:value={qty} /></label>
      <label>Reward each (g)<input type="number" min="1" bind:value={reward} /></label>
    </div>
    <p class="meta">Escrow: <span class="brass num">{fmtG(escrow)}</span> from your <span class="num">{fmtG(gold)}</span>. Cancel any time for a refund of what is left.</p>
    {#if err}<p class="bad">{err}</p>{/if}
    {#if !valid}<p class="meta">{!item ? 'Choose an item to turn on Post request.' : !(qty >= 1 && qty <= 500) ? 'Quantity must be 1 to 500.' : !(reward >= 1) ? 'Reward must be at least 1g.' : `You need ${fmtG(escrow - gold)} more gold to cover the escrow.`}</p>{/if}
    <div class="actions">
      <button type="button" class="btn ghost" onclick={onClose}>Cancel</button>
      <button type="button" class="btn primary" disabled={!valid} onclick={post}>Post request</button>
    </div>
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 50; background: var(--scrim); display: flex; align-items: flex-end; justify-content: center; }
  .sheet { width: 100%; max-width: var(--col); max-height: 90dvh; overflow-y: auto; display: grid; gap: 12px; padding: 16px var(--gut-r) calc(16px + env(safe-area-inset-bottom, 0px)) var(--gut-l); background: var(--paper); border: 1px solid var(--rule); border-bottom: 0; box-shadow: 0 -8px 24px var(--shadow); }
  h2 { margin: 0; font: 600 var(--t-lg)/1.2 var(--f-display); }
  label { display: grid; gap: 4px; align-content: start; min-width: 0; font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3); letter-spacing: .04em; text-transform: uppercase; }
  .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .fields label:first-child { grid-column: 1 / -1; }
  select, input { width: 100%; }
  .meta { margin: 0; color: var(--ink-3); font-size: var(--t-sm); }
  .brass { color: var(--brass); font-weight: 700; }
  .bad { margin: 0; color: var(--bad); }
  .actions { display: flex; gap: 8px; } .actions .btn { flex: 1; }
</style>
