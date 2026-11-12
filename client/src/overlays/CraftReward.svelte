<script lang="ts">
  // Full-screen celebration for a live quality craft (gear above common). Spiralling rays in the rarity ink,
  // the card flips in, stats compared against the piece worn in that slot. Several in one batch queue up.
  // Tapping outside never closes it. Reduced motion: static rays, no spin, no flip.
  import { untrack } from 'svelte';
  import { engine } from '../engine/store.svelte';
  import { engineClient } from '../engine/client';
  import type { GearDetail } from '../engine/protocol';
  import { reducedMotion } from '../settings.svelte';
  import { play } from '../sound';
  import ItemIcon from '../art/ItemIcon.svelte';
  import { gradeName } from '../engine/grades';
  import { craftReward, enqueueRewards, nextReward, skipRewards } from './rewardQueue.svelte';

  type Detail = GearDetail;
  const RANK: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

  // Collect quality gear from live craft gain events.
  $effect(() => {
    const evs = engine.lastEvents;
    if (!evs?.length) return;
    untrack(() => {
      if (!engine.ready || engine.offline) return;
      const out: Array<{ uid: string; itemId: string; rarity: string; grade?: number }> = [];
      for (const e of evs) {
        if (e.type !== 'gain' || e.offline || e.source !== 'craft') continue;
        for (const it of e.items ?? []) if (it.uid && (RANK[it.rarity] ?? 0) > 0) out.push({ uid: it.uid, itemId: it.itemId, rarity: it.rarity, grade: it.grade });
      }
      enqueueRewards(out);
    });
  });

  // Wait for the return reveal to close.
  let cur = $derived(engine.ready && !engine.offline ? craftReward.queue[0] ?? null : null);
  let detail = $state<Detail | null>(null);
  let loadedFor = $state<string | null>(null);
  let busy = $state(false);
  let equipped = $state(false);
  $effect(() => {
    const c = cur;
    detail = null; loadedFor = null; equipped = false;
    if (!c) return;
    let dead = false;
    play(RANK[c.rarity] >= 3 ? 'fountain' : 'levelUp');
    Promise.resolve(engineClient.gearDetail(c.uid)).then((d: Detail | null) => { if (!dead) { detail = d ?? null; loadedFor = c.uid; } }).catch(() => { if (!dead) loadedFor = c.uid; });
    return () => { dead = true; };
  });

  let rank = $derived(cur ? RANK[cur.rarity] ?? 1 : 1);
  let rays = $derived(8 + rank * 4);
  const reduced = () => reducedMotion();
  let step = $derived(craftReward.total - craftReward.queue.length + 1);

  async function equip() {
    if (!cur || busy) return;
    busy = true;
    try { await engineClient.equip(cur.uid); equipped = true; setTimeout(nextReward, reduced() ? 400 : 650); } catch (e) { console.error(e); } finally { busy = false; }
  }
  let btn = $state<HTMLButtonElement | null>(null);
  $effect(() => { if (cur && btn) btn.focus(); });
  function onKey(ev: KeyboardEvent) { if (cur && ev.key === 'Escape') nextReward(); }
  const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '');
  const fmt = (n: number) => String(Math.round(Math.abs(n) * 100) / 100);
  let name = $derived(detail?.name ?? '');
</script>

<svelte:window onkeydown={onKey} />

