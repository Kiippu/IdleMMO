<script lang="ts">
  // War Room > Loadout > Work outfit: three sets (Gather, Refine, Craft) x head/body/hands/feet, worn automatically for that kind of work.
  import ItemIcon from '../../art/ItemIcon.svelte';
  import { DATA } from '@guildwright/engine';
  import { engine } from '../../engine/store.svelte';
  import { engineClient } from '../../engine/client';
  import { openItem } from '../../overlays/itemRef.svelte';
  import { ui } from '../../ui.svelte';
  import { SLOT_LABEL, SET_LABEL, SET_BLURB, OUTFIT_PIECES, EFFECTS, workTags, workDeltaChips, fmtEffect, lineText, effectName } from './gearUi';

  const SETS = ['gather', 'refine', 'craft'] as const;
  const items: Record<string, any> = (DATA as any).items;
  const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

  let snap = $derived(engine.snapshot);
  let view = $derived(engine.derived);
  let bag = $derived<any[]>(snap?.gear ?? []);
  let worn = $derived<Record<string, Record<string, string | null>>>(snap?.workOutfit ?? {});
  let extras = $derived<any>(view?.extras ?? {});
  const nameOf = (g: any) => view?.gearNames?.[g.uid] ?? items[g.itemId]?.name ?? g.itemId;
  const pieceAt = (set: string, piece: string) => { const uid = worn[set]?.[piece]; return uid ? bag.find((g) => g.uid === uid) ?? null : null; };
  const linesOf = (uid: string): any[] => extras.gearInfo?.[uid]?.effectLines ?? [];
  const effText = (g: any) => {
    const l = linesOf(g.uid);
    if (l.length) return l.map((x) => lineText(x)).join(', ');
    return (items[g.itemId]?.effects ?? []).map((e: any) => fmtEffect(e.id, e.value)).join(', ');
  };

  let setF = $state<'all' | (typeof SETS)[number]>('all');
  let effF = $state<string>('all');
  let sel = $state<{ set: string; piece: string } | null>(null);
  let msg = $state(''); let msgBad = $state(false);

  let wornUids = $derived(new Set(Object.values(worn).flatMap((s) => Object.values(s ?? {})).filter(Boolean) as string[]));
  let spare = $derived(bag.filter((g) => items[g.itemId]?.section === 'outfit' && !wornUids.has(g.uid)));
  let list = $derived(spare
    .filter((g) => setF === 'all' || items[g.itemId].outfitSet === setF)
    .filter((g) => effF === 'all' || workTags(g, items[g.itemId], linesOf(g.uid)).has(effF))
    .sort((a, b) => (items[b.itemId].tier - items[a.itemId].tier) || nameOf(a).localeCompare(nameOf(b))));
  let selPiece = $derived(sel ? pieceAt(sel.set, sel.piece) : null);

  async function equip(g: any) {
    msg = ''; msgBad = false;
    const chips = workDeltaChips(extras.workDeltas?.[g.uid]);
    try {
      const res: any = await engineClient.equip(g.uid);
      if (res && res.ok === false) { msg = res.reason || 'Could not equip.'; msgBad = true; return; }
      msg = `Equipped ${nameOf(g)}.${chips.length ? ` ${chips.map((c) => c.text).join(', ')}.` : ''}`;
    } catch (e) { console.error(e); msg = 'Could not equip.'; msgBad = true; }
  }
  async function takeOff(g: any) {
    msg = ''; msgBad = false;
    try {
      const res: any = await engineClient.unequipGear(g.uid);
      if (res && res.ok === false) { msg = res.reason || 'Could not take off.'; msgBad = true; return; }
      msg = `Took off ${nameOf(g)}.`; sel = null;
    } catch (e) { console.error(e); msg = 'Could not take off.'; msgBad = true; }
  }
  function tileTap(set: string, piece: string) {
    if (sel && sel.set === set && sel.piece === piece) { sel = null; return; }
    sel = { set, piece }; msg = ''; msgBad = false;
    if (!pieceAt(set, piece)) { setF = set as typeof setF; msg = `Nothing worn on ${SET_LABEL[set].toLowerCase()} ${SLOT_LABEL[piece].toLowerCase()}. Pick a piece below.`; }
  }
</script>

<p class="help">Worn automatically for that kind of work.</p>
<p class="fb" class:bad={msgBad} role="status" aria-live="polite">{msg}</p>

