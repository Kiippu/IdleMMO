<script lang="ts">
  // Bottom sheet listing the player's last 50 events, newest first, with category filters.
  import { DATA } from '@guildwright/engine';
  import { engine } from '../engine/store.svelte';
  import { fmtAgo, fmtG, fmtN } from '../format';

  type Props = { onClose: () => void };
  let { onClose }: Props = $props();

  const FILTERS = [
    { id: 'all', label: 'All' }, { id: 'loot', label: 'Loot' }, { id: 'gold', label: 'Gold' },
    { id: 'crew', label: 'Crew' }, { id: 'raid', label: 'Raid' }, { id: 'skill', label: 'Skill' },
  ] as const;
  const items: Record<string, { name?: string; rarity?: string }> = (DATA as any).items;
  const itemRarity: Record<string, string> = (DATA as any).itemRarity ?? {};

  let filter = $state<(typeof FILTERS)[number]['id']>('all');
  let dlg = $state<HTMLElement | null>(null);
  let events = $derived<any[]>(engine.derived?.extras?.events ?? []);
  let now = $derived<number>(engine.derived?.now ?? Date.now());
  let shown = $derived(events.slice(0, 50).filter((e) => filter === 'all' || e.cat === filter));

  $effect(() => { dlg?.focus(); });

  /** Split the text around the item name so the name can wear its rarity ink. */
  function parts(e: any): { text: string; rarity?: string }[] {
    const name = e.itemId ? items[e.itemId]?.name : null;
    const rarity = e.rarity ?? (e.itemId ? itemRarity[e.itemId] : undefined);
    const i = name ? String(e.text).indexOf(name) : -1;
    if (!name || i < 0) return [{ text: e.text }];
    return [{ text: e.text.slice(0, i) }, { text: name, rarity }, { text: e.text.slice(i + name.length) }];
  }

  function onKey(ev: KeyboardEvent) {
    if (ev.key === 'Escape') { onClose(); return; }
    if (ev.key !== 'Tab' || !dlg) return;
    const f = [...dlg.querySelectorAll<HTMLElement>('button:not(:disabled)')];
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (ev.shiftKey && (document.activeElement === first || document.activeElement === dlg)) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  }
</script>

<svelte:window onkeydown={onKey} />
<div class="scrim" onclick={onClose} role="presentation">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="log-title" tabindex="-1" bind:this={dlg} onclick={(e) => e.stopPropagation()}>
    <header>
      <h2 id="log-title">Log</h2>
      <button type="button" class="btn ghost" onclick={onClose} aria-label="Close">✕</button>
    </header>
    <div class="chips" role="group" aria-label="Filter">
      {#each FILTERS as f (f.id)}
        <button type="button" class="btn chip" aria-pressed={filter === f.id} onclick={() => (filter = f.id)}>{f.label}</button>
      {/each}
    </div>
    {#if shown.length === 0}
      <p class="empty">{filter === 'all' ? 'Nothing yet. Start a job and your finds will be listed here.' : 'Nothing in this filter yet.'}</p>
    {:else}
      <ul>
        {#each shown as e (e.id)}
          <li>
            <div class="line">
              <span class="txt">{#each parts(e) as p}{#if p.rarity}<span class="it" style="color: var(--r-{p.rarity})">{p.text}</span>{:else}{p.text}{/if}{/each}</span>
              <span class="amt num">
                {#if e.gold}<span class:neg={e.gold < 0} class:pos={e.gold > 0}>{e.gold > 0 ? '+' : '−'}{fmtG(Math.abs(e.gold))}</span>
                {:else if e.qty}×{fmtN(e.qty)}{/if}
              </span>
            </div>
            <span class="when num">{fmtAgo(e.t, now)}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 40; background: var(--scrim); display: flex; align-items: flex-end; justify-content: center; }
  .sheet {
    width: 100%; max-width: var(--col); height: 80dvh; overflow-y: auto; display: flex; flex-direction: column; gap: 12px;
    padding: 12px var(--gut-r) calc(16px + env(safe-area-inset-bottom, 0px)) var(--gut-l);
    background: var(--paper); border: 1px solid var(--rule); border-bottom: 0; box-shadow: 0 -8px 24px var(--shadow);
  }
  header { display: flex; align-items: center; justify-content: space-between; }
  h2 { margin: 0; font: 600 var(--t-lg)/1.1 var(--f-display); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; flex: none; }
  .chip { padding: 0 12px; flex: none; }
  .empty { margin: 0; padding: 12px; background: var(--sunk); border: 1px solid var(--rule); color: var(--ink-3); font-size: var(--t-sm); }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  li { padding: 8px 12px; background: var(--sunk); border: 1px solid var(--rule-2); }
  .line { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
  .txt { font-size: var(--t-sm); color: var(--ink); min-width: 0; overflow-wrap: anywhere; }
  .it { font-weight: 700; }
  .amt { font-weight: 700; font-size: var(--t-sm); color: var(--ink-2); white-space: nowrap; }
  .pos { color: var(--ok); } .neg { color: var(--bad); }
  .when { color: var(--ink-3); font-size: var(--t-xs); }
</style>
