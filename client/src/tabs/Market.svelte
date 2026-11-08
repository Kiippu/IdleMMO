<script lang="ts">
  import { DATA } from '@guildwright/engine';
  import { engine } from '../engine/store.svelte';
  import { engineClient } from '../engine/client';
  import { fmtG } from '../format';
  import { askNumber, confirmSheet, noticeSheet } from '../overlays/confirm.svelte';

  type Item = { id: string; name: string; kind?: string; slot?: string };

  const itemsMap: Record<string, Item> = (DATA as any).items;
  const itemName = (id: string) => itemsMap[id]?.name ?? id;
  const isStackable = (id: string) => itemsMap[id]?.kind !== 'gear';
  const GRADE_LABEL = ['Rough', 'Fine', 'Sharp', 'Keen', 'Pristine'];

  let sub = $state<'buy' | 'sell'>('buy');
  let snap = $derived(engine.snapshot);
  let view = $derived(engine.derived);

  let listings = $derived<any[]>(snap?.market?.listings ?? []);
  let mine = $derived<any[]>(snap?.market?.mine ?? []);
  let inv = $derived<Record<string, number[]>>(snap?.inv ?? {});
  let gold = $derived<number>(Math.floor(snap?.gold ?? 0));
  let tax = $derived<number>(view?.marketTax ?? 0.05);

  // Which items the player can currently list (non-gear with qty > 0 in any grade).
  let sellableItems = $derived.by(() => {
    const out: Array<{ id: string; name: string; grades: number[] }> = [];
    for (const id of Object.keys(inv)) {
      if (!isStackable(id)) continue;
      const grades = inv[id];
      if (!Array.isArray(grades)) continue;
      if (!grades.some((n) => n > 0)) continue;
      out.push({ id, name: itemName(id), grades });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  });

  // List-new-item form state.
  let formItem = $state('');
  let formGrade = $state(0);
  let formQty = $state(1);
  let formPrice = $state(1);
  let formError = $state<string | null>(null);

  async function buy(l: any) {
    const maxQty = Math.max(1, Math.min(l.qty, l.price > 0 ? Math.floor(gold / l.price) : l.qty));
    const qty = await askNumber({
      title: `Buy ${itemName(l.itemId)}`,
      body: `${fmtG(l.price)} each. You have ${fmtG(gold)}.`,
      number: { min: 1, max: maxQty, value: 1, label: 'How many?' },
      confirmLabel: 'Buy',
    });
    if (qty == null) return;
    try {
      const res = await engineClient.buyListing(l.id, qty);
      if (res && res.ok === false) await noticeSheet('Could not buy', res.reason);
    } catch (err) { console.error('buy failed', err); }
  }

  async function cancel(listingId: string) {
    if (!(await confirmSheet({ title: 'Cancel this listing?', body: 'The items go back into your bag.', confirmLabel: 'Cancel listing', cancelLabel: 'Keep it', danger: true }))) return;
    try { await engineClient.cancelListing(listingId); }
    catch (err) { console.error('cancel failed', err); }
  }

  async function listNew(ev: Event) {
    ev.preventDefault();
    formError = null;
    if (!formItem) { formError = 'Pick an item.'; return; }
    const have = (inv[formItem]?.[formGrade] ?? 0);
    if (have < formQty) { formError = `You only have ${have} of that grade.`; return; }
    try {
      const res = await engineClient.listItem(formItem, formGrade, formQty, formPrice);
      if (res && res.ok === false) { formError = res.reason || 'Could not list.'; return; }
      // Reset form on success. Keep item so repeating is quick.
      formQty = 1;
    } catch (err) { console.error('list failed', err); formError = String(err); }
  }

  function gradeNameFor(id: string, grade: number) {
    return GRADE_LABEL[grade] ?? `G${grade}`;
  }
</script>

<nav class="subs" aria-label="Market section">
  <button type="button" aria-current={sub === 'buy' ? 'page' : undefined} onclick={() => (sub = 'buy')}>Buy</button>
  <button type="button" aria-current={sub === 'sell' ? 'page' : undefined} onclick={() => (sub = 'sell')}>Sell</button>
</nav>

{#if sub === 'buy'}
  <section class="group">
    <h3>For sale</h3>
    <p class="meta">
      You have <span class="num">{fmtG(gold)}</span> on hand. Sales are taxed at <span class="num">{Math.round(tax * 100)}%</span>.
    </p>
    {#if listings.length === 0}
      <p class="muted">The board is empty. Listings refresh on their own.</p>
    {:else}
      <ul class="list">
        {#each listings as l (l.id)}
          {@const canAfford = gold >= l.price}
          <li>
            <div class="row">
              <div>
                <span class="name">{itemName(l.itemId)}</span>
                <span class="meta grade">{gradeNameFor(l.itemId, l.grade)}</span>
              </div>
              <span class="price">{fmtG(l.price)}</span>
            </div>
            <div class="row sub">
              <span class="meta"><span class="num">×{l.qty}</span> · {l.seller ?? 'town'}</span>
              <button type="button" class="btn" disabled={!canAfford} onclick={() => buy(l)}>
                {canAfford ? 'Buy' : 'Not enough gold'}
              </button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{:else}
  <section class="group">
    <h3>Your listings</h3>
    {#if mine.length === 0}
      <p class="muted">Nothing listed. Fill the form below to put something on the board.</p>
    {:else}
      <ul class="list">
        {#each mine as l (l.id)}
          <li>
            <div class="row">
              <div>
                <span class="name">{itemName(l.itemId)}</span>
                <span class="meta grade">{gradeNameFor(l.itemId, l.grade)}</span>
              </div>
              <span class="price">{fmtG(l.price)}</span>
            </div>
            <div class="row sub">
              <span class="meta num">×{l.qty}</span>
              <button type="button" class="btn ghost" onclick={() => cancel(l.id)}>Cancel</button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="group">
    <h3>List something new</h3>
    {#if sellableItems.length === 0}
      <p class="muted">You have no stackable items to list. Gather or craft first.</p>
    {:else}
      <form class="form" onsubmit={listNew}>
        <label>
          <span>Item</span>
          <select bind:value={formItem}>
            <option value="" disabled selected>Pick an item…</option>
            {#each sellableItems as it (it.id)}
              <option value={it.id}>{it.name}</option>
            {/each}
          </select>
        </label>

        <label>
          <span>Grade</span>
          <select bind:value={formGrade}>
            {#each GRADE_LABEL as g, idx}
              {@const have = formItem ? (inv[formItem]?.[idx] ?? 0) : 0}
              <option value={idx} disabled={have === 0}>{g} (have {have})</option>
            {/each}
          </select>
        </label>

        <label>
          <span>Qty</span>
          <input type="number" min="1" step="1" bind:value={formQty} />
        </label>

        <label>
          <span>Price (g each)</span>
          <input type="number" min="1" step="1" bind:value={formPrice} />
        </label>

        {#if formError}<p class="bad">{formError}</p>{/if}
        <p class="meta">
          After tax you'd net ≈ <span class="num">{fmtG(formPrice * formQty * (1 - tax))}</span> if it all sells.
        </p>
        <button type="submit" class="btn primary">List</button>
      </form>
    {/if}
  </section>
{/if}

<style>

  .group + .group { margin-top: 16px; }
  .group h3 {
    margin: 0 0 8px; font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3);
    letter-spacing: .08em; text-transform: uppercase;
  }
  .muted { margin: 0; padding: 12px; background: var(--paper); border: 1px solid var(--rule); color: var(--ink-3); font-size: var(--t-sm); }
  .meta { margin: 4px 0 0; color: var(--ink-3); font-size: var(--t-xs); }
  .bad { margin: 0; color: var(--bad); font-size: var(--t-sm); }

  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .list li { padding: 10px 12px; background: var(--paper); border: 1px solid var(--rule); }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .row.sub { margin-top: 6px; }
  .name { font: 500 var(--t-sm)/1.1 var(--f-body); color: var(--ink); }
  .grade { display: inline-block; margin-left: 6px; }
  .price { font-weight: 700; font-size: var(--t-md); line-height: 1; color: var(--brass); }

  .form { display: grid; gap: 10px; padding: 12px; background: var(--paper); border: 1px solid var(--rule); }
  .form label { display: grid; gap: 4px; }
  .form label > span {
    font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3);
    letter-spacing: .04em; text-transform: uppercase;
  }

</style>
