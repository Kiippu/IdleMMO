<script lang="ts">
  // War Room > Loadout > Fight: hero, eight slots, stats, and a filterable gear list where a tap equips and shows the change inline.
  import ItemIcon from '../../art/ItemIcon.svelte';
  import { DATA } from '@guildwright/engine';
  import { engine } from '../../engine/store.svelte';
  import { engineClient } from '../../engine/client';
  import { openItem } from '../../overlays/itemRef.svelte';
  import { fmtN } from '../../format';
  import { ui } from '../../ui.svelte';
  import HeroPreview from './HeroPreview.svelte';
  import { groupGear, protectedUids } from './gearStack';
  import { statText } from '../../engine/format';
  import { FIGHT_SLOTS, SLOT_LABEL, ELEMENTS, fightTags, fightDeltaChips, elementName, type FightSlot } from './gearUi';

  const SORTS = [['best', 'Best first'], ['rarity', 'Rarity'], ['name', 'Name'], ['new', 'Newest']] as const;
  const RANK = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
  const SLOT_CHIPS = ['weapon', 'offhand', 'head', 'chest', 'legs', 'ring', 'amulet'] as const;
  const STAT_CHIPS: Array<[string, string]> = [['atk', 'Attack'], ['def', 'Defence'], ['heal', 'Healing'], ['hp', 'HP'], ['fire', 'Fire'], ['frost', 'Frost'], ['venom', 'Poison'], ['holy', 'Holy']];
  const items: Record<string, any> = (DATA as any).items;
  const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

  let snap = $derived(engine.snapshot);
  let view = $derived(engine.derived);
  let equipped = $derived<Record<string, string | null>>(snap?.equipped ?? {});
  let bag = $derived<any[]>(snap?.gear ?? []);
  let stats = $derived<any>(view?.playerStats ?? null);
  const nameOf = (g: any) => view?.gearNames?.[g.uid] ?? items[g.itemId]?.name ?? g.itemId;
  let wornBy = $derived.by(() => {
    const m: Record<string, any> = {};
    for (const s of FIGHT_SLOTS) { const uid = equipped[s]; m[s] = uid ? bag.find((g) => g.uid === uid) ?? null : null; }
    return m;
  });
  let twoHand = $derived(items[wornBy.weapon?.itemId]?.hands === 2);

  let slotF = $state<'all' | (typeof SLOT_CHIPS)[number]>('all');
  let statF = $state<string>('all');
  let ringTarget = $state<'ring1' | 'ring2' | null>(null);
  let q = $state('');
  let sort = $state<(typeof SORTS)[number][0]>('best');
  let msg = $state('');
  let msgBad = $state(false);

  let deltas = $derived<Record<string, any>>((view?.extras as any)?.equipDeltas ?? {});
  const power = (g: any) => deltas[g.uid]?.power ?? 0;
  let list = $derived.by(() => {
    const needle = q.trim().toLowerCase();
    const worn = new Set(Object.values(equipped));
    const rows = bag.filter((g) => !worn.has(g.uid) && items[g.itemId]?.section === 'fight')
      .filter((g) => slotF === 'all' || items[g.itemId].slot === slotF)
      .filter((g) => statF === 'all' || fightTags(g, items[g.itemId]).has(statF))
      .filter((g) => !needle || nameOf(g).toLowerCase().includes(needle));
    const idx = new Map(bag.map((g, i) => [g.uid, i] as const));
    return rows.sort((a, b) => sort === 'name' ? nameOf(a).localeCompare(nameOf(b))
      : sort === 'rarity' ? RANK.indexOf(b.rarity) - RANK.indexOf(a.rarity) || power(b) - power(a)
      : sort === 'new' ? (idx.get(b.uid) ?? 0) - (idx.get(a.uid) ?? 0)
      : power(b) - power(a));
  });
  // Identical plain common pieces collapse into one row with a count; equipping a stack wears one piece.
  let rowsG = $derived(groupGear(list, protectedUids(equipped, snap?.loadouts ?? []), (DATA as any).grades, (g: any) => (view?.extras as any)?.gearInfo?.[g.uid]?.stackKey));
  let totalGear = $derived(bag.filter((g) => items[g.itemId]?.section === 'fight' && !Object.values(equipped).includes(g.uid)).length);

  // Worn element shares and resistances, only when above zero.
  let elemLines = $derived.by(() => {
    const out: string[] = [];
    for (const e of ELEMENTS) {
      const v = stats?.elements?.[e] ?? 0; if (v >= 0.05) out.push(statText(e, v));
    }
    return out;
  });
  let wardLines = $derived.by(() => {
    const out: string[] = [];
    for (const e of ELEMENTS) {
      const v = stats?.wards?.[e] ?? 0; if (v >= 0.05) out.push(statText(`ward_${e}`, v));
    }
    return out;
  });

  async function equip(g: any) {
    msg = ''; msgBad = false;
    const chips = fightDeltaChips(deltas[g.uid]).filter((c) => !/Power/.test(c.text));
    try {
      const slot = items[g.itemId]?.slot === 'ring' && ringTarget ? ringTarget : undefined;
      const res: any = await engineClient.equip(g.uid, slot);
      if (res && res.ok === false) { msg = res.reason || 'Could not equip.'; msgBad = true; return; }
      msg = `Equipped ${nameOf(g)}.${chips.length ? ` ${chips.map((c) => c.text).join(', ')}.` : ''}`;
      ringTarget = null;
    } catch (e) { console.error(e); msg = 'Could not equip.'; msgBad = true; }
  }
  function slotTap(slot: FightSlot) {
    if (slot === 'offhand' && twoHand) { msg = 'A two-hand weapon blocks the offhand. Swap to a one-hand weapon to use it.'; msgBad = false; return; }
    const g = wornBy[slot];
    if (g) openItem({ itemId: g.itemId, uid: g.uid });
    else {
      slotF = (slot.startsWith('ring') ? 'ring' : slot) as typeof slotF; statF = 'all';
      ringTarget = slot.startsWith('ring') ? (slot as 'ring1' | 'ring2') : null;
      msg = `Nothing worn in ${SLOT_LABEL[slot].toLowerCase()}. Pick one below.`; msgBad = false;
    }
  }
  const slotSelected = (slot: FightSlot) => (slot.startsWith('ring') ? slotF === 'ring' && (ringTarget === slot || (!ringTarget && slot === 'ring1')) : slotF === slot);
  function clearFilters() { slotF = 'all'; statF = 'all'; q = ''; ringTarget = null; }
