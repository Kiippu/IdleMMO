import { settings } from '../settings.svelte';
import { createSfx, type SfxName } from './sfx';

const sfx = createSfx({
  makeContext: () => {
    const Ctor = (globalThis as any).AudioContext ?? (globalThis as any).webkitAudioContext;
    try { return Ctor ? new Ctor() : null; } catch { return null; }
  },
  isMuted: () => settings.muted,
  isHidden: () => typeof document !== 'undefined' && document.hidden,
});

export const play = (name: SfxName) => sfx.play(name);

/** Wire the first-gesture unlock, the soft button tap and the hidden-page pause. Returns a cleanup. */
export function initSound(): () => void {
  const unlock = () => sfx.unlock();
  const onDown = (e: Event) => {
    sfx.unlock();
    const b = (e.target as Element | null)?.closest?.('button');
    if (b && !(b as HTMLButtonElement).disabled) sfx.play('tap');
  };
  const onVis = () => sfx.visibilityChanged();
  addEventListener('pointerdown', onDown, true);
  addEventListener('keydown', unlock, true);
  // iOS Safari only counts touchend / click as a gesture that may start audio, so unlock on those too.
  addEventListener('touchend', unlock, true);
  addEventListener('click', unlock, true);
  document.addEventListener('visibilitychange', onVis);
  return () => { removeEventListener('pointerdown', onDown, true); removeEventListener('keydown', unlock, true); removeEventListener('touchend', unlock, true); removeEventListener('click', unlock, true); document.removeEventListener('visibilitychange', onVis); };
}
