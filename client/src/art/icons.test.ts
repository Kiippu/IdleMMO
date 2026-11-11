import { describe, it, expect } from 'vitest';
import { DATA } from '@guildwright/engine';
import { ICONS, resolveIcon, resolveNamed } from './icons';

const items: Record<string, any> = (DATA as any).items;
const total = ICONS.cols * ICONS.rows;

describe('icon atlas manifest', () => {
  it('covers every engine item with its own icon', () => {
    const missing = Object.keys(items).filter((id) => ICONS.items[id] === undefined);
    expect(missing).toEqual([]);
    for (const id of Object.keys(items)) expect(resolveIcon(id, items[id]).fallback).toBe(false);
  });
  it('has no orphan item ids and every index is inside the atlas', () => {
    expect(Object.keys(ICONS.items).filter((id) => !items[id])).toEqual([]);
    const all = [...Object.values(ICONS.items), ...Object.values(ICONS.generic), ...Object.values(ICONS.named)];
    for (const i of all) expect(i >= 0 && i < total).toBe(true);
  });
  it('has a generic base for every sprite kind and category', () => {
    for (const it of Object.values(items)) {
      expect(ICONS.generic[it.sprite], `generic ${it.sprite}`).toBeDefined();
      expect(ICONS.generic[it.kind], `generic ${it.kind}`).toBeDefined();
    }
    expect(ICONS.generic.item).toBeDefined();
  });
  it('names the non-item icons the UI needs', () => {
    for (const n of ['gold', 'bond', 'hourglass', 'bag', 'chest']) expect(ICONS.named[n]).toBeDefined();
  });
});

describe('icon fallback', () => {
  it('unknown id with a sprite kind uses the tinted generic for that kind', () => {
    const r = resolveIcon('brand_new_ore', { sprite: 'ore', kind: 'material', tint: '#123456' });
    expect(r.fallback).toBe(true);
    expect(r.index).toBe(ICONS.generic.ore);
    expect(r.tint).toBe('#123456');
  });
  it('falls back to the category generic, then the generic item icon, never blank', () => {
    expect(resolveIcon('x', { sprite: 'nope', kind: 'gear' }).index).toBe(ICONS.generic.gear);
    expect(resolveIcon('x', { sprite: 'nope', kind: 'nope' }).index).toBe(ICONS.generic.item);
    expect(resolveIcon('x').index).toBe(ICONS.generic.item);
    expect(resolveNamed('nope').fallback).toBe(true);
  });
  it('maps an index to atlas col and row', () => {
    const r = resolveIcon('copper_ore', items.copper_ore);
    expect(r.col + r.row * ICONS.cols).toBe(r.index);
  });
});
