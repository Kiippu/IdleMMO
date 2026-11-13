<script lang="ts">
  // Loot-card frame that grows grander with rarity. Pure CSS borders plus tiny pixel SVGs (crispEdges, whole-number scale).
  //   rank 0-1 common/uncommon: bevelled frame in the ink, corner studs
  //   rank 2   rare: + pixel filigree corners and an inner rule line
  //   rank 3   epic: + gem crest top and bottom, pulsing edge glow
  //   rank 4-5 legendary/mythic: + wings on the crest, shine sweep, corner sparkles; mythic gets a darker, richer edge
  // Animation is transform/opacity only; `still` (reduced motion) leaves everything static.
  import type { Snippet } from 'svelte';
  let { rank = 1, back = false, still = false, children }: { rank?: number; back?: boolean; still?: boolean; children?: Snippet } = $props();

  // Pixel grids: '#' ink, 'd' dark edge, 'l' light, 'h' highlight (near white), '.' empty.
  const CORNER = [
    'dddddddddd..',
    'dllllllll#d.',
    'dl########d.',
    'dl#dddd#d...',
    'dl#dhl#d....',
    'dl#d##d.....',
    'dl#dd#d.....',
    'dl###d......',
    'dl#dd.......',
    'dl#d........',
    'd#d.........',
    'dd..........',
  ];
  const STUD = [
    'ddddd',
    'dlll#',
    'dl##d',
    'd##dd',
    'd#ddd',
  ];
  const CREST = [
    '.....ddddd.....',
    '....dllll#d....',
    '...dllhl###d...',
    '..dllhl#####d..',
    '...d#l#####d...',
    '....d#####d....',
    '.....d###d.....',
    '......ddd......',
  ];
  const WINGS = [
    'dd.....................dd',
    'd#ddd...............ddd#d',
    '.dd##ddddd.......ddddd##dd',
    '..ddd#####ddddddd#####ddd.',
    '....ddddddd.....ddddddd..',
  ].map((r) => r.padEnd(25, '.').slice(0, 25));
  const rects = (g: string[], c: Record<string, string>) =>
    g.flatMap((row, y) => { const o: Array<{ x: number; y: number; w: number; f: string }> = []; let x = 0;
      while (x < row.length) { const ch = row[x]; if (ch === '.') { x++; continue; } let w = 1; while (row[x + w] === ch) w++; o.push({ x, y, w, f: c[ch] }); x += w; } return o; });
  const P = { '#': 'var(--fa)', d: 'var(--fd)', l: 'var(--fl)', h: 'var(--fh)' } as Record<string, string>;
  const corner = rects(CORNER, P), stud = rects(STUD, P), crest = rects(CREST, P), wings = rects(WINGS, P);
</script>

