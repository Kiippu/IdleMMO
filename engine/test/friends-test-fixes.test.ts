// Friends-test fix pass (owner 2026-11-14):
//  1. stand-ins fill only fairly priced, non-raid-only contracts; officer requests have a daily cap
//  2. a broken weapon ends the fight (live, on the next tick and in offline catch-up)
//  3. guide progress lives in the save (state.guide, E.guide / E.setGuide)
import { describe, expect, it } from 'vitest';
import { freshEngine, START, DAY } from './engine-helpers';

const FRIDAY = START + 4 * DAY;
const npcQty = (k: any) => k.submissions.filter((x: any) => x.who !== 'You').reduce((a: number, x: any) => a + x.qty, 0);
function runFriday(h: any, s: any) {
  h.setNow(FRIDAY);
  const start = h.E.raidWindow(s).start;
  for (let t = FRIDAY; t < start - 60000; t += 60000) { h.setNow(t); h.E.tick(s, 60); }
}

describe('stand-ins on crew requests', () => {
  it('never fill a 1g/unit request for boss cores or materials, nor an underpriced one; fair requests still get filled', async () => {
    const h = await freshEngine(); const { E, mod } = h;
    const s = E.newState(); s.gold = 1e6;
    const boss = mod.DATA.bosses[0];
    const core = E.postCrewRequest(s, { itemId: boss.coreItem, qty: 250, rewardPer: 1 }).contract;
    const mat = E.postCrewRequest(s, { itemId: boss.bossMat, qty: 100, rewardPer: E.itemValue(boss.bossMat, 1) * 2 }).contract;
    const cheap = E.postCrewRequest(s, { itemId: 'copper_bar', qty: 60, rewardPer: E.itemValue('copper_bar', 1) - 1 }).contract;
    const fair = E.postCrewRequest(s, { itemId: 'copper_bar', qty: 60, rewardPer: E.itemValue('copper_bar', 1) }).contract;
    const vault0 = JSON.stringify(s.crew.vault.inv[boss.coreItem] || null);
    runFriday(h, s);
    const byId = (id: string) => s.crew.contracts.find((k: any) => k.id === id);
    expect(npcQty(byId(core.id))).toBe(0);
    expect(npcQty(byId(mat.id))).toBe(0);
    expect(npcQty(byId(cheap.id))).toBe(0);
    expect(npcQty(byId(fair.id))).toBeGreaterThan(0);
    expect(npcQty(byId(fair.id))).toBeLessThanOrEqual(30);
    expect(JSON.stringify(s.crew.vault.inv[boss.coreItem] || null)).toBe(vault0);
  });

  it('raid-only items: cores, boss materials and items no action yields; ordinary items are not', async () => {
    const { mod } = await freshEngine();
    const ce = await import('../src/crew-economy');
    mod.DATA.bosses.forEach((b: any) => { expect(ce.raidOnlyItem(b.coreItem)).toBe(true); expect(ce.raidOnlyItem(b.bossMat)).toBe(true); });
    ['copper_ore', 'copper_bar', 'bread', 'wolf_pelt'].forEach((id) => expect(ce.raidOnlyItem(id)).toBe(false));
  });

  it('town contracts (1.1x value) are still filled by stand-ins', async () => {
    const h = await freshEngine(); const { E } = h;
    const s = E.newState();
    runFriday(h, s);
    expect(s.crew.contracts.filter((k: any) => k.source === 'town').some((k: any) => npcQty(k) > 0)).toBe(true);
  });
});

describe('officer withdrawal requests have a daily cap', () => {
  it('20 units a game day (gear counts 1); resets the next day; survives save/load', async () => {
    const h = await freshEngine(); const { E, mod } = h;
    const s = E.newState();
    expect(mod.DATA.config.withdrawRequestDailyCap).toBe(20);
    s.crew.vault.inv.bread = [0, 100, 0, 0, 0];
    expect(E.requestCapLeft(s)).toBe(20);
    expect(E.requestWithdrawal(s, { itemId: 'bread', qty: 15 }).ok).toBe(true);
    expect(E.requestCapLeft(s)).toBe(5);
    const r = E.requestWithdrawal(s, { itemId: 'bread', qty: 6 });
    expect(r).toMatchObject({ ok: false, reason: 'Daily request limit: 5 more today.' });
    expect(E.requestWithdrawal(s, { itemId: 'bread', qty: 5 }).ok).toBe(true);
    expect(E.requestWithdrawal(s, { itemId: 'bread', qty: 1 })).toMatchObject({ ok: false, reason: 'Daily request limit reached. Ask again tomorrow.' });
    E.save(s); const back = E.load();
    expect(E.requestCapLeft(back)).toBe(0);
    h.advance(DAY);
    expect(E.requestCapLeft(back)).toBe(20);
  });
});

