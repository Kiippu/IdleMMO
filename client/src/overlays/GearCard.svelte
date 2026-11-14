<script lang="ts">
  // The one gear card: score bar, grade tag, name, icon + maker, stat table, element bar, lore, affixes,
  // hidden Specials box (option C: renders only when the engine sends specials), value footer, rarity-tinted pixel frame
  // (gilt corners from Epic up). Optional compare arrows against the worn piece (detail.compare).
  // Props: detail (engine GearDetail), compare (default true: show arrows), salvageHint (footer text, optional).
  import ItemIcon from '../art/ItemIcon.svelte';
  import { DATA } from '@guildwright/engine';
  import { resolveNamed } from '../art/icons';
  import { fmtG } from '../format';
  import { cardRows, elementLines, arrow, arrowText, makerText, makerIcon, footerText, isGilt, tierInk, splitAffix, affixDetail, isPrimaryAffix, type CardDetail, type RollAffix } from './gearCard';

  // framed (default true): the pixel frame, glow and gilt corners. framed={false}: only a 1px rarity-ink line (an outer frame carries the look).
  type Props = { detail: CardDetail; compare?: boolean; salvageHint?: string | null; framed?: boolean };
  let { detail, compare = true, salvageHint = null, framed = true }: Props = $props();

  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  let rows = $derived(cardRows(compare ? detail : { ...detail, compare: null }));
  let elements = $derived(elementLines(detail));
  let maker = $derived(makerText(detail.maker));
  let badge = $derived(makerIcon(detail.maker));
  let level = $derived(detail.levelReq);
  let specials = $derived(detail.specials ?? []);
  let scoreDelta = $derived(compare ? detail.compare?.scoreDelta ?? null : null);
  let foot = $derived(footerText(detail, (id) => (DATA as any).items?.[id]?.name ?? id));
  let openRow = $state<Record<string, boolean>>({});
  const toggle = (id: string) => { openRow[id] = !openRow[id]; };
  let gilt = $derived(framed && isGilt(detail.rarity));
  // Stat icons are 16px art from the atlas (art agent); until a key exists in the atlas a plain dot stands in.
  const hasIcon = (k: string) => { try { return !resolveNamed(k).fallback; } catch { return false; } };
</script>

