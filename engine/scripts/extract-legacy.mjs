// Slice the data.js and engine.js script bodies byte-for-byte out of ../index.html
// into engine/legacy/. Boundaries come from the "/* ==== x ==== */" markers and the
// next closing </script>, never from line numbers.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const html = readFileSync(resolve(root, '../index.html'), 'utf8');

function slice(name) {
  const marker = `/* ==== ${name} ==== */`;
  const start = html.indexOf(marker);
  if (start < 0) throw new Error(`marker not found: ${marker}`);
  if (html.indexOf(marker, start + 1) >= 0) throw new Error(`marker appears twice: ${marker}`);
  const open = html.lastIndexOf('<script>', start);
  if (open < 0 || html.slice(open + 8, start).trim() !== '') throw new Error(`${name}: marker is not at the top of a <script>`);
  const end = html.indexOf('</script>', start);
  if (end < 0) throw new Error(`no </script> after ${marker}`);
  return html.slice(start, end);
}

mkdirSync(resolve(root, 'legacy'), { recursive: true });
for (const name of ['data.js', 'engine.js']) {
  const body = slice(name);
  writeFileSync(resolve(root, 'legacy', name), body);
  console.log(`legacy/${name}: ${body.length} chars, ${body.split('\n').length} lines`);
}
