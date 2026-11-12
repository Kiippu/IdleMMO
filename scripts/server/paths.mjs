// Shared paths and a wrangler runner for the PC server scripts (Windows, macOS and Linux).
// Server data (local D1, Durable Objects) lives OUTSIDE the repo so `git clean -x` or a re-clone can't delete it.
//   GW_DATA_DIR   default: <folder holding the repo>/guildwright-data
//   GW_BACKUP_DIR default: <folder holding the repo>/guildwright-backups
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '..', '..');
export const serverDir = path.join(repoRoot, 'server');
const repoParent = path.dirname(repoRoot);

export const dataDir = path.resolve(process.env.GW_DATA_DIR || path.join(repoParent, 'guildwright-data'));
export const backupDir = path.resolve(process.env.GW_BACKUP_DIR || path.join(repoParent, 'guildwright-backups'));
export const DB_NAME = 'guildwright';

/** The wrangler CLI entry file, so we can run it with this Node directly (no shell, no quoting of paths). */
function wranglerBin() {
  try {
    const req = createRequire(path.join(serverDir, 'package.json'));
    const pkgPath = req.resolve('wrangler/package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin && pkg.bin.wrangler;
    return bin ? path.join(path.dirname(pkgPath), bin) : null;
  } catch {
    return null;
  }
}

/**
 * Run `wrangler <args>` from server/. Resolves with the exit code (and stdout when capture is set).
 * Falls back to `npx wrangler` (through the shell on Windows) if the package can't be resolved.
 */
export function runWrangler(args, { capture = false, env = {} } = {}) {
  const bin = wranglerBin();
  const quote = (a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
  const [cmd, cmdArgs, shell] = bin
    ? [process.execPath, [bin, ...args], false]
    : process.platform === 'win32'
      ? ['npx', ['wrangler', ...args].map(quote), true]
      : ['npx', ['wrangler', ...args], false];
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, {
      cwd: serverDir,
      shell,
      env: { ...process.env, ...env },
      stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    });
    let out = '';
    if (capture) child.stdout.on('data', (d) => { out += d; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, out }));
  });
}

/** Local timestamp for file names: YYYYMMDD-HHmm. */
export function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
