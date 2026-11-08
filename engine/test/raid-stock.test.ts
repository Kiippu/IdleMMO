// Phase 2.5 fix 5: crew stock (from town contracts) is drawn only as members need it, every unit
// used on a member counts toward that member's contribution, and the use is logged.
import { describe, expect, it } from 'vitest';
import { freshEngine, resolveRaidByClock, invTotal } from './engine-helpers';

const foodId = 'bread';

describe('contract stock in raids', () => {
  it('draws only what the raid needs, not the whole stock, and logs it', async () => {
    const h = await freshEngine();
    const s = h.E.newState();
    s.crew.vault.inv[foodId] = [0, 500, 0, 0, 0];
    s.crew.members.forEach((m: any) => { m.food = 0; });
    const { recap } = resolveRaidByClock(h, s);
    const used = recap.crewStock.used[foodId] || 0;
    expect(used).toBeGreaterThan(0);
    expect(used).toBeLessThan(500);
    expect(invTotal(s.crew.vault.inv, foodId)).toBe(500 - used);
    const logged = s.crew.treasury.log.filter((e: any) => e.kind === 'raid-stock' && e.itemId === foodId).reduce((a: number, e: any) => a - e.qty, 0);
    expect(logged).toBe(used);
    // per-member attribution adds up
    const per = recap.crewStock.byMember.reduce((a: number, u: any) => a + (u.items[foodId] || 0), 0);
    expect(per).toBe(used);
  });

  it('buff potions: at most one per attending member, matched to their role', async () => {
    const h = await freshEngine();
    const s = h.E.newState();
    s.crew.vault.inv.fury_draught = [0, 50, 0, 0, 0];
    s.crew.vault.inv.ironskin_draught = [0, 50, 0, 0, 0];
    const { recap } = resolveRaidByClock(h, s);
    const used = (recap.crewStock.used.fury_draught || 0) + (recap.crewStock.used.ironskin_draught || 0);
    expect(used).toBeGreaterThan(0);
    expect(used).toBeLessThanOrEqual(recap.crew.attended);
    recap.crewStock.byMember.forEach((u: any) => expect(u.buffed).toBeLessThanOrEqual(1));
  });

  it('stock used on a member raises that member\'s contribution (the player\'s share and the crew\'s)', async () => {
    const run = async (stocked: boolean) => {
      const h = await freshEngine(5);
      const s = h.E.newState();
      s.crew.members.forEach((m: any) => { m.food = 0; m.potions = 0; });
      s.raid.rules.eatAt = 0.8; // eat early so the player draws healing too
      expect(h.E.setRaidPlan(s, { role: 'striker' }).ok).toBe(true); // a fighting role (supply doesn't draw stock)
      if (stocked) {
        s.crew.vault.inv[foodId] = [0, 300, 0, 0, 0];
        s.crew.vault.inv.mint_tonic = [0, 100, 0, 0, 0];
        s.crew.vault.inv.fury_draught = [0, 10, 0, 0, 0];
        s.crew.vault.inv.ironskin_draught = [0, 10, 0, 0, 0];
      }
      const { recap } = resolveRaidByClock(h, s);
      const crewHave = recap.checks.reduce((a: number, c: any) => a + c.crewHave, 0);
      return { recap, crewHave, points: recap.contribution.weekPoints };
    };
    const bare = await run(false);
    const fed = await run(true);
    expect(fed.recap.crewStock.byMember.length).toBeGreaterThan(0);
    expect(fed.crewHave).toBeGreaterThan(bare.crewHave);
    const you = fed.recap.crewStock.byMember.find((u: any) => u.who === 'you');
    expect(you).toBeTruthy();
    expect(fed.points).toBeGreaterThan(bare.points);
    // NPC members who ate from stock are credited
    expect(fed.recap.crewStock.byMember.some((u: any) => u.who !== 'you' && u.credit > 0)).toBe(true);
  });

  it('an empty vault draws nothing and logs no stock use', async () => {
    const h = await freshEngine();
    const s = h.E.newState();
    s.crew.vault.inv = {};
    const { recap } = resolveRaidByClock(h, s);
    expect(Object.keys(recap.crewStock.used).length).toBe(0);
    expect(s.crew.treasury.log.some((e: any) => e.kind === 'raid-stock')).toBe(false);
  });
});
