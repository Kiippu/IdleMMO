<script lang="ts">
  // Workshop scene: a small native canvas (W about 96-144 x SCENE_H 64) scaled by a whole number (SCALE = 3,
  // image-rendering: pixelated, no smoothing). Layers: action backdrop (Ninja Adventure tiles), the hero built from
  // LPC layers that follow the equipped gear, and one crewmate beside you while you help a crew job.
  // Drawing is capped at 30 fps, only repaints when a frame or the look changes, stops while the app is hidden, and
  // shows a still pose under reduced motion.
  import { DATA } from '@guildwright/engine';
  import { engine } from '../engine/store.svelte';
  import { reducedMotion } from '../settings.svelte';
  import { loadSceneArt, MAN, BD, SCENE_H, FEET_Y, figure, backdropRow, type Equipped, type Gear, type Look } from './sprites';

  const SCALE = 3;
  const H = SCENE_H;
  let W = $state(120);
  let wrapEl: HTMLDivElement;
  let canvasEl: HTMLCanvasElement;

  const actionById = new Map<string, any>(((DATA as any).actions as any[]).map((a) => [a.id, a]));
  const items: Record<string, any> = (DATA as any).items;

  function gearAt(slot: string): Gear | null {
    const s = engine.snapshot;
    const uid = s?.equipped?.[slot];
    const g = uid ? (s.gear as any[] | undefined)?.find((x) => x.uid === uid) : null;
    const it = g ? items[g.itemId] : null;
    return it ? { itemId: g.itemId, tier: it.tier ?? 1, role: it.role ?? '' } : null;
  }

  let scene = $derived.by(() => {
    const s = engine.snapshot;
    const act = s?.active ? actionById.get(s.active.actionId) : null;
    const eq: Equipped = { weapon: gearAt('weapon'), head: gearAt('head'), chest: gearAt('chest'), legs: gearAt('legs') };
    const skill: string | null = act?.skill ?? null;
    const hero = figure(skill, !!act, eq, false);
    const crew = s?.active?.jobId ? figure(skill, true, eq, true) : null;
    return { hero, crew, label: act ? `Working: ${act.name}` : 'Idle in the workshop yard' };
  });

  $effect(() => {
    if (!wrapEl) return;
    const fit = () => { W = Math.max(96, Math.min(BD.w, Math.floor(wrapEl.clientWidth / SCALE))); };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrapEl);
    return () => ro.disconnect();
  });

  function frameOf(look: Look, t: number, phase: number, still: boolean): number {
    const a = MAN.anims[look.anim];
    return still ? 0 : Math.floor((t + phase) / 1000 * a.fps) % a.frames;
  }

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
      const { hero, crew } = scene;
      const fh = frameOf(hero, now, 0, still);
      const fc = crew ? frameOf(crew, now, 280, still) : 0;
      const sig = `${W}|${hero.key}|${fh}|${crew?.key ?? ''}|${fc}`;
      if (sig === lastSig) return;
      lastSig = sig;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, W, H);
      const bx = Math.floor((BD.w - W) / 2);
      ctx.drawImage(art.backdrops, bx, backdropRow(hero.backdrop) * H, W, H, 0, 0, W, H);
      const hx = crew ? Math.floor(W * 0.62) : Math.floor(W / 2);
      if (crew) drawFigure(ctx, art.atlas, crew, hx - 30, fc);
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
