// First-hour guide progress. The engine has no free-form UI slot in the save, so this lives in
// localStorage (wrapped in try/catch; the guide still works for the session without it).
const KEY = 'guildwright-guide-v1';
type Saved = { dismissed: boolean; done: Record<string, boolean>; baseEquipped: string[] | null };

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { dismissed: false, done: {}, baseEquipped: null, ...JSON.parse(raw) };
  } catch { /* storage blocked */ }
  return { dismissed: false, done: {}, baseEquipped: null };
}
export const guide = $state<Saved>(load());

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify($state.snapshot(guide))); } catch { /* ignore */ }
}
export function markDone(id: string) {
  if (guide.done[id]) return;
  guide.done[id] = true; persist();
}
export function dismissGuide() { guide.dismissed = true; persist(); }
export function setBaseEquipped(uids: string[]) { guide.baseEquipped = uids; persist(); }

export type Step = { id: string; text: string; tab: string; selector: string; subs?: any };
export const STEPS: Step[] = [
  { id: 'gather', text: 'Gather something', tab: 'Workshop', selector: '.action[data-kind="gather"]:not(:disabled)' },
  { id: 'sell', text: 'Sell one item at the Shop', tab: 'Shop', selector: '.list li .btn' },
  { id: 'craft', text: 'Craft an item', tab: 'Workshop', selector: '.action[data-kind="craft"]:not(:disabled)' },
  { id: 'equip', text: 'Equip it', tab: 'Stores', selector: '.grid .tile[data-gear]', subs: { stores: 'mine' } },
  { id: 'assist', text: 'Help a crewmate', tab: 'Crew', selector: '[data-guide="assist"]:not(:disabled)', subs: { crew: 'jobs' } },
  { id: 'lock', text: 'Lock in for the raid', tab: 'War Room', selector: '[data-guide="lock"]', subs: { war: 'raid' } },
];

export const nextStep = (): Step | null => STEPS.find((s) => !guide.done[s.id]) ?? null;
