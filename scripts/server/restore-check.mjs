// Restore drill: load a backup into a throwaway database and print row counts. Never touches the live data.
//   npm run restore-check -w @guildwright/server                  -> newest backup
//   npm run restore-check -w @guildwright/server -- <file.sql>    -> a given backup
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { backupDir, dataDir, DB_NAME, runWrangler } from './paths.mjs';

const TABLES = ['players', 'sessions', 'saves', 'treasury_log'];

let file = process.argv[2];
if (!file) {
  const all = existsSync(backupDir) ? readdirSync(backupDir).filter((f) => /^guildwright-\d{8}-\d{4}\.sql$/.test(f)).sort() : [];
  if (!all.length) {
    console.error(`[gw] no backups in ${backupDir}; run npm run backup -w @guildwright/server first.`);
    process.exit(1);
  }
  file = path.join(backupDir, all[all.length - 1]);
}
file = path.resolve(file);
if (!existsSync(file)) {
  console.error(`[gw] backup not found: ${file}`);
  process.exit(1);
}

const tmp = mkdtempSync(path.join(os.tmpdir(), 'gw-restore-'));
if (path.resolve(tmp) === dataDir) throw new Error('refusing to use the live data dir');
console.log(`[gw] restoring ${file}`);
console.log(`[gw] into temp ${tmp}`);
let code = 0;
try {
  const r = await runWrangler(['d1', 'execute', DB_NAME, '--local', '--persist-to', tmp, '--file', file, '--yes']);
  if (r.code !== 0) throw new Error('restore failed');
  const sql = TABLES.map((t) => `SELECT '${t}' AS tbl, count(*) AS n FROM ${t}`).join(' UNION ALL ');
  const q = await runWrangler(['d1', 'execute', DB_NAME, '--local', '--persist-to', tmp, '--command', sql, '--json'], { capture: true });
  if (q.code !== 0) throw new Error('count query failed');
  const start = q.out.indexOf('[');
  const rows = JSON.parse(q.out.slice(start))[0].results;
  console.log('[gw] restored row counts:');
  for (const row of rows) console.log(`  ${String(row.tbl).padEnd(14)} ${row.n}`);
  console.log('[gw] restore check passed.');
} catch (err) {
  console.error(`[gw] restore check FAILED: ${err.message}`);
  code = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
process.exit(code);
