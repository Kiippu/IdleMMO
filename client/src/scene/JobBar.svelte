<script lang="ts">
  // Job name + progress bar + Stop, directly under the scene.
  // The bar is painted every animation frame (the worker only ticks once a second). Between ticks it interpolates from
  // the last tick's progress; on top of that it takes a small eased boost on each hit frame of the hero's work
  // animation (pick meets ore, axe meets tree...). The boost is blended away over the last 12% of the rep, the value
  // never goes backwards inside a rep, and the rep ends at exactly 100%. Reduced motion: plain linear, no boosts.
  import { engine } from '../engine/store.svelte';
  import { engineClient } from '../engine/client';
  import { reducedMotion } from '../settings.svelte';
  import { heroLook } from './hero';
  import { hitsBetween, cycleMs } from './sprites';

  let snap = $derived(engine.snapshot);
  let active = $derived(snap?.active ?? null);
  let jobName = $derived<string | null>(heroLook(snap).action?.name ?? null);
  let left = $derived<number | null>(typeof active?.left === 'number' ? active.left : null);
  let pct = $state(0);              // coarse value for aria only
  let fillEl = $state<HTMLElement | null>(null);

  const TICK = 1;                   // worker tick length, seconds
  const BOOST_MS = 130, BLEND = 0.5;
  let last = { id: '' as string, prog: 0, at: 0, repStart: 0, peak: 0, flashUntil: 0 };

  // A tick brought new progress: remember it (and start a new rep when it wrapped or the job changed).
  $effect(() => {
    const id = active?.actionId ?? '';
    const prog = Number(active?.progress ?? 0);
    const now = performance.now();
    if (id !== last.id) last = { id, prog, at: now, repStart: now - prog * 1000, peak: 0, flashUntil: 0 };
    else if (prog < last.prog - 1e-6) last = { id, prog, at: now, repStart: now - prog * 1000, peak: 0, flashUntil: now + 150 };
    else { last.prog = prog; last.at = now; }
  });

  $effect(() => {
    if (!fillEl || !active) return;
    let raf = 0, shown = -1;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden || !fillEl) return;
      const T = engine.derived?.activeTime ?? 0;
      let v = 0;
      if (now < last.flashUntil) v = 1;            // the rep just completed: sit at 100% for a beat
      else if (T > 0) {
        const est = last.prog + Math.min((now - last.at) / 1000, TICK * 1.05);
        let f = Math.min(1, est / T);
        if (!reducedMotion()) {
          const anim = heroLook(engine.snapshot).look.anim;
          const hits = hitsBetween(anim, last.repStart, now);
          const expect = Math.max(1, Math.floor((T * 1000) / cycleMs(anim)));
          let s = 0;
          for (const t of hits) { const k = Math.min(1, (now - t) / BOOST_MS); s += k * k * (3 - 2 * k); }
          s = Math.min(1, s / expect);
          const fade = 1 - smooth(0.88, 1, f);
          f = f + BLEND * (s - f) * fade;
        }
        v = Math.min(0.995, Math.max(last.peak, f));   // never backwards within a rep; 100% only at completion
        last.peak = v;
      }
      fillEl.style.transform = `scaleX(${v})`;
      const p = Math.round(v * 100);
      if (p !== shown) { shown = p; if (Math.abs(p - pct) >= 5 || p === 0 || p === 100) pct = p; }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
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
  .bar { height: 10px; background: var(--sunk); border: 1px solid var(--rule); overflow: hidden; }
  .fill { height: 100%; width: 100%; background: var(--woad); transform: scaleX(0); transform-origin: left center; will-change: transform; }
  .none { margin: 0; min-height: 44px; display: flex; align-items: center; color: var(--ink-3); font-size: var(--t-sm); }
</style>
