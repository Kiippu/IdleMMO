// Regression: a brand-new save created during the weekend raid window must not resolve (and get paid
// for) a raid that started before the save existed. It sits that raid out and joins next week's.
// Existing saves mid-raid still resolve their raid normally. Plus: gold in engine text is formatted.
import { describe, expect, it } from 'vitest';
import { freshEngine, START, DAY } from './engine-helpers';

const SUNDAY_1845 = START + 6 * DAY + (18 * 60 + 45 - 9 * 60) * 60000; // Sun 8 Nov 2026 18:45 UTC (window Sat 10:00 → Sun 22:00)

describe('new save created mid-raid', () => {
  it('does not resolve or pay the raid already under way; joins next week', async () => {
    const h = await freshEngine(1, SUNDAY_1845);
    const { E } = h;
    expect(E.isRaidWindow({ clock: { offsetMs: 0 }, crew: null })).toBe(true);
    const s = E.newState();
    const gold0 = s.gold; const treas0 = E.crewGold(s).total;
    expect(E.raidStatus(s).resolved).toBe(true); // nothing to fight this week
    E.tick(s, 1);
    h.setNow(SUNDAY_1845 + 4 * 3600000); // past the window close
    E.tick(s, 1);
    expect(E.lastRecap(s)).toBeNull();
    expect(s.gold).toBe(gold0);
    expect(E.crewGold(s).total).toBe(treas0);
    expect(s.crew.treasury.log.some((e: any) => e.kind === 'payout')).toBe(false);
    expect(s.crew.contracts.length).toBe(0); // no town contracts for a raid already under way
    // next week: contracts posted, and that raid resolves normally
    h.setNow(SUNDAY_1845 + DAY); E.tick(s, 1);
    expect(s.week).toBe(2);
    expect(s.crew.contracts.some((k: any) => k.source === 'town' && k.week === 2)).toBe(true);
    h.setNow(E.raidWindow(s).start + 60000); E.tick(s, 1);
    expect(E.lastRecap(s).week).toBe(2);
  });

  it('a new save made earlier in the week still fights that weekend', async () => {
    const h = await freshEngine(1, START);
    const s = h.E.newState();
    h.setNow(h.E.raidWindow(s).start + 60000); h.E.tick(s, 1);
    expect(h.E.lastRecap(s).week).toBe(1);
  });

  it('an existing v7 save reloaded mid-raid still resolves its raid', async () => {
    const h = await freshEngine(2, START);
    const made = h.E.newState(); // made early in the week: takes part
    h.setNow(SUNDAY_1845);
    const raw = JSON.parse(JSON.stringify(made));
    const s = h.E.migrate(raw);
    expect(s.week).toBe(1);
    h.E.tick(s, 1);
    const rc = h.E.lastRecap(s);
    expect(rc && rc.week).toBe(1);
  });
});

describe('raidStatus sittingOut / nextRaidAt', () => {
  it('a save made mid-raid is sitting out, with the next raid next Saturday', async () => {
    const h = await freshEngine(1, SUNDAY_1845);
    const s = h.E.newState();
    const st = h.E.raidStatus(s);
    expect(st.sittingOut).toBe(true);
    expect(st.nextRaidAt).toBe(Date.UTC(2026, 10, 14, 10, 0, 0)); // Sat 14 Nov 10:00
    h.setNow(SUNDAY_1845 + DAY); h.E.tick(s, 1); // week 2
    expect(h.E.raidStatus(s).sittingOut).toBe(false);
    expect(h.E.raidStatus(s).nextRaidAt).toBe(Date.UTC(2026, 10, 14, 10, 0, 0));
  });

  it('a save made early in the week is not sitting out; next raid is this Saturday, then next week after it', async () => {
    const h = await freshEngine(1, START);
    const s = h.E.newState();
    const st = h.E.raidStatus(s);
    expect(st.sittingOut).toBe(false);
    expect(st.nextRaidAt).toBe(Date.UTC(2026, 10, 7, 10, 0, 0));
    h.setNow(st.nextRaidAt + 60000); h.E.tick(s, 1);
    expect(h.E.raidStatus(s).sittingOut).toBe(false);
    expect(h.E.raidStatus(s).nextRaidAt).toBe(Date.UTC(2026, 10, 14, 10, 0, 0));
  });
});

describe('gold formatting in engine text', () => {
  it('fmtGold adds thousands separators and the g suffix', async () => {
    const { E } = await freshEngine();
    expect(E.fmtGold(0)).toBe('0g');
    expect(E.fmtGold(999)).toBe('999g');
    expect(E.fmtGold(1908)).toBe('1,908g');
    expect(E.fmtGold(76310.4)).toBe('76,310g');
    expect(E.fmtGold(1234567)).toBe('1,234,567g');
    expect(E.fmtGold(-12000)).toBe('-12,000g');
  });

  it('raid payout feed and ledger text use it', async () => {
    const h = await freshEngine();
    const s = h.E.newState();
    h.setNow(h.E.raidWindow(s).start + 60000); h.E.tick(s, 1);
    const e = s.crew.treasury.log.find((x: any) => x.kind === 'payout');
    expect(e.reason).toMatch(/\d{1,3}(,\d{3})+g pool/);
    expect(e.reason).not.toMatch(/\d{4,}g/);
    s.crew.feed.forEach((f: any) => expect(f.text).not.toMatch(/\d{4,}g/));
  });
});
