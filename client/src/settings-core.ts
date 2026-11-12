// Pure settings helpers (no Svelte runes) so they can be unit-tested.
export type Theme = 'dark' | 'light';
export const CRAFT_RARITIES = ['uncommon', 'rare', 'epic', 'legendary', 'mythic'] as const;
export type CraftRarity = (typeof CRAFT_RARITIES)[number];
export type Settings = { muted: boolean; reduceMotion: boolean; theme: Theme; craftCards: Record<CraftRarity, boolean> };
export const SETTINGS_KEY = 'guildwright-settings-v1';
export const DEFAULT_SETTINGS: Settings = { muted: false, reduceMotion: false, theme: 'dark', craftCards: { uncommon: true, rare: true, epic: true, legendary: true, mythic: true } };

/** Parse the stored JSON; anything malformed, or any wrongly typed field, falls back to the default. */
export function parseSettings(raw: string | null | undefined): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS, craftCards: { ...DEFAULT_SETTINGS.craftCards } };
  if (!raw) return out;
  try {
    const o = JSON.parse(raw);
    if (o && typeof o === 'object') {
      if (typeof o.muted === 'boolean') out.muted = o.muted;
      if (typeof o.reduceMotion === 'boolean') out.reduceMotion = o.reduceMotion;
      if (o.theme === 'dark' || o.theme === 'light') out.theme = o.theme;
      if (o.craftCards && typeof o.craftCards === 'object') {
        for (const r of CRAFT_RARITIES) if (typeof o.craftCards[r] === 'boolean') out.craftCards[r] = o.craftCards[r];
      }
    }
  } catch { /* bad JSON */ }
  return out;
}

/** Does a craft of this rarity show the full-screen card? Common and unknown rarities never do. */
export const craftCardOn = (s: Settings, rarity: string): boolean => (CRAFT_RARITIES as readonly string[]).includes(rarity) && s.craftCards[rarity as CraftRarity] === true;
