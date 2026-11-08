<script lang="ts">
  import { DATA } from '@guildwright/engine';
  import { fmtG, hasPayout } from '../format';
  import { engine } from '../engine/store.svelte';
  import { engineClient } from '../engine/client';

  const SLOT_ORDER = ['weapon', 'offhand', 'head', 'chest', 'legs', 'ring'] as const;
  const STANCES = [
    { id: 'aggressive', label: 'Aggressive', blurb: 'Crit chance +5%. More damage, more risk.' },
    { id: 'balanced', label: 'Balanced', blurb: 'Even trades.' },
    { id: 'defensive', label: 'Defensive', blurb: 'Lower crit, steadier survival.' },
  ];
  const TACTICS = [
    { id: 'focus', label: 'Focus', blurb: 'Hit one enemy at a time.' },
    { id: 'interrupt', label: 'Interrupt', blurb: 'Break casts; less sustained damage.' },
    { id: 'endure', label: 'Endure', blurb: 'Weather mechanics; slow and steady.' },
  ];
  const itemsMap: Record<string, { name?: string }> = (DATA as any).items;
  const itemName = (id: string) => itemsMap[id]?.name ?? id;
  const PHASE_LABEL: Record<string, string> = {
    prep: 'Preparing', locked: 'Locked in', live: 'Raid is live', done: 'Fought',
  };

  let sub = $state<'loadout' | 'hunt' | 'raid'>('loadout');
  let snap = $derived(engine.snapshot);
  let view = $derived(engine.derived);

  let loadouts = $derived<any[]>(snap?.loadouts ?? []);
  let rules = $derived(snap?.raid?.rules ?? { eatAt: 0.5, stance: 'balanced', tactic: 'focus' });
  let stats = $derived(view?.playerStats ?? null);
  let boss = $derived(view?.bossIntel ?? null);
  let status = $derived(view?.raidStatus ?? null);
  let recap = $derived<any>((snap?.raid?.recaps ?? []).find((x: any) => x.id === snap?.raid?.last?.recapId) ?? null);
  let pay = $derived<any>(recap?.payout ?? null);
  const pct = (x: number) => `${Math.round((x ?? 0) * 100)}%`;
  let hp = $derived<number>(snap?.hp ?? 0);

  function fmtDuration(sec: number): string {
    if (!isFinite(sec) || sec <= 0) return 'now';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
    if (h) return `${h}h ${m}m`;
    return `${m}m`;
  }

  async function saveCurrentGear() {
    const name = prompt('Loadout name?', `Loadout ${loadouts.length + 1}`);
    if (name == null) return;
    try { await engineClient.saveLoadout(name.trim() || undefined); }
    catch (err) { console.error('saveLoadout failed', err); }
  }
  async function equipLoadout(id: string) {
    try { await engineClient.equipLoadout(id); }
    catch (err) { console.error('equipLoadout failed', err); }
  }
  async function deleteLoadout(id: string, name: string) {
    if (!confirm(`Delete loadout "${name}"?`)) return;
    try { await engineClient.deleteLoadout(id); }
    catch (err) { console.error('deleteLoadout failed', err); }
  }
  async function pickStance(stance: string) {
    try { await engineClient.setRaidRules({ stance }); }
    catch (err) { console.error('setRaidRules failed', err); }
  }
  async function pickTactic(tactic: string) {
    try { await engineClient.setRaidRules({ tactic }); }
    catch (err) { console.error('setRaidRules failed', err); }
  }
  async function pickEatAt(ev: Event) {
    const pct = Number((ev.target as HTMLInputElement).value) / 100;
    try { await engineClient.setRaidRules({ eatAt: pct }); }
    catch (err) { console.error('setRaidRules failed', err); }
  }
</script>

<nav class="subs" aria-label="War Room section">
  <button type="button" aria-current={sub === 'loadout' ? 'page' : undefined} onclick={() => (sub = 'loadout')}>Loadout</button>
  <button type="button" aria-current={sub === 'hunt' ? 'page' : undefined} onclick={() => (sub = 'hunt')}>Hunt</button>
  <button type="button" aria-current={sub === 'raid' ? 'page' : undefined} onclick={() => (sub = 'raid')}>Raid</button>
</nav>

