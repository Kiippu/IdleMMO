<script lang="ts">
  import { GRADE_NAMES } from '../engine/grades';
  import ItemIcon from '../art/ItemIcon.svelte';
  // General store: the town's NPC shop. Hourly stock at a mark-up; sells your spare items at a floor price.
  import { DATA } from '@guildwright/engine';
  import { engine } from '../engine/store.svelte';
  import { engineClient, type StoreResult } from '../engine/client';
  import { fmtG, fmtN, fmtDuration, fmtSecs } from '../format';
  import { askNumber, confirmSheet, noticeSheet } from '../overlays/confirm.svelte';
  import { markDone } from '../guide.svelte';
  import { ui } from '../ui.svelte';
  import { openItem } from '../overlays/itemRef.svelte';
  import { reducedMotion } from '../settings.svelte';
  import { onMount } from 'svelte';

  type Props = { onContracts: () => void };
  let { onContracts }: Props = $props();

  const GRADE_LABEL = GRADE_NAMES;
  const SLOT_LABEL: Record<string, string> = { weapon: 'Weapon', offhand: 'Offhand', head: 'Head', chest: 'Chest', legs: 'Legs', ring: 'Ring', ring1: 'Ring', ring2: 'Ring', amulet: 'Amulet' };
  const itemsMap: Record<string, any> = (DATA as any).items;
  const itemRarity: Record<string, string> = (DATA as any).itemRarity ?? {};
  const itemName = (id: string) => itemsMap[id]?.name ?? id;

  let snap = $derived(engine.snapshot);
  let store = $derived<any>(engine.derived?.extras?.store ?? null);
  // Ticks every second. Game clock = last engine clock + wall time since it arrived, so the countdown never stalls between engine updates.
  let wall = $state(Date.now());
  onMount(() => { const t = setInterval(() => (wall = Date.now()), 1000); return () => clearInterval(t); });
  let anchor = $state({ eng: engine.derived?.now ?? 0, wall: Date.now() });
  let engNow = $derived<number | null>(engine.derived?.now ?? null);
  $effect(() => { if (engNow != null) anchor = { eng: engNow, wall: Date.now() }; });
  let now = $derived<number>(engNow == null || !anchor.eng ? wall : anchor.eng + Math.max(0, wall - anchor.wall));
  let rawLeft = $derived(store ? Math.ceil((store.refreshesAt - now) / 1000) : NaN);
  // Never show a countdown that can't be right (clock not synced yet): stock rolls hourly, so valid is 0..1h.
  let clockOk = $derived(Number.isFinite(rawLeft) && rawLeft > -5 && rawLeft <= 3605);
  let leftSec = $derived(clockOk ? Math.max(0, rawLeft) : 0);
  const fmtClock = (sec: number) => {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const p = (n: number) => String(n).padStart(2, '0');
    return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
  };
  const speakLeft = (sec: number) => (sec >= 3600 ? `${Math.floor(sec / 3600)} hours ` : '') + (sec >= 60 ? `${Math.floor((sec % 3600) / 60)} minutes` : `${sec} seconds`);
  const backIn = (sec: number) => (!clockOk ? 'soon' : sec >= 60 ? `${Math.ceil(sec / 60)}m` : `${Math.max(1, sec)}s`);
  let gold = $derived(Math.floor(snap?.gold ?? 0));
  let inv = $derived<Record<string, number[]>>(snap?.inv ?? {});
  let gear = $derived<any[]>(snap?.gear ?? []);
  let equipped = $derived.by<Record<string, string | null>>(() => {
    const m: Record<string, string | null> = { ...(snap?.equipped ?? {}) };
    for (const [set, pieces] of Object.entries<any>((snap as any)?.workOutfit ?? {})) for (const [p, uid] of Object.entries<any>(pieces ?? {})) m[`outfit:${set}:${p}`] = uid;
    for (const [sk, uid] of Object.entries<any>((snap as any)?.tools ?? {})) m[`tool:${sk}`] = uid;
    return m;
  });
  let slots = $derived<any[]>(store?.slots ?? []);
  let resources = $derived(slots.filter((s) => s.kind !== 'gear'));
  let gearSlots = $derived(slots.filter((s) => s.kind === 'gear'));
  // "New stock" cue: when the hour rolls over while the Shop is open, tag tiles whose item changed. The tags last until the Shop tab unmounts (leaving the tab); item sheets overlay it, so they don't count.
  let prevHour: number | null = null;
  let prevItems: Record<number, string> = {};
  let fresh = $state<Record<number, boolean>>({});
  let flash = $state(false);
  $effect(() => {
    if (!store) return;
    const hour = store.hour as number;
    const items: Record<number, string> = {};
    for (const s of store.slots as any[]) items[s.slot] = s.itemId;
    if (prevHour != null && hour !== prevHour) {
      const f: Record<number, boolean> = {};
      for (const k of Object.keys(items)) if (prevItems[+k] !== items[+k]) f[+k] = true;
      fresh = f; flash = !reducedMotion();
    }
    prevHour = hour; prevItems = items;
  });
  let anyFresh = $derived(Object.keys(fresh).length > 0);
  let sellMult = $derived<number>(store?.sellMult ?? 0.4);

  // One entry per item; each holds its grades so the list stays short.
  type SellGroup = { id: string; name: string; rarity: string; total: number; value: number; grades: Array<{ grade: number; qty: number; price: number }> };
  // The engine groups the bag for us (extras.sellList); the local fallback only covers an engine without it.
  let sellGroups = $derived.by(() => {
    const list = engine.derived?.extras?.sellList;
    if (list) return list.filter((r) => r.kind !== 'gear').map((r): SellGroup => ({ id: r.itemId, name: r.name, rarity: r.rarity, total: r.qty, value: r.gold, grades: r.grades.map((g) => ({ grade: g.grade, qty: g.qty, price: g.price })) }));
    const out: SellGroup[] = [];
    for (const id of Object.keys(inv)) {
      if (itemsMap[id]?.kind === 'gear') continue;
      const grades: SellGroup['grades'] = [];
      (inv[id] ?? []).forEach((q, g) => { if (q > 0) grades.push({ grade: g, qty: q, price: store?.sellPrices?.[id]?.[g] ?? 0 }); });
      if (!grades.length) continue;
      out.push({ id, name: itemName(id), rarity: itemRarity[id] ?? 'common', total: grades.reduce((a, g) => a + g.qty, 0), value: grades.reduce((a, g) => a + g.qty * g.price, 0), grades });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  });
  let guideId = $derived((sellGroups.find((g) => g.id !== 'bread') ?? sellGroups[0])?.id ?? null);
  let sellPct = $derived(Math.round(sellMult * 100));
  let sellGear = $derived(gear.filter((g) => !Object.values(equipped).includes(g.uid)));


  // Buy / Sell switch. ui.shopSub (set by the guide) can jump straight to Sell.
  let view = $state<'buy' | 'sell'>('buy');
  $effect(() => { const v = ui.shopSub; if (v) { view = v; ui.shopSub = null; } });
  // Inline feedback instead of toasts: one polite line under the switch.
  let msg = $state('');
  let msgBad = $state(false);
  function say(t: string, bad = false) { msg = t; msgBad = bad; }

  function report(res: StoreResult | undefined, okText: string) {
    if (!res) return;
    if (res.ok === false) { say(res.reason || 'Could not complete.', true); return; }
    say(okText);
  }


  async function sell(r: { id: string; name: string; grade: number; qty: number; price: number }) {
    const qty = await askNumber({
      title: `Sell ${r.name}`,
      body: `${GRADE_LABEL[r.grade]} · the shop pays ${fmtG(r.price)} each (${sellPct}% of value). Crewmates and contracts pay more.`,
      number: { min: 1, max: r.qty, value: Math.min(r.qty, 1), label: 'How many?', lines: (n) => [`You get ${fmtG(n * r.price)}`, `Gold after ${fmtG(gold + n * r.price)}`] },
      confirmLabel: 'Sell',
    });
    if (qty == null) return;
    try { const res = await engineClient.storeSell(r.id, r.grade, qty); report(res, `Sold ${qty} ${r.name} for ${fmtG(res.gold)}.`); if (res.ok) markDone('sell'); }
    catch (err) { console.error('storeSell failed', err); }
  }
  async function sellAllGrades(g: SellGroup) {
    const ok = await confirmSheet({
      title: `Sell all ${g.name}?`,
      body: `${fmtN(g.total)} across ${g.grades.length} ${g.grades.length === 1 ? 'grade' : 'grades'}. The shop pays ${fmtG(g.value)} in total (${sellPct}% of value). Crewmates and contracts pay more.`,
      confirmLabel: `Sell for ${fmtG(g.value)}`,
    });
    if (!ok) return;
    try {
      const res = await engineClient.storeSellAll(g.id);
      if (res.ok === false) { say(res.reason || 'Could not sell.', true); return; }
      say(`Sold ${fmtN(res.qty)} ${g.name} for ${fmtG(res.gold)}.`); markDone('sell');
    } catch (err) { console.error('storeSellAll failed', err); }
  }
  async function sellOneGear(g: any) {
    const price = store?.gearSellPrices?.[g.uid] ?? 0;
    const name = engine.derived?.gearNames?.[g.uid] ?? itemName(g.itemId);
    if (!(await confirmSheet({ title: `Sell ${name}?`, body: `The shop pays ${fmtG(price)} (${sellPct}% of value). A crewmate or contract may pay more.`, confirmLabel: `Sell for ${fmtG(price)}`, danger: true }))) return;
    try { const res = await engineClient.storeSellGear(g.uid); report(res, `Sold ${name} for ${fmtG(res.gold)}.`); if (res.ok) markDone('sell'); }
    catch (err) { console.error('storeSellGear failed', err); }
  }
  const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
</script>

<h2 class="title">General store</h2>

{#if !store}
  <p class="muted">The shutters are down. Check back shortly.</p>
{:else}
  <div class="restock card" role="timer" aria-label={clockOk ? `New stock in ${speakLeft(leftSec)}` : 'New stock timer'}>
    <svg class="clk" viewBox="0 0 16 16" width="22" height="22" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 4.2V8l2.6 1.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square"/></svg>
    <span class="rtxt"><span class="rl">New stock in</span><span class="rt num">{clockOk ? fmtClock(leftSec) : '--:--'}</span></span>
    <span class="have">You have <span class="num brass">{fmtG(gold)}</span></span>
  </div>
  {#if anyFresh}<p class="newcue" role="status">New stock has arrived. Look for the tags.</p>{/if}

  <div class="seg" role="group" aria-label="Shop mode">
    <button type="button" class="btn" aria-pressed={view === 'buy'} onclick={() => (view = 'buy')}>Buy</button>
    <button type="button" class="btn" aria-pressed={view === 'sell'} onclick={() => (view = 'sell')}>Sell</button>
  </div>
  <p class="fb" class:bad={msgBad} role="status" aria-live="polite">{msg}</p>

  {#if view === 'buy'}
  {#snippet tileBtn(itemId: string, name: string, rarity: string, price: number, out: boolean, isNew = false)}
    <li>
      <button type="button" class="tile card" class:out class:isnew={isNew} class:flash={isNew && flash} onclick={() => openItem({ itemId })} aria-label="{name}, {out ? `sold out, back in ${backIn(leftSec)}` : fmtG(price)}{isNew ? ', new' : ''}">
        {#if isNew && !out}<span class="newtag">New</span>{/if}
        <span class="sq" style:color={`var(--r-${rarity})`} style:border-color={`var(--r-${rarity})`} aria-hidden="true"><ItemIcon id={itemId} {rarity} /></span>
        <span class="nm">{name}</span>
        {#if out}<span class="soldout"><span>Sold out</span><span class="back num">{clockOk ? 'Back in ' : 'Back '}{backIn(leftSec)}</span></span>{:else}<span class="price num">{fmtG(price)}</span>{/if}
      </button>
    </li>
  {/snippet}
  <section class="group">
    <h3>Resources <span class="sub">rotating stock</span></h3>
    <ul class="tiles">
      {#each resources as s (s.slot)}{@render tileBtn(s.itemId, s.name, s.rarity, s.price, s.qty < 1, !!fresh[s.slot])}{/each}
    </ul>
  </section>

  <section class="group">
    <h3>Gear <span class="sub">rotating stock</span></h3>
    <ul class="tiles">
      {#each gearSlots as s (s.slot)}{@render tileBtn(s.itemId, s.name, s.rarity, s.price, s.qty < 1, !!fresh[s.slot])}{/each}
    </ul>
  </section>

  {:else}
  <section class="group">
    <h3>Sell to the store</h3>
    <p class="note">Shop buys at <span class="num">{sellPct}%</span> of value. Crewmates and contracts pay more.</p>
    <button type="button" class="link" onclick={onContracts}>See Contracts</button>
    {#if sellGroups.length === 0 && sellGear.length === 0}
      <p class="muted">Nothing to sell yet.</p>
      <button type="button" class="btn next" onclick={() => (ui.goTab = 'Workshop')}>Go gather something</button>
    {:else}
      <ul class="list">
        {#each sellGroups as g (g.id)}
          <li class="grp" data-guide={g.id === guideId ? 'sell' : undefined}>
            <div class="ghead">
              <button type="button" class="sinfo" onclick={() => openItem({ itemId: g.id })}>
                <ItemIcon id={g.id} rarity={g.rarity} />
                <span class="name" style:color={`var(--r-${g.rarity})`}>{g.name}</span>
                <span class="meta"><span class="num">×{fmtN(g.total)}</span> · worth <span class="num">{fmtG(g.value)}</span> to the shop</span>
              </button>
              {#if g.grades.length > 1}<button type="button" class="btn" onclick={() => sellAllGrades(g)}>Sell all grades</button>{/if}
            </div>
            <div class="grades">
              {#each g.grades as gr (gr.grade)}
                <button type="button" class="gchip" aria-label="Sell {GRADE_LABEL[gr.grade]} {g.name}, {gr.qty} owned, {fmtG(gr.price)} each" onclick={() => sell({ id: g.id, name: g.name, grade: gr.grade, qty: gr.qty, price: gr.price })}>
                  <span class="gl">{GRADE_LABEL[gr.grade]}</span>
                  <span class="num">×{fmtN(gr.qty)}</span>
                  <span class="num brass">{fmtG(gr.price)} ea</span>
                </button>
              {/each}
            </div>
          </li>
        {/each}
        {#each sellGear as g, i (g.uid)}
          <li data-guide={sellGroups.length === 0 && i === 0 ? 'sell' : undefined}>
            <button type="button" class="sinfo" onclick={() => openItem({ itemId: g.itemId, uid: g.uid })}>
              <ItemIcon id={g.itemId} rarity={g.rarity} />
              <span class="name" style:color={`var(--r-${g.rarity})`}>{engine.derived?.gearNames?.[g.uid] ?? itemName(g.itemId)}</span>
              <span class="meta">{cap(g.rarity)} gear</span>
            </button>
            <button type="button" class="btn" onclick={() => sellOneGear(g)}><span class="num">{fmtG(store.gearSellPrices?.[g.uid] ?? 0)}</span></button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
  {/if}
{/if}

<style>
  .title { margin: 0 0 4px; font: 600 var(--t-xl)/1.2 var(--f-display); }
  .restock.card { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 0 0 12px; padding: 10px 12px; background: var(--paper); border: 1px solid var(--rule); border-left: 4px solid var(--woad); }
  .clk { color: var(--woad); flex: none; }
  .rtxt { display: grid; gap: 2px; }
  .rl { font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3); letter-spacing: .08em; text-transform: uppercase; }
  .rt { font: 700 var(--t-xl)/1 var(--f-num); color: var(--ink); font-variant-numeric: tabular-nums; }
  .restock .have { margin-left: auto; font-size: var(--t-sm); }
  .newcue { margin: 0 0 10px; color: var(--woad); font-weight: 700; font-size: var(--t-sm); }
  .tile.card { position: relative; }
  .newtag { position: absolute; top: -1px; right: -1px; padding: 2px 5px; background: var(--woad); color: #fff; font: 400 10px/1 var(--f-label); letter-spacing: .04em; text-transform: uppercase; }
  .tile.isnew { border-color: var(--woad); }
  .tile.flash { animation: newflash 1.6s ease-out 2; }
  @keyframes newflash { 0%, 100% { background-color: var(--paper); } 30% { background-color: var(--woad-soft); } }
  .soldout { display: grid; gap: 1px; justify-items: center; color: var(--ink-2); font: 700 var(--t-xs)/1.1 var(--f-body); }
  .back { color: var(--ink-3); font-weight: 400; font-size: 11px; }
  .have { color: var(--ink-3); font-weight: 400; }
  .brass { color: var(--brass); font-weight: 700; }
  .group + .group { margin-top: 16px; }
  .group h3 { margin: 0 0 8px; font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3); letter-spacing: .08em; text-transform: uppercase; }
  .muted { margin: 0; padding: 12px; background: var(--paper); border: 1px solid var(--rule); color: var(--ink-3); font-size: var(--t-sm); }
  .note { margin: 0 0 2px; line-height: 1.3; color: var(--ink-3); font-size: var(--t-sm); }
  .next { margin-top: 8px; }
  .link { background: none; border: 0; padding: 12px 0; min-height: 44px; color: var(--woad); font: inherit; font-weight: 700; text-decoration: underline; }
  .meta { color: var(--ink-3); font-size: var(--t-xs); }

  .sub { margin-left: 6px; color: var(--ink-3); letter-spacing: .02em; text-transform: none; font: 400 var(--t-xs)/1 var(--f-body); }
  .tiles { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  @media (min-width: 440px) { .tiles { grid-template-columns: repeat(4, 1fr); } }
  .tiles > li { min-width: 0; display: flex; }
  .tile.card { width: 100%; min-height: 44px; display: grid; grid-template-rows: auto 1fr auto; justify-items: center; gap: 3px; text-align: center; padding: 4px; color: var(--ink); background-color: var(--paper); }
  .tile.card:hover:not(.out) { background-color: var(--woad-soft); }
  .tile.out { opacity: .7; }
  .tile.out .sq { opacity: .5; }
  .sq { width: 40px; height: 40px; display: grid; place-items: center; border: 2px solid; background: var(--sunk); }
  .nm { width: 100%; font: 700 var(--t-xs)/1.2 var(--f-body); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; min-height: 2.4em; }
  .price { color: var(--brass); font-weight: 700; font-size: var(--t-md); line-height: 1; }

  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .list li { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; background: var(--paper); border: 1px solid var(--rule); }
  .sinfo :global(.ii) { grid-row: 1 / span 2; }
  .sinfo .name, .sinfo .meta { grid-column: 2; }
  .sinfo { display: grid; grid-template-columns: 32px 1fr; column-gap: 8px; align-items: center; min-width: 0; flex: 1; min-height: 44px; padding: 0; border: 0; background: none; text-align: left; align-content: center; }
  .name { font: 700 var(--t-sm)/1.1 var(--f-body); }
  .list li.grp { display: grid; gap: 6px; }
  .ghead { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .grades { display: flex; flex-wrap: wrap; gap: 6px; }
  .gchip { min-height: 44px; display: inline-flex; align-items: center; gap: 6px; padding: 0 10px; border: 1px solid var(--rule); background: var(--sunk); color: var(--ink); font: 700 var(--t-xs)/1 var(--f-body); }
  .gchip:hover { background: var(--woad-soft); border-color: var(--woad); }
  .gchip .gl { padding: 2px 6px; background: var(--paper); border: 1px solid var(--rule); color: var(--ink-2); }
  .gchip .brass { font-size: var(--t-xs); }
  .seg { display: grid; grid-template-columns: 1fr 1fr; margin-bottom: 8px; }
  .seg .btn { border-left-width: 0; }
  .seg .btn:first-child { border-left-width: 1px; }
  .fb { margin: 0 0 8px; min-height: 1.3em; color: var(--ok); font-size: var(--t-sm); font-weight: 700; }
  .fb.bad { color: var(--bad); }
</style>
