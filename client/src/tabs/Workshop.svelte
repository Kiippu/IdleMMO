<script lang="ts">
  import { DATA } from '@guildwright/engine';
  import { engine } from '../engine/store.svelte';
  import { engineClient } from '../engine/client';
  import { fmtN } from '../format';

  type Skill = { id: string; name: string; tier: string; blurb: string };
  type Action = { id: string; skill: string; kind: string; name: string; level?: number; sec?: number; xp?: number };

  const skills: Skill[] = (DATA as any).skills;
  const actionsAll: Action[] = (DATA as any).actions;

  const tierOrder = ['gathering', 'refining', 'crafting', 'combat'] as const;
  const tierLabel: Record<string, string> = {
    gathering: 'Gather',
    refining: 'Refine',
    crafting: 'Craft',
    combat: 'Fight',
  };

  // Group skills by tier up front; actions by skill, sorted by unlock level.
  const skillsByTier: Record<string, Skill[]> = {};
  for (const s of skills) (skillsByTier[s.tier] ||= []).push(s);
  const actionsBySkill: Record<string, Action[]> = {};
  for (const a of actionsAll) (actionsBySkill[a.skill] ||= []).push(a);
  for (const id of Object.keys(actionsBySkill)) {
    actionsBySkill[id].sort((a, b) => (a.level ?? 1) - (b.level ?? 1));
  }

  let state = $derived(engine.snapshot);
  let view = $derived(engine.derived);
  let active = $derived(state?.active ?? null);
  const fmtSec = (s: number | undefined) => (s && isFinite(s) ? `${s.toFixed(1)}s` : '—');

  function levelOf(skillId: string): number {
    return view?.skillLevels?.[skillId] ?? 0;
  }
  function capNote(skillId: string): string {
    const p = view?.skillProgress?.[skillId];
    return p?.capped ? ' (cap)' : '';
  }

  async function start(id: string) {
    try { await engineClient.start(id); }
    catch (err) { console.error('start failed', err); }
  }
</script>

{#each tierOrder as tier}
  {#if skillsByTier[tier]?.length}
    <section class="tier">
      <h3>{tierLabel[tier]}</h3>
      {#each skillsByTier[tier] as skill (skill.id)}
        {@const lvl = levelOf(skill.id)}
        <article class="skill">
          <header>
            <span class="skill-name">{skill.name}</span>
            <span class="skill-lvl">Lv <span class="num">{lvl}</span>{capNote(skill.id)}</span>
          </header>
          <p class="blurb">{skill.blurb}</p>
          <ul class="actions">
            {#each actionsBySkill[skill.id] ?? [] as act (act.id)}
              {@const locked = lvl < (act.level ?? 1)}
              {@const running = active?.actionId === act.id}
              <li>
                <button
                  type="button"
                  class="action"
                  data-kind={act.kind}
                  aria-pressed={running}
                  disabled={locked}
                  onclick={() => start(act.id)}
                >
                  <span class="a-name">{act.name}</span>
                  <span class="a-req">
                    {#if locked}Lv {act.level}{:else}{fmtSec(view?.actionTimes?.[act.id])}{/if}
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        </article>
      {/each}
    </section>
  {/if}
{/each}

<style>
  /* Local layout; tokens from app.css. */
  section + section { margin-top: 20px; }

  .tier h3 {
    margin: 0 0 10px; font: 400 var(--t-xs)/1 var(--f-label); color: var(--ink-3);
    letter-spacing: .08em; text-transform: uppercase;
  }

  .skill { padding: 12px; background: var(--paper); border: 1px solid var(--rule); }
  .skill + .skill { margin-top: 10px; }
  .skill header {
    display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
  }
  .skill-name { font: 600 var(--t-md)/1.1 var(--f-display); color: var(--ink); }
  .skill-lvl { font: 700 var(--t-sm)/1 var(--f-body); color: var(--ink-3); }
  .blurb { margin: 4px 0 10px; color: var(--ink-2); font-size: var(--t-sm); }

  .actions { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }

  .action {
    width: 100%; min-height: 44px;
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 8px 12px; border: 1px solid var(--rule); background: var(--sunk);
    text-align: left;
  }
  .action:hover:not(:disabled) { background: var(--woad-soft); border-color: var(--woad); }
  .action:disabled { opacity: .5; cursor: not-allowed; }
  .action[aria-pressed="true"],
  .action[aria-pressed="true"]:hover:not(:disabled) { background: var(--woad); color: var(--on-woad); border-color: var(--woad); }
  .action[aria-pressed="true"] .a-name,
  .action[aria-pressed="true"] .a-req { color: var(--on-woad); opacity: 1; }
  .a-name { font: 500 var(--t-sm)/1.1 var(--f-body); }
  .a-req { font: 700 var(--t-sm)/1 var(--f-num); font-variant-numeric: tabular-nums; color: var(--ink-3); }
</style>
