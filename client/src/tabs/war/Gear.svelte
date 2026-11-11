<script lang="ts">
  // War Room > Loadout: the gear screen. Hero, six slots, stats, and a filterable gear list where a tap equips.
  import ItemIcon from '../../art/ItemIcon.svelte';
  import { DATA } from '@guildwright/engine';
  import { engine } from '../../engine/store.svelte';
  import { engineClient } from '../../engine/client';
  import { openItem } from '../../overlays/itemRef.svelte';
  import { fmtN } from '../../format';
  import { ui } from '../../ui.svelte';
  import HeroPreview from './HeroPreview.svelte';
  const STAT_LABEL: Record<string, string> = { hp: 'HP', atk: 'Attack', def: 'Defence', heal: 'Heal', power: 'Power' };
  const DKEYS = ['hp', 'atk', 'def', 'heal', 'power'] as const;

  const SLOTS = ['weapon', 'offhand', 'head', 'chest', 'legs', 'ring'] as const;
  const SLOT_LABEL: Record<string, string> = { weapon: 'Weapon', offhand: 'Offhand', head: 'Head', chest: 'Chest', legs: 'Legs', ring: 'Ring' };
  const SORTS = [['best', 'Best first'], ['rarity', 'Rarity'], ['name', 'Name'], ['new', 'Newest']] as const;
  const RANK = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
  const items: Record<string, any> = (DATA as any).items;
  const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

  let snap = $derived(engine.snapshot);
  let view = $derived(engine.derived);
  let equipped = $derived<Record<string, string | null>>(snap?.equipped ?? {});
  let bag = $derived<any[]>(snap?.gear ?? []);
  let stats = $derived(view?.playerStats ?? null);
  let status = $derived(view?.raidStatus ?? null);
  const nameOf = (g: any) => view?.gearNames?.[g.uid] ?? items[g.itemId]?.name ?? g.itemId;
  let wornBy = $derived.by(() => {
    const m: Record<string, any> = {};
    for (const s of SLOTS) { const uid = equipped[s]; m[s] = uid ? bag.find((g) => g.uid === uid) ?? null : null; }
    return m;
  });

  let slotF = $state<'all' | (typeof SLOTS)[number]>('all');
  let q = $state('');
  let sort = $state<(typeof SORTS)[number][0]>('best');
  let msg = $state('');
  let msgBad = $state(false);

  let deltas = $derived<Record<string, any>>((view?.extras as any)?.equipDeltas ?? {});
  const power = (g: any) => deltas[g.uid]?.power ?? 0;
  const dlOf = (g: any) => DKEYS.map((k) => ({ k, d: Math.round((deltas[g.uid]?.[k] ?? 0) * 10) / 10 })).filter((x) => x.d !== 0);
  let list = $derived.by(() => {
    const needle = q.trim().toLowerCase();
    const worn = new Set(Object.values(equipped));
    const rows = bag.filter((g) => !worn.has(g.uid) && items[g.itemId]?.slot)
      .filter((g) => slotF === 'all' || items[g.itemId].slot === slotF)
      .filter((g) => !needle || nameOf(g).toLowerCase().includes(needle));
    const idx = new Map(bag.map((g, i) => [g.uid, i] as const));
    return rows.sort((a, b) => sort === 'name' ? nameOf(a).localeCompare(nameOf(b))
      : sort === 'rarity' ? RANK.indexOf(b.rarity) - RANK.indexOf(a.rarity) || power(b) - power(a)
      : sort === 'new' ? (idx.get(b.uid) ?? 0) - (idx.get(a.uid) ?? 0)
      : power(b) - power(a));
  });
  let totalGear = $derived(bag.filter((g) => items[g.itemId]?.slot && !Object.values(equipped).includes(g.uid)).length);

  async function equip(g: any) {
    msg = ''; msgBad = false;
    if (status?.prepLocked) { msg = status.prepReason || 'Gear is locked while the raid runs.'; msgBad = true; return; }
    try {
      const res: any = await engineClient.equip(g.uid);
      if (res && res.ok === false) { msg = res.reason || 'Could not equip.'; msgBad = true; return; }
      msg = `Equipped ${nameOf(g)}.`;
    } catch (e) { console.error(e); msg = 'Could not equip.'; msgBad = true; }
  }
  function slotTap(slot: (typeof SLOTS)[number]) {
    const g = wornBy[slot];
    if (g) openItem({ itemId: g.itemId, uid: g.uid });
    else { slotF = slot; msg = `Nothing worn in ${SLOT_LABEL[slot].toLowerCase()}. Pick one below.`; msgBad = false; }
  }
  const fmtDelta = (d: { k: any; d: number }) => `${d.d > 0 ? '+' : '−'}${Math.abs(d.d)} ${STAT_LABEL[d.k]}`;
