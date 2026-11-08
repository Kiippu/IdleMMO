<script lang="ts">
  import { DATA } from '@guildwright/engine';
  import { engine } from '../engine/store.svelte';
  import { engineClient } from '../engine/client';

  let sub = $state<'roster' | 'jobs' | 'contracts' | 'treasury'>('roster');
  let snap = $derived(engine.snapshot);
  let view = $derived(engine.derived);

  let members = $derived<any[]>(view?.crewMembers ?? []);
  let jobs = $derived<any[]>(view?.crewJobs ?? []);
  let cg = $derived(view?.crewGold ?? { free: 0, escrowed: 0, total: 0 });
  let log = $derived<any[]>(view?.treasuryLog ?? []);
  let gearNames = $derived<Record<string, string>>(view?.gearNames ?? {});
  let contracts = $derived<any[]>(view?.contracts ?? []);
  let spec = $derived(view?.spec ?? null);
  let cooldown = $derived(view?.specCooldown ?? { ms: 0, text: '', ready: true });
  let gold = $derived(Math.floor(snap?.gold ?? 0));
  let rep = $derived(view?.rep ?? 0);
  const skillList: { id: string; name: string }[] = (DATA as any).skills;
  const skillName = (id: string) => skillList.find((k) => k.id === id)?.name ?? id;
  let pickSkill = $state('');
  let fillQty = $state<Record<string, number>>({});
  let msg = $state('');
  const itemsMap: Record<string, { name?: string }> = (DATA as any).items;
  const itemName = (id: string) => itemsMap[id]?.name ?? id;

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

  function maxFill(c: any): number {
    return Math.max(0, Math.min(c.remaining ?? 0, c.have ?? 0));
  }
  function qtyFor(c: any): number {
    const want = fillQty[c.id] ?? maxFill(c);
    return Math.max(1, Math.min(want, Math.max(1, maxFill(c))));
  }
  async function fill(c: any) {
    msg = '';
    try {
      const res = await engineClient.fillContract(c.id, qtyFor(c));
      if (res && res.ok === false) msg = res.reason || 'Could not fill.';
      else if (res) msg = `Handed in ${res.accepted ?? 0}${res.gold ? `, +${res.gold}g` : ''}${res.rep ? `, +${res.rep} rep` : ''}.`;
    } catch (err) { console.error('fillContract failed', err); }
  }
  async function doSwitch() {
    if (!pickSkill || !spec) return;
    if (!confirm(`Specialize in ${skillName(pickSkill)} for ${spec.cost}g? ${spec.skillId ? `${skillName(spec.skillId)} drops to level ${spec.capLevel} (XP kept). ` : ''}You can't switch again for 7 days.`)) return;
    try {
      const res = await engineClient.switchSpec(pickSkill);
      msg = res && res.ok === false ? (res.reason || 'Could not switch.') : 'Specialization changed.';
    } catch (err) { console.error('switchSpec failed', err); }
  }
  const payLabel = (c: any) => (c.pays === 'gold' ? 'Pays gold' : c.pays === 'mixed' ? 'Pays gold, then rep' : 'Pays reputation');
  function rowText(e: any): string {
    const q = e.qty ? Math.abs(e.qty) : 1;
    if (e.gear || e.uid) return gearNames[e.uid] ?? e.reason ?? 'Gear';
    return `${itemName(e.itemId)} × ${q}`;
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
  <button type="button" aria-current={sub === 'contracts' ? 'page' : undefined} onclick={() => (sub = 'contracts')}>Contracts</button>
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
                {#if m.isYou && m.name?.trim().toLowerCase() !== 'you'}<span class="meta grade">you</span>{/if}
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

  {#if spec}
    <section class="group">
      <h3>Specialization</h3>
      <article class="treasury">
        <p class="meta first">
          {spec.skillId ? `Specialized in ${skillName(spec.skillId)}.` : 'Not specialized yet.'}
          Switching costs <span class="gold">{spec.cost}g</span>; your old skill is capped at level {spec.capLevel} and keeps its XP.
        </p>
        <p class="meta">
          {cooldown.ready ? 'Ready to switch.' : `Next switch in ${cooldown.text}.`} You have <span class="gold">{gold}g</span>.
        </p>
        <div class="row sub">
          <select bind:value={pickSkill} aria-label="New specialization">
            <option value="">Choose a skill</option>
            {#each skillList.filter((k) => k.id !== spec.skillId) as k (k.id)}<option value={k.id}>{k.name}</option>{/each}
          </select>
          <button type="button" class="action-btn" disabled={!pickSkill || !cooldown.ready || gold < spec.cost} onclick={doSwitch}>Switch</button>
        </div>
        {#if msg}<p class="meta">{msg}</p>{/if}
      </article>
    </section>
  {/if}
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
{:else if sub === 'contracts'}
  <section class="group">
    <h3>Town contracts</h3>
    <article class="treasury">
      <div class="totals">
        <div><dt>Crew gold</dt><dd>{Math.floor(cg.total)}g</dd></div>
        <div><dt>Reputation</dt><dd class="rep">{rep}</dd></div>
      </div>
      <p class="meta">Items you hand in go to the crew stock for raids. Gold is paid from the crew treasury.</p>
      {#if msg}<p class="meta">{msg}</p>{/if}
    </article>
  </section>
  <section class="group">
    {#if contracts.length === 0}
      <p class="muted">No contracts posted. Check back when the next raid is announced.</p>
    {:else}
      <ul class="list">
        {#each contracts as c (c.id)}
          {@const mx = maxFill(c)}
          <li>
            <div class="row">
              <span class="name">{c.itemName ?? itemName(c.itemId)}{c.minGrade ? ` (grade ${c.minGrade}+)` : ''}</span>
              <span class="meta">{c.filled}/{c.qty}</span>
            </div>
            <p class="meta">
              {payLabel(c)}: {c.pays === 'reputation' ? `${c.repPer} rep` : c.pays === 'gold' ? `${c.rewardPer}g` : `${c.rewardPer}g, then ${c.repPer} rep`} each
              · You have {c.have}{c.vaultHas ? ` · Crew has ${c.vaultHas}` : ''}
            </p>
            {#if c.note}<p class="meta">{c.note}</p>{/if}
            {#if c.status === 'open'}
              <div class="row sub">
                <input type="number" min="1" max={mx || 1} value={qtyFor(c)} disabled={!c.canFill?.ok || mx < 1}
                  oninput={(e) => (fillQty[c.id] = Number((e.target as HTMLInputElement).value))} aria-label="Quantity" />
                <button type="button" class="action-btn" disabled={!c.canFill?.ok || mx < 1} title={c.canFill?.reason ?? ''} onclick={() => fill(c)}>Fill</button>
              </div>
              {#if !c.canFill?.ok && c.canFill?.reason}<p class="meta">{c.canFill.reason}</p>{/if}
            {:else}
              <p class="meta">{c.status === 'filled' ? 'Filled.' : 'Closed.'}</p>
            {/if}
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
        <div><dt>Crew gold</dt><dd>{Math.floor(cg.total)}g</dd></div>
        <div><dt>Free / escrowed</dt><dd>{Math.floor(cg.free)}g / {Math.floor(cg.escrowed)}g</dd></div>
      </div>
      <p class="meta">All movements are logged below for every crewmate to see.</p>
    </article>
  </section>

  <section class="group">
    <h3>Ledger</h3>
    {#if log.length === 0}
      <p class="muted">No activity yet. Entries will appear here as the crew earns, deposits or pays out.</p>
    {:else}
      <ul class="list">
        {#each log as entry}
          <li>
            <div class="row">
              <span class="name">{#if entry.itemId || entry.uid}{entry.qty < 0 ? '−' : '+'} {rowText(entry)}{:else}{entry.who ?? 'Crew'}{/if}</span>
              {#if entry.delta}
                <span class={`delta ${entry.delta > 0 ? 'pos' : 'neg'}`}>
                  {entry.delta > 0 ? '+' : ''}{entry.delta}g
                </span>
              {/if}
            </div>
            <p class="meta">{fmtAt(entry.t ?? entry.at)} · {entry.itemId || entry.uid ? `${entry.who ?? 'Crew'} · ` : ''}{entry.reason ?? entry.kind}</p>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

<style>
  .subs {
    display: grid; grid-template-columns: repeat(4, 1fr);
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

  .gold, .rep { color: var(--brass); }
  .meta.first { margin-top: 0; }
  select, input[type="number"] {
    min-width: 0; padding: 6px 8px; border: 1px solid var(--rule); background: var(--sunk); color: var(--ink);
    font: 400 var(--t-sm)/1.2 var(--f-body);
  }
  select { flex: 1; }
  input[type="number"] { width: 80px; }
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
