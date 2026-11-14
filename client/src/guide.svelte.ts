// First-hour guide progress. Lives in the engine save (state.guide, via setGuide); `guide` below is a local mirror
// the components read. On a save from before the field (snapshot.guide === null) the localStorage copy seeds it once.
import { engine } from './engine/store.svelte';
import { engineClient } from './engine/client';

const KEY = 'guildwright-guide-v1';
type Saved = { dismissed: boolean; done: Record<string, boolean>; baseEquipped: string[] | null };
const EMPTY = (): Saved => ({ dismissed: false, done: {}, baseEquipped: null });

function legacy(): Saved {
  try { const raw = localStorage.getItem(KEY); if (raw) return { ...EMPTY(), ...JSON.parse(raw) }; } catch { /* storage blocked */ }
  return EMPTY();
}
export const guide = $state<Saved>(EMPTY());

let seeding = false;
$effect.root(() => {
  $effect(() => {
    const g = (engine.snapshot as any)?.guide as Saved | null | undefined;
    if (g) { guide.dismissed = !!g.dismissed; guide.done = { ...g.done }; guide.baseEquipped = g.baseEquipped ? [...g.baseEquipped] : null; return; }
    if (g === null && !seeding) {
      seeding = true;
      const l = legacy();
      Object.assign(guide, l);
      Promise.resolve(engineClient.setGuide({ dismissed: l.dismissed, done: l.done as Record<string, true>, baseEquipped: l.baseEquipped })).catch((e) => console.error('guide seed failed', e)).finally(() => { seeding = false; });
    }
  });
});

function persist(part: Partial<Saved>) {
  Promise.resolve(engineClient.setGuide(part as any)).catch((e) => console.error('guide save failed', e));
}
export function markDone(id: string) {
  if (guide.done[id]) return;
  guide.done[id] = true; persist({ done: { ...guide.done } });
}
export function dismissGuide() { guide.dismissed = true; persist({ dismissed: true }); }
export function setBaseEquipped(uids: string[]) { guide.baseEquipped = uids; persist({ baseEquipped: uids }); }

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
