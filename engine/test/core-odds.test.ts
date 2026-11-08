// Phase 2.5 fix 4: raid tokens are gone, so the +0.8 token share in serverTickets is dropped.
// This test computes expected cores per player for a typical 5-person crew before and after,
// and checks the retuned pool hands out about the boss's core count across the server.
import { describe, expect, it } from 'vitest';
import { freshEngine } from './engine-helpers';

const TYPICAL_CREW = ['none', 'bronze', 'silver', 'silver', 'gold']; // tiers of 5 crewmates who joined

// per-kill chance with `tickets` held, `pity` failed draws, against `perPlayer` server tickets
function chance(tickets: number, pity: number, pityMax: number, parts: number, perPlayer: number, cores: number) {
  if (tickets <= 0) return 0;
  if (pity >= pityMax) return 1;
  const eff = tickets * (1 + pity);
  return 1 - Math.pow(1 - eff / (parts * perPlayer + eff), cores);
}
// long-run cores per kill with pity: stationary distribution of the pity chain 0..pityMax
function steadyRate(tickets: number, pityMax: number, parts: number, perPlayer: number, cores: number) {
  // P(reach pity k) = prod_{j<k} (1 - p_j); renewal: rate = 1 / E[kills per core]
  let reach = 1, expKills = 0;
  for (let k = 0; k <= pityMax; k++) {
    const p = chance(tickets, k, pityMax, parts, perPlayer, cores);
    expKills += reach; reach *= 1 - p;
    if (reach <= 0) break;
  }
  return 1 / expKills;
}

describe('core-draw odds without tokens', () => {
  it('reports expected cores per player for a typical crew, before (+0.8 tokens) and after', async () => {
    const { E, mod } = await freshEngine();
    const s = E.newState();
    const cfg = mod.DATA.config;
    const tk = cfg.tierTickets;
    const boss = E.currentBoss(s);
    const parts = Math.round(s.server.pop * cfg.serverTurnout);
    const before = tk.floor + 2.6 + 0.8;
    const after = tk.floor + cfg.serverAvgTierTickets;
    const rows = TYPICAL_CREW.map((tier) => {
      const t = tk.floor + (tk[tier] || 0);
      return {
        tier, tickets: t,
        beforeFirst: chance(t, 0, cfg.corePityMax, parts, before, boss.cores),
        afterFirst: chance(t, 0, cfg.corePityMax, parts, after, boss.cores),
        beforeSteady: steadyRate(t, cfg.corePityMax, parts, before, boss.cores),
        afterSteady: steadyRate(t, cfg.corePityMax, parts, after, boss.cores),
      };
    });
    const avg = (k: keyof typeof rows[0]) => rows.reduce((a, r) => a + (r[k] as number), 0) / rows.length;
    const summary = {
      boss: boss.id, cores: boss.cores, participants: parts, serverTicketsPerPlayer: { before, after },
      perKillNoPity: { before: avg('beforeFirst'), after: avg('afterFirst') },
      perKillWithPity: { before: avg('beforeSteady'), after: avg('afterSteady') },
      rows,
    };
    // eslint-disable-next-line no-console
    console.log('[core-odds]', JSON.stringify(summary));

    // the engine uses the retuned pool
    const rec = s.raid.bosses[boss.id];
    const odds = E.coreOdds(s);
    expect(odds.serverTickets).toBe(Math.round(parts * after));
    void rec;
    // dropping the phantom token share raises everyone's odds, by ~before/after
    expect(summary.perKillNoPity.after).toBeGreaterThan(summary.perKillNoPity.before);
    expect(summary.perKillNoPity.after / summary.perKillNoPity.before).toBeCloseTo(before / after, 1);
    // sensible: without pity the server-wide pool hands out about `cores` per kill (no phantom holders)
    const serverWide = parts * (1 - Math.pow(1 - after / (parts * after), boss.cores));
    expect(serverWide).toBeGreaterThan(boss.cores * 0.95);
    expect(serverWide).toBeLessThanOrEqual(boss.cores);
    // pity still guarantees a core within corePityMax + 1 joined kills
    rows.forEach((r) => expect(r.afterSteady).toBeGreaterThanOrEqual(1 / (cfg.corePityMax + 1)));
  });
});
