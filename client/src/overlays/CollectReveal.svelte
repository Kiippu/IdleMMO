<script lang="ts">
  // Sheet shown on cold boot and on resume when the engine's applyOffline
  // reports >= 60 seconds of catch-up. The engine already applied the gains
  // in-place; this is pure presentation. Dismissing clears engine.offline
  // on the main thread; the next resume with >60s will set it again.
  import { DATA } from '@guildwright/engine';
  import { engine } from '../engine/store.svelte';

  const items: Record<string, { id?: string; name?: string }> = (DATA as any).items;
  const skills: Array<{ id: string; name: string }> = (DATA as any).skills;
  const itemName = (id: string) => items[id]?.name ?? id;
  const skillName = (id: string) => skills.find((s) => s.id === id)?.name ?? id;

  let summary = $derived(engine.offline);
  let itemsList = $derived(
    summary ? Object.entries(summary.items).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]) : [],
  );
  let xpList = $derived(
    summary ? Object.entries(summary.xp).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]) : [],
  );
  let craftsList = $derived(
    summary ? Object.entries(summary.crafts).filter(([, n]) => n > 0) : [],
  );
  let hasAny = $derived(
    !!summary && (
      itemsList.length > 0 || xpList.length > 0 || craftsList.length > 0 ||
      summary.gold !== 0 || summary.kills > 0 || summary.assisted > 0 ||
      summary.tips > 0 || summary.weeks > 0
    ),
  );

  function dismiss() { engine.offline = null; }
</script>

{#if summary}
  <aside class="reveal">
    <header>
      <h2>While you were away</h2>
      {#if summary.weeks}
        <p class="sub">{summary.weeks} {summary.weeks === 1 ? 'week' : 'weeks'} passed on the calendar.</p>
      {/if}
    </header>

    {#if hasAny}
      <dl class="totals">
        {#if summary.gold}<div><dt>Gold</dt><dd>{summary.gold}g</dd></div>{/if}
        {#if summary.kills}<div><dt>Kills</dt><dd>{summary.kills}</dd></div>{/if}
        {#if summary.assisted}<div><dt>Crew assists</dt><dd>{summary.assisted}</dd></div>{/if}
        {#if summary.tips}<div><dt>Crew tips</dt><dd>{summary.tips}g</dd></div>{/if}
      </dl>

      {#if itemsList.length}
        <section>
          <h3>Items</h3>
          <ul>
            {#each itemsList as [id, qty]}
              <li><span>{itemName(id)}</span><strong>×{qty}</strong></li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if xpList.length}
        <section>
          <h3>XP gained</h3>
          <ul>
            {#each xpList as [id, xp]}
              <li><span>{skillName(id)}</span><strong>{Math.round(xp as number)}</strong></li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if craftsList.length}
        <section>
          <h3>Crafts by rarity</h3>
          <ul>
            {#each craftsList as [rarity, n]}
              <li><span>{rarity}</span><strong>×{n}</strong></li>
            {/each}
          </ul>
        </section>
      {/if}
    {:else}
      <p class="sub">The game ticked but nothing changed — you weren't working on anything.</p>
    {/if}

    {#if summary.stoppedReason}
      <p class="stopped">{summary.stoppedReason}</p>
    {/if}

    <button type="button" onclick={dismiss}>Got it</button>
  </aside>
{/if}

<style>
  .reveal {
    margin: 12px -8px 0; padding: 14px;
    background: var(--paper); border: 1px solid var(--rule);
    display: grid; gap: 12px;
  }
  header h2 { margin: 0; font: 600 var(--t-lg)/1.1 var(--f-display); }
  header .sub { margin: 4px 0 0; color: var(--ink-2); font-size: var(--t-sm); }

  .totals {
    margin: 0; padding: 0;
    display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 8px;
  }
  .totals div {
    padding: 8px; background: var(--sunk); border: 1px solid var(--rule);
    display: grid; gap: 2px;
  }
  .totals dt {
    margin: 0; font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3);
    letter-spacing: .04em; text-transform: uppercase;
  }
  .totals dd { margin: 0; font: 600 var(--t-md)/1 var(--f-display); color: var(--ink); }

  section h3 {
    margin: 0 0 6px; font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3);
    letter-spacing: .08em; text-transform: uppercase;
  }
  section ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  section li {
    display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
    padding: 4px 8px; background: var(--sunk); border: 1px solid var(--rule-2);
    font-size: var(--t-sm);
  }
  section li strong { color: var(--ink); font-weight: 600; }

  .stopped { margin: 0; padding: 8px; background: var(--sunk); border: 1px solid var(--rule); color: var(--warn); font-size: var(--t-sm); }

  .reveal > button {
    justify-self: end; padding: 8px 16px; border: 1px solid var(--woad); background: var(--woad);
    color: var(--on-woad); font: 400 var(--t-xs)/1 var(--f-label); letter-spacing: .04em; text-transform: uppercase;
  }
</style>
