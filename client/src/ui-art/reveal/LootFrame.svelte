<script lang="ts">
  // Loot-card frame that grows grander with rarity. CSS borders plus pixel SVGs (crispEdges, whole-number scale, composed from char grids).
  //   rank 0 common     : bevelled frame in the ink, square corner studs
  //   rank 1 uncommon   : leaf sprigs at the corners, a small leaf tab at the top, dotted inner rule
  //   rank 2 rare       : long filigree corners, side-centre diamonds, double inner rule
  //   rank 3 epic       : + banner-winged gem crest top and bottom, side rivets, strong edge pulse
  //   rank 4 legendary  : + crown crest, ornate side pillars, bright shine sweep, more sparkles (burst of rays is drawn by the host)
  //   rank 5 mythic     : + dark gem inlays, double ornate ring, rising crimson embers and a flame glow, darker richer edge
  // Ornaments overlap the card edge instead of adding height. Animation is transform/opacity only; `still` (reduced motion) is static.
  import type { Snippet } from 'svelte';
  let { rank = 1, back = false, still = false, children }: { rank?: number; back?: boolean; still?: boolean; children?: Snippet } = $props();

  type G = string[][];
  // '#' ink, d dark edge, l light, h highlight, g dark gem
  const P: Record<string, string> = { '#': 'var(--fa)', d: 'var(--fd)', l: 'var(--fl)', h: 'var(--fh)', g: 'var(--fg)' };
  const cv = (w: number, h: number): G => Array.from({ length: h }, () => Array(w).fill('.'));
  const stamp = (c: G, g: string[], x: number, y: number) => g.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.' && c[y + j]?.[x + i] !== undefined) c[y + j][x + i] = ch; }));
  const put = (c: G, x: number, y: number, ch: string) => { if (c[y]?.[x] !== undefined) c[y][x] = ch; };
  const flipT = (g: string[]) => [...g[0]].map((_, i) => g.map((r) => r[i]).join(''));
  const diamond = (n: number, gem = 'h'): string[] => Array.from({ length: 2 * n + 1 }, (_, y) => Array.from({ length: 2 * n + 1 }, (_, x) => {
    const d = Math.abs(x - n) + Math.abs(y - n); if (d > n) return '.'; if (d === n) return 'd'; if (d === 0) return gem; return d === n - 1 && x + y < 2 * n ? 'l' : '#'; }).join(''));
  const rects = (c: G) => c.flatMap((row, y) => { const o: Array<{ x: number; y: number; w: number; f: string }> = []; let x = 0;
    while (x < row.length) { const ch = row[x]; if (ch === '.') { x++; continue; } let w = 1; while (row[x + w] === ch) w++; o.push({ x, y, w, f: P[ch] }); x += w; } return o; });

  const CORNER = ['dddddddddd..', 'dllllllll#d.', 'dl########d.', 'dl#dddd#d...', 'dl#dhl#d....', 'dl#d##d.....', 'dl#dd#d.....', 'dl###d......', 'dl#dd.......', 'dl#d........', 'd#d.........', 'dd..........'];
  const STUD = ['ddddd', 'dlll#', 'dl##d', 'd##dd', 'd#ddd'];
  const LEAF = ['.ddd..', 'dl##dd', 'd#h##d', '.d###d', '..dddd'];
  const LEAFV = flipT(LEAF);

  // Rare/epic/legendary/mythic corner: the 12x12 filigree plus long arms ending in a bead.
  const bigCorner = () => { const c = cv(20, 20); stamp(c, CORNER, 0, 0);
    for (let i = 12; i < 19; i++) { put(c, i, 0, 'd'); put(c, i, 1, 'l'); put(c, i, 2, '#'); put(c, i, 3, 'd'); put(c, 0, i, 'd'); put(c, 1, i, 'l'); put(c, 2, i, '#'); put(c, 3, i, 'd'); }
    stamp(c, diamond(2), 17, 0); stamp(c, diamond(2), 0, 17); return c; };
  const sprig = () => { const c = cv(16, 16); stamp(c, STUD, 0, 0); stamp(c, LEAF, 6, 0); stamp(c, LEAFV, 0, 6); put(c, 5, 2, 'd'); put(c, 2, 5, 'd'); return c; };
  const tab = () => { const c = cv(21, 8); const w = 11;
    for (let x = 0; x < w; x++) for (let y = 0; y < 5; y++) put(c, 5 + x, 3 + y, y === 4 || x === 0 || x === w - 1 || y === 0 ? 'd' : y === 1 ? 'l' : '#');
    put(c, 10, 5, 'h'); put(c, 10, 6, 'd'); stamp(c, LEAF, 0, 0); stamp(c, flipLR(LEAF), 15, 0); return c; };
  function flipLR(g: string[]) { return g.map((r) => [...r].reverse().join('')); }
  const wings = () => { const c = cv(31, 8);
    for (let x = 0; x < 31; x++) { const m = Math.abs(x - 15); if (m < 5 || m > 14) continue; const y = Math.floor((m - 5) / 4) ; put(c, x, 3 - y > 0 ? 3 - y : 0, 'd'); put(c, x, 4 - y, '#'); put(c, x, 5 - y, 'l'); }
    for (let x = 0; x < 31; x++) { const m = Math.abs(x - 15); if (m >= 5 && m <= 14) put(c, x, 6 - Math.floor((m - 5) / 4), 'd'); }
    return c; };
  const crest = (n: number, gem = 'h') => { const d = diamond(n, gem), c = cv(d[0].length + 6, d.length + 2); stamp(c, d, 3, 1); return c; };
  const crown = (gem: string) => { const W = 25, c = cv(W, 13);
    const spike = (cx: number, h: number) => { for (let k = 0; k < h; k++) { const y = 9 - h + k; for (let x = cx - k; x <= cx + k; x++) put(c, x, y, x === cx - k || x === cx + k ? 'd' : '#'); } put(c, cx, 9 - h, 'h'); put(c, cx, 9 - h - 1, 'd'); put(c, cx - 1, 9 - h, 'd'); put(c, cx + 1, 9 - h, 'd'); };
    spike(12, 8); spike(6, 5); spike(18, 5); spike(1, 3); spike(23, 3);
    for (let x = 0; x < W; x++) for (let y = 9; y < 13; y++) put(c, x, y, y === 12 || y === 9 && false ? 'd' : y === 9 ? 'l' : '#');
    for (let x = 0; x < W; x++) { put(c, x, 12, 'd'); } put(c, 0, 9, 'd'); put(c, 0, 10, 'd'); put(c, 0, 11, 'd'); put(c, W - 1, 9, 'd'); put(c, W - 1, 10, 'd'); put(c, W - 1, 11, 'd');
    for (const x of [4, 12, 20]) { put(c, x, 10, gem); put(c, x - 1, 10, 'd'); put(c, x + 1, 10, 'd'); put(c, x, 11, 'd'); }
    return c; };

  const cornerC = bigCorner(), sprigC = sprig(), tabC = tab();
  const sideRare = diamond(3), sideEpic = diamond(4), sideBig = diamond(5, 'g');
  const view = (c: G) => ({ r: rects(c), w: c[0].length, h: c.length });
  const V = { corner: view(cornerC), sprig: view(sprigC), tab: view(tabC), wings: view(wings()), crestE: view(crest(4)), crestE2: view(crest(3)),
    crown: view(crown('h')), crownM: view(crown('g')), sRare: view(sideRare.map((r) => [...r]) as G), sEpic: view(sideEpic.map((r) => [...r]) as G), sBig: view(sideBig.map((r) => [...r]) as G) };
  const embers = Array.from({ length: 10 }, (_, i) => i);