</script>

<section class="group">
  <HeroPreview />
  <ul class="slots" aria-label="Worn gear">
    {#each FIGHT_SLOTS as slot}
      {@const g = wornBy[slot]}
      {@const blocked = slot === 'offhand' && twoHand}
      <li>
        <button type="button" class="slot" class:filled={!!g} class:blocked class:sel={slotF !== 'all' && slotSelected(slot)} style:--ink-r={g ? `var(--r-${g.rarity})` : undefined}
          aria-label={blocked ? 'Offhand: blocked by your two-hand weapon' : g ? `${SLOT_LABEL[slot]}: ${nameOf(g)}. Tap for details` : `${SLOT_LABEL[slot]}: empty. Tap to see gear for this slot`} onclick={() => slotTap(slot)}>
          {#if g}<ItemIcon id={g.itemId} rarity={g.rarity} />{:else if blocked}<span class="dot" aria-hidden="true">×</span>{:else}<span class="dot" aria-hidden="true">·</span>{/if}
        </button>
        <small>{blocked ? 'Blocked' : SLOT_LABEL[slot]}</small>
      </li>
    {/each}
  </ul>
  {#if stats}
    <dl class="stats">
      <div><dt>HP</dt><dd class="num">{fmtN(Math.round(stats.maxHp))}</dd></div>
      <div><dt>Attack</dt><dd class="num">{fmtN(Math.round(stats.atk))}</dd></div>
      <div><dt>Defence</dt><dd class="num">{fmtN(Math.round(stats.def))}</dd></div>
      <div><dt>Healing</dt><dd class="num">{fmtN(Math.round(stats.heal))}</dd></div>
    </dl>
    {#if elemLines.length || wardLines.length}
      <p class="meta elem">
        {#if elemLines.length}<span class="num">{elemLines.join(', ')}</span>{/if}
        {#if wardLines.length}<span class="num">{wardLines.join(', ')}</span>{/if}
      </p>
    {/if}
  {/if}
</section>

<section class="group">
  <h3>Gear in your bag</h3>
  <p class="fb" class:bad={msgBad} role="status" aria-live="polite">{msg}</p>
  {#if totalGear === 0}
    <p class="muted">No spare fight gear. Craft some in the Workshop or buy a piece in the Shop.</p>
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
      <button type="button" class="btn chip" aria-pressed={slotF === 'all'} onclick={() => { slotF = 'all'; ringTarget = null; }}>All slots</button>
      {#each SLOT_CHIPS as s}<button type="button" class="btn chip" aria-pressed={slotF === s} onclick={() => { slotF = s; if (s !== 'ring') ringTarget = null; }}>{SLOT_LABEL[s]}</button>{/each}
    </div>
    <div class="chips" role="group" aria-label="Stat">
      <button type="button" class="btn chip" aria-pressed={statF === 'all'} onclick={() => (statF = 'all')}>Any stat</button>
      {#each STAT_CHIPS as [id, label]}<button type="button" class="btn chip" aria-pressed={statF === id} onclick={() => (statF = id)}>{label}</button>{/each}
    </div>
    {#if list.length === 0}
      <p class="muted">Nothing matches.</p>
      <button type="button" class="btn next" onclick={clearFilters}>Clear filters</button>
    {:else}
      <ul class="gear">
        {#each rowsG as row, i (row.key ? `s:${row.key}` : row.items[0].uid)}
          {@const g = row.items[0]}
          {@const n = row.items.length}
          {@const it = items[g.itemId]}
          {@const dl = fightDeltaChips(deltas[g.uid]).filter((c) => !/Power/.test(c.text))}
          <li style:--ink-r={`var(--r-${g.rarity})`}>
            <button type="button" class="eqbtn" data-guide={i === 0 ? 'equip' : undefined} aria-label="Equip {nameOf(g)}{n > 1 ? `, you have ${n}` : ''}" onclick={() => equip(g)}>
              <ItemIcon id={g.itemId} rarity={g.rarity} />
              <span class="info">
                <span class="name">{nameOf(g)}{#if n > 1} <span class="cnt num">×{n}</span>{/if}</span>
                <span class="meta">{SLOT_LABEL[it.slot]}{#if it.element} · {elementName(it.element)} damage{/if} · {cap(g.rarity)}{#if it.slot === 'offhand' && twoHand} · needs a one-hand weapon{/if}</span>
                <span class="deltas">
                  {#if dl.length === 0}<span class="d same">Same as worn</span>
                  {:else}{#each dl as d}<span class="d num" class:up={d.d > 0} class:down={d.d < 0}>{d.text}</span>{/each}{/if}
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
  .elem { margin: 6px 0 0; display: flex; flex-wrap: wrap; gap: 2px 12px; }
  .row2 { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
  .next { margin-top: 8px; }
  .slots { list-style: none; margin: 8px 0 0; padding: 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .slots li { display: grid; justify-items: center; gap: 2px; }
  .slots small { color: var(--ink-3); font-size: var(--t-xs); }
  .slot { width: 48px; height: 48px; min-height: 44px; padding: 0; display: grid; place-items: center; background: var(--paper); border: 1px dashed var(--rule); color: var(--ink-3); }
  .slot.filled { border: 2px solid var(--ink-r); color: var(--ink-r); }
  .slot.blocked { background: var(--sunk); opacity: .6; }
  .slot.sel { outline: 2px solid var(--woad); outline-offset: 1px; }
  .dot { font: 700 var(--t-lg)/1 var(--f-display); }
  .stats { margin: 8px 0 0; display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
  .stats div { padding: 6px 8px; background: var(--sunk); border: 1px solid var(--rule); display: grid; gap: 3px; min-width: 0; }
  .stats dt { margin: 0; font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3); letter-spacing: .02em; text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; }
  .stats dd { margin: 0; font-weight: 700; font-size: var(--t-md); line-height: 1; color: var(--ink); }
  .fb { margin: 0 0 6px; min-height: 1.3em; color: var(--ok); font-size: var(--t-sm); font-weight: 700; }
  .fb.bad { color: var(--bad); }
  .filters { display: flex; gap: 6px; margin-bottom: 6px; }
  .sw { flex: 1; min-width: 0; position: relative; }
  .search { width: 100%; padding-right: 44px; }
  .clr { position: absolute; right: 0; top: 0; width: 44px; height: 44px; border: 0; background: none; color: var(--ink-2); font: 700 var(--t-lg)/1 var(--f-body); }
  .cyc { flex: none; padding: 0 12px; white-space: nowrap; }
  .chips { display: flex; gap: 6px; margin-bottom: 6px; overflow-x: auto; scrollbar-width: none; padding-right: 32px; -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent); mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent); }
  .chips::-webkit-scrollbar { display: none; }
  .chip { flex: none; padding: 0 12px; white-space: nowrap; }
  .gear { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 6px; }
  .gear li { display: flex; align-items: stretch; background: var(--paper); border: 1px solid var(--rule); border-left: 3px solid var(--ink-r); }
  .eqbtn { flex: 1; min-width: 0; min-height: 52px; display: flex; align-items: center; gap: 10px; padding: 6px 8px; background: none; border: 0; text-align: left; color: var(--ink); }
  .eqbtn:hover { background: var(--woad-soft); }
  .info { display: grid; gap: 2px; min-width: 0; }
  .name { font: 700 var(--t-sm)/1.15 var(--f-body); color: var(--ink-r); }
  .cnt { margin-left: 6px; color: var(--ink-2); font: 700 var(--t-sm)/1 var(--f-num); }
  .deltas { display: flex; flex-wrap: wrap; gap: 4px 8px; }
  .d { font: 700 var(--t-xs)/1.2 var(--f-num); }
  .d.up { color: var(--ok); } .d.down { color: var(--bad); } .d.same { color: var(--ink-3); font-weight: 400; font-family: var(--f-body); }
  .ibtn { flex: none; width: 44px; min-height: 44px; border: 0; border-left: 1px solid var(--rule); background: none; color: var(--ink-2); font: 700 var(--t-md)/1 var(--f-display); }
</style>
