<script lang="ts">
  import { DATA } from '@guildwright/engine';
  import { engine } from '../engine/store.svelte';
  import { engineClient } from '../engine/client';
  import { ui, bagFilter, vaultFilter, resetFilter, type BagFilter } from '../ui.svelte';
  import { openItem } from '../overlays/itemRef.svelte';
  import { openSalvage } from '../overlays/salvage.svelte';
  import { fmtG, fmtN } from '../format';
  import { askNumber, confirmSheet, noticeSheet } from '../overlays/confirm.svelte';
  import { toast } from '../overlays/toasts.svelte';
  import { markDone } from '../guide.svelte';

  type Item = { id: string; name: string; slot?: string; kind?: string; value?: number; stats?: Record<string, number> };
  type Gear = { uid: string; itemId: string; rarity: string; quality: number; dur: number; maxDur: number };
  type Tile = { key: string; letter: string; name: string; rarity: string; qty?: number; kind: 'stack' | 'gear'; id: string; gear?: Gear; grades?: number[]; cat: 'Materials' | 'Gear' | 'Food & potions'; value: number; order: number };

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

  let sub = $state<'mine' | 'crew' | 'codex'>('mine');
  $effect(() => { if (ui.storesSub) { sub = ui.storesSub; ui.storesSub = null; } });

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
      out.push({ key: `s:${id}`, letter: itemName(id)[0], name: itemName(id), rarity: itemRarity[id] ?? 'common', qty: total, kind: 'stack', id, grades, cat: catOf(id), value: itemsMap[id]?.value ?? 0, order: 0 });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    const gs: Tile[] = gear.filter((g) => !skipEquipped || !Object.values(equipped).includes(g.uid))
      .map((g, i) => ({ key: `g:${g.uid}`, letter: itemName(g.itemId)[0], name: gname(g), rarity: g.rarity, kind: 'gear' as const, id: g.itemId, gear: g, cat: 'Gear' as const, value: store?.gearSellPrices?.[g.uid] ?? 0, order: i + 1 }));
    return [...gs, ...out];
  }
  let mineTiles = $derived(tiles(inv, bag, true));
  let vaultTiles = $derived(tiles(vault.inv ?? {}, (vault.gear ?? []) as Gear[], false));
  const RANK = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
  const RARS = ['all', ...RANK];
  const SORTS = [['newest', 'Newest'], ['rarity', 'Rarity'], ['name', 'Name'], ['qty', 'Quantity'], ['value', 'Value']] as const;
  const shown = (list: Tile[], f: BagFilter) => {
    const q = f.q.trim().toLowerCase();
    const out = list.filter((t) => (f.cat === 'All' || t.cat === f.cat) && (f.rarity === 'all' || t.rarity === f.rarity) && (!q || t.name.toLowerCase().includes(q)));
    const by = f.sort;
    return out.sort((a, b) => by === 'rarity' ? RANK.indexOf(b.rarity) - RANK.indexOf(a.rarity) || a.name.localeCompare(b.name)
      : by === 'name' ? a.name.localeCompare(b.name)
      : by === 'qty' ? (b.qty ?? 1) - (a.qty ?? 1)
      : by === 'value' ? b.value - a.value
      : b.order - a.order || a.name.localeCompare(b.name));
  };
  let cx = $derived.by(() => {
    const items = view?.extras?.codex?.items ?? {};
    const cats: Record<string, { name: string; tiles: any[]; known: number; all: number; hidden: number }> = {};
    let known = 0, total = 0;
    for (const id of Object.keys(items)) {
      const e = items[id]; const it = itemsMap[id]; if (!it) continue;
      const c = catOf(id); const g = (cats[c] ??= { name: c, tiles: [], known: 0, all: 0, hidden: 0 });
      g.all++; total++;
      if (e.status === 'known') { g.known++; known++; g.tiles.push({ id, name: it.name, status: 'known', rarity: itemRarity[id] ?? 'common' }); }
      else if (e.status === 'hint') g.tiles.push({ id, name: '???', status: 'hint', rarity: 'common', seen: e.inputsSeen, total: e.inputsTotal });
      else g.hidden++;
    }
    for (const g of Object.values(cats)) g.tiles.sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'known' ? -1 : 1));
    return { known, total, groups: ['Materials', 'Gear', 'Food & potions'].map((n) => cats[n]).filter(Boolean) };
  });
  let mineVis = $derived(shown(mineTiles, bagFilter));
  let vaultVis = $derived(shown(vaultTiles, vaultFilter));

</script>

