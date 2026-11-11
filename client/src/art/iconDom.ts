// Imperative icon element for animations that build DOM by hand (the collect fountain). Same atlas as ItemIcon.
import { ICONS, resolveIcon, resolveNamed } from './icons';
import atlas from './icons.png';

export function iconEl(opts: { id?: string; named?: string; size?: 32 | 64 }, meta?: { sprite?: string; kind?: string; tint?: string | null }): HTMLSpanElement {
  const size = opts.size ?? 32;
  const r = opts.named ? resolveNamed(opts.named) : resolveIcon(opts.id ?? '', meta);
  const el = document.createElement('span');
  el.style.cssText = `display:block;width:${size}px;height:${size}px;image-rendering:pixelated;background:url(${atlas}) ${-r.col * size}px ${-r.row * size}px / ${ICONS.cols * size}px ${ICONS.rows * size}px no-repeat;`;
  return el;
}
