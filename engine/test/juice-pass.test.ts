// Juice pass (2026-11-12, docs/juice-pass-contract.md): quantity jobs, gain events, treasury log kinds and the
// opening payout, max HP follows gear, one grade ladder + grade price steps, recently unlocked, raid readiness,
// equip deltas, crew job rewards/ETA/plural feed text, and a real v7 save still loading.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { freshEngine, resolveRaidByClock, invTotal } from './engine-helpers';
import { plural } from '../src/core';

const V7 = () => JSON.parse(readFileSync(resolve(__dirname, 'fixtures', 'v7-phase3-save.json'), 'utf8'));
const piece = (s: any, uid: string, itemId: string, rarity = 'common', quality = 50) => {
  const g = { uid, itemId, rarity, quality, affixes: [], dur: 100, maxDur: 100 }; s.gear.push(g); return g;
};
/** tick 1s at a time until the slot empties (or n ticks); returns all events */
function run(h: any, s: any, n = 200) {
  const evs: any[] = [];
  for (let i = 0; i < n && s.active; i++) { h.advance(1000); evs.push(...h.E.tick(s, 1)); }
  return evs;
}

describe('quantity jobs', () => {
  it('a gather job runs `count` reps, stops with done:true + a log line, and the slot stays empty', async () => {
    const h = await freshEngine(); const { E } = h;
    const s = E.newState();
    expect(E.start(s, 'mine_copper', 3).ok).toBe(true);
    expect(s.active).toMatchObject({ actionId: 'mine_copper', left: 3, count: 3 });
    const evs = run(h, s);
    expect(s.active).toBeNull();
    expect(evs.filter((e) => e.type === 'complete' && e.actionId === 'mine_copper').length).toBe(3);
    const stop = evs.find((e) => e.type === 'stopped');
    expect(stop).toMatchObject({ done: true });
    expect(stop.reason).toMatch(/^Gathered \d+ Copper ore\.$/);
    expect(s.log.some((l: any) => l.text === stop.reason)).toBe(true);
    expect(E.events(s).some((e: any) => e.text === stop.reason)).toBe(true);
    h.advance(60000); E.tick(s, 60);
    expect(s.active).toBeNull(); // no auto-resume
  });

  it('refine: Made N <plural>; maxMake; a count past the inputs stops on materials (not done)', async () => {
    const h = await freshEngine(); const { E } = h;
    const s = E.newState();
    s.inv.copper_ore = [0, 40, 0, 0, 0];
    const mm = E.derivedExtras(s).maxMake;
    expect(mm.smelt_copper).toBe(20);
    expect(mm.mine_copper).toBeNull();
    expect(mm.fight_wolfwood).toBeNull();
    E.start(s, 'smelt_copper', 5);
    const evs = run(h, s);
    expect(evs.find((e) => e.type === 'stopped')).toMatchObject({ reason: 'Made 5 Copper bars.', done: true });
    expect(invTotal(s.inv, 'copper_bar')).toBe(5);
    expect(invTotal(s.inv, 'copper_ore')).toBe(30);
    s.inv.copper_ore = [0, 4, 0, 0, 0];
    E.start(s, 'smelt_copper', 10);
    const ev2 = run(h, s);
    const st = ev2.find((e) => e.type === 'stopped');
    expect(st.done).toBeUndefined();
    expect(st.reason).toBe('Out of copper ore.');
  });

  it('starting the same action again takes the new count (or none = unlimited)', async () => {
    const h = await freshEngine(); const { E } = h;
    const s = E.newState();
    E.start(s, 'mine_copper', 5); h.advance(1000); E.tick(s, 1);
    const p = s.active.progress;
    E.start(s, 'mine_copper', 2);
    expect(s.active).toMatchObject({ left: 2, progress: p });
    E.start(s, 'mine_copper');
    expect(s.active.left).toBeUndefined();
    run(h, s, 50);
    expect(s.active).not.toBeNull();
  });

  it('offline catch-up respects the count, including the bulk-gather path past 20k reps', async () => {
    const h = await freshEngine(); const { E } = h;
    const s = E.newState();
    E.start(s, 'mine_copper', 50);
    h.advance(3 * 3600000);
    const r = E.applyOffline(s, h.now());
    expect(s.mastery.mine_copper).toBe(50);
    expect(s.active).toBeNull();
    expect(r.summary.stoppedDone).toBe(true);
    expect(r.summary.stoppedReason).toMatch(/^Gathered \d+ Copper ore\.$/);

    const s2 = E.newState();
    E.start(s2, 'mine_copper', 20500);
    h.advance(40 * 3600000);
    E.applyOffline(s2, h.now());
    expect(s2.mastery.mine_copper).toBe(20500);
    expect(s2.active).toBeNull();
  }, 120000);

  it('a v7 save with no count runs unlimited; a saved count survives save/load', async () => {
    const h = await freshEngine(); const { E } = h;
    const old = E.migrate(V7());
    expect(old.active).toMatchObject({ actionId: 'smelt_copper' });
    expect(old.active.left).toBeUndefined();
    const s = E.newState(); E.start(s, 'mine_copper', 7);
    const back = E.migrate(JSON.parse(JSON.stringify(s)));
    expect(back.active).toMatchObject({ left: 7, count: 7 });
  });
});

