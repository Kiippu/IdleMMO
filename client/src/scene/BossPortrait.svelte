<script lang="ts">
  // Framed 44x44 boss portrait (Ninja Adventure facesets, CC0, remapped to DB32), whole-number scaled.
  import url from './art/bosses.png?url';
  import man from './art/bosses.json';
  let { bossId = null, name = '', scale = 2 }: { bossId?: string | null; name?: string; scale?: number } = $props();
  const S = man.size;
  const idx = $derived(Math.max(0, man.order.indexOf(bossId ?? '')));
  const known = $derived(!!bossId && man.order.includes(bossId));
</script>

{#if known}
  <div class="boss-portrait" role="img" aria-label={name ? `${name} portrait` : 'Boss portrait'}
    style:width="{S * scale}px" style:height="{S * scale}px"
    style:background-image="url({url})" style:background-size="{S * scale * man.order.length}px {S * scale}px"
    style:background-position="{-idx * S * scale}px 0"></div>
{/if}

<style>
  .boss-portrait { flex: none; image-rendering: pixelated; background-repeat: no-repeat; }
</style>
