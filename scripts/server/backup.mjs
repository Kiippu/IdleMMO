// Export the local D1 database to <backups>/guildwright-YYYYMMDD-HHmm.sql and keep the newest 14.
//   npm run backup -w @guildwright/server
//
// Why not `wrangler d1 export --local`? In wrangler 4.158 that command has no --persist-to flag: it only reads
// server/.wrangler/state. Our data lives outside the repo, so we do the same thing wrangler does (open the
// database with Miniflare and run its export pragma) against our own data dir.
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { backupDir, dataDir, serverDir, stamp } from './paths.mjs';

const KEEP = 14;
const PATTERN = /^guildwright-\d{8}-\d{4}\.sql$/;
// wrangler's local D1 id = preview_database_id ?? database_id ?? binding; ours is database_id "local" (server/wrangler.jsonc)
const LOCAL_DB_ID = 'local';

if (!existsSync(path.join(dataDir, 'v3', 'd1'))) {
  console.error(`[gw] no local database under ${dataDir}; start the server once first (npm run dev -w @guildwright/server).`);
  process.exit(1);
}
const req = createRequire(path.join(serverDir, 'package.json'));
const { Miniflare, convertV4MiniflareOptions } = req(req.resolve('miniflare', { paths: [path.dirname(req.resolve('wrangler/package.json'))] }));

mkdirSync(backupDir, { recursive: true });
const out = path.join(backupDir, `guildwright-${stamp()}.sql`);

// same options wrangler's own local export uses (miniflare 5 takes v4-style options through this converter)
const mf = new Miniflare(convertV4MiniflareOptions({
  modules: true,
  script: 'export default {}',
  resourcePersistencePath: path.join(dataDir, 'v3'),
  d1Databases: { DATABASE: LOCAL_DB_ID },
}));
try {
  const db = await mf.getD1Database('DATABASE');
  // exactly as wrangler calls it: noSchema, noData, then table names (none = all)
  const dump = await db.prepare('PRAGMA miniflare_d1_export(?,?,?);').bind(false, false).raw();
  writeFileSync(out, dump[0].join('\n'));
} catch (err) {
  console.error(`[gw] backup failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await mf.dispose();
}
if (process.exitCode) process.exit(1);

const size = statSync(out).size;
if (size === 0) {
  console.error(`[gw] backup is empty: ${out}`);
  process.exit(1);
}
console.log(`[gw] backup: ${out} (${(size / 1024).toFixed(1)} KB)`);

// keep the newest KEEP backups (names sort by time)
const old = readdirSync(backupDir).filter((f) => PATTERN.test(f)).sort().reverse().slice(KEEP);
for (const f of old) {
  unlinkSync(path.join(backupDir, f));
  console.log(`[gw] removed old backup ${f}`);
}
