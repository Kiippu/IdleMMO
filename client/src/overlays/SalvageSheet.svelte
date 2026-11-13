<script lang="ts">
  import { pushBack } from './backStack.svelte';
  import { GRADE_NAMES } from '../engine/grades';
  import ItemIcon from '../art/ItemIcon.svelte';
  // Salvage gear into materials. Preview first; protected pieces (equipped, in a loadout, rare+) are skipped unless opted in.
  import { DATA } from '@guildwright/engine';
  import { engine } from '../engine/store.svelte';
  import { engineClient, type SalvagePreview } from '../engine/client';
  import { fmtN } from '../format';
  import { salvageReq, closeSalvage } from './salvage.svelte';
  import { noticeSheet } from './confirm.svelte';
  import { closeItem } from './itemRef.svelte';

  const GRADE = GRADE_NAMES;
  const itemsMap: Record<string, { name?: string }> = (DATA as any).items;
  const itemRarity: Record<string, string> = (DATA as any).itemRarity ?? {};
  const itemName = (id: string) => itemsMap[id]?.name ?? id;

  let uids = $derived(salvageReq.uids);
  let allow = $state(false);
  let pv = $state<SalvagePreview | null>(null);
  let busy = $state(false);
  let done = $state<string | null>(null);
  let seq = 0;

  $effect(() => {
    if (!uids) { pv = null; allow = false; done = null; return; }
    const my = ++seq; const a = allow; const u = [...uids];
    engineClient.salvagePreview(u, a).then((r) => { if (my === seq) pv = r; }).catch((e) => console.error(e));
  });
  const nm = (uid: string) => engine.derived?.gearNames?.[uid] ?? uid;
  function reasonText(r: string) { return /rare or better|protected/i.test(r) && !/tick/i.test(r) ? `${r} (tick Include protected)` : r; }
  const range = (l: { qtyMin: number; qtyMax: number }) => (l.qtyMin === l.qtyMax ? `${l.qtyMin}` : `${l.qtyMin}–${l.qtyMax}`);

  async function confirm() {
    if (!uids || busy) return;
    busy = true;
    try {
      const res = await engineClient.salvage([...uids], allow);
      if (!res.ok) { await noticeSheet('Could not salvage', res.reason); return; }
      const sum = res.items.reduce((a, i) => a + i.qty, 0);
      done = `Salvaged ${res.salvaged} ${res.salvaged === 1 ? 'piece' : 'pieces'} into ${fmtN(sum)} materials.`;
      closeItem();
      salvageReq.done++;
    } catch (e) { console.error(e); } finally { busy = false; }
  }
  let dlg = $state<HTMLElement | null>(null);
  $effect(() => { if (uids) return pushBack(() => closeSalvage()); });
  $effect(() => { if (uids) queueMicrotask(() => dlg?.querySelector<HTMLElement>('input, button')?.focus()); });
  function onKey(ev: KeyboardEvent) {
    if (!uids) return;
    if (ev.key === 'Escape') { closeSalvage(); return; }
    if (ev.key !== 'Tab' || !dlg) return;
    const f = [...dlg.querySelectorAll<HTMLElement>('button:not(:disabled), input')];
    if (!f.length) return;
    if (ev.shiftKey && document.activeElement === f[0]) { ev.preventDefault(); f[f.length - 1].focus(); }
    else if (!ev.shiftKey && document.activeElement === f[f.length - 1]) { ev.preventDefault(); f[0].focus(); }
  }
</script>

<svelte:window onkeydown={onKey} />

