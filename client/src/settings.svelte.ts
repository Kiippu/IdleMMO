// Player settings, persisted in localStorage (not in the game save).
import { parseSettings, SETTINGS_KEY as KEY, DEFAULT_SETTINGS, type Settings, type Theme } from './settings-core';

function load(): Settings {
  try { return parseSettings(localStorage.getItem(KEY)); } catch { /* storage blocked */ }
  return parseSettings(null);
}
export const settings = $state<Settings>(load());

/** Browser chrome colour per theme (matches --plaster in app.css). */
export const THEME_COLOR: Record<Theme, string> = { dark: '#10141c', light: '#e2e5dc' };
function apply() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.toggleAttribute('data-reduce-motion', settings.reduceMotion);
  root.setAttribute('data-theme', settings.theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[settings.theme]);
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
