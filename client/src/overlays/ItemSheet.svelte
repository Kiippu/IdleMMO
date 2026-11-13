<script lang="ts">
  import { fmtHpAmount } from '../engine/format';
  import { untrack } from 'svelte';
  import ItemIcon from '../art/ItemIcon.svelte';
  // The one item sheet: what it is, how it is made, where it comes from, what uses it, and what you can do with it.
  import { DATA } from '@guildwright/engine';
  import { engine } from '../engine/store.svelte';
  import { engineClient } from '../engine/client';
  import { fmtG, fmtN, fmtSecs } from '../format';
  import { itemSheet, openItem, closeItem } from './itemRef.svelte';
  import { askNumber, confirmSheet, noticeSheet } from './confirm.svelte';
  import QuantitySheet from './QuantitySheet.svelte';
  import { askQuantity } from './quantity.svelte';
  import { markDone } from '../guide.svelte';
  import { ui } from '../ui.svelte';
  import { openSalvage } from './salvage.svelte';
  import { buyFromShop, lastBuy, buyDetail } from './shopActions';
  import { gradeName } from '../engine/grades';
  import { fmtEffectValue } from '../tabs/war/gearUi';

  type Action = { id: string; skill: string; kind: string; name: string; level?: number; sec?: number; xp?: number; inputs?: Record<string, number>; outputs?: Record<string, number>; bonus?: Array<{ item: string }>; drops?: Array<{ item: string }>; zone?: string; enemy?: string };
  const SLOT_LABEL: Record<string, string> = { weapon: 'Weapon', offhand: 'Offhand', head: 'Head', chest: 'Chest', legs: 'Legs', ring: 'Ring', amulet: 'Amulet', body: 'Body', hands: 'Hands', feet: 'Feet', tool: 'Tool' };
  const SECTION_LABEL: Record<string, string> = { fight: 'Fight gear', outfit: 'Work outfit', tool: 'Tool' };
  const SET_LABEL: Record<string, string> = { gather: 'Gather', refine: 'Refine', craft: 'Craft' };
  const effectNames: Record<string, string> = Object.fromEntries((((DATA as any).effects ?? []) as Array<{ id: string; name: string }>).map((e) => [e.id, e.name]));
  const STAT_NAME: Record<string, string> = { atk: 'attack', def: 'defence', heal: 'heal', hp: 'HP' };
  const itemsMap: Record<string, any> = (DATA as any).items;
  const itemRarity: Record<string, string> = (DATA as any).itemRarity ?? {};
  const actions: Action[] = (DATA as any).actions;
  const skills: Array<{ id: string; name: string }> = (DATA as any).skills;
  const skillName = (id: string) => skills.find((s) => s.id === id)?.name ?? id;
  const itemName = (id: string) => itemsMap[id]?.name ?? id;
  const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

  const catalog: Record<string, any> = (DATA as any).catalog ?? {};
  let ref = $derived(itemSheet.ref);
  let cat = $derived<any>(ref ? catalog[ref.itemId] ?? null : null);
  let cstat = $derived<string>(ref ? (engine.derived?.extras?.codex?.items?.[ref.itemId]?.status ?? 'known') : 'known');
  // A hint: not yet discovered. Only inputs you have already seen are named.
  // Anything on sale in the Shop right now counts as known (real name, stats, price, Buy).
  let onSale = $derived.by(() => { const st = engine.derived?.extras?.store as any; return !!ref && (ref.shopSlot != null || !!st?.slots?.some((s: any) => s.itemId === ref!.itemId && s.qty > 0)); });
  let hint = $derived(!!ref && cstat === 'hint' && !engine.snapshot?.seen?.[ref.itemId] && !ref.uid && !ref.actionId && !onSale);
  const seenId = (id: string) => !!engine.snapshot?.seen?.[id];
  let salvageYield = $derived.by(() => {
    if (!cat?.salvage || !g || isEq) return '';
    const pct = cat.salvage.perRarity?.[g.rarity] ?? 0;
    return Object.entries(cat.salvage.inputs as Record<string, number>).map(([id, n]) => {
      const x = n * pct; const lo = Math.floor(x), hi = Math.ceil(x);
      return hi <= 0 ? null : `${lo === hi ? lo : `${lo}–${hi}`} ${itemName(id)}`;
    }).filter(Boolean).join(', ');
  });
  let hintLine = $derived.by(() => {
    const e = ref ? engine.derived?.extras?.codex?.items?.[ref.itemId] : null;
    if (!e) return 'Undiscovered.';
    if (e.inputsTotal > 0) return `Undiscovered. Uses ${e.inputsSeen} of ${e.inputsTotal} materials you have found.`;
    const src = cat?.gatheredBy?.[0] ?? cat?.dropsFrom?.[0];
    if (src) return `Undiscovered. Found by ${src.skill ? skillName(src.skill) : src.name}${src.level ? ` (Lv ${src.level})` : ''}.`;
    return 'Undiscovered.';
  });
  let demand = $derived<number>(ref ? (engine.derived?.extras?.codex?.demand?.[ref.itemId] ?? 0) : 0);
  let snap = $derived(engine.snapshot);
  let view = $derived(engine.derived);
  let store = $derived<any>(view?.extras?.store ?? null);
  let it = $derived(ref ? itemsMap[ref.itemId] : null);
  let equipped = $derived<Record<string, string | null>>(snap?.equipped ?? {});
  let bag = $derived<any[]>(snap?.gear ?? []);
  let vaultGear = $derived<any[]>(snap?.crew?.vault?.gear ?? []);
  let g = $derived(ref?.uid ? [...bag, ...vaultGear].find((x) => x.uid === ref!.uid) ?? null : null);
  let inBag = $derived(!!g && bag.some((x) => x.uid === g.uid));
  let grades = $derived<number[] | null>(ref && it && it.kind !== 'gear' ? (snap?.inv?.[ref.itemId] ?? null) : null);
  let status = $derived(view?.raidStatus ?? null);
  const have = (id: string) => (snap?.inv?.[id] ?? []).reduce((a: number, b: number) => a + (b || 0), 0);
  const levelOf = (s: string) => view?.skillLevels?.[s] ?? 0;
  const timeOf = (a: Action) => view?.actionTimes?.[a.id] ?? a.sec;

  let recipes = $derived(ref ? actions.filter((a) => (a.kind === 'refine' || a.kind === 'craft') && a.outputs && ref!.itemId in a.outputs) : []);
  let gatheredBy = $derived(ref ? actions.filter((a) => a.kind === 'gather' && (a.outputs && ref!.itemId in a.outputs || a.bonus?.some((b) => b.item === ref!.itemId))) : []);
  let dropsFrom = $derived(ref ? actions.filter((a) => a.kind === 'combat' && a.drops?.some((d) => d.item === ref!.itemId)) : []);
  let usedIn = $derived(ref ? actions.filter((a) => a.inputs && ref!.itemId in a.inputs) : []);
  let contracts = $derived<any[]>(ref ? (view?.contracts ?? []).filter((c: any) => c.itemId === ref!.itemId && c.status === 'open') : []);
  let shopSlot = $derived<any>(ref ? (ref.shopSlot != null ? (store?.slots ?? []).find((s: any) => s.slot === ref!.shopSlot) : (store?.slots ?? []).find((s: any) => s.itemId === ref!.itemId && s.qty > 0)) ?? null : null);
  // A gear offer you do not own yet: base stats from the data (shop gear is Common, Rough grade).
  let offer = $derived(!!ref && !ref.uid && !ref.actionId && it?.kind === 'gear' && !!shopSlot);
  let offerRarity = $derived<string>(shopSlot?.rarity ?? 'common');
  let offerCmp = $derived.by(() => (offer ? buyDetail({ kind: 'gear', itemId: ref!.itemId, rarity: offerRarity }).replace(/^[^.]*\.\s*/, '') : ''));
  let rarity = $derived<string>(hint ? 'common' : g?.rarity ?? (offer ? offerRarity : null) ?? (ref ? itemRarity[ref.itemId] : null) ?? 'common');

  const statLine = (id: string) => Object.entries(itemsMap[id]?.stats ?? {}).filter(([, v]) => v).map(([k, v]) => `+${k === 'hp' ? fmtHpAmount(Number(v)) : v} ${STAT_NAME[k] ?? k}`).join(', ');
  // Full gear card from the engine (stats, affixes, compare). Falls back to base stats until it loads.
  type StatLine = { key: string; label: string; value: number; unit?: 'pts' | 'pct' };
  type EffectLine = { key: string; label: string; value: number; unit: 'pct' | 'pts'; text: string };
  type WornAt = { section: 'fight'; slot: string } | { section: 'outfit'; set: string; piece: string } | { section: 'tool'; skill: string };
  type GearDetail = {
    uid: string; name: string; section: 'fight' | 'outfit' | 'tool'; slot: string; tier: number; rarity: string; grade: number; gradeName: string; value: number;
    worn: WornAt | null; equipped: boolean; inLoadout: boolean;
    dur?: number; maxDur?: number; broken?: boolean; toolSkill?: string; cond?: number; wear?: 0 | 3 | 5 | 8; outfitSet?: string;
    stats: StatLine[]; effects: EffectLine[];
    final?: { now: Record<string, number>; ifWorn: Record<string, number> };
    affixes: Array<{ id: string; name: string; key: string; value: number; unit: 'pct' | 'pts'; label: string }>;
    repair: null | { gold: number; can: boolean; reason: string; newMaxDur?: number };
    compare: null | { uid: string; name: string; rarity: string; grade: number; at: WornAt; stats: StatLine[]; effects: EffectLine[];
      diff: Array<{ key: string; label: string; unit: 'pts' | 'pct'; mine: number; theirs: number; delta: number }>;
      power?: Record<string, { from: number; to: number; delta: number }>; broken?: boolean; cond?: number };
  };
  let detail = $state<GearDetail | null>(null);
  let info = $derived<any>(g ? view?.extras?.gearInfo?.[g.uid] ?? null : null);
  let isEq = $derived(!!g && (!!detail?.worn || !!info?.worn || !!detail?.equipped || Object.values(equipped).includes(g.uid) || Object.values(snap?.tools ?? {}).includes(g.uid)
    || Object.values(snap?.workOutfit ?? {}).some((set: any) => Object.values(set ?? {}).includes(g.uid))));
  let section = $derived<'fight' | 'outfit' | 'tool'>(it?.section ?? 'fight');
  // Fetch keyed on primitives only: every response replaces the engine snapshot, so reading snap here would loop.
  let detailKey = $derived.by(() => {
    const uid = ref?.uid; if (!uid) return '';
    // Re-fetch when the worn pieces, condition or rarity change (compare target and final totals depend on them).
    const worn = JSON.stringify([snap?.equipped, snap?.tools, snap?.workOutfit]);
    return [uid, worn, g ? Math.round(g.dur ?? g.cond ?? 0) : '', g?.rarity ?? ''].join('|');
  });
  let loadedKey = $state('');
  $effect(() => {
    const key = detailKey;
    if (!key) { detail = null; loadedKey = ''; return; }
    const uid = key.split('|')[0];
    let live = true;
    untrack(() => {
      if (detail && detail.uid !== uid) detail = null;
      Promise.resolve(engineClient.gearDetail(uid)).then((d: any) => { if (live) { detail = d ?? null; loadedKey = key; } }).catch(() => { if (live) { detail = null; loadedKey = key; } });
    });
    return () => { live = false; };
  });
  const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmtN(Math.abs(n));
  // One formatter for work effects (shared with the War Room): gearUi.fmtEffectValue.
  const sgn = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '');
  const fmtU = (v: number, unit?: string, key?: string) => (key && effectNames[key] ? fmtEffectValue(key, v) : unit === 'pct' ? `${sgn(v)}${Math.abs(Math.round(v * 10) / 10)}%` : sign(v));
  const effLine = (e: EffectLine) => `${e.label} ${fmtEffectValue(e.key, e.value)}`;
  // Affix rows: the first is the slot's primary bonus (own row, tag above). Work effects are re-formatted from the value.
  const affBody = (a: { name: string; key: string; value: number; unit: string; label: string }) =>
    effectNames[a.key] ? `${effectNames[a.key]} ${fmtEffectValue(a.key, a.value)}` : a.label.includes(': ') ? a.label.slice(a.label.indexOf(': ') + 2) : a.label;
  const fmtStat = (l: StatLine) => fmtU(l.value, l.unit, l.key);
  const effUnit = (id: string) => ((DATA as any).effects ?? []).find((e: any) => e.id === id)?.unit ?? 'pct';
  const fmtEff = fmtEffectValue;
  const wbOf = (a: Action): any => { const w = a.kind === 'combat' ? null : view?.extras?.workBonus?.[a.skill] ?? null; return w && (w.lines?.length || w.toolItemId) ? w : null; };
  const WEAR_AT: Record<number, number> = { 3: 50, 5: 25, 8: 10 };
  const gname = () => (g ? (view?.gearNames?.[g.uid] ?? itemName(g.itemId)) : ref ? itemName(ref.itemId) : '');
  let note = $state('');
  $effect(() => { void ref; note = ''; });

  async function equip() {
    if (status?.prepLocked) { await noticeSheet('Gear is locked', status.prepReason || 'Gear cannot change while the raid runs.'); return; }
    try {
      const res = await engineClient.equip(g.uid);
      if (res && res.ok === false) note = res.reason || 'Could not equip.'; else closeItem();
    } catch (e) { console.error(e); note = 'Could not equip.'; }
  }
  async function unequip() {
    if (section === 'fight' && status?.prepLocked) { await noticeSheet('Gear is locked', status.prepReason || 'Gear cannot change while the raid runs.'); return; }
    try {
      const res = await engineClient.unequipGear(g.uid);
      if (res && res.ok === false) note = res.reason || 'Could not take it off.'; else closeItem();
    } catch (e) { console.error(e); }
  }
  async function repairIt() {
    const d = detail; if (!d?.repair) return;
    const body = d.section === 'fight' ? `It costs ${fmtG(d.repair.gold)}. Maximum durability drops to ${d.repair.newMaxDur ?? '?'}.` : `It costs ${fmtG(d.repair.gold)} and goes back to 100%.`;
    if (!(await confirmSheet({ title: `Repair ${gname()}?`, body, confirmLabel: `Repair for ${fmtG(d.repair.gold)}` }))) return;
    try {
      const res = await engineClient.repair(d.uid);
      note = res.ok ? 'Repaired.' : res.reason || 'Could not repair.';
    } catch (e) { console.error(e); note = 'Could not repair.'; }
  }
  async function sellGear() {
    const price = store?.gearSellPrices?.[g.uid] ?? 0;
    if (!(await confirmSheet({ title: `Sell ${gname()}?`, body: `The store pays ${fmtG(price)}. A crewmate or contract may pay more.`, confirmLabel: `Sell for ${fmtG(price)}`, danger: true }))) return;
    const res = await engineClient.storeSellGear(g.uid);
    if (res.ok) { markDone('sell'); closeItem(); } else await noticeSheet('Could not sell', res.reason);
  }
  async function sellStack(grade: number, n: number) {
    const id = ref!.itemId; const price = store?.sellPrices?.[id]?.[grade] ?? 0;
    const qty = await askNumber({ title: `Sell ${itemName(id)}`, body: `${gradeName(grade)} · the store pays ${fmtG(price)} each.`,
      number: { min: 1, max: n, value: 1, label: 'How many?', lines: (k) => [`You get ${fmtG(k * price)}`] }, confirmLabel: 'Sell' });
    if (qty == null) return;
    const res = await engineClient.storeSell(id, grade, qty);
    if (res.ok) { markDone('sell'); note = `Sold ${qty} for ${fmtG(res.gold)}.`; } else await noticeSheet('Could not sell', res.reason);
  }
  // Gather / fight start right away and keep going until stopped; refine / craft ask how many first.
  async function begin(a: Action) {
    if (a.kind === 'refine' || a.kind === 'craft') { closeItem(); askQuantity(a.id); return; }
    try { await engineClient.start(a.id); closeItem(); } catch (e) { console.error(e); note = 'Could not start.'; }
  }
  async function stopJob() { try { await engineClient.stop(); } catch (e) { console.error(e); } }
  let act = $derived<Action | null>(ref?.actionId ? actions.find((a) => a.id === ref!.actionId) ?? null : null);
  let fightAct = $derived<Action | null>(act && act.kind === 'combat' ? act : null);
  let runningId = $derived<string | null>(snap?.active?.actionId ?? null);
  let runningName = $derived(runningId ? actions.find((a) => a.id === runningId)?.name ?? null : null);
  // An owned piece shows its own card, not the recipe that makes it.
  let panelActs = $derived<Action[]>(act && act.kind !== 'combat' ? [act] : ref?.uid || offer ? [] : recipes);
  const KIND_LABEL: Record<string, string> = { gather: 'Gather', refine: 'Refine', craft: 'Craft', combat: 'Fight' };
  // Rough damage per kill from the engine's own formula: dmg x ~1.2, less 30% of defence.
  const hitDmg = (a: Action) => Math.max(0.2, ((a.enemy as any)?.dmg ?? 1) * 1.2 - (view?.playerStats?.def ?? 0) * 0.3);
  const maxHp = $derived<number>(view?.playerStats?.maxHp ?? 0);
  function toShop() { closeItem(); ui.goTab = 'Shop'; }

  let dlg = $state<HTMLElement | null>(null);
  $effect(() => { if (ref) queueMicrotask(() => dlg?.querySelector<HTMLElement>('button')?.focus()); });
  function onKey(ev: KeyboardEvent) {
    if (!ref) return;
    // A confirm sheet above us gets Escape first.
    if (document.querySelector('.cs-sheet')) return;
    if (ev.key === 'Escape') { closeItem(); return; }
    if (ev.key !== 'Tab' || !dlg) return;
    const f = [...dlg.querySelectorAll<HTMLElement>('button:not(:disabled)')];
    if (!f.length) return;
    if (ev.shiftKey && document.activeElement === f[0]) { ev.preventDefault(); f[f.length - 1].focus(); }
    else if (!ev.shiftKey && document.activeElement === f[f.length - 1]) { ev.preventDefault(); f[0].focus(); }
  }
