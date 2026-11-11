<script lang="ts">
  // One item icon from the shared atlas. 32px native, shown at 32 or 64 css px (whole-number scale, no smoothing).
  // Rarity is also shown by a corner shape (not colour alone): circle uncommon, square rare, diamond epic,
  // triangle legendary, star mythic. Grade 1 to 4 adds that many pips bottom left. `silhouette` hides the detail.
  import { DATA } from '@guildwright/engine';
  import { resolveIcon, resolveNamed, ICONS } from './icons';
  import atlas from './icons.png';

  type Props = { id?: string; named?: string; size?: 32 | 64; rarity?: string; grade?: number | null; silhouette?: boolean };
  let { id, named, size = 32, rarity, grade = null, silhouette = false }: Props = $props();

  const items: Record<string, { sprite?: string; kind?: string; tint?: string }> = (DATA as any).items ?? {};
  const r = $derived(named ? resolveNamed(named) : resolveIcon(id ?? '', id ? items[id] : undefined));
  const sc = $derived(size / ICONS.cell);
  const bg = $derived(`${-r.col * size}px ${-r.row * size}px / ${ICONS.cols * size}px ${ICONS.rows * size}px`);
  const shape = $derived(rarity && rarity !== 'common' ? rarity : null);
  const pips = $derived(grade && grade > 0 ? Math.min(4, grade) : 0);
</script>

<span class="ii" class:sil={silhouette} style:width="{size}px" style:height="{size}px" style:--ink-r={rarity ? `var(--r-${rarity})` : 'var(--ink)'} data-rarity={shape ?? undefined} data-fallback={r.fallback ? '1' : undefined} aria-hidden="true">
  <span class="px" style:background-image={`url(${atlas})`} style:background-position={`${-r.col * size}px ${-r.row * size}px`} style:background-size={`${ICONS.cols * size}px ${ICONS.rows * size}px`}></span>
  {#if r.fallback && r.tint}
    <span class="tn" style:background-color={r.tint} style:mask-image={`url(${atlas})`} style:-webkit-mask-image={`url(${atlas})`} style:mask-position={`${-r.col * size}px ${-r.row * size}px`} style:-webkit-mask-position={`${-r.col * size}px ${-r.row * size}px`} style:mask-size={`${ICONS.cols * size}px ${ICONS.rows * size}px`} style:-webkit-mask-size={`${ICONS.cols * size}px ${ICONS.rows * size}px`}></span>
  {/if}
  {#if shape}<span class="mk" data-s={shape}></span>{/if}
  {#if pips}<span class="gp">{#each Array(pips) as _}<i></i>{/each}</span>{/if}
</span>

<style>
  .ii { position: relative; display: inline-block; flex: none; isolation: isolate; vertical-align: middle; }
  .px, .tn { position: absolute; inset: 0; background-repeat: no-repeat; image-rendering: pixelated; mask-repeat: no-repeat; -webkit-mask-repeat: no-repeat; }
  .tn { mix-blend-mode: multiply; }
  .sil .px { filter: brightness(0); opacity: .35; }
  .sil .tn, .sil .mk, .sil .gp { display: none; }
  .mk { position: absolute; right: -1px; bottom: -1px; width: 9px; height: 9px; background: var(--ink-r); outline: 1px solid var(--paper); }
  .mk[data-s='uncommon'] { border-radius: 50%; }
  .mk[data-s='epic'] { clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); outline: 0; }
  .mk[data-s='legendary'] { clip-path: polygon(50% 0, 100% 100%, 0 100%); outline: 0; }
  .mk[data-s='mythic'] { width: 11px; height: 11px; outline: 0; clip-path: polygon(50% 0, 62% 36%, 100% 38%, 70% 60%, 80% 100%, 50% 76%, 20% 100%, 30% 60%, 0 38%, 38% 36%); }
  .gp { position: absolute; left: 1px; bottom: 1px; display: flex; gap: 1px; }
  .gp i { width: 3px; height: 3px; background: var(--ink); outline: 1px solid var(--paper); }
</style>
