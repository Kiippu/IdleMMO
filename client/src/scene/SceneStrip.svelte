<script lang="ts">
  // 160x64 Canvas 2D scene strip. Phase 2 scope: placeholder sprite in design-token
  // colors, one shared "working" bob while state.active is set. LPC hero layers +
  // per-action animation arrive in phase 3 once the art pack lands.
  //
  // The canvas keeps its intrinsic 160x64 raster and scales up via CSS
  // (image-rendering: pixelated) so pixel edges stay crisp at any column width.
  import { engine } from '../engine/store.svelte';

  const W = 160;
  const H = 64;

  let canvasEl: HTMLCanvasElement;
  let frame = 0;
  let rafId: number | null = null;

  function readToken(name: string, fallback: string): string {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function draw() {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    const paper = readToken('--paper', '#f6f7f2');
    const sunk = readToken('--sunk', '#ebede5');
    const ink = readToken('--ink', '#1b2030');
    const woad = readToken('--woad', '#2a479e');
    const brass = readToken('--brass', '#8a5e0a');
    const rule = readToken('--rule', '#c6cabe');

    // Sky
    ctx.fillStyle = sunk;
    ctx.fillRect(0, 0, W, H);
    // Distant horizon line (woad)
    ctx.fillStyle = woad;
    ctx.fillRect(0, H - 32, W, 1);
    // Mid band (paper)
    ctx.fillStyle = paper;
    ctx.fillRect(0, H - 31, W, 17);
    // Ground line
    ctx.fillStyle = rule;
    ctx.fillRect(0, H - 14, W, 1);
    // Ground
    ctx.fillStyle = paper;
    ctx.fillRect(0, H - 13, W, 13);

    // Scattered tufts of grass for silhouette interest
    const tufts = [18, 42, 70, 106, 138];
    ctx.fillStyle = woad;
    for (const x of tufts) ctx.fillRect(x, H - 15, 2, 1);

    // Hero — dead centre, bobs by 1 pixel while something is being worked on
    const active = engine.snapshot?.active ?? null;
    const bob = active ? (frame % 24 < 12 ? -1 : 0) : 0;
    const hx = Math.floor(W / 2) - 4;
    const hy = H - 23 + bob;

    // Body (tunic in brass)
    ctx.fillStyle = brass;
    ctx.fillRect(hx, hy + 2, 8, 7);
    // Head (ink silhouette, no face yet)
    ctx.fillStyle = ink;
    ctx.fillRect(hx + 1, hy - 4, 6, 6);
    // Legs
    ctx.fillStyle = ink;
    ctx.fillRect(hx + 1, hy + 9, 2, 2);
    ctx.fillRect(hx + 5, hy + 9, 2, 2);
  }

  $effect(() => {
    if (!canvasEl) return;
    let last = performance.now();
    let acc = 0;
    const tick = (now: number) => {
      acc += now - last;
      last = now;
      // ~8 Hz animation clock — enough for a placeholder bob; cheap on battery.
      if (acc >= 125) { frame++; acc = 0; }
      draw();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => { if (rafId != null) cancelAnimationFrame(rafId); };
  });
</script>

<canvas bind:this={canvasEl} width={W} height={H} aria-hidden="true"></canvas>

<style>
  canvas {
    display: block;
    width: 120px; height: 48px;
    margin: 0;
    image-rendering: pixelated;
    border: 1px solid var(--rule);
    background: var(--sunk);
  }
</style>
