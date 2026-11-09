<script lang="ts">
  import { untrack } from 'svelte';
  // Sticky status strip: gold, raid chip, Log/Save, then scene + current job + HP.
  import { engine } from './engine/store.svelte';
  import { engineClient } from './engine/client';
  import { fmtG, fmtN, fmtDuration } from './format';
  import { DATA } from '@guildwright/engine';
  import { guide, nextStep } from './guide.svelte';
  import { showMe } from './ui.svelte';
  import SceneStrip from './scene/SceneStrip.svelte';

  type Props = { onLog: () => void; onSave: () => void; onStart: () => void };
  let { onLog, onSave, onStart }: Props = $props();

  const actionsAll: Array<{ id: string; name: string }> = (DATA as any).actions;
  let snap = $derived(engine.snapshot);
  let view = $derived(engine.derived);
  let active = $derived(snap?.active ?? null);
  let job = $derived(active ? actionsAll.find((a) => a.id === active.actionId) ?? null : null);
  let activeTime = $derived<number>(view?.activeTime ?? 0);
  let progress = $derived(active && activeTime > 0 ? Math.max(0, Math.min(1, active.progress / activeTime)) : 0);
  let hp = $derived(Math.max(0, snap?.hp ?? 0));
  let maxHp = $derived<number>(view?.playerStats?.maxHp ?? 0);
  let hpPct = $derived(maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0);
  let raid = $derived(view?.raidStatus ?? null);

  let hint = $derived(!guide.dismissed && !active ? nextStep() : null);
  let chip = $derived.by(() => {
    if (!raid) return null;
    if (raid.phase === 'live') return { text: `Raid closes in ${fmtDuration(raid.secLeft)}`, live: true };
    if (raid.phase === 'done') {
      const sec = raid.nextRaidAt ? (raid.nextRaidAt - Date.now()) / 1000 : 0;
      return { text: sec > 0 ? `Next raid in ${fmtDuration(sec)}` : 'Raid settled', live: false };
    }
    return { text: `Raid opens in ${fmtDuration(raid.secToStart)}`, live: false };
  });

  // Floating "+n Item" over the scene on each completed rep while the app is open.
  const itemsMap: Record<string, { name?: string }> = (DATA as any).items;
  const itemRarity: Record<string, string> = (DATA as any).itemRarity ?? {};
  let floats = $state<Array<{ id: number; text: string; rarity: string }>>([]);
  let floatId = 0;
  const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  $effect(() => {
    const evs = engine.lastEvents;
    if (!evs?.length || reduced() || document.hidden) return;
    untrack(() => {
    for (const e of evs) {
      if (e.type !== 'complete') continue;
      for (const it of (e.items ?? []).slice(0, 2)) {
        const id = ++floatId;
        floats.push({ id, text: `+${it.qty} ${itemsMap[it.itemId]?.name ?? it.itemId}`, rarity: itemRarity[it.itemId] ?? 'common' });
        setTimeout(() => { floats = floats.filter((f) => f.id !== id); }, 800);
      }
    }
    if (floats.length > 4) floats = floats.slice(-4);
    });
  });

  async function stop() {
    try { await engineClient.stop(); } catch (err) { console.error('stop failed', err); }
  }
</script>

<header class="strip">
  <div class="r1">
    {#if snap}<span class="gold">{fmtG(snap.gold)}</span>{/if}
    {#if chip}<span class="chip" class:live={chip.live}>{chip.text}</span>{/if}
    <button type="button" class="btn" onclick={onLog}>Log</button>
    <button type="button" class="btn" onclick={onSave} aria-label="Open save menu">Save</button>
  </div>
  <div class="r2">
    <div class="scene">
      <SceneStrip />
      {#each floats as f (f.id)}<span class="float" style:color={`var(--r-${f.rarity})`}>{f.text}</span>{/each}
    </div>
    <div class="job">
      {#if job}
        <span class="job-name">{job.name}</span>
        <div class="bar" role="progressbar" aria-label="Job progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress * 100)}>
          <div class="fill" style="width: {Math.round(progress * 100)}%"></div>
        </div>
      {:else}
        <span class="job-name idle">Nothing running</span>
      {/if}
      <div class="hp" aria-label="Health {fmtN(hp)} of {fmtN(maxHp)}">
        <div class="hpbar"><div class="hpfill" style="width: {Math.round(hpPct * 100)}%"></div></div>
        <span class="num">{fmtN(hp)}/{fmtN(maxHp)}</span>
      </div>
    </div>
    {#if job}
      <button type="button" class="btn primary" onclick={stop}>Stop</button>
    {:else if hint}
      <button type="button" class="btn primary hintbtn" title="Next: {hint.text}" aria-label="Next: {hint.text}" onclick={() => showMe(hint.tab, hint.selector, hint.subs ?? {})}><span class="ell">Next: {hint.text}</span></button>
    {:else}
      <button type="button" class="btn primary" onclick={onStart}>Start next job</button>
    {/if}
  </div>
</header>

<style>
  .strip {
    position: sticky; top: 0; z-index: 15;
    margin: 0 calc(var(--gut-r) * -1) 0 calc(var(--gut-l) * -1);
    padding: 0 var(--gut-r) 6px var(--gut-l);
    background: var(--plaster); border-bottom: 1px solid var(--rule);
  }
  .r1 { display: flex; align-items: center; gap: 8px; min-height: 48px; }
  .r1 .gold { font-size: var(--t-lg); }
  .chip { flex: 1; min-width: 0; text-align: right; font: 700 var(--t-sm)/1.2 var(--f-num); font-variant-numeric: tabular-nums; color: var(--ink-2); }
  .chip.live { color: var(--woad); }
  .r1 .btn { padding: 0 10px; }
  .r2 .hintbtn .ell { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .r2 .hintbtn { max-width: 130px; font: 700 var(--t-xs)/1.15 var(--f-body); text-transform: none; letter-spacing: 0; }
  .r2 { display: flex; align-items: center; gap: 8px; }
  .scene { position: relative; flex: none; }
  .float {
    position: absolute; left: 50%; bottom: 40%; transform: translateX(-50%); white-space: nowrap; pointer-events: none;
    padding: 1px 5px; background: var(--paper); border: 1px solid var(--rule); font: 700 var(--t-xs)/1.2 var(--f-num);
    animation: floatup 800ms ease-out forwards; z-index: 2;
  }
  @keyframes floatup { from { opacity: 1; transform: translate(-50%, 0); } to { opacity: 0; transform: translate(-50%, -22px); } }
  @media (prefers-reduced-motion: reduce) { .float { display: none; } }
  .job { flex: 1; min-width: 0; display: grid; gap: 4px; }
  .job-name { font: 700 var(--t-sm)/1.1 var(--f-body); color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .job-name.idle { color: var(--ink-3); }
  .bar, .hpbar { height: 6px; background: var(--sunk); border: 1px solid var(--rule); overflow: hidden; }
  .fill { height: 100%; background: var(--woad); transition: width 200ms linear; }
  .hp { display: flex; align-items: center; gap: 6px; font: 700 var(--t-xs)/1 var(--f-num); color: var(--ink-2); }
  .hpbar { flex: 1; }
  .hpfill { height: 100%; background: var(--hp); }
  .r2 .btn { padding: 0 10px; max-width: 96px; line-height: 1.2; }
  @media (max-width: 380px) { .r2 :global(canvas) { width: 80px !important; height: 32px !important; } }
</style>
