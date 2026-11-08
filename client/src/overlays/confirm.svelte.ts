// Promise-based API for the shared bottom sheet (ConfirmSheet.svelte, mounted once in App).
// Replaces browser prompt()/confirm()/alert().
export type SheetOpts = {
  title: string;
  body?: string;
  confirmLabel?: string;
  /** null hides the cancel button (notice sheets). */
  cancelLabel?: string | null;
  danger?: boolean;
  /** Show a number stepper; the promise resolves with the chosen number. */
  number?: { min: number; max: number; value: number; label?: string; suffix?: string };
  /** Show a text field; the promise resolves with the entered string. */
  text?: { value: string; label?: string; placeholder?: string; maxLength?: number };
};
export type SheetResult = { value: number | string | null } | null;

export const sheet = $state<{ opts: SheetOpts | null; resolve: ((r: SheetResult) => void) | null }>({
  opts: null,
  resolve: null,
});

function open(opts: SheetOpts): Promise<SheetResult> {
  // A second request while one is open cancels the first.
  sheet.resolve?.(null);
  return new Promise((resolve) => { sheet.opts = opts; sheet.resolve = resolve; });
}
export function closeSheet(r: SheetResult) {
  const res = sheet.resolve;
  sheet.opts = null; sheet.resolve = null;
  res?.(r);
}

/** Yes/no. Resolves true when confirmed. */
export async function confirmSheet(opts: Omit<SheetOpts, 'number' | 'text'>): Promise<boolean> {
  return (await open(opts)) !== null;
}
/** Pick a quantity. Resolves with the number or null when cancelled. */
export async function askNumber(opts: SheetOpts & { number: NonNullable<SheetOpts['number']> }): Promise<number | null> {
  const r = await open(opts);
  return r ? Number(r.value) : null;
}
/** Ask for a name. Resolves with the string or null when cancelled. */
export async function askText(opts: SheetOpts & { text: NonNullable<SheetOpts['text']> }): Promise<string | null> {
  const r = await open(opts);
  return r ? String(r.value ?? '') : null;
}
/** One-button message (replaces alert). */
export async function noticeSheet(title: string, body?: string): Promise<void> {
  await open({ title, body, confirmLabel: 'OK', cancelLabel: null });
}
