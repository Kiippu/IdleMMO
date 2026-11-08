/** Plain integer with thousands separators: 1,728,000. */
export const fmtN = (n: number): string => Math.floor(Number.isFinite(n) ? n : 0).toLocaleString('en-US');

/** Gold as written everywhere in the UI: 55,000g. */
export const fmtG = (n: number): string => `${Math.floor(n).toLocaleString('en-US')}g`;

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
