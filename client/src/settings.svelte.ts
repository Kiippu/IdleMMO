// Player settings, persisted in localStorage (not in the game save).
import { parseSettings, SETTINGS_KEY as KEY, DEFAULT_SETTINGS, type Settings } from './settings-core';

function load(): Settings {
  try { return parseSettings(localStorage.getItem(KEY)); } catch { /* storage blocked */ }
  return { ...DEFAULT_SETTINGS };
}
export const settings = $state<Settings>(load());

function apply() {
  if (typeof document !== 'undefined') document.documentElement.toggleAttribute('data-reduce-motion', settings.reduceMotion);
}
export function setSetting<K extends keyof Settings>(k: K, v: Settings[K]) {
  settings[k] = v;
  try { localStorage.setItem(KEY, JSON.stringify($state.snapshot(settings))); } catch { /* ignore */ }
  apply();
}
apply();

/** True when the player turned reduced motion on here, or the device asks for it. */
export const reducedMotion = (): boolean =>
  settings.reduceMotion || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