</script>

<section class="group">
  <HeroPreview />
  <ul class="slots" aria-label="Worn gear">
    {#each SLOTS as slot}
      {@const g = wornBy[slot]}
      <li>
        <button type="button" class="slot" class:filled={!!g} class:sel={slotF === slot} style:--ink-r={g ? `var(--r-${g.rarity})` : undefined}
          aria-label={g ? `${SLOT_LABEL[slot]}: ${nameOf(g)}. Tap for details or to take off` : `${SLOT_LABEL[slot]}: empty. Tap to see gear for this slot`} onclick={() => slotTap(slot)}>
          {#if g}<ItemIcon id={g.itemId} rarity={g.rarity} />{:else}<span class="dot" aria-hidden="true">·</span>{/if}
        </button>
        <small>{SLOT_LABEL[slot]}</small>
      </li>
    {/each}
  </ul>
  {#if stats}
    <dl class="stats">
      <div><dt>HP</dt><dd class="num">{fmtN(Math.round(stats.maxHp))}</dd></div>
      <div><dt>Attack</dt><dd class="num">{fmtN(Math.round(stats.atk))}</dd></div>
      <div><dt>Defence</dt><dd class="num">{fmtN(Math.round(stats.def))}</dd></div>
      <div><dt>Heal</dt><dd class="num">{fmtN(Math.round(stats.heal))}</dd></div>
    </dl>
  {/if}
</section>

<section class="group">
  <h3>Gear in your bag</h3>
  <p class="fb" class:bad={msgBad} role="status" aria-live="polite">{msg}</p>
  {#if totalGear === 0}
    <p class="muted">No spare gear. Craft some in the Workshop or buy a piece in the Shop.</p>
    <div class="row2">
      <button type="button" class="btn" onclick={() => (ui.goTab = 'Workshop')}>Go to the Workshop</button>
      <button type="button" class="btn" onclick={() => (ui.goTab = 'Shop')}>Open the Shop</button>
    </div>
  {:else}
    <div class="filters">
      <div class="sw"><input type="search" class="search" placeholder="Search gear" aria-label="Search gear" bind:value={q} />{#if q}<button type="button" class="clr" aria-label="Clear search" onclick={() => (q = '')}>×</button>{/if}</div>
      <button type="button" class="btn ghost cyc" aria-label="Sort: {SORTS.find((x) => x[0] === sort)?.[1]}. Tap to change" onclick={() => (sort = SORTS[(SORTS.findIndex((x) => x[0] === sort) + 1) % SORTS.length][0])}>{SORTS.find((x) => x[0] === sort)?.[1]}</button>
    </div>
    <div class="chips" role="group" aria-label="Slot">
      <button type="button" class="btn chip" aria-pressed={slotF === 'all'} onclick={() => (slotF = 'all')}>All</button>
      {#each SLOTS as s}<button type="button" class="btn chip" aria-pressed={slotF === s} onclick={() => (slotF = s)}>{SLOT_LABEL[s]}</button>{/each}
    </div>
    {#if list.length === 0}
      <p class="muted">Nothing matches.</p>
      <button type="button" class="btn next" onclick={() => { slotF = 'all'; q = ''; }}>Clear filters</button>
    {:else}
      <ul class="gear">
        {#each list as g, i (g.uid)}
          {@const it = items[g.itemId]}
          {@const dl = dlOf(g)}
          <li style:--ink-r={`var(--r-${g.rarity})`}>
            <button type="button" class="eqbtn" data-guide={i === 0 ? 'equip' : undefined} aria-label="Equip {nameOf(g)}" onclick={() => equip(g)}>
              <ItemIcon id={g.itemId} rarity={g.rarity} />
              <span class="info">
                <span class="name">{nameOf(g)}</span>
                <span class="meta">{SLOT_LABEL[it.slot]} · {cap(g.rarity)}</span>
                <span class="deltas">
                  {#if dl.length === 0}<span class="d same">Same as worn</span>
                  {:else}{#each dl as d}<span class="d num" class:up={d.d > 0} class:down={d.d < 0}>{fmtDelta(d)}</span>{/each}{/if}
                </span>
              </span>
            </button>
            <button type="button" class="ibtn" aria-label="Details for {nameOf(g)}" onclick={() => openItem({ itemId: g.itemId, uid: g.uid })}>i</button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</section>

<style>
  .group + .group { margin-top: 16px; }
  .group h3 { margin: 0 0 8px; font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3); letter-spacing: .08em; text-transform: uppercase; }
  .muted { margin: 0; padding: 12px; background: var(--paper); border: 1px solid var(--rule); color: var(--ink-3); font-size: var(--t-sm); }
  .meta { color: var(--ink-3); font-size: var(--t-xs); }
  .row2 { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
  .next { margin-top: 8px; }
  .slots { list-style: none; margin: 8px 0 0; padding: 0; display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; }
  .slots li { display: grid; justify-items: center; gap: 2px; }
  .slots small { color: var(--ink-3); font-size: 10px; }
  .slot { width: 44px; height: 44px; min-height: 44px; padding: 0; display: grid; place-items: center; background: var(--paper); border: 1px dashed var(--rule); color: var(--ink-3); }
  .slot.filled { border: 2px solid var(--ink-r); color: var(--ink-r); }
  .slot.sel { outline: 2px solid var(--woad); outline-offset: 1px; }
  .dot { font: 700 var(--t-lg)/1 var(--f-display); }
  .stats { margin: 8px 0 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .stats div { padding: 6px 8px; background: var(--sunk); border: 1px solid var(--rule); display: grid; gap: 3px; }
  .stats dt { margin: 0; font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3); letter-spacing: .04em; text-transform: uppercase; }
  .stats dd { margin: 0; font-weight: 700; font-size: var(--t-md); line-height: 1; color: var(--ink); }
  .fb { margin: 0 0 6px; min-height: 1.3em; color: var(--ok); font-size: var(--t-sm); font-weight: 700; }
  .fb.bad { color: var(--bad); }
  .filters { display: flex; gap: 6px; margin-bottom: 6px; }
  .sw { flex: 1; min-width: 0; position: relative; }
  .search { width: 100%; padding-right: 44px; }
  .clr { position: absolute; right: 0; top: 0; width: 44px; height: 44px; border: 0; background: none; color: var(--ink-2); font: 700 var(--t-lg)/1 var(--f-body); }
  .cyc { flex: none; padding: 0 12px; white-space: nowrap; }
  .chips { display: flex; gap: 6px; margin-bottom: 8px; overflow-x: auto; scrollbar-width: none; }
  .chips::-webkit-scrollbar { display: none; }
  .chip { flex: none; padding: 0 12px; white-space: nowrap; }
  .gear { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .gear li { display: flex; align-items: stretch; background: var(--paper); border: 1px solid var(--rule); border-left: 3px solid var(--ink-r); }
  .eqbtn { flex: 1; min-width: 0; min-height: 52px; display: flex; align-items: center; gap: 10px; padding: 6px 8px; background: none; border: 0; text-align: left; color: var(--ink); }
  .eqbtn:hover { background: var(--woad-soft); }
  .info { display: grid; gap: 2px; min-width: 0; }
  .name { font: 700 var(--t-sm)/1.15 var(--f-body); color: var(--ink-r); }
  .deltas { display: flex; flex-wrap: wrap; gap: 4px 8px; }
  .d { font: 700 var(--t-xs)/1.2 var(--f-num); }
  .d.up { color: var(--ok); } .d.down { color: var(--bad); } .d.same { color: var(--ink-3); font-weight: 400; font-family: var(--f-body); }
  .ibtn { flex: none; width: 44px; min-height: 44px; border: 0; border-left: 1px solid var(--rule); background: none; color: var(--ink-2); font: 700 var(--t-md)/1 var(--f-display); }
</style>
