// QoL pass 2026-11-11: salvage by rarity, discovery (state.seen + codex), encyclopedia catalog.
import { describe, expect, it } from 'vitest';
import { freshEngine, START } from './engine-helpers';

const piece = (s: any, uid: string, itemId: string, rarity: string, quality = 50) => {
  const g = { uid, itemId, rarity, quality, affixes: [], dur: 100, maxDur: 100 }; s.gear.push(g); return g;
};

describe('salvage', () => {
  it('returns ECON.salvagePct of recipe inputs by rarity, at the quality grade; preview brackets the result', async () => {
    const { E, mod } = await freshEngine();
    const s = E.newState();
    expect(mod.ECON.salvagePct).toEqual({ common: 0.2, uncommon: 0.4, rare: 0.6, epic: 0.75, legendary: 0.9, mythic: 1 });
    const rec = mod.DATA.actions.find((a: any) => a.kind === 'craft' && a.outputs.bronze_sword);
    for (const [rar, pct] of Object.entries(mod.ECON.salvagePct) as [string, number][]) {
      const uids = Array.from({ length: 40 }, (_, i) => piece(s, `x${rar}${i}`, 'bronze_sword', rar, 70).uid);
      const pv = E.salvagePreview(s, uids, { allowProtected: true });
      expect(pv.gearCount).toBe(40); expect(pv.blocked).toEqual([]);
      const before: Record<string, number> = {};
      Object.keys(rec.inputs).forEach((id) => { before[id] = (s.inv[id] || [0, 0, 0, 0, 0])[2]; });
      const r = E.salvage(s, uids, { allowProtected: true });
      expect(r.ok).toBe(true); expect(r.salvaged).toBe(40);
      Object.keys(rec.inputs).forEach((id) => {
        const line = pv.items.find((x: any) => x.itemId === id);
        expect(line.grade).toBe(2); // quality 70 = Fine
        expect(line.expected).toBeCloseTo(rec.inputs[id] * pct * 40, 1);
        const got = ((s.inv[id] || [0, 0, 0, 0, 0])[2]) - before[id];
        expect(got).toBeGreaterThanOrEqual(line.qtyMin); expect(got).toBeLessThanOrEqual(line.qtyMax);
      });
    }
    expect(E.events(s)[0]).toMatchObject({ cat: 'loot', qty: 40 });
    expect(E.events(s)[0].text).toMatch(/^Salvaged 40 items → /);
  });

  it('protects equipped, loadout and rare+ pieces unless allowed (equipped always refused)', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    const eq = s.equipped.weapon;
    const inLoadout = piece(s, 'gL', 'bronze_sword', 'common'); E.saveLoadout(s, { name: 'L', slots: Object.assign({}, s.equipped, { weapon: 'gL' }) });
    const rare = piece(s, 'gR', 'bronze_sword', 'rare'); const plain = piece(s, 'gP', 'bronze_sword', 'uncommon');
    const pv = E.salvagePreview(s, [eq, inLoadout.uid, rare.uid, plain.uid, 'nope']);
    expect(pv.gearCount).toBe(1);
    expect(pv.blocked.map((b: any) => b.uid).sort()).toEqual([eq, 'gL', 'gR', 'nope'].sort());
    const r = E.salvage(s, [eq, inLoadout.uid, rare.uid, plain.uid]);
    expect(r.salvaged).toBe(1); expect(s.gear.some((g: any) => g.uid === 'gP')).toBe(false);
    expect(s.gear.some((g: any) => g.uid === 'gR')).toBe(true);
    const r2 = E.salvage(s, [eq, 'gL', 'gR'], { allowProtected: true });
    expect(r2.salvaged).toBe(2); expect(r2.blocked).toEqual([{ uid: eq, reason: expect.stringMatching(/Equipped/) }]);
    expect(E.salvage(s, [eq]).ok).toBe(false);
  });

  it('is deterministic under the seeded RNG', async () => {
    const run = async () => {
      const { E } = await freshEngine(9);
      const s = E.newState();
      const uids = Array.from({ length: 10 }, (_, i) => piece(s, 'd' + i, 'iron_longsword', 'common').uid);
      return E.salvage(s, uids).items;
    };
    expect(await run()).toEqual(await run());
  });
});

