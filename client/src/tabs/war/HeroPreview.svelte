<script lang="ts">
  // The hero drawn idle from the LPC layers, wearing the equipped gear. Native 48x44 canvas shown at 4x, pixelated.
  import { DATA } from '@guildwright/engine';
  import { engine } from '../../engine/store.svelte';
  import { reducedMotion } from '../../settings.svelte';
  import { loadSceneArt, MAN, figure, lookFrame, type Equipped, type Gear } from '../../scene/sprites';

  const W = 48, H = 56, FEET = 50, SCALE = 3;
  const items: Record<string, any> = (DATA as any).items;
  let canvasEl: HTMLCanvasElement;

  function gearAt(slot: string): Gear | null {
    const s = engine.snapshot;
    const uid = s?.equipped?.[slot];
    const g = uid ? (s?.gear as any[] | undefined)?.find((x) => x.uid === uid) : null;
    const it = g ? items[g.itemId] : null;
    return it ? { itemId: g.itemId, tier: it.tier ?? 1, role: it.role ?? '' } : null;
  }
  let look = $derived.by(() => {
    const eq: Equipped = { weapon: gearAt('weapon'), head: gearAt('head'), chest: gearAt('chest'), legs: gearAt('legs') };
    return figure(null, false, eq, false);
  });

  $effect(() => {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;
    let art: Awaited<ReturnType<typeof loadSceneArt>> | null = null;
    let raf = 0, last = 0, sig = '';
    loadSceneArt().then((a) => { art = a; });
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden || !art || now - last < 66) return;
      last = now;
      const a = MAN.anims[look.anim];
      const fr = lookFrame(look, now, reducedMotion());
      const key = `${look.key}|${fr}`;
      if (key === sig) return;
      sig = key;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(34,32,52,0.35)';
      ctx.fillRect(W / 2 - 8, FEET, 16, 1); ctx.fillRect(W / 2 - 6, FEET + 1, 12, 1);
      for (const k of [...look.back, ...look.front]) {
        const r = MAN.layers[k]?.[look.anim];
        if (!r) continue;
        ctx.drawImage(art.atlas, r.x + fr * r.w, r.y, r.w, r.h, W / 2 + r.ox, FEET + r.oy, r.w, r.h);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });
</script>

<div class="stage" role="img" aria-label="Your hero in the gear you are wearing"><canvas bind:this={canvasEl} width={W} height={H} style:width="{W * SCALE}px" style:height="{H * SCALE}px" aria-hidden="true"></canvas></div>

<style>
  .stage { display: grid; place-items: center; padding: 8px 0; background: var(--sunk); border: 1px solid var(--rule); }
  canvas { display: block; image-rendering: pixelated; }
</style>
