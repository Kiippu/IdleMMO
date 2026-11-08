/** Gold as written everywhere in the UI: 55,000g. */
export const fmtG = (n: number): string => `${Math.floor(n).toLocaleString('en-US')}g`;