describe('discovery and codex', () => {
  it('touching items marks them seen; codex rules for raw and craftable items', async () => {
    const h = await freshEngine();
    const { E } = h;
    const s = E.newState();
    let c = E.codex(s).items;
    expect(c.bread.status).toBe('known'); // starter item
    expect(c.copper_ore.status).toBe('hint'); // level-1 gather: within reach
    expect(c.mithril_ore.status).toBe('hidden'); // far above mining 1
    expect(c.wyrm_core.status).toBe('hidden'); // boss loot
    expect(c.bronze_bar.status).toBe('hidden'); // no input touched yet
    E.start(s, 'mine_copper'); for (let i = 0; i < 10; i++) E.tick(s, 1);
    expect(s.seen.copper_ore).toBe(true);
    c = E.codex(s).items;
    expect(c.copper_ore.status).toBe('known');
    expect(c.bronze_bar).toMatchObject({ status: 'hint', inputsSeen: 1, inputsTotal: 2 });
    E.start(s, 'mine_tin'); for (let i = 0; i < 10; i++) E.tick(s, 1);
    expect(E.codex(s).items.bronze_bar).toMatchObject({ status: 'known', inputsSeen: 2, touched: false });
    // store buy and vault holdings count
    s.gold = 1e6; const v = E.storeView(s); E.storeBuy(s, v.slots[0].slot, 1);
    expect(s.seen[v.slots[0].itemId]).toBe(true);
    s.crew.vault.inv.ruby = [0, 1, 0, 0, 0]; E.tick(s, 1);
    expect(s.seen.ruby).toBe(true);
  });

  it('demand lists what open contracts still want', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    const k = E.listContracts(s).find((x: any) => x.status === 'open' && x.capacity > 0);
    expect(E.codex(s).demand[k.itemId]).toBeGreaterThanOrEqual(k.capacity);
  });

  it('loading seeds seen from holdings and history and round-trips', async () => {
    const h = await freshEngine(3, START + 3600000);
    {
      const base = h.E.newState();
      base.inv.sapphire = [0, 2, 0, 0, 0]; base.seen = {};
      const s = h.E.migrate(JSON.parse(JSON.stringify(base)));
      expect(s.v).toBe(7);
      Object.keys(s.inv).forEach((id) => expect(s.seen[id], id).toBe(true));
      s.gear.forEach((g: any) => expect(s.seen[g.itemId]).toBe(true));
      expect(() => h.E.tick(s, 1)).not.toThrow();
      expect(h.E.migrate(JSON.parse(JSON.stringify(s))).seen).toEqual(s.seen);
    }
    const raw = JSON.parse(JSON.stringify(h.E.newState()));
    delete raw.seen; raw.events = [{ id: 1, t: 1, cat: 'loot', text: 'x', itemId: 'sapphire', qty: 1 }];
    expect(h.E.migrate(raw).seen.sapphire).toBe(true);
  });
});

describe('encyclopedia catalog', () => {
  it('covers every item with recipe, used-in, sources, store, salvage and optional lore', async () => {
    const { E, mod } = await freshEngine();
    const cat = mod.DATA.catalog;
    expect(cat).toBe(E.catalog());
    expect(Object.keys(cat).length).toBe(Object.keys(mod.DATA.items).length);
    const sword = cat.bronze_sword;
    expect(sword).toMatchObject({ kind: 'gear', slot: 'weapon', rarity: 'common' });
    expect(sword.recipe.inputs).toEqual(mod.DATA.actions.find((a: any) => a.outputs && a.outputs.bronze_sword).inputs);
    expect(sword.salvage.perRarity.rare).toBe(0.6);
    expect(cat.copper_ore.gatheredBy[0]).toMatchObject({ actionId: 'mine_copper', skill: 'mining', level: 1, chance: 1 });
    expect(cat.copper_ore.usedIn.some((u: any) => u.outputs.includes('copper_bar') || u.outputs.includes('bronze_bar'))).toBe(true);
    expect(cat.wyrm_core.dropsFrom[0]).toMatchObject({ source: 'boss', bossId: 'ashen_wyrm' });
    expect(cat.copper_ore.store.buy).toBe(E.storeBuyPrice('copper_ore', 1));
    const { ITEM_LORE } = await import('../src/item-lore');
    expect(cat.copper_ore.lore).toBe(ITEM_LORE.copper_ore ?? null);
    Object.keys(cat).forEach((id) => expect(cat[id].lore).toBe(ITEM_LORE[id] ?? null)); // missing entries are null
    // lore is read from DATA.itemLore when present (string or { description })
    mod.ctx.data = Object.assign({}, mod.DATA, { itemLore: { copper_ore: 'Soft red metal.', tin_ore: { description: 'Grey and dull.' } } });
    try {
      expect(E.catalogEntry('copper_ore').lore).toBe('Soft red metal.');
      expect(E.catalogEntry('tin_ore').lore).toBe('Grey and dull.');
    } finally { mod.ctx.data = mod.DATA; }
  });
});
