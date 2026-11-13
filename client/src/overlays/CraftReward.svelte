<script lang="ts">
  import { pushBack } from './backStack.svelte';
  // Full-screen celebration for a live quality craft (gear above common). Spiralling rays in the rarity ink,
  // the card flips in, stats compared against the piece worn in that slot. Several in one batch queue up.
  // Tapping outside never closes it. Reduced motion: static rays, no spin, no flip.
  import { untrack, onDestroy } from 'svelte';
  import { engine } from '../engine/store.svelte';
  import { engineClient } from '../engine/client';
  import type { GearDetail } from '../engine/protocol';
  import { reducedMotion, settings } from '../settings.svelte';
  import { craftCardOn } from '../settings-core';
  import { play } from '../sound';
  import GearCard from './GearCard.svelte';
  import LootFrame from '../ui-art/reveal/LootFrame.svelte';
  import { DATA } from '@guildwright/engine';
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
        for (const it of e.items ?? []) if (it.uid && (RANK[it.rarity] ?? 0) > 0 && craftCardOn(settings, it.rarity)) out.push({ uid: it.uid, itemId: it.itemId, rarity: it.rarity, grade: it.grade });
      }
      enqueueRewards(out);
    });
  });

  // Hold the active job while any card is queued: one hold per open period, released when the queue empties
  // (Nice / Skip / Equip / Escape) and on teardown. holdJob failures never block the card.
  let held = false;
  const setHold = (on: boolean) => {
    if (held === on) return;
    held = on;
    try { Promise.resolve(engineClient.holdJob(on)).catch((e: unknown) => console.error('holdJob failed', e)); } catch (e) { console.error('holdJob failed', e); }
  };
  $effect(() => { const open = cur !== null; untrack(() => setHold(open)); });
  onDestroy(() => setHold(false));

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
  // Back = Nice / next card (the hold release follows `cur` going null, as for Escape).
  let isOpen = $derived(cur !== null);
  $effect(() => { if (isOpen) return pushBack(() => nextReward()); });
  function onKey(ev: KeyboardEvent) { if (cur && ev.key === 'Escape') nextReward(); }
  const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '');
  const fmt = (n: number) => String(Math.round(Math.abs(n) * 100) / 100);
  let name = $derived(detail?.name ?? '');
  const SECTION: Record<string, string> = { fight: 'Fight gear', outfit: 'Work outfit', tool: 'Tool' };
  const SETS: Record<string, string> = { gather: 'Gather', refine: 'Refine', craft: 'Craft' };
  const skillName = (id: string) => ((DATA as any).skills as Array<{ id: string; name: string }>).find((x) => x.id === id)?.name ?? id;
  // "Fight gear · Tier 2", "Work outfit · Gather set · Tier 1", "Tool · Mining · Tier 3"
  let kind = $derived.by(() => {
    const d = detail as any;
    if (!d?.section) return '';
    const mid = d.section === 'outfit' ? (d.outfitSet ? `${SETS[d.outfitSet] ?? d.outfitSet} set` : '') : d.section === 'tool' && d.toolSkill ? skillName(d.toolSkill) : '';
    return [SECTION[d.section] ?? d.section, mid, d.tier ? `Tier ${d.tier}` : ''].filter(Boolean).join(' · ');
  });
  // What the compared piece sits in: slot / set piece / skill.
  let cmpAt = $derived.by(() => {
    const a = (detail?.compare as any)?.at;
    if (!a) return '';
    return a.section === 'fight' ? `worn ${String(a.slot).replace(/(\d)$/, ' $1')}` : a.section === 'outfit' ? `${SETS[a.set] ?? a.set} set ${a.piece}` : `${skillName(a.skill)} tool`;
  });
  let emptyAt = $derived.by(() => { const d = detail as any; return d?.section === 'tool' ? 'No tool in that skill yet' : d?.section === 'outfit' ? 'Nothing worn in that spot' : 'Nothing equipped in that slot'; });
  // Tools: the skill's real (capped) totals now vs with this tool.
  let finals = $derived.by(() => {
    const f = (detail as any)?.final as { now: Record<string, number>; ifWorn: Record<string, number> } | undefined;
    if (!f) return [] as Array<{ key: string; now: number; to: number }>;
    return Object.keys(f.ifWorn).filter((k) => (f.ifWorn[k] ?? 0) || (f.now[k] ?? 0)).map((k) => ({ key: k, now: f.now[k] ?? 0, to: f.ifWorn[k] ?? 0 }));
  });
  const EFF: Record<string, string> = { speed: 'Speed', double: 'Double output', save: 'Save input', quality: 'Quality', find: 'Bonus find', rarity: 'Rarity odds' };
  const effName = (k: string) => ((DATA as any).effects as Array<{ id: string; name: string }> | undefined)?.find((e) => e.id === k)?.name ?? EFF[k] ?? k;
