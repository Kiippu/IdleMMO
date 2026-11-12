// Start the PC server: apply local D1 migrations, then `wrangler dev` with data kept outside the repo.
// Usage (from the repo root):
//   npm run dev -w @guildwright/server                 -> port 8787
//   npm run dev -w @guildwright/server -- --port 4173  -> any extra args go to wrangler dev
import { mkdirSync } from 'node:fs';
import { dataDir, DB_NAME, runWrangler } from './paths.mjs';

const extra = process.argv.slice(2);
mkdirSync(dataDir, { recursive: true });
console.log(`[gw] server data: ${dataDir}`);

// CI=true makes wrangler skip its "Ok to proceed?" prompt; nothing to do if all migrations are applied.
const mig = await runWrangler(['d1', 'migrations', 'apply', DB_NAME, '--local', '--persist-to', dataDir], { env: { CI: 'true' } });
if (mig.code !== 0) {
  console.error('[gw] migrations failed; not starting the server.');
  process.exit(mig.code);
}

const hasPort = extra.some((a) => a === '--port' || a.startsWith('--port='));
const args = ['dev', '--test-scheduled', '--persist-to', dataDir, ...(hasPort ? [] : ['--port', '8787']), ...extra];
const dev = await runWrangler(args);
process.exit(dev.code);
