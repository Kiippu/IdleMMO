<script lang="ts">
  // War Room > Loadout > Tools: one tool per work skill, used automatically. Condition, wear penalty, repair, swap.
  import ItemIcon from '../../art/ItemIcon.svelte';
  import { DATA } from '@guildwright/engine';
  import { engine } from '../../engine/store.svelte';
  import { engineClient } from '../../engine/client';
  import { openItem } from '../../overlays/itemRef.svelte';
  import { fmtG } from '../../format';
  import { ui } from '../../ui.svelte';
  import { workDeltaChips, fmtEffect, lineText, repairCostGuess, wearOf } from './gearUi';

  const GROUPS: Array<{ name: string; skills: string[] }> = [
    { name: 'Gathering', skills: ['mining', 'woodcutting', 'herbalism', 'fishing'] },
    { name: 'Refining', skills: ['smelting', 'carpentry', 'tanning', 'weaving'] },
    { name: 'Crafting', skills: ['smithing', 'woodworking', 'leatherworking', 'tailoring', 'jewelcrafting', 'alchemy', 'cooking'] },
  ];
  const items: Record<string, any> = (DATA as any).items;
  const skillName = (id: string) => ((DATA as any).skills as any[] | undefined)?.find((s) => s.id === id)?.name ?? id[0].toUpperCase() + id.slice(1);

  let snap = $derived(engine.snapshot);
  let view = $derived(engine.derived);
  let extras = $derived<any>(view?.extras ?? {});
  let bag = $derived<any[]>(snap?.gear ?? []);
  let tools = $derived<Record<string, string | null>>(snap?.tools ?? {});
  let gold = $derived(Math.floor(snap?.gold ?? 0));
  let all = $derived<{ count: number; gold: number }>(extras.toolRepair ?? { count: 0, gold: 0 });
  const nameOf = (g: any) => view?.gearNames?.[g.uid] ?? items[g.itemId]?.name ?? g.itemId;
  const info = (uid: string) => extras.gearInfo?.[uid] ?? {};
  const condOf = (g: any) => Math.round(info(g.uid).cond ?? g.cond ?? 100);
  const repairOf = (g: any) => info(g.uid).repairGold ?? repairCostGuess(condOf(g), items[g.itemId]?.tier ?? 1);
  const effOf = (g: any) => {
    const l: any[] = info(g.uid).effectLines ?? [];
    if (l.length) return l.map((x) => lineText(x)).join(', ');
    return (items[g.itemId]?.effects ?? []).map((e: any) => fmtEffect(e.id, e.value)).join(', ');
  };
  const rowOf = (skill: string) => { const uid = tools[skill]; return uid ? bag.find((g) => g.uid === uid) ?? null : null; };
  const spareFor = (skill: string) => bag.filter((g) => items[g.itemId]?.section === 'tool' && items[g.itemId].toolSkill === skill && g.uid !== tools[skill]);

  let open = $state<string | null>(null);
  let msg = $state(''); let msgBad = $state(false);
  const say = (t: string, bad = false) => { msg = t; msgBad = bad; };

  async function repair(g: any) {
    const cost = repairOf(g);
    if (cost > gold) { say(`Repairing ${nameOf(g)} costs ${fmtG(cost)} and you have ${fmtG(gold)}.`, true); return; }
    try {
      const res: any = await engineClient.repair(g.uid);
      if (res && res.ok === false) { say(res.reason || 'Could not repair.', true); return; }
      say(`Repaired ${nameOf(g)} for ${fmtG(res?.gold ?? cost)}.`);
    } catch (e) { console.error(e); say('Could not repair.', true); }
  }
  async function repairAll() {
    if (all.gold > gold) { say(`Repairing everything costs ${fmtG(all.gold)} and you have ${fmtG(gold)}.`, true); return; }
    try {
      const res: any = await engineClient.repairAllTools();
      if (res && res.ok === false) { say(res.reason || 'Could not repair.', true); return; }
      say(`Repaired ${res?.count ?? all.count} ${(res?.count ?? all.count) === 1 ? 'tool' : 'tools'} for ${fmtG(res?.gold ?? all.gold)}.`);
    } catch (e) { console.error(e); say('Could not repair.', true); }
  }
  async function swapIn(g: any) {
    const chips = workDeltaChips(extras.workDeltas?.[g.uid]);
    try {
      const res: any = await engineClient.equip(g.uid);
      if (res && res.ok === false) { say(res.reason || 'Could not equip.', true); return; }
      say(`Now using ${nameOf(g)}.${chips.length ? ` ${chips.map((c) => c.text).join(', ')}.` : ''}`); open = null;
    } catch (e) { console.error(e); say('Could not equip.', true); }
  }
