// Cross-tab UI state: deep links into another tab/sub-tab, and the guide's target highlight.
type Sub = { crew: 'roster' | 'jobs' | 'contracts' | 'treasury' | null; war: 'loadout' | 'raid' | null; stores: 'mine' | 'crew' | 'codex' | null };
export const ui = $state<{ crewSub: Sub['crew']; warSub: Sub['war']; storesSub: Sub['stores']; goTab: string | null; wsCat: string | null; wsOpen: boolean }>({
  crewSub: null, warSub: null, storesSub: null, goTab: null, wsCat: null, wsOpen: false,
});

/** Switch tab (and sub-tab), then pulse the element matching `selector` once it exists. */
export function showMe(tab: string, selector: string, subs: Partial<{ crew: Sub['crew']; war: Sub['war']; stores: Sub['stores']; ws: string }> = {}) {
  if (subs.ws) { ui.wsCat = subs.ws; ui.wsOpen = true; }
  if (subs.crew) ui.crewSub = subs.crew;
  if (subs.war) ui.warSub = subs.war;
  if (subs.stores) ui.storesSub = subs.stores;
  ui.goTab = tab;
  let tries = 0;
  const t = setInterval(() => {
    const el = document.querySelector<HTMLElement>(selector);
    if (el || ++tries > 20) {
      clearInterval(t);
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      el.classList.add('guide-pulse');
      setTimeout(() => el.classList.remove('guide-pulse'), 3200);
    }
  }, 100);
}

/** Bag filters persist for the session. */
export type BagFilter = { q: string; cat: 'All' | 'Materials' | 'Gear' | 'Food & potions'; rarity: string; sort: 'rarity' | 'name' | 'qty' | 'value' | 'newest' };
const fresh = (): BagFilter => ({ q: '', cat: 'All', rarity: 'all', sort: 'newest' });
export const bagFilter = $state<BagFilter>(fresh());
export const vaultFilter = $state<BagFilter>(fresh());
export const resetFilter = (f: BagFilter) => Object.assign(f, fresh());
