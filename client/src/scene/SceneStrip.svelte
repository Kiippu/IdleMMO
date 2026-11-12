<script lang="ts">
  // Workshop scene: a small native canvas (W about 96-144 x SCENE_H 64) scaled by a whole number (SCALE = 2,
  // image-rendering: pixelated, no smoothing). Shown at 2x (about 128 css px tall). Layers: action backdrop (Ninja Adventure tiles), the hero built from
  // LPC layers that follow the equipped gear, and one crewmate beside you while you help a crew job.
  // Drawing is capped at 30 fps, only repaints when a frame or the look changes, stops while the app is hidden, and
  // shows a still pose under reduced motion.
  import { DATA } from '@guildwright/engine';
  import { engine } from '../engine/store.svelte';
  import { reducedMotion } from '../settings.svelte';
  import { heroLook } from './hero';
  import { lookFrame, loadSceneArt, MAN, BD, SCENE_H, FEET_Y, figure, backdropRow, foeRow, FOES, type Equipped, type Gear, type Look } from './sprites';

  const SCALE = 2;   // 64 native px -> 128 css px tall: a short panoramic strip
  const H = SCENE_H;
  let W = $state(144);
  let wrapEl: HTMLDivElement;
  let canvasEl: HTMLCanvasElement;

  const items: Record<string, any> = (DATA as any).items;
  void items;

  let scene = $derived.by(() => {
    const s = engine.snapshot;
    const { look: hero, action: act, eq } = heroLook(s);
    const skill: string | null = act?.skill ?? null;
    const crew = s?.active?.jobId ? figure(skill, true, eq, true) : null;
    const foe = foeRow(act?.id ?? null, act?.kind ?? null);
    return { hero, crew, foe, label: act ? `Working: ${act.name}` : 'Idle in the workshop yard' };
  });

  $effect(() => {
    if (!wrapEl) return;
    const fit = () => { W = Math.max(96, Math.min(240, Math.floor(wrapEl.clientWidth / SCALE))); };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrapEl);
    return () => ro.disconnect();
  });


  function drawFigure(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, look: Look, gx: number, fr: number) {
    ctx.fillStyle = 'rgba(34,32,52,0.35)';
    ctx.fillRect(gx - 8, FEET_Y, 16, 1); ctx.fillRect(gx - 6, FEET_Y + 1, 12, 1);
    for (const k of [...look.back, ...look.front]) {
      const r = MAN.layers[k]?.[look.anim];
      if (!r) continue;
      ctx.drawImage(atlas, r.x + fr * r.w, r.y, r.w, r.h, gx + r.ox, FEET_Y + r.oy, r.w, r.h);
    }
  }

  $effect(() => {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;
    let art: Awaited<ReturnType<typeof loadSceneArt>> | null = null;
    let raf = 0, lastTick = 0, lastSig = '';
    loadSceneArt().then((a) => { art = a; });

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden || !art || now - lastTick < 33) return;   // <= 30 fps, nothing while hidden
      lastTick = now;
      const still = reducedMotion();
      const { hero, crew, foe } = scene;
      const fh = lookFrame(hero, now, still);
      const fc = crew ? lookFrame(crew, now, still, 280) : 0;
      const ff = foe == null ? 0 : still ? 0 : Math.floor(now / 1000 * 5) % FOES.frames;
      const sig = `${W}|${hero.key}|${fh}|${crew?.key ?? ''}|${fc}|${foe}|${ff}`;
      if (sig === lastSig) return;
      lastSig = sig;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, W, H);
      // Backdrop is BD.w wide: centred, with mirrored copies either side so a wide scene stays seamless.
      const row = backdropRow(hero.backdrop) * H, x0 = Math.floor((W - BD.w) / 2);
      for (let k = -1; k <= 1; k++) {
        const dx = x0 + k * BD.w;
        if (dx >= W || dx + BD.w <= 0) continue;
        if (k === 0) ctx.drawImage(art.backdrops, 0, row, BD.w, H, dx, 0, BD.w, H);
        else { ctx.save(); ctx.translate(dx + BD.w, 0); ctx.scale(-1, 1); ctx.drawImage(art.backdrops, 0, row, BD.w, H, 0, 0, BD.w, H); ctx.restore(); }
      }
      const hx = crew ? Math.floor(W * 0.62) : Math.floor(W / 2);
      if (crew) drawFigure(ctx, art.atlas, crew, hx - 30, fc);
      if (foe != null) {   // the current foe stands to the right, facing the hero
        const fx = hx + 34;
        ctx.fillStyle = 'rgba(34,32,52,0.35)'; ctx.fillRect(fx - 6, FEET_Y, 12, 1);
        ctx.drawImage(art.foes, ff * FOES.size, foe * FOES.size, FOES.size, FOES.size, fx - 8, FEET_Y - FOES.size + 1, FOES.size, FOES.size);
      }
      drawFigure(ctx, art.atlas, hero, hx, fh);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });
</script>

<div class="wrap" bind:this={wrapEl} role="img" aria-label={scene.label}>
  <canvas bind:this={canvasEl} width={W} height={H} style:width="{W * SCALE}px" style:height="{H * SCALE}px" aria-hidden="true"></canvas>
</div>

<style>
  .wrap { position: relative; }
  canvas {
    display: block;
    margin: 0 auto;
    image-rendering: pixelated;
    border: 1px solid var(--rule);
    background: var(--sunk);
  }
</style>
