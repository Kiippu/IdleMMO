// Bundles scripts/balance/export.ts with esbuild (the engine source uses extensionless imports) and runs it.
// Usage (from the repo root): node scripts/balance/run.mjs [out.csv]   (default: /home/claude/balance.csv)
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const out = join(mkdtempSync(join(tmpdir(), 'gw-balance-')), 'export.mjs');
await build({ entryPoints: [join(here, 'export.ts')], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'warning' });
await import(pathToFileURL(out).href);
