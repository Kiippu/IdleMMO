// 2026-11-08 owner decisions: item rarity lookup, gather-time estimates, raid prep lock,
// NPC general store (player market parked) and the player event log.
import { describe, expect, it } from 'vitest';
import { freshEngine, resolveRaidByClock, START, DAY } from './engine-helpers';

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
  it('hunt rules and raid plan lock while live; gear swaps stay open and never change the raid', async () => {
    const h = await freshEngine();
    const { E } = h;
    const s = E.newState();
    const uid = s.gear[0].uid; const slot = E.item(s.gear[0].itemId).slot;
    const lid = s.loadouts[0].id;
    expect(E.raidPrep(s)).toEqual({ phase: 'prep', locked: false, reason: '' });
    expect(E.raidStatus(s)).toMatchObject({ prepPhase: 'prep', prepLocked: false });
    expect(E.setRaidRules(s, { stance: 'defensive' }).ok).toBe(true);

    const { recap } = resolveRaidByClock(h, s); // into the window: raid live (resolved from the lock)
    const before = JSON.stringify(recap);
    const lockSlots = JSON.stringify(s.raid.lock.slots);
    const rs = E.raidStatus(s);
    expect(rs.prepPhase).toBe('live'); expect(rs.prepLocked).toBe(true); expect(rs.prepReason).toMatch(/hunt plan is locked/);
    for (const r of [E.setRaidRules(s, { stance: 'aggressive' }), E.setRaidPlan(s, { role: 'striker' })]) {
      expect(r.ok).toBe(false); expect(r.reason).toBe(rs.prepReason);
    }
    expect(s.raid.rules.stance).toBe('defensive');
    // gear swaps are allowed mid-raid and leave the raid (lock snapshot + recap + payouts) untouched
    const gold = s.gold;
    expect(E.unequip(s, slot).ok).toBe(true);
    expect(E.equip(s, uid).ok).toBe(true);
    expect(E.equipLoadout(s, lid).ok).toBe(true);
    expect(E.unequip(s, 'weapon').ok).toBe(true);
    for (let i = 0; i < 30; i++) { h.advance(60000); E.tick(s, 1); }
    expect(JSON.stringify(s.raid.lock.slots)).toBe(lockSlots);
    expect(JSON.stringify(E.lastRecap(s))).toBe(before);
    expect(E.recaps(s).length).toBe(1);
    expect(s.gold).toBeGreaterThanOrEqual(gold);

    h.setNow(E.raidWindow(s).end + 60000); E.tick(s, 1); // window over, same week: recap
    expect(E.raidPrep(s)).toMatchObject({ phase: 'recap', locked: false });
    expect(E.setRaidRules(s, { stance: 'aggressive' }).ok).toBe(true);
    expect(E.setRaidPlan(s, { role: 'striker' }).ok).toBe(true);
  });

  it('starting a job never swaps fight gear (bound loadouts are gone; tools are used automatically)', async () => {
    const h = await freshEngine();
    const { E } = h;
    const s = E.newState();
    expect(E.bindLoadout).toBeUndefined();
    const weapon = s.equipped.weapon;
    const r = E.start(s, 'mine_copper');
    expect(r).toEqual({ ok: true, reason: '' });
    expect(s.equipped.weapon).toBe(weapon);
    expect(E.derivedExtras(s).activeWork).toMatchObject({ skill: 'mining', set: 'gather', toolUid: s.tools.mining });
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
    // grade price ladder (2026-11-12): never below value x mult, and each grade at least 1g above the one below
    expect(res.price).toBe(E.storeBuyPrice(res.itemId, res.grade));
    expect(res.price).toBeGreaterThanOrEqual(Math.ceil(E.itemValue(res.itemId, res.grade) * mod.ECON.storeResourceMult));
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
    expect(sp).toBe(E.storeSellPrice(res.itemId, res.grade));
    expect(sp).toBeGreaterThanOrEqual(Math.max(1, Math.round(E.itemValue(res.itemId, res.grade) * mod.ECON.storeSellMult)));
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
  it('buy/list refuse and the NPC board stays empty, also after a reload', async () => {
    const h = await freshEngine();
    const { E } = h;
    const s = E.newState();
    expect(s.market.listings).toEqual([]);
    expect(E.buy(s, 'x', 1).ok).toBe(false);
    s.inv.copper_ore = [0, 5, 0, 0, 0];
    expect(E.list(s, 'copper_ore', 1, 2, 5).ok).toBe(false);
    for (let i = 0; i < 300; i++) E.tick(s, 1);
    expect(s.market.listings).toEqual([]);

    const m = E.migrate(JSON.parse(JSON.stringify(s)));
    expect(m.v).toBe(8);
    expect(m.market.mine).toEqual([]); expect(m.market.listings).toEqual([]);
  });
});

