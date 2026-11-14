// Health on its own x2 scale (owner 2026-11-13): every HP quantity is 1/5 of the x10 scale it had on main, and fight and
// raid OUTCOMES are identical to main (same kills, faints, food eaten, times, points). The numbers below were recorded on
// main (2d6014a) before the change.
import { describe, expect, it } from 'vitest';
import { freshEngine, resolveRaidByClock } from './engine-helpers';

export async function soloOutcome(actionId: string, combatLevel: number, minutes: number, seed = 3) {
  const h = await freshEngine(seed); const { E } = h;
  const s = E.newState();
  const act = h.mod.DATA.actions.find((a: any) => a.id === actionId);
  s.skills[act.skill].xp = E.xpForLevel(combatLevel);
  s.hp = E.playerStats(s).maxHp; s.inv.bread = [0, 8, 0, 0, 0]; s.inv.mint_tonic = [2, 0, 0, 0, 0];
  const hp0 = s.hp / E.playerStats(s).maxHp;
  E.start(s, actionId);
  let faints = 0, eats = 0, kills = 0, dmgTaken = 0; const t0 = E.actionTime(s, actionId);
  for (let i = 0; i < minutes * 6 && s.active; i++) {
    h.advance(10000);
    for (const e of E.tick(s, 10)) { if (e.type === 'faint') faints++; if (e.type === 'eat') eats++; if (e.type === 'kill') { kills++; dmgTaken += e.damageTaken; } }
  }
  const max = E.playerStats(s).maxHp;
  return { kills, faints, eats, gold: s.gold, active: !!s.active, hpFrac: Math.round((s.hp / max) * 1e6) / 1e6, hp0, t0: Math.round(t0 * 1e6) / 1e6,
    dmgTakenFrac: Math.round((dmgTaken / max) * 1e6) / 1e6, bread: (s.inv.bread || []).reduce((a: number, b: number) => a + b, 0) };
}
export async function raidOutcome(seed = 5, role = 'guardian') {
  const h = await freshEngine(seed); const { E } = h;
  const s = E.newState(); s.inv.bread = [0, 30, 0, 0, 0];
  E.packPouch(s, 'bread', 20);
  E.setRaidPlan(s, { role });
  E.lockIn(s);
  const { recap } = resolveRaidByClock(h, s);
  const max = E.playerStats(s).maxHp;
  const tl = recap.timeline || [];
  return { role: recap.role, joined: recap.joined, tier: recap.tier, faints: recap.faints, foodEaten: JSON.stringify(recap.foodEaten), potionsUsed: JSON.stringify(recap.potionsUsed),
    pouchLeft: JSON.stringify(recap.pouchLeft), contribution: Math.round(Number(recap.contribution && recap.contribution.points != null ? recap.contribution.points : JSON.stringify(recap.contribution).length) * 1e3) / 1e3,
    gold: recap.payout && recap.payout.gold, hpFrac: Math.round((s.hp / max) * 1e6) / 1e6,
    hpSum: Math.round(tl.reduce((a: number, f: any) => a + Number(f.playerHpPct || 0), 0) * 1e6) / 1e6, moments: (recap.moments || []).map((m: any) => m.kind).join(',') };
}

describe('HP on the x2 scale: identical outcomes to main', () => {
  it('solo fights: same kills, faints, food, gold, time per kill, and damage as a share of max HP', async () => {
    expect(await soloOutcome('fight_quarry_road', 1, 120)).toEqual({ kills: 75, faints: 1, eats: 10, gold: 299, active: false, hpFrac: 0.299892, hp0: 1, t0: 3.846154, dmgTakenFrac: 2.04315, bread: 0 });
    expect(await soloOutcome('fight_ridge', 12, 60)).toEqual({ kills: 39, faints: 1, eats: 10, gold: 371, active: false, hpFrac: 0.299917, hp0: 1, t0: 17.142857, dmgTakenFrac: 1.922121, bread: 0 });
    // friends-test fix 2026-11-14: the starter weapon (100 durability, 0.5 a kill) breaks on kill 200 and the fight now
    // stops there (main kept fighting at 0 attack to 272 kills and a faint)
    expect(await soloOutcome('fight_shrine', 3, 90)).toEqual({ kills: 200, faints: 0, eats: 1, gold: 555, active: false, hpFrac: 0.586111, hp0: 1, t0: 6.521739, dmgTakenFrac: 2.362963, bread: 7 });
  });
  it('raid sim, every role: same faints, food eaten, contribution, payout and HP curve', async () => {
    const BREAD = '{"total":20,"items":{"bread":20}}';
    expect(await raidOutcome(5, 'guardian')).toEqual({ role: 'guardian', joined: true, tier: 'none', faints: 8, foodEaten: BREAD, potionsUsed: '{}', pouchLeft: '0', contribution: 0.079, gold: 6840, hpFrac: 0.349345, hpSum: 8.928836, moments: 'clutch,clutch,checkpoint,checkpoint,checkpoint' });
    expect(await raidOutcome(5, 'striker')).toEqual({ role: 'striker', joined: true, tier: 'none', faints: 6, foodEaten: BREAD, potionsUsed: '{}', pouchLeft: '0', contribution: 0.079, gold: 6840, hpFrac: 0.299854, hpSum: 14.510965, moments: 'check,checkpoint,check,checkpoint,check' });
    expect(await raidOutcome(5, 'mender')).toEqual({ role: 'mender', joined: true, tier: 'none', faints: 6, foodEaten: BREAD, potionsUsed: '{}', pouchLeft: '0', contribution: 0.052, gold: 6596, hpFrac: 0.299854, hpSum: 14.510965, moments: 'check,checkpoint,check,checkpoint,check' });
    expect(await raidOutcome(5, 'supply')).toEqual({ role: 'supply', joined: true, tier: 'none', faints: 0, foodEaten: '{"total":0,"items":{}}', potionsUsed: '{}', pouchLeft: '0', contribution: 0.09, gold: 6840, hpFrac: 1, hpSum: 60, moments: 'checkpoint,check,checkpoint,check,check' });
  });
});
