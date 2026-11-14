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
  import { fxBus } from '../fx/bus';
  import { gainsFromEvents, toPops, RARITY_RANK, type Gain } from '../fx/gains';

  const MAX_LIVE = 150;       // simultaneous sprites (coins and items together)
  const SPAN_MS = 1250;       // an item burst staggers over about this long
  const items: Record<string, { name?: string; sprite?: string; kind?: string; tint?: string }> = (DATA as any).items ?? {};
  const itemRarity: Record<string, string> = (DATA as any).itemRarity ?? {};
  const itemName = (id: string) => items[id]?.name ?? id;

  let layer = $state<HTMLElement | null>(null);
  let live = 0;
  let pips = $state<Array<{ id: number; itemId?: string; text: string; rarity: string }>>([]);
  let pipId = 0;
  let said = $state('');

  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  /** Fountain path: rise, fall to the tab bar's top edge, bounce twice, settle, fade. Transform and opacity only. */
  function path(ox: number, oy: number, W: number, peak: number, spread: number, rot: number): Keyframe[] {
    const G = 30; // tab bar top is about this far above its centre line
    const kf: Keyframe[] = [];
    const N = 22;
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      let y: number;
      if (t < 0.38) y = -peak * (1 - Math.pow(1 - t / 0.38, 2));
      else if (t < 0.62) y = -peak + (peak - G) * Math.pow((t - 0.38) / 0.24, 2);
      else if (t < 0.74) { const v = (t - 0.62) / 0.12; y = -G - peak * 0.14 * 4 * v * (1 - v); }
      else if (t < 0.84) { const v = (t - 0.74) / 0.1; y = -G - peak * 0.05 * 4 * v * (1 - v); }
      else y = -G;
      const x = spread * (t < 0.62 ? t : 0.62 + (t - 0.62) * 0.25);
      kf.push({ transform: `translate(${ox + x}px, ${oy + y}px) rotate(${rot * Math.min(t, 0.62)}deg) scale(${t < 0.1 ? 0.3 + t * 7 : 1})`, opacity: t < 0.05 ? 0 : t > 0.86 ? (1 - t) / 0.14 : 1, offset: t });
    }
    return kf;
  }
  function track(el: HTMLElement, a: Animation) {
    live++;
    a.onfinish = a.oncancel = () => { if (el.isConnected) { el.remove(); live = Math.max(0, live - 1); } };
  }
  function origin(l: HTMLElement) {
    const bar = document.querySelector('.tabbar .row')?.getBoundingClientRect();
    return { W: l.clientWidth, H: l.clientHeight, ox: l.clientWidth / 2, oy: bar ? bar.top + bar.height / 2 : l.clientHeight - 30 };
  }

  /** Short glow around the screen edge for a big moment. */
  function edge(l: HTMLElement, color: string, strong: boolean) {
    const el = document.createElement('div');
    el.className = 'edge';
    el.style.cssText = `box-shadow: inset 0 0 ${strong ? 70 : 46}px ${strong ? 14 : 6}px ${color};`;
    l.appendChild(el);
    el.animate([{ opacity: 0 }, { opacity: strong ? 0.85 : 0.6, offset: 0.2 }, { opacity: 0 }], { duration: strong ? 900 : 650, easing: 'ease-out' }).onfinish = () => el.remove();
  }

  function spawn(gains: Gain[], coins: number, forceBig = false) {
    const l = layer;
    if (!l) return;
    const { W, H, ox, oy } = origin(l);
    const spreadMax = Math.min(W * 0.8, 320);
    const peakMax = Math.min(H * 0.6, 340);
    const coinN = coins > 0 ? Math.min(coins <= 30 ? coins : 30 + Math.floor(Math.sqrt(coins - 30) * 1.5), 60) : 0;
    const pops = toPops(gains, Math.max(0, MAX_LIVE - live - coinN));
    const total = pops.length + coinN;
    const top = pops.reduce((m, p) => Math.max(m, RARITY_RANK[p.rarity]), 0);
    if (!total && coins <= 0) return;
    const big = forceBig || top >= 3 || total >= 25 || coins >= 100;

    const gap = Math.min(110, (forceBig ? 2200 : SPAN_MS) / Math.max(1, pops.length));
    pops.forEach((pt, i) => {
      const rank = RARITY_RANK[pt.rarity];
      const size = 32 + rank * 3 + (pt.stack ? 8 : 0);
      const el = document.createElement('span');
      el.className = 'pop';
      el.style.cssText = `width:${size}px;height:${size}px;margin:${-size / 2}px 0 0 ${-size / 2}px;--c:var(--r-${pt.rarity});--g:${size + 14 + rank * 12}px;`;
      if (rank >= 2) el.classList.add('rare');
      if (rank >= 2) el.classList.add('spark');
      if (rank >= 4) el.classList.add('spark2');
      const glow = document.createElement('i'); glow.className = 'glow'; el.appendChild(glow);
      el.appendChild(iconEl({ id: pt.itemId }, items[pt.itemId]));
      if (pt.stack) { const b = document.createElement('b'); b.textContent = `×${pt.stack}`; el.appendChild(b); }
      l.appendChild(el);
      const peak = Math.min(peakMax, rand(170, 340) + rank * 18);
      const a = el.animate(path(ox, oy, W, peak, rand(-1, 1) * spreadMax / 2, rand(-25, 25)), { duration: 1700 + rank * 90, delay: i * gap, easing: 'linear', fill: 'both' });
      track(el, a);
    });

    if (coinN) {
      const size = coins >= 1000 ? 26 : coins >= 300 ? 22 : coins >= 100 ? 18 : coins > 30 ? 16 : 14;
      const cgap = Math.min(60, (forceBig ? 1800 : 900) / coinN);
      for (let i = 0; i < coinN; i++) {
        const el = document.createElement('span');
        el.className = 'coin';
        el.style.cssText = `width:${size}px;height:${size}px;margin:${-size / 2}px 0 0 ${-size / 2}px;`;
        l.appendChild(el);
        const a = el.animate(path(ox, oy, W, Math.min(peakMax, rand(150, 300)), rand(-1, 1) * spreadMax / 2, rand(-60, 60)), { duration: 1500, delay: 80 + i * cgap, easing: 'linear', fill: 'both' });
        track(el, a);
      }
      if (coins >= 10) {
        const el = document.createElement('b');
        el.className = 'glabel';
        el.textContent = `+${coins.toLocaleString('en-US')}g`;
        l.appendChild(el);
        el.style.cssText = `left:${ox}px;top:${oy - 70}px;font-size:${coins >= 1000 ? 26 : coins >= 100 ? 22 : 18}px;`;
        const a = el.animate([
          { transform: 'translate(-50%, 10px) scale(.5)', opacity: 0 },
          { transform: 'translate(-50%, -14px) scale(1.25)', opacity: 1, offset: 0.18 },
          { transform: 'translate(-50%, -22px) scale(1)', opacity: 1, offset: 0.7 },
          { transform: 'translate(-50%, -50px) scale(1)', opacity: 0 },
        ], { duration: 1500, delay: 120, easing: 'ease-out', fill: 'both' });
        a.onfinish = a.oncancel = () => el.remove();
      }
      flashGold(160 + Math.min(600, coinN * 20));
    }
    if (big) edge(l, top >= 3 ? `var(--r-${(['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] as const)[top]})` : 'var(--brass-fill)', forceBig || top >= 4 || coins >= 1000 || total >= 60);
  }

  /** Brass flash and a small pulse on the top-bar gold number when coins land. */
  function flashGold(delay: number) {
    const g = document.querySelector<HTMLElement>('.shell .gold');
    if (!g || typeof g.animate !== 'function') return;
    g.animate([{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(1.22)', filter: 'brightness(1.9) saturate(1.4)', offset: 0.3 }, { transform: 'scale(1)', filter: 'brightness(1)' }],
      { duration: 520, delay, easing: 'ease-out' });
  }

  function showPips(gains: Gain[], coins: number) {
    const byId = new Map<string, { qty: number; rarity: string }>();
    for (const g of gains) { const c = byId.get(g.itemId); if (c) c.qty += g.qty; else byId.set(g.itemId, { qty: g.qty, rarity: g.rarity }); }
    const list: Array<{ itemId?: string; text: string; rarity: string }> = [...byId].slice(0, 3).map(([itemId, v]) => ({ itemId, text: `+${v.qty}`, rarity: v.rarity }));
    if (coins > 0) list.push({ text: `+${coins.toLocaleString('en-US')}g`, rarity: 'gold' });
    for (const p of list) {
      const id = ++pipId;
      pips = [...pips.slice(-3), { id, ...p }];
      setTimeout(() => { pips = pips.filter((x) => x.id !== id); }, 1600);
    }
  }

  function celebrate(gains: Gain[], coins: number, forceBig = false) {
    const top = gains.reduce((m, g) => Math.max(m, RARITY_RANK[g.rarity]), -1);
    const tot = gains.reduce((n, g) => n + g.qty, 0);
    if (gains.length) play(top >= 3 ? 'fountain' : 'collect');
    if (coins > 0) play('coin');
    if (forceBig || top >= 3 || tot >= 25 || coins >= 100) play('fountain');
    said = [gains.length ? (gains.length === 1 ? `Got ${gains[0].qty} ${itemName(gains[0].itemId)}` : `Got ${tot} items`) : '', coins > 0 ? `Got ${coins}g` : ''].filter(Boolean).join('. ');
    if (reducedMotion() || typeof document.body.animate !== 'function') showPips(gains, coins); else spawn(gains, coins, forceBig);
  }

  // Items arrive as `gain` events; gold is seen as a rise in the snapshot's gold between updates.
  let pendingItems: Gain[] = [];
  let pendingCoins = 0;
  let queued = false;
  function queue() {
    if (queued) return; queued = true;
    queueMicrotask(() => { queued = false; const g = pendingItems, c = pendingCoins; pendingItems = []; pendingCoins = 0; if (g.length || c > 0) celebrate(g, c); });
  }
  $effect(() => {
    const evs = engine.lastEvents;
    if (!evs?.length) return;
    untrack(() => {
      if (!engine.ready || engine.offline || document.hidden) return;
      const gains = gainsFromEvents(evs, itemRarity);
      if (!gains.length) return;
      pendingItems = pendingItems.concat(gains); queue();
    });
  });
  let lastGold: number | null = null;
  $effect(() => {
    const gold = engine.snapshot?.gold;
    if (typeof gold !== 'number') return;
    untrack(() => {
      const prev = lastGold; lastGold = gold;
      if (prev == null || !engine.ready || engine.offline || document.hidden) return;
      const d = Math.floor(gold - prev);
      if (d >= 1) { pendingCoins += d; queue(); }
    });
  });

  // The return reveal asks for the whole offline haul, one pop per unit (stacked past the cap) plus coins.
  $effect(() => {
    fxBus.handler = (c) => { if (c.gains.length || c.coins > 0) celebrate(c.gains, Math.floor(c.coins), !!c.big); };
    return () => { fxBus.handler = null; };
  });

  // Starting a job gives a small immediate answer: a soft sound and a short pulse ring over the tab bar,
  // so it never feels like nothing happened. The first value is only a baseline (a reload with a job running is silent).
  let lastJob: string | null | undefined;
  $effect(() => {
    const id = engine.snapshot?.active?.actionId ?? null;
    untrack(() => {
      const prev = lastJob; lastJob = id;
      if (prev === undefined || !id || id === prev || !engine.ready || engine.offline) return;
      play('start');
      const l = layer; if (!l || reducedMotion() || typeof l.animate !== 'function') return;
      const { ox, oy } = origin(l);
      const ring = document.createElement('div'); ring.className = 'startring';
      ring.style.cssText = `left:${ox}px;top:${oy}px;`;
      l.appendChild(ring);
      ring.animate([{ transform: 'translate(-50%,-50%) scale(.3)', opacity: .9 }, { transform: 'translate(-50%,-50%) scale(2.6)', opacity: 0 }], { duration: 520, easing: 'ease-out' }).onfinish = () => ring.remove();
    });
  });
</script>

<div class="fx" bind:this={layer} aria-hidden="true">
  {#if pips.length}
    <div class="pips">
      {#each pips as p (p.id)}
        <span class="pip" class:goldp={!p.itemId} style:--c={p.itemId ? `var(--r-${p.rarity})` : 'var(--brass-fill)'}><span class="n num">{p.text}</span>{#if p.itemId}<span class="ic" use:icon={p.itemId}></span>{/if}</span>
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
  /* Above the tab bar (20), below every sheet (30+) so pops never cover sheet buttons or text. */
  .fx { position: fixed; inset: 0; z-index: 25; pointer-events: none; overflow: hidden; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .fx :global(.pop) { position: absolute; left: 0; top: 0; display: grid; place-items: center; will-change: transform, opacity; opacity: 0; }
  .fx :global(.pop > i.glow) { position: absolute; width: var(--g); height: var(--g); left: 50%; top: 50%; margin: calc(var(--g) / -2) 0 0 calc(var(--g) / -2); border-radius: 50%;
    background: radial-gradient(circle, color-mix(in srgb, var(--c) 45%, transparent) 0%, color-mix(in srgb, var(--c) 18%, transparent) 45%, transparent 70%); }
  .fx :global(.pop.rare > i.glow) { background: radial-gradient(circle, color-mix(in srgb, var(--c) 75%, transparent) 0%, color-mix(in srgb, var(--c) 30%, transparent) 50%, transparent 72%); }
  .fx :global(.pop > span) { position: relative; }
  .fx :global(.pop > b) { position: absolute; right: -6px; bottom: -6px; padding: 1px 4px; background: var(--paper); color: var(--ink); border: 1px solid var(--c); font: 700 11px/1.2 var(--f-num); }
  .fx :global(.coin) { position: absolute; left: 0; top: 0; opacity: 0; border-radius: 50%; will-change: transform, opacity;
    background: radial-gradient(circle at 35% 30%, #fff4c2 0 14%, var(--brass-fill) 15% 62%, #a8741a 64% 100%); border: 2px solid #8a5e0a; box-shadow: 0 0 8px rgba(255, 200, 80, .75); }
  .fx :global(.glabel) { position: absolute; opacity: 0; white-space: nowrap; font: 700 20px/1 var(--f-num); color: var(--brass-fill); text-shadow: 0 0 8px rgba(0,0,0,.9), 0 2px 0 #5b3d05, 0 0 14px rgba(255, 190, 60, .8); }
  .fx :global(.startring) { position: absolute; width: 56px; height: 56px; border-radius: 50%; border: 3px solid var(--brass-fill); opacity: 0; }
  .fx :global(.edge) { position: absolute; inset: 0; opacity: 0; }
  .pip.goldp .n { color: var(--brass); }
  /* sparkle rings on rare and above */
  .fx :global(.pop.spark::after) { content: ''; position: absolute; left: 50%; top: 50%; width: 28px; height: 28px; margin: -14px 0 0 -14px; border: 2px solid var(--c); border-radius: 50%; animation: ping 600ms ease-out 1; }
  .fx :global(.pop.spark2::before) { content: ''; position: absolute; left: 50%; top: 50%; width: 22px; height: 22px; margin: -11px 0 0 -11px; border: 2px solid var(--c); border-radius: 50%; animation: ping 700ms ease-out 180ms 1 both; }
  @keyframes ping { from { transform: scale(.4); opacity: .9; } to { transform: scale(2.4); opacity: 0; } }
  .pips { position: absolute; left: 0; right: 0; bottom: calc(var(--tabbar-h) + 14px + env(safe-area-inset-bottom, 0px)); display: flex; justify-content: center; gap: 8px; }
  .pip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 6px; background: var(--paper); border: 1px solid var(--c); box-shadow: 0 0 10px color-mix(in srgb, var(--c) 55%, transparent); color: var(--ink); font: 700 var(--t-sm)/1 var(--f-num); }
  .pip .ic { display: block; width: 32px; height: 32px; }
</style>
