<script lang="ts">
  import { fmtHpNow, fmtHpTotal } from '../engine/format';
  import ItemIcon from '../art/ItemIcon.svelte';
  import BossPortrait from '../scene/BossPortrait.svelte';
  import { DATA } from '@guildwright/engine';
  import { fmtG, fmtN, fmtDuration, hasPayout } from '../format';
  import { ui } from '../ui.svelte';
  import { askText, confirmSheet, noticeSheet } from '../overlays/confirm.svelte';
  import RaidRecap from '../overlays/RaidRecap.svelte';
  import Fight from './war/Fight.svelte';
  import Outfit from './war/Outfit.svelte';
  import Tools from './war/Tools.svelte';
  import { FIGHT_SLOTS, elementName } from './war/gearUi';
  import { engine } from '../engine/store.svelte';
  import { engineClient } from '../engine/client';

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

  let sub = $state<'loadout' | 'raid'>('loadout');
  let sec = $state<'fight' | 'outfit' | 'tools'>('fight');
  const SECS = [['fight', 'Fight'], ['outfit', 'Work outfit'], ['tools', 'Tools']] as const;
  let recapOpen = $state(false);
  $effect(() => { if (ui.warSub) { sub = ui.warSub; ui.warSub = null; } });
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
  const BOSS_TOTAL: number = ((DATA as any).bosses ?? []).length || 6;
  let prepPhase = $derived<'prep' | 'live' | 'recap'>(status?.prepPhase ?? 'prep');
  let readOnly = $derived(!!status?.prepLocked);
  let lockReason = $derived<string>(status?.prepReason ?? '');
  let locked = $derived(!!status?.locked);
  let bossNo = $derived((boss?.record?.index ?? 0) + 1);
  // While live the replay is partway through: show HP at the replay position, never the final HP.
  let liveHp = $derived<number | null>(prepPhase === 'live' ? (status?.liveContribution?.bossHpPct ?? null) : null);
  let hpFrac = $derived(liveHp ?? boss?.hpPct ?? 0);
  let dealt = $derived(1 - hpFrac);
  let cps = $derived<any[]>(boss?.checkpoints ?? []);
  let nextCp = $derived(cps.find((c) => !c.reached) ?? null);
  let chip = $derived.by(() => {
    if (!status) return '';
    if (status.phase === 'live') return `Closes in ${fmtDuration(status.secLeft)}`;
    if (status.phase === 'done') return status.nextRaidAt ? `Next raid in ${fmtDuration((status.nextRaidAt - Date.now()) / 1000)}` : 'Settled';
    return `Opens in ${fmtDuration(status.secToStart)}`;
  });
  let ready = $derived<any>((view?.extras as any)?.readiness ?? null);
  const ROLE_NAME: Record<string, string> = { guardian: 'Guardian', mender: 'Mender', striker: 'Striker' };
  let reqPower = $derived<number>(ready?.req ?? boss?.reqPower ?? 0);
  let bestPower = $derived<number>(ready?.best ?? stats?.power ?? 0);
  let readyFrac = $derived(reqPower > 0 ? Math.min(1, bestPower / reqPower) : 1);
  let readyOk = $derived<boolean>(ready ? !!ready.ok : bestPower >= reqPower);
  const ITEMS: Record<string, any> = (DATA as any).items;
  // Food the raid will use: what is already in the pouch, else what lock-in packs from the bag (healing food and potions).
  let foodList = $derived.by(() => {
    const tot = (a: number[] | undefined) => (a ?? []).reduce((x, y) => x + (y || 0), 0);
    const out: Array<{ id: string; name: string; qty: number }> = [];
    const pouch = (snap?.raid as any)?.pouch ?? {};
    const src = Object.keys(pouch).some((id) => tot(pouch[id]) > 0) ? pouch : (snap?.inv ?? {});
    for (const id of Object.keys(src)) {
      const it = ITEMS[id]; const n = tot(src[id]);
      if (!it || n <= 0 || (it.kind !== 'food' && it.kind !== 'potion')) continue;
      if (src === snap?.inv && !(it.heal > 0)) continue;
      out.push({ id, name: it.name, qty: n });
    }
    return out.sort((a, b) => b.qty - a.qty);
  });
  let foodFromPouch = $derived(Object.keys((snap?.raid as any)?.pouch ?? {}).some((id) => ((snap?.raid as any).pouch[id] ?? []).some((n: number) => n > 0)));
  let loadoutsOpen = $state(false);
  const stanceNow = $derived(STANCES.find((x) => x.id === rules.stance));
  const tacticNow = $derived(TACTICS.find((x) => x.id === rules.tactic));
  async function toggleLock() {
    try {
      const res = locked ? await engineClient.unlock() : await engineClient.lockIn();
      if (res && res.ok === false) await noticeSheet(locked ? 'Could not unlock' : 'Could not lock in', res.reason);
    } catch (err) { console.error('lock failed', err); }
  }
  async function equipLoadout2(id: string) {
    await equipLoadout(id);
  }

  async function saveCurrentGear() {
    const name = await askText({
      title: 'Save current gear',
      body: 'Give this loadout a name so you can swap back to it in one tap.',
      text: { value: `Loadout ${loadouts.length + 1}`, label: 'Loadout name', maxLength: 30 },
      confirmLabel: 'Save',
    });
    if (name == null) return;
    try { await engineClient.saveLoadout(name || undefined); }
    catch (err) { console.error('saveLoadout failed', err); }
  }
  async function equipLoadout(id: string) {
    try { await engineClient.equipLoadout(id); }
    catch (err) { console.error('equipLoadout failed', err); }
  }
  async function deleteLoadout(id: string, name: string) {
    if (!(await confirmSheet({ title: `Delete "${name}"?`, body: 'This loadout is removed. Your worn gear is not affected.', confirmLabel: 'Delete', danger: true }))) return;
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
  <button type="button" aria-current={sub === 'raid' ? 'page' : undefined} onclick={() => (sub = 'raid')}>Raid</button>
</nav>

{#if sub === 'loadout'}
  <div class="seg sec" role="group" aria-label="Gear section">
    {#each SECS as [id, label]}<button type="button" class="btn" aria-pressed={sec === id} onclick={() => (sec = id)}>{label}</button>{/each}
  </div>
  {#if sec === 'fight'}
  <Fight />

  <details class="group saved" bind:open={loadoutsOpen}>
    <summary><h3>Saved loadouts <span class="num">({loadouts.length})</span></h3></summary>
    <div class="group-head">
      <p class="meta">Save what you wear now to swap back in one tap.</p>
      <button type="button" class="btn" onclick={saveCurrentGear}>Save current gear</button>
    </div>
    {#if loadouts.length === 0}
      <p class="muted">No loadouts yet. Wear a set you like, then tap Save current gear.</p>
    {:else}
      <ul class="list">
        {#each loadouts as l (l.id)}
          <li>
            <div class="row">
              <span class="name">{l.name}</span>
              <span class="meta"><span class="num">{FIGHT_SLOTS.filter((s) => l.slots?.[s]).length}/8</span> pieces</span>
            </div>
            <div class="row actions">
              <button type="button" class="btn" onclick={() => equipLoadout2(l.id)}>Equip</button>
              <button type="button" class="btn ghost" onclick={() => deleteLoadout(l.id, l.name)}>Delete</button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </details>
  {:else if sec === 'outfit'}
    <Outfit />
  {:else}
    <Tools />
  {/if}
{:else}
  <section class="group">
    {#if boss}
      <article class="hero">
        <div class="hero-top">
          {#if boss.revealed && boss.boss?.id}<BossPortrait bossId={boss.boss.id} name={boss.name} />{:else}<div class="portrait" aria-hidden="true"><ItemIcon named="skull" size={64} silhouette /></div>{/if}
          <div class="hero-id">
            <span class="boss-name">{boss.name}</span>
            <span class="meta">Boss <span class="num">{bossNo}</span> of <span class="num">{BOSS_TOTAL}</span>{boss.title && !/^boss\s*\d/i.test(boss.title) ? ` · ${boss.title}` : ''}</span>
            <div class="chips">
              {#if boss.weakTo}<span class="chip">Weak to {elementName(boss.weakTo)}</span>{/if}
              {#if chip}<span class="chip pri num">{chip}</span>{/if}
            </div>
          </div>
        </div>
        <div class="bar" role="progressbar" aria-label="Boss HP" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(hpFrac * 100)}>
          <div class="fill" style="width: {Math.round(hpFrac * 100)}%"></div>
          {#each cps as c}<i class="tick" style="left: {Math.round((1 - c.at) * 100)}%"></i>{/each}
        </div>
        <p class="meta">HP <span class="num">{fmtN(Math.max(0, hpFrac * boss.maxHp))} / {fmtN(boss.maxHp)}</span>{#if boss.reqPower}{' '}· Req power <span class="num">{fmtN(Math.round(boss.reqPower))}</span>{/if}</p>
        {#if boss.weakTo}<p class="meta">Wear gear with {elementName(boss.weakTo)} damage to hit its weak spot for extra damage.</p>{/if}
        {#if cps.length}
          <p class="meta">Bonus chests open as the crew wears the boss down.</p>
          <ul class="chests">
            {#each cps as c}
              {@const got = liveHp != null ? dealt >= c.at - 1e-9 : c.reached}
              {@const st = got ? 'claimed' : c === (liveHp != null ? cps.find((x) => dealt < x.at - 1e-9) : nextCp) ? 'next' : 'locked'}
              <li class={st}>
                <span class="num">{Math.round(c.at * 100)}%</span>
                <small>{st === 'claimed' ? 'Chest claimed' : st === 'next' ? `${Math.max(1, Math.ceil((c.at - dealt) * 100))}% more damage to open` : 'Not reached yet'}</small>
              </li>
            {/each}
          </ul>
        {/if}
        {#if boss.phases?.length}
          <ol class="phases">{#each boss.phases as p}<li>{p.name}{p.label ? ` · ${p.label}` : ''}</li>{/each}</ol>
        {/if}
        {#if prepPhase === 'live' && status}
          <p class="meta">Raid progress <span class="num">{pct(status.fightPct ?? 0)}</span></p>
          {#if status.liveContribution}
            {@const lc = status.liveContribution}
            <div class="live">
              <p class="line"><span>Your contribution</span><b class="num">{pct(lc.share)}</b></p>
              <div class="bar sm" role="progressbar" aria-label="Your contribution" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(lc.share * 100)}><div class="fill woad" style="width: {Math.min(100, Math.round(lc.share * 100))}%"></div></div>
              <p class="meta">Tier so far: <b>{lc.tierLabel}</b></p>
            </div>
          {/if}
          {#if status.sittingOut}
            <p class="meta">You joined after this raid opened. You'll join next weekend's raid.{#if status.nextRaidAt} Next raid opens in <span class="num">{fmtDuration((status.nextRaidAt - Date.now()) / 1000)}</span>.{/if}</p>
          {/if}
        {/if}
      </article>
    {:else}
      <p class="muted">No current boss.</p>
    {/if}
  </section>

  {#if prepPhase === 'recap'}
    <section class="group">
      {#if recap}
        <button type="button" class="btn primary wide" onclick={() => (recapOpen = true)}>See recap</button>
      {:else}
        <p class="muted">This week's raid is settled.</p>
      {/if}
    </section>
  {:else}
    {#if readOnly}<p class="lock-note">{lockReason || 'Raid prep is locked while the raid runs.'}</p>{/if}
    <section class="group">
      <h3>Your readiness</h3>
      <article class="ready" class:ok={readyOk}>
        <p class="power"><span>Your power <b class="num">{fmtN(Math.round(bestPower))}</b></span><span>needs <b class="num">{fmtN(Math.round(reqPower))}</b></span></p>
        <div class="bar sm" role="progressbar" aria-label="Your power against the power needed" aria-valuemin="0" aria-valuemax={Math.round(reqPower)} aria-valuenow={Math.round(Math.min(bestPower, reqPower))}><div class="fill {readyOk ? 'okf' : 'woad'}" style="width: {Math.round(readyFrac * 100)}%"></div></div>
        <p class="meta">{#if ready?.bestRole}Counted as a <b>{ROLE_NAME[ready.bestRole] ?? ready.bestRole}</b>, your strongest role with this gear. {/if}{readyOk ? 'You are strong enough for this boss.' : 'You are under-powered for this boss. Better gear helps.'}</p>
        {#if ready?.tips?.length}<ul class="tips">{#each ready.tips as t}<li>{t}</li>{/each}</ul>{/if}
      </article>
      {#if stats}
        <dl class="stats">
          <div><dt>HP</dt><dd class="num">{fmtHpNow(hp, stats.maxHp)} / {fmtHpTotal(stats.maxHp)}</dd></div>
          <div><dt>Attack</dt><dd class="num">{fmtN(Math.round(stats.atk))}</dd></div>
          <div><dt>Defence</dt><dd class="num">{fmtN(Math.round(stats.def))}</dd></div>
          <div><dt>Heal</dt><dd class="num">{fmtN(Math.round(stats.heal))}</dd></div>
        </dl>
      {/if}
      <button type="button" class="btn next" onclick={() => (sub = 'loadout')}>Change gear</button>
    </section>

    <section class="group">
      <h3>Stance</h3>
      <div class="seg" role="group" aria-label="Stance">
        {#each STANCES as s (s.id)}<button type="button" class="btn" aria-pressed={rules.stance === s.id} disabled={readOnly} onclick={() => pickStance(s.id)}>{s.label}</button>{/each}
      </div>
      {#if stanceNow}<p class="meta">{stanceNow.blurb}</p>{/if}
    </section>

    <section class="group">
      <h3>Tactic</h3>
      <div class="seg" role="group" aria-label="Tactic">
        {#each TACTICS as t (t.id)}<button type="button" class="btn" aria-pressed={rules.tactic === t.id} disabled={readOnly} onclick={() => pickTactic(t.id)}>{t.label}</button>{/each}
      </div>
      {#if tacticNow}<p class="meta">{tacticNow.blurb}</p>{/if}
    </section>

    <section class="group">
      <h3>Eat threshold</h3>
      <p class="meta">Eat food when your HP drops below this.</p>
      <div class="slider">
        <input type="range" aria-label="Eat threshold" min="30" max="80" step="5" value={Math.round(rules.eatAt * 100)} disabled={readOnly} oninput={pickEatAt} />
        <span class="slider-val num">{Math.round(rules.eatAt * 100)}%</span>
      </div>
      {#if foodList.length}
        <p class="meta">{foodFromPouch ? 'Packed for the raid' : 'Lock in packs your best healing food from the bag'}: {#each foodList as f, i}{i ? ', ' : ''}{f.name} <span class="num">×{fmtN(f.qty)}</span>{/each}.</p>
      {:else}
        <p class="meta">You have no food to eat. Cook some (try Bread) in the Workshop before the raid, or you will faint when your HP runs out.</p>
        <button type="button" class="btn next" onclick={() => (ui.goTab = 'Workshop')}>Go to the Workshop</button>
      {/if}
    </section>

    {#if prepPhase === 'prep'}
      <button type="button" class="btn wide" data-guide="lock" class:primary={!locked} onclick={toggleLock}>{locked ? 'Locked in. Tap to unlock' : 'Lock in'}</button>
      <p class="meta center">{locked ? 'Your gear, stance, tactic and food are sealed for this raid. Unlock to change them.' : 'Lock in seals your gear, stance, tactic and food, and packs your food. Doing it early lets you see warnings (like no food) while you can still fix them. You can unlock until the raid opens; if you do nothing, you are locked in automatically when it opens.'}</p>
    {:else}
      <p class="meta center">{locked ? 'You are locked in for this raid.' : 'You were locked in automatically.'}</p>
    {/if}
  {/if}
{/if}

{#if recapOpen && recap}
  <RaidRecap {recap} view={view?.extras?.lastRecapView ?? null} onClose={() => (recapOpen = false)} />
{/if}

<style>
  .group + .group, .group + .lock-note, .lock-note + .group { margin-top: 16px; }
  .group h3 {
    margin: 0 0 8px; font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3);
    letter-spacing: .08em; text-transform: uppercase;
  }
  .group-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
  .muted { margin: 0; padding: 12px; background: var(--paper); border: 1px solid var(--rule); color: var(--ink-3); font-size: var(--t-sm); }
  .meta { margin: 4px 0 0; color: var(--ink-3); font-size: var(--t-xs); }
  .meta.center { text-align: center; }
  .lock-note { margin: 0 0 8px; padding: 10px 12px; background: var(--woad-soft); border: 1px solid var(--woad); color: var(--ink); font-size: var(--t-sm); }
  .wide { width: 100%; margin-top: 12px; }
  .btn.dim { opacity: .5; }

  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .list li { padding: 10px 12px; background: var(--paper); border: 1px solid var(--rule); }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .row.actions { margin-top: 8px; }
  .name { font: 500 var(--t-sm)/1.1 var(--f-body); color: var(--ink); }

  .hero { padding: 12px; background: var(--paper); border: 1px solid var(--rule); }
  .hero-top { display: flex; gap: 12px; align-items: flex-start; }
  .portrait { flex: none; width: 64px; height: 64px; display: grid; place-items: center; background: var(--sunk); border: 2px solid var(--r-mythic); }
  .hero-id { min-width: 0; display: grid; gap: 4px; }
  .boss-name { font: 600 var(--t-lg)/1.1 var(--f-display); color: var(--ink); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { padding: 3px 8px; border: 1px solid var(--rule); background: var(--sunk); font: 700 var(--t-xs)/1.2 var(--f-body); color: var(--ink-2); }
  .chip.pri { border-color: var(--woad); color: var(--woad); background: var(--woad-soft); }
  .bar { position: relative; height: 12px; margin-top: 12px; background: var(--sunk); border: 1px solid var(--rule); overflow: hidden; }
  .bar .fill { height: 100%; background: var(--hp); transition: width 200ms linear; }
  .live { margin-top: 8px; display: grid; gap: 4px; }
  .line { margin: 0; display: flex; justify-content: space-between; }
  .bar.sm { height: 8px; margin-top: 0; }
  .fill.woad { background: var(--woad); }
  .tick { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--ink); opacity: .6; }
  .chests { list-style: none; margin: 8px 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 6px; }
  .chests li { padding: 6px 8px; border: 1px solid var(--rule); background: var(--sunk); display: grid; gap: 2px; font-weight: 700; }
  .chests small { font-weight: 400; color: var(--ink-3); font-size: var(--t-xs); }
  .chests li.claimed { border-color: var(--ok); } .chests li.claimed small { color: var(--ok); }
  .chests li.next { border-color: var(--woad); background: var(--woad-soft); } .chests li.next small { color: var(--woad); }
  .chests li.locked { opacity: .6; }
  .phases { margin: 8px 0 0; padding-left: 18px; font-size: var(--t-sm); color: var(--ink-2); }

  .stats { margin: 0; display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
  .stats div { padding: 6px 8px; background: var(--sunk); border: 1px solid var(--rule); display: grid; gap: 3px; }
  .stats dt { margin: 0; font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3); letter-spacing: .04em; text-transform: uppercase; }
  .stats dd { margin: 0; font-weight: 700; font-size: var(--t-md); line-height: 1; color: var(--ink); }
  .ready { padding: 12px; background: var(--paper); border: 1px solid var(--rule); }
  .ready.ok { border-color: var(--ok); }
  .power { margin: 0 0 8px; display: flex; justify-content: space-between; align-items: baseline; gap: 8px; color: var(--ink-2); font-size: var(--t-sm); }
  .power b { font-size: var(--t-xl); color: var(--ink); }
  .ready .bar { margin-top: 0; }
  .fill.okf { background: var(--ok); }
  .tips { margin: 6px 0 0; padding-left: 18px; font-size: var(--t-sm); color: var(--ink-2); }
  .stats { margin-top: 8px; }
  .saved { margin-top: 16px; padding: 0; }
  .saved summary { list-style: none; cursor: pointer; min-height: 44px; display: flex; align-items: center; }
  .saved summary::-webkit-details-marker { display: none; }
  .saved summary h3 { margin: 0; }
  .saved summary::before { content: '▸'; margin-right: 8px; color: var(--ink-3); }
  .saved[open] summary::before { content: '▾'; }
  .next { margin-top: 8px; }
  .m { height: 4px; background: var(--paper); border: 1px solid var(--rule); display: block; overflow: hidden; }

  .seg.sec { margin-bottom: 12px; }
  .seg { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 0; }
  .seg .btn { padding: 8px 4px; border-left-width: 0; }
  .seg .btn:first-child { border-left-width: 1px; }
  .seg .btn:disabled[aria-pressed="true"] { opacity: .85; }
  .slider { display: flex; align-items: center; gap: 12px; }
  .slider input { flex: 1; min-height: 44px; }
  .slider-val { font-weight: 700; font-size: var(--t-md); line-height: 1; color: var(--ink); min-width: 48px; text-align: right; }
</style>
