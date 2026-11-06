// Runs every scenario in scenarios/index.mjs on the legacy (byte-for-byte) engine with a
// seeded RNG and a fake clock, and writes one JSON fixture per scenario to fixtures/.
// Usage: node scripts/record-fixtures.mjs [scenario-name ...]
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLegacy, DEFAULT_START } from '../legacy/harness.mjs';
import { scenarios } from '../scenarios/index.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../fixtures');
mkdirSync(out, { recursive: true });
const only = process.argv.slice(2);

export function recordLegacy(sc) {
  const h = loadLegacy({ seed: sc.seed, start: sc.start ?? DEFAULT_START });
  const steps = [];
  const t = {
    E: h.GW.Engine, now: h.now, advance: h.advance, storage: h.localStorage,
    step(label, p) { steps.push({ label, now: h.now(), result: h.snap(p.result), state: p.state === undefined ? undefined : h.snap(p.state) }); },
  };
  sc.run(t);
  return { name: sc.name, seed: sc.seed, start: sc.start ?? DEFAULT_START, tz: 'UTC', steps };
}

for (const sc of scenarios) {
  if (only.length && !only.includes(sc.name)) continue;
  const t0 = Date.now();
  const fx = recordLegacy(sc);
  const json = JSON.stringify(fx, null, 1);
  writeFileSync(resolve(out, sc.name + '.json'), json + '\n');
  // determinism check: a second run must produce byte-identical output
  const again = JSON.stringify(recordLegacy(sc), null, 1);
  console.log(`${sc.name}: ${fx.steps.length} steps, ${(json.length / 1024).toFixed(0)} KB, ${Date.now() - t0} ms, deterministic=${again === json}`);
}
