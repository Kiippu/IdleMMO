// Phase 2.5 fix 3: every gold and item movement in the crew treasury/vault is logged, entries use
// `t` for time (legacy `at` is read and normalised), item rows carry item id + qty, and crew gold
// is reported as free + escrowed.
import { describe, expect, it } from 'vitest';
import { freshEngine, resolveRaidByClock } from './engine-helpers';

describe('treasury log covers every movement', () => {
  it('item deposit and withdrawal are logged with item id and signed qty', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    s.inv.bread = [0, 6, 0, 0, 0];
    expect(E.vaultDeposit(s, 'bread', 1, 4).ok).toBe(true);
    let e = s.crew.treasury.log[0];
    expect(e).toMatchObject({ kind: 'deposit', who: 'You', itemId: 'bread', qty: 4, grade: 1, delta: 0 });
    expect(typeof e.t).toBe('number');
    expect(e.at).toBeUndefined();
    expect(E.vaultWithdraw(s, 'bread', null, 3).ok).toBe(true);
    e = s.crew.treasury.log[0];
    expect(e).toMatchObject({ kind: 'withdraw', who: 'You', itemId: 'bread', qty: -3 });
  });

  it('gear deposit and withdrawal are logged as gear rows', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    const g = s.gear[0];
    expect(E.vaultDepositGear(s, g.uid).ok).toBe(true);
    expect(s.crew.treasury.log[0]).toMatchObject({ kind: 'deposit', itemId: g.itemId, qty: 1, uid: g.uid, gear: true });
    expect(E.vaultWithdrawGear(s, g.uid).ok).toBe(true);
    expect(s.crew.treasury.log[0]).toMatchObject({ kind: 'withdraw', itemId: g.itemId, qty: -1, uid: g.uid, gear: true });
  });

  it('an approved crewmate withdrawal request is logged under their name', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    s.crew.vault.inv.bread = [0, 5, 0, 0, 0];
    s.crew.withdrawRequests.unshift({ id: 'W1', who: 'Mira', isYou: false, itemId: 'bread', grade: null, qty: 2, uid: null, note: '', t: 0, status: 'pending', answeredBy: null });
    expect(E.resolveWithdrawal(s, 'W1', true).ok).toBe(true);
    expect(s.crew.treasury.log[0]).toMatchObject({ kind: 'withdraw', who: 'Mira', itemId: 'bread', qty: -2 });
  });

  it('requisition escrow, cancel release and contract escrow are logged; free/escrow stay consistent', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    const g0 = E.crewGold(s);
    expect(E.postRequisition(s, { itemId: 'bread', qty: 5, rewardPer: 2 }).ok).toBe(true);
    expect(s.crew.treasury.log[0]).toMatchObject({ kind: 'escrow', delta: 0, escrowDelta: 10 });
    const g1 = E.crewGold(s);
    expect(g1).toEqual({ free: g0.free - 10, escrowed: g0.escrowed + 10, total: g0.total });
    const id = s.crew.requisitions[0].id;
    expect(E.cancelRequisition(s, id).ok).toBe(true);
    expect(s.crew.treasury.log[0]).toMatchObject({ kind: 'release', delta: 0, escrowDelta: -10 });
    expect(E.crewGold(s)).toEqual(g0);
    // the log replays to the current split: sum of escrowDelta == escrowed
    const esc = s.crew.treasury.log.reduce((a: number, e: any) => a + (e.escrowDelta || 0), 0);
    expect(esc).toBe(E.crewGold(s).escrowed);
  });

  it('raid payout and raid stock used are logged; the summed log matches the treasury', async () => {
    const h = await freshEngine();
    const s = h.E.newState();
    const start = h.E.crewGold(s).total; // 120 starting treasury predates the log
    s.crew.vault.inv.bread = [0, 40, 0, 0, 0];
    s.crew.members.forEach((m: any) => { m.food = 0; }); // crew must eat from stock
    resolveRaidByClock(h, s);
    const log = s.crew.treasury.log;
    expect(log.some((e: any) => e.kind === 'payout' && e.delta > 0)).toBe(true);
    expect(log.some((e: any) => e.kind === 'raid-stock' && e.itemId === 'bread' && e.qty < 0)).toBe(true);
    const sum = log.reduce((a: number, e: any) => a + e.delta, 0);
    expect(start + sum).toBe(h.E.crewGold(s).total);
  });

  it('E.treasury exposes free + escrowed and the normalised log', async () => {
    const { E } = await freshEngine();
    const s = E.newState();
    const t = E.treasury(s);
    expect(t.free).toBe(s.crew.treasury.gold);
    expect(t.escrowed).toBe(s.crew.treasury.escrow);
    expect(t.total).toBe(t.free + t.escrowed);
    expect(Array.isArray(t.log)).toBe(true);
  });

  it('legacy log entries written with `at` load with `t`', async () => {
    const { E } = await freshEngine();
    const base = E.newState();
    const raw = JSON.parse(JSON.stringify(base));
    raw.v = 5;
    raw.crew.treasury.log = [{ at: 12345, week: 1, kind: 'payout', who: 'Raid', delta: 7, reason: 'old' }];
    const out = E.migrate(raw);
    const e = out.crew.treasury.log.find((x: any) => x.reason === 'old');
    expect(e.t).toBe(12345);
    expect(e.at).toBeUndefined();
  });
});

describe('treasury log uses the game clock', () => {
  it('entry t (and contract/feed timestamps) follow nowOf(state), including the clock offset', async () => {
    const { E, now } = await freshEngine();
    const s = E.newState();
    s.clock.offsetMs = 5 * 86400000; // game clock ahead of real time
    s.inv.bread = [0, 3, 0, 0, 0];
    E.vaultDeposit(s, 'bread', 1, 2);
    expect(s.crew.treasury.log[0].t).toBe(now() + 5 * 86400000);
    expect(s.crew.treasury.log[0].t).toBe(E.now(s));
    expect(s.crew.feed[0].t).toBe(E.now(s));
    const k = s.crew.contracts.find((x: any) => x.status === 'open');
    s.inv[k.itemId] = [0, 1, 0, 0, 0];
    E.fillContract(s, k.id, 1);
    expect(s.crew.treasury.log[0].t).toBe(E.now(s));
    expect(k.submissions[k.submissions.length - 1].t).toBe(E.now(s));
  });
});