{#if uids}
  <div class="scrim" onclick={closeSalvage} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="sheet cs-sheet" role="dialog" aria-modal="true" aria-labelledby="sv-title" tabindex="-1" bind:this={dlg} onclick={(e) => e.stopPropagation()}>
      <h2 id="sv-title">Salvage {salvageReq.label || (uids.length === 1 ? 'this piece' : 'shown gear')}</h2>
      {#if done}
        <p class="body ok" role="status">{done}</p>
      {:else if !pv}
        <p class="meta">Working it out…</p>
      {:else}
        <p class="body"><span class="num">{pv.gearCount}</span> {pv.gearCount === 1 ? 'piece' : 'pieces'} will be broken down. This cannot be undone.</p>
        {#if pv.blocked.length}
          <p class="meta"><span class="num">{pv.blocked.length}</span> of the <span class="num">{uids.length}</span> shown {pv.blocked.length === 1 ? 'is' : 'are'} kept: worn, in a loadout, or rare or better. Tick "Include protected" to break {pv.blocked.length === 1 ? 'it' : 'them'} down too.</p>
        {/if}
        {#if pv.items.length}
          <h3>You will get about</h3>
          <ul class="lines">
            {#each pv.items as l}<li><span class="ln" style:color={`var(--r-${itemRarity[l.itemId] ?? 'common'})`}><ItemIcon id={l.itemId} rarity={itemRarity[l.itemId] ?? 'common'} grade={l.grade} /><span>{itemName(l.itemId)} <small>{GRADE[l.grade]}</small></span></span><b class="num">≈{fmtN(Math.round(l.expected))} <small>({range(l)})</small></b></li>{/each}
          </ul>
        {/if}
        {#if pv.blocked.length}
          <h3>Skipped</h3>
          <ul class="lines">
            {#each pv.blocked.slice(0, 8) as b}<li><span>{nm(b.uid)}</span><small>{reasonText(b.reason)}</small></li>{/each}
          </ul>
          {#if pv.blocked.length > 8}<p class="meta">and <span class="num">{pv.blocked.length - 8}</span> more.</p>{/if}
        {/if}
      {/if}
      {#if !done}<label class="chk"><input type="checkbox" bind:checked={allow} /> <span>Include protected (worn, loadouts, rare+)</span></label>{/if}
      {#if !done && (!pv || pv.gearCount === 0)}<p class="meta">{!pv ? 'Working out what you would get…' : 'Nothing to salvage. Tick "Include protected" to see worn and rare gear.'}</p>{/if}
      <div class="actions">
        {#if done}
          <button type="button" class="btn primary" onclick={closeSalvage}>Done</button>
        {:else}
          <button type="button" class="btn ghost" onclick={closeSalvage}>Cancel</button>
          <button type="button" class="btn danger solid" disabled={!pv || pv.gearCount === 0 || busy} onclick={confirm}>Salvage <span class="num">{pv?.gearCount ?? 0}</span></button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 52; background: var(--scrim); display: flex; align-items: flex-end; justify-content: center; }
  .sheet { width: 100%; max-width: var(--col); max-height: 88dvh; overflow-y: auto; display: grid; gap: 10px; padding: 16px var(--gut-r) calc(16px + env(safe-area-inset-bottom, 0px)) var(--gut-l); background: var(--paper); border: 1px solid var(--rule); border-bottom: 0; box-shadow: 0 -8px 24px var(--shadow); }
  h2 { margin: 0; font: 600 var(--t-lg)/1.2 var(--f-display); }
  h3 { margin: 0; font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3); letter-spacing: .08em; text-transform: uppercase; }
  .meta { margin: 0; color: var(--ink-3); }
  .body { margin: 0; color: var(--ink); }
  .body.ok { color: var(--ok); font-weight: 700; }
  .lines { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  .lines li { display: flex; justify-content: space-between; gap: 8px; padding: 6px 8px; background: var(--sunk); border: 1px solid var(--rule-2); font-size: var(--t-sm); }
  small { color: var(--ink-3); font-weight: 400; }
  .ln { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
  .chk { display: flex; gap: 12px; align-items: center; min-height: 48px; padding: 4px 8px; background: var(--sunk); border: 1px solid var(--rule); font-size: var(--t-sm); cursor: pointer; }
  .chk input { width: 24px; height: 24px; min-height: 0; accent-color: var(--woad); }
  .actions { display: flex; gap: 8px; position: sticky; bottom: calc(-16px - env(safe-area-inset-bottom, 0px)); margin: 0 calc(var(--gut-r) * -1) calc(-16px - env(safe-area-inset-bottom, 0px)) calc(var(--gut-l) * -1); padding: 10px var(--gut-r) calc(12px + env(safe-area-inset-bottom, 0px)) var(--gut-l); background: var(--paper); border-top: 1px solid var(--rule); } .actions .btn { flex: 1; }
</style>
