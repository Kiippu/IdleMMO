import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Windows and macOS file systems ignore case, so `toast.svelte` (import of toast.svelte.ts) can resolve to
// `Toast.svelte` there while Linux CI resolves it correctly. Fail on any two files in one folder whose import
// specifiers differ only by case.
const root = dirname(fileURLToPath(import.meta.url));

function walk(dir: string, out: string[][] = []): string[][] {
  const names = readdirSync(dir);
  const seen = new Map<string, string>();
  for (const name of names) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { walk(full, out); continue; }
    for (const spec of new Set([name, name.replace(/\.(ts|js)$/, '')])) {
      const key = spec.toLowerCase();
      const prev = seen.get(key);
      if (prev && prev !== name) out.push([join(dir, prev), full]);
      else seen.set(key, name);
    }
  }
  return out;
}

describe('file names', () => {
  it('no two files in a folder differ only by letter case', () => {
    expect(walk(root)).toEqual([]);
  });
});
