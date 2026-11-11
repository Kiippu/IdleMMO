import { describe, it, expect } from 'vitest';
import { DATA } from '@guildwright/engine';
import { figure, MAN, backdropFor, BD, weaponKind, type Gear, type Equipped } from './sprites';

const items: Record<string, any> = (DATA as any).items;
const gearItems = Object.keys(items).filter((id) => items[id].slot);
const asGear = (id: string | undefined): Gear | null => (id ? { itemId: id, tier: items[id].tier ?? 1, role: items[id].role ?? '' } : null);
const slot = (s: string) => gearItems.filter((id) => items[id].slot === s);

describe('scene sprites', () => {
  it('every layer a figure draws exists in the atlas for its animation', () => {
    const skills = ['mining', 'woodcutting', 'smithing', 'smelting', 'cooking', 'guardian', 'mender', 'striker', 'fishing'];
    const pick = (a: (string | undefined)[], i: number) => a[i % a.length];
    const W = [undefined, ...slot('weapon')], Hd = [undefined, ...slot('head')], C = [undefined, ...slot('chest')], L = [undefined, ...slot('legs')];
    for (let i = 0; i < Math.max(W.length, Hd.length, C.length, L.length) * 2; i++) {
      const w = pick(W, i), h = pick(Hd, i * 3 + 1), c = pick(C, i * 5 + 2), l = pick(L, i * 7 + 3);
      const eq: Equipped = { weapon: asGear(w), head: asGear(h), chest: asGear(c), legs: asGear(l) };
      for (const sk of skills) for (const crew of [false, true]) {
        const f = figure(sk, true, eq, crew);
        for (const k of [...f.back, ...f.front]) {
          const pair = k.replace(/_(bg|fg)$/, (_m, p) => (p === 'bg' ? '_fg' : '_bg'));   // a weapon part with no pixels in this view is simply absent
          expect(MAN.layers[k]?.[f.anim] ?? (pair !== k ? MAN.layers[pair]?.[f.anim] : undefined), `${k}/${f.anim} (${sk} ${w} ${h} ${c} ${l})`).toBeTruthy();
        }
      }
    }
  });
  it('maps skills to known backdrops and tools', () => {
    for (const s of ((DATA as any).skills as any[])) expect(BD.names).toContain(backdropFor(s.id));
    expect(backdropFor(null)).toBe('yard');
    expect(figure('mining', true, { weapon: null, head: null, chest: null, legs: null }, false).front).toContain('pickaxe_fg');
    expect(figure('fishing', true, { weapon: null, head: null, chest: null, legs: null }, false).anim).toBe('fish');
    for (const sk of ['herbalism', 'cooking', 'alchemy', 'tailoring', 'carpentry', 'jewelcrafting']) expect(figure(sk, true, { weapon: null, head: null, chest: null, legs: null }, false).anim).not.toBe('idle');
    expect(weaponKind('iron_warhammer')).toBe('mace');
    expect(weaponKind('oak_longbow')).toBe('bow');
  });
});
