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
  { id: 'gather', text: 'Gather something', tab: 'Workshop', subs: { ws: 'gathering' }, selector: '[data-guide="gather"]' },
  { id: 'sell', text: 'Sell one item at the Shop', tab: 'Shop', subs: { shop: 'sell' }, selector: '[data-guide="sell"]' },
  { id: 'refine', text: 'Make a copper bar (Refine)', tab: 'Workshop', subs: { ws: 'refining' }, selector: '[data-guide="refine"]' },
  { id: 'craft', text: 'Craft an item', tab: 'Workshop', subs: { ws: 'crafting' }, selector: '[data-guide="craft"]' },
  { id: 'equip', text: 'Equip it (War Room gear)', tab: 'War Room', subs: { war: 'loadout' }, selector: '[data-guide="equip"]' },
  { id: 'assist', text: 'Help a crewmate', tab: 'Crew', subs: { crew: 'jobs' }, selector: '[data-guide="assist"]:not(:disabled)' },
  { id: 'contract', text: 'Hand in bread to a contract', tab: 'Crew', subs: { crew: 'contracts' }, selector: '[data-guide="contract"]' },
];

/** Where "Show me" should really go: with no spare gear to equip, point at crafting gear instead. */
export function resolveStep(st: Step, hasSpareGear: boolean): Step {
  if (st.id === 'equip' && !hasSpareGear) return { ...st, text: 'Craft gear to equip', tab: 'Workshop', subs: { ws: 'crafting' }, selector: '[data-guide="craft"]' };
  return st;
}

export const nextStep = (): Step | null => STEPS.find((s) => !guide.done[s.id]) ?? null;