{#each SETS as set (set)}
  {@const tot = extras.outfitTotals?.[set]}
  <section class="set card">
    <h3>{SET_LABEL[set]} set</h3>
    <p class="meta">{SET_BLURB[set]}</p>
    <ul class="pieces" aria-label="{SET_LABEL[set]} outfit">
      {#each OUTFIT_PIECES as piece}
        {@const g = pieceAt(set, piece)}
        <li>
          <button type="button" class="slot" class:filled={!!g} class:sel={sel?.set === set && sel?.piece === piece} style:--ink-r={g ? `var(--r-${g.rarity})` : undefined}
            aria-label={g ? `${SET_LABEL[set]} ${SLOT_LABEL[piece]}: ${nameOf(g)}. Tap for options` : `${SET_LABEL[set]} ${SLOT_LABEL[piece]}: empty. Tap to pick one`} onclick={() => tileTap(set, piece)}>
            {#if g}<ItemIcon id={g.itemId} rarity={g.rarity} />{:else}<span class="dot" aria-hidden="true">·</span>{/if}
          </button>
          <small>{SLOT_LABEL[piece]}</small>
        </li>
      {/each}
    </ul>
    {#if sel?.set === set}
      <div class="pop" role="group" aria-label="Selected piece">
        {#if selPiece}
          <p class="pn" style:color={`var(--r-${selPiece.rarity})`}>{nameOf(selPiece)}</p>
          <p class="meta num">{effText(selPiece)}</p>
          <div class="acts">
            <button type="button" class="btn" onclick={() => openItem({ itemId: selPiece.itemId, uid: selPiece.uid })}>Details</button>
            <button type="button" class="btn ghost" onclick={() => takeOff(selPiece)}>Take off</button>
          </div>
        {:else}
          <p class="meta">Empty. Pieces you own are listed below; tap one to wear it.</p>
        {/if}
      </div>
    {/if}
    <p class="tot num">
      {#if tot?.lines?.length}{#each tot.lines as l, i}{i ? ' · ' : ''}{lineText(l)}{/each}{:else}No bonus yet{/if}
    </p>
  </section>
{/each}

<section class="bagsec">
  <h3>Outfit pieces in your bag</h3>
  {#if spare.length === 0}
    <p class="muted">No spare outfit pieces. Tailoring makes caps and bodies; leatherworking makes gloves and boots.</p>
    <button type="button" class="btn next" onclick={() => (ui.goTab = 'Workshop')}>Go to the Workshop</button>
  {:else}
    <div class="chips" role="group" aria-label="Set">
      <button type="button" class="btn chip" aria-pressed={setF === 'all'} onclick={() => (setF = 'all')}>All sets</button>
      {#each SETS as s}<button type="button" class="btn chip" aria-pressed={setF === s} onclick={() => (setF = s)}>{SET_LABEL[s]}</button>{/each}
    </div>
    <div class="chips" role="group" aria-label="Effect">
      <button type="button" class="btn chip" aria-pressed={effF === 'all'} onclick={() => (effF = 'all')}>Any effect</button>
      {#each EFFECTS as e}<button type="button" class="btn chip" aria-pressed={effF === e.id} onclick={() => (effF = e.id)}>{e.name}</button>{/each}
    </div>
    {#if list.length === 0}
      <p class="muted">Nothing matches.</p>
      <button type="button" class="btn next" onclick={() => { setF = 'all'; effF = 'all'; }}>Clear filters</button>
    {:else}
      <ul class="gear">
        {#each list as g (g.uid)}
          {@const it = items[g.itemId]}
          {@const dl = workDeltaChips(extras.workDeltas?.[g.uid])}
          <li style:--ink-r={`var(--r-${g.rarity})`}>
            <button type="button" class="eqbtn" aria-label="Wear {nameOf(g)}" onclick={() => equip(g)}>
              <ItemIcon id={g.itemId} rarity={g.rarity} />
              <span class="info">
                <span class="name">{nameOf(g)}</span>
                <span class="meta">{SET_LABEL[it.outfitSet]} {SLOT_LABEL[it.slot]?.toLowerCase()} · T{it.tier} · {cap(g.rarity)}</span>
                <span class="meta num">{effText(g)}</span>
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
  .help { margin: 0 0 4px; color: var(--ink-2); font-size: var(--t-sm); }
  .fb { margin: 0 0 8px; min-height: 1.3em; color: var(--ok); font-size: var(--t-sm); font-weight: 700; }
  .fb.bad { color: var(--bad); }
  h3 { margin: 0 0 4px; font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3); letter-spacing: .08em; text-transform: uppercase; }
  .set { margin-bottom: 10px; }
  .meta { margin: 0; color: var(--ink-3); font-size: var(--t-xs); }
  .pieces { list-style: none; margin: 8px 0 0; padding: 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .pieces li { display: grid; justify-items: center; gap: 2px; }
  .pieces small { color: var(--ink-3); font-size: var(--t-xs); }
  .slot { width: 48px; height: 48px; min-height: 44px; padding: 0; display: grid; place-items: center; background: var(--sunk); border: 1px dashed var(--rule); color: var(--ink-3); }
  .slot.filled { border: 2px solid var(--ink-r); color: var(--ink-r); background: var(--paper); }
  .slot.sel { outline: 2px solid var(--woad); outline-offset: 1px; }
  .dot { font: 700 var(--t-lg)/1 var(--f-display); }
  .tot { margin: 8px 0 0; padding: 6px 8px; background: var(--sunk); border: 1px solid var(--rule); color: var(--ink); font: 700 var(--t-sm)/1.3 var(--f-num); }
  .pop { margin-top: 8px; padding: 8px; background: var(--sunk); border: 1px solid var(--woad); display: grid; gap: 4px; }
  .pn { margin: 0; font: 700 var(--t-sm)/1.15 var(--f-body); }
  .acts { display: flex; gap: 8px; margin-top: 4px; }
  .bagsec { margin-top: 16px; }
  .muted { margin: 0; padding: 12px; background: var(--paper); border: 1px solid var(--rule); color: var(--ink-3); font-size: var(--t-sm); }
  .next { margin-top: 8px; }
  .chips { display: flex; gap: 6px; margin-bottom: 6px; overflow-x: auto; scrollbar-width: none; padding-right: 32px; -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent); mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent); }
  .chips::-webkit-scrollbar { display: none; }
  .chip { flex: none; padding: 0 12px; white-space: nowrap; }
  .gear { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 6px; }
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
