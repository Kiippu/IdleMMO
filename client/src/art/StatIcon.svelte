<script lang="ts">
  // A 16px stat / effect / badge icon from the shared atlas. Drawn at 16px and stored at 2x in the 32px cell, so it is crisp at 16
  // (half scale, exact) and at 32 (native). Keys: stat_atk stat_def stat_heal stat_hp el_fire el_frost el_venom el_holy ward
  // fx_speed fx_double fx_save fx_quality fx_find fx_rarity badge_crafted badge_raid badge_starter badge_shop.
  // Usage: <StatIcon name="stat_atk" /> or <StatIcon name="badge_raid" size={32} />. Decorative (aria-hidden); put the label next to it.
  import { resolveNamed, ICONS } from './icons';
  import atlas from './icons.png';
  type Props = { name: string; size?: 16 | 32 };
  let { name, size = 16 }: Props = $props();
  const r = $derived(resolveNamed(name));
</script>

<span class="si" style:width="{size}px" style:height="{size}px" data-fallback={r.fallback ? '1' : undefined} aria-hidden="true"
  style:background-image={`url(${atlas})`} style:background-position={`${-r.col * size}px ${-r.row * size}px`} style:background-size={`${ICONS.cols * size}px ${ICONS.rows * size}px`}></span>

<style>
  .si { display: inline-block; flex: none; vertical-align: middle; background-repeat: no-repeat; image-rendering: pixelated; }
</style>
