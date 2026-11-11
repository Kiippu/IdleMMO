// Parses art/CREDITS.md (the single source for credits) into rows for the in-game Credits sheet.
import md from '../../../art/CREDITS.md?raw';

export type CreditRow = { asset: string; author: string; licence: string; url: string; shareAlike: boolean; note: string; checked: string };

const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

export function parseCredits(text: string): CreditRow[] {
  const lines = text.split('\n').filter((l) => l.trim().startsWith('|'));
  if (lines.length < 3) return [];
  const head = cells(lines[0]).map((h) => h.toLowerCase());
  const col = (name: string) => head.findIndex((h) => h.startsWith(name));
  const ix = { asset: col('asset'), author: col('author'), licence: col('licence'), link: col('link'), sa: col('share'), note: col('used'), checked: col('checked') };
  const rows: CreditRow[] = [];
  for (const l of lines.slice(2)) {
    const c = cells(l);
    const get = (i: number) => (i >= 0 ? c[i] ?? '' : '');
    const asset = get(ix.asset);
    if (!asset) continue;
    const url = (get(ix.link).match(/https?:\/\/[^\s)]+/) ?? [''])[0];
    const sa = get(ix.sa).toLowerCase();
    rows.push({ asset, author: get(ix.author), licence: get(ix.licence), url, shareAlike: !!sa && !sa.startsWith('no'), note: get(ix.note), checked: get(ix.checked) });
  }
  return rows;
}

export const CREDITS: CreditRow[] = parseCredits(md);
