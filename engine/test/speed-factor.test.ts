// Phase 1 Stage F: real-speed tuning. Pins the design doc's anchor —
// "an hour of level-40 work earns about 1,000 gold" (combat). If a future
// change bumps speedFactor or changes a level-40 combat row's seconds / gold,
// this test shouts.
import { describe, expect, it, vi } from 'vitest';

async function freshEngine(seed = 1) {
  vi.resetModules();
  const mod = await import('../src/index');
  const E = mod.createEngine({ rng: mod.mulberry32(seed), now: () => Date.UTC(2026, 10, 2, 9), storage: mod.memoryStorage(), data: mod.DATA });
  return { E, mod };
}

describe('speed factor (Stage F)', () => {
  it('cfg.speedFactor is 10 (prototype was ~10x faster than the design anchor)', async () => {
    const { mod } = await freshEngine();
    const cfg = mod.DATA.config || {};
    expect(cfg.speedFactor).toBe(10);
  });

  it('level-40 combat pays ~1,000 gold/hour (design-doc anchor)', async () => {
    const { mod } = await freshEngine();
    // Find a level-40 combat row. fight_golems is guardian lvl 40, sec=9, gold=[16, 34].
    const row: any = mod.DATA.actions.find((a: any) => a.kind === 'combat' && a.level === 40);
    expect(row).toBeTruthy();
    const avgGold = Array.isArray(row.gold) ? (row.gold[0] + row.gold[1]) / 2 : row.gold;
    const scaled = row.sec * (mod.DATA.config.speedFactor || 10);
    const goldPerHour = (3600 / scaled) * avgGold;
    // Design says "about 1,000" — ±20% band so future tweaks don't trip on tiny changes.
    expect(goldPerHour).toBeGreaterThan(800);
    expect(goldPerHour).toBeLessThan(1200);
  });

  it('E.actionTime respects the speed factor on a fresh state', async () => {
    const { E, mod } = await freshEngine();
    const s = E.newState();
    const factor = mod.DATA.config.speedFactor || 10;
    // mine_copper has sec=3 in the data table; at factor=10, t ≈ 30s on a fresh player.
    const t = E.actionTime(s, 'mine_copper');
    expect(t).toBeGreaterThanOrEqual(3 * factor * 0.95);
    expect(t).toBeLessThan(3 * factor * 1.05);
  });
});
