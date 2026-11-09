<script lang="ts">
  import { engine } from '../engine/store.svelte';
  import { engineClient } from '../engine/client';
  import { DATA, H } from '@guildwright/engine';
  import { ui } from '../ui.svelte';
  import { toast } from '../overlays/toast.svelte';
  import RequestSheet from '../overlays/RequestSheet.svelte';
  
  import { markDone } from '../guide.svelte';
  import { fmtG, fmtN } from '../format';
  import { askNumber, confirmSheet, noticeSheet } from '../overlays/confirm.svelte';

  let sub = $state<'roster' | 'jobs' | 'contracts' | 'treasury'>('roster');
  $effect(() => { if (ui.crewSub) { sub = ui.crewSub; ui.crewSub = null; } });
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
  const skillList: { id: string; name: string }[] = (DATA as any).skills;
  const skillName = (id: string) => skillList.find((k) => k.id === id)?.name ?? id;
  let pickSkill = $state('');
  let msg = $state('');
  const itemsMap: Record<string, { name?: string }> = (DATA as any).items;
  const itemRarity: Record<string, string> = (DATA as any).itemRarity ?? {};
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
    return Math.max(0, Math.min(c.remaining ?? 0, c.have ?? 0, c.capacity ?? Infinity));
  }
  async function fill(c: any) {
    msg = '';
    const mx = maxFill(c);
    if (mx < 1) return;
    const qty = await askNumber({
      title: `Hand in ${c.itemName ?? itemName(c.itemId)}`,
      body: `${fmtG(c.rewardPer)} each, paid by ${c.paidBy}. Items go to the crew stock for raids.`,
      number: { min: 1, max: mx, value: mx, label: 'How many?', lines: (n) => [`You get ${fmtG(n * c.rewardPer)}`] },
      confirmLabel: 'Hand in',
    });
    if (qty == null) return;
    try {
      const res = await engineClient.fillContract(c.id, qty);
      if (res && res.ok === false) { await noticeSheet('Could not fill', res.reason); }
      else if (res) { toast(`Handed in ${res.accepted ?? qty}${res.gold ? `, +${fmtG(res.gold)}` : ''}`); }
    } catch (err) { console.error('fillContract failed', err); }
  }
  async function doSwitch() {
    if (!pickSkill || !spec) return;
    const first = spec.firstPickFree;
    const ok = await confirmSheet({
      title: `Specialize in ${skillName(pickSkill)}?`,
      body: `${first ? 'Free.' : `Costs ${fmtG(spec.cost)}.`} ${spec.skillId ? `${skillName(spec.skillId)} drops to level ${spec.capLevel} (XP kept). ` : ''}You can't switch again for a week.`,
      confirmLabel: first ? 'Specialize' : `Pay ${fmtG(spec.cost)}`,
    });
    if (!ok) return;
    try {
      const res = await engineClient.switchSpec(pickSkill);
      msg = res && res.ok === false ? (res.reason || 'Could not switch.') : `Specialized in ${skillName(pickSkill)}.`;
      if (!res || res.ok !== false) pickSkill = '';
    } catch (err) { console.error('switchSpec failed', err); }
  }
  const GRADES = ['Any grade', 'Fine+', 'Sharp+', 'Keen+', 'Pristine'];
  let requestOpen = $state(false);
  const sortedContracts = $derived([...contracts].sort((x, y) => Number(!!y.canFill?.ok) - Number(!!x.canFill?.ok)));
  async function cancelRequest(c: any) {
    msg = '';
    try {
      const res = await engineClient.cancelCrewRequest(c.id);
      msg = res && res.ok === false ? (res.reason || 'Could not cancel.') : `Cancelled. ${fmtG(res?.refunded ?? 0)} refunded.`;
    } catch (err) { console.error('cancelCrewRequest failed', err); }
  }
  function rowText(e: any): string {
    const q = e.qty ? Math.abs(e.qty) : 1;
    if (e.gear || e.uid) return gearNames[e.uid] ?? e.reason ?? 'Gear';
    return `${itemName(e.itemId)} × ${q}`;
  }

  async function assist(jobId: string) {
    try {
      const res = await engineClient.assistJob(jobId);
      if (res && res.ok === false) await noticeSheet('Could not assist', res.reason);
      else markDone('assist');
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
        </p>
        {#if !spec.skillId && (spec.eligible ?? []).length === 0}
          <p class="meta">Reach level {spec.capLevel} in a skill to specialise.</p>
        {:else}
          <p class="meta">
            {#if spec.firstPickFree}First pick is free.{:else}Switching costs <span class="brass num">{fmtG(spec.cost)}</span>{H > 0 ? ` (about ${Math.round(spec.cost / H)} h of work)` : ''}; your old skill is capped at level {spec.capLevel} and keeps its XP.{/if}
            {cooldown.ready ? '' : `Next switch in ${cooldown.text}.`} You have <span class="brass num">{fmtG(gold)}</span>.
          </p>
          <div class="row sub">
            <select bind:value={pickSkill} aria-label="New specialization" disabled={(spec.eligible ?? []).length === 0}>
              <option value="">{(spec.eligible ?? []).length === 0 ? 'No other skill at level ' + spec.capLevel : 'Choose a skill'}</option>
              {#each spec.eligible as id (id)}<option value={id}>{skillName(id)}</option>{/each}
            </select>
            <button type="button" class="btn" disabled={!pickSkill || !cooldown.ready || gold < spec.cost} onclick={doSwitch}>Switch</button>
          </div>
          {#if (spec.eligible ?? []).length === 0}<p class="meta">Reach level {spec.capLevel} in another skill to switch.</p>{/if}
        {/if}
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
              <span class="meta num">{j.done}/{j.qty}</span>
            </div>
            <div class="row sub">
              <span class="meta">ETA <span class="num">{fmtDuration(j.etaSec)}</span>{j.station ? ` · ${j.station}` : ''}</span>
              <button
                type="button"
                class="btn"
                data-guide="assist"
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
    <div class="group-head">
      <h3>Contracts</h3>
      <button type="button" class="btn" onclick={() => (requestOpen = true)}>+ Request</button>
    </div>
    <article class="treasury">
      <div class="totals">
        <div><dt>Crew gold</dt><dd>{fmtG(cg.total)}</dd></div>
        <div><dt>Your gold</dt><dd>{fmtG(gold)}</dd></div>
      </div>
      <p class="meta">Items you hand in go to the crew stock for raids. Town contracts pay from the crew treasury; crew requests pay from the poster's gold.</p>
      {#if msg}<p class="meta">{msg}</p>{/if}
    </article>
  </section>
  <section class="group">
    {#if contracts.length === 0}
      <p class="muted">No contracts posted. Check back when the next raid is announced.</p>
    {:else}
      <ul class="list">
        {#each sortedContracts as c (c.id)}
          {@const mx = maxFill(c)}
          {@const rar = itemRarity[c.itemId] ?? 'common'}
          {@const fundedTotal = (c.escrow ?? 0) + (c.filled ?? 0) * (c.rewardPer ?? 0)}
          <li>
            <div class="row">
              <span class="name" style:color={`var(--r-${rar})`}>{c.itemName ?? itemName(c.itemId)}{c.minGrade ? ` (${GRADES[c.minGrade] ?? `grade ${c.minGrade}+`})` : ''}</span>
              <span class="tag">{c.source === 'town' ? 'Town' : 'Crew'}</span>
            </div>
            <div class="pbar" role="progressbar" aria-label="Filled" aria-valuemin="0" aria-valuemax={c.qty} aria-valuenow={c.filled}><div style="width: {c.qty ? Math.round(c.filled / c.qty * 100) : 0}%"></div></div>
            <p class="meta"><span class="num">{fmtN(c.filled)}/{fmtN(c.qty)}</span> filled · <span class="brass num">{fmtG(c.rewardPer)}</span> each · paid by {c.paidBy} · you have <span class="num">{fmtN(c.have)}</span></p>
            {#if c.status === 'open' && fundedTotal > 0}
              <div class="pbar gold" role="progressbar" aria-label="Gold left" aria-valuemin="0" aria-valuemax={fundedTotal} aria-valuenow={c.escrow}><div style="width: {Math.round((c.escrow ?? 0) / fundedTotal * 100)}%"></div></div>
              <p class="meta"><span class="num">{fmtG(c.escrow ?? 0)}</span> of funded gold left</p>
            {/if}
            {#if c.note}<p class="meta">{c.note}</p>{/if}
            {#if c.status === 'open' && c.mine}
              <div class="row sub">
                <span class="meta">Your request</span>
                {#if c.canCancel}<button type="button" class="btn" onclick={() => cancelRequest(c)}>Cancel</button>{/if}
              </div>
            {:else if c.status === 'open'}
              <button type="button" class="btn primary wide" disabled={!c.canFill?.ok || mx < 1} title={c.canFill?.reason ?? ''} onclick={() => fill(c)}>
                <span class="num">Hand in {mx} (+{fmtG(mx * (c.rewardPer ?? 0))})</span>
              </button>
              {#if !c.canFill?.ok && c.canFill?.reason}<p class="meta">{c.canFill.reason}</p>{/if}
            {:else}
              <p class="meta">{c.status === 'filled' ? 'Filled.' : c.status === 'cancelled' ? 'Cancelled.' : 'Closed.'}</p>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
  {#if requestOpen}
    <RequestSheet {gold} onClose={() => (requestOpen = false)} onDone={(t) => { msg = t; toast(t); }} />
  {/if}
{:else}
  <section class="group">
    <h3>Treasury</h3>
    <article class="treasury">
      <div class="totals">
        <div><dt>Crew gold</dt><dd>{fmtG(cg.total)}</dd></div>
        <div><dt>Free / escrowed</dt><dd>{fmtG(cg.free)} / {fmtG(cg.escrowed)}</dd></div>
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
              {#if entry.delta || entry.gold}
                {@const sgn = entry.delta ? Math.sign(entry.delta) : entry.kind === 'contract-escrow' ? -1 : entry.kind === 'contract-release' ? 1 : 0}
                <span class={`delta ${sgn > 0 ? 'pos' : sgn < 0 ? 'neg' : 'plain'}`}>
                  {sgn > 0 ? '+' : sgn < 0 ? '−' : ''}{fmtG(Math.abs(entry.delta || entry.gold))}
                </span>
              {/if}
            </div>
            <p class="meta">{fmtAt(entry.t ?? entry.at)} · {entry.itemId || entry.uid ? `${entry.who ?? 'Crew'} · ` : ''}{entry.reason ?? entry.kind}{entry.paidBy && !(entry.reason ?? '').includes(entry.paidBy) ? ` · paid by ${entry.paidBy}` : ''}</p>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

<style>

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
  .totals dd { margin: 0; font-weight: 700; font-size: var(--t-md); line-height: 1; color: var(--brass); }

  .brass { color: var(--brass); font: inherit; }
  .tag { display: inline-block; margin-right: 6px; padding: 1px 5px; border: 1px solid var(--rule); background: var(--sunk); font: 400 var(--t-xs)/1.3 var(--f-label); letter-spacing: .04em; text-transform: uppercase; color: var(--ink-2); }
  .delta.plain { color: var(--ink-2); }
  .form { display: grid; gap: 10px; }
  .meta.first { margin-top: 0; }
  select { flex: 1; }
  .delta { font-weight: 700; font-size: var(--t-sm); line-height: 1; }
  .delta.pos { color: var(--ok); }
  .delta.neg { color: var(--bad); }

  .group-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
  .group-head h3 { margin: 0; }
  .wide { width: 100%; margin-top: 8px; }
  .pbar { height: 6px; margin-top: 6px; background: var(--sunk); border: 1px solid var(--rule); overflow: hidden; }
  .pbar div { height: 100%; background: var(--woad); }
  .pbar.gold div { background: var(--brass-fill); }
</style>
