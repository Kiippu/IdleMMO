import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCredits, CREDITS } from './credits';
import { ICONS } from './icons';

describe('credits', () => {
  it('parses a table with extra or missing columns', () => {
    const rows = parseCredits('| Asset | Author | Licence | Link | Share-alike |\n| - | - | - | - | - |\n| Pack A | Ann | CC0 | https://a.example/x | No |\n| Pack B | Bo | CC-BY-SA 4.0 | [b](https://b.example) | Yes |\n');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ asset: 'Pack A', url: 'https://a.example/x', shareAlike: false });
    expect(rows[1]).toMatchObject({ url: 'https://b.example', shareAlike: true });
  });
  it('lists every pack used by the atlas, with author, licence and a link', () => {
    for (const key of new Set(Object.values(ICONS.pack))) {
      const slug = key === 'shikashi' ? 'shikashis-fantasy-icons' : key === 'kyrise' ? 'kyrises-free-16x16' : key === 'ninja' ? 'ninja-adventure' : key.replace('idylwild-', 'idylwilds-');
      const row = CREDITS.find((r) => r.url.includes(slug));
      expect(row, key).toBeDefined();
      expect(row!.author && row!.licence && row!.url).toBeTruthy();
    }
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
});