</script>

{#snippet px(v: { r: Array<{ x: number; y: number; w: number; f: string }>; w: number; h: number }, s: number)}
  <svg viewBox={`0 0 ${v.w} ${v.h}`} width={v.w * s} height={v.h * s} shape-rendering="crispEdges" aria-hidden="true">{#each v.r as r}<rect x={r.x} y={r.y} width={r.w} height="1" fill={r.f} />{/each}</svg>
{/snippet}

<div class="lf r{rank}" class:back class:still data-rank={rank}>
  {#if rank >= 5 && !still}<div class="flame" aria-hidden="true"></div>{/if}
  <div class="glow" aria-hidden="true"></div>
  {#if rank >= 4}<span class="pil l" aria-hidden="true"></span><span class="pil r" aria-hidden="true"></span>{/if}
  <div class="fill"><div class="in">{@render children?.()}</div>{#if rank >= 3}<span class="riv l" aria-hidden="true"></span><span class="riv r" aria-hidden="true"></span>{/if}{#if rank >= 4 && !still}<div class="shine"></div>{/if}</div>

  {#if rank >= 1}{#each ['tl', 'tr', 'bl', 'br'] as k}<span class="c {k}" aria-hidden="true">{@render px(rank === 1 ? V.sprig : V.corner, 3)}</span>{/each}{/if}
  {#if rank === 0}{#each ['tl', 'tr', 'bl', 'br'] as k}<span class="c s stud {k}" aria-hidden="true"><i></i></span>{/each}{/if}
  {#if rank === 1}<span class="tab" aria-hidden="true">{@render px(V.tab, 3)}</span>{/if}

  {#if rank >= 2}
    <span class="side l" aria-hidden="true">{@render px(rank >= 5 ? V.sBig : rank >= 3 ? V.sEpic : V.sRare, 3)}</span>
    <span class="side r" aria-hidden="true">{@render px(rank >= 5 ? V.sBig : rank >= 3 ? V.sEpic : V.sRare, 3)}</span>
  {/if}
  {#if rank === 3}
    <span class="crest top e" aria-hidden="true"><span class="wg">{@render px(V.wings, 3)}</span>{@render px(V.crestE, 3)}</span>
    <span class="crest bot e" aria-hidden="true">{@render px(V.crestE2, 3)}</span>
  {:else if rank >= 4}
    <span class="crest top big" aria-hidden="true">{@render px(rank >= 5 ? V.crownM : V.crown, 3)}</span>
    <span class="crest bot e" aria-hidden="true">{@render px(V.crestE, 2)}</span>
  {/if}
  {#if rank >= 4}{#each ['tl', 'tr', 'bl', 'br', 'tm', 'bm'] as k}<span class="spk {k}" aria-hidden="true"></span>{/each}{/if}
  {#if rank >= 5 && !still}<div class="embers" aria-hidden="true">{#each embers as i}<i style:--i={i}></i>{/each}</div>{/if}
</div>

<style>
  .lf {
    --fa: var(--ink-r);
    --fd: color-mix(in srgb, var(--ink-r) 38%, #140c1c);
    --fl: color-mix(in srgb, var(--ink-r) 62%, #fff);
    --fh: color-mix(in srgb, var(--ink-r) 18%, #fff);
    --fg: color-mix(in srgb, var(--ink-r) 30%, #0a0410);
    position: relative; backface-visibility: hidden; margin: 8px 0;
  }
  .lf.r5 { --fd: color-mix(in srgb, var(--ink-r) 24%, #0a0410); --fl: color-mix(in srgb, var(--ink-r) 78%, #fff); }
  .fill {
    position: relative; overflow: hidden; background: var(--paper); min-height: 100%;
    box-shadow: 0 0 0 2px var(--fd), inset 0 0 0 3px var(--fa), inset 0 0 0 4px var(--fd), inset 3px 3px 0 4px color-mix(in srgb, var(--fl) 35%, transparent);
  }
  .lf.r4 .fill { box-shadow: 0 0 0 2px var(--fd), 0 0 0 4px var(--fa), 0 0 0 5px var(--fd), inset 0 0 0 3px var(--fa), inset 0 0 0 4px var(--fd), inset 3px 3px 0 4px color-mix(in srgb, var(--fl) 35%, transparent); }
  .lf.r5 .fill { box-shadow: 0 0 0 2px var(--fd), 0 0 0 4px var(--fa), 0 0 0 6px var(--fd), 0 0 0 8px var(--fa), 0 0 0 9px var(--fd), inset 0 0 0 3px var(--fa), inset 0 0 0 4px var(--fd), inset 3px 3px 0 4px color-mix(in srgb, var(--fl) 35%, transparent); }
  .in { position: relative; padding: 18px 14px 14px; }
  .lf.r1 .in::before { content: ''; position: absolute; inset: 7px; border: 1px dotted color-mix(in srgb, var(--fa) 70%, transparent); pointer-events: none; }
  .lf:is(.r2, .r3, .r4, .r5) .in::before { content: ''; position: absolute; inset: 7px; border: 1px solid color-mix(in srgb, var(--fa) 60%, transparent); pointer-events: none; }
  .lf:is(.r2, .r3, .r4, .r5) .in::after { content: ''; position: absolute; inset: 10px; border: 1px solid color-mix(in srgb, var(--fa) 35%, transparent); pointer-events: none; }
  .lf:is(.r3, .r4, .r5) .in { padding-top: 24px; padding-bottom: 22px; }
  .lf.r1 .in { padding-top: 20px; }

  .glow { position: absolute; inset: 0; pointer-events: none; opacity: .5; box-shadow: 0 0 12px 2px color-mix(in srgb, var(--fa) 70%, transparent); }
  .lf:is(.r3, .r4, .r5) .glow { opacity: .9; box-shadow: 0 0 16px 4px color-mix(in srgb, var(--fa) 75%, transparent); }
  .lf:is(.r3, .r4, .r5):not(.still) .glow { animation: pulse 1.8s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }

  .c { position: absolute; line-height: 0; pointer-events: none; }
  .c.tl { left: -6px; top: -6px; } .c.tr { right: -6px; top: -6px; transform: scaleX(-1); }
  .c.bl { left: -6px; bottom: -6px; transform: scaleY(-1); } .c.br { right: -6px; bottom: -6px; transform: scale(-1, -1); }
  .c.stud { width: 15px; height: 15px; }
  .c.stud i { position: absolute; inset: 0; background: linear-gradient(var(--fl), var(--fl)) 3px 3px / 3px 3px no-repeat, var(--fa); box-shadow: 0 0 0 2px var(--fd); }
  .c.stud.tl { left: -5px; top: -5px; } .c.stud.tr { right: -5px; top: -5px; transform: none; } .c.stud.bl { left: -5px; bottom: -5px; transform: none; } .c.stud.br { right: -5px; bottom: -5px; transform: none; }
  .tab { position: absolute; left: 50%; top: -14px; translate: -50% 0; line-height: 0; pointer-events: none; }
  .side { position: absolute; top: 50%; line-height: 0; pointer-events: none; }
  .side.l { left: -12px; translate: 0 -50%; } .side.r { right: -12px; translate: 0 -50%; }
  .lf:is(.r4, .r5) .side.l { left: -14px; } .lf:is(.r4, .r5) .side.r { right: -14px; }
  .riv { position: absolute; top: 40px; bottom: 40px; width: 3px; pointer-events: none; background: repeating-linear-gradient(to bottom, var(--fh) 0 3px, transparent 3px 12px); }
  .riv.l { left: 0; } .riv.r { right: 0; }
  .pil { position: absolute; top: 34px; bottom: 34px; width: 9px; pointer-events: none; box-shadow: 0 0 0 2px var(--fd);
    background: repeating-linear-gradient(to bottom, var(--fd) 0 3px, transparent 3px 24px), linear-gradient(to right, var(--fd) 0 2px, var(--fl) 2px 3px, var(--fa) 3px 6px, var(--fd) 6px 9px); }
  .pil.l { left: -11px; } .pil.r { right: -11px; }
  .lf.r5 .pil.l { left: -13px; } .lf.r5 .pil.r { right: -13px; }
  .crest { position: absolute; left: 50%; line-height: 0; pointer-events: none; display: grid; justify-items: center; translate: -50% 0; }
  .crest.top.e { top: -22px; } .crest.top.big { top: -30px; }
  .crest.bot { bottom: -14px; transform: scaleY(-1); }
  .crest .wg { position: absolute; top: 12px; left: 50%; translate: -50% 0; }
  .lf.r5 .crest.top { filter: drop-shadow(0 0 4px color-mix(in srgb, var(--fa) 80%, transparent)); }

  .shine { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
  .shine::before { content: ''; position: absolute; top: -20%; bottom: -20%; left: 0; width: 42%; transform: translateX(-160%) skewX(-18deg); opacity: 0;
    background: linear-gradient(90deg, transparent, color-mix(in srgb, #fff 65%, transparent) 42%, #fff 50%, color-mix(in srgb, #fff 65%, transparent) 58%, transparent);
    animation: sweep 4s linear .8s infinite; }
  @keyframes sweep { 0% { transform: translateX(-160%) skewX(-18deg); opacity: 1; } 24% { transform: translateX(380%) skewX(-18deg); opacity: 1; } 25%, 100% { transform: translateX(380%) skewX(-18deg); opacity: 0; } }

  .spk { position: absolute; width: 9px; height: 9px; pointer-events: none; opacity: .9;
    background: linear-gradient(var(--fh), var(--fh)) center / 3px 9px no-repeat, linear-gradient(var(--fh), var(--fh)) center / 9px 3px no-repeat; }
  .spk.tl { left: -12px; top: -12px; } .spk.tr { right: -12px; top: -12px; } .spk.bl { left: -12px; bottom: -12px; } .spk.br { right: -12px; bottom: -12px; }
  .spk.tm { left: 28%; top: -6px; } .spk.bm { right: 28%; bottom: -6px; }
  .lf:not(.still) .spk { animation: tw 2.2s ease-in-out infinite; }
  .spk.tr { animation-delay: -.4s; } .spk.bl { animation-delay: -.8s; } .spk.br { animation-delay: -1.2s; } .spk.tm { animation-delay: -1.5s; } .spk.bm { animation-delay: -1.9s; }
  @keyframes tw { 0%, 100% { opacity: .15; transform: scale(.5); } 50% { opacity: 1; transform: scale(1.2); } }

  .flame { position: absolute; left: -6px; right: -6px; bottom: -10px; height: 34px; pointer-events: none; opacity: .8;
    background: radial-gradient(ellipse at 50% 100%, color-mix(in srgb, var(--fa) 85%, transparent), transparent 70%); animation: flick 1.3s ease-in-out infinite; transform-origin: 50% 100%; }
  @keyframes flick { 0%, 100% { opacity: .5; transform: scaleY(.8); } 50% { opacity: .95; transform: scaleY(1.15); } }
  .embers i { position: absolute; bottom: -4px; left: calc(6% + var(--i) * 9%); width: 3px; height: 3px; background: var(--fl); opacity: 0; pointer-events: none;
    animation: rise 2.6s ease-out infinite; animation-delay: calc(var(--i) * -0.29s); }
  .embers i:nth-child(3n) { background: var(--fh); } .embers i:nth-child(odd) { width: 3px; height: 6px; }
  @keyframes rise { 0% { transform: translate(0, 0); opacity: 0; } 15% { opacity: 1; } 100% { transform: translate(calc((var(--i) - 4.5) * 2px), -26px); opacity: 0; } }

  /* back: same frame, rarity-tinted lattice instead of content */
  .lf.back { position: absolute; inset: 0; margin: 0; }
  .lf.back .fill { height: 100%; display: grid; place-items: center; color: var(--fh);
    background:
      repeating-linear-gradient(45deg, transparent 0 7px, color-mix(in srgb, var(--fl) 28%, transparent) 7px 8px),
      repeating-linear-gradient(-45deg, transparent 0 7px, color-mix(in srgb, var(--fl) 28%, transparent) 7px 8px),
      color-mix(in srgb, var(--fa) 55%, var(--fd)); }
  .lf.back .in { display: grid; place-items: center; padding: 0; }
  .lf.back .in::before, .lf.back .in::after { display: none; }
  .lf.back .in :global(svg) { filter: drop-shadow(2px 2px 0 var(--fd)); }
  @media (prefers-reduced-motion: reduce) { .glow, .spk, .shine::before, .flame, .embers i { animation: none !important; } .shine, .embers { display: none; } }
</style>
