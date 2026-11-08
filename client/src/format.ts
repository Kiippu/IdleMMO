/** Plain integer with thousands separators: 1,728,000. */
export const fmtN = (n: number): string => Math.floor(Number.isFinite(n) ? n : 0).toLocaleString('en-US');

/** Gold as written everywhere in the UI: 55,000g. */
export const fmtG = (n: number): string => `${Math.floor(n).toLocaleString('en-US')}g`;

/** True when a raid recap carries the phase 2.5 payout block (older saves' recaps do not). */
export const hasPayout = (p: any): boolean => !!p && typeof p.pool === 'number' && isFinite(p.pool);