describe('player event log', () => {
  it('a save loads with its log and a store; fields round-trip', async () => {
    const h = await freshEngine(3, START + HOUR);
    {
      const s = h.E.migrate(JSON.parse(JSON.stringify(h.E.newState())));
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

describe('market-tax week buff removed', () => {
  it('never rolls, and an unknown (tax) buff in a save is dropped', async () => {
    const h = await freshEngine();
    const { E, mod } = h;
    expect(mod.DATA.config.weekBuffs.some((b: any) => b.kind === 'tax')).toBe(false);
    const raw = JSON.parse(JSON.stringify(E.newState()));
    raw.server.weekBuff = { kind: 'tax', value: 0.02, label: 'Market tax 2%', week: raw.week };
    raw.server.pendingBuff = { kind: 'tax', value: 0.02, label: 'Market tax 2%', week: raw.week + 1 };
    const logLen = (raw.events || []).length;
    const s = E.migrate(raw);
    expect(s.v).toBe(8);
    expect(s.server.weekBuff).toBeNull();
    expect(s.server.pendingBuff).toBeNull();
    expect(s.events.length).toBe(logLen);
    expect(E.marketTax(s)).toBe(mod.DATA.config.marketTax);
    const t = E.newState(); E.lockIn(t);
    const { recap } = resolveRaidByClock(h, t);
    if (recap.weekBuff) expect(recap.weekBuff.kind).not.toBe('tax');
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

describe('raid payout field meanings (QA 2026-11-09)', () => {
  it('payout.contribution is the crew fill; yourShare is the player; live view carries the replay boss HP', async () => {
    const h = await freshEngine();
    const { E } = h;
    const s = E.newState();
    E.setRaidPlan(s, { role: 'supply' }); E.lockIn(s); // empty pouch: contributes nothing
    const w = E.raidWindow(s); h.setNow(w.start + HOUR);
    E.applyOffline(s, h.now());
    const r = E.lastRecap(s);
    expect(r.payout.crewContribution).toBe(r.payout.contribution);
    expect(r.payout.yourShare).toBe(r.contribution.weekShare);
    expect(r.payout.yourShare).toBe(0);
    const lc = E.raidStatus(s).liveContribution;
    expect(lc.share).toBe(0); expect(lc.tier).toBe('none');
    expect(lc.bossHpPct).toBeGreaterThan(r.hpPctAfter); // early in the replay: more HP left than at the end
    const tl = r.timeline; expect(lc.bossHpPct).toBe(tl[Math.floor(lc.pct * (tl.length - 1))].bossHpPct);
    h.setNow(w.start + 10 * HOUR); // replay finished (window still open)
    expect(E.raidStatus(s).liveContribution.bossHpPct).toBeCloseTo(r.hpPctAfter, 3);
  });
});

describe('raid gold split: floor + contribution, capped at the player\'s own income (owner 2026-11-09)', () => {
  const GATHER = ['mining', 'woodcutting', 'herbalism', 'fishing'];
  async function setup(level: number) {
    const h = await freshEngine();
    const s = h.E.newState();
    if (level > 1) GATHER.forEach((k) => { s.skills[k].xp = h.E.xpForLevel(level); });
    const rp = await import('../src/raid-payouts');
    const pay = rp.raidGoldSplit(s, 1, 5, 1, true); // tier 1, full turnout + contribution: the average share is 1.5 H
    const split = (you: number, crew: number[]) => rp.playerRaidGold(s, pay, 5, you, crew, true);
    return { h, s, rp, pay, split };
  }
  it('zero points: only the floor share; top contributor beats the average; totals stay inside the pool', async () => {
    const { h, pay, split, s } = await setup(40);
    const payable = pay.pool - pay.treasury;
    const zero = split(0, [1, 1, 1, 1]);
    expect(zero.byContribution).toBe(0);
    expect(zero.player).toBe(Math.min(zero.floor, zero.cap));
    expect(zero.floor).toBe(Math.floor(payable * 0.25 / 5));
    const avg = split(1, [1, 1, 1, 1]); const top = split(3, [1, 1, 1, 1]);
    expect(top.raw).toBeGreaterThan(avg.raw);
    expect(Math.abs(avg.raw - pay.perAttendee)).toBeLessThanOrEqual(2);
    // everyone's uncapped shares add up to no more than the payable pool
    const pts = [3, 1, 1, 1, 1]; const tot = pts.reduce((a, b) => a + b, 0);
    const sum = pts.reduce((a, p) => a + Math.floor(payable * 0.25 / 5) + Math.floor(payable * 0.75 * p / tot), 0);
    expect(sum).toBeLessThanOrEqual(payable);
    expect(top.player).toBeLessThanOrEqual(top.cap);
    const { ECON } = await import('../src/data');
    expect(top.cap).toBe(Math.round(ECON.raidCapIncomeHours * h.E.hourlyIncome(s)));
    // owner 2026-11-09: cap at 3 H so a level-40 top contributor out-earns the average
    expect(top.player).toBeGreaterThan(avg.player);
  });
  it('the income cap bites for a low-level top contributor; the cut goes to the treasury in a real raid', async () => {
    const { h, split, s } = await setup(1);
    const top = split(3, [1, 1, 1, 1]);
    expect(top.cap).toBeLessThan(top.raw);
    expect(top.player).toBe(top.cap);
    expect(top.cut).toBe(top.raw - top.cap);
    // real raid: a level-1 zero-contribution supply player
    h.E.setRaidPlan(s, { role: 'supply' }); h.E.lockIn(s);
    const t0 = h.E.crewGold(s).total; const g0 = s.gold;
    const { recap } = resolveRaidByClock(h, s);
    const p = recap.payout;
    expect(p.split.byContribution).toBe(0);
    expect(p.gold).toBe(Math.min(p.split.floor, p.split.cap));
    expect(s.gold - g0).toBeGreaterThanOrEqual(p.gold);
    expect(h.E.crewGold(s).total - t0).toBe(p.crewGold);
    expect(p.crewGold).toBe(Math.round(p.pool * 0.025) + p.split.cutToTreasury);
    expect(p.gold + p.crewGold).toBeLessThanOrEqual(p.pool);
  });
  it('examples', async () => {
    const out: any = {};
    for (const lvl of [1, 40]) {
      const { split, pay, h, s } = await setup(lvl);
      const H = (await import('../src/data')).H;
      const f = (r: any) => `${r.player}g (${(r.player / H).toFixed(2)} H; uncapped ${r.raw}g)`;
      out['L' + lvl] = { income: Math.round(h.E.hourlyIncome(s)), cap: split(0, [1]).cap, zero: f(split(0, [1, 1, 1, 1])), avg: f(split(1, [1, 1, 1, 1])), top: f(split(3, [1, 1, 1, 1])), pool: pay.pool };
    }
    // eslint-disable-next-line no-console
    console.log('[raid-gold-examples]', JSON.stringify(out));
  });
});
