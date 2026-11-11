<script lang="ts">
  // Item fountain: every unit obtained pops up out of the bottom tab bar, arcs, and falls back, glowing in its
  // rarity ink. WAAPI on transform/opacity only; pointer-events none so it never blocks a tap.
  // Reduced motion: a few static "+N icon" pips above the tab bar instead.
  import { untrack } from 'svelte';
  import { DATA } from '@guildwright/engine';
  import { engine } from '../engine/store.svelte';
  import { reducedMotion } from '../settings.svelte';
  import { play } from '../sound';
  import { iconEl } from '../art/iconDom';
  import { gainsFromEvents, toPops, RARITY_RANK, type Gain } from '../fx/gains';

  const MAX_LIVE = 120;       // simultaneous sprites
  const SPAN_MS = 1250;       // a burst staggers over about this long
  const items: Record<string, { name?: string; sprite?: string; kind?: string; tint?: string }> = (DATA as any).items ?? {};
  const itemRarity: Record<string, string> = (DATA as any).itemRarity ?? {};
  const itemName = (id: string) => items[id]?.name ?? id;

  let layer = $state<HTMLElement | null>(null);
  let live = 0;
  let pips = $state<Array<{ id: number; itemId: string; qty: number; rarity: string }>>([]);
  let pipId = 0;
  let said = $state('');

  function spawn(gains: Gain[]) {
    const l = layer;
    if (!l) return;
    const pops = toPops(gains, MAX_LIVE - live);
    if (!pops.length) return;
    const bar = document.querySelector('.tabbar .row')?.getBoundingClientRect();
    const W = l.clientWidth, H = l.clientHeight;
    const ox = W / 2, oy = bar ? bar.top + bar.height / 2 : H - 30;
    const gap = Math.min(110, SPAN_MS / pops.length);
    pops.forEach((pt, i) => {
      const rank = RARITY_RANK[pt.rarity];
      const size = 32 + rank * 3;
      const el = document.createElement('span');
      el.className = 'pop';
      el.style.cssText = `width:${size}px;height:${size}px;margin:${-size / 2}px 0 0 ${-size / 2}px;--c:var(--r-${pt.rarity});--g:${size + 14 + rank * 10}px;`;
      if (rank >= 2) el.classList.add('rare');
      if (rank >= 3) el.classList.add('spark');
      const glow = document.createElement('i'); glow.className = 'glow'; el.appendChild(glow);
      el.appendChild(iconEl({ id: pt.itemId }, items[pt.itemId]));
      if (pt.more) { const b = document.createElement('b'); b.textContent = `+${pt.more}`; el.appendChild(b); }
      l.appendChild(el);
      live++;
      const vx = (Math.random() - 0.5) * Math.min(W * 0.8, 300);
      const peak = Math.min(H * 0.55, 150 + Math.random() * 190 + rank * 14);
      const kf: Keyframe[] = [];
      const N = 12;
      for (let k = 0; k <= N; k++) {
        const t = k / N;
        // rises to the peak at t=.42 (decelerating), then falls back under gravity past the start line
        const y = t < 0.42 ? -peak * (1 - Math.pow(1 - t / 0.42, 2)) : -peak + peak * 1.15 * Math.pow((t - 0.42) / 0.58, 2);
        kf.push({ transform: `translate(${ox + vx * t}px, ${oy + y}px) scale(${t < 0.12 ? 0.3 + t * 5.8 : 1})`, opacity: t < 0.06 ? 0 : t > 0.8 ? (1 - t) / 0.2 : 1, offset: t });
      }
      const a = el.animate(kf, { duration: 1100 + rank * 60, delay: i * gap, easing: 'linear', fill: 'both' });
      a.onfinish = a.oncancel = () => { if (el.isConnected) { el.remove(); live = Math.max(0, live - 1); } };
    });
  }

  function showPips(gains: Gain[]) {
    const byId = new Map<string, { qty: number; rarity: string }>();
    for (const g of gains) { const c = byId.get(g.itemId); if (c) c.qty += g.qty; else byId.set(g.itemId, { qty: g.qty, rarity: g.rarity }); }
    for (const [itemId, v] of [...byId].slice(0, 3)) {
      const id = ++pipId;
      pips = [...pips.slice(-2), { id, itemId, ...v }];
      setTimeout(() => { pips = pips.filter((p) => p.id !== id); }, 1600);
    }
  }

  $effect(() => {
    const evs = engine.lastEvents;
    if (!evs?.length) return;
    untrack(() => {
      if (!engine.ready || engine.offline || document.hidden) return;
      const gains = gainsFromEvents(evs, itemRarity);
      if (!gains.length) return;
      const top = Math.max(...gains.map((g) => RARITY_RANK[g.rarity]));
      play(top >= 3 ? 'fountain' : 'collect');
      const tot = gains.reduce((n, g) => n + g.qty, 0);
      said = gains.length === 1 ? `Got ${gains[0].qty} ${itemName(gains[0].itemId)}` : `Got ${tot} items`;
      if (reducedMotion() || typeof document.body.animate !== 'function') showPips(gains); else spawn(gains);
    });
  });
