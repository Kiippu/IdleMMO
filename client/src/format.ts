/** Compact count: 9,999 stays whole; 12,640 -> "12.6k"; 1,234,567 -> "1.2M". Rounds down so it never overstates. */
export function fmtCompact(n: number): string {
  const v = Math.floor(Number.isFinite(n) ? Math.abs(n) : 0);
  const sign = Number.isFinite(n) && n < 0 && v > 0 ? '−' : '';
  if (v < 10_000) return sign + v.toLocaleString('en-US');
  const units: Array<[number, string]> = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'k']];
  for (const [size, tag] of units) {
    if (v >= size) {
      const x = Math.floor((v / size) * 10) / 10; // one decimal, rounded down
      return sign + (Number.isInteger(x) ? String(x) : x.toFixed(1)) + tag;
    }
  }
  return sign + String(v);
}

/** Integer as shown in the UI: separators below 10,000, compact above (12.6k, 1.2M). */
export const fmtN = (n: number): string => fmtCompact(n);

/** Exact integer with thousands separators: 1,728,000. Use only where the exact value matters. */
export const fmtFull = (n: number): string => Math.floor(Number.isFinite(n) ? n : 0).toLocaleString('en-US');

/** Gold as written in the UI: 640g, 9,990g, then compact with a space so "k" is not read as kilograms: 12.6k g. */
export const fmtG = (n: number): string => {
  const s = fmtCompact(n);
  return /[kMBT]$/.test(s) ? `${s}\u00a0g` : `${s}g`;
};

/** True when a raid recap carries the phase 2.5 payout block (older saves' recaps do not). */
export const hasPayout = (p: any): boolean => !!p && typeof p.pool === 'number' && isFinite(p.pool);

/** Coarse duration, never seconds: "2d 4h", "1h 29m", "12m", "<1m". */
export function fmtDuration(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return 'now';
  const m = Math.floor(sec / 60);
  const h = Math.floor(m / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h) return `${h}h ${m % 60}m`;
  return m ? `${m}m` : '<1m';
}

/** Game-clock timestamp relative to now: "just now", "5m ago", "2h ago", else "Sat 14:05". */
export function fmtAgo(t: number, now: number): string {
  const sec = (now - t) / 1000;
  if (!isFinite(sec) || sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  const d = new Date(t);
  const wd = d.toLocaleDateString('en-GB', { weekday: 'short' });
  return `${wd} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Rarity index (common 0 .. mythic 5) for sorting. */
export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] as const;
export const rarityRank = (r: string | undefined): number => Math.max(0, RARITY_ORDER.indexOf(r as any));

/** Short seconds-based duration: "17s", "1m 40s", "1h 5m". */
export function fmtSecs(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '—';
  if (sec < 10) return `${(Math.round(sec * 10) / 10).toString()}s`;
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
