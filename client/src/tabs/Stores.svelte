<script lang="ts">
  import { DATA } from '@guildwright/engine';
  import { engine } from '../engine/store.svelte';
  import { engineClient } from '../engine/client';

  type Item = { id: string; name: string; slot?: string; kind?: string };
  type Gear = { uid: string; itemId: string; rarity: string; quality: number; dur: number; maxDur: number };

  const SLOTS = ['weapon', 'offhand', 'head', 'chest', 'legs', 'ring'] as const;
  const SLOT_LABEL: Record<string, string> = {
    weapon: 'Weapon', offhand: 'Offhand', head: 'Head', chest: 'Chest', legs: 'Legs', ring: 'Ring',
  };
  const RARITY_CLASS: Record<string, string> = {
    common: 'r-common', uncommon: 'r-uncommon', rare: 'r-rare',
    epic: 'r-epic', legendary: 'r-legendary', mythic: 'r-mythic',
  };
  const GRADE_LABEL = ['Rough', 'Fine', 'Sharp', 'Keen', 'Pristine'];

  // DATA.items is a Record<id, Item>, not an array — see engine/src/data.ts.
  const itemsMap: Record<string, Item> = (DATA as any).items;
  const itemName = (id: string) => itemsMap[id]?.name ?? id;

  let sub = $state<'mine' | 'crew'>('mine');
  let snap = $derived(engine.snapshot);
  let view = $derived(engine.derived);
  let equipped = $derived<Record<string, string | null>>(snap?.equipped ?? {});
  let bag = $derived<Gear[]>((snap?.gear ?? []) as Gear[]);
  let bagByUid = $derived(new Map(bag.map((g) => [g.uid, g] as const)));
  let inv = $derived<Record<string, number[]>>(snap?.inv ?? {});
  let vault = $derived(snap?.crew?.vault ?? { inv: {}, gear: [] });
  let vaultInv = $derived<Record<string, number[]>>(vault.inv ?? {});
  let vaultGear = $derived<Gear[]>((vault.gear ?? []) as Gear[]);

  function invRows(src: Record<string, number[]>) {
    const rows: Array<{ id: string; name: string; total: number; grades: number[] }> = [];
    for (const id of Object.keys(src)) {
      const grades = src[id];
      if (!Array.isArray(grades)) continue;
      const total = grades.reduce((a, b) => a + (b || 0), 0);
      if (total <= 0) continue;
      rows.push({ id, name: itemName(id), total, grades });
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }
  let mineRows = $derived(invRows(inv));
  let vaultRows = $derived(invRows(vaultInv));

  async function equip(uid: string) {
    try { await engineClient.equip(uid); }
    catch (err) { console.error('equip failed', err); }
  }
  async function unequip(slot: string) {
    try { await engineClient.unequip(slot); }
    catch (err) { console.error('unequip failed', err); }
  }

  function gradeHint(grades: number[]): string {
    // Compact "Rough ×3 · Fine ×1" — skip empty grades. Short so it fits on mobile.
    return grades
      .map((n, g) => (n > 0 ? `${GRADE_LABEL[g]} ×${n}` : null))
      .filter((s): s is string => s != null)
      .join(' · ');
  }
</script>

<nav class="subs" aria-label="Stores section">
  <button type="button" aria-current={sub === 'mine' ? 'page' : undefined} onclick={() => (sub = 'mine')}>Mine</button>
  <button type="button" aria-current={sub === 'crew' ? 'page' : undefined} onclick={() => (sub = 'crew')}>Crew</button>
</nav>

{#if sub === 'mine'}
  <section class="group">
    <h3>Equipped</h3>
    <ul class="slots">
      {#each SLOTS as slot}
        {@const uid = equipped[slot]}
        {@const g = uid ? bagByUid.get(uid) : null}
        <li>
          <div class="slot-head">
            <span class="slot-name">{SLOT_LABEL[slot]}</span>
            {#if g}<span class={`r ${RARITY_CLASS[g.rarity] ?? ''}`}>{g.rarity}</span>{/if}
          </div>
          {#if g}
            <div class="slot-row">
              <span class="gear-name">{view?.gearNames[g.uid] ?? itemName(g.itemId)}</span>
              <button type="button" class="ghost" onclick={() => unequip(slot)}>Unequip</button>
            </div>
            <p class="meta">Dur {Math.round(g.dur)}/{g.maxDur} · Q{Math.round(g.quality)}</p>
          {:else}
            <p class="meta empty">Empty</p>
          {/if}
        </li>
      {/each}
    </ul>
  </section>

  <section class="group">
    <h3>Bag — gear</h3>
    {#if bag.length === 0}
      <p class="muted">Craft or loot gear to fill your bag.</p>
    {:else}
      <ul class="gear-list">
        {#each bag as g (g.uid)}
          {@const it = itemsMap[g.itemId]}
          {@const slot = it?.slot}
          {@const alreadyEquipped = slot ? equipped[slot] === g.uid : false}
          <li>
            <div class="gear-row">
              <span class="gear-name">{view?.gearNames[g.uid] ?? itemName(g.itemId)}</span>
              <span class={`r ${RARITY_CLASS[g.rarity] ?? ''}`}>{g.rarity}</span>
            </div>
            <div class="gear-row sub">
              <span class="meta">{SLOT_LABEL[slot ?? ''] ?? '—'} · Dur {Math.round(g.dur)}/{g.maxDur} · Q{Math.round(g.quality)}</span>
              {#if slot}
                <button type="button" class="action-btn" disabled={alreadyEquipped} onclick={() => equip(g.uid)}>
                  {alreadyEquipped ? 'Equipped' : 'Equip'}
                </button>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="group">
    <h3>Bag — materials</h3>
    {#if mineRows.length === 0}
      <p class="muted">Nothing stacked yet. Start a gather action in the Workshop.</p>
    {:else}
      <ul class="inv-list">
        {#each mineRows as row (row.id)}
          <li>
            <div class="inv-row"><span>{row.name}</span><strong>×{row.total}</strong></div>
            <p class="meta">{gradeHint(row.grades)}</p>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{:else}
  <section class="group">
    <h3>Vault — gear</h3>
    {#if vaultGear.length === 0}
      <p class="muted">The crew vault has no gear deposited.</p>
    {:else}
      <ul class="gear-list">
        {#each vaultGear as g (g.uid)}
          <li>
            <div class="gear-row">
              <span class="gear-name">{view?.gearNames[g.uid] ?? itemName(g.itemId)}</span>
              <span class={`r ${RARITY_CLASS[g.rarity] ?? ''}`}>{g.rarity}</span>
            </div>
            <p class="meta">Dur {Math.round(g.dur)}/{g.maxDur} · Q{Math.round(g.quality)}</p>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="group">
    <h3>Vault — materials</h3>
    {#if vaultRows.length === 0}
      <p class="muted">Nothing stored. Crewmates donate from their bags as town contracts roll in.</p>
    {:else}
      <ul class="inv-list">
        {#each vaultRows as row (row.id)}
          <li>
            <div class="inv-row"><span>{row.name}</span><strong>×{row.total}</strong></div>
            <p class="meta">{gradeHint(row.grades)}</p>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

<style>
  .subs {
    display: grid; grid-template-columns: 1fr 1fr; gap: 0;
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

  .slots, .gear-list, .inv-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .slots li, .gear-list li, .inv-list li {
    padding: 10px 12px; background: var(--paper); border: 1px solid var(--rule);
  }

  .slot-head, .slot-row, .gear-row, .inv-row {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
  }
  .slot-name { font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3); letter-spacing: .04em; text-transform: uppercase; }
  .gear-name { font: 500 var(--t-sm)/1.1 var(--f-body); color: var(--ink); }
  .inv-row span { font: 500 var(--t-sm)/1.1 var(--f-body); color: var(--ink); }
  .inv-row strong { font: 600 var(--t-sm)/1 var(--f-display); color: var(--ink); }
  .meta { margin: 4px 0 0; color: var(--ink-3); font-size: var(--t-xs); }
  .empty { color: var(--ink-3); font-style: italic; }

  .gear-row.sub { margin-top: 4px; }

  .r { font: 400 var(--t-xs)/1 var(--f-label); letter-spacing: .04em; text-transform: uppercase; }
  .r-common { color: var(--r-common); }
  .r-uncommon { color: var(--r-uncommon); }
  .r-rare { color: var(--r-rare); }
  .r-epic { color: var(--r-epic); }
  .r-legendary { color: var(--r-legendary); }
  .r-mythic { color: var(--r-mythic); }

  .action-btn, .ghost {
    padding: 6px 10px; border: 1px solid var(--rule); background: var(--sunk);
    font: 400 var(--t-xs)/1 var(--f-label); letter-spacing: .04em; text-transform: uppercase;
    color: var(--ink-2);
  }
  .action-btn:hover:not(:disabled) { background: var(--woad-soft); border-color: var(--woad); color: var(--woad); }
  .action-btn:disabled { opacity: .5; cursor: not-allowed; }
  .ghost { background: transparent; }
  .ghost:hover { background: var(--sunk); }
</style>
