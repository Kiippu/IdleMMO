// Apply local D1 migrations to the server data dir (the same one `npm run dev` uses).
import { mkdirSync } from 'node:fs';
import { dataDir, DB_NAME, runWrangler } from './paths.mjs';

mkdirSync(dataDir, { recursive: true });
console.log(`[gw] server data: ${dataDir}`);
const r = await runWrangler(['d1', 'migrations', 'apply', DB_NAME, '--local', '--persist-to', dataDir, ...process.argv.slice(2)], { env: { CI: 'true' } });
process.exit(r.code);
