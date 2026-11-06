// Runs the prototype's built-in smoke test (E._test) on the byte-for-byte legacy engine.
// _test throws "Engine test failed: <what>" on the first failed assert and returns true
// when every check passes; it logs progress through console.log, captured here.
import { describe, expect, it } from 'vitest';
import { loadLegacy } from '../legacy/harness.mjs';

const SEEDS = [1, 2, 3, 42, 1337];

describe('legacy engine self-test (E._test)', () => {
  for (const seed of SEEDS) {
    it(`passes with seed ${seed}`, () => {
      const h = loadLegacy({ seed });
      let result: unknown;
      let error: string | null = null;
      try { result = h.GW.Engine._test({ silent: true }); } catch (e) { error = (e as Error).message; }
      expect(error).toBeNull();
      expect(result).toBe(true);
    });
  }
});