describe('gain events', () => {
  it('gather/refine ticks carry gain events with the item rarity; a crafted gear piece carries its uid + rolled rarity', async () => {
    const h = await freshEngine(); const { E, mod } = h;
    const s = E.newState();
    E.start(s, 'mine_copper', 2);
    const evs = run(h, s);
    const gains = evs.filter((e) => e.type === 'gain');
    expect(gains.length).toBe(2);
    gains.forEach((g) => { expect(g.source).toBe('gather'); expect(g.offline).toBeUndefined(); });
    expect(gains[0].items[0]).toMatchObject({ itemId: 'copper_ore', rarity: mod.DATA.itemRarity.copper_ore });
    expect(typeof gains[0].items[0].grade).toBe('number');
    const craft = mod.DATA.actions.find((a: any) => a.kind === 'craft' && a.level === 1 && E.isGearCraft(a.id));
    Object.keys(craft.inputs).forEach((id) => { s.inv[id] = [0, 50, 0, 0, 0]; });
    s.skills[craft.skill].xp = E.xpForLevel(craft.level);
    E.start(s, craft.id, 1);
    const ce = run(h, s);
    const g = ce.find((e) => e.type === 'gain' && e.source === 'craft');
    const made = s.gear.find((x: any) => x.uid === g.items[0].uid);
    expect(made).toBeTruthy();
    expect(g.items[0].rarity).toBe(made.rarity);
  });

  it('buy and salvage gains ride E.takeEvents (the RPC response); sells, equips and hand-ins give none', async () => {
    const h = await freshEngine(); const { E } = h;
    const s = E.newState();
    E.takeEvents();
    s.gold = 100000;
    const st = E.storeView(s);
    const res = st.slots.find((x: any) => x.kind === 'resource'); const gear = st.slots.find((x: any) => x.kind === 'gear');
    expect(E.storeBuy(s, res.slot, 1).ok).toBe(true);
    expect(E.storeBuy(s, gear.slot, 1).ok).toBe(true);
    const bought = E.takeEvents();
    expect(bought.map((e: any) => e.source)).toEqual(['buy', 'buy']);
    expect(bought[0].items[0]).toMatchObject({ itemId: res.itemId, qty: 1, grade: res.grade });
    expect(bought[1].items[0].uid).toBeTruthy();
    expect(E.takeEvents()).toEqual([]);
    E.storeSell(s, res.itemId, res.grade, 1);
    E.equip(s, bought[1].items[0].uid);
    s.inv.bread = [0, 5, 0, 0, 0];
    const k = E.listContracts(s).find((x: any) => x.itemId === 'bread' && x.canFill.ok);
    if (k) E.fillContract(s, k.id, 1);
    expect(E.takeEvents()).toEqual([]);
    piece(s, 'gS', 'bronze_sword');
    expect(E.salvage(s, ['gS'], {}).ok).toBe(true);
    const sv = E.takeEvents();
    expect(sv).toHaveLength(1);
    expect(sv[0].source).toBe('salvage');
  });

  it('offline catch-up gains come aggregated, one per source, flagged offline', async () => {
    const h = await freshEngine(); const { E } = h;
    const s = E.newState();
    E.takeEvents();
    E.start(s, 'mine_copper');
    h.advance(2 * 3600000);
    E.applyOffline(s, h.now());
    const evs = E.takeEvents().filter((e: any) => e.source === 'gather');
    expect(evs).toHaveLength(1);
    expect(evs[0].offline).toBe(true);
    const ore = evs[0].items.filter((i: any) => i.itemId === 'copper_ore').reduce((a: number, i: any) => a + i.qty, 0);
    expect(ore).toBe(invTotal(s.inv, 'copper_ore'));
  });

  it('raid loot comes as one raid gain matching the payout items', async () => {
    const h = await freshEngine(); const { E } = h;
    const s = E.newState();
    E.takeEvents();
    const { events, recap } = resolveRaidByClock(h, s);
    const items = (recap && recap.payout && recap.payout.items) || [];
    const g = events.filter((e: any) => e.type === 'gain' && e.source === 'raid');
    if (items.length) {
      expect(g).toHaveLength(1);
      const sum = (l: any[]) => l.reduce((a, i) => a + i.qty, 0);
      expect(sum(g[0].items)).toBe(sum(items) + (recap.cores && recap.cores.won ? 1 : 0));
    } else expect(g).toHaveLength(0);
  });
});

