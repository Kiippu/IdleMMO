// Phase 2.5 fix 1: town contracts. Generated from what the coming raid needs, paid from the
// crew treasury (gold while escrow lasts, then reputation), submitted items go to crew stock only.
import { describe, expect, it } from 'vitest';
import { freshEngine, resolveRaidByClock, invTotal, DAY } from './engine-helpers';

const openOf = (E: any, s: any) => E.listContracts(s).filter((k: any) => k.status === 'open');

describe('town contracts', () => {
  it('a fresh state has this week\'s contracts for raid food, healing and a buff, escrowed from free gold', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    const ks = openOf(E, s);
    expect(ks.length).toBeGreaterThanOrEqual(3);
    const kinds = ks.map((k: any) => E.item(k.itemId).kind);
    expect(kinds).toContain('food');
    expect(kinds).toContain('potion');
    ks.forEach((k: any) => {
      expect(k.week).toBe(s.week);
      expect(k.qty).toBeGreaterThan(0);
      expect(['gold', 'mixed', 'reputation']).toContain(k.pays);
    });
    // escrow came out of free gold; total crew gold unchanged; never negative
    const g = E.crewGold(s);
    const escrowSum = s.crew.contracts.reduce((a: number, k: any) => a + k.escrow, 0);
    expect(g.escrowed).toBe(escrowSum);
    expect(g.total).toBe(120);
    expect(g.free).toBeGreaterThanOrEqual(0);
  });

  it('filling pays gold from the treasury to the player and puts the items in the crew vault only', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    const k = openOf(E, s).find((x: any) => x.pays === 'gold');
    s.inv[k.itemId] = [0, 4, 0, 0, 0];
    const gold0 = s.gold; const crew0 = E.crewGold(s); const vault0 = invTotal(s.crew.vault.inv, k.itemId);
    const r = E.fillContract(s, k.id, 3);
    expect(r.ok).toBe(true);
    expect(r.accepted).toBe(3);
    expect(r.gold).toBe(3 * k.rewardPer);
    expect(r.rep).toBe(0);
    expect(s.gold).toBe(gold0 + r.gold); // spendable anywhere
    expect(invTotal(s.inv, k.itemId)).toBe(1);
    expect(invTotal(s.crew.vault.inv, k.itemId)).toBe(vault0 + 3);
    const crew1 = E.crewGold(s);
    expect(crew1.escrowed).toBe(crew0.escrowed - r.gold);
    expect(crew1.free).toBe(crew0.free);
    // logged with the item + qty and the gold out
    const e = s.crew.treasury.log[0];
    expect(e.kind).toBe('contract');
    expect(e.itemId).toBe(k.itemId); expect(e.qty).toBe(3);
    expect(e.delta).toBe(-r.gold); expect(e.escrowDelta).toBe(-r.gold);
  });

  it('partial fill: asking for more than you hold hands in what you have', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    const k = openOf(E, s)[0];
    s.inv[k.itemId] = [0, 2, 0, 0, 0];
    const r = E.fillContract(s, k.id, 10);
    expect(r.ok).toBe(true);
    expect(r.accepted).toBe(2);
    expect(r.partial).toBe(true);
    expect(E.listContracts(s).find((x: any) => x.id === k.id).remaining).toBe(k.qty - 2);
  });

  it('rejects grades below the minimum and empty hands', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    const k = openOf(E, s)[0];
    s.inv[k.itemId] = [5, 0, 0, 0, 0]; // only Rough, min grade is Standard
    const r = E.fillContract(s, k.id, 1);
    expect(r.ok).toBe(false);
    expect(invTotal(s.inv, k.itemId)).toBe(5);
    expect(E.fillContract(s, 'nope', 1).ok).toBe(false);
  });

  it('when the escrow runs out the rest pays reputation; the treasury never goes negative', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    const k = s.crew.contracts.find((x: any) => x.status === 'open' && x.escrow > 0);
    // leave escrow for exactly 2 units
    const extra = k.escrow - 2 * k.rewardPer;
    k.escrow -= extra; s.crew.treasury.escrow -= extra; s.crew.treasury.gold += extra;
    s.inv[k.itemId] = [0, 5, 0, 0, 0];
    const r = E.fillContract(s, k.id, 5);
    expect(r.ok).toBe(true);
    expect(r.gold).toBe(2 * k.rewardPer);
    expect(r.rep).toBe(3 * k.repPer);
    expect(s.rep).toBe(r.rep);
    expect(k.escrow).toBe(0);
    expect(s.crew.treasury.escrow).toBeGreaterThanOrEqual(0);
    expect(s.crew.treasury.gold).toBeGreaterThanOrEqual(0);
  });

  it('an empty treasury posts reputation-only contracts', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    // drain the treasury and roll a new week
    s.crew.contracts.forEach((k: any) => { k.escrow = 0; });
    s.crew.treasury.gold = 0; s.crew.treasury.escrow = 0;
    const ks = (await import('../src/crew-economy')).postContracts(s, []);
    expect(ks.length).toBeGreaterThan(0);
    ks.forEach((k: any) => expect(k.escrow).toBe(0));
    expect(E.listContracts(s).filter((k: any) => ks.some((x: any) => x.id === k.id)).every((k: any) => k.pays === 'reputation')).toBe(true);
  });

  it('filling the last unit closes the contract and releases leftover escrow to free gold (logged)', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    const k = s.crew.contracts.find((x: any) => x.status === 'open' && x.escrow > 0);
    k.rewardPer = 0; // reward-free from here: the whole escrow is leftover
    const esc = k.escrow; const free0 = E.crewGold(s).free;
    s.inv[k.itemId] = [0, k.qty, 0, 0, 0];
    const r = E.fillContract(s, k.id, k.qty);
    expect(r.ok).toBe(true);
    expect(r.status).toBe('filled');
    expect(k.escrow).toBe(0);
    expect(E.crewGold(s).free).toBe(free0 + esc);
    expect(s.crew.treasury.log.some((e: any) => e.kind === 'contract-release' && e.escrowDelta === -esc)).toBe(true);
    expect(E.fillContract(s, k.id, 1).ok).toBe(false);
  });

  it('the raid closes the week\'s contracts; Monday posts new ones', async () => {
    const h = await freshEngine();
    const { E } = h;
    const s = E.newState();
    resolveRaidByClock(h, s);
    expect(openOf(E, s).length).toBe(0);
    expect(E.crewGold(s).escrowed).toBe(0);
    // next Monday
    h.setNow(E.raidWindow(s).start + 3 * DAY);
    E.tick(s, 1);
    expect(s.week).toBe(2);
    const ks = openOf(E, s);
    expect(ks.length).toBeGreaterThan(0);
    ks.forEach((k: any) => expect(k.week).toBe(2));
  });

  it('NPC crewmates fill at most half of each contract', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    for (let i = 0; i < 400; i++) E.tick(s, 60); // ~6.7 h of 1-minute ticks (no raid yet: Monday)
    s.crew.contracts.forEach((k: any) => {
      const npc = k.submissions.filter((x: any) => x.who !== 'You').reduce((a: number, x: any) => a + x.qty, 0);
      expect(npc).toBeLessThanOrEqual(Math.floor(k.qty * 0.5));
    });
    expect(s.crew.contracts.some((k: any) => k.submissions.length > 0)).toBe(true);
  });

  it('no NPC auto-posted requisitions any more', async () => {
    const h = await freshEngine();
    const s = h.E.newState();
    resolveRaidByClock(h, s);
    h.setNow(h.E.raidWindow(s).start + 3 * DAY);
    h.E.tick(s, 1);
    expect(s.crew.requisitions.filter((r: any) => r.source === 'leader').length).toBe(0);
  });
});
