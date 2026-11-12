import { describe, it, expect } from 'vitest';
import { CREDITS, parseCredits } from './credits';

describe('credits links', () => {
  it('collects every link in a cell', () => {
    const r = parseCredits('| Asset | Author | Licence | Link |\n| - | - | - | - |\n| A | b | c | https://x.example/a https://y.example/ |\n| Own | us | own | - |\n');
    expect(r[0].urls).toEqual(['https://x.example/a', 'https://y.example/']);
    expect(r[1].urls).toEqual([]);
  });
  it('Seveneves has both its site and the pack page; own tool icons are credited', () => {
    const s = CREDITS.find((x) => x.asset.includes('Seveneves AI'))!;
    expect(s.urls).toContain('https://seveneves.ai/pixels/');
    expect(s.urls.some((u) => u.includes('sevenevesai.itch.io/1000-modern-rpg-icon-pack'))).toBe(true);
    const own = CREDITS.find((x) => /^Tool icons:/.test(x.asset))!;
    expect(own).toBeDefined();
    for (const t of ['sickle', 'bellows', 'chisel', 'needle', 'gem file', 'mortar', 'rolling pin']) expect(own.asset.toLowerCase()).toContain(t);
  });
});
