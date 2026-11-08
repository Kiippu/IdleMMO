<script lang="ts">
  // Full-screen "While you were away" sheet. The engine already applied the gains;
  // this only presents them: rows count up (staggered), XP bars fill, items run common ->
  // rarest with a rarity flash on rare+, tap anywhere skips to the end, then "Collect".
  // prefers-reduced-motion: no count-up, no flash.
  import { DATA } from '@guildwright/engine';
  import { engine } from '../engine/store.svelte';
  import { fmtG, fmtN, fmtDuration, rarityRank } from '../format';

  const items: Record<string, { name?: string }> = (DATA as any).items;
  const itemRarity: Record<string, string> = (DATA as any).itemRarity ?? {};
  const skills: Array<{ id: string; name: string }> = (DATA as any).skills;
  const itemName = (id: string) => items[id]?.name ?? id;
  const skillName = (id: string) => skills.find((s) => s.id === id)?.name ?? id;

  const DUR = 600, STAGGER = 90;

  let summary = $derived(engine.offline);

  type Row = { key: string; label: string; value: number; fmt: (n: number) => string; rarity?: string; group: 'total' | 'item' | 'xp' | 'craft'; frac?: number };
  let rows = $derived.by<Row[]>(() => {
    const s = summary;
    if (!s) return [];
    const out: Row[] = [];
    const n = (v: number) => fmtN(v);
    if (s.gold) out.push({ key: 'gold', label: 'Gold', value: s.gold, fmt: (v) => `${v < 0 ? '−' : ''}${fmtG(Math.abs(v))}`, group: 'total' });
    if (s.kills) out.push({ key: 'kills', label: 'Kills', value: s.kills, fmt: n, group: 'total' });
    if (s.assisted) out.push({ key: 'assisted', label: 'Crew assists', value: s.assisted, fmt: n, group: 'total' });
    if (s.tips) out.push({ key: 'tips', label: 'Crew tips', value: s.tips, fmt: fmtG, group: 'total' });
    Object.entries(s.items).filter(([, q]) => q > 0)
      .map(([id, q]) => ({ id, q, r: itemRarity[id] ?? 'common' }))
      .sort((a, b) => rarityRank(a.r) - rarityRank(b.r) || b.q - a.q)
      .forEach(({ id, q, r }) => out.push({ key: `i:${id}`, label: itemName(id), value: q, fmt: (v) => `×${n(v)}`, rarity: r, group: 'item' }));
    const xp = Object.entries(s.xp).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const maxXp = xp.length ? xp[0][1] : 1;
    xp.forEach(([id, v]) => out.push({ key: `x:${id}`, label: skillName(id), value: Math.round(v), fmt: (q) => `${n(q)} XP`, group: 'xp', frac: v / maxXp }));
    Object.entries(s.crafts).filter(([, q]) => q > 0)
      .sort((a, b) => rarityRank(a[0]) - rarityRank(b[0]))
      .forEach(([r, q]) => out.push({ key: `c:${r}`, label: `${r[0].toUpperCase()}${r.slice(1)} crafts`, value: q, fmt: (v) => `×${n(v)}`, rarity: r, group: 'craft' }));
    return out;
  });
  let awayText = $derived(summary?.awaySec ? ` · ${fmtDuration(summary.awaySec)}` : '');

  const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let elapsed = $state(0);
  let skipped = $state(false);
  let totalMs = $derived(rows.length ? (rows.length - 1) * STAGGER + DUR : 0);
  let finished = $derived(skipped || elapsed >= totalMs);

  // Restart the clock whenever a new summary arrives.
  $effect(() => {
    if (!summary) return;
    elapsed = 0; skipped = reduced();
    if (skipped) return;
    let raf = 0; const t0 = performance.now();
    const tick = (now: number) => {
      elapsed = now - t0;
      if (elapsed < totalMs) raf = requestAnimationFrame(tick); else elapsed = totalMs;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  const prog = (i: number) => (skipped ? 1 : Math.max(0, Math.min(1, (elapsed - i * STAGGER) / DUR)));
  const ease = (p: number) => 1 - Math.pow(1 - p, 3);
  const shown = (r: Row, i: number) => Math.round(r.value * ease(prog(i)));
  const flash = (r: Row, i: number) => !skipped && !reduced() && r.rarity && rarityRank(r.rarity) >= 2 && prog(i) >= 1;

  let btn = $state<HTMLButtonElement | null>(null);
  $effect(() => { if (finished && btn) btn.focus(); });

  function skip() { skipped = true; }
  function collect() { engine.offline = null; }
  function onKey(ev: KeyboardEvent) {
    if (!summary) return;
    if (ev.key === 'Escape' && finished) collect();
    else if (ev.key === 'Escape' || ev.key === ' ') skip();
  }
</script>

<svelte:window onkeydown={onKey} />

{#if summary}
  <div class="full" role="dialog" aria-modal="true" aria-labelledby="away-title" onclick={skip} onkeydown={onKey} tabindex="-1">
    <div class="col">
      <header>
        <h2 id="away-title">While you were away<span class="num">{awayText}</span></h2>
        {#if summary.weeks}
          <p class="sub"><span class="num">{summary.weeks}</span> {summary.weeks === 1 ? 'week' : 'weeks'} passed on the calendar.</p>
        {/if}
      </header>

      {#if rows.length}
        <ul>
          {#each rows as r, i (r.key)}
            <li class:flash={flash(r, i)} class="g-{r.group}" style:--ink-r={r.rarity ? `var(--r-${r.rarity})` : 'var(--ink)'} style:opacity={skipped || prog(i) > 0 ? 1 : 0}>
              <div class="line">
                <span class="lab" style:color={r.rarity && r.group !== 'total' ? `var(--r-${r.rarity})` : undefined}>{r.label}</span>
                <span class="val num">{r.fmt(shown(r, i))}</span>
              </div>
              {#if r.group === 'xp'}
                <div class="xpbar" aria-hidden="true"><div style="width: {Math.round((r.frac ?? 0) * 100 * ease(prog(i)))}%"></div></div>
              {/if}
            </li>
          {/each}
        </ul>
      {:else}
        <p class="sub">The game ticked but nothing changed. You weren't working on anything.</p>
      {/if}

      {#if summary.stoppedReason}<p class="stopped">{summary.stoppedReason}</p>{/if}

      {#if !finished}<p class="hint">Tap anywhere to skip</p>{/if}
      <button type="button" class="btn primary collect" bind:this={btn} disabled={!finished} onclick={(e) => { e.stopPropagation(); collect(); }}>Collect</button>
    </div>
  </div>
{/if}

<style>
  .full {
    position: fixed; inset: 0; z-index: 45; overflow-y: auto; background: var(--plaster);
    display: flex; justify-content: center;
    padding: max(16px, env(safe-area-inset-top)) var(--gut-r) max(16px, env(safe-area-inset-bottom)) var(--gut-l);
  }
  .col { width: 100%; max-width: var(--col); display: grid; gap: 12px; align-content: start; }
  h2 { margin: 0; font: 600 var(--t-xl)/1.15 var(--f-display); color: var(--ink); }
  h2 .num { font-family: var(--f-num); font-weight: 700; color: var(--ink-2); font-size: var(--t-lg); }
  .sub { margin: 4px 0 0; color: var(--ink-2); font-size: var(--t-sm); }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  li { padding: 10px 12px; background: var(--paper); border: 1px solid var(--rule); }
  .g-total { background: var(--sunk); }
  .line { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .lab { font: 500 var(--t-md)/1.2 var(--f-body); color: var(--ink); }
  .g-total .lab { color: var(--ink-2); }
  .val { font-weight: 700; font-size: var(--t-md); color: var(--ink); }
  .g-total:first-child .val { color: var(--brass); }
  .xpbar { margin-top: 6px; height: 6px; background: var(--sunk); border: 1px solid var(--rule); overflow: hidden; }
  .xpbar div { height: 100%; background: var(--woad); }
  li.flash { animation: flash 700ms ease-out; }
  @keyframes flash { 0% { background: color-mix(in srgb, var(--ink-r) 35%, var(--paper)); border-color: var(--ink-r); } 100% { background: var(--paper); } }
  @media (prefers-reduced-motion: reduce) { li.flash { animation: none; } }
  .stopped { margin: 0; padding: 8px; background: var(--sunk); border: 1px solid var(--rule); color: var(--warn); font-size: var(--t-sm); }
  .hint { margin: 0; text-align: center; color: var(--ink-3); font-size: var(--t-sm); }
  .collect { position: sticky; bottom: 0; width: 100%; }
</style>
