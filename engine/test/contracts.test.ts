// Phase 2.5 contracts board: town contracts (raid needs, paid from treasury escrow) and crew requests
// (posted by a player, paid from their own escrowed gold). Gold only; a contract never takes items it
// can't pay for and closes when its escrow runs out. Items go to crew stock only.
import { describe, expect, it } from 'vitest';
import { freshEngine, resolveRaidByClock, invTotal, START, DAY } from './engine-helpers';

const openOf = (E: any, s: any) => E.listContracts(s).filter((k: any) => k.status === 'open');
const town = (E: any, s: any) => openOf(E, s).filter((k: any) => k.source === 'town');
const FRIDAY = START + 4 * DAY; // Mon 09:00 + 4 days = Fri 09:00

describe('town contracts', () => {
  it('fresh state: raid-need contracts funded from up to 75% of free treasury at 0.5 x item value', async () => {
    const { E, mod } = await freshEngine();
    const s = E.newState();
    const ks = town(E, s);
    expect(ks.length).toBeGreaterThanOrEqual(2);
    expect(ks.map((k: any) => E.item(k.itemId).kind)).toContain('food');
    let escrowSum = 0;
    ks.forEach((k: any) => {
      expect(k.week).toBe(s.week);
      expect(k.payer).toBe('treasury'); expect(k.paidBy).toBe('Treasury');
      expect(k.rewardPer).toBe(Math.max(1, Math.round(E.itemValue(k.itemId, 1) * 0.5)));
      expect(k.escrow).toBe(k.qty * k.rewardPer); // only posts what it can pay for
      expect(k.capacity).toBe(k.qty);
      expect(k).not.toHaveProperty('repPer'); expect(k).not.toHaveProperty('pays');
      escrowSum += k.escrow;
    });
    expect(escrowSum).toBeLessThanOrEqual(Math.floor(120 * mod.DATA.config.contractBudgetShare));
    expect(E.crewGold(s)).toEqual({ free: 120 - escrowSum, escrowed: escrowSum, total: 120 });
    expect(s.rep).toBeUndefined();
  });

  it('filling pays gold from the treasury to the player and puts the items in the crew vault only', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    const k = town(E, s)[0];
    s.inv[k.itemId] = [0, 4, 0, 0, 0];
    const gold0 = s.gold; const crew0 = E.crewGold(s); const vault0 = invTotal(s.crew.vault.inv, k.itemId);
    const r = E.fillContract(s, k.id, 3);
    expect(r).toMatchObject({ ok: true, accepted: 3, gold: 3 * k.rewardPer });
    expect(r).not.toHaveProperty('rep');
    expect(s.gold).toBe(gold0 + r.gold);
    expect(invTotal(s.inv, k.itemId)).toBe(1);
    expect(invTotal(s.crew.vault.inv, k.itemId)).toBe(vault0 + 3);
    expect(E.crewGold(s)).toEqual({ free: crew0.free, escrowed: crew0.escrowed - r.gold, total: crew0.total - r.gold });
    expect(s.crew.treasury.log[0]).toMatchObject({ kind: 'contract', who: 'You', itemId: k.itemId, qty: 3, delta: -r.gold, escrowDelta: -r.gold, gold: r.gold, paidBy: 'Treasury' });
  });

  it('partial fill hands in what you have; low grades and unknown ids are rejected', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    const k = town(E, s)[0];
    s.inv[k.itemId] = [5, 2, 0, 0, 0]; // 5 Rough (below min grade) + 2 Standard
    const r = E.fillContract(s, k.id, 10);
    expect(r).toMatchObject({ ok: true, accepted: 2, partial: true });
    expect(E.fillContract(s, k.id, 1).ok).toBe(false); // only Rough left
    expect(E.fillContract(s, 'nope', 1).ok).toBe(false);
  });

  it('a contract takes only what its escrow pays for, then closes and releases the rest', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    const k = s.crew.contracts.find((x: any) => x.source === 'town');
    // shrink the escrow to 2 units' worth (simulates a contract funded before a price change)
    const extra = k.escrow - 2 * k.rewardPer - 1; // 1g dust that can't pay a whole unit
    k.escrow -= extra; s.crew.treasury.escrow -= extra; s.crew.treasury.gold += extra;
    s.inv[k.itemId] = [0, 5, 0, 0, 0];
    expect(E.listContracts(s).find((x: any) => x.id === k.id).capacity).toBe(2);
    const r = E.fillContract(s, k.id, 5);
    expect(r).toMatchObject({ ok: true, accepted: 2, gold: 2 * k.rewardPer, status: 'closed' });
    expect(invTotal(s.inv, k.itemId)).toBe(3); // never takes items it can't pay for
    expect(k.escrow).toBe(0);
    expect(s.crew.treasury.log.some((e: any) => e.kind === 'contract-release' && e.escrowDelta === -1)).toBe(true);
    expect(E.fillContract(s, k.id, 1).ok).toBe(false);
    expect(s.crew.treasury.gold).toBeGreaterThanOrEqual(0);
  });

  it('an empty treasury posts no town contracts', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    s.crew.contracts = []; s.crew.treasury.gold = 0; s.crew.treasury.escrow = 0;
    const ks = (await import('../src/crew-economy')).postContracts(s, []);
    expect(ks).toEqual([]);
  });

  it('the raid closes town contracts (not crew requests); Monday posts new town contracts', async () => {
    const h = await freshEngine();
    const { E } = h;
    const s = E.newState();
    s.gold = 500;
    const req = E.postCrewRequest(s, { itemId: 'bread', qty: 10, rewardPer: 2 });
    resolveRaidByClock(h, s);
    expect(town(E, s).length).toBe(0);
    expect(E.crewGold(s).escrowed).toBe(0);
    expect(openOf(E, s).map((k: any) => k.id)).toEqual([req.contract.id]);
    h.setNow(E.raidWindow(s).start + 3 * DAY);
    E.tick(s, 1);
    expect(s.week).toBe(2);
    const ks = town(E, s);
    expect(ks.length).toBeGreaterThan(0);
    ks.forEach((k: any) => expect(k.week).toBe(2));
  });
});

