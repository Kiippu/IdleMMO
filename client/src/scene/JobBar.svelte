<script lang="ts">
  // Job name + progress bar + Stop, directly under the scene.
  // The bar is painted every animation frame from the engine's wall clock (repStartedAt / repMs), with a small eased
  // boost on each hit frame of the hero's work animation (pick meets ore, axe meets tree...). The boost is blended away
  // over the last 12% of the rep, the value never goes backwards inside a rep, and the rep ends at exactly 100%. Reduced motion: plain linear, no boosts.
  import { engine } from '../engine/store.svelte';
  import { engineClient } from '../engine/client';
  import { reducedMotion } from '../settings.svelte';
  import { heroLook } from './hero';
  import { hitsBetween, cycleMs } from './sprites';
  import { DATA } from '@guildwright/engine';
  import { openItem } from '../overlays/itemRef.svelte';

  // The tool in use for this job (extras.activeWork). A condition chip shows when it is below 50%.
  let work = $derived<any>(engine.derived?.extras?.activeWork ?? null);
  let toolName = $derived<string | null>(work?.toolItemId ? (engine.derived?.gearNames?.[work.toolUid] ?? (DATA as any).items?.[work.toolItemId]?.name ?? work.toolItemId) : null);
  let toolCond = $derived<number | null>(typeof work?.bonus?.toolCond === 'number' ? work.bonus.toolCond : null);

  let snap = $derived(engine.snapshot);
  let active = $derived(snap?.active ?? null);
  let jobName = $derived<string | null>(heroLook(snap).action?.name ?? null);
  let left = $derived<number | null>(typeof active?.left === 'number' ? active.left : null);
  let pct = $state(0);              // coarse value for aria only
  let fillEl = $state<HTMLElement | null>(null);

  const BOOST_MS = 130, BLEND = 0.5;
  // The bar runs on the same clock as completion: (Date.now() - repStartedAt) / repMs, both stamped by the engine.
  // Hit boosts are drawn on top but fade out toward the end, so the bar reaches 100% exactly when the rep really ends.
  let repKey = '', peak = 0, wasHeld = false;
  const num = (v: unknown, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);

  $effect(() => {
    if (!fillEl || !active) return;
    let raf = 0, shown = -1;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden || !fillEl) return;
      const a = engine.snapshot?.active;
      if (!a) return;
      // Held (craft card open): freeze at the last drawn fraction, no movement, no hit boost.
      if ((a as { held?: boolean }).held) { wasHeld = true; return; }
      const wall = Date.now();
      const start = num(a.repStartedAt, NaN), len = num(a.repMs, 0);
      let f: number, startPerf: number;
      if (isFinite(start) && len > 0) {
        f = Math.max(0, Math.min(1, (wall - start) / len));
        startPerf = now - (wall - start);
      } else {                                     // no stamp yet (just after load): show the last tick as-is
        const T = engine.derived?.activeTime ?? 0;
        f = T > 0 ? Math.max(0, Math.min(1, num(a.progress) / T)) : 0;
        startPerf = now - f * T * 1000;
      }
      const key = `${a.actionId}|${isFinite(start) ? start : ''}`;
      if (key !== repKey) { repKey = key; if (!wasHeld) peak = 0; }   // after a hold the engine re-stamps the rep: keep the frozen value, continue from it
      wasHeld = false;
      let v = f;
      if (!reducedMotion() && f < 1) {
        const anim = heroLook(engine.snapshot).look.anim;
        const T = len > 0 ? len : (engine.derived?.activeTime ?? 0) * 1000;
        const expect = Math.max(1, Math.floor(T / cycleMs(anim)));
        let s = 0;
        for (const t of hitsBetween(anim, startPerf, now)) { const k = Math.min(1, (now - t) / BOOST_MS); s += k * k * (3 - 2 * k); }
        s = Math.min(1, s / expect);
        v = f + BLEND * (s - f) * (1 - smooth(0.88, 1, f));
        v = Math.min(v, 0.999);                    // 100% only when the clock says the rep is over
      }
      v = Math.max(peak, v); peak = v;
      fillEl.style.transform = `scaleX(${v})`;
      document.documentElement.style.setProperty('--rep', String(v));
      const p = Math.round(v * 100);
      if (p !== shown) { shown = p; if (Math.abs(p - pct) >= 5 || p === 0 || p === 100) pct = p; }
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); document.documentElement.style.removeProperty('--rep'); };
  });
  const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  async function stop() {
    try { await engineClient.stop(); } catch (err) { console.error('stop failed', err); }
  }
</script>

<div class="jobbar" class:idle={!active}>
  {#if active}
    <div class="row">
      <span class="name">{jobName ?? 'Working'}{#if left != null}<small class="num"> · {left} left</small>{/if}</span>
      <button type="button" class="btn stop" onclick={stop}>Stop</button>
    </div>
    {#if work && toolName}
      <button type="button" class="tool" onclick={() => openItem({ itemId: work.toolItemId, uid: work.toolUid })}>
        <span class="tl">Tool: {toolName}</span>
        {#if toolCond != null && toolCond < 50}<span class="chip num" class:crit={toolCond < 25}>{toolCond}%</span>{/if}
      </button>
    {/if}
    <div class="bar" role="progressbar" aria-label="Job progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct}>
      <div class="fill" bind:this={fillEl}></div>
    </div>
  {:else}
    <p class="none">Nothing running — pick a job below</p>
  {/if}
</div>

<style>
  .jobbar { margin: 6px 0 12px; display: grid; gap: 4px; }
  .row { display: flex; align-items: center; gap: 8px; min-height: 44px; }
  .name { flex: 1; min-width: 0; font: 700 var(--t-md)/1.15 var(--f-body); color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .name small { font-weight: 400; color: var(--ink-3); }
  .stop { flex: none; min-width: 72px; padding: 0 12px; }
  .tool { min-height: 44px; margin: -8px 0 -4px; padding: 0; border: 0; background: none; display: flex; align-items: center; gap: 8px; color: var(--ink-3); font: 400 var(--t-sm)/1.2 var(--f-body); text-align: left; }
  .tl { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-decoration: underline; text-decoration-color: var(--rule); }
  .chip { flex: none; padding: 1px 6px; border: 1px solid var(--bad); color: var(--bad); font-size: var(--t-xs); font-weight: 700; }
  .chip.crit { background: var(--bad); color: var(--paper); }
  .bar { height: 10px; background: var(--sunk); border: 1px solid var(--rule); overflow: hidden; }
  .fill { height: 100%; width: 100%; background: var(--woad); transform: scaleX(0); transform-origin: left center; will-change: transform; }
  .none { margin: 0; min-height: 44px; display: flex; align-items: center; color: var(--ink-3); font-size: var(--t-sm); }
</style>