</script>

<svelte:window onkeydown={onKey} />

{#snippet startCtl(a: Action)}
  {@const short = Object.entries(a.inputs ?? {}).some(([id, n]) => have(id) < n)}
  {@const lockd = levelOf(a.skill) < (a.level ?? 1)}
  {#if lockd}<p class="meta">Needs {skillName(a.skill)} Lv <span class="num">{a.level}</span>.</p>
  {:else if !ref?.readOnly}
    {#if runningId === a.id}
      <button type="button" class="btn" onclick={stopJob}>Running · Stop</button>
    {:else}
      <button type="button" class="btn primary start" disabled={short} onclick={() => begin(a)}>{runningName ? `Start · stops ${runningName}` : 'Start'}</button>
      {#if runningName && !short}<p class="meta">This stops {runningName}.</p>{/if}
    {/if}
    {#if short}<p class="meta">{view?.extras?.disabledReasons?.actions?.[a.id] ?? 'Missing materials. Check the have / need lines above.'}</p>{/if}
  {/if}
{/snippet}

{#snippet link(id: string)}
  <button type="button" class="il" style:color={`var(--r-${itemRarity[id] ?? 'common'})`} onclick={() => openItem({ itemId: id })}>{itemName(id)}</button>
{/snippet}

{#if ref && fightAct}
  <div class="scrim" onclick={closeItem} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="it-title" tabindex="-1" bind:this={dlg} onclick={(e) => e.stopPropagation()}>
      <header>
        <span class="tile" style:--ink-r="var(--ink)" aria-hidden="true"><ItemIcon named="fight:{fightAct.id}" size={64} /></span>
        <div>
          <h2 id="it-title">{fightAct.name}</h2>
          <p class="meta">Fight · {skillName(fightAct.skill)} Lv <span class="num">{fightAct.level ?? 1}</span>{fightAct.zone ? ` · ${fightAct.zone}` : ''}</p>
        </div>
      </header>
      <section>
        <h3>Enemy</h3>
        <p class="body">{(fightAct.enemy as any)?.name ?? 'Unknown'}</p>
        <dl class="facts">
          <div><dt>Time per kill</dt><dd class="num">{fmtSecs(timeOf(fightAct) ?? 0)}</dd></div>
          <div><dt>XP per kill</dt><dd class="num">{fmtN(fightAct.xp ?? 0)}</dd></div>
          <div><dt>Damage risk</dt><dd class="num">about {fmtHpAmount(hitDmg(fightAct))} per kill · {fmtN(Math.floor(maxHp / hitDmg(fightAct)))} kills from full health</dd></div>
        </dl>
        {#if fightAct.drops?.length}<p class="meta">Drops: {#each fightAct.drops as d, i}{#if i}, {/if}{@render link(d.item)}{/each}</p>{/if}
        {@render startCtl(fightAct)}
      </section>
      <div class="actions"><button type="button" class="btn ghost" onclick={closeItem}>Close</button></div>
    </div>
  </div>
{:else if ref && it}
  <div class="scrim" onclick={closeItem} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="it-title" tabindex="-1" bind:this={dlg} onclick={(e) => e.stopPropagation()}>
      <header>
        <span class="tile" style:--ink-r={`var(--r-${rarity})`} aria-hidden="true"><ItemIcon id={ref.itemId} size={64} rarity={hint ? undefined : rarity} silhouette={hint} /></span>
        <div>
          <h2 id="it-title" style:color={hint ? undefined : `var(--r-${rarity})`}>{hint ? '???' : gname()}{#if !hint && (ref.count ?? 0) > 1} <span class="num cnt">×{fmtN(ref.count ?? 0)}</span>{/if}</h2>
          {#if hint}<p class="meta">{hintLine}</p>{:else}<p class="meta">{cap(rarity)} · {it.kind === 'gear' ? `${SECTION_LABEL[it.section] ?? 'Gear'}${it.section === 'outfit' && it.outfitSet ? `, ${SET_LABEL[it.outfitSet] ?? it.outfitSet}` : ''}${it.section === 'tool' ? '' : ` · ${SLOT_LABEL[it.slot] ?? cap(it.slot ?? 'gear')}`}` : cap(it.kind ?? 'item')}{it.tier ? ` · tier ${it.tier}` : ''}</p>{/if}
        </div>
      </header>
      {#if !hint && cat?.lore}<p class="body lore">{cat.lore}</p>{/if}

      {#if hint}
        {#each recipes as a (a.id)}
          <section>
            <h3>Recipe</h3>
            <ul class="ing">
              {#each Object.entries(a.inputs ?? {}) as [id, n]}
                <li>{#if seenId(id)}{@render link(id)} <span class="num">need {n}</span>{:else}<span class="meta">???</span>{/if}</li>
              {/each}
            </ul>
          </section>
        {:else}
          <p class="meta">Keep gathering and exploring to find out more.</p>
        {/each}
      {:else}

      {#if it.kind === 'gear'}
        {#if detail && g}
          <section class="gear" aria-label="Gear stats">
            <p class="meta">
              <span style:color={`var(--r-${detail.rarity})`}>{cap(detail.rarity)}</span> · {detail.gradeName}
              {#if detail.equipped} · <b>{detail.section === 'tool' ? 'In use' : 'Worn'}</b>{/if}
              {#if detail.inLoadout && detail.section === 'fight'} · In a loadout{/if}
            </p>
            {#if detail.stats.length}
              <dl class="facts">
                {#each detail.stats as s (s.key)}<div><dt>{s.label}</dt><dd class="num">{fmtStat(s)}</dd></div>{/each}
              </dl>
            {/if}
            {#if detail.effects?.length}
              <h3>Effects</h3>
              <ul class="aff">{#each detail.effects as e (e.key + e.label)}<li><span>{effLine(e)}</span></li>{/each}</ul>
            {/if}
            {#if detail.affixes.length}
              <ul class="aff affx" style:color={`var(--r-${detail.rarity})`}>
                {#each detail.affixes as a, i (a.id)}
                  {#if i === 0 && a.label && a.value}
                    <li class="prim"><span class="tag">Primary bonus</span><span>{affBody(a)}</span></li>
                  {:else if i > 0 && a.label}
                    <li><span>{a.id === 'primary' || !a.name ? '' : `${a.name}: `}{affBody(a)}</span></li>
                  {/if}
                {/each}
              </ul>
            {/if}
            {#if detail.section === 'tool' && detail.final}
              {@const ks = Object.keys(detail.final.ifWorn).filter((k) => (detail!.final!.ifWorn[k] ?? 0) !== 0 || (detail!.final!.now[k] ?? 0) !== 0)}
              {#if ks.length}
                <h3>{detail.equipped ? 'Skill total now' : 'Skill total'}</h3>
                <ul class="aff">{#each ks as k (k)}
                  <li><span>{effectNames[k] ?? k}</span><b class="num">{#if detail.equipped}{fmtEff(k, detail.final.now[k] ?? 0)}{:else}{fmtEff(k, detail.final.now[k] ?? 0)} → {fmtEff(k, detail.final.ifWorn[k] ?? 0)}{/if}</b></li>
                {/each}</ul>
              {/if}
            {/if}
            {#if detail.section === 'tool' && detail.cond != null}
              {@const c = detail.cond}
              <div class="cond" class:low={c < 50}>
                <div class="crow"><span>Condition</span><b class="num">{c}%</b></div>
                <div class="cbar" role="progressbar" aria-label="Condition" aria-valuemin="0" aria-valuemax="100" aria-valuenow={c}><i style:width="{c}%"></i></div>
                <p class="meta">{#if detail.wear}Below {WEAR_AT[detail.wear]}%: {detail.wear}% slower. Repair it.{:else}Never breaks. Below 50% it slows you down.{/if}</p>
              </div>
            {:else if detail.section === 'fight' && detail.maxDur != null}
              <div class="cond" class:low={(detail.dur ?? 0) < detail.maxDur * 0.25}>
                <div class="crow"><span>Durability</span><b class="num">{Math.round(detail.dur ?? 0)}/{detail.maxDur}</b></div>
                <div class="cbar" role="progressbar" aria-label="Durability" aria-valuemin="0" aria-valuemax={detail.maxDur} aria-valuenow={Math.round(detail.dur ?? 0)}><i style:width="{Math.min(100, ((detail.dur ?? 0) / detail.maxDur) * 100)}%"></i></div>
                {#if detail.broken}<p class="meta">Broken: it gives no stats until repaired.</p>{/if}
              </div>
            {/if}
            <p class="meta">Worth <span class="num brass">{fmtG(detail.value)}</span></p>
          </section>
          {#if detail.compare && !detail.equipped}
            <section class="cmp" aria-label="Compared with worn">
              <h3>Versus worn · {detail.compare.name}</h3>
              {#if detail.compare.diff.some((d) => d.delta !== 0)}
                <ul class="dl">
                  {#each detail.compare.diff.filter((d) => d.delta !== 0) as d (d.key)}
                    <li class={d.delta > 0 ? 'up' : 'down'}><span>{d.label}</span><b class="num"><span aria-hidden="true">{d.delta > 0 ? '▲' : '▼'}</span> {fmtU(d.delta, d.unit, d.key)}<span class="sr"> {d.delta > 0 ? 'better' : 'worse'}</span></b></li>
                  {/each}
                </ul>
              {:else}<p class="meta">Same as your worn piece.</p>{/if}
              {#if detail.compare.power}
                {@const pw = Object.entries(detail.compare.power).filter(([, p]) => p.delta !== 0)}
                {#if pw.length}
                  <ul class="dl">{#each pw as [r, p] (r)}
                    <li class={p.delta > 0 ? 'up' : 'down'}><span>{cap(r)} power</span><b class="num"><span aria-hidden="true">{p.delta > 0 ? '▲' : '▼'}</span> {sign(p.delta)}<span class="sr"> {p.delta > 0 ? 'better' : 'worse'}</span></b></li>
                  {/each}</ul>
                {/if}
              {/if}
            </section>
          {:else if !detail.equipped && !detail.compare}<p class="meta">Nothing worn there yet: all of it is new.</p>{/if}
        {:else if loadedKey !== detailKey}
          <p class="meta" role="status">Loading stats…</p>
        {:else}
          {#if !offer && statLine(ref.itemId)}<p class="body num">{statLine(ref.itemId)}</p>{/if}
        {/if}
      {/if}

      {#if offer && it}
        <section class="gear" aria-label="Shop offer">
          <p class="meta"><span style:color={`var(--r-${offerRarity})`}>{cap(offerRarity)}</span> · Rough · for sale</p>
          {#if statLine(ref.itemId)}
            <dl class="facts">{#each Object.entries(it.stats ?? {}).filter(([, v]) => v) as [k, v] (k)}<div><dt>{cap(STAT_NAME[k] ?? k)}</dt><dd class="num">+{k === 'hp' ? fmtHpAmount(Number(v)) : v}</dd></div>{/each}</dl>
          {/if}
          {#if it.effects?.length}
            <h3>Effects</h3>
            <ul class="aff">{#each it.effects as e (e.id + (e.group ?? ''))}<li><span>{effectNames[e.id] ?? e.id} {fmtEffectValue(e.id, e.value)}</span></li>{/each}</ul>
          {/if}
          {#if offerRarity !== 'common'}<p class="meta">{cap(offerRarity)}: bonus affixes on top of these base values.</p>{/if}
          <p class="meta">Price <span class="num brass">{fmtG(shopSlot.price)}</span></p>
        </section>
        <p class="meta">{offerCmp}</p>
      {/if}

      {#if grades}
        <ul class="gr">{#each grades as q, i}{#if q > 0}<li><span>{gradeName(i)}</span><b class="num">×{fmtN(q)}</b>
          {#if !ref.readOnly}<button type="button" class="btn" onclick={() => sellStack(i, q)}>Sell <span class="num">{fmtG(store?.sellPrices?.[ref.itemId]?.[i] ?? 0)}</span></button>{/if}</li>{/if}{/each}</ul>
      {/if}

      {#each panelActs as a (a.id)}
        <section>
          <h3>{KIND_LABEL[a.kind] ?? 'Recipe'}</h3>
          <p class="body">{skillName(a.skill)} Lv <span class="num">{a.level ?? 1}</span></p>
          <dl class="facts">
            <div><dt>Time per rep</dt><dd class="num">{fmtSecs(timeOf(a) ?? 0)}</dd></div>
            <div><dt>XP per rep</dt><dd class="num">{fmtN(a.xp ?? 0)}</dd></div>
          </dl>
          {#if wbOf(a)}
            {@const wb = wbOf(a)}
            <div class="wb" aria-label="Work bonuses">
              <h3>Your bonuses</h3>
              {#if wb.toolItemId}<p class="meta">Tool: {itemName(wb.toolItemId)}{wb.toolCond != null ? ` ${wb.toolCond}%` : ''}</p>{/if}
              {#each wb.lines ?? [] as l (l.key)}<p class="wbl num">{effLine(l)}</p>{/each}
              {#if !wb.lines?.length}<p class="meta">No bonus yet.</p>{/if}
              {#if wb.wearText}<p class="meta warn">{wb.wearText}</p>{/if}
            </div>
          {/if}
          {#if a.inputs && Object.keys(a.inputs).length}
            <ul class="ing">
              {#each Object.entries(a.inputs) as [id, n]}
                <li>{@render link(id)} <span class="num" class:short={have(id) < n}>have {fmtN(have(id))} / need {n}</span></li>
              {/each}
            </ul>
          {/if}
          {@render startCtl(a)}
        </section>
      {/each}
      {#if gatheredBy.length}<p class="meta">Gathered by: {gatheredBy.map((a) => `${a.name} (${skillName(a.skill)} Lv ${a.level ?? 1})`).join(', ')}</p>{/if}
      {#if dropsFrom.length}<p class="meta">Drops from: {dropsFrom.map((a) => a.name).join(', ')}</p>{/if}
      {#if usedIn.length}<p class="meta">Used in: {usedIn.slice(0, 5).map((a) => a.name).join(', ')}{usedIn.length > 5 ? ` and ${usedIn.length - 5} more` : ''}</p>{/if}
      {#each contracts as c}<p class="meta">Contract: {c.source === 'town' ? 'Town' : 'Crew'} wants <span class="num">{fmtN(c.remaining)}</span> at <span class="num brass">{fmtG(c.rewardPer)}</span> each.</p>{/each}
      {#if shopSlot && !offer}<p class="meta">Shop: {shopSlot.grade != null ? `${gradeName(shopSlot.grade)} · ` : ''}<span class="num brass">{fmtG(shopSlot.price)}</span> each, <span class="num">{shopSlot.qty}</span> left this hour.</p>{:else if shopSlot}<p class="meta"><span class="num">{shopSlot.qty}</span> left this hour.</p>{/if}
      {#if grades && store?.sellPrices?.[ref.itemId]}<p class="meta">Store pays <span class="num">{fmtG(store.sellPrices[ref.itemId][Math.max(0, grades.findIndex((q) => q > 0))] ?? 0)}</span> each.</p>{/if}

      {#if salvageYield}<p class="meta">Salvage yields {salvageYield}.</p>{:else if g && isEq}<p class="meta">In use. Take it off first.</p>{/if}
      {#if demand > 0}<p class="meta">Open contracts still want <span class="num">{fmtN(demand)}</span>.</p>{/if}
      {/if}

      {#if note}<p class="meta" role="status">{note}</p>{/if}
      {#if detail?.repair && !detail.repair.can && detail.repair.reason && !hint && g && !ref.readOnly}<p class="meta">{detail.repair.reason}</p>{/if}
      <div class="actions">
        <button type="button" class="btn ghost" onclick={closeItem}>Close</button>
        {#if !hint && shopSlot && !ref.readOnly}<button type="button" class="btn primary" onclick={async () => { if (await buyFromShop(shopSlot)) note = `Bought ${lastBuy.qty} for ${fmtG(lastBuy.gold)}.`; }}>Buy <span class="num">{fmtG(shopSlot.price)}</span></button>{/if}
        {#if !hint && g && inBag && !ref.readOnly}
          {#if detail?.repair && (detail.section === 'fight' ? (detail.dur ?? 0) < (detail.maxDur ?? 0) : (detail.cond ?? 100) < 100)}
            <button type="button" class="btn" disabled={!detail.repair.can} onclick={repairIt}>Repair <span class="num">{fmtG(detail.repair.gold)}</span></button>
          {/if}
          {#if isEq}
            <button type="button" class="btn" onclick={unequip}>{section === 'tool' ? 'Put away' : 'Take off'}</button>
          {:else}
            <button type="button" class="btn" onclick={sellGear}>Sell <span class="num">{fmtG(store?.gearSellPrices?.[g.uid] ?? 0)}</span></button>
            {#if it.slot}<button type="button" class="btn primary" data-guide="equip" onclick={equip}>{section === 'tool' ? 'Use tool' : section === 'outfit' ? 'Wear' : 'Equip'}</button>{/if}
          {/if}
        {/if}
      </div>
      {#if !hint && g && inBag && !isEq && !ref.readOnly}
        <div class="apart"><button type="button" class="btn ghost salv" onclick={() => openSalvage([g.uid], gname())}>Salvage…</button></div>
      {/if}
    </div>
  </div>
{/if}

<QuantitySheet />

<style>
  .scrim { position: fixed; inset: 0; z-index: 48; background: var(--scrim); display: flex; align-items: flex-end; justify-content: center; }
  .sheet { width: 100%; max-width: var(--col); max-height: 88dvh; overflow-y: auto; display: grid; gap: 10px; align-content: start; padding: 16px var(--gut-r) calc(16px + env(safe-area-inset-bottom, 0px)) var(--gut-l); background: var(--paper); border: 1px solid var(--rule); border-bottom: 0; box-shadow: 0 -8px 24px var(--shadow); }
  header { display: flex; gap: 12px; align-items: center; }
  .cnt { font-size: var(--t-sm); color: var(--ink-3); font-weight: 400; }
  h2 { margin: 0; font: 600 var(--t-lg)/1.2 var(--f-display); }
  h3 { margin: 0 0 4px; font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3); letter-spacing: .08em; text-transform: uppercase; }
  .tile { flex: none; width: 72px; height: 72px; display: grid; place-items: center; background: var(--paper); border: 2px solid var(--ink-r); }
  .meta { margin: 0; color: var(--ink-3); font-size: var(--t-sm); }
  .lore { font-style: italic; color: var(--ink-2); }
  .body { margin: 0; color: var(--ink); font-size: var(--t-sm); }
  .brass { color: var(--brass); font-weight: 700; }
  section { padding: 10px; background: var(--sunk); border: 1px solid var(--rule-2); display: grid; gap: 6px; justify-items: start; }
  .ing { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; width: 100%; }
  .ing li { display: flex; justify-content: space-between; gap: 8px; align-items: center; font-size: var(--t-sm); }
  .short { color: var(--bad); font-weight: 700; }
  .il { min-height: 44px; padding: 0; border: 0; background: none; font: 700 var(--t-sm)/1.2 var(--f-body); text-decoration: underline; text-align: left; }
  .gr { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .gr li { display: flex; align-items: center; gap: 8px; padding: 4px 8px; background: var(--sunk); border: 1px solid var(--rule-2); }
  .gr li span { flex: 1; }
  .facts { margin: 0; display: grid; gap: 2px; width: 100%; }
  .facts div { display: flex; justify-content: space-between; gap: 8px; font-size: var(--t-sm); }
  .facts dt { color: var(--ink-3); } .facts dd { margin: 0; text-align: right; }
  .gear, .cmp { width: 100%; box-sizing: border-box; }
  .aff, .dl { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; width: 100%; }
  .aff li, .dl li { display: flex; justify-content: space-between; gap: 8px; font-size: var(--t-sm); }
  .dl .up b { color: var(--ok); } .dl .down b { color: var(--bad); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .apart { padding-top: 8px; border-top: 1px solid var(--rule); display: flex; justify-content: flex-start; }
  .affx { gap: 6px; } .prim { display: grid !important; gap: 1px; }
  .tag { font-size: var(--t-xs); color: var(--ink-3); font-family: var(--f-label); text-transform: uppercase; letter-spacing: .06em; }
  .aff li { align-items: baseline; }
  .cond { display: grid; gap: 4px; width: 100%; }
  .crow { display: flex; justify-content: space-between; font-size: var(--t-sm); }
  .cbar { height: 8px; background: var(--paper); border: 1px solid var(--rule); overflow: hidden; }
  .cbar i { display: block; height: 100%; background: var(--woad); }
  .cond.low .cbar i { background: var(--bad); } .cond.low .crow b { color: var(--bad); }
  .wb { width: 100%; display: grid; gap: 2px; padding-top: 6px; border-top: 1px solid var(--rule-2); }
  .wbl { margin: 0; font-size: var(--t-sm); color: var(--ink); }
  .warn { color: var(--bad); }
  .salv { color: var(--bad); }
  .actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
</style>