</script>

<p class="help">Each skill uses its own tool automatically. Tools never break, but they slow you down when worn.</p>
<div class="top">
  <button type="button" class="btn" aria-disabled={all.count === 0} class:dim={all.count === 0} onclick={() => { if (all.count > 0) repairAll(); else say('Every tool is at full condition.'); }}>Repair all ({fmtG(all.gold)})</button>
</div>
<p class="fb" class:bad={msgBad} role="status" aria-live="polite">{msg}</p>

{#each GROUPS as grp (grp.name)}
  <section class="grp">
    <h3>{grp.name}</h3>
    <ul class="rows">
      {#each grp.skills as skill (skill)}
        {@const g = rowOf(skill)}
        {@const spare = spareFor(skill)}
        <li class="card" class:open={open === skill}>
          <div class="row">
            <button type="button" class="main" aria-expanded={open === skill} aria-label="{skillName(skill)} tool{g ? `: ${nameOf(g)}` : ': none'}. Tap to swap" onclick={() => (open = open === skill ? null : skill)} style:--ink-r={g ? `var(--r-${g.rarity})` : undefined}>
              {#if g}<ItemIcon id={g.itemId} rarity={g.rarity} />{:else}<span class="ph" aria-hidden="true">·</span>{/if}
              <span class="info">
                <span class="sk">{skillName(skill)}</span>
                {#if g}
                  {@const c = condOf(g)}
                  {@const w = info(g.uid).wear ?? wearOf(c)}
                  <span class="name">{nameOf(g)} <span class="meta">T{items[g.itemId]?.tier}</span></span>
                  <span class="eff num">{effOf(g)}</span>
                  <span class="cond"><span class="bar" role="progressbar" aria-label="Condition" aria-valuemin="0" aria-valuemax="100" aria-valuenow={c}><span class="fill" class:low={c < 50} style="width: {c}%"></span></span><b class="num">{c}%</b>{#if w > 0}<span class="pen num">−{w}% speed</span>{/if}</span>
                {:else}
                  <span class="meta">No tool. Buy or craft one{spare.length ? ', or pick one below' : ''}.</span>
                {/if}
              </span>
            </button>
            {#if g}
              {@const c = condOf(g)}
              <button type="button" class="btn rep" aria-disabled={c >= 100} class:dim={c >= 100} aria-label="Repair {nameOf(g)}{c < 100 ? `, ${fmtG(repairOf(g))}` : ', not needed'}" onclick={() => { if (c < 100) repair(g); else say(`${nameOf(g)} is at full condition.`); }}>{c >= 100 ? 'Full' : `Repair ${fmtG(repairOf(g))}`}</button>
            {/if}
          </div>
          {#if open === skill}
            <div class="pick">
              {#if g}<button type="button" class="btn ghost det" onclick={() => openItem({ itemId: g.itemId, uid: g.uid })}>Details for {nameOf(g)}</button>{/if}
              {#if spare.length === 0}
                <p class="meta">No other {skillName(skill).toLowerCase()} tools in your bag. Buy an Uncommon one in the Shop or craft one.</p>
                <button type="button" class="btn ghost" onclick={() => (ui.goTab = 'Shop')}>Open the Shop</button>
              {:else}
                <p class="meta">Swap in a tool from your bag:</p>
                <ul class="spare">
                  {#each spare as s (s.uid)}
                    {@const dl = workDeltaChips(extras.workDeltas?.[s.uid])}
                    <li>
                      <button type="button" class="swap" onclick={() => swapIn(s)} aria-label="Use {nameOf(s)}" style:--ink-r={`var(--r-${s.rarity})`}>
                        <ItemIcon id={s.itemId} rarity={s.rarity} />
                        <span class="info">
                          <span class="name">{nameOf(s)} <span class="meta">T{items[s.itemId]?.tier} · {condOf(s)}%</span></span>
                          <span class="eff num">{effOf(s)}</span>
                          <span class="deltas">{#each dl as d}<span class="d num" class:up={d.d > 0} class:down={d.d < 0}>{d.text}</span>{/each}</span>
                        </span>
                      </button>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{/each}

<style>
  .help { margin: 0 0 8px; color: var(--ink-2); font-size: var(--t-sm); }
  .top { margin-bottom: 4px; }
  .top .btn { width: 100%; }
  .dim { opacity: .5; }
  .fb { margin: 6px 0 8px; min-height: 1.3em; color: var(--ok); font-size: var(--t-sm); font-weight: 700; }
  .fb.bad { color: var(--bad); }
  .grp + .grp { margin-top: 12px; }
  h3 { margin: 0 0 6px; font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3); letter-spacing: .08em; text-transform: uppercase; }
  .rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .rows > li.open { background: var(--woad-soft); }
  .row { display: flex; align-items: stretch; }
  .main { flex: 1; min-width: 0; min-height: 64px; display: flex; align-items: flex-start; gap: 10px; padding: 0; background: none; border: 0; text-align: left; color: var(--ink); }
  .ph { width: 32px; height: 32px; display: grid; place-items: center; border: 1px dashed var(--rule); color: var(--ink-3); }
  .info { display: grid; gap: 2px; min-width: 0; flex: 1; }
  .sk { font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3); letter-spacing: .06em; text-transform: uppercase; }
  .name { font: 700 var(--t-sm)/1.15 var(--f-body); color: var(--ink-r, var(--ink)); }
  .meta { margin: 0; color: var(--ink-3); font: 400 var(--t-xs)/1.3 var(--f-body); }
  .eff { font: 700 var(--t-xs)/1.2 var(--f-num); color: var(--ink-2); }
  .cond { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .bar { position: relative; width: 72px; height: 8px; background: var(--sunk); border: 1px solid var(--rule); overflow: hidden; flex: none; }
  .fill { display: block; height: 100%; background: var(--ok); }
  .fill.low { background: var(--bad); }
  .cond b { font: 700 var(--t-xs)/1 var(--f-num); color: var(--ink); }
  .pen { padding: 1px 5px; border: 1px solid var(--bad); color: var(--bad); font: 700 var(--t-xs)/1.3 var(--f-num); }
  .rep { flex: none; align-self: center; margin: 0 0 0 8px; min-width: 84px; padding: 0 8px; white-space: nowrap; }
  .pick { padding: 8px 0 0; display: grid; gap: 6px; }
  .det { width: 100%; }
  .spare { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .swap { width: 100%; min-height: 52px; display: flex; align-items: center; gap: 10px; padding: 6px 8px; background: var(--sunk); border: 1px solid var(--rule); border-left: 3px solid var(--ink-r); text-align: left; color: var(--ink); }
  .swap:hover { background: var(--woad-soft); }
  .deltas { display: flex; flex-wrap: wrap; gap: 4px 8px; }
  .d { font: 700 var(--t-xs)/1.2 var(--f-num); }
  .d.up { color: var(--ok); } .d.down { color: var(--bad); }
</style>