describe('NPC crewmates on the board', () => {
  it('do not fill anything Monday to Thursday', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    for (let i = 0; i < 400; i++) E.tick(s, 60); // Monday
    expect(s.crew.contracts.every((k: any) => k.submissions.length === 0)).toBe(true);
  });

  it('fill from Friday until the raid opens, at most half of each contract', async () => {
    const h = await freshEngine();
    const { E } = h;
    const s = E.newState();
    s.gold = 500;
    E.postCrewRequest(s, { itemId: 'bread', qty: 12, rewardPer: 3 });
    h.setNow(FRIDAY);
    const start = E.raidWindow(s).start;
    for (let t = FRIDAY; t < start - 60000; t += 60000) { h.setNow(t); E.tick(s, 60); }
    expect(E.lastRecap(s)).toBeNull(); // still before the raid
    s.crew.contracts.forEach((k: any) => {
      const npc = k.submissions.filter((x: any) => x.who !== 'You').reduce((a: number, x: any) => a + x.qty, 0);
      expect(npc).toBeLessThanOrEqual(Math.floor(k.qty * 0.5));
      k.submissions.forEach((x: any) => { expect(x.t).toBeGreaterThanOrEqual(FRIDAY); expect(x.t).toBeLessThan(start); });
    });
    expect(s.crew.contracts.some((k: any) => k.submissions.length > 0)).toBe(true);
  });
});

describe('crew requests (player-posted)', () => {
  it('post escrows the player\'s own gold; cancel refunds what is left; both logged with who paid', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    s.gold = 100; const crew0 = E.crewGold(s);
    const r = E.postCrewRequest(s, { itemId: 'bread', minGrade: 1, qty: 10, rewardPer: 3, note: 'For the raid' });
    expect(r.ok).toBe(true);
    expect(r.contract).toMatchObject({ source: 'crew', payer: 'player', postedBy: 'You', escrow: 30, qty: 10, rewardPer: 3 });
    expect(s.gold).toBe(70);
    expect(E.crewGold(s)).toEqual(crew0); // treasury untouched
    expect(s.crew.treasury.log[0]).toMatchObject({ kind: 'contract-escrow', delta: 0, gold: 30, paidBy: 'You' });
    const row = E.listContracts(s).find((k: any) => k.id === r.contract.id);
    expect(row).toMatchObject({ mine: true, canCancel: true, paidBy: 'You' });
    expect(row.canFill.ok).toBe(false);
    expect(E.fillContract(s, r.contract.id, 1).ok).toBe(false); // can't fill your own
    const c = E.cancelCrewRequest(s, r.contract.id);
    expect(c).toMatchObject({ ok: true, refunded: 30 });
    expect(s.gold).toBe(100);
    expect(s.crew.treasury.log[0]).toMatchObject({ kind: 'contract-release', gold: 30, paidBy: 'You' });
    expect(E.cancelCrewRequest(s, r.contract.id).ok).toBe(false);
  });

  it('validates: real item, 1-500 units, at least 1g each, enough gold', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    s.gold = 50;
    expect(E.postCrewRequest(s, { itemId: 'nope', qty: 1, rewardPer: 1 }).ok).toBe(false);
    expect(E.postCrewRequest(s, { itemId: 'bread', qty: 0, rewardPer: 1 }).ok).toBe(false);
    expect(E.postCrewRequest(s, { itemId: 'bread', qty: 5, rewardPer: 0 }).ok).toBe(false);
    expect(E.postCrewRequest(s, { itemId: 'bread', qty: 60, rewardPer: 1 }).ok).toBe(false);
    expect(s.gold).toBe(50);
  });

  it('a crewmate fill is paid from the poster\'s escrow, logged as paid by them, items to the vault', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    s.gold = 100;
    const id = E.postCrewRequest(s, { itemId: 'bread', qty: 4, rewardPer: 5 }).contract.id;
    const k = s.crew.contracts.find((x: any) => x.id === id);
    const ce = await import('../src/crew-economy');
    const crew0 = E.crewGold(s);
    expect(ce.submitToContract(s, k, 'Mira', [{ grade: 1, qty: 4 }])).toBe(20);
    expect(k.status).toBe('filled');
    expect(invTotal(s.crew.vault.inv, 'bread')).toBe(4);
    expect(E.crewGold(s)).toEqual(crew0);
    expect(s.crew.treasury.log[0].kind === 'contract' || s.crew.treasury.log[1].kind === 'contract').toBe(true);
    const e = s.crew.treasury.log.find((x: any) => x.kind === 'contract');
    expect(e).toMatchObject({ who: 'Mira', itemId: 'bread', qty: 4, gold: 20, paidBy: 'You', delta: 0 });
  });

  it('requisition verbs are gone', async () => {
    const { E } = await freshEngine();
    ['postRequisition', 'cancelRequisition', 'fillRequisition', 'requisitions', 'neededByCrew', 'isNeededByCrew', 'markRequisitionsSeen', 'requisitionFromGap']
      .forEach((v) => expect(E[v], v).toBeUndefined());
    const s = E.newState();
    expect(s.crew.requisitions).toBeUndefined();
  });
});
