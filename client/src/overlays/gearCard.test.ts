import { describe, it, expect } from 'vitest';
import { tierInk, topPct, splitAffix, affixDetail, isPrimaryAffix, footerText, cardRows, elementLines, arrow, arrowText, makerText, isGilt, statIconKey, type CardDetail } from './gearCard';

const base = { uid: 'u', itemId: 'steel_sword', name: 'Steel sword', section: 'fight', slot: 'weapon', type: 'sword', material: 'steel', tier: 3, rarity: 'rare', grade: 2, gradeName: 'Fine', value: 120, worn: null, equipped: false, inLoadout: false, effects: [], affixes: [], repair: null, compare: null } as any;

describe('gear card helpers', () => {
  it('builds rows from stats, leaving element and ward lines for the element bar', () => {
    const d: CardDetail = { ...base, stats: [{ key: 'atk', label: 'Attack', value: 143 }, { key: 'fire', label: 'Fire damage', value: 3.3, unit: 'pct', text: 'Fire damage +3.3%' }, { key: 'ward_frost', label: 'Frost resistance', value: 2, unit: 'pct' }] };
    expect(cardRows(d).map((r) => r.key)).toEqual(['atk']);
    expect(elementLines(d)).toEqual([
      { key: 'fire', element: 'fire', ward: false, text: 'Fire damage +3.3%' },
      { key: 'ward_frost', element: 'frost', ward: true, text: 'Frost resistance +2%' },
    ]);
  });
  it('prefers the engine statRows and carries compare deltas', () => {
    const d: CardDetail = { ...base, stats: [], statRows: [{ key: 'atk', label: 'Attack', icon: 'stat_atk', valueText: '143', value: 143 }], compare: { diff: [{ key: 'atk', label: 'Attack', unit: 'pts', mine: 143, theirs: 40, delta: 103 }], effects: [] } as any };
    expect(cardRows(d)).toEqual([{ key: 'atk', label: 'Attack', icon: 'stat_atk', text: '143', value: 143, delta: 103 }]);
  });
  it('tool effects become rows with a compare delta', () => {
    const d: CardDetail = { ...base, section: 'tool', stats: [], effects: [{ key: 'speed', label: 'Speed', value: 1.8, unit: 'pct', text: '' }], compare: { diff: [], effects: [{ key: 'speed', label: 'Speed', value: 1, unit: 'pct', text: '' }] } as any };
    const r = cardRows(d)[0];
    expect(r).toMatchObject({ key: 'speed', icon: 'fx_speed', text: '+1.8%', delta: 0.8 });
  });
  it('arrows, maker text, gilt, icon keys', () => {
    expect([arrow(3), arrow(-1), arrow(0), arrow(null)]).toEqual(['up', 'down', 'same', '']);
    expect(arrowText(103)).toBe('▲ 103'); expect(arrowText(-0.5)).toBe('▼ 0.5'); expect(arrowText(0)).toBe('=');
    expect(makerText({ kind: 'crafted', name: 'Ada' })).toBe('Made by Ada'); expect(makerText({ kind: 'raid' })).toBe('Found in a raid');
    expect(makerText({ kind: 'crafted', text: 'Made by You' })).toBe('Made by You'); expect(makerText({ kind: 'unknown', text: null })).toBeNull();
    expect(footerText({ ...base, sellPrice: 0 }).note).toMatch(/Starter kit/); expect(footerText({ ...base, sellPrice: 40, salvage: [] })).toEqual({ gold: 40, salvage: null, note: null });
    expect(footerText({ ...base, sellPrice: 40, salvage: [{ itemId: 'bronze_bar', grade: 1, qtyMin: 2, qtyMax: 4 }] }, () => 'Bronze bar').salvage).toBe('Salvage: 2–4 bronze bars');
    expect(makerText({ kind: 'unknown' })).toBeNull(); expect(makerText(undefined)).toBeNull();
    expect(isGilt('rare')).toBe(false); expect(isGilt('epic')).toBe(true);
    expect(statIconKey('ward_holy')).toBe('ward'); expect(statIconKey('hp')).toBe('stat_hp');
  });
  it('roll colours: tier ink, top percent, detail line', () => {
    expect(['common', 'uncommon', 'rare', 'epic', 'legendary'].map(tierInk)).toEqual(['common', 'uncommon', 'rare', 'epic', 'legendary'].map((r) => `var(--r-${r})`));
    expect(tierInk(undefined)).toBeNull(); expect(tierInk('mythic')).toBeNull();
    expect(topPct(0.95)).toBe(5); expect(topPct(1)).toBe(1); expect(topPct(0.2)).toBe(80);
    expect(splitAffix('Savage: Attack +21')).toEqual({ head: 'Savage:', value: 'Attack +21' }); expect(splitAffix('Hale')).toEqual({ head: '', value: 'Hale' });
    expect(affixDetail({ id: 'a', name: 'x', label: 'x', valueText: '+3.3%', rangeText: '+2.4% to +3.6%', rollPct: 0.95 })).toBe('+3.3% · range +2.4% to +3.6% · top 5% roll');
    expect(affixDetail({ id: 'a', name: 'x', label: 'x', primary: true })).toBeNull(); expect(affixDetail({ id: 'e', name: 'Enduring', label: 'x', fixed: true })).toBeNull();
    expect(isPrimaryAffix({ id: 'a', name: '', label: '' }, 0)).toBe(true); expect(isPrimaryAffix({ id: 'a', name: '', label: '', primary: false }, 0)).toBe(false);
  });
  it('salvage with a zero minimum reads "up to"', () => {
    const t = footerText({ sellPrice: 10, salvage: [{ itemId: 'x', grade: 1, qtyMin: 0, qtyMax: 1 }] } as any, () => 'Yew plank');
    expect(t.salvage).toBe('Salvage: up to 1 yew plank');
  });
});
