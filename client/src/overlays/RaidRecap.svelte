<script lang="ts">
  // Full-screen raid recap, in mockup order. Gold only: no coin, raid tokens or pity tokens.
  import { DATA } from '@guildwright/engine';
  import { fmtG, fmtN } from '../format';

  type Props = { recap: any; onClose: () => void };
  let { recap, onClose }: Props = $props();

  const itemsMap: Record<string, { name?: string }> = (DATA as any).items;
  const itemName = (id: string) => itemsMap[id]?.name ?? id;
  const pct = (x: number) => `${Math.round((x ?? 0) * 100)}%`;
  const bar = (x: number) => `${Math.max(0, Math.min(100, Math.round((x ?? 0) * 100)))}%`;

  let pay = $derived<any>(recap?.payout ?? null);
  let chests = $derived<any[]>(pay?.chests ?? []);
  let stock = $derived<any>(recap?.crewStock ?? null);
  let members = $derived<any[]>(stock?.byMember ?? []);
  let dealt = $derived(Math.max(0, (recap?.hpPctBefore ?? 0) - (recap?.hpPctAfter ?? 0)));
  let short = $derived<any[]>((recap?.stockShortfall ?? []).filter((m: any) => (m.heal ?? 0) + (m.buff ?? 0) > 0));
  let shortNames = $derived(short.map((m) => (m.who === 'you' ? 'you' : m.name)).join(', '));
  let btn = $state<HTMLButtonElement | null>(null);
  $effect(() => { btn?.focus(); });
  function onKey(ev: KeyboardEvent) { if (ev.key === 'Escape') onClose(); }
</script>

<svelte:window onkeydown={onKey} />
<div class="full" role="dialog" aria-modal="true" aria-labelledby="rc-title">
  <div class="col">
    <header>
      <h2 id="rc-title">{recap.bossName ?? 'Raid'} <span class="num sub">Week {recap.week}</span></h2>
      <p class="res" class:won={recap.won}>{recap.won ? 'Boss defeated' : recap.joined ? 'Boss survived this weekend' : 'You sat this one out'}</p>
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
        <ul class="cells">{#each chests as c}<li><span class="num">{pct(c.at)}</span> chest<small>{(c.items ?? []).map((i: any) => `${itemName(i.itemId ?? i.id)} ×${i.qty ?? 1}`).join(', ')}</small></li>{/each}</ul>
      {/if}
    </section>

    <section>
      <h3>Your part</h3>
      <p class="line"><span>Tier</span><b>{recap.tierLabel ?? recap.tier}</b></p>
      <p class="line"><span>Turnout</span><b class="num">{pct(pay?.turnout)}</b></p>
      <div class="meter"><div style="width: {bar(pay?.turnout)}"></div></div>
      <p class="line"><span>Your contribution</span><b class="num">{pct(pay?.contribution)}</b></p>
      <div class="meter"><div style="width: {bar(pay?.contribution)}"></div></div>
    </section>

    <section>
      <h3>Gold</h3>
      <p class="big num">+{fmtG(pay?.gold ?? 0)}</p>
      <p class="muted">Pool <span class="num">{fmtG(pay?.pool ?? 0)}</span>{pay?.capped ? ' · crew cap reached' : ''}</p>
      <p class="line"><span>Crew treasury share</span><b class="num">{fmtG(pay?.crewGold ?? 0)}</b></p>
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

    <button type="button" class="btn primary done" bind:this={btn} onclick={onClose}>Done</button>
  </div>
</div>

<style>
  .full { position: fixed; inset: 0; z-index: 45; overflow-y: auto; background: var(--plaster); display: flex; justify-content: center;
    padding: max(16px, env(safe-area-inset-top)) var(--gut-r) max(16px, env(safe-area-inset-bottom)) var(--gut-l); }
  .col { width: 100%; max-width: var(--col); display: grid; gap: 12px; align-content: start; }
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
  .done { position: sticky; bottom: 0; width: 100%; }
</style>
