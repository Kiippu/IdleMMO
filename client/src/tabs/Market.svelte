<script lang="ts">
  import { DATA } from '@guildwright/engine';
  import { engine } from '../engine/store.svelte';
  import { engineClient } from '../engine/client';

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

  async function buy(listingId: string, maxQty: number) {
    const input = prompt(`How many? (1–${maxQty})`, '1');
    if (input == null) return;
    const qty = Math.max(1, Math.min(maxQty, Math.floor(Number(input))));
    if (!isFinite(qty) || qty < 1) return;
    try {
      const res = await engineClient.buyListing(listingId, qty);
      if (res && res.ok === false) alert(res.reason || 'Could not buy.');
    } catch (err) { console.error('buy failed', err); }
  }

  async function cancel(listingId: string) {
    if (!confirm('Cancel this listing? The items go back into your bag.')) return;
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
    <h3>Buyer listings</h3>
    <p class="meta">
      You have {gold}g on hand. Sales are taxed at {Math.round(tax * 100)}%.
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
              <span class="price">{l.price}g</span>
            </div>
            <div class="row sub">
              <span class="meta">×{l.qty} · {l.seller ?? 'buyer'}</span>
              <button type="button" class="action-btn" disabled={!canAfford} onclick={() => buy(l.id, l.qty)}>
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
              <span class="price">{l.price}g</span>
            </div>
            <div class="row sub">
              <span class="meta">×{l.qty}</span>
              <button type="button" class="ghost" onclick={() => cancel(l.id)}>Cancel</button>
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
          After tax you'd net ≈ {Math.round(formPrice * formQty * (1 - tax))}g if it all sells.
        </p>
        <button type="submit" class="action-btn primary">List</button>
      </form>
    {/if}
  </section>
{/if}

<style>
  .subs {
    display: grid; grid-template-columns: 1fr 1fr;
    margin: 0 0 16px; border: 1px solid var(--rule); background: var(--paper);
  }
  .subs button {
    padding: 10px; border: 0; background: transparent;
    font: 400 var(--t-xs)/1 var(--f-label); letter-spacing: .04em; text-transform: uppercase;
    color: var(--ink-2);
  }
  .subs button[aria-current="page"] { background: var(--woad-soft); color: var(--woad); }

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
  .price { font: 600 var(--t-sm)/1 var(--f-display); color: var(--brass); }

  .form { display: grid; gap: 10px; padding: 12px; background: var(--paper); border: 1px solid var(--rule); }
  .form label { display: grid; gap: 4px; }
  .form label > span {
    font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3);
    letter-spacing: .04em; text-transform: uppercase;
  }
  .form select, .form input {
    padding: 8px 10px; font: 400 var(--t-sm)/1 var(--f-body);
    border: 1px solid var(--rule); background: var(--sunk); color: var(--ink);
  }

  .action-btn, .ghost {
    padding: 6px 10px; border: 1px solid var(--rule); background: var(--sunk);
    font: 400 var(--t-xs)/1 var(--f-label); letter-spacing: .04em; text-transform: uppercase;
    color: var(--ink-2);
  }
  .action-btn:hover:not(:disabled) { background: var(--woad-soft); border-color: var(--woad); color: var(--woad); }
  .action-btn:disabled { opacity: .5; cursor: not-allowed; }
  .action-btn.primary { background: var(--woad); color: var(--on-woad); border-color: var(--woad); padding: 10px 16px; justify-self: end; }
  .ghost { background: transparent; }
  .ghost:hover { background: var(--sunk); }
</style>