</script>

<div class="fx" bind:this={layer} aria-hidden="true">
  {#if pips.length}
    <div class="pips">
      {#each pips as p (p.id)}
        <span class="pip" style:--c={`var(--r-${p.rarity})`}><span class="n num">+{p.qty}</span><span class="ic" use:icon={p.itemId}></span></span>
      {/each}
    </div>
  {/if}
</div>
<span class="sr" role="status" aria-live="polite">{said}</span>

<script lang="ts" module>
  import { iconEl as mk } from '../art/iconDom';
  import { DATA as D } from '@guildwright/engine';
  export function icon(node: HTMLElement, id: string) { node.appendChild(mk({ id }, (D as any).items?.[id])); }
</script>

<style>
  .fx { position: fixed; inset: 0; z-index: 90; pointer-events: none; overflow: hidden; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .fx :global(.pop) { position: absolute; left: 0; top: 0; display: grid; place-items: center; will-change: transform, opacity; opacity: 0; }
  .fx :global(.pop > i.glow) { position: absolute; width: var(--g); height: var(--g); left: 50%; top: 50%; margin: calc(var(--g) / -2) 0 0 calc(var(--g) / -2); border-radius: 50%;
    background: radial-gradient(circle, color-mix(in srgb, var(--c) 45%, transparent) 0%, color-mix(in srgb, var(--c) 18%, transparent) 45%, transparent 70%); }
  .fx :global(.pop.rare > i.glow) { background: radial-gradient(circle, color-mix(in srgb, var(--c) 75%, transparent) 0%, color-mix(in srgb, var(--c) 30%, transparent) 50%, transparent 72%); }
  .fx :global(.pop > span) { position: relative; }
  .fx :global(.pop > b) { position: absolute; right: -6px; bottom: -6px; padding: 1px 4px; background: var(--paper); color: var(--ink); border: 1px solid var(--c); font: 700 11px/1.2 var(--f-num); }
  /* short sparkle ring on epic and above */
  .fx :global(.pop.spark::after) { content: ''; position: absolute; left: 50%; top: 50%; width: 28px; height: 28px; margin: -14px 0 0 -14px; border: 2px solid var(--c); border-radius: 50%; animation: ping 600ms ease-out 1; }
  @keyframes ping { from { transform: scale(.4); opacity: .9; } to { transform: scale(2.4); opacity: 0; } }
  .pips { position: absolute; left: 0; right: 0; bottom: calc(var(--tabbar-h) + 14px + env(safe-area-inset-bottom, 0px)); display: flex; justify-content: center; gap: 8px; }
  .pip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 6px; background: var(--paper); border: 1px solid var(--c); box-shadow: 0 0 10px color-mix(in srgb, var(--c) 55%, transparent); color: var(--ink); font: 700 var(--t-sm)/1 var(--f-num); }
  .pip .ic { display: block; width: 32px; height: 32px; }
</style>
