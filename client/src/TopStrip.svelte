<script lang="ts">
  // Sticky status strip: gold, raid chip, Menu, then current job + HP. No scene here (it lives on the Workshop tab).
  import { engine } from './engine/store.svelte';
  import { engineClient } from './engine/client';
  import { fmtG, fmtN, fmtDuration } from './format';
  import { DATA } from '@guildwright/engine';
  import { guide } from './guide.svelte';

  type Props = { onMenu: () => void; onStart: () => void };
  let { onMenu, onStart }: Props = $props();

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

  // On a fresh save the Workshop's "Do this first" button is the only call to action.
  let fresh = $derived(!guide.dismissed && !guide.done['gather']);
  let chip = $derived.by(() => {
    if (!raid) return null;
    if (raid.phase === 'live') return { text: `Raid closes in ${fmtDuration(raid.secLeft)}`, live: true };
    if (raid.phase === 'done') {
      const sec = raid.nextRaidAt ? (raid.nextRaidAt - Date.now()) / 1000 : 0;
      return { text: sec > 0 ? `Next raid in ${fmtDuration(sec)}` : 'Raid settled', live: false };
    }
    return { text: `Raid opens in ${fmtDuration(raid.secToStart)}`, live: false };
  });

  async function stop() {
    try { await engineClient.stop(); } catch (err) { console.error('stop failed', err); }
  }
</script>

<header class="strip">
  <div class="r1">
    {#if snap}<span class="gold">{fmtG(snap.gold)}</span>{/if}
    {#if chip}<span class="chip" class:live={chip.live}>{chip.text}</span>{/if}
    <button type="button" class="btn" onclick={onMenu} aria-label="Open menu: Log, Save, Settings, Credits">Menu</button>
  </div>
  <div class="r2">
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
    {:else if !fresh}
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
  .r2 { display: flex; align-items: center; gap: 8px; }
  .job { flex: 1; min-width: 0; display: grid; gap: 4px; }
  .job-name { font: 700 var(--t-sm)/1.1 var(--f-body); color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .job-name.idle { color: var(--ink-3); }
  .bar, .hpbar { height: 6px; background: var(--sunk); border: 1px solid var(--rule); overflow: hidden; }
  .fill { height: 100%; background: var(--woad); transition: width 200ms linear; }
  .hp { display: flex; align-items: center; gap: 6px; font: 700 var(--t-xs)/1 var(--f-num); color: var(--ink-2); }
  .hpbar { flex: 1; }
  .hpfill { height: 100%; background: var(--hp); }
  .r2 .btn { padding: 0 10px; max-width: 96px; line-height: 1.2; }
</style>
