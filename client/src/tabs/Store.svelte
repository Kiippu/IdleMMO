<script lang="ts">
  // General store: the town's NPC shop. Hourly stock at a mark-up; sells your spare items at a floor price.
  import { DATA } from '@guildwright/engine';
  import { engine } from '../engine/store.svelte';
  import { engineClient, type StoreResult } from '../engine/client';
  import { fmtG, fmtN, fmtDuration, fmtSecs } from '../format';
  import { askNumber, confirmSheet, noticeSheet } from '../overlays/confirm.svelte';
  import { markDone } from '../guide.svelte';
  import { ui } from '../ui.svelte';
  import { openItem } from '../overlays/itemRef.svelte';
  import { buyFromShop } from '../overlays/shopActions';
  import { toast } from '../overlays/toasts.svelte';

  type Props = { onContracts: () => void };
  let { onContracts }: Props = $props();

  const GRADE_LABEL = ['Rough', 'Fine', 'Sharp', 'Keen', 'Pristine'];
  const SLOT_LABEL: Record<string, string> = { weapon: 'Weapon', offhand: 'Offhand', head: 'Head', chest: 'Chest', legs: 'Legs', ring: 'Ring' };
  const itemsMap: Record<string, any> = (DATA as any).items;
  const itemRarity: Record<string, string> = (DATA as any).itemRarity ?? {};
  const itemName = (id: string) => itemsMap[id]?.name ?? id;

  let snap = $derived(engine.snapshot);
  let store = $derived<any>(engine.derived?.extras?.store ?? null);
  let now = $derived<number>(engine.derived?.now ?? Date.now());
  let gold = $derived(Math.floor(snap?.gold ?? 0));
  let inv = $derived<Record<string, number[]>>(snap?.inv ?? {});
  let gear = $derived<any[]>(snap?.gear ?? []);
  let equipped = $derived<Record<string, string | null>>(snap?.equipped ?? {});
  let slots = $derived<any[]>(store?.slots ?? []);
  let resources = $derived(slots.filter((s) => s.kind !== 'gear'));
  let gearSlots = $derived(slots.filter((s) => s.kind === 'gear'));
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
  let sellPct = $derived(Math.round(sellMult * 100));
  let sellGear = $derived(gear.filter((g) => !Object.values(equipped).includes(g.uid)));

  function gatherText(s: any): string {
    if (s.gatherSecs == null) return "Can't make yet";
    return `~${fmtSecs(s.gatherSecs)} to gather yourself`;
  }

  function report(res: StoreResult | undefined, okText: string) {
    if (!res) return;
    if (res.ok === false) { void noticeSheet('Could not complete', res.reason); return; }
    toast(okText);
  }

  const buy = (s: any) => buyFromShop(s);

  async function sell(r: { id: string; name: string; grade: number; qty: number; price: number }) {
    const qty = await askNumber({
      title: `Sell ${r.name}`,
      body: `${GRADE_LABEL[r.grade]} · the shop pays ${fmtG(r.price)} each (${sellPct}% of value). Crewmates and contracts pay more.`,
      number: { min: 1, max: r.qty, value: Math.min(r.qty, 1), label: 'How many?', lines: (n) => [`You get ${fmtG(n * r.price)}`, `Gold after ${fmtG(gold + n * r.price)}`] },
      confirmLabel: 'Sell',
    });
    if (qty == null) return;
    try { const res = await engineClient.storeSell(r.id, r.grade, qty); report(res, `Sold ${qty} ${r.name} for ${fmtG(res.gold)}`); if (res.ok) markDone('sell'); }
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
      if (res.ok === false) { void noticeSheet('Could not sell', res.reason); return; }
      toast(`Sold ${fmtN(res.qty)} ${g.name} for ${fmtG(res.gold)}`); markDone('sell');
    } catch (err) { console.error('storeSellAll failed', err); }
  }
  async function sellOneGear(g: any) {
    const price = store?.gearSellPrices?.[g.uid] ?? 0;
    const name = engine.derived?.gearNames?.[g.uid] ?? itemName(g.itemId);
    if (!(await confirmSheet({ title: `Sell ${name}?`, body: `The shop pays ${fmtG(price)} (${sellPct}% of value). A crewmate or contract may pay more.`, confirmLabel: `Sell for ${fmtG(price)}`, danger: true }))) return;
    try { const res = await engineClient.storeSellGear(g.uid); report(res, `Sold ${name} for ${fmtG(res.gold)}`); if (res.ok) markDone('sell'); }
    catch (err) { console.error('storeSellGear failed', err); }
  }
  const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
</script>

<h2 class="title">General store</h2>

