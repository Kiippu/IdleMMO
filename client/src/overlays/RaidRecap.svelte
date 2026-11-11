<script lang="ts">
  import ItemIcon from '../art/ItemIcon.svelte';
  import BossPortrait from '../scene/BossPortrait.svelte';
  // Full-screen raid recap, in mockup order. Gold only: no coin, raid tokens or pity tokens.
  import { DATA } from '@guildwright/engine';
  import { fmtG, fmtN } from '../format';
  import { openItem } from './itemRef.svelte';
  import type { RecapView } from '@guildwright/engine';

  type Props = { recap: any; view?: RecapView | null; onClose: () => void };
  let { recap, view = null, onClose }: Props = $props();

  const itemsMap: Record<string, { name?: string }> = (DATA as any).items;
  const itemName = (id: string) => itemsMap[id]?.name ?? id;
  const pct = (x: number) => `${Math.round((x ?? 0) * 100)}%`;
  const bar = (x: number) => `${Math.max(0, Math.min(100, Math.round((x ?? 0) * 100)))}%`;

  let pay = $derived<any>(recap?.payout ?? null);
  let vp = $derived(view?.pay ?? null);
  let chests = $derived(view?.chests ?? []);
  // Payout items that did not come from a chest (floor and tier rewards).
  let otherLoot = $derived.by(() => {
    const inChest = new Map<string, number>();
    for (const c of view?.chestLoot ?? []) inChest.set(c.itemId, (inChest.get(c.itemId) ?? 0) + c.qty);
    return (view?.loot ?? []).map((l) => ({ ...l, qty: l.qty - (inChest.get(l.itemId) ?? 0) })).filter((l) => l.qty > 0);
  });
  const cap1 = (r: string) => r[0].toUpperCase() + r.slice(1);
  let stock = $derived<any>(recap?.crewStock ?? null);
  let members = $derived<any[]>(stock?.byMember ?? []);
  let dealt = $derived(Math.max(0, (recap?.hpPctBefore ?? 0) - (recap?.hpPctAfter ?? 0)));
  let short = $derived<any[]>((recap?.stockShortfall ?? []).filter((m: any) => (m.heal ?? 0) + (m.buff ?? 0) > 0));
  let shortNames = $derived(short.map((m) => (m.who === 'you' ? 'you' : m.name)).join(', '));
  let btn = $state<HTMLButtonElement | null>(null);
  $effect(() => { btn?.focus(); });
  function onKey(ev: KeyboardEvent) { if (ev.key === 'Escape') onClose(); }
</script>

