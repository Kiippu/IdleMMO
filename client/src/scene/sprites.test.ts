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
  it('every offhand and every weapon type has a worn look in the atlas', () => {
    const none = { weapon: null, head: null, chest: null, legs: null };
    for (const id of slot('offhand')) {
      const f = figure('guardian', true, { ...none, offhand: asGear(id) }, false);
      const keys = [...f.back, ...f.front].filter((k) => /^(sh_|w_pd)/.test(k));
      expect(keys.length, id).toBeGreaterThan(0);
      for (const k of keys) expect(MAN.layers[k]?.[f.anim] ?? MAN.layers[k.replace(/_(bg|fg)$/, (_m, p) => (p === 'bg' ? '_fg' : '_bg'))]?.[f.anim], `${id} ${k}`).toBeTruthy();
    }
    const kinds = new Set(slot('weapon').map((id) => weaponKind(id)));
    for (const k of ['sword', 'axe', 'dagger', 'spear', 'bow', 'greatsword', 'mace', 'warhammer', 'halberd', 'wand', 'scepter', 'staff']) expect(kinds.has(k as any), k).toBe(true);
  });
  it('maps skills to known backdrops and tools', () => {
    for (const s of ((DATA as any).skills as any[])) expect(BD.names).toContain(backdropFor(s.id));
    expect(backdropFor(null)).toBe('yard');
    expect(figure('mining', true, { weapon: null, head: null, chest: null, legs: null }, false).front).toContain('pickaxe_fg');
    expect(figure('fishing', true, { weapon: null, head: null, chest: null, legs: null }, false).anim).toBe('fish');
    for (const sk of ['herbalism', 'cooking', 'alchemy', 'tailoring', 'carpentry', 'jewelcrafting']) expect(figure(sk, true, { weapon: null, head: null, chest: null, legs: null }, false).anim).not.toBe('idle');
    for (const [id, k] of Object.entries({ bronze_sword: 'sword', iron_greatsword: 'greatsword', steel_dagger: 'dagger', bronze_axe: 'axe', iron_spear: 'spear', yew_bow: 'bow', bronze_mace: 'mace', iron_warhammer: 'warhammer', stoneheart_maul: 'warhammer', steel_halberd: 'halberd', oak_wand: 'wand', iron_scepter: 'scepter', pine_staff: 'staff', frostbite_saber: 'sword' })) expect(weaponKind(id), id).toBe(k);
    expect(weaponKind('bronze_parrying_dagger')).toBeNull();
  });
});
