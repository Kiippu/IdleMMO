import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCredits, CREDITS } from './credits';
import { ICONS } from './icons';
import hero from '../scene/art/hero.json';

describe('credits', () => {
  it('parses a table with extra or missing columns', () => {
    const rows = parseCredits('| Asset | Author | Licence | Link | Share-alike |\n| - | - | - | - | - |\n| Pack A | Ann | CC0 | https://a.example/x | No |\n| Pack B | Bo | CC-BY-SA 4.0 | [b](https://b.example) | Yes |\n');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ asset: 'Pack A', url: 'https://a.example/x', shareAlike: false });
    expect(rows[1]).toMatchObject({ url: 'https://b.example', shareAlike: true });
  });
  it('lists every pack used by the atlas, with author, licence and a link', () => {
    for (const key of new Set(Object.values(ICONS.pack))) {
      if (key === 'own') continue; // our own drawn icons have their own row (checked below)
      const slug = key === 'shikashi' ? 'shikashis-fantasy-icons' : key === 'kyrise' ? 'kyrises-free-16x16' : key === 'ninja' ? 'ninja-adventure' : key.replace('idylwild-', 'idylwilds-');
      const row = CREDITS.find((r) => r.url.includes(slug));
      expect(row, key).toBeDefined();
      expect(row!.author && row!.licence && row!.url).toBeTruthy();
    }
  });
  it('credits Seveneves AI with both links, the licence wording and the how-made note', () => {
    const r = CREDITS.find((x) => x.asset.includes('Seveneves AI'));
    expect(r).toBeDefined();
    expect(r!.url).toContain('sevenevesai.itch.io/1000-modern-rpg-icon-pack');
    expect(r!.licence).toMatch(/no attribution required/);
    expect(r!.licence).toMatch(/no reselling or redistributing/);
    expect(r!.note).toMatch(/hand-crafted/);
  });
  it('lists the bundled fonts and the palette', () => {
    const names = CREDITS.map((r) => r.asset).join(' ');
    for (const n of ['Atkinson Hyperlegible', 'Pixelify Sans', 'Silkscreen', 'DawnBringer']) expect(names).toContain(n);
  });
  it('bundled fonts in package.json are all credited', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8'));
    const fonts = Object.keys(pkg.dependencies ?? {}).filter((d) => d.startsWith('@fontsource/'));
    expect(fonts.length).toBeGreaterThan(0);
    const all = CREDITS.map((r) => r.asset.toLowerCase().replace(/[^a-z]/g, '')).join('|');
    for (const f of fonts) expect(all).toContain(f.split('/')[1].replace(/-/g, ''));
  });
  it('credits every shipped LPC hero layer and the Ninja Adventure pack', () => {
    const text = CREDITS.map((r) => r.asset).join('\n');
    const path: Record<string, string> = {
      body: 'body/bodies/male', head: 'head/heads/human/male', hair: 'hair/plain', boots: 'feet/boots/basic', pants: 'legs/pants/male',
      legs_plate: 'legs/armour/plate', t_plate: 'torso/armour/plate/male', t_chain: 'torso/chainmail', t_leather: 'torso/armour/leather',
      t_cloth: 'torso/clothes/longsleeve/longsleeve2', shirt: 'torso/clothes/longsleeve/longsleeve2', h_kettle: 'hat/helmet/kettle', h_mail: 'hat/helmet/mail', h_cap: 'hat/cloth/leather_cap', h_hood: 'hat/cloth/hood',
      sword: 'weapon/sword/arming', mace: 'weapon/blunt/mace', staff: 'weapon/magic/simple', bow: 'weapon/ranged/bow/normal',
      pickaxe: 'tools/pickaxe', axe: 'tools/axe', hammer: 'tools/hammer', rod: 'tools/fishing_rod',
      sh_buckler: 'shield/spartan', sh_aegis: 'shield/spartan', sh_kite: 'shield/crusader', sh_tower: 'shield/plus',
    };
    for (const key of Object.keys((hero as any).layers)) {
      const base = key.replace(/^c_/, '').replace(/_(fg|bg)$/, '').replace(/_(bronze|iron|steel|gold)$/, '');
      const p = path[base];
      expect(p, `no credit path for hero layer ${key}`).toBeDefined();
      expect(text, key).toContain(p);
    }
    expect(text).not.toMatch(/(thin|female|teen)\)/);
    expect(CREDITS.some((r) => r.url.includes('ninja-adventure-asset-pack') && /Boss Faceset/.test(r.note))).toBe(true);
    expect(CREDITS.some((r) => r.url.includes('LiberatedPixelCup'))).toBe(true);
    expect(CREDITS.every((r) => !r.shareAlike)).toBe(true);
  });
});
