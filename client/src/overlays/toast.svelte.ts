// Short-lived toast messages. Results also land in the Log through the engine's event log.
export const toasts = $state<{ list: Array<{ id: number; text: string; bad: boolean }> }>({ list: [] });
let seq = 0;
export function toast(text: string, bad = false, ms = 3000) {
  const id = ++seq;
  toasts.list = [...toasts.list.slice(-2), { id, text, bad }];
  setTimeout(() => { toasts.list = toasts.list.filter((t) => t.id !== id); }, ms);
}
