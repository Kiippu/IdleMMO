<script lang="ts">
  const tabs = ['Workshop', 'Stores', 'Market', 'War Room', 'Crew'] as const;
  let active = $state<(typeof tabs)[number]>('Workshop');
</script>

<div class="shell">
  <header class="topbar"><span class="brand">Guildwright</span></header>
  <main class="panel">
    <h1>{active}</h1>
    <p>Placeholder screen. No game logic yet.</p>
  </main>
</div>

<nav class="tabbar" aria-label="Main">
  <div class="row">
    {#each tabs as tab}
      <button type="button" aria-current={active === tab ? 'page' : undefined} onclick={() => (active = tab)}>
        {tab}
      </button>
    {/each}
  </div>
</nav>