{#snippet tile(i: { itemId: string; name: string; qty: number; rarity: string })}
  <button type="button" class="itile" style:--ink-r={`var(--r-${i.rarity})`} onclick={() => openItem({ itemId: i.itemId })} aria-label="{i.name}, {i.qty}">
    <span class="sq" aria-hidden="true"><ItemIcon id={i.itemId} rarity={i.rarity} /></span>
    <span class="in" style:color={`var(--r-${i.rarity})`}>{i.name}</span>
    <span class="iq num">×{fmtN(i.qty)}</span>
  </button>
{/snippet}

<svelte:window onkeydown={onKey} />
<div class="full" role="dialog" aria-modal="true" aria-labelledby="rc-title">
  <div class="col">
    <header>
      <div class="rc-head">
        {#if recap.bossId}<BossPortrait bossId={recap.bossId} name={recap.bossName} />{/if}
        <div class="rc-id"><h2 id="rc-title">{recap.bossName ?? 'Raid'} <span class="num sub">Week {recap.week}</span></h2>
      <p class="res" class:won={recap.won}>{recap.won ? 'Boss defeated' : recap.joined ? 'Boss survived this weekend' : 'You sat this one out'}</p></div>
      </div>
    </header>

    <section>
      <h3>Boss HP</h3>
      <div class="meter hp"><div style="width: {bar(recap.hpPctAfter)}"></div></div>
      <p class="line"><span class="num">{pct(recap.hpPctBefore)} → {pct(recap.hpPctAfter)}</span><span class="num">−{pct(dealt)}</span></p>
    </section>

    <section>
      <h3>Chests claimed</h3>
      {#if chests.length === 0}<p class="muted">No checkpoints reached.</p>
      {:else}
        <ul class="cells">
          {#each chests as c}
            <li>
              <span class="cat">Chest at <span class="num">{pct(c.at)}</span></span>
              {#if c.items.length === 0}<small>Empty</small>{:else}
                <div class="tiles">{#each c.items as i (i.itemId)}{@render tile(i)}{/each}</div>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
      {#if otherLoot.length}
        <h3 class="sp">Other rewards</h3>
        <div class="tiles">{#each otherLoot as i (i.itemId)}{@render tile(i)}{/each}</div>
      {/if}
    </section>

    <section>
      <h3>Your part</h3>
      <p class="line"><span>Tier</span><b>{view?.tierLabel ?? recap.tierLabel ?? recap.tier}</b></p>
      <p class="line"><span>Turnout</span><b class="num">{pct(pay?.turnout)}</b></p>
      <div class="meter"><div style="width: {bar(pay?.turnout)}"></div></div>
      <p class="line"><span>{vp?.crewContributionText ?? `Crew filled ${pct(pay?.crewContribution ?? pay?.contribution)} of what the raid needed`}</span></p>
      <div class="meter"><div style="width: {bar(pay?.crewContribution ?? pay?.contribution)}"></div></div>
    </section>

    <section>
      <h3>Gold</h3>
      <p class="big num">+{fmtG(vp?.gold ?? pay?.gold ?? 0)}</p>
      {#if vp?.hasSplit}
        <p class="line"><span>Turnout pay ({pct(vp.evenShare)}, shared evenly)</span><b class="num">{fmtG(vp.turnoutPay)}</b></p>
        <p class="line"><span>Contribution pay{vp.pointShareText ? ` (your ${vp.pointShareText} of the crew's points)` : vp.pointShare != null ? ` (your ${pct(vp.pointShare)} of the crew's points)` : ''}</span><b class="num">{fmtG(vp.contributionPay)}</b></p>
        {#if vp.capCut > 0}<p class="line"><span>Over your cap, sent to the crew treasury</span><b class="num neg">−{fmtG(vp.capCut)}</b></p>{/if}
      {/if}
      <p class="muted">Pool <span class="num">{fmtG(vp?.pool ?? pay?.pool ?? 0)}</span>{pay?.capped || vp?.poolCapped ? ' · crew cap reached' : ''}</p>
      <p class="line"><span>Crew treasury share</span><b class="num">{fmtG(vp?.crewTreasury ?? pay?.crewGold ?? 0)}</b></p>
    </section>

    {#if members.length}
      <section>
        <h3>Crew stock, per member</h3>
        <ul class="rows">
          {#each members as m}
            <li><span>{m.name ?? m.who}</span><small class="num">healed {fmtN(m.healed ?? 0)} · buffed {fmtN(m.buffed ?? 0)} · +{fmtN(m.credit ?? 0)} credit</small></li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if recap.stockRanOut}
      <p class="nudge">The crew stock ran out{recap.stockOutAt != null ? ` ${Math.round(recap.stockOutAt * 100)}% into the fight` : ''}{shortNames ? `, so ${shortNames} went without healing or buffs` : ''}. Hand items in through Contracts to keep everyone topped up next week.</p>
    {/if}

    {#if view?.nextWeekHint}<p class="nudge next"><b>Next week:</b> {view.nextWeekHint.text}</p>{/if}

    <div class="foot"><button type="button" class="btn primary done" bind:this={btn} onclick={onClose}>Done</button></div>
  </div>
</div>

<style>
  .full { position: fixed; inset: 0; z-index: 45; overflow-y: auto; background: var(--plaster); display: flex; justify-content: center;
    padding: max(16px, env(safe-area-inset-top)) var(--gut-r) 0 var(--gut-l); }
  .col { width: 100%; max-width: var(--col); display: grid; gap: 12px; align-content: start; }
  .rc-head { display: flex; gap: 12px; align-items: center; }
  .rc-id { min-width: 0; }
  h2 { margin: 0; font: 600 var(--t-xl)/1.15 var(--f-display); }
  .sub { font: 700 var(--t-md) var(--f-num); color: var(--ink-2); }
  .res { margin: 4px 0 0; font-weight: 700; color: var(--ink-2); } .res.won { color: var(--ok); }
  section { padding: 12px; background: var(--paper); border: 1px solid var(--rule); display: grid; gap: 6px; }
  h3 { margin: 0; font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3); letter-spacing: .08em; text-transform: uppercase; }
  .line { margin: 0; display: flex; justify-content: space-between; gap: 8px; }
  .muted { margin: 0; color: var(--ink-3); font-size: var(--t-sm); }
  .big { margin: 0; font: 700 var(--t-xxl)/1 var(--f-num); color: var(--brass); }
  .meter { height: 8px; background: var(--sunk); border: 1px solid var(--rule); overflow: hidden; }
  .meter div { height: 100%; background: var(--woad); } .meter.hp div { background: var(--hp); }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .cells li, .rows li { padding: 8px 10px; background: var(--sunk); border: 1px solid var(--rule-2); display: grid; gap: 2px; }
  small { color: var(--ink-3); font-size: var(--t-xs); }
  .nudge { margin: 0; padding: 10px 12px; border: 1px solid var(--woad); background: var(--woad-soft); color: var(--ink); font-size: var(--t-sm); }
  .foot { position: sticky; bottom: 0; margin: 0 calc(var(--gut-r) * -1) 0 calc(var(--gut-l) * -1); padding: 12px var(--gut-r) max(12px, env(safe-area-inset-bottom)) var(--gut-l); background: var(--plaster); border-top: 1px solid var(--rule); }
  .done { width: 100%; }
  .neg { color: var(--bad); }
  .sp { margin-top: 6px; }
  .cat { font-size: var(--t-sm); }
  .tiles { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
  .itile { min-height: 44px; display: inline-flex; align-items: center; gap: 8px; padding: 4px 10px 4px 4px; background: var(--paper); border: 1px solid var(--ink-r); color: var(--ink); text-align: left; }
  .itile .sq { width: 40px; height: 40px; display: grid; place-items: center; border: 2px solid var(--ink-r); background: var(--sunk); }
  .itile .in { font: 700 var(--t-sm)/1.1 var(--f-body); }
  .itile .iq { font-size: var(--t-xs); color: var(--ink-3); font-weight: 700; }
  .nudge.next { border-color: var(--brass); background: var(--paper); }
</style>
