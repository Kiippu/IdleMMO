// Tool slots and the last-tool rule (owner 2026-11-14):
//  - a gather/refine/craft job (or assist) in a tool skill needs a tool in that skill's slot; emptying the slot ends the job
//  - starter tools can be sold (pays 0g) and salvaged (yields nothing), and never stack with paid copies
//  - the player's LAST tool for a skill (worn + bag; vault doesn't count) can't be sold, salvaged or deposited
import { describe, expect, it } from 'vitest';
import { freshEngine } from './engine-helpers';

const add = (s: any, uid: string, itemId: string, mod: any, quality = 50) => {
  const it = mod.DATA.items[itemId]; const g: any = { uid, itemId, rarity: 'common', quality, affixes: [] };
  if (it.section === 'fight') { g.dur = 100; g.maxDur = 100; } else if (it.section === 'tool') g.cond = 100;
  s.gear.push(g); return g;
};
const KEEP = 'Your last Mining tool: keep it.';

describe('tool slot gates work', () => {
  it('taking the tool off ends the running job at once with a stopped event; no auto-resume', async () => {
    const h = await freshEngine(); const { E } = h;
    const s = E.newState(); const pick = s.tools.mining;
    expect(E.start(s, 'mine_copper').ok).toBe(true);
    E.takeEvents(); // drain
    const r = E.unequipGear(s, pick);
    expect(r).toEqual({ ok: true, reason: '', stopped: 'No tool in the Mining slot.' });
    expect(s.active).toBeNull();
    expect(E.takeEvents()).toEqual([{ type: 'stopped', reason: 'No tool in the Mining slot.', actionId: 'mine_copper' }]);
    // putting it back does not restart anything
    E.equip(s, pick); h.advance(5000); E.tick(s, 5);
    expect(s.active).toBeNull();
  });

  it('taking off a tool of another skill leaves the job running', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    E.start(s, 'mine_copper');
    expect(E.unequipGear(s, s.tools.woodcutting)).toEqual({ ok: true, reason: '' });
    expect(s.active).toMatchObject({ actionId: 'mine_copper' });
  });

  it('start is refused with an empty slot; disabledReasons says why; combat needs no tool', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    E.unequipGear(s, s.tools.mining);
    expect(E.canStart(s, 'mine_copper')).toMatchObject({ ok: false, reason: 'Needs a tool in the Mining slot.' });
    expect(E.start(s, 'mine_copper').ok).toBe(false);
    expect(s.active).toBeNull();
    expect(E.disabledReasons(s).actions.mine_copper).toBe('Needs a tool in the Mining slot.');
    expect(E.disabledReasons(s).actions[E.actionsFor('woodcutting')[0].id]).toBeUndefined(); // other skills keep their tools
    const fight = E.actionsFor('striker')[0];
    expect(E.canStart(s, fight.id).ok).toBe(true);
  });

  it('assisting uses your own tool: assist is refused without one, and taking it off ends the assist', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    const job = s.crew.jobs.find((j: any) => E.canAssist(s, j.id).ok);
    expect(job).toBeTruthy();
    const skill = E.crewJobs(s).find((j: any) => j.id === job.id).skill;
    const uid = s.tools[skill];
    expect(E.assist(s, job.id).ok).toBe(true);
    const r = E.unequipGear(s, uid);
    expect(r.stopped).toMatch(/^No tool in the .+ slot\.$/);
    expect(s.active).toBeNull();
    expect(E.canAssist(s, job.id)).toMatchObject({ ok: false });
    expect(E.canAssist(s, job.id).reason).toMatch(/^Needs a tool in the .+ slot\.$/);
    expect(E.disabledReasons(s).jobs[job.id]).toMatch(/^Needs a tool in the /);
  });

  it('a saved job with an empty slot ends cleanly: on load, in offline catch-up and on the next tick', async () => {
    const h = await freshEngine(); const { E, mod } = h;
    const s = E.newState();
    E.start(s, 'mine_copper'); s.tools.mining = null; // as if a save held a running job and no tool
    E.save(s);
    const back = E.load();
    expect(back.active).toMatchObject({ actionId: 'mine_copper' });
    back.lastSeen = h.now(); h.advance(3600000);
    const r = E.applyOffline(back, h.now());
    expect(back.active).toBeNull();
    expect(r.summary.stoppedReason).toBe('No tool in the Mining slot.');
    expect(r.summary.items.copper_ore ?? 0).toBe(0);
    // tick safety net
    const t = E.newState(); E.start(t, 'mine_copper'); t.tools.mining = null;
    const ev = E.tick(t, 1);
    expect(t.active).toBeNull();
    expect(ev).toEqual(expect.arrayContaining([{ type: 'stopped', reason: 'No tool in the Mining slot.', actionId: 'mine_copper' }]));
    void mod;
  });
});