{#if !store}
  <p class="muted">The shutters are down. Check back shortly.</p>
{:else}
  <p class="fresh"><span>Fresh stock in <span class="num">{fmtDuration((store.refreshesAt - now) / 1000)}</span></span> <span class="have">You have <span class="num brass">{fmtG(gold)}</span></span></p>

  <section class="group">
    <h3>Resources</h3>
    <ul class="tiles">
      {#each resources as s (s.slot)}
        <li class="tl">
          <button type="button" class="tile" class:out={s.qty < 1} onclick={() => openItem({ itemId: s.itemId })} aria-label="{s.name}, {fmtG(s.price)}, {s.qty} left">
            <span class="sq" style:color={`var(--r-${s.rarity})`} style:border-color={`var(--r-${s.rarity})`} aria-hidden="true">{s.name[0]}</span>
            <span class="nm">{s.name}</span>
            <span class="meta">{GRADE_LABEL[s.grade] ?? ''}</span>
            <span class="price num">{fmtG(s.price)}</span>
            <span class="meta num">{s.qty < 1 ? 'Sold out' : `${s.qty} left`}</span>
            <span class="meta">{gatherText(s)}</span>
          </button>
          <button type="button" class="btn buy" disabled={s.qty < 1} onclick={() => buy(s)}>{s.qty < 1 ? 'Sold out' : 'Buy'}</button>
        </li>
      {/each}
    </ul>
  </section>

  <section class="group">
    <h3>Gear</h3>
    <ul class="tiles">
      {#each gearSlots as s (s.slot)}
        <li class="tl">
          <button type="button" class="tile" class:out={s.qty < 1} onclick={() => openItem({ itemId: s.itemId })} aria-label="{s.name}, {fmtG(s.price)}, {s.qty} left">
            <span class="sq" style:color={`var(--r-${s.rarity})`} style:border-color={`var(--r-${s.rarity})`} aria-hidden="true">{s.name[0]}</span>
            <span class="nm">{s.name}</span>
            <span class="meta">{SLOT_LABEL[itemsMap[s.itemId]?.slot] ?? 'Gear'} · {cap(s.rarity)}</span>
            <span class="price num">{fmtG(s.price)}</span>
            <span class="meta num">{s.qty < 1 ? 'Sold out' : `${s.qty} left`}</span>
            <span class="meta">{gatherText(s)}</span>
          </button>
          <button type="button" class="btn buy" disabled={s.qty < 1} onclick={() => buy(s)}>{s.qty < 1 ? 'Sold out' : 'Buy'}</button>
        </li>
      {/each}
    </ul>
  </section>

  <section class="group">
    <h3>Sell to the store</h3>
    <p class="note">Shop buys at <span class="num">{sellPct}%</span> of value. Crewmates and contracts pay more. <button type="button" class="link" onclick={onContracts}>See Contracts</button></p>
    {#if sellGroups.length === 0 && sellGear.length === 0}
      <p class="muted">Nothing to sell yet.</p>
      <button type="button" class="btn next" onclick={() => (ui.goTab = 'Workshop')}>Go gather something</button>
    {:else}
      <ul class="list">
        {#each sellGroups as g (g.id)}
          <li class="grp">
            <div class="ghead">
              <button type="button" class="sinfo" onclick={() => openItem({ itemId: g.id })}>
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
        {#each sellGear as g (g.uid)}
          <li>
            <button type="button" class="sinfo" onclick={() => openItem({ itemId: g.itemId, uid: g.uid })}>
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

<style>
  .title { margin: 0 0 4px; font: 600 var(--t-xl)/1.2 var(--f-display); }
  .fresh { margin: 0 0 16px; display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; color: var(--ink-2); font-weight: 700; font-size: var(--t-sm); }
  .have { color: var(--ink-3); font-weight: 400; }
  .brass { color: var(--brass); font-weight: 700; }
  .group + .group { margin-top: 16px; }
  .group h3 { margin: 0 0 8px; font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3); letter-spacing: .08em; text-transform: uppercase; }
  .muted { margin: 0; padding: 12px; background: var(--paper); border: 1px solid var(--rule); color: var(--ink-3); font-size: var(--t-sm); }
  .note { margin: 0 0 8px; color: var(--ink-3); font-size: var(--t-sm); }
  .next { margin-top: 8px; }
  .link { background: none; border: 0; padding: 12px 0; min-height: 44px; color: var(--woad); font: inherit; font-weight: 700; text-decoration: underline; }
  .meta { color: var(--ink-3); font-size: var(--t-xs); }

  .tiles { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .tile { width: 100%; min-height: 44px; display: grid; gap: 3px; justify-items: start; text-align: left; padding: 10px; background: var(--paper); border: 1px solid var(--rule); color: var(--ink); }
  .tile:hover:not(:disabled) { background: var(--woad-soft); border-color: var(--woad); }
  .tile.out { opacity: .5; cursor: not-allowed; background: var(--sunk); }
  .sq { width: 32px; height: 32px; display: grid; place-items: center; border: 2px solid; background: var(--sunk); font: 700 var(--t-md)/1 var(--f-display); }
  .nm { font: 700 var(--t-sm)/1.15 var(--f-body); }
  .price { color: var(--brass); font-weight: 700; font-size: var(--t-lg); line-height: 1; }

  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .list li { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; background: var(--paper); border: 1px solid var(--rule); }
  .sinfo { display: grid; gap: 2px; min-width: 0; flex: 1; min-height: 44px; padding: 0; border: 0; background: none; text-align: left; align-content: center; }
  .name { font: 700 var(--t-sm)/1.1 var(--f-body); }
  .list li.grp { display: grid; gap: 6px; }
  .ghead { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .grades { display: flex; flex-wrap: wrap; gap: 6px; }
  .gchip { min-height: 44px; display: inline-flex; align-items: center; gap: 6px; padding: 0 10px; border: 1px solid var(--rule); background: var(--sunk); color: var(--ink); font: 700 var(--t-xs)/1 var(--f-body); }
  .gchip:hover { background: var(--woad-soft); border-color: var(--woad); }
  .gchip .gl { padding: 2px 6px; background: var(--paper); border: 1px solid var(--rule); color: var(--ink-2); }
  .gchip .brass { font-size: var(--t-xs); }
  .tl { display: flex; flex-direction: column; }
  .tl .tile { flex: 1; }
  .buy { width: 100%; margin-top: 4px; }
</style>