describe('treasury log', () => {
  it('a new crew logs its opening payout; escrow/release kinds; the log replays the treasury', async () => {
    const { E, mod } = await freshEngine();
    const s = E.newState();
    const open = s.crew.treasury.log.find((e: any) => e.opening);
    expect(open).toMatchObject({ kind: 'payout', delta: mod.DATA.config.crewStartTreasury, who: 'Raid' });
    expect(s.crew.feed.some((f: any) => f.kind === 'payout' && f.text.startsWith("Last weekend's raid payout"))).toBe(true);
    s.gold = 100;
    const id = E.postCrewRequest(s, { itemId: 'bread', qty: 2, rewardPer: 3 }).contract.id;
    expect(E.treasuryLog(s)[0].kind).toBe('escrow');
    E.cancelCrewRequest(s, id);
    expect(E.treasuryLog(s)[0].kind).toBe('release');
    expect(E.treasuryLog(s).some((e: any) => e.kind === 'escrow' && e.paidBy === 'Treasury')).toBe(true); // town contracts
    const sum = s.crew.treasury.log.reduce((a: number, e: any) => a + e.delta, 0);
    expect(sum).toBe(E.crewGold(s).total);
  });

  it('a v7 save: old contract-escrow kinds read as escrow, and the missing opening payout is backfilled once', async () => {
    const { E } = await freshEngine();
    const raw = V7();
    expect(raw.crew.treasury.log.some((e: any) => e.kind === 'contract-escrow')).toBe(true);
    expect(raw.crew.treasury.log.some((e: any) => e.opening)).toBe(false);
    const s = E.migrate(raw);
    const kinds = E.treasuryLog(s).map((e: any) => e.kind);
    expect(kinds).not.toContain('contract-escrow');
    expect(kinds).toContain('escrow');
    expect(s.crew.treasury.log.filter((e: any) => e.opening)).toHaveLength(1);
    expect(s.crew.treasury.log[s.crew.treasury.log.length - 1].opening).toBe(true);
    const again = E.migrate(JSON.parse(JSON.stringify(s)));
    expect(again.crew.treasury.log.filter((e: any) => e.opening)).toHaveLength(1);
  });
});

describe('max HP follows gear', () => {
  it('equipping +HP gear at full health stays full; unequipping clamps; damage carries over', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    const max0 = E.playerStats(s).maxHp;
    expect(s.hp).toBe(max0);
    piece(s, 'gH', 'copper_helm');
    E.equip(s, 'gH');
    const max1 = E.playerStats(s).maxHp;
    expect(max1).toBe(max0 + 5);
    expect(s.hp).toBe(max1);
    s.hp = max1 - 20;
    E.unequip(s, 'head');
    expect(s.hp).toBe(max1 - 20); // below the new max: unchanged
    E.equip(s, 'gH');
    expect(s.hp).toBe(max1 - 15);
    s.hp = max1;
    E.unequip(s, 'head');
    expect(s.hp).toBe(max0);
    const l = E.saveLoadout(s, { name: 'Helm', slots: Object.assign({}, s.equipped, { head: 'gH' }) }).loadout;
    E.equipLoadout(s, l.id);
    expect(s.hp).toBe(max1);
  });
});

