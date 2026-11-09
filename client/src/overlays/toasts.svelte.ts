// Short-lived toast messages. Results also land in the Log through the engine's event log.
// Toasts wait while any sheet/dialog is open (Toast.svelte) so they never cover sheet content.
export const toasts = $state<{ list: Array<{ id: number; text: string; bad: boolean; shown: boolean }> }>({ list: [] });
let seq = 0;
export function toast(text: string, bad = false) {
  const id = ++seq;
  toasts.list = [...toasts.list.slice(-2), { id, text, bad, shown: false }];
}
export function expireToast(id: number) { toasts.list = toasts.list.filter((t) => t.id !== id); }
