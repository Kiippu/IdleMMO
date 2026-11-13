<script lang="ts">
  import { pushBack } from './backStack.svelte';
  import { gradeName } from '../engine/grades';
  import ItemIcon from '../art/ItemIcon.svelte';
  import { celebrate } from '../fx/bus';
  import type { Rarity } from '../fx/gains';
  import { reducedMotion } from '../settings.svelte';
  import { untrack } from 'svelte';
  // Full-screen "While you were away" sheet. The engine already applied the gains;
  // this only presents them: rows count up (staggered), XP bars fill, items run common ->
  // rarest with a rarity flash on rare+, tap anywhere skips to the end, then "Collect".
  // prefers-reduced-motion: no count-up, no flash.
  import { DATA } from '@guildwright/engine';
  import { engine } from '../engine/store.svelte';
  import { fmtG, fmtN, fmtDuration, rarityRank } from '../format';
  import { openItem } from './itemRef.svelte';

  const items: Record<string, { name?: string }> = (DATA as any).items;
  const itemRarity: Record<string, string> = (DATA as any).itemRarity ?? {};
  const skills: Array<{ id: string; name: string }> = (DATA as any).skills;
  const itemName = (id: string) => items[id]?.name ?? id;
  const skillName = (id: string) => skills.find((s) => s.id === id)?.name ?? id;

  const DUR = 600, STAGGER = 90;

  let summary = $derived(engine.offline);

  type Row = { itemId?: string; uid?: string | null; key: string; label: string; value: number; fmt: (n: number) => string; rarity?: string; skillId?: string; group: 'total' | 'item' | 'skill' | 'craft'; sub?: string };
  let rows = $derived.by<Row[]>(() => {
    const s = summary;
    if (!s) return [];
    const out: Row[] = [];
    const n = (v: number) => fmtN(v);
    if (s.gold) {
      const src = (s.goldBySource ?? []).filter((g) => g.gold !== 0).map((g) => `${g.label} ${g.gold < 0 ? '−' : ''}${fmtG(Math.abs(g.gold))}`);
      out.push({ key: 'gold', label: 'Gold', value: s.gold, fmt: (v) => `${v < 0 ? '−' : ''}${fmtG(Math.abs(v))}`, group: 'total', sub: src.length > 1 ? src.join(' · ') : undefined });
    }
    if (s.kills) out.push({ key: 'kills', label: 'Kills', value: s.kills, fmt: n, group: 'total' });
    if (s.assisted) out.push({ key: 'assisted', label: 'Crew assists', value: s.assisted, fmt: n, group: 'total' });
    if (s.tips) out.push({ key: 'tips', label: 'Crew tips', value: s.tips, fmt: fmtG, group: 'total' });
    // One line per skill, however many levels it gained. The top skill is the headline above, so it is not repeated here.
    for (const k of (s.skills ?? []).slice(1)) out.push({ key: `k:${k.skill}`, label: k.headline, value: 0, fmt: () => '', group: 'skill', skillId: k.skill });
    // Loot grouped by item, highest value first (the engine includes raid payout items).
    for (const l of s.loot ?? []) out.push({ itemId: l.itemId, uid: l.uids?.[0] ?? null, key: `i:${l.itemId}`, label: l.name, value: l.qty, fmt: (v) => `+${n(v)}`, rarity: l.rarity, group: 'item' });
    Object.entries(s.crafts).filter(([, q]) => q > 0)
      .sort((a, b) => rarityRank(a[0]) - rarityRank(b[0]))
      .forEach(([r, q]) => out.push({ key: `c:${r}`, label: `${r[0].toUpperCase()}${r.slice(1)} crafts`, value: q, fmt: (v) => `×${n(v)}`, rarity: r, group: 'craft' }));
    return out;
  });
  // Tools that dropped below 50% while away (engine field; absent = none).
  let wornTools = $derived<Array<{ uid?: string; itemId?: string; name?: string; cond: number }>>(((summary as any)?.wornTools ?? []).filter((t: any) => t && Number.isFinite(t.cond)));
  let headline = $derived(summary?.skills?.[0]?.headline ?? null);
  let best = $derived(summary?.bestFind ?? null);
  let awayText = $derived(summary?.awaySec ? ` · ${fmtDuration(summary.awaySec)}` : '');

  const reduced = reducedMotion;
  let elapsed = $state(0);
  let skipped = $state(false);
  let totalMs = $derived(rows.length ? (rows.length - 1) * STAGGER + DUR : 0);
  let finished = $derived(skipped || elapsed >= totalMs);

  // Restart the clock whenever a new summary arrives.
  $effect(() => {
    if (!summary) return;
    // Only a new summary restarts the clock; skipping must not re-run this.
    return untrack(() => {
      elapsed = 0; skipped = reduced();
      if (skipped) return;
      let raf = 0; const t0 = performance.now();
      const tick = (now: number) => {
        if (skipped) return;
        elapsed = now - t0;
        if (elapsed < totalMs) raf = requestAnimationFrame(tick); else elapsed = totalMs;
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    });
  });

  const prog = (i: number) => (skipped ? 1 : Math.max(0, Math.min(1, (elapsed - i * STAGGER) / DUR)));
  const ease = (p: number) => 1 - Math.pow(1 - p, 3);
  const shown = (r: Row, i: number) => Math.round(r.value * ease(prog(i)));
  const flash = (r: Row, i: number) => !skipped && !reduced() && r.rarity && rarityRank(r.rarity) >= 2 && prog(i) >= 1;

  let btn = $state<HTMLButtonElement | null>(null);
  $effect(() => { if (finished && btn) btn.focus(); });

  // Nothing to show: don't open at all.
  $effect(() => { if (summary && rows.length === 0 && !summary.stoppedReason && !summary.weeks) engine.offline = null; });
  // ---- Return fountain: the WHOLE haul is handed (on open) to the shared Fountain (one pop per unit, stacked past the cap, plus coins).
  function haul() {
    const sm = summary; if (!sm) return;
    const gains = (sm.loot ?? []).filter((l) => l.qty > 0).map((l) => ({ itemId: l.itemId, qty: l.qty, rarity: (l.rarity ?? itemRarity[l.itemId] ?? 'common') as Rarity }));
    celebrate({ gains, coins: sm.gold > 0 ? sm.gold : 0, big: true });
  }
  function skip() { skipped = true; }
  // Back = Escape: skip the count-up, then Collect.
  let isOpen = $derived(!!summary && !!(rows.length || summary.stoppedReason || summary.weeks));
  $effect(() => { if (isOpen) return pushBack(() => { if (finished) collect(); else skip(); }); });
  function collect() { engine.offline = null; }
  // The haul bursts the moment the reveal opens (once per summary), not on Collect.
  let hauled: unknown = null;
  $effect(() => {
    const sm = summary;
    if (!sm || sm === hauled || !(rows.length || sm.stoppedReason || sm.weeks)) return;
    hauled = sm;
    untrack(haul);
  });
  function onKey(ev: KeyboardEvent) {
    if (!summary) return;
    if (ev.key === 'Escape' && finished) collect();
    else if (ev.key === 'Escape' || ev.key === ' ') skip();
  }
</script>

<svelte:window onkeydown={onKey} />

{#if summary && (rows.length || summary.stoppedReason || summary.weeks)}
  <div class="full" role="dialog" aria-modal="true" aria-labelledby="away-title" onclick={skip} onkeydown={onKey} tabindex="-1">
    <div class="col">
      <div class="mid">
      <header>
        <h2 id="away-title">While you were away<span class="num">{awayText}</span></h2>
        {#if summary.weeks}
          <p class="sub"><span class="num">{summary.weeks}</span> {summary.weeks === 1 ? 'week' : 'weeks'} passed on the calendar.</p>
        {/if}
        {#if headline}<p class="headline">{#if summary.skills?.[0]?.skill}<ItemIcon skill={summary.skills[0].skill} />{/if}<span>{headline}</span></p>{/if}
      </header>

      {#if best}
        <button type="button" class="hero" style:--ink-r={`var(--r-${best.rarity})`} onclick={(e) => { e.stopPropagation(); openItem({ itemId: best.itemId, ...(best.uid ? { uid: best.uid } : {}) }); }}>
          <span class="sq" aria-hidden="true"><ItemIcon id={best.itemId} rarity={best.rarity} grade={best.grade} /></span>
          <span class="hm">
            <small>Best find</small>
            <span class="hn" style:color={`var(--r-${best.rarity})`}>{best.name}</span>
            <small>{best.grade != null ? `${gradeName(best.grade)} · ` : ''}{best.rarity[0].toUpperCase() + best.rarity.slice(1)}{best.qty > 1 ? ` · ×${fmtN(best.qty)}` : ''}</small>
          </span>
        </button>
      {/if}

      {#if rows.length}
        <ul>
          {#each rows as r, i (r.key)}
 <li class:flash={flash(r, i)} class="g-{r.group}" class:tap={!!r.itemId} style:--ink-r={r.rarity ? `var(--r-${r.rarity})` : 'var(--ink)'} style:opacity={skipped || prog(i) > 0 ? 1 : 0}>
              <div class="line">
                {#if r.itemId}<button type="button" class="rowbtn" onclick={(e) => { e.stopPropagation(); openItem({ itemId: r.itemId!, ...(r.uid ? { uid: r.uid } : {}) }); }}><ItemIcon id={r.itemId} rarity={r.rarity} /><span class="lab" style:color={`var(--r-${r.rarity})`}>{r.label}</span><span class="val num">{r.fmt(shown(r, i))}</span></button>{:else}{#if r.group === 'craft'}<ItemIcon named="craft" rarity={r.rarity} />{:else if r.group === 'skill' && r.skillId}<ItemIcon skill={r.skillId} />{/if}<span class="lab" style:color={r.rarity && r.group !== 'total' ? `var(--r-${r.rarity})` : undefined}>{r.label}</span>{/if}
                {#if r.group !== 'skill' && !r.itemId}<span class="val num">{r.fmt(shown(r, i))}</span>{/if}
              </div>
              {#if r.sub}<p class="src">{r.sub}</p>{/if}
            </li>
          {/each}
        </ul>
      {:else}
        <p class="sub">The game ticked but nothing changed. You weren't working on anything.</p>
      {/if}

      {#each wornTools as t (t.uid ?? t.itemId ?? t.name)}<p class="worn">{t.name ?? (t.itemId ? itemName(t.itemId) : 'A tool')} is worn: <span class="num">{Math.round(t.cond)}%</span></p>{/each}

      {#if summary.stoppedReason}<p class="stopped" class:done={summary.stoppedDone}>{summary.stoppedReason}</p>{/if}

      {#if !finished}<p class="hint">Tap anywhere to skip</p>{/if}
      </div>
      <div class="foot"><button type="button" class="btn primary collect" bind:this={btn} disabled={!finished} onclick={(e) => { e.stopPropagation(); collect(); }}>Collect</button></div>
    </div>
  </div>
{/if}

<style>
  .full {
    position: fixed; inset: 0; z-index: 45; overflow-y: auto; background: var(--plaster);
    display: flex; justify-content: center;
    padding: max(16px, env(safe-area-inset-top)) var(--gut-r) 0 var(--gut-l);
  }
  .col { width: 100%; max-width: var(--col); min-height: 100%; display: flex; flex-direction: column; gap: 12px; }
  .full { animation: fin 220ms ease-out; }
  @keyframes fin { from { opacity: 0; } }
  .mid { flex: 1; display: grid; gap: 12px; align-content: center; }
  h2 { margin: 0; font: 600 var(--t-xl)/1.15 var(--f-display); color: var(--ink); }
  h2 .num { font-family: var(--f-num); font-weight: 700; color: var(--ink-2); font-size: var(--t-lg); }
  .sub { margin: 4px 0 0; color: var(--ink-2); font-size: var(--t-sm); }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  li { padding: 10px 12px; background: var(--paper); border: 1px solid var(--rule); }
  .g-total { background: var(--sunk); }
  .line { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .line :global(.ii), .rowbtn :global(.ii) { margin-right: 4px; }
  .rowbtn .lab { flex: 1; }
  .headline { display: flex; align-items: center; gap: 8px; }
  .lab { font: 500 var(--t-md)/1.2 var(--f-body); color: var(--ink); }
  .lb { min-height: 44px; padding: 0; border: 0; background: none; text-align: left; }
  .g-total .lab { color: var(--ink-2); }
  .val { font-weight: 700; font-size: var(--t-md); color: var(--ink); }
  .g-total:first-child .val { color: var(--brass); }
  .headline { margin: 6px 0 0; font: 700 var(--t-md)/1.3 var(--f-body); color: var(--woad); }
  .hero { display: flex; align-items: center; gap: 12px; padding: 12px; text-align: left; background: var(--paper); border: 2px solid var(--ink-r); min-height: 72px; color: var(--ink); }
  .hero .sq { flex: none; width: 48px; height: 48px; display: grid; place-items: center; border: 2px solid var(--ink-r); background: var(--sunk); }
  .hm { display: grid; gap: 2px; min-width: 0; }
  .hm small { color: var(--ink-3); font-size: var(--t-xs); }
  .hn { font: 700 var(--t-lg)/1.15 var(--f-body); }
  .g-skill .lab { color: var(--woad); font-weight: 700; font-size: var(--t-sm); }
  .src { margin: 2px 0 0; color: var(--ink-3); font-size: var(--t-xs); }
  li.flash { animation: flash 700ms ease-out; }
  @keyframes flash { 0% { background: color-mix(in srgb, var(--ink-r) 35%, var(--paper)); border-color: var(--ink-r); } 100% { background: var(--paper); } }
  @media (prefers-reduced-motion: reduce) { li.flash { animation: none; } }
  .stopped.done { color: var(--ok); }
  .stopped { margin: 0; padding: 8px; background: var(--sunk); border: 1px solid var(--rule); color: var(--warn); font-size: var(--t-sm); }
  .worn { margin: 0; padding: 8px 12px; background: var(--sunk); border: 1px solid var(--rule); color: var(--warn); font-size: var(--t-sm); }
  .hint { margin: 0; text-align: center; color: var(--ink-3); font-size: var(--t-sm); }
  .foot { position: sticky; bottom: 0; margin: 0 calc(var(--gut-r) * -1) 0 calc(var(--gut-l) * -1); padding: 12px var(--gut-r) max(12px, env(safe-area-inset-bottom)) var(--gut-l); background: var(--plaster); border-top: 1px solid var(--rule); }
  .collect { width: 100%; }
  .mid { padding-bottom: 12px; }
  li { min-height: 48px; display: flex; flex-direction: column; justify-content: center; }
  li.tap { padding: 0; }
  .rowbtn { width: 100%; min-height: 48px; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; gap: 8px; border: 0; background: none; text-align: left; }
</style>