describe('grades', () => {
  it('one ladder: Rough, Standard, Fine, Superior, Pristine; engine texts use it', async () => {
    const { E, mod } = await freshEngine();
    expect([0, 1, 2, 3, 4].map((g) => E.gradeName(g))).toEqual(['Rough', 'Standard', 'Fine', 'Superior', 'Pristine']);
    expect(mod.DATA.grades.map((g: any) => g.name)).toEqual(['Rough', 'Standard', 'Fine', 'Superior', 'Pristine']);
    expect([0, 1, 2, 4].map((g) => E.gradeAtLeast(g))).toEqual(['Any grade', 'Standard+', 'Fine+', 'Pristine']);
    const s = E.newState();
    s.inv = {};
    const k = E.listContracts(s).find((x: any) => x.minGrade === 1 && !x.canFill.ok && /grade or better/.test(x.canFill.reason));
    expect(k.canFill.reason).toContain(`${E.gradeName(k.minGrade)} grade or better`);
  });

  it('every grade of a stackable sells for at least 1g more than the grade below; no price went down; buy stays above sell', async () => {
    const { E, mod } = await freshEngine();
    const ids = Object.keys(mod.DATA.items).filter((id) => mod.DATA.items[id].kind !== 'gear');
    for (const id of ids) {
      const sell = [0, 1, 2, 3, 4].map((g) => E.storeSellPrice(id, g));
      const buy = [0, 1, 2, 3, 4].map((g) => E.storeBuyPrice(id, g));
      for (let g = 0; g < 5; g++) {
        expect(sell[g]).toBeGreaterThanOrEqual(Math.max(1, Math.round(E.itemValue(id, g) * mod.ECON.storeSellMult)));
        expect(buy[g]).toBeGreaterThanOrEqual(Math.max(1, Math.ceil(E.itemValue(id, g) * mod.ECON.storeResourceMult)));
        expect(buy[g]).toBeGreaterThan(sell[g]);
        if (g) { expect(sell[g]).toBeGreaterThanOrEqual(sell[g - 1] + 1); expect(buy[g]).toBeGreaterThanOrEqual(buy[g - 1] + 1); }
      }
    }
    expect([0, 1, 2].map((g) => E.storeSellPrice('copper_ore', g))).toEqual([1, 2, 3]);
  });
});

describe('recently unlocked', () => {
  it('shows only unlocks from levelling, never starters; dismissals are saved', async () => {
    const h = await freshEngine(); const { E } = h;
    const s = E.newState();
    expect(E.recentUnlocks(s)).toEqual([]);
    s.skills.mining.xp = E.xpForLevel(15);
    const r = E.derivedExtras(s).recentUnlocks;
    expect(r).toEqual(expect.arrayContaining(['mine_iron', 'mine_coal']));
    expect(r).not.toContain('mine_copper');
    expect(E.dismissUnlocks(s, ['mine_iron', 'nope'])).toMatchObject({ ok: true, dismissed: 1 });
    expect(E.recentUnlocks(s)).not.toContain('mine_iron');
    E.save(s);
    const back = E.load();
    expect(E.recentUnlocks(back)).not.toContain('mine_iron');
    expect(E.recentUnlocks(back)).toContain('mine_coal');
  });

  it('a save from before the field shows nothing it had already unlocked; later unlocks appear', async () => {
    const { E } = await freshEngine();
    const raw = V7();
    expect(raw.seenUnlocks).toBeUndefined();
    const s = E.migrate(raw);
    expect(E.skillLevel(s, 'mining')).toBeGreaterThanOrEqual(14);
    expect(E.recentUnlocks(s)).toEqual([]);
    s.skills.mining.xp = E.xpForLevel(31);
    expect(E.recentUnlocks(s)).toEqual(['mine_silver']);
  });
});

