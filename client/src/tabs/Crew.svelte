<script lang="ts">
  import { engine } from '../engine/store.svelte';
  import { engineClient } from '../engine/client';

  let sub = $state<'roster' | 'jobs' | 'treasury'>('roster');
  let snap = $derived(engine.snapshot);
  let view = $derived(engine.derived);

  let members = $derived<any[]>(view?.crewMembers ?? []);
  let jobs = $derived<any[]>(view?.crewJobs ?? []);
  let treasury = $derived<{ gold: number; log: any[] }>(
    snap?.crew?.treasury ?? { gold: 0, log: [] },
  );

  function fmtDuration(sec: number): string {
    if (!isFinite(sec) || sec <= 0) return 'now';
    const m = Math.floor(sec / 60);
    const h = Math.floor(m / 60);
    if (h) return `${h}h ${m % 60}m`;
    if (m) return `${m}m`;
    return `${Math.round(sec)}s`;
  }
  function fmtAt(ms: number): string {
    if (!isFinite(ms) || ms <= 0) return '—';
    const d = new Date(ms);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  async function assist(jobId: string) {
    try {
      const res = await engineClient.assistJob(jobId);
      if (res && res.ok === false) alert(res.reason || 'Could not assist.');
    } catch (err) { console.error('assist failed', err); }
  }
</script>

<nav class="subs" aria-label="Crew section">
  <button type="button" aria-current={sub === 'roster' ? 'page' : undefined} onclick={() => (sub = 'roster')}>Roster</button>
  <button type="button" aria-current={sub === 'jobs' ? 'page' : undefined} onclick={() => (sub = 'jobs')}>Jobs</button>
  <button type="button" aria-current={sub === 'treasury' ? 'page' : undefined} onclick={() => (sub = 'treasury')}>Treasury</button>
</nav>

{#if sub === 'roster'}
  <section class="group">
    <h3>Members</h3>
    {#if members.length === 0}
      <p class="muted">No crewmates yet.</p>
    {:else}
      <ul class="list">
        {#each members as m (m.id)}
          <li class={m.isYou ? 'you' : ''}>
            <div class="row">
              <div>
                <span class="name">{m.name}</span>
                {#if m.isYou}<span class="meta">you</span>{/if}
              </div>
              <span class="meta rank">{m.rankName}</span>
            </div>
            {#if m.skill}
              <p class="meta">Specializes in {m.skill}.</p>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{:else if sub === 'jobs'}
  <section class="group">
    <h3>Open jobs</h3>
    {#if jobs.length === 0}
      <p class="muted">No one has posted work right now. Crewmates post jobs when they stop working.</p>
    {:else}
      <ul class="list">
        {#each jobs as j (j.id)}
          <li>
            <div class="row">
              <div>
                <span class="name">{j.action?.name ?? j.actionId}</span>
                <span class="meta grade">{j.owner}</span>
              </div>
              <span class="meta">{j.done}/{j.qty}</span>
            </div>
            <div class="row sub">
              <span class="meta">ETA {fmtDuration(j.etaSec)}{j.station ? ` · ${j.station}` : ''}</span>
              <button
                type="button"
                class="action-btn"
                aria-pressed={j.assisting}
                disabled={!j.canAssist?.ok}
                onclick={() => assist(j.id)}
                title={j.canAssist?.reason ?? ''}
              >
                {j.assisting ? 'Assisting' : 'Assist'}
              </button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{:else}
  <section class="group">
    <h3>Treasury</h3>
    <article class="treasury">
      <div class="totals">
        <div><dt>Crew gold</dt><dd>{Math.floor(treasury.gold)}g</dd></div>
      </div>
      <p class="meta">All movements are logged below for every crewmate to see.</p>
    </article>
  </section>

  <section class="group">
    <h3>Ledger</h3>
    {#if !treasury.log || treasury.log.length === 0}
      <p class="muted">No activity yet. Entries will appear here as the crew earns, deposits or pays out.</p>
    {:else}
      <ul class="list">
        {#each treasury.log as entry}
          <li>
            <div class="row">
              <span class="name">{entry.who ?? 'Crew'}</span>
              <span class={`delta ${entry.delta >= 0 ? 'pos' : 'neg'}`}>
                {entry.delta >= 0 ? '+' : ''}{entry.delta}g
              </span>
            </div>
            <p class="meta">{fmtAt(entry.at)} · {entry.reason ?? entry.kind}</p>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
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
  .muted { margin: 0; padding: 12px; background: var(--paper); border: 1px solid var(--rule); color: var(--ink-3); font-size: var(--t-sm); }
  .meta { margin: 4px 0 0; color: var(--ink-3); font-size: var(--t-xs); }
  .grade { display: inline-block; margin-left: 6px; }
  .rank { display: inline-block; text-transform: uppercase; letter-spacing: .04em; }

  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .list li { padding: 10px 12px; background: var(--paper); border: 1px solid var(--rule); }
  .list li.you { border-color: var(--woad); background: var(--woad-soft); }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .row.sub { margin-top: 6px; }
  .name { font: 500 var(--t-sm)/1.1 var(--f-body); color: var(--ink); }

  .treasury { padding: 12px; background: var(--paper); border: 1px solid var(--rule); }
  .totals { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; margin: 0 0 8px; }
  .totals div {
    padding: 8px; background: var(--sunk); border: 1px solid var(--rule); display: grid; gap: 2px;
  }
  .totals dt {
    margin: 0; font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3);
    letter-spacing: .04em; text-transform: uppercase;
  }
  .totals dd { margin: 0; font: 600 var(--t-md)/1 var(--f-display); color: var(--brass); }

  .delta { font: 600 var(--t-sm)/1 var(--f-display); }
  .delta.pos { color: var(--ok); }
  .delta.neg { color: var(--bad); }

  .action-btn {
    padding: 6px 10px; border: 1px solid var(--rule); background: var(--sunk);
    font: 400 var(--t-xs)/1 var(--f-label); letter-spacing: .04em; text-transform: uppercase;
    color: var(--ink-2);
  }
  .action-btn:hover:not(:disabled) { background: var(--woad-soft); border-color: var(--woad); color: var(--woad); }
  .action-btn:disabled { opacity: .5; cursor: not-allowed; }
  .action-btn[aria-pressed="true"] { background: var(--woad); color: var(--on-woad); border-color: var(--woad); }
</style>
