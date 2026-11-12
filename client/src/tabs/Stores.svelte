<script lang="ts">
  import { GRADE_NAMES } from '../engine/grades';
  import ItemIcon from '../art/ItemIcon.svelte';
  import { DATA } from '@guildwright/engine';
  import { engine } from '../engine/store.svelte';
  import { engineClient } from '../engine/client';
  import { ui, bagFilter, vaultFilter, resetFilter, type BagFilter } from '../ui.svelte';
  import { openItem } from '../overlays/itemRef.svelte';
  import { openSalvage, salvageReq } from '../overlays/salvage.svelte';
  import { groupGear, protectedUids, nextSelCount, commonPicks, pickedUids, hiddenPicks } from './war/gearStack';
  import { fmtG, fmtN } from '../format';
  import { askNumber, confirmSheet, noticeSheet } from '../overlays/confirm.svelte';
  import { markDone } from '../guide.svelte';

  type Item = { id: string; section?: 'fight' | 'outfit' | 'tool'; name: string; slot?: string; kind?: string; value?: number; stats?: Record<string, number> };
  type Gear = { uid: string; itemId: string; rarity: string; quality: number; dur: number; maxDur: number };
  type Tile = { key: string; letter: string; name: string; rarity: string; qty?: number; kind: 'stack' | 'gear'; id: string; gear?: Gear; uids?: string[]; grades?: number[]; cat: 'Materials' | 'Gear' | 'Food & potions'; value: number; order: number; section?: 'fight' | 'outfit' | 'tool' };
  const SECTION_LABEL = { fight: 'Fight', outfit: 'Outfit', tool: 'Tool' } as const;

  const GRADE_LABEL = GRADE_NAMES;
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
  // Everything worn anywhere: fight slots, the three outfit sets and the 15 tool slots.
  let equipped = $derived.by<Record<string, string | null>>(() => {
    const m: Record<string, string | null> = { ...(snap?.equipped ?? {}) };
    for (const [set, pieces] of Object.entries<any>((snap as any)?.workOutfit ?? {})) for (const [p, uid] of Object.entries<any>(pieces ?? {})) m[`outfit:${set}:${p}`] = uid;
    for (const [sk, uid] of Object.entries<any>((snap as any)?.tools ?? {})) m[`tool:${sk}`] = uid;
    return m;
  });
  let secF = $state<'all' | 'fight' | 'outfit' | 'tool'>('all');
  let info = $derived<Record<string, { stackKey: string | null }> | undefined>((view?.extras as any)?.gearInfo);
  let loadouts = $derived<any[]>(snap?.loadouts ?? []);
  let bag = $derived<Gear[]>((snap?.gear ?? []) as Gear[]);
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
  function tiles(src: Record<string, number[]>, gear: Gear[], skipEquipped: boolean, stack = false): Tile[] {
    const out: Tile[] = [];
    for (const id of Object.keys(src ?? {})) {
      const grades = src[id];
      if (!Array.isArray(grades)) continue;
      const total = grades.reduce((a, b) => a + (b || 0), 0);
      if (total <= 0 || itemsMap[id]?.kind === 'gear') continue;
      out.push({ key: `s:${id}`, letter: itemName(id)[0], name: itemName(id), rarity: itemRarity[id] ?? 'common', qty: total, kind: 'stack', id, grades, cat: catOf(id), value: itemsMap[id]?.value ?? 0, order: 0 });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    const spare = gear.filter((g) => !skipEquipped || !Object.values(equipped).includes(g.uid));
    const idx = new Map(gear.map((g, i) => [g.uid, i + 1] as const));
    const prot = protectedUids(equipped, loadouts);
    const rows = stack ? groupGear(spare, prot, DATA.grades, (g) => info?.[g.uid]?.stackKey) : spare.map((g) => ({ key: null, items: [g] }));
    const gs: Tile[] = rows.map((r) => {
      const g = r.items[0]; const n = r.items.length;
      return { key: r.key ? `gs:${r.key}` : `g:${g.uid}`, letter: itemName(g.itemId)[0], name: gname(g), rarity: g.rarity, qty: n > 1 ? n : undefined, kind: 'gear' as const, id: g.itemId, gear: g, uids: r.items.map((x) => x.uid), cat: 'Gear' as const, value: store?.gearSellPrices?.[g.uid] ?? 0, order: Math.max(...r.items.map((x) => idx.get(x.uid) ?? 0)), section: itemsMap[g.itemId]?.section };
    });
    return [...gs, ...out];
  }
  let mineTiles = $derived(tiles(inv, bag, true, true));
  let vaultTiles = $derived(tiles(vault.inv ?? {}, (vault.gear ?? []) as Gear[], false));
  const RANK = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
  const RARS = ['all', ...RANK];
  const nextOf = <T,>(list: readonly T[], cur: T): T => list[(list.indexOf(cur) + 1) % list.length];
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
  let mineVis = $derived(shown(mineTiles, bagFilter).filter((t) => secF === 'all' || (t.kind === 'gear' && t.section === secF)));
  let mineGear = $derived(mineVis.filter((t) => t.kind === 'gear'));
  let mineGearUids = $derived(mineGear.flatMap((t) => t.uids ?? []));
  let allGear = $derived(mineTiles.filter((t) => t.kind === 'gear'));
  let protSet = $derived(protectedUids(equipped, loadouts));

  // Select mode (Mine > gear): tap a row to pick it; a stack cycles 1 / 10 / all / none. Salvage still goes through the sheet.
  let selecting = $state(false);
  let sel = $state<Record<string, number>>({});
  // Picks are kept across filter changes; the count and the salvage list both come from ALL bag gear, not only what is visible.
  let selTotal = $derived(Object.values(sel).reduce((a, b) => a + b, 0));
  let selHidden = $derived(hiddenPicks(sel, new Set(mineGear.map((t) => t.key))));
  let commonStacks = $derived(mineGear.filter((t) => t.rarity === 'common'));
  function exitSelect() { selecting = false; sel = {}; }
  function tapTile(t: Tile, readOnly: boolean) {
    if (selecting && t.kind === 'gear' && !readOnly) {
      const n = t.uids?.length ?? 1; const cur = sel[t.key] ?? 0;
      const next = n === 1 ? (cur ? 0 : 1) : nextSelCount(cur, n);
      const { [t.key]: _, ...rest } = sel;
      sel = next ? { ...rest, [t.key]: next } : rest;
      return;
    }
    openItem({ itemId: t.id, uid: t.gear?.uid, readOnly, count: t.uids && t.uids.length > 1 ? t.uids.length : undefined });
  }
  function selectCommon() { sel = commonPicks(mineGear, protSet); }
  const selUids = () => pickedUids(allGear, sel);
  // Drop picks that no longer exist (salvaged, equipped, filtered out is kept).
  $effect(() => { const live = new Set(mineTiles.map((t) => t.key)); const k = Object.keys(sel).filter((x) => !live.has(x)); if (k.length) { const m = { ...sel }; for (const x of k) delete m[x]; sel = m; } });
  let lastDone = salvageReq.done;
  $effect(() => { if (salvageReq.done !== lastDone) { lastDone = salvageReq.done; exitSelect(); } });
  $effect(() => { if (sub !== 'mine' && selecting) exitSelect(); });
  let vaultVis = $derived(shown(vaultTiles, vaultFilter));

</script>

{#snippet filters(f: BagFilter)}
  <div class="filters">
    <div class="sw"><input type="search" class="search" placeholder="Search by name" aria-label="Search by name" bind:value={f.q} />{#if f.q}<button type="button" class="clr" aria-label="Clear search" onclick={() => (f.q = '')}>×</button>{/if}</div>
    <button type="button" class="btn ghost cyc" aria-label="Sort order: {SORTS.find((x) => x[0] === f.sort)?.[1]}. Tap to change" onclick={() => (f.sort = nextOf(SORTS.map((x) => x[0]), f.sort))}>{SORTS.find((x) => x[0] === f.sort)?.[1]}</button>
  </div>
  <div class="chips" role="group" aria-label="Filter">
    {#each CATS as c}<button type="button" class="btn chip" aria-pressed={f.cat === c} onclick={() => (f.cat = c)}>{c}</button>{/each}
    <button type="button" class="btn chip rar" class:on={f.rarity !== 'all'} style:--ink-r={f.rarity === 'all' ? undefined : `var(--r-${f.rarity})`} aria-label="Rarity filter: {f.rarity === 'all' ? 'any' : f.rarity}. Tap to change" onclick={() => (f.rarity = nextOf(RARS, f.rarity))}>{f.rarity === 'all' ? 'Any rarity' : cap(f.rarity)}</button>
  </div>
{/snippet}

{#snippet grid(list: Tile[], readOnly: boolean, f: BagFilter, total: number)}
  {#if list.length === 0}
    <p class="muted">{total === 0 ? (readOnly ? 'The crew vault is empty. Crewmates donate through contracts.' : 'Your bag is empty. Gather or craft something first.') : 'No items match.'}
      {#if total > 0}<button type="button" class="btn" onclick={() => resetFilter(f)}>Clear filters</button>{/if}</p>
    {#if total === 0}
      {#if readOnly}<button type="button" class="btn" onclick={() => { ui.crewSub = 'contracts'; ui.goTab = 'Crew'; }}>Open Contracts</button>
      {:else}<button type="button" class="btn" onclick={() => (ui.goTab = 'Workshop')}>Go to the Workshop</button>{/if}
    {/if}
  {:else}
    <ul class="grid">
      {#each list as t (t.key)}
        <li>
          <button type="button" class="tile" data-gear={t.kind === "gear" ? "1" : undefined} style:--ink-r={`var(--r-${t.rarity})`} onclick={() => tapTile(t, readOnly)} class:picked={!!sel[t.key]} aria-pressed={selecting && t.kind === 'gear' && !readOnly ? !!sel[t.key] : undefined} aria-label="{t.name}{t.section ? `, ${SECTION_LABEL[t.section]} gear` : ''}{t.qty ? `, quantity ${t.qty}` : ''}{sel[t.key] ? `, ${sel[t.key]} selected` : ''}">
            <ItemIcon id={t.id} rarity={t.rarity} />
            {#if t.kind === 'gear' && t.section}<span class="sec" data-s={t.section} aria-hidden="true">{SECTION_LABEL[t.section]}</span>{/if}
            {#if t.qty}<span class="qty num">{#if sel[t.key]}{sel[t.key]}/{/if}{t.qty > 999 ? '999+' : t.qty}</span>{/if}
            {#if sel[t.key]}<span class="chk num" aria-hidden="true">✓</span>{/if}
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
    <h3>Bag</h3>
    {@render filters(bagFilter)}
    <div class="chips" role="group" aria-label="Gear section">
      {#each [['all', 'Any section'], ['fight', 'Fight'], ['outfit', 'Outfit'], ['tool', 'Tool']] as [id, label]}<button type="button" class="btn chip" aria-pressed={secF === id} onclick={() => (secF = id as typeof secF)}>{label}</button>{/each}
    </div>
    {@render grid(mineVis, false, bagFilter, mineTiles.length)}
    {#if mineGear.length}
      <div class="foot">
        {#if selecting}
          <button type="button" class="btn ghost" onclick={exitSelect}>Done selecting</button>
          {#if commonStacks.length}<button type="button" class="btn ghost" onclick={selectCommon}>Select all common</button>{/if}
        {:else}
          <button type="button" class="btn ghost" onclick={() => (selecting = true)}>Select</button>
          <button type="button" class="btn ghost" onclick={() => openSalvage(mineGearUids, `${mineGearUids.length} shown`)}>Salvage gear…</button>
        {/if}
      </div>
      <p class="meta">{#if selecting}Tap gear to pick it. A stack cycles 1, 10, all, none. Protected pieces are skipped when you confirm.{:else}Salvage breaks the <span class="num">{mineGearUids.length}</span> gear {mineGearUids.length === 1 ? 'piece' : 'pieces'} shown into materials. You confirm first.{/if}</p>
    {/if}
  </section>
  {#if selecting}
    <div class="selbar" role="region" aria-label="Selected gear">
      <span class="sc"><b class="num">{selTotal}</b> selected{#if selHidden > 0} <span class="hid">(<span class="num">{selHidden}</span> hidden by filters)</span>{/if}</span>
      <button type="button" class="btn danger solid" disabled={selTotal === 0} onclick={() => openSalvage(selUids(), `${selTotal} selected`)}>Salvage <span class="num">{selTotal}</span></button>
    </div>
  {/if}
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
              <ItemIcon id={t.id} rarity={t.status === 'known' ? t.rarity : undefined} silhouette={t.status === 'hint'} />
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
  .group h3 { margin: 0 0 8px; font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3); letter-spacing: .08em; text-transform: uppercase; }
  .muted { margin: 0; padding: 12px; background: var(--paper); border: 1px solid var(--rule); color: var(--ink-3); font-size: var(--t-sm); }
  .chips { display: flex; flex-wrap: nowrap; gap: 6px; margin: 0 calc(-1 * var(--gut-r, 0px)) 8px 0; padding-right: var(--gut-r, 0px); overflow-x: auto; scrollbar-width: none; }
  .chips::-webkit-scrollbar { display: none; }
  .chips { padding-right: 32px; -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent); mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent); }
  .chip { flex: none; padding: 0 12px; white-space: nowrap; }
  .chip.rar.on { border-color: var(--ink-r); color: var(--ink-r); }
  .foot { margin-top: 12px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .meta { margin: 8px 0 0; color: var(--ink-3); font-size: var(--t-xs); }
  .tile.picked { background: var(--woad-soft); outline: 3px solid var(--woad); outline-offset: -3px; }
  .sec { position: absolute; right: 1px; top: 1px; padding: 1px 3px; background: var(--sunk); border: 1px solid var(--rule); color: var(--ink-2); font: 700 9px/1.2 var(--f-body); letter-spacing: .02em; pointer-events: none; }
  .sec[data-s='tool'] { color: var(--brass); } .sec[data-s='outfit'] { color: var(--woad); }
  .chk { position: absolute; left: 1px; top: 1px; width: 18px; height: 18px; display: grid; place-items: center; background: var(--woad); color: var(--on-woad); font: 700 12px/1 var(--f-num); }
  .selbar { position: sticky; bottom: calc(var(--tabbar-h) + 8px); z-index: 5; margin-top: 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 60px; padding: 8px 10px; background: var(--paper); border: 1px solid var(--woad); box-shadow: 0 -4px 12px var(--shadow); }
  .selbar .sc { color: var(--ink); font-size: var(--t-md); }
  .selbar .hid { color: var(--ink-3); font-size: var(--t-sm); }
  .selbar .btn { min-height: 44px; flex: none; }
  .cyc { flex: none; padding: 0 12px; white-space: nowrap; }

  .tile { position: relative; width: 100%; aspect-ratio: 1; min-height: 44px; display: grid; place-items: center; padding: 0; background: var(--paper); border: 2px solid var(--ink-r, var(--rule)); color: var(--ink-r, var(--ink)); }
  .tile:hover { background: var(--woad-soft); }
  .qty { position: absolute; right: 1px; bottom: 1px; padding: 0 3px; background: var(--ink); color: var(--paper); font: 700 11px/1.3 var(--f-num); }
  .grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }

  .tile.hintt { background: var(--sunk); opacity: .75; color: var(--ink-3); border-style: dashed; }
  h4 { margin: 12px 0 6px; font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3); letter-spacing: .06em; text-transform: uppercase; }
  .cprog { margin: 0 0 6px; font-weight: 700; }
  .pbar { height: 8px; background: var(--sunk); border: 1px solid var(--rule); overflow: hidden; }
  .pbar div { height: 100%; background: var(--woad); }
  .filters { display: flex; gap: 6px; margin-bottom: 6px; }
  .sw { flex: 1; min-width: 0; position: relative; }
  .search { width: 100%; padding-right: 44px; }
  .clr { position: absolute; right: 0; top: 0; width: 44px; height: 44px; border: 0; background: none; color: var(--ink-2); font: 700 var(--t-lg)/1 var(--f-body); }
</style>