describe('starter tools and the last-tool rule', () => {
  it('starter tools: selling pays 0g and just removes it (no gold event); salvage is allowed and yields nothing', async () => {
    const { E, mod } = await freshEngine();
    const s = E.newState(); const pick = s.tools.mining;
    add(s, 'spare', 'bronze_pickaxe', mod);
    E.equip(s, 'spare');
    const d = E.gearDetail(s, pick);
    expect(d.keepReason).toBeUndefined();
    expect(d.sellPrice).toBe(0); expect(d.salvage).toEqual([]); // [] = allowed, yields nothing
    expect(E.gearInfo(s)[pick].keepReason).toBeUndefined();
    expect(E.storeView(s).gearSellPrices[pick]).toBe(0);
    expect(E.gearDetail(s, 'spare').sellPrice).toBeGreaterThan(0); // a paid copy keeps its price
    const g0 = s.gold; const ev0 = E.events(s, 200).length;
    expect(E.storeSellGear(s, pick)).toEqual({ ok: true, reason: '', qty: 1, gold: 0 });
    expect(s.gold).toBe(g0);
    expect(s.gear.some((g: any) => g.uid === pick)).toBe(false);
    const evs = E.events(s, 200);
    expect(evs.length).toBe(ev0 + 1);
    expect(evs.some((e: any) => e.cat === 'gold' && /starter/.test(e.text))).toBe(false);
    expect(evs.some((e: any) => /^Handed your starter .+ to the general store \(no pay\)\.$/.test(e.text))).toBe(true);
    // a second starter (woodcutting) salvages to nothing once a spare axe is worn
    const axe = s.tools.woodcutting; const axeItem = s.gear.find((g: any) => g.uid === axe).itemId;
    add(s, 'axe2', axeItem, mod); E.equip(s, 'axe2');
    expect(E.salvagePreview(s, [axe], {})).toMatchObject({ gearCount: 1, items: [], blocked: [] });
    const sv = E.salvage(s, [axe]);
    expect(sv).toMatchObject({ ok: true, salvaged: 1, items: [], blocked: [] });
    expect(s.gear.some((g: any) => g.uid === axe)).toBe(false);
  });

  it('starter tools never stack with identical paid tools', async () => {
    const { E, mod } = await freshEngine();
    const s = E.newState(); const pick = s.tools.mining; const g = s.gear.find((x: any) => x.uid === pick);
    add(s, 'spare', g.itemId, mod, g.quality); add(s, 'spare2', g.itemId, mod, g.quality);
    E.unequipGear(s, pick);
    const info = E.gearInfo(s);
    expect(info[pick].stackKey).toBeNull();
    expect(info.spare.stackKey).toBeTruthy(); expect(info.spare.stackKey).toBe(info.spare2.stackKey);
  });

  it('mass salvage includes starters (yield nothing) unless one is the last tool for its skill', async () => {
    const { E, mod } = await freshEngine();
    const s = E.newState(); const pick = s.tools.mining; const axe = s.tools.woodcutting;
    E.unequipGear(s, pick); E.unequipGear(s, axe);
    add(s, 'p2', 'bronze_pickaxe', mod); E.equip(s, 'p2'); // mining has a worn spare; woodcutting has only its starter
    const r = E.salvage(s, [pick, axe]);
    expect(r).toMatchObject({ ok: true, salvaged: 1, items: [], blocked: [{ uid: axe, reason: 'Your last Woodcutting tool: keep it.' }] });
    expect(s.gear.some((g: any) => g.uid === pick)).toBe(false);
    expect(s.gear.some((g: any) => g.uid === axe)).toBe(true);
  });

  it('the last tool for a skill can\'t be sold, salvaged or deposited; the detail says why', async () => {
    const { E } = await freshEngine();
    const s = E.newState(); const pick = s.tools.mining;
    E.unequipGear(s, pick); // in the bag, still the only mining tool
    expect(E.gearDetail(s, pick).keepReason).toBe(KEEP);
    expect(E.gearInfo(s)[pick].keepReason).toBe(KEEP);
    expect(E.storeSellGear(s, pick)).toMatchObject({ ok: false, reason: KEEP });
    expect(E.salvage(s, [pick], { allowProtected: true })).toMatchObject({ ok: false, reason: KEEP, blocked: [{ uid: pick, reason: KEEP }] });
    expect(E.salvagePreview(s, [pick], {})).toMatchObject({ gearCount: 0, blocked: [{ uid: pick, reason: KEEP }] });
    expect(E.vaultDepositGear(s, pick)).toMatchObject({ ok: false, reason: KEEP });
    expect(s.gear.some((g: any) => g.uid === pick)).toBe(true);
    // worn and the only one: the vault refuses too (the vault would otherwise take it off)
    E.equip(s, pick);
    expect(E.vaultDepositGear(s, pick)).toMatchObject({ ok: false, reason: KEEP });
    expect(s.tools.mining).toBe(pick);
    // a vault copy does not count
    E.unequipGear(s, pick);
    s.crew.vault.gear.push({ uid: 'v1', itemId: s.gear.find((g: any) => g.uid === pick).itemId, rarity: 'common', quality: 50, affixes: [], cond: 100 });
    expect(E.storeSellGear(s, pick)).toMatchObject({ ok: false, reason: KEEP });
  });

  it('mass salvage skips the last tool per skill (keeps the best) and reports it', async () => {
    const { E, mod } = await freshEngine();
    const s = E.newState(); const pick = s.tools.mining;
    E.unequipGear(s, pick);
    add(s, 'p_low', 'bronze_pickaxe', mod, 10);
    add(s, 'p_hi', 'bronze_pickaxe', mod, 95);
    const all = [pick, 'p_low', 'p_hi'];
    const pv = E.salvagePreview(s, all, {});
    expect(pv.gearCount).toBe(2);
    expect(pv.blocked).toEqual([{ uid: 'p_hi', reason: KEEP }]);
    const r = E.salvage(s, all);
    expect(r).toMatchObject({ ok: true, salvaged: 2, blocked: [{ uid: 'p_hi', reason: KEEP }] });
    expect(s.gear.filter((g: any) => mod.DATA.items[g.itemId].toolSkill === 'mining').map((g: any) => g.uid)).toEqual(['p_hi']);
    // a worn one in the set is "In use", so every bag copy can go
    E.equip(s, 'p_hi'); add(s, 'p_a', 'bronze_pickaxe', mod); add(s, 'p_b', 'bronze_pickaxe', mod);
    const r2 = E.salvage(s, ['p_hi', 'p_a', 'p_b']);
    expect(r2.salvaged).toBe(2); expect(r2.blocked).toEqual([{ uid: 'p_hi', reason: 'In use. Take it off first.' }]);
  });

  it('depositing the worn tool when a spare exists empties the slot and ends the job', async () => {
    const { E, mod } = await freshEngine();
    const s = E.newState(); const pick = s.tools.mining;
    add(s, 'spare', 'bronze_pickaxe', mod);
    E.start(s, 'mine_copper'); E.takeEvents();
    const r = E.vaultDepositGear(s, pick);
    expect(r).toMatchObject({ ok: true, stopped: 'No tool in the Mining slot.' });
    expect(s.tools.mining).toBeNull(); expect(s.active).toBeNull();
    expect(E.takeEvents()).toEqual([{ type: 'stopped', reason: 'No tool in the Mining slot.', actionId: 'mine_copper' }]);
    // the spare is now the last mining tool
    expect(E.storeSellGear(s, 'spare')).toMatchObject({ ok: false, reason: KEEP });
  });
});