{#snippet filters(f: BagFilter)}
  <div class="filters">
    <div class="sw"><input type="search" class="search" placeholder="Search by name" aria-label="Search by name" bind:value={f.q} />{#if f.q}<button type="button" class="clr" aria-label="Clear search" onclick={() => (f.q = '')}>×</button>{/if}</div>
    <select aria-label="Rarity" bind:value={f.rarity}>{#each RARS as r}<option value={r}>{r === 'all' ? 'Any rarity' : r[0].toUpperCase() + r.slice(1)}</option>{/each}</select>
    <select aria-label="Sort" bind:value={f.sort}>{#each SORTS as [v, l]}<option value={v}>Sort: {l}</option>{/each}</select>
  </div>
  <div class="chips" role="group" aria-label="Category">
    {#each CATS as c}<button type="button" class="btn chip" aria-pressed={f.cat === c} onclick={() => (f.cat = c)}>{c}</button>{/each}
  </div>
{/snippet}

{#snippet grid(list: Tile[], readOnly: boolean, f: BagFilter, total: number)}
  {#if list.length === 0}
    <p class="muted">{total === 0 ? (readOnly ? 'The crew vault is empty. Crewmates donate through contracts.' : 'Your bag is empty. Gather or craft something first.') : 'No items match.'}
      {#if total > 0}<button type="button" class="btn" onclick={() => resetFilter(f)}>Clear filters</button>{/if}</p>
  {:else}
    <ul class="grid">
      {#each list as t (t.key)}
        <li>
          <button type="button" class="tile" data-gear={t.kind === "gear" ? "1" : undefined} style:--ink-r={`var(--r-${t.rarity})`} onclick={() => openItem({ itemId: t.id, uid: t.gear?.uid, readOnly })} aria-label="{t.name}{t.qty ? `, ${t.qty}` : ''}">
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
  <button type="button" aria-current={sub === 'codex' ? 'page' : undefined} onclick={() => (sub = 'codex')}>Codex</button>
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
            <button type="button" class="tile" style:--ink-r={`var(--r-${g.rarity})`} onclick={() => openItem({ itemId: g.itemId, uid: g.uid })} aria-label="{SLOT_LABEL[slot]}: {gname(g)}">
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
    {@render filters(bagFilter)}
    {#if mineVis.filter((t) => t.kind === 'gear').length}<button type="button" class="btn danger salv" onclick={() => openSalvage(mineVis.filter((t) => t.kind === 'gear').map((t) => t.gear!.uid), `${mineVis.filter((t) => t.kind === 'gear').length} shown`)}>Salvage shown ({mineVis.filter((t) => t.kind === 'gear').length})</button>{/if}
    {@render grid(mineVis, false, bagFilter, mineTiles.length)}
  </section>
{:else if sub === 'codex'}
  <section class="group">
    <h3>Codex</h3>
    <p class="cprog"><span class="num">{cx.known} / {cx.total}</span> discovered</p>
    <div class="pbar" role="progressbar" aria-label="Discovered" aria-valuemin="0" aria-valuemax={cx.total} aria-valuenow={cx.known}><div style="width: {cx.total ? Math.round(cx.known / cx.total * 100) : 0}%"></div></div>
    {#each cx.groups as grp (grp.name)}
      <h4>{grp.name} <span class="num">{grp.known}/{grp.all}</span></h4>
      <ul class="grid">
        {#each grp.tiles as t (t.id)}
          <li>
            <button type="button" class="tile" class:hintt={t.status === 'hint'} style:--ink-r={t.status === 'known' ? `var(--r-${t.rarity})` : 'var(--rule)'} onclick={() => openItem({ itemId: t.id, readOnly: true })} aria-label={t.status === 'hint' ? (t.total > 0 ? `Unknown item, uses ${t.seen} of ${t.total} materials you have found` : 'Unknown raw material') : t.name}>
              <span class="letter">{t.status === 'hint' ? '???' : t.name[0]}</span>
            </button>
          </li>
        {/each}
      </ul>
      {#if grp.hidden}<p class="muted"><span class="num">{grp.hidden}</span> undiscovered</p>{/if}
    {/each}
  </section>
{:else}
  <section class="group">
    <h3>Crew vault</h3>
    {@render filters(vaultFilter)}
    {@render grid(vaultVis, true, vaultFilter, vaultTiles.length)}
  </section>
{/if}

<style>
  .group + .group { margin-top: 16px; }
  .group h3 { margin: 0 0 8px; font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3); letter-spacing: .08em; text-transform: uppercase; }
  .muted { margin: 0; padding: 12px; background: var(--paper); border: 1px solid var(--rule); color: var(--ink-3); font-size: var(--t-sm); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
  .chip { flex: none; padding: 0 12px; }

  .tile { position: relative; width: 100%; aspect-ratio: 1; min-height: 44px; display: grid; place-items: center; padding: 0; background: var(--paper); border: 2px solid var(--ink-r, var(--rule)); color: var(--ink-r, var(--ink)); }
  .tile:hover { background: var(--woad-soft); }
  .tile.empty { border: 1px dashed var(--rule); color: var(--ink-3); }
  .letter { font: 700 var(--t-lg)/1 var(--f-display); }
  .qty { position: absolute; right: 1px; bottom: 1px; padding: 0 3px; background: var(--ink); color: var(--paper); font: 700 11px/1.3 var(--f-num); }
  .grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
  .eq { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; }
  .eq li { display: grid; gap: 2px; justify-items: center; }
  .eq small { color: var(--ink-3); font-size: 10px; }

  .tile.hintt { background: var(--sunk); opacity: .75; color: var(--ink-3); border-style: dashed; }
  .tile.hintt .letter { font-size: var(--t-xs); }
  h4 { margin: 12px 0 6px; font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3); letter-spacing: .06em; text-transform: uppercase; }
  .cprog { margin: 0 0 6px; font-weight: 700; }
  .pbar { height: 8px; background: var(--sunk); border: 1px solid var(--rule); overflow: hidden; }
  .pbar div { height: 100%; background: var(--woad); }
  .salv { width: 100%; margin-bottom: 8px; }
  .filters { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 8px; }
  .sw { grid-column: 1 / -1; position: relative; }
  .search { width: 100%; padding-right: 44px; }
  .clr { position: absolute; right: 0; top: 0; width: 44px; height: 44px; border: 0; background: none; color: var(--ink-2); font: 700 var(--t-lg)/1 var(--f-body); }
</style>
