// 2026-11-08 owner decisions: item rarity lookup, gather-time estimates, raid prep lock,
// NPC general store (player market parked) and the player event log.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { freshEngine, resolveRaidByClock, START, DAY } from './engine-helpers';

const fixture = (name: string) => JSON.parse(readFileSync(resolve(__dirname, 'fixtures', name), 'utf8'));
const HOUR = 3600000;

describe('item rarity lookup', () => {
  it('every item has a display rarity: tier for stackables, cores mythic', async () => {
    const { mod } = await freshEngine();
    const R = mod.DATA.itemRarity;
    const ids = mod.DATA.rarities.map((r: any) => r.id);
    Object.keys(mod.DATA.items).forEach((id) => {
      expect(ids).toContain(R[id]);
      expect(mod.DATA.items[id].rarity).toBe(R[id]);
    });
    expect(R.copper_ore).toBe('common');
    expect(R.iron_ore).toBe('uncommon');
    expect(R.silver_ore).toBe('rare');
    expect(R.mithril_ore).toBe('epic');
    expect(R.moonweave).toBe('legendary');
    expect(R.wyrm_core).toBe('mythic');
  });
});

describe('gather estimate', () => {
  it('seconds per unit at current levels; null when out of reach; refines include their inputs', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    const gs = E.gatherSecs(s);
    expect(gs.copper_ore).toBeCloseTo(E.actionTime(s, 'mine_copper'), 1);
    expect(gs.mithril_ore).toBeNull();
    expect(gs.copper_bar).toBeGreaterThan(gs.copper_ore);
    expect(E.gatherEstimate(s, 'copper_ore')).toBe(gs.copper_ore);
    // levels change the answer (cache is keyed on levels)
    s.skills.mining.xp = E.xpForLevel(70);
    expect(E.gatherSecs(s).mithril_ore).toBeGreaterThan(0);
  });
});

describe('raid prep lock', () => {
  it('equip, loadouts and hunt rules lock while the raid is live and unlock in prep and recap', async () => {
    const h = await freshEngine();
    const { E } = h;
    const s = E.newState();
    const uid = s.gear[0].uid; const slot = E.item(s.gear[0].itemId).slot;
    const lid = s.loadouts[0].id;
    expect(E.raidPrep(s)).toEqual({ phase: 'prep', locked: false, reason: '' });
    expect(E.raidStatus(s)).toMatchObject({ prepPhase: 'prep', prepLocked: false });
    expect(E.unequip(s, slot).ok).toBe(true);
    expect(E.equip(s, uid).ok).toBe(true);
    expect(E.setRaidRules(s, { stance: 'defensive' }).ok).toBe(true);

    resolveRaidByClock(h, s); // into the window: raid live (and resolved)
    const rs = E.raidStatus(s);
    expect(rs.prepPhase).toBe('live'); expect(rs.prepLocked).toBe(true); expect(rs.prepReason).toMatch(/raid is live/);
    for (const r of [E.equip(s, uid), E.unequip(s, slot), E.equipLoadout(s, lid), E.setRaidRules(s, { stance: 'aggressive' }), E.setRaidPlan(s, { role: 'striker' })]) {
      expect(r.ok).toBe(false); expect(r.reason).toBe(rs.prepReason);
    }
    expect(s.equipped[slot]).toBe(uid);
    expect(s.raid.rules.stance).toBe('defensive');

    h.setNow(E.raidWindow(s).end + 60000); E.tick(s, 1); // window over, same week: recap
    expect(E.raidPrep(s)).toMatchObject({ phase: 'recap', locked: false });
    expect(E.unequip(s, slot).ok).toBe(true);
    expect(E.equip(s, uid).ok).toBe(true);
    expect(E.setRaidRules(s, { stance: 'aggressive' }).ok).toBe(true);
    expect(E.setRaidPlan(s, { role: 'striker' }).ok).toBe(true);
  });

  it('a player sitting the raid out is not locked', async () => {
    const h = await freshEngine();
    const s0 = h.E.newState();
    h.setNow(h.E.raidWindow(s0).start + HOUR);
    const s = h.E.newState();
    expect(h.E.raidStatus(s).sittingOut).toBe(true);
    expect(h.E.raidPrep(s)).toMatchObject({ phase: 'live', locked: false });
    expect(h.E.unequip(s, 'weapon').ok).toBe(true);
  });
});

