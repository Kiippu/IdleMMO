<script lang="ts">
  import { DATA } from '@guildwright/engine';
  import { engine } from '../engine/store.svelte';
  import { engineClient } from '../engine/client';
  import { ui } from '../ui.svelte';
  import { fmtG, fmtN } from '../format';
  import { askNumber, confirmSheet, noticeSheet } from '../overlays/confirm.svelte';
  import { toast } from '../overlays/toast.svelte';
  import { markDone } from '../guide.svelte';

  type Item = { id: string; name: string; slot?: string; kind?: string; stats?: Record<string, number> };
  type Gear = { uid: string; itemId: string; rarity: string; quality: number; dur: number; maxDur: number };
  type Tile = { key: string; letter: string; name: string; rarity: string; qty?: number; kind: 'stack' | 'gear'; id: string; gear?: Gear; grades?: number[]; cat: 'Materials' | 'Gear' | 'Food & potions' };

  const SLOTS = ['weapon', 'offhand', 'head', 'chest', 'legs', 'ring'] as const;
  const SLOT_LABEL: Record<string, string> = { weapon: 'Weapon', offhand: 'Offhand', head: 'Head', chest: 'Chest', legs: 'Legs', ring: 'Ring' };
  const GRADE_LABEL = ['Rough', 'Fine', 'Sharp', 'Keen', 'Pristine'];
  const STAT_NAME: Record<string, string> = { atk: 'attack', def: 'defence', heal: 'heal', hp: 'HP' };
  const CATS = ['All', 'Materials', 'Gear', 'Food & potions'] as const;

  const itemsMap: Record<string, Item> = (DATA as any).items;
  const itemRarity: Record<string, string> = (DATA as any).itemRarity ?? {};
  const actions: Array<{ id: string; name: string; kind: string; inputs?: Record<string, number>; outputs?: Record<string, number> }> = (DATA as any).actions;
  const itemName = (id: string) => itemsMap[id]?.name ?? id;
  const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

  let sub = $state<'mine' | 'crew'>('mine');
  $effect(() => { if (ui.storesSub) { sub = ui.storesSub; ui.storesSub = null; } });
  let cat = $state<(typeof CATS)[number]>('All');
  let sel = $state<{ tile: Tile; readOnly: boolean } | null>(null);

  let snap = $derived(engine.snapshot);
  let view = $derived(engine.derived);
  let store = $derived<any>(view?.extras?.store ?? null);
  let equipped = $derived<Record<string, string | null>>(snap?.equipped ?? {});
  let bag = $derived<Gear[]>((snap?.gear ?? []) as Gear[]);
  let bagByUid = $derived(new Map(bag.map((g) => [g.uid, g] as const)));
  let inv = $derived<Record<string, number[]>>(snap?.inv ?? {});
  let vault = $derived(snap?.crew?.vault ?? { inv: {}, gear: [] });
  let status = $derived(view?.raidStatus ?? null);
  const gname = (g: Gear) => view?.gearNames?.[g.uid] ?? itemName(g.itemId);

  function catOf(id: string): Tile['cat'] {
    const k = itemsMap[id]?.kind;
    if (k === 'gear') return 'Gear';
    if (k === 'food' || k === 'potion' || k === 'catalyst') return 'Food & potions';
    return 'Materials';
  }
  function tiles(src: Record<string, number[]>, gear: Gear[], skipEquipped: boolean): Tile[] {
    const out: Tile[] = [];
    for (const id of Object.keys(src ?? {})) {
      const grades = src[id];
      if (!Array.isArray(grades)) continue;
      const total = grades.reduce((a, b) => a + (b || 0), 0);
      if (total <= 0 || itemsMap[id]?.kind === 'gear') continue;
      out.push({ key: `s:${id}`, letter: itemName(id)[0], name: itemName(id), rarity: itemRarity[id] ?? 'common', qty: total, kind: 'stack', id, grades, cat: catOf(id) });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    const gs: Tile[] = gear.filter((g) => !skipEquipped || !Object.values(equipped).includes(g.uid))
      .map((g) => ({ key: `g:${g.uid}`, letter: itemName(g.itemId)[0], name: gname(g), rarity: g.rarity, kind: 'gear' as const, id: g.itemId, gear: g, cat: 'Gear' as const }));
    return [...gs, ...out];
  }
  let mineTiles = $derived(tiles(inv, bag, true));
  let vaultTiles = $derived(tiles(vault.inv ?? {}, (vault.gear ?? []) as Gear[], false));
  let shown = $derived((list: Tile[]) => list.filter((t) => cat === 'All' || t.cat === cat));

  function diffText(itemId: string, uid?: string): string {
    const it = itemsMap[itemId];
    const wornUid = equipped[it?.slot ?? ''];
    const worn = wornUid && wornUid !== uid ? bagByUid.get(wornUid) : null;
    const a = it?.stats ?? {}; const b = worn ? itemsMap[worn.itemId]?.stats ?? {} : {};
    const parts = Object.keys(STAT_NAME).map((k) => ({ k, d: (a[k] ?? 0) - (b[k] ?? 0) })).filter((x) => x.d !== 0)
      .map((x) => `${x.d > 0 ? '+' : '−'}${Math.abs(x.d)} ${STAT_NAME[x.k]}`);
    if (!worn) return 'Slot is empty: all stats are new.';
    return parts.length ? `Against your worn piece: ${parts.join(', ')}.` : 'Same base stats as your worn piece.';
  }
  const statLine = (itemId: string) => Object.entries(itemsMap[itemId]?.stats ?? {}).filter(([, v]) => v).map(([k, v]) => `+${v} ${STAT_NAME[k] ?? k}`).join(', ');
  const madeBy = (id: string) => actions.filter((a) => a.outputs && id in a.outputs).map((a) => a.name);
  const usedIn = (id: string) => actions.filter((a) => a.inputs && id in a.inputs).map((a) => a.name);
  const list3 = (xs: string[]) => (xs.length > 4 ? `${xs.slice(0, 4).join(', ')} and ${xs.length - 4} more` : xs.join(', '));

  async function equip(g: Gear) {
    if (status?.prepLocked) { await noticeSheet('Gear is locked', status.prepReason || 'Gear cannot change while the raid runs.'); return; }
    try { await engineClient.equip(g.uid); sel = null; toast(`Equipped ${gname(g)}`); }
    catch (err) { console.error('equip failed', err); }
  }
  async function unequip(slot: string) {
    if (status?.prepLocked) { await noticeSheet('Gear is locked', status.prepReason || 'Gear cannot change while the raid runs.'); return; }
    try { await engineClient.unequip(slot); sel = null; }
    catch (err) { console.error('unequip failed', err); }
  }
  async function sellGear(g: Gear) {
    const price = store?.gearSellPrices?.[g.uid] ?? 0;
    if (!(await confirmSheet({ title: `Sell ${gname(g)}?`, body: `The store pays ${fmtG(price)}. A crewmate or contract may pay more.`, confirmLabel: `Sell for ${fmtG(price)}`, danger: true }))) return;
    try {
      const res = await engineClient.storeSellGear(g.uid);
      if (res.ok) { markDone('sell'); sel = null; toast(`Sold ${gname(g)} for ${fmtG(res.gold)}`); } else await noticeSheet('Could not sell', res.reason);
    } catch (err) { console.error('sell failed', err); }
  }
  async function sellStack(id: string, grade: number, have: number) {
    const price = store?.sellPrices?.[id]?.[grade] ?? 0;
    const qty = await askNumber({
      title: `Sell ${itemName(id)}`, body: `${GRADE_LABEL[grade]} · the store pays ${fmtG(price)} each.`,
      number: { min: 1, max: have, value: 1, label: 'How many?', lines: (n) => [`You get ${fmtG(n * price)}`] }, confirmLabel: 'Sell',
    });
    if (qty == null) return;
    try {
      const res = await engineClient.storeSell(id, grade, qty);
      if (res.ok) { markDone('sell'); toast(`Sold ${qty} ${itemName(id)} for ${fmtG(res.gold)}`); } else await noticeSheet('Could not sell', res.reason);
    } catch (err) { console.error('sell failed', err); }
  }

  let dlg = $state<HTMLElement | null>(null);
  $effect(() => { if (sel) queueMicrotask(() => dlg?.querySelector<HTMLElement>('button')?.focus()); });
  function onKey(ev: KeyboardEvent) {
    if (!sel) return;
    if (ev.key === 'Escape') { sel = null; return; }
    if (ev.key !== 'Tab' || !dlg) return;
    const f = [...dlg.querySelectorAll<HTMLElement>('button:not(:disabled)')];
    if (!f.length) return;
    if (ev.shiftKey && document.activeElement === f[0]) { ev.preventDefault(); f[f.length - 1].focus(); }
    else if (!ev.shiftKey && document.activeElement === f[f.length - 1]) { ev.preventDefault(); f[0].focus(); }
  }
</script>

<svelte:window onkeydown={onKey} />

{#snippet grid(list: Tile[], readOnly: boolean)}
  {#if list.length === 0}
    <p class="muted">{cat === 'All' ? (readOnly ? 'The crew vault is empty. Crewmates donate through contracts.' : 'Your bag is empty. Gather or craft something first.') : 'Nothing in this category.'}</p>
  {:else}
    <ul class="grid">
      {#each list as t (t.key)}
        <li>
          <button type="button" class="tile" data-gear={t.kind === "gear" ? "1" : undefined} style:--ink-r={`var(--r-${t.rarity})`} onclick={() => (sel = { tile: t, readOnly })} aria-label="{t.name}{t.qty ? `, ${t.qty}` : ''}">
            <span class="letter">{t.letter}</span>
            {#if t.qty}<span class="qty num">{t.qty > 999 ? '999+' : t.qty}</span>{/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

<nav class="subs" aria-label="Stores section">
  <button type="button" aria-current={sub === 'mine' ? 'page' : undefined} onclick={() => (sub = 'mine')}>Mine</button>
  <button type="button" aria-current={sub === 'crew' ? 'page' : undefined} onclick={() => (sub = 'crew')}>Crew</button>
</nav>

{#if sub === 'mine'}
  <section class="group">
    <h3>Equipped</h3>
    <ul class="eq">
      {#each SLOTS as slot}
        {@const uid = equipped[slot]}
        {@const g = uid ? bagByUid.get(uid) : null}
        <li>
          {#if g}
            <button type="button" class="tile" style:--ink-r={`var(--r-${g.rarity})`} onclick={() => (sel = { tile: { key: `g:${g.uid}`, letter: itemName(g.itemId)[0], name: gname(g), rarity: g.rarity, kind: 'gear', id: g.itemId, gear: g, cat: 'Gear' }, readOnly: false })} aria-label="{SLOT_LABEL[slot]}: {gname(g)}">
              <span class="letter">{itemName(g.itemId)[0]}</span>
            </button>
          {:else}
            <span class="tile empty" aria-label="{SLOT_LABEL[slot]}: empty"><span class="letter">·</span></span>
          {/if}
          <small>{SLOT_LABEL[slot]}</small>
        </li>
      {/each}
    </ul>
  </section>

  <section class="group">
    <h3>Bag</h3>
    <div class="chips" role="group" aria-label="Category">
      {#each CATS as c}<button type="button" class="btn chip" aria-pressed={cat === c} onclick={() => (cat = c)}>{c}</button>{/each}
    </div>
    {@render grid(shown(mineTiles), false)}
  </section>
{:else}
  <section class="group">
    <h3>Crew vault</h3>
    <div class="chips" role="group" aria-label="Category">
      {#each CATS as c}<button type="button" class="btn chip" aria-pressed={cat === c} onclick={() => (cat = c)}>{c}</button>{/each}
    </div>
    {@render grid(shown(vaultTiles), true)}
  </section>
{/if}

{#if sel}
  {@const t = sel.tile}
  {@const g = t.gear}
  {@const isEq = !!g && Object.values(equipped).includes(g.uid)}
  <div class="scrim" onclick={() => (sel = null)} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="it-title" tabindex="-1" bind:this={dlg} onclick={(e) => e.stopPropagation()}>
      <header>
        <span class="tile big" style:--ink-r={`var(--r-${t.rarity})`}><span class="letter">{t.letter}</span></span>
        <div>
          <h2 id="it-title" style:color={`var(--r-${t.rarity})`}>{t.name}</h2>
          <p class="meta">{cap(t.rarity)}{g ? ` · ${SLOT_LABEL[itemsMap[g.itemId]?.slot ?? ''] ?? 'Gear'}` : ''}</p>
        </div>
      </header>
      {#if g}
        <p class="meta">Durability <span class="num">{Math.round(g.dur)}/{g.maxDur}</span> · Quality <span class="num">{Math.round(g.quality)}</span></p>
        {#if statLine(g.itemId)}<p class="body num">{statLine(g.itemId)}</p>{/if}
        {#if !isEq && itemsMap[g.itemId]?.slot}<p class="body">{diffText(g.itemId, g.uid)}</p>{/if}
      {:else if t.grades}
        <ul class="gr">{#each t.grades as q, i}{#if q > 0}<li><span>{GRADE_LABEL[i]}</span><b class="num">×{fmtN(q)}</b>
          {#if !sel.readOnly}<button type="button" class="btn" onclick={() => sellStack(t.id, i, q)}>Sell <span class="num">{fmtG(store?.sellPrices?.[t.id]?.[i] ?? 0)}</span></button>{/if}</li>{/if}{/each}</ul>
        {#if madeBy(t.id).length}<p class="meta">Made by: {list3(madeBy(t.id))}</p>{/if}
        {#if usedIn(t.id).length}<p class="meta">Used in: {list3(usedIn(t.id))}</p>{/if}
      {/if}
      <div class="actions">
        <button type="button" class="btn ghost" onclick={() => (sel = null)}>Close</button>
        {#if g && !sel.readOnly}
          {#if isEq}
            <button type="button" class="btn" onclick={() => unequip(itemsMap[g.itemId]?.slot ?? '')}>Unequip</button>
          {:else}
            <button type="button" class="btn" onclick={() => sellGear(g)}>Sell <span class="num">{fmtG(store?.gearSellPrices?.[g.uid] ?? 0)}</span></button>
            {#if itemsMap[g.itemId]?.slot}<button type="button" class="btn primary" data-guide="equip" onclick={() => equip(g)}>Equip</button>{/if}
          {/if}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .group + .group { margin-top: 16px; }
  .group h3 { margin: 0 0 8px; font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3); letter-spacing: .08em; text-transform: uppercase; }
  .muted { margin: 0; padding: 12px; background: var(--paper); border: 1px solid var(--rule); color: var(--ink-3); font-size: var(--t-sm); }
  .meta { margin: 0; color: var(--ink-3); font-size: var(--t-sm); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
  .chip { flex: none; padding: 0 12px; }

  .tile { position: relative; width: 100%; aspect-ratio: 1; min-height: 44px; display: grid; place-items: center; padding: 0; background: var(--paper); border: 2px solid var(--ink-r, var(--rule)); color: var(--ink-r, var(--ink)); }
  .tile:hover { background: var(--woad-soft); }
  .tile.empty { border: 1px dashed var(--rule); color: var(--ink-3); }
  .tile.big { width: 56px; flex: none; }
  .letter { font: 700 var(--t-lg)/1 var(--f-display); }
  .qty { position: absolute; right: 1px; bottom: 1px; padding: 0 3px; background: var(--ink); color: var(--paper); font: 700 11px/1.3 var(--f-num); }
  .grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
  .eq { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; }
  .eq li { display: grid; gap: 2px; justify-items: center; }
  .eq small { color: var(--ink-3); font-size: 10px; }

  .scrim { position: fixed; inset: 0; z-index: 40; background: var(--scrim); display: flex; align-items: flex-end; justify-content: center; }
  .sheet { width: 100%; max-width: var(--col); max-height: 85dvh; overflow-y: auto; display: grid; gap: 10px; padding: 16px var(--gut-r) calc(16px + env(safe-area-inset-bottom, 0px)) var(--gut-l); background: var(--paper); border: 1px solid var(--rule); border-bottom: 0; box-shadow: 0 -8px 24px var(--shadow); }
  header { display: flex; gap: 12px; align-items: center; }
  h2 { margin: 0; font: 600 var(--t-lg)/1.2 var(--f-display); }
  .body { margin: 0; color: var(--ink); font-size: var(--t-sm); }
  .gr { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .gr li { display: flex; align-items: center; gap: 8px; padding: 4px 8px; background: var(--sunk); border: 1px solid var(--rule-2); }
  .gr li span { flex: 1; }
  .actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
</style>