{#if sub === 'loadout'}
  <section class="group">
    <div class="group-head">
      <h3>Saved loadouts</h3>
      <button type="button" class="action-btn" onclick={saveCurrentGear}>Save current gear</button>
    </div>
    {#if loadouts.length === 0}
      <p class="muted">No loadouts yet. Save your current gear to make a one-tap swap for later.</p>
    {:else}
      <ul class="list">
        {#each loadouts as l (l.id)}
          <li>
            <div class="row">
              <span class="name">{l.name}</span>
              <span class="meta">{SLOT_ORDER.filter((s) => l.slots?.[s]).length}/6 pieces</span>
            </div>
            <div class="row actions">
              <button type="button" class="action-btn" onclick={() => equipLoadout(l.id)}>Equip</button>
              <button type="button" class="ghost" onclick={() => deleteLoadout(l.id, l.name)}>Delete</button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{:else if sub === 'hunt'}
  <section class="group">
    <h3>Current boss</h3>
    {#if boss}
      <article class="boss">
        <header>
          <span class="boss-name">{boss.name}</span>
          {#if boss.title}<span class="meta">{boss.title}</span>{/if}
        </header>
        <div class="bar" aria-label="Boss HP">
          <div class="fill" style="width: {Math.round((boss.hpPct ?? 0) * 100)}%"></div>
        </div>
        <p class="meta">
          HP {Math.max(0, Math.floor(boss.hpLeft))} / {Math.floor(boss.maxHp)}
          {#if boss.weakTo} · Weak to {boss.weakTo}{/if}
          {#if boss.reqPower} · Req power {Math.round(boss.reqPower)}{/if}
        </p>
      </article>
    {:else}
      <p class="muted">No current boss.</p>
    {/if}
  </section>

  <section class="group">
    <h3>Your readiness</h3>
    {#if stats}
      <dl class="stats">
        <div><dt>HP</dt><dd>{Math.floor(hp)} / {Math.floor(stats.maxHp)}</dd></div>
        <div><dt>Attack</dt><dd>{Math.round(stats.atk)}</dd></div>
        <div><dt>Defence</dt><dd>{Math.round(stats.def)}</dd></div>
        <div><dt>Heal</dt><dd>{Math.round(stats.heal)}</dd></div>
      </dl>
    {/if}
  </section>

  <section class="group">
    <h3>Stance</h3>
    <ul class="picker">
      {#each STANCES as s (s.id)}
        <li>
          <button type="button" aria-pressed={rules.stance === s.id} onclick={() => pickStance(s.id)}>
            <span class="pick-name">{s.label}</span>
            <span class="pick-blurb">{s.blurb}</span>
          </button>
        </li>
      {/each}
    </ul>
  </section>

  <section class="group">
    <h3>Tactic</h3>
    <ul class="picker">
      {#each TACTICS as t (t.id)}
        <li>
          <button type="button" aria-pressed={rules.tactic === t.id} onclick={() => pickTactic(t.id)}>
            <span class="pick-name">{t.label}</span>
            <span class="pick-blurb">{t.blurb}</span>
          </button>
        </li>
      {/each}
    </ul>
  </section>

  <section class="group">
    <h3>Eat threshold</h3>
    <p class="meta">Pull food from the pouch when HP drops below this.</p>
    <div class="slider">
      <input type="range" min="30" max="80" step="5" value={Math.round(rules.eatAt * 100)} oninput={pickEatAt} />
      <span class="slider-val">{Math.round(rules.eatAt * 100)}%</span>
    </div>
  </section>
{:else}
  <section class="group">
    <h3>Status</h3>
    {#if status}
      <article class="status">
        <span class={`phase phase-${status.phase}`}>{PHASE_LABEL[status.phase] ?? status.phase}</span>
        <p class="meta">
          {#if status.phase === 'prep'}
            Opens in {fmtDuration(status.secToStart)}. The raid runs Sat 10:00 to Sun 22:00 local.
          {:else if status.phase === 'live'}
            Closes in {fmtDuration(status.secLeft)}.
            {#if status.sittingOut}
              <br />You joined after this raid opened. You'll join next weekend's raid.
              {#if status.nextRaidAt}<br />Next raid opens in {fmtDuration((status.nextRaidAt - Date.now()) / 1000)}.{/if}
            {/if}
          {:else if status.phase === 'done'}
            This week's raid is settled.
          {:else}
            Locked in and waiting for the window.
          {/if}
        </p>
      </article>
    {/if}
  </section>

  {#if snap?.raid?.last}
    <section class="group">
      <h3>Last recap</h3>
      <article class="recap">
        <p class="meta">Week {snap.raid.last.week}{snap.raid.last.result ? ` · ${snap.raid.last.result}` : ''}</p>
        {#if hasPayout(pay)}
          <p class="yourgold">Your gold: <span class="brass">+{fmtG(pay.gold ?? 0)}</span></p>
          <p class="meta">
            Pool {fmtG(pay.pool)} · turnout {pct(pay.turnout)} · your contribution {pct(pay.contribution)}{pay.capped ? ' · crew cap reached' : ''}
          </p>
        {:else if snap.raid.last.gold}
          <p class="meta">Gold: {fmtG(snap.raid.last.gold)}</p>
        {/if}
        {#if snap.raid.last.xp}<p class="meta">XP: {Math.round(snap.raid.last.xp)}</p>{/if}
        {#if snap.raid.last.crewStock}
          {@const cs = snap.raid.last.crewStock}
          <h4>Crew stock used</h4>
          {#if Object.keys(cs.used ?? {}).length === 0}
            <p class="meta">Nothing was drawn from the crew stock.</p>
          {:else}
            <p class="meta">{Object.entries(cs.used).map(([id, q]) => `${itemName(id)} × ${q}`).join(', ')}</p>
            <ul class="stock">
              {#each cs.byMember ?? [] as m}
                <li>
                  <span>{m.name ?? m.who}</span>
                  <span class="meta">healed {Math.round(m.healed ?? 0)} · buffed {Math.round(m.buffed ?? 0)} · +{Math.round(m.credit ?? 0)} credit</span>
                </li>
              {/each}
            </ul>
            <p class="meta">Your contribution credit from stock: +{cs.yourCredit ?? 0}</p>
          {/if}
        {/if}
      </article>
    </section>
  {/if}
{/if}

<style>
  .subs {
    display: grid; grid-template-columns: repeat(3, 1fr);
    margin: 0 0 16px; border: 1px solid var(--rule); background: var(--paper);
  }
  .subs button {
    padding: 10px; border: 0; background: transparent;
    font: 400 var(--t-xs)/1 var(--f-label); letter-spacing: .04em; text-transform: uppercase;
    color: var(--ink-2);
  }
  .subs button[aria-current="page"] { background: var(--woad-soft); color: var(--woad); }

  .group + .group { margin-top: 16px; }
  .group h3 {
    margin: 0 0 8px; font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3);
    letter-spacing: .08em; text-transform: uppercase;
  }
  .group-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
  .group-head h3 { margin: 0; }
  .muted { margin: 0; padding: 12px; background: var(--paper); border: 1px solid var(--rule); color: var(--ink-3); font-size: var(--t-sm); }
  .meta { margin: 4px 0 0; color: var(--ink-3); font-size: var(--t-xs); }

  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .list li { padding: 10px 12px; background: var(--paper); border: 1px solid var(--rule); }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .row.actions { margin-top: 8px; }
  .name { font: 500 var(--t-sm)/1.1 var(--f-body); color: var(--ink); }

  .boss { padding: 10px 12px; background: var(--paper); border: 1px solid var(--rule); }
  .boss header { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .boss-name { font: 600 var(--t-md)/1.1 var(--f-display); color: var(--ink); }
  .bar { height: 10px; margin-top: 10px; background: var(--sunk); border: 1px solid var(--rule); overflow: hidden; }
  .bar .fill { height: 100%; background: var(--hp); transition: width 200ms linear; }

  .stats {
    margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 8px;
  }
  .stats div { padding: 8px; background: var(--sunk); border: 1px solid var(--rule); display: grid; gap: 2px; }
  .stats dt {
    margin: 0; font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3);
    letter-spacing: .04em; text-transform: uppercase;
  }
  .stats dd { margin: 0; font: 600 var(--t-md)/1 var(--f-display); color: var(--ink); }

  .picker { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .picker button {
    width: 100%; padding: 10px 12px; text-align: left; display: grid; gap: 2px;
    border: 1px solid var(--rule); background: var(--sunk);
  }
  .picker button:hover:not(:disabled) { background: var(--woad-soft); border-color: var(--woad); }
  .picker button[aria-pressed="true"] { background: var(--woad); color: var(--on-woad); border-color: var(--woad); }
  .picker button[aria-pressed="true"] .pick-blurb { color: var(--on-woad); opacity: .85; }
  .pick-name { font: 500 var(--t-sm)/1.1 var(--f-body); }
  .pick-blurb { font: 400 var(--t-xs)/1.2 var(--f-body); color: var(--ink-3); }

  .slider { display: flex; align-items: center; gap: 12px; }
  .slider input { flex: 1; }
  .slider-val { font: 500 var(--t-sm)/1 var(--f-display); color: var(--ink); min-width: 48px; text-align: right; }

  .status { padding: 10px 12px; background: var(--paper); border: 1px solid var(--rule); }
  .phase { font: 500 var(--t-sm)/1.1 var(--f-body); }
  .phase-live { color: var(--hp); }
  .phase-locked { color: var(--brass); }
  .phase-done { color: var(--ok); }
  .phase-prep { color: var(--ink-2); }

  .yourgold { margin: 6px 0 0; font: 600 var(--t-lg)/1.2 var(--f-display); color: var(--ink); }
  .brass { color: var(--brass); }
  .recap h4 { margin: 12px 0 0; font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3); letter-spacing: .06em; text-transform: uppercase; }
  .stock { list-style: none; margin: 6px 0 0; padding: 0; display: grid; gap: 4px; font-size: var(--t-sm); }
  .stock li { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .recap { padding: 10px 12px; background: var(--paper); border: 1px solid var(--rule); }

  .action-btn, .ghost {
    padding: 6px 10px; border: 1px solid var(--rule); background: var(--sunk);
    font: 400 var(--t-xs)/1 var(--f-label); letter-spacing: .04em; text-transform: uppercase;
    color: var(--ink-2);
  }
  .action-btn:hover:not(:disabled) { background: var(--woad-soft); border-color: var(--woad); color: var(--woad); }
  .action-btn:disabled { opacity: .5; cursor: not-allowed; }
  .ghost { background: transparent; }
  .ghost:hover { background: var(--sunk); }
</style>
