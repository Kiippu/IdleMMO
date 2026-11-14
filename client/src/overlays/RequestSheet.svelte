<script lang="ts">
  import { MIN_GRADE_LABELS } from '../engine/grades';
  // Post a crew request (paid from your own escrowed gold). Opens from Crew > Contracts "+ Request".
  import { DATA } from '@guildwright/engine';
  import { engineClient } from '../engine/client';
  import { fmtG, fmtGoldBar } from '../format';
  import ItemIcon from '../art/ItemIcon.svelte';

  import { pushBack } from './backStack.svelte';
  type Props = { gold: number; onClose: () => void; onDone: (text: string) => void };
  let { gold, onClose, onDone }: Props = $props();
  $effect(() => pushBack(() => onClose()));

  const itemsMap: Record<string, { id?: string; name?: string; kind?: string; rarity?: string }> = (DATA as any).items;
  const sellable = Object.values(itemsMap).filter((i) => i.kind !== 'gear' && i.id).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  const GRADES = MIN_GRADE_LABELS;
  const KIND_LABEL: Record<string, string> = { material: 'Materials', food: 'Food', potion: 'Potions', catalyst: 'Catalysts', core: 'Cores' };
  const KIND_ORDER = ['material', 'food', 'potion', 'catalyst', 'core'];
  let item = $state('');
  let picking = $state(false); let q = $state('');
  let groups = $derived.by(() => {
    const t = q.trim().toLowerCase();
    const by: Record<string, typeof sellable> = {};
    for (const i of sellable) { if (t && !(i.name ?? '').toLowerCase().includes(t)) continue; (by[i.kind ?? 'material'] ??= []).push(i); }
    return Object.keys(by).sort((a, b) => (KIND_ORDER.indexOf(a) + 99) % 99 - (KIND_ORDER.indexOf(b) + 99) % 99).map((k) => ({ kind: k, label: KIND_LABEL[k] ?? k, items: by[k] }));
  });
  let pickedName = $derived(item ? itemsMap[item]?.name ?? item : '');
  function choose(id: string) { item = id; picking = false; q = ''; }

  let grade = $state(0); let qty = $state(10); let reward = $state(5);
  let err = $state('');
  let escrow = $derived(Math.max(0, Math.floor(qty || 0)) * Math.max(0, Math.floor(reward || 0)));
  let valid = $derived(!!item && qty >= 1 && qty <= 500 && reward >= 1 && escrow <= gold);
  let dlg = $state<HTMLElement | null>(null);
  $effect(() => { dlg?.querySelector<HTMLElement>('.pickbtn, .srch')?.focus(); });

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
    if (ev.key === 'Escape') { if (picking) { picking = false; return; } onClose(); return; }
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
    {#if picking}
    <h2 id="rq-title">Choose an item</h2>
    <input type="search" class="srch" placeholder="Search by name" aria-label="Search by name" bind:value={q} />
    <div class="plist">
      {#each groups as g (g.kind)}
        <h3>{g.label} <span class="num">{g.items.length}</span></h3>
        <ul>
          {#each g.items as i (i.id)}
            <li><button type="button" class="prow" aria-pressed={item === i.id} onclick={() => choose(i.id!)}><ItemIcon id={i.id} rarity={i.rarity} /><span class="pn">{i.name}</span></button></li>
          {/each}
        </ul>
      {:else}<p class="meta">No items match "{q}".</p>{/each}
    </div>
    <div class="actions"><button type="button" class="btn ghost" onclick={() => { picking = false; q = ''; }}>Back</button></div>
    {:else}
    <h2 id="rq-title">Post a request</h2>
    <div class="lbl">Item
      <button type="button" class="btn pickbtn" onclick={() => (picking = true)}>{#if item}<ItemIcon id={item} rarity={itemsMap[item]?.rarity} /><span class="pn">{pickedName}</span>{:else}<span class="pn">Choose an item</span>{/if}<span aria-hidden="true">›</span></button>
    </div>
    <div class="fields">
      <label>Min grade<select bind:value={grade}>{#each GRADES as g, i}<option value={i}>{g}</option>{/each}</select></label>
      <label>Qty (1-500)<input type="number" min="1" max="500" bind:value={qty} /></label>
      <label>Reward each (g)<input type="number" min="1" bind:value={reward} /></label>
    </div>
    <p class="meta">Escrow: <span class="brass num">{fmtG(escrow)}</span> from your <span class="num">{fmtGoldBar(gold)}</span>. Cancel any time for a refund of what is left.</p>
    {#if err}<p class="bad">{err}</p>{/if}
    {#if !valid}<p class="meta">{!item ? 'Choose an item to turn on Post request.' : !(qty >= 1 && qty <= 500) ? 'Quantity must be 1 to 500.' : !(reward >= 1) ? 'Reward must be at least 1g.' : `You need ${fmtG(escrow - gold)} more gold to cover the escrow.`}</p>{/if}
    <div class="actions">
      <button type="button" class="btn ghost" onclick={onClose}>Cancel</button>
      <button type="button" class="btn primary" disabled={!valid} onclick={post}>Post request</button>
    </div>
    {/if}
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 50; background: var(--scrim); display: flex; align-items: flex-end; justify-content: center; }
  .sheet { width: 100%; max-width: var(--col); max-height: 90dvh; overflow-y: auto; display: grid; gap: 12px; padding: 16px var(--gut-r) calc(16px + env(safe-area-inset-bottom, 0px)) var(--gut-l); background: var(--paper); border: 1px solid var(--rule); border-bottom: 0; box-shadow: 0 -8px 24px var(--shadow); }
  h2 { margin: 0; font: 600 var(--t-lg)/1.2 var(--f-display); }
  label, .lbl { display: grid; gap: 4px; align-content: start; min-width: 0; font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3); letter-spacing: .04em; text-transform: uppercase; }
  .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .fields label:first-child { grid-column: 1 / -1; }
  select, input { width: 100%; }
  .pickbtn { width: 100%; justify-content: flex-start; gap: 10px; text-transform: none; letter-spacing: 0; font-family: var(--f-body); }
  .pickbtn .pn { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .plist { max-height: 52dvh; overflow-y: auto; }
  .plist h3 { position: sticky; top: 0; margin: 0; padding: 6px 0; background: var(--paper); font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3); letter-spacing: .08em; text-transform: uppercase; }
  .plist ul { list-style: none; margin: 0; padding: 0; }
  .prow { width: 100%; min-height: 44px; display: flex; align-items: center; gap: 10px; padding: 4px 6px; background: none; border: 0; border-bottom: 1px solid var(--rule); color: var(--ink); text-align: left; font: 700 var(--t-sm)/1.2 var(--f-body); }
  .prow[aria-pressed='true'] { background: var(--woad-soft); }
  .prow:hover { background: var(--woad-soft); }
  .meta { margin: 0; color: var(--ink-3); font-size: var(--t-sm); }
  .brass { color: var(--brass); font-weight: 700; }
  .bad { margin: 0; color: var(--bad); }
  .actions { display: flex; gap: 8px; } .actions .btn { flex: 1; }
</style>