{#snippet sicon(k: string)}
  <span class="si" aria-hidden="true">{#if hasIcon(k)}<ItemIcon named={k} size={32} />{:else}<i class="dot"></i>{/if}</span>
{/snippet}

<article class="gc" class:gilt class:flat={!framed} style:--ink-r={`var(--r-${detail.rarity})`} data-rarity={detail.rarity}>
  {#if framed}<span class="tint" aria-hidden="true"></span>{/if}
  {#if gilt}<span class="gl tl" aria-hidden="true"></span><span class="gl tr" aria-hidden="true"></span><span class="gl bl" aria-hidden="true"></span><span class="gl br" aria-hidden="true"></span>{/if}

  <header class="top">
    <span class="score"><small>Item score</small>{#if detail.score != null}<b class="num">{detail.score}</b>{#if arrow(scoreDelta)}<span class="ar {arrow(scoreDelta)}">{arrowText(scoreDelta)}</span><span class="vs">vs worn</span>{/if}{:else}<b class="num">–</b>{/if}</span>
    <span class="req num">Tier {detail.tier}{level ? ` · Lv ${level}` : ''}</span>
  </header>

  <p class="grade">{detail.gradeName}</p>
  <h3 class="name">{detail.name}</h3>

  <div class="mid">
    <div class="left">
      <p class="rar">{cap(detail.rarity)}</p>
      <span class="big"><ItemIcon id={detail.itemId} size={64} /></span>
      {#if maker}<p class="maker">{#if badge}{@render sicon(badge)}{/if}<span>{maker}</span></p>{/if}
    </div>
    <ul class="rows">
      {#each rows as r (r.key)}
        <li><span class="lab">{@render sicon(r.icon)}<span>{r.label}</span></span>
          <b class="val num">{r.text}{#if arrow(r.delta)}<span class="ar {arrow(r.delta)}">{arrowText(r.delta)}</span>{/if}</b></li>
      {/each}
      {#if compare && detail.compare && rows.some((r) => arrow(r.delta))}<li class="legend">▲ ▼ compared with what you wear</li>{/if}
    </ul>
  </div>

  {#each elements as e (e.key)}
    <p class="el" style:--el={`var(--el-${e.element}, var(--ink))`}>{@render sicon(e.ward ? 'ward' : `el_${e.element}`)}<span>{e.text}</span></p>
  {/each}

  {#if detail.lore}<p class="lore">{detail.lore}</p>{/if}

  {#if detail.affixes?.length}
    <ul class="aff">{#each detail.affixes as a, i (a.id)}
      {@const ra = a as unknown as RollAffix}
      {@const sp = splitAffix(a.label)}
      {@const prim = isPrimaryAffix(ra, i)}
      {@const ink = prim || ra.fixed ? null : tierInk(ra.rollTier)}
      {@const dt = prim ? null : affixDetail(ra)}
      <li class:first={prim}>
        {#if dt}
          <button type="button" class="arow" aria-expanded={!!openRow[a.id]} onclick={() => toggle(a.id)}>
            <span class="atxt">{#if sp.head}{sp.head + '\u00a0'}{/if}<b class="av" style:color={ink ?? undefined}>{sp.value}</b>{#if ink}<i class="pip" style:background={ink} aria-hidden="true"></i>{/if}</span>
          </button>
          {#if openRow[a.id]}<p class="adet num">{dt}</p>{/if}
        {:else}<span class="atxt">{sp.head ? sp.head + '\u00a0' : ''}<b class="av" style:color={ink ?? undefined}>{sp.value}</b>{#if ink}<i class="pip" style:background={ink} aria-hidden="true"></i>{/if}</span>{/if}
      </li>{/each}</ul>
  {/if}

  {#if specials.length}
    <section class="spec" aria-label="Specials">
      <h4>Special</h4>
      {#each specials as s (s.id)}<p><b>{s.name}</b> {s.text}</p>{/each}
    </section>
  {/if}

  <footer class="foot">{#if foot.note}<span class="hint">{foot.note}</span>{:else}{#if foot.gold != null}<span class="sell">Sells for <b class="gold num">{fmtG(foot.gold)}</b></span>{/if}{#if salvageHint ?? foot.salvage}<span class="hint">{salvageHint ?? foot.salvage}</span>{/if}{/if}</footer>
</article>

<style>
  .gc {
    --el-fire: #d95763; --el-frost: #5fcde4; --el-venom: #6abe30; --el-holy: #fbf236;
    position: relative; isolation: isolate; display: grid; gap: 6px; width: 100%; text-align: left; padding: 8px 10px 10px; box-sizing: border-box;
    background: var(--paper); color: var(--ink);
    border-style: solid; border-width: 6px; border-color: transparent; border-image: url('../ui-art/frames/dark/card.png') 6 / 6px stretch; background-clip: padding-box; image-rendering: pixelated;
  }
  :global(:root[data-theme='light']) .gc { border-image-source: url('../ui-art/frames/light/card.png'); }
  /* rarity tint over the neutral frame: the frame image is the mask */
  .tint { position: absolute; inset: -6px; z-index: 2; pointer-events: none; background: var(--ink-r); opacity: .9; mix-blend-mode: normal;
    -webkit-mask-box-image: url('../ui-art/frames/dark/card.png') 6 / 6px stretch; mask-border: url('../ui-art/frames/dark/card.png') 6 / 6px stretch; }
  :global(:root[data-theme='light']) .tint { -webkit-mask-box-image: url('../ui-art/frames/light/card.png') 6 / 6px stretch; mask-border: url('../ui-art/frames/light/card.png') 6 / 6px stretch; mix-blend-mode: normal; opacity: .6; }
  /* rarity reads clearly without new art: a 2px ink line just inside the frame and a soft glow behind the card */
  .gc { box-shadow: inset 0 0 0 2px var(--ink-r), 0 0 0 1px color-mix(in srgb, var(--ink-r) 70%, transparent), 0 0 22px color-mix(in srgb, var(--ink-r) 50%, transparent); }
  /* unframed: no thick border, tint, glow or corners; a hairline in the rarity ink */
  .gc.flat, :global(:root[data-theme='light']) .gc.flat { border: 1px solid var(--ink-r); border-image: none; background-clip: border-box; box-shadow: none; padding: 8px 10px 10px; }
  .gl { position: absolute; width: 14px; height: 14px; z-index: 3; pointer-events: none; --g: var(--brass-fill); }
  .gl.tl { left: -7px; top: -7px; border-top: 3px solid var(--g); border-left: 3px solid var(--g); }
  .gl.tr { right: -7px; top: -7px; border-top: 3px solid var(--g); border-right: 3px solid var(--g); }
  .gl.bl { left: -7px; bottom: -7px; border-bottom: 3px solid var(--g); border-left: 3px solid var(--g); }
  .gl.br { right: -7px; bottom: -7px; border-bottom: 3px solid var(--g); border-right: 3px solid var(--g); }
  .gilt { box-shadow: inset 0 0 0 2px var(--ink-r), 0 0 0 1px var(--brass-fill), 0 0 28px color-mix(in srgb, var(--ink-r) 60%, transparent); }

  .top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding-bottom: 4px; border-bottom: 1px solid var(--rule); }
  .score { display: flex; align-items: baseline; gap: 6px; }
  .score small { font: 400 var(--t-xs)/1 var(--f-label); text-transform: uppercase; letter-spacing: .04em; color: var(--ink-3); }
  .score b { font-size: var(--t-xl); line-height: 1; color: var(--ink-r); }
  .req { font-size: var(--t-xs); color: var(--ink-2); }
  .grade { margin: 0; font: 400 var(--t-xs)/1 var(--f-label); text-transform: uppercase; letter-spacing: .06em; color: var(--ink-2); }
  .name { margin: 0; font: 600 var(--t-lg)/1.15 var(--f-display); color: var(--ink-r); overflow-wrap: anywhere; }

  .mid { display: grid; grid-template-columns: 84px 1fr; gap: 8px; align-items: start; }
  .left { display: grid; gap: 4px; justify-items: center; text-align: center; }
  .rar { margin: 0; font: 700 var(--t-xs)/1 var(--f-body); text-transform: uppercase; letter-spacing: .05em; color: var(--ink-r); }
  .big { display: grid; place-items: center; width: 76px; height: 76px; background: var(--sunk); border: 2px solid var(--ink-r); }
  .maker { margin: 0; display: flex; align-items: center; justify-content: center; gap: 3px; font-size: var(--t-xs); line-height: 1.2; color: var(--ink-2); }
  .rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 3px; min-width: 0; }
  .rows li { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 3px 6px; background: var(--sunk); border: 1px solid var(--rule); border-radius: var(--rad-sm); font-size: var(--t-sm); min-height: 24px; }
  .lab { display: flex; align-items: center; gap: 5px; min-width: 0; color: var(--ink-2); }
  .val { font-weight: 700; color: var(--ink); text-align: right; white-space: nowrap; }
  .si { flex: none; width: 16px; height: 16px; display: inline-grid; place-items: center; overflow: hidden; position: relative; }
  .si :global(.ii) { position: absolute; left: 0; top: 0; transform: scale(.5); transform-origin: 0 0; }
  .dot { width: 6px; height: 6px; background: var(--ink-3); display: block; }
  .vs { margin-left: 4px; font-size: var(--t-xs); color: var(--ink-3); white-space: nowrap; }
  .rows li.legend { background: none; border: 0; min-height: 0; padding: 0 2px; font-size: var(--t-xs); color: var(--ink-3); justify-content: flex-start; }
  .ar { margin-left: 4px; font-size: var(--t-xs); font-weight: 700; }
  .ar.up { color: var(--ok); } .ar.down { color: var(--bad); } .ar.same { color: var(--ink-3); }

  .el { margin: 0; display: flex; align-items: center; gap: 6px; padding: 3px 8px; border-left: 3px solid var(--el); background: color-mix(in srgb, var(--el) 14%, var(--sunk)); font-size: var(--t-sm); color: var(--ink); }
  .lore { margin: 0; padding-left: 8px; border-left: 2px solid var(--ink-3); font-size: var(--t-sm); line-height: 1.3; font-weight: 400; color: var(--ink-2); }
  .aff { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .aff li { position: relative; padding-left: 12px; font-size: var(--t-sm); color: var(--ink-2); }
  .aff li::before { content: ''; position: absolute; left: 2px; top: .5em; width: 5px; height: 5px; background: var(--ink-3); }
  .arow { position: relative; display: flex; align-items: center; width: 100%; height: 28px; margin: 0; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; }
  .av { font-weight: 700; } .aff li:not(.first) .av { font-weight: 700; }
  .aff li:has(.arow) { padding-left: 0; } .aff li:has(.arow)::before { display: none; }
  /* 44px hit area on a 28px row: 8px above and below; rows sit 8px apart so the hit boxes only overlap inside the gap */
  .arow::after { content: ''; position: absolute; inset: -8px 0; }
  .aff:has(.arow) { gap: 8px; }
  .arow::before { content: ''; flex: none; width: 5px; height: 5px; margin: 0 7px 0 2px; background: var(--ink-3); }
  .adet { padding-left: 14px; }
  .pip { display: inline-block; width: 7px; height: 7px; margin-left: 6px; vertical-align: middle; }
  .adet { margin: 0 0 4px; font-size: var(--t-xs); color: var(--ink-3); }
  .aff li.first { color: var(--ink); font-weight: 700; } .aff li.first::before { background: var(--ink-r); }
  .spec { padding: 6px 8px; border: 1px dashed var(--brass-fill); background: color-mix(in srgb, var(--brass-fill) 10%, var(--sunk)); border-radius: var(--rad-sm); }
  .spec h4 { margin: 0 0 2px; font: 400 var(--t-xs)/1 var(--f-label); text-transform: uppercase; letter-spacing: .05em; color: var(--brass); }
  .spec p { margin: 0; font-size: var(--t-sm); color: var(--ink); } .spec b { color: var(--brass); }
  .foot { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding-top: 4px; border-top: 1px solid var(--rule); }
  .sell { font-size: var(--t-sm); color: var(--ink-2); white-space: nowrap; } .gold { font-weight: 700; color: var(--brass); }
  .hint { font-size: var(--t-xs); color: var(--ink-3); text-align: right; }
</style>