describe('a broken weapon ends the fight', () => {
  const REASON = /^Your .+ broke\. Repair it to keep fighting\.$/;
  it('live: the kill that breaks it counts, then the job stops with a clear reason; start is refused while broken', async () => {
    const h = await freshEngine(); const { E } = h;
    const s = E.newState(); const fight = E.actionsFor('striker')[0];
    const w = s.gear.find((g: any) => g.uid === s.equipped.weapon);
    expect(w).toBeTruthy();
    // every equipped piece but the weapon stays healthy; the weapon has half a kill of durability left
    w.dur = 0.5;
    expect(E.start(s, fight.id).ok).toBe(true);
    let ev: any[] = [];
    for (let i = 0; i < 120 && s.active; i++) ev = ev.concat(E.tick(s, 1));
    expect(s.active).toBeNull();
    const stop = ev.find((e) => e.type === 'stopped');
    expect(stop).toMatchObject({ actionId: fight.id, brokenWeapon: true });
    expect(stop.reason).toMatch(REASON);
    expect(ev.filter((e) => e.type === 'kill').length).toBe(1);
    expect(w.dur).toBe(0);
    const c = E.canStart(s, fight.id);
    expect(c).toMatchObject({ ok: false, brokenWeapon: true });
    expect(c.reason).toMatch(/^Your .+ is broken\. Repair it to fight\.$/);
    expect(E.start(s, fight.id).ok).toBe(false);
  });

  it('a saved fight with a broken weapon stops on the next tick (no kills)', async () => {
    const h = await freshEngine(); const { E } = h;
    const s = E.newState(); const fight = E.actionsFor('striker')[0];
    E.start(s, fight.id);
    s.gear.find((g: any) => g.uid === s.equipped.weapon).dur = 0;
    const ev = E.tick(s, 30);
    expect(s.active).toBeNull();
    expect(ev.filter((e: any) => e.type === 'kill').length).toBe(0);
    expect(ev.find((e: any) => e.type === 'stopped').reason).toMatch(REASON);
  });

  it('offline: fighting stops when the weapon breaks overnight and the summary says why', async () => {
    const h = await freshEngine(); const { E } = h;
    const s = E.newState(); const fight = E.actionsFor('striker')[0];
    const w = s.gear.find((g: any) => g.uid === s.equipped.weapon);
    w.dur = 3; // ~6 kills
    s.inv.bread = [0, 500, 0, 0, 0]; // plenty of food so fainting is not what stops it
    E.start(s, fight.id); E.save(s);
    const back = E.load();
    back.lastSeen = h.now(); h.advance(10 * 3600000);
    const r = E.applyOffline(back, h.now());
    expect(back.active).toBeNull();
    expect(r.summary.stoppedReason).toMatch(REASON); // seeded: the weapon breaks before any faint
    expect(r.summary.kills).toBe(6); // 0.5 durability a kill: the 6th kill breaks it and counts, then nothing more
    expect(back.gear.find((g: any) => g.uid === w.uid).dur).toBe(0);
    // a save that already holds a broken-weapon fight ends at once in catch-up
    const t = E.newState(); E.start(t, fight.id); t.gear.find((g: any) => g.uid === t.equipped.weapon).dur = 0;
    t.lastSeen = h.now(); h.advance(3600000);
    const r2 = E.applyOffline(t, h.now());
    expect(t.active).toBeNull(); expect(r2.summary.kills).toBe(0);
    expect(r2.summary.stoppedReason).toMatch(REASON);
  });
});

describe('guide progress in the save', () => {
  it('a new game has an empty guide; setGuide replaces given fields; it round-trips through save and export', async () => {
    const h = await freshEngine(); const { E } = h;
    const s = E.newState();
    expect(s.guide).toEqual({ dismissed: false, done: {}, baseEquipped: null });
    expect(E.guide(s)).toEqual({ dismissed: false, done: {}, baseEquipped: null });
    const r = E.setGuide(s, { done: { gather: true, sell: true, junk: false }, baseEquipped: ['g1', 7] });
    expect(r).toEqual({ ok: true, reason: '', guide: { dismissed: false, done: { gather: true, sell: true }, baseEquipped: ['g1'] } });
    E.setGuide(s, { dismissed: true });
    expect(E.guide(s)).toEqual({ dismissed: true, done: { gather: true, sell: true }, baseEquipped: ['g1'] });
    E.save(s);
    expect(E.load().guide).toEqual({ dismissed: true, done: { gather: true, sell: true }, baseEquipped: ['g1'] });
    expect(E.migrate(JSON.parse(JSON.stringify(s))).guide).toEqual(E.guide(s));
    expect(E.reset().guide).toEqual({ dismissed: false, done: {}, baseEquipped: null });
  });

  it('a v8 save from before the field loads with guide null (the client seeds it once); garbage is cleaned', async () => {
    const h = await freshEngine(); const { E } = h;
    const s = E.newState(); const raw = JSON.parse(JSON.stringify(s)); delete raw.guide;
    const back = E.migrate(raw);
    expect(back).not.toBeNull();
    expect(back.guide).toBeNull(); expect(E.guide(back)).toBeNull();
    E.setGuide(back, { done: { gather: true } });
    expect(E.guide(back)).toEqual({ dismissed: false, done: { gather: true }, baseEquipped: null });
    raw.guide = { dismissed: 'yes', done: ['x'], baseEquipped: 'nope' };
    expect(E.migrate(raw).guide).toEqual({ dismissed: false, done: {}, baseEquipped: null });
  });
});
