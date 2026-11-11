// Pure settings helpers (no Svelte runes) so they can be unit-tested.
export type Theme = 'dark' | 'light';
export type Settings = { muted: boolean; reduceMotion: boolean; theme: Theme };
export const SETTINGS_KEY = 'guildwright-settings-v1';
export const DEFAULT_SETTINGS: Settings = { muted: false, reduceMotion: false, theme: 'dark' };

/** Parse the stored JSON; anything malformed, or any wrongly typed field, falls back to the default. */
export function parseSettings(raw: string | null | undefined): Settings {
  const out = { ...DEFAULT_SETTINGS };
  if (!raw) return out;
  try {
    const o = JSON.parse(raw);
    if (o && typeof o === 'object') {
      if (typeof o.muted === 'boolean') out.muted = o.muted;
      if (typeof o.reduceMotion === 'boolean') out.reduceMotion = o.reduceMotion;
      if (o.theme === 'dark' || o.theme === 'light') out.theme = o.theme;
    }
  } catch { /* bad JSON */ }
  return out;
}