{#snippet px(g: Array<{ x: number; y: number; w: number; f: string }>, w: number, h: number, s: number)}
  <svg viewBox={`0 0 ${w} ${h}`} width={w * s} height={h * s} shape-rendering="crispEdges" aria-hidden="true">{#each g as r}<rect x={r.x} y={r.y} width={r.w} height="1" fill={r.f} />{/each}</svg>
{/snippet}

<div class="lf r{rank}" class:back class:still data-rank={rank}>
  <div class="glow" aria-hidden="true"></div>
  <div class="fill"><div class="in">{@render children?.()}</div>{#if rank >= 4 && !still}<div class="shine"></div>{/if}</div>
  {#if rank >= 2}
    <span class="c tl" aria-hidden="true">{@render px(corner, 12, 12, 3)}</span>
    <span class="c tr" aria-hidden="true">{@render px(corner, 12, 12, 3)}</span>
    <span class="c bl" aria-hidden="true">{@render px(corner, 12, 12, 3)}</span>
    <span class="c br" aria-hidden="true">{@render px(corner, 12, 12, 3)}</span>
  {:else}
    <span class="c s tl" aria-hidden="true">{@render px(stud, 5, 5, 3)}</span>
    <span class="c s tr" aria-hidden="true">{@render px(stud, 5, 5, 3)}</span>
    <span class="c s bl" aria-hidden="true">{@render px(stud, 5, 5, 3)}</span>
    <span class="c s br" aria-hidden="true">{@render px(stud, 5, 5, 3)}</span>
  {/if}
  {#if rank >= 3}
    <span class="crest top" aria-hidden="true">{#if rank >= 4}<span class="wings">{@render px(wings, 25, 5, 3)}</span>{/if}{@render px(crest, 15, 8, 3)}</span>
    <span class="crest bot" aria-hidden="true">{@render px(crest, 15, 8, 2)}</span>
  {/if}
  {#if rank >= 4}<span class="spk tl" aria-hidden="true"></span><span class="spk tr" aria-hidden="true"></span><span class="spk bl" aria-hidden="true"></span><span class="spk br" aria-hidden="true"></span>{/if}
</div>

<style>
  .lf {
    --fa: var(--ink-r);
    --fd: color-mix(in srgb, var(--ink-r) 38%, #140c1c);
    --fl: color-mix(in srgb, var(--ink-r) 62%, #fff);
    --fh: color-mix(in srgb, var(--ink-r) 18%, #fff);
    position: relative; backface-visibility: hidden; margin: 6px 0;
  }
  .lf.r5 { --fd: color-mix(in srgb, var(--ink-r) 24%, #0a0410); --fl: color-mix(in srgb, var(--ink-r) 78%, #fff); }
  .fill {
    position: relative; overflow: hidden; background: var(--paper); min-height: 100%;
    box-shadow: 0 0 0 2px var(--fd), inset 0 0 0 3px var(--fa), inset 0 0 0 4px var(--fd), inset 3px 3px 0 4px color-mix(in srgb, var(--fl) 35%, transparent);
  }
  .lf.r5 .fill { box-shadow: 0 0 0 2px var(--fd), 0 0 0 4px var(--fa), 0 0 0 6px var(--fd), inset 0 0 0 3px var(--fa), inset 0 0 0 4px var(--fd), inset 3px 3px 0 4px color-mix(in srgb, var(--fl) 35%, transparent); }
  .lf.r4 .fill { box-shadow: 0 0 0 2px var(--fd), 0 0 0 4px var(--fa), 0 0 0 5px var(--fd), inset 0 0 0 3px var(--fa), inset 0 0 0 4px var(--fd), inset 3px 3px 0 4px color-mix(in srgb, var(--fl) 35%, transparent); }
  .in { position: relative; padding: 16px 14px 14px; }
  .lf.r2 .in::before, .lf.r3 .in::before, .lf.r4 .in::before, .lf.r5 .in::before { content: ''; position: absolute; inset: 7px; border: 1px solid color-mix(in srgb, var(--fa) 55%, transparent); pointer-events: none; }
  .lf.r3 .in, .lf.r4 .in, .lf.r5 .in { padding-top: 22px; padding-bottom: 20px; }
  .glow { position: absolute; inset: 0; pointer-events: none; opacity: .55; box-shadow: 0 0 12px 2px color-mix(in srgb, var(--fa) 70%, transparent); }
  .lf.r3:not(.still) .glow, .lf.r4:not(.still) .glow, .lf.r5:not(.still) .glow { animation: pulse 2.2s ease-in-out infinite; }
  .lf.r3 .glow, .lf.r4 .glow, .lf.r5 .glow { opacity: .85; }
  @keyframes pulse { 0%, 100% { opacity: .45; } 50% { opacity: 1; } }

  .c { position: absolute; line-height: 0; pointer-events: none; }
  .c.tl { left: -6px; top: -6px; }
  .c.tr { right: -6px; top: -6px; transform: scaleX(-1); }
  .c.bl { left: -6px; bottom: -6px; transform: scaleY(-1); }
  .c.br { right: -6px; bottom: -6px; transform: scale(-1, -1); }
  .c.s.tl { left: -5px; top: -5px; } .c.s.tr { right: -5px; top: -5px; } .c.s.bl { left: -5px; bottom: -5px; } .c.s.br { right: -5px; bottom: -5px; }
  .crest { position: absolute; left: 50%; line-height: 0; pointer-events: none; display: grid; justify-items: center; }
  .crest.top { top: -17px; translate: -50% 0; }
  .crest.bot { bottom: -11px; translate: -50% 0; transform: scaleY(-1); }
  .wings { position: absolute; top: 9px; left: 50%; translate: -50% 0; }
  .lf.r5 .crest.top { filter: drop-shadow(0 0 4px color-mix(in srgb, var(--fa) 80%, transparent)); }

  .shine { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
  .shine::before { content: ''; position: absolute; top: -20%; bottom: -20%; left: 0; width: 38%; transform: translateX(-160%) skewX(-18deg); opacity: 0;
    background: linear-gradient(90deg, transparent, color-mix(in srgb, #fff 55%, transparent) 45%, color-mix(in srgb, #fff 80%, transparent) 50%, color-mix(in srgb, #fff 55%, transparent) 55%, transparent);
    animation: sweep 5s linear .8s infinite; }
  @keyframes sweep { 0% { transform: translateX(-160%) skewX(-18deg); opacity: 1; } 22% { transform: translateX(380%) skewX(-18deg); opacity: 1; } 23%, 100% { transform: translateX(380%) skewX(-18deg); opacity: 0; } }

  .spk { position: absolute; width: 9px; height: 9px; pointer-events: none; opacity: .9;
    background: linear-gradient(var(--fh), var(--fh)) center / 3px 9px no-repeat, linear-gradient(var(--fh), var(--fh)) center / 9px 3px no-repeat; }
  .spk.tl { left: -9px; top: -9px; } .spk.tr { right: -9px; top: -9px; } .spk.bl { left: -9px; bottom: -9px; } .spk.br { right: -9px; bottom: -9px; }
  .lf:not(.still) .spk { animation: tw 2.4s ease-in-out infinite; }
  .spk.tr { animation-delay: -.6s; } .spk.bl { animation-delay: -1.2s; } .spk.br { animation-delay: -1.8s; }
  @keyframes tw { 0%, 100% { opacity: .15; transform: scale(.5); } 50% { opacity: 1; transform: scale(1.15); } }

  /* back: same frame, rarity-tinted lattice instead of content */
  .lf.back { position: absolute; inset: 0; margin: 0; }
  .lf.back .fill { height: 100%; display: grid; place-items: center; color: var(--fh);
    background:
      repeating-linear-gradient(45deg, transparent 0 7px, color-mix(in srgb, var(--fl) 28%, transparent) 7px 8px),
      repeating-linear-gradient(-45deg, transparent 0 7px, color-mix(in srgb, var(--fl) 28%, transparent) 7px 8px),
      color-mix(in srgb, var(--fa) 55%, var(--fd)); }
  .lf.back .in { display: grid; place-items: center; padding: 0; }
  .lf.back .in::before { display: none; }
  .lf.back .in :global(svg) { filter: drop-shadow(2px 2px 0 var(--fd)); }
  @media (prefers-reduced-motion: reduce) { .glow, .spk, .shine::before { animation: none !important; } .shine { display: none; } }
</style>