</script>

<svelte:window onkeydown={onKey} />

{#if cur}
  <div class="cr" class:still={reduced()} role="dialog" aria-modal="true" aria-label={name || `${cur.rarity} craft`} style:--ink-r={`var(--r-${cur.rarity})`} style:--rays={rays} style:--glow={`${24 + rank * 14}px`}>
    <div class="rays a" aria-hidden="true"></div>
    <div class="rays b" aria-hidden="true"></div>
    <div class="halo" aria-hidden="true"></div>
    {#if rank >= 3 && !reduced()}<div class="sparks" aria-hidden="true">{#each Array(rank * 3) as _, i}<i style:--i={i}></i>{/each}</div>{/if}

    <div class="stage">
      <div class="flipper" class:up={reduced() || !!loadedFor} class:anim={!reduced()}>
      {#if !reduced()}<div class="back" aria-hidden="true"><LootFrame {rank} back still={false}><svg viewBox="0 0 32 32" width="64" height="64" shape-rendering="crispEdges"><path d="M16 3 L19 13 L29 16 L19 19 L16 29 L13 19 L3 16 L13 13 Z" fill="currentColor"/><circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" stroke-width="1"/></svg></LootFrame></div>{/if}
      <LootFrame {rank} still={reduced()}>
      <div class="card">
        <p class="kick">{cap(cur.rarity)} craft{craftReward.total > 1 ? ` · ${step} of ${craftReward.total}` : ''}</p>
        {#if kind}<p class="meta kind">{kind}</p>{/if}
        {#if detail}
          <GearCard detail={detail as any} />
          {#if !detail.compare && !detail.equipped}<p class="ch">{emptyAt}</p>
          {:else if detail.compare}<p class="ch">Compared to <span style:color={`var(--r-${detail.compare.rarity})`}>{detail.compare.name}</span>{cmpAt ? ` (${cmpAt})` : ''}</p>{/if}
          {#if finals.length}<ul class="fin">{#each finals as f (f.key)}<li class:up={f.to > f.now} class:dn={f.to < f.now}><span>{effName(f.key)} (skill total)</span><b class="num">{f.to}{f.key === 'quality' ? '' : '%'} <small>(now {f.now}{f.key === 'quality' ? '' : '%'})</small></b></li>{/each}</ul>{/if}
        {:else if loadedFor}
          <p class="meta">Details unavailable.</p>
        {:else}
          <p class="meta">{name || '…'}</p>
        {/if}

        <p class="hold">Your job is paused while this card is open.</p>
        <div class="btns">
          {#if craftReward.total > 1 && craftReward.queue.length > 1}<button type="button" class="btn skip" onclick={skipRewards}>Skip rest</button>{/if}
          <button type="button" class="btn primary" bind:this={btn} disabled={busy || equipped || !detail || detail.equipped} onclick={equip}>{equipped ? 'Equipped' : 'Equip'}</button>
          <button type="button" class="btn" onclick={nextReward}>Nice</button>
        </div>
      </div>
      </LootFrame>
      </div>
    </div>
  </div>
{/if}

<style>
  .cr { position: fixed; inset: 0; z-index: 60; overflow: hidden; background: color-mix(in srgb, var(--plaster) 90%, var(--ink-r)); animation: fin 220ms ease-out; display: grid; place-items: center; }
  @keyframes fin { from { opacity: 0; } }
  .rays { position: absolute; left: 50%; top: 50%; width: 220vmax; height: 220vmax; margin: -110vmax 0 0 -110vmax; pointer-events: none;
    background: repeating-conic-gradient(from 0deg, color-mix(in srgb, var(--ink-r) 55%, transparent) 0 calc(180deg / var(--rays)), transparent 0 calc(360deg / var(--rays)));
    -webkit-mask-image: radial-gradient(circle, #000 0, #000 6%, transparent 24%); mask-image: radial-gradient(circle, #000 0, #000 6%, transparent 24%);
    animation: spin 28s linear infinite; }
  .rays.b { opacity: .5; transform: scale(1.4) rotate(12deg); animation: spin 42s linear infinite reverse; }
  @keyframes spin { to { rotate: 360deg; } }
  .halo { position: absolute; left: 50%; top: 50%; width: min(86vw, 400px); aspect-ratio: 1; translate: -50% -50%; border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--ink-r) 45%, transparent), transparent 65%); pointer-events: none; animation: breathe 2.6s ease-in-out infinite; }
  @keyframes breathe { 50% { opacity: .65; scale: 1.08; } }
  .sparks i { position: absolute; left: 50%; top: 50%; width: 6px; height: 6px; background: var(--ink-r); pointer-events: none;
    animation: spark 2.4s ease-out infinite; animation-delay: calc(var(--i) * -0.19s); --a: calc(var(--i) * 47deg); }
  @keyframes spark { 0% { transform: rotate(var(--a)) translateY(0) scale(.4); opacity: 0; } 20% { opacity: 1; } 100% { transform: rotate(var(--a)) translateY(-32vmin) scale(1); opacity: 0; } }
  .still .rays, .still .halo { animation: none; }
  @media (prefers-reduced-motion: reduce) { .rays, .halo, .sparks i { animation: none; } .cr { animation: none; } }

  .stage { position: relative; width: 100%; max-width: 340px; padding: max(24px, env(safe-area-inset-top)) 20px max(24px, env(safe-area-inset-bottom)); max-height: 100%; overflow-y: auto; perspective: 900px; }
  .card { display: grid; gap: 6px; justify-items: center; text-align: center; backface-visibility: hidden; align-content: start; min-height: 260px; }
  .flipper { position: relative; transform-style: preserve-3d; transform: rotateY(180deg); }
  .flipper.up { transform: none; }
  .flipper.anim.up { animation: flip 600ms ease-out; }
  @keyframes flip { from { transform: rotateY(180deg) scale(.94); } 80% { transform: rotateY(0) scale(1.05); } to { transform: rotateY(0) scale(1); } }
  .back { position: absolute; inset: 0; transform: rotateY(180deg); backface-visibility: hidden; }
  .kick { margin: 0; font: 700 var(--t-xs)/1 var(--f-label, var(--f-body)); letter-spacing: .08em; text-transform: uppercase; color: var(--ink-r); }
  .meta { margin: 0; color: var(--ink-2); font-size: var(--t-sm); }
  ul.fin { list-style: none; margin: 0; padding: 0; width: 100%; display: grid; gap: 4px; }
  .fin li { display: flex; justify-content: space-between; gap: 8px; padding: 4px 8px; border-radius: var(--rad-sm); background: var(--sunk); border: 1px solid var(--rule); font-size: var(--t-sm); text-align: left; }
  .ch { margin: 4px 0 0; color: var(--ink-2); font-size: var(--t-sm); text-align: left; }
  .fin li.up b { color: var(--ok); } .fin li.dn b { color: var(--bad, var(--warn)); }
  .meta.kind { font: 700 var(--t-xs)/1.2 var(--f-label, var(--f-body)); letter-spacing: .05em; text-transform: uppercase; color: var(--ink-3); }
  small { color: var(--ink-3); font-size: var(--t-xs); font-weight: 400; }
.hold { margin: 0; color: var(--ink-2); font-size: var(--t-sm); }
  .btns { display: flex; gap: 8px; width: 100%; margin-top: 6px; flex-wrap: wrap; }
  .btns .btn { flex: 1; min-height: 44px; }
  .btns .skip { flex-basis: 100%; }
</style>
