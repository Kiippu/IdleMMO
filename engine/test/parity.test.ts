// Phase 0 gate: the TS engine reproduces every fixture recorded from the legacy build
// (scripts/record-fixtures.mjs) step by step, under the same seed and fake clock.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scenarios } from '../scenarios/index.mjs';
import { firstDiff, freshEngine, snapResult, snapState } from './helpers';

const fixture = (name: string) => JSON.parse(readFileSync(resolve(__dirname, '../fixtures', name + '.json'), 'utf8'));

// A handful of step labels in scenarios/index.mjs were renamed after the fixtures were
// recorded (the step data still matches). We can't edit scenarios/index.mjs or the
// fixtures, so we map the new label back to the recorded one here; see PORTING.md.
const LABEL_RENAMES: Record<string, Record<string, string>> = {
  offline: { 'offline refine 1h': 'offline refine runs dry' },
};
const rename = (scenario: string, label: string) => LABEL_RENAMES[scenario]?.[label] ?? label;

describe('parity with legacy fixtures', () => {
  for (const sc of scenarios) {
    it(sc.name, async () => {
      const fx = fixture(sc.name);
      expect(fx.seed).toBe(sc.seed);
      const h = await freshEngine(sc.seed, fx.start);
      const got: any[] = [];
      sc.run({
        E: h.E, now: h.now, advance: h.advance, storage: h.storage,
        step(label, p) { got.push({ label: rename(sc.name, label), now: h.now(), result: snapResult(p.result), state: snapState(p.state) }); },
      });
      expect(got.map((s) => s.label)).toEqual(fx.steps.map((s: any) => s.label));
      for (let i = 0; i < got.length; i++) {
        const want = fx.steps[i];
        const d = firstDiff(got[i], JSON.parse(JSON.stringify(want)));
        expect(d, `step ${i} "${want.label}"`).toBeNull();
      }
    });
  }
});