describe('war room views', () => {
  it('readiness: powers from the raid maths, best role, 1-3 tips', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    const rd = E.derivedExtras(s).readiness;
    expect(rd.req).toBe(E.roleRequirement(s, 'striker'));
    for (const r of ['guardian', 'mender', 'striker']) expect(rd.power[r]).toBe(E.rolePower(s, r, 'equipped'));
    expect(rd.best).toBe(rd.power[rd.bestRole]);
    expect(rd.best).toBe(Math.max(rd.power.guardian, rd.power.mender, rd.power.striker));
    expect(rd.ok).toBe(rd.best >= rd.req);
    expect(rd.tips.length).toBeGreaterThanOrEqual(1); expect(rd.tips.length).toBeLessThanOrEqual(3);
    E.unequip(s, 'weapon');
    expect(E.raidReadiness(s).tips[0]).toBe('Equip a weapon');
  });

  it('equipDeltas: engine stat change for each unequipped bag piece vs its slot', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    piece(s, 'gH', 'copper_helm');
    const d = E.derivedExtras(s).equipDeltas;
    expect(d.gH).toMatchObject({ hp: 5, def: 2, atk: 0, heal: 0 });
    expect(d.gH.power).toBe(E.loadoutStats(s, Object.assign({}, s.equipped, { head: 'gH' })).power - E.playerStats(s).power);
    expect(d[s.equipped.weapon]).toBeUndefined();
  });
});

describe('crew', () => {
  it('jobs carry reward + whole-second ETA (never 0 while work is left) and always finish; members flag npc', async () => {
    const h = await freshEngine(); const { E } = h;
    const s = E.newState();
    const j = s.crew.jobs[0];
    const v = E.crewJobs(s).find((x: any) => x.id === j.id);
    expect(v.reward).toMatchObject({ skill: v.action.skill, items: [] });
    expect(v.reward.xp).toBeGreaterThan(0);
    expect(v.reward.gold).toBeGreaterThan(0);
    j.done = j.qty - 1; j.progress = 0.9999;
    const near = E.crewJobs(s).find((x: any) => x.id === j.id);
    expect(near.etaSec).toBe(1);
    h.advance(1000); E.tick(s, 1);
    expect(s.crew.jobs.some((x: any) => x.id === j.id)).toBe(false);
    const fin = E.crewActivity(s).find((x: any) => x.kind === 'job');
    expect(fin.text).toBe(`Finished ${j.qty} ${plural(E.item(fin.itemId).name, j.qty)}.`);
    const mem = E.crewMembers(s);
    expect(mem[0]).toMatchObject({ isYou: true, npc: false });
    expect(mem.slice(1).every((m: any) => m.npc === true)).toBe(true);
  });

  it('plural names for feed text', () => {
    expect(plural('Copper bar', 12)).toBe('Copper bars');
    expect(plural('Copper bar', 1)).toBe('Copper bar');
    expect(plural('Copper ore', 40)).toBe('Copper ore');
    expect(plural('Ruby', 3)).toBe('Rubies');
    expect(plural('Mint leaf', 2)).toBe('Mint leaves');
    expect(plural('Leather breeches', 2)).toBe('Leather breeches');
    expect(plural('Mangy wolf', 10)).toBe('Mangy wolves');
    expect(plural('Steel cuirass', 2)).toBe('Steel cuirasses');
  });
});

describe('v7 save', () => {
  it('a real phase-3 v7 save still loads and plays', async () => {
    const h = await freshEngine(); const { E, mod } = h;
    h.storage.setItem(mod.DATA.config.saveKey, JSON.stringify(V7()));
    const r = E.loadSave();
    expect(r.status).toBe('ok');
    const s = r.state;
    expect(s.v).toBe(7);
    expect(typeof s.seenUnlocks).toBe('object');
    const ex = E.derivedExtras(s);
    for (const k of ['maxMake', 'readiness', 'recentUnlocks', 'equipDeltas']) expect(ex[k]).toBeTruthy();
    h.advance(1000); expect(() => E.tick(s, 1)).not.toThrow();
  });
});
