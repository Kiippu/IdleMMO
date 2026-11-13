<script lang="ts">
  import { fmtHpNow, fmtHpTotal } from './engine/format';
  // Sticky status strip: gold, health, raid timer and the Menu cog. The running job lives under the Workshop scene.
  import { engine } from './engine/store.svelte';
  import { fmtG, fmtN, fmtDuration } from './format';
  import { reducedMotion } from './settings.svelte';

  type Props = { onMenu: () => void };
  let { onMenu }: Props = $props();

  let snap = $derived(engine.snapshot);
  let view = $derived(engine.derived);
  let hp = $derived(Math.max(0, snap?.hp ?? 0));
  let maxHp = $derived<number>(view?.playerStats?.maxHp ?? 0);
  let hpPct = $derived(maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0);
  let raid = $derived(view?.raidStatus ?? null);
  let chip = $derived.by(() => {
    if (!raid) return null;
    if (raid.phase === 'live') return { text: `Ends ${fmtDuration(raid.secLeft)}`, live: true };
    if (raid.phase === 'done') {
      const sec = raid.nextRaidAt ? (raid.nextRaidAt - Date.now()) / 1000 : 0;
      return { text: sec > 0 ? `Next ${fmtDuration(sec)}` : 'Raid settled', live: false };
    }
    return { text: `Raid ${fmtDuration(raid.secToStart)}`, live: false };
  });

  // Gold counts up (~600ms, eased) a moment after it rises, so it lands with the coin fountain; drops and reduced motion are instant.
  let shownGold = $state<number | null>(null);
  $effect(() => {
    const target = snap?.gold;
    if (typeof target !== 'number') return;
    const from = shownGold;
    if (from == null || target <= from || reducedMotion() || typeof requestAnimationFrame !== 'function') { shownGold = target; return; }
    let raf = 0, t0 = 0;
    const DELAY = 900, DUR = 600;
    const step = (now: number) => {
      if (!t0) t0 = now;
      const k = Math.min(1, Math.max(0, (now - t0 - DELAY) / DUR));
      shownGold = from + (target - from) * (1 - Math.pow(1 - k, 3));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  });
</script>

<header class="strip">
  {#if snap}<span class="gold" aria-label="Gold {fmtG(snap.gold)}">{fmtG(Math.floor(shownGold ?? snap.gold))}</span>{/if}
  <span class="hp" role="img" aria-label="Health {fmtHpNow(hp, maxHp)} of {fmtHpTotal(maxHp)}">
    <svg viewBox="0 0 16 14" width="16" height="14" aria-hidden="true" shape-rendering="crispEdges"><path d="M2 1h4v1h1v1h2V2h1V1h4v1h1v5h-1v1h-1v1h-1v1h-1v1H9v1H7v-1H6v-1H5v-1H4V8H3V7H2V2z" fill="var(--hp)"/></svg>
    <span class="hpbar"><span class="hpfill" style="width: {Math.round(hpPct * 100)}%"></span></span>
    <span class="num">{fmtHpNow(hp, maxHp)}/{fmtHpTotal(maxHp)}</span>
  </span>
  {#if chip}<span class="chip" class:live={chip.live}>{chip.text}</span>{/if}
  <button type="button" class="btn cog" onclick={onMenu} aria-label="Menu">
    <svg viewBox="0 0 16 16" width="22" height="22" aria-hidden="true" shape-rendering="crispEdges" fill="currentColor"><path fill-rule="evenodd" d="M6 0h4v2h1v1h1l1-1h1l1 1v1l-1 1v1h2v4h-2v1l1 1v1l-1 1h-1l-1-1h-1v1h-1v2H6v-2H5v-1H4l-1 1H2l-1-1v-1l1-1V9H0V5h2V4L1 3V2l1-1h1l1 1h1V2h1zM8 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>
  </button>
</header>

<style>
  .strip {
    position: sticky; top: 0; z-index: 15; display: flex; align-items: center; gap: 10px; min-height: 48px;
    margin: 0 calc(var(--gut-r) * -1) 0 calc(var(--gut-l) * -1);
    padding: 0 var(--gut-r) 0 var(--gut-l);
    background: var(--plaster); border-bottom: 1px solid var(--rule);
  }
  .gold { font-size: var(--t-lg); flex: none; }
  .hp { flex: none; display: inline-flex; align-items: center; gap: 4px; font: 700 var(--t-xs)/1 var(--f-num); font-variant-numeric: tabular-nums; color: var(--ink-2); }
  .hpbar { width: 36px; height: 6px; background: var(--sunk); border: 1px solid var(--rule); overflow: hidden; display: block; }
  .hpfill { display: block; height: 100%; background: var(--hp); }
  .chip { flex: 1; min-width: 0; text-align: right; font: 700 var(--t-xs)/1.2 var(--f-num); font-variant-numeric: tabular-nums; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chip.live { color: var(--woad); }
  .cog { flex: none; width: 44px; padding: 0; margin-left: auto; display: grid; place-items: center; }
  .chip + .cog { margin-left: 0; }
</style>