{#if cur}
  <div class="cr" class:still={reduced()} role="dialog" aria-modal="true" aria-labelledby="cr-title" style:--ink-r={`var(--r-${cur.rarity})`} style:--rays={rays} style:--glow={`${24 + rank * 14}px`}>
    <div class="rays a" aria-hidden="true"></div>
    <div class="rays b" aria-hidden="true"></div>
    <div class="halo" aria-hidden="true"></div>
    {#if rank >= 3 && !reduced()}<div class="sparks" aria-hidden="true">{#each Array(rank * 3) as _, i}<i style:--i={i}></i>{/each}</div>{/if}

    <div class="stage">
      <div class="card" class:flip={!reduced()}>
        <p class="kick">{cap(cur.rarity)} craft{craftReward.total > 1 ? ` · ${step} of ${craftReward.total}` : ''}</p>
        <span class="tile" aria-hidden="true"><ItemIcon id={cur.itemId} size={64} rarity={cur.rarity} grade={cur.grade} /></span>
        <h2 id="cr-title">{name || '…'}</h2>
        <p class="meta">{cap(cur.rarity)}{detail ? ` · ${detail.gradeName}` : cur.grade != null ? ` · ${gradeName(cur.grade)}` : ''}</p>

        {#if detail}
          <ul class="st">{#each detail.stats as s (s.key)}<li><span>{s.label}</span><b class="num">{s.value}</b></li>{/each}</ul>
          {#if detail.effects?.length}<ul class="af ef">{#each detail.effects as e (e.key)}<li>{e.text}</li>{/each}</ul>{/if}
          {#if detail.affixes.length}<ul class="af">{#each detail.affixes as a (a.id)}<li>{a.label}</li>{/each}</ul>{/if}
          <div class="cmp">
            {#if detail.compare}
              <p class="ch">Compared to <span style:color={`var(--r-${detail.compare.rarity})`}>{detail.compare.name}</span></p>
              <ul>{#each detail.compare.diff as d (d.key)}<li class:up={d.delta > 0} class:dn={d.delta < 0}><span>{d.label}</span><b class="num">{d.mine} <small>(was {d.theirs})</small> <span class="ar">{d.delta > 0 ? '▲' : d.delta < 0 ? '▼' : '='} {sign(d.delta)}{d.delta === 0 ? '' : fmt(d.delta)}</span></b></li>{/each}
              {#each detail.effects ?? [] as e (e.key)}{@const w = detail.compare.effects?.find((x) => x.key === e.key)}{#if w}{@const dl = Math.round((e.value - w.value) * 100) / 100}<li class="ef2" class:up={dl > 0} class:dn={dl < 0}><span>{e.label}</span><b class="num">{e.value}{e.unit === 'pct' ? '%' : ''} <small>(was {w.value}{w.unit === 'pct' ? '%' : ''})</small> <span class="ar">{dl > 0 ? '▲' : dl < 0 ? '▼' : '='} {sign(dl)}{dl === 0 ? '' : fmt(dl)}</span></b></li>{/if}{/each}</ul>
            {:else if !detail.equipped}<p class="ch">New slot: nothing equipped</p>{/if}
          </div>
        {:else if loadedFor}
          <p class="meta">Details unavailable.</p>
        {/if}

        <div class="btns">
          {#if craftReward.total > 1 && craftReward.queue.length > 1}<button type="button" class="btn skip" onclick={skipRewards}>Skip rest</button>{/if}
          <button type="button" class="btn primary" bind:this={btn} disabled={busy || equipped || !detail || detail.equipped} onclick={equip}>{equipped ? 'Equipped' : 'Equip'}</button>
          <button type="button" class="btn" onclick={nextReward}>Nice</button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .cr { position: fixed; inset: 0; z-index: 60; overflow: hidden; background: color-mix(in srgb, var(--plaster) 90%, var(--ink-r)); animation: fin 220ms ease-out; display: grid; place-items: center; }
  @keyframes fin { from { opacity: 0; } }
  .rays { position: absolute; left: 50%; top: 50%; width: 220vmax; height: 220vmax; margin: -110vmax 0 0 -110vmax; pointer-events: none;
    background: repeating-conic-gradient(from 0deg, color-mix(in srgb, var(--ink-r) 55%, transparent) 0 calc(180deg / var(--rays)), transparent 0 calc(360deg / var(--rays)));
    -webkit-mask-image: radial-gradient(circle, #000 0, #000 8%, transparent 32%); mask-image: radial-gradient(circle, #000 0, #000 8%, transparent 32%);
    animation: spin 28s linear infinite; }
  .rays.b { opacity: .5; transform: scale(1.4) rotate(12deg); animation: spin 42s linear infinite reverse; }
  @keyframes spin { to { rotate: 360deg; } }
  .halo { position: absolute; left: 50%; top: 50%; width: min(120vw, 560px); aspect-ratio: 1; translate: -50% -50%; border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--ink-r) 45%, transparent), transparent 65%); pointer-events: none; animation: breathe 2.6s ease-in-out infinite; }
  @keyframes breathe { 50% { opacity: .65; scale: 1.08; } }
  .sparks i { position: absolute; left: 50%; top: 50%; width: 6px; height: 6px; background: var(--ink-r); pointer-events: none;
    animation: spark 2.4s ease-out infinite; animation-delay: calc(var(--i) * -0.19s); --a: calc(var(--i) * 47deg); }
  @keyframes spark { 0% { transform: rotate(var(--a)) translateY(0) scale(.4); opacity: 0; } 20% { opacity: 1; } 100% { transform: rotate(var(--a)) translateY(-44vmin) scale(1); opacity: 0; } }
  .still .rays, .still .halo { animation: none; }
  @media (prefers-reduced-motion: reduce) { .rays, .halo, .sparks i { animation: none; } .cr { animation: none; } }

  .stage { position: relative; width: 100%; max-width: var(--col); padding: max(12px, env(safe-area-inset-top)) 16px max(12px, env(safe-area-inset-bottom)); max-height: 100%; overflow-y: auto; perspective: 900px; }
  .card { display: grid; gap: 8px; justify-items: center; text-align: center; padding: 16px 14px; background: var(--paper); border: 2px solid var(--ink-r); box-shadow: 0 0 var(--glow) color-mix(in srgb, var(--ink-r) 60%, transparent); }
  .card.flip { animation: flip 650ms cubic-bezier(.2,.9,.3,1.2); }
  @keyframes flip { from { transform: rotateY(90deg) scale(.5); opacity: 0; } 60% { opacity: 1; } }
  .kick { margin: 0; font: 700 var(--t-xs)/1 var(--f-label, var(--f-body)); letter-spacing: .08em; text-transform: uppercase; color: var(--ink-r); }
  .tile { display: grid; place-items: center; width: 80px; height: 80px; border: 2px solid var(--ink-r); background: var(--sunk); }
  h2 { margin: 0; font: 600 var(--t-xl)/1.15 var(--f-display); color: var(--ink-r); }
  .meta { margin: 0; color: var(--ink-2); font-size: var(--t-sm); }
  ul { list-style: none; margin: 0; padding: 0; width: 100%; display: grid; gap: 4px; }
  li { display: flex; justify-content: space-between; gap: 8px; padding: 6px 10px; background: var(--sunk); border: 1px solid var(--rule); font-size: var(--t-md); color: var(--ink); text-align: left; }
  .af li { color: var(--ink-2); font-size: var(--t-sm); justify-content: flex-start; gap: 4px; }
  .cmp { width: 100%; display: grid; gap: 4px; }
  .ch { margin: 4px 0 0; color: var(--ink-2); font-size: var(--t-sm); text-align: left; }
  .cmp li.up b { color: var(--ok); } .cmp li.dn b { color: var(--bad, var(--warn)); }
  small { color: var(--ink-3); font-size: var(--t-xs); font-weight: 400; }
  .btns { display: flex; gap: 8px; width: 100%; margin-top: 6px; flex-wrap: wrap; }
  .btns .btn { flex: 1; min-height: 44px; }
  .btns .skip { flex-basis: 100%; }
</style>