describe('general store', () => {
  it('rotates hourly: 6 resources + 3 low/mid gear, same stock for the same hour, own RNG stream', async () => {
    const h = await freshEngine();
    const { E, mod } = h;
    const s = E.newState(); const t = E.newState();
    const v = E.storeView(s);
    expect(v.slots.filter((x: any) => x.kind === 'resource').length).toBe(mod.ECON.storeResourceSlots);
    expect(v.slots.filter((x: any) => x.kind === 'gear').length).toBe(mod.ECON.storeGearSlots);
    v.slots.forEach((x: any) => {
      const it = E.item(x.itemId);
      if (x.kind === 'gear') { expect(it.kind).toBe('gear'); expect(it.tier).toBeLessThanOrEqual(mod.ECON.storeGearMaxTier); expect(x.grade).toBeNull(); }
      else expect(it.kind).toBe('material');
      expect(x.qty).toBeGreaterThan(0); expect(x.qty).toBe(x.stock);
      expect('gatherSecs' in x).toBe(true);
    });
    expect(E.storeView(t).slots.map((x: any) => x.itemId)).toEqual(v.slots.map((x: any) => x.itemId));
    expect(v.refreshesAt).toBe((Math.floor(E.now(s) / HOUR) + 1) * HOUR);
    // never touches the engine RNG (fixtures depend on its call order)
    let calls = 0; const base = mod.ctx.rng; mod.ctx.rng = () => { calls++; return base(); };
    h.advance(HOUR); E.storeView(s); h.advance(HOUR); E.storeView(s);
    mod.ctx.rng = base;
    expect(calls).toBe(0);
    // rotates over hours
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) { h.advance(HOUR); E.tick(s, 1); seen.add(s.store.slots.map((x: any) => x.itemId).join()); }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('weights stock toward the player\'s skill levels', async () => {
    const h = await freshEngine();
    const { E } = h;
    const lo = E.newState(); const hi = E.newState();
    ['mining', 'woodcutting', 'herbalism', 'fishing', 'smelting', 'carpentry', 'tanning', 'weaving'].forEach((k) => { hi.skills[k].xp = E.xpForLevel(60); });
    let tLo = 0, tHi = 0;
    for (let i = 0; i < 48; i++) {
      h.advance(HOUR);
      E.storeView(lo).slots.filter((x: any) => x.kind === 'resource').forEach((x: any) => { tLo += E.item(x.itemId).tier; });
      E.storeView(hi).slots.filter((x: any) => x.kind === 'resource').forEach((x: any) => { tHi += E.item(x.itemId).tier; });
    }
    expect(tHi / tLo).toBeGreaterThan(1.3);
  });

  it('buys at a premium with a per-hour limit, sells anything at the floor, logs both', async () => {
    const h = await freshEngine();
    const { E, mod } = h;
    const s = E.newState(); s.gold = 1e6;
    const v = E.storeView(s);
    const res = v.slots.find((x: any) => x.kind === 'resource');
    expect(res.price).toBe(Math.ceil(E.itemValue(res.itemId, res.grade) * mod.ECON.storeResourceMult));
    const have0 = (s.inv[res.itemId] || [0, 0, 0, 0, 0])[res.grade];
    const g0 = s.gold;
    const r = E.storeBuy(s, res.slot, 2);
    expect(r).toMatchObject({ ok: true, qty: 2, gold: 2 * res.price });
    expect(s.gold).toBe(g0 - 2 * res.price);
    expect(s.inv[res.itemId][res.grade]).toBe(have0 + 2);
    expect(E.storeView(s).slots[res.slot].qty).toBe(res.stock - 2);
    expect(E.storeBuy(s, res.slot, res.stock).ok).toBe(false); // over the hour's limit
    expect(E.storeBuy(s, res.slot, res.stock - 2).ok).toBe(true);
    expect(E.storeBuy(s, res.slot, 1).reason).toMatch(/Sold out/);
    expect(E.events(s)[0]).toMatchObject({ cat: 'gold', itemId: res.itemId, gold: -(res.stock - 2) * res.price });

    const gear = v.slots.find((x: any) => x.kind === 'gear');
    const n0 = s.gear.length;
    const gb = E.storeBuy(s, gear.slot, 1);
    expect(gb.ok).toBe(true); expect(s.gear.length).toBe(n0 + 1);
    const bought = s.gear.find((g: any) => g.uid === gb.uids[0]);
    expect(bought).toMatchObject({ itemId: gear.itemId, rarity: 'common' });
    expect(gear.price).toBe(Math.round(E.gearValue(bought) * mod.ECON.storeGearMult));

    // sell: stackables by grade, gear by uid; equipped gear refused; never above the buy price
    const sp = E.storeView(s).sellPrices[res.itemId][res.grade];
    expect(sp).toBe(Math.max(1, Math.round(E.itemValue(res.itemId, res.grade) * mod.ECON.storeSellMult)));
    expect(sp).toBeLessThan(res.price);
    const g1 = s.gold;
    expect(E.storeSell(s, res.itemId, res.grade, 3)).toMatchObject({ ok: true, qty: 3, gold: 3 * sp });
    expect(s.gold).toBe(g1 + 3 * sp);
    expect(E.storeSell(s, res.itemId, res.grade, 1e6).ok).toBe(false);
    expect(E.storeSellGear(s, s.equipped.weapon).ok).toBe(false);
    const gsp = E.storeView(s).gearSellPrices[bought.uid];
    expect(E.storeSellGear(s, bought.uid)).toMatchObject({ ok: true, gold: gsp });
    expect(s.gear.some((g: any) => g.uid === bought.uid)).toBe(false);
    expect(E.events(s)[0]).toMatchObject({ cat: 'gold', gold: gsp });
    // the stock (and its limits) resets next hour
    h.advance(HOUR); E.tick(s, 1);
    expect(E.storeView(s).slots.every((x: any) => x.qty === x.stock)).toBe(true);
  });
});

describe('player market parked', () => {
  it('buy/list refuse, the NPC board stays empty, open listings come back on load', async () => {
    const h = await freshEngine();
    const { E } = h;
    const s = E.newState();
    expect(s.market.listings).toEqual([]);
    expect(E.buy(s, 'x', 1).ok).toBe(false);
    s.inv.copper_ore = [0, 5, 0, 0, 0];
    expect(E.list(s, 'copper_ore', 1, 2, 5).ok).toBe(false);
    for (let i = 0; i < 300; i++) E.tick(s, 1);
    expect(s.market.listings).toEqual([]);

    const raw = fixture('v6-phase25-save.json');
    raw.market.mine = [{ id: 'm1', itemId: 'oak_log', grade: 2, qty: 7, price: 30 }];
    const have = (raw.inv.oak_log || [0, 0, 0, 0, 0])[2] || 0;
    const m = E.migrate(raw);
    expect(m.v).toBe(6);
    expect(m.market.mine).toEqual([]); expect(m.market.listings).toEqual([]);
    expect(m.inv.oak_log[2]).toBe(have + 7);
    expect(E.events(m)[0]).toMatchObject({ cat: 'loot', itemId: 'oak_log', qty: 7 });
  });
});

describe('player event log', () => {
  it('old fixtures load with an empty log and a store; fields round-trip', async () => {
    const h = await freshEngine(3, START + HOUR);
    for (const f of ['v4-save.json', 'v5-phase2-save.json', 'v6-phase25-save.json']) {
      const s = h.E.migrate(fixture(f));
      expect(Array.isArray(s.events)).toBe(true);
      expect(() => h.E.tick(s, 1)).not.toThrow();
      expect(s.store.slots.length).toBe(9);
      const again = h.E.migrate(JSON.parse(JSON.stringify(s)));
      expect(again.events).toEqual(s.events);
      expect(again.store).toEqual(s.store);
    }
  });

  it('gathering merges loot lines, level-ups log as skill, contracts and raids log', async () => {
    const h = await freshEngine();
    const { E } = h;
    const s = E.newState();
    E.start(s, 'mine_copper');
    for (let i = 0; i < 60; i++) E.tick(s, 1);
    const ev = E.events(s);
    const ore = ev.filter((e: any) => e.cat === 'loot' && e.itemId === 'copper_ore');
    expect(ore.length).toBe(1);
    expect(ore[0].qty).toBe(s.inv.copper_ore.reduce((a: number, b: number) => a + b, 0));
    expect(ore[0].text).toBe(`Gathered ${ore[0].qty} Copper ore.`);
    expect(ore[0]).not.toHaveProperty('merge');
    expect(ev.some((e: any) => e.cat === 'skill' && /Mining reached level/.test(e.text))).toBe(true);
    ev.forEach((e: any) => { expect(e.t).toBe(E.now(s)); expect(e.id).toBeGreaterThan(0); });

    const k = E.listContracts(s).find((x: any) => x.status === 'open' && x.source === 'town');
    s.inv[k.itemId] = [0, 3, 0, 0, 0];
    const r = E.fillContract(s, k.id, 2);
    expect(E.events(s)[0]).toMatchObject({ cat: 'crew', itemId: k.itemId, qty: 2, gold: r.gold });

    const job = s.crew.jobs.find((j: any) => E.canAssist(s, j.id).ok);
    if (job) { E.assist(s, job.id); expect(E.events(s)[0].cat).toBe('crew'); }

    E.lockIn(s);
    expect(E.events(s)[0]).toMatchObject({ cat: 'raid' });
    resolveRaidByClock(h, s);
    const raid = E.events(s, 200).filter((e: any) => e.cat === 'raid');
    expect(raid.length).toBeGreaterThanOrEqual(2);
    if (s.raid.last.gold > 0) expect(E.events(s, 200).some((e: any) => e.cat === 'gold' && e.gold === s.raid.last.gold)).toBe(true);
  });

  it('offline catch-up logs a summary and per-item gains; capped at 200, view at 50', async () => {
    const h = await freshEngine();
    const { E } = h;
    const s = E.newState();
    E.start(s, 'mine_copper');
    h.advance(2 * HOUR);
    E.applyOffline(s, h.now());
    const ev = E.events(s);
    expect(ev.some((e: any) => e.cat === 'loot' && /While you were away/.test(e.text))).toBe(true);
    expect(ev.some((e: any) => e.cat === 'loot' && e.itemId === 'copper_ore' && e.qty > 0)).toBe(true);
    s.gold = 1e9;
    for (let i = 0; i < 250; i++) { h.advance(HOUR); E.tick(s, 1); E.storeBuy(s, 0, 1); }
    expect(s.events.length).toBe(200);
    expect(E.events(s).length).toBe(50);
    expect(E.events(s)[0].id).toBeGreaterThan(E.events(s)[1].id);
  });
});

describe('raid: crew stock shortfall and live contribution', () => {
  it('recap flags when vault stock runs out, per member', async () => {
    const h = await freshEngine(5);
    const { E } = h;
    const s = E.newState();
    s.crew.vault.inv = { bread: [0, 1, 0, 0, 0], fury_draught: [0, 1, 0, 0, 0] }; // tiny stock: will run out
    s.crew.members.forEach((m: any) => { m.food = 0; m.potions = 0; });
    E.setRaidPlan(s, { role: 'striker' }); E.lockIn(s);
    const { recap } = resolveRaidByClock(h, s);
    expect(recap.stockRanOut).toBe(true);
    expect(recap.stockShortfall.length).toBeGreaterThan(0);
    recap.stockShortfall.forEach((u: any) => { expect(u.heal + u.buff).toBeGreaterThan(0); expect(typeof u.name).toBe('string'); });
    expect(recap.stockOutAt).toBeGreaterThanOrEqual(0); expect(recap.stockOutAt).toBeLessThanOrEqual(1);

    const h2 = await freshEngine(5);
    const t = h2.E.newState(); t.crew.vault.inv = {}; // nothing stocked: nothing "ran out"
    h2.E.lockIn(t);
    const r2 = resolveRaidByClock(h2, t).recap;
    expect(r2.stockRanOut).toBe(false); expect(r2.stockShortfall).toEqual([]); expect(r2.stockOutAt).toBeNull();
  });

  it('raidStatus.liveContribution grows through the live replay and ends at the recap share', async () => {
    const h = await freshEngine();
    const { E } = h;
    const s = E.newState();
    expect(E.raidStatus(s).liveContribution).toBeNull();
    E.lockIn(s);
    const { recap } = resolveRaidByClock(h, s);
    const w = E.raidWindow(s);
    const a = E.raidStatus(s).liveContribution;
    expect(a).not.toBeNull();
    h.setNow(w.start + (w.end - w.start) / 3);
    const b = E.raidStatus(s).liveContribution;
    expect(b.points).toBeGreaterThanOrEqual(a.points);
    expect(b.pct).toBeGreaterThan(a.pct);
    expect(['none', 'bronze', 'silver', 'gold']).toContain(b.tier);
    h.setNow(w.start + 10 * HOUR - 1000);
    const c = E.raidStatus(s).liveContribution;
    expect(c.points).toBeCloseTo(recap.contribution.weekPoints, 1);
    expect(c.share).toBeCloseTo(recap.contribution.weekShare, 4);
    h.setNow(w.end + 1000);
    expect(E.raidStatus(s).liveContribution).toBeNull();
  });
});
