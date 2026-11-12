import { describe, it, expect } from 'vitest';
import { parseSettings, DEFAULT_SETTINGS, craftCardOn } from './settings-core';

describe('craft card settings', () => {
  it('defaults all rarities on', () => {
    const s = parseSettings(null);
    expect(Object.values(s.craftCards).every(Boolean)).toBe(true);
    expect(Object.keys(s.craftCards)).toEqual(['uncommon', 'rare', 'epic', 'legendary', 'mythic']);
  });
  it('accepts old stored settings without the field', () => {
    const s = parseSettings(JSON.stringify({ muted: true, reduceMotion: false, theme: 'light' }));
    expect(s.muted).toBe(true);
    expect(s.theme).toBe('light');
    expect(s.craftCards).toEqual(DEFAULT_SETTINGS.craftCards);
  });
  it('falls back per key', () => {
    const s = parseSettings(JSON.stringify({ craftCards: { uncommon: false, rare: 'no', epic: false } }));
    expect(s.craftCards).toEqual({ uncommon: false, rare: true, epic: false, legendary: true, mythic: true });
  });
  it('ignores a non-object field and does not share defaults', () => {
    expect(parseSettings(JSON.stringify({ craftCards: 5 })).craftCards).toEqual(DEFAULT_SETTINGS.craftCards);
    const a = parseSettings(null); a.craftCards.rare = false;
    expect(DEFAULT_SETTINGS.craftCards.rare).toBe(true);
  });
  it('craftCardOn', () => {
    const s = parseSettings(JSON.stringify({ craftCards: { epic: false } }));
    expect(craftCardOn(s, 'epic')).toBe(false);
    expect(craftCardOn(s, 'rare')).toBe(true);
    expect(craftCardOn(s, 'common')).toBe(false);
  });
});
