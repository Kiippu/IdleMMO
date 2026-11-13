// Phone Back button support. Open overlays register a close callback here (push on open, pop on close);
// the browser's Back (Android button/gesture, iOS standalone swipe-back) then closes the top-most one,
// one per press. With nothing open it returns to the Workshop tab; on the Workshop it does nothing.
//
// History: the app keeps ONE sentinel entry above its base entry (same URL, state object only). Back pops the
// sentinel (popstate), we act, then re-arm it. Chrome skips history entries that were created without a user
// gesture, so the sentinel is also (re)pushed from the first pointerdown/keydown after load and after every pop.
// If a skipped sentinel makes Back land on the base entry instead, the popstate still fires and is handled the same way.
export type BackAction = 'close' | 'workshop' | 'none';
type Entry = { id: number; close: () => void };
let stack: Entry[] = [];
let nextId = 1;

/** Register an open overlay. Returns the unregister function (safe to call twice). Use inside an $effect that only depends on "open". */
export function pushBack(close: () => void): () => void {
  const id = nextId++;
  stack.push({ id, close });
  return () => { stack = stack.filter((e) => e.id !== id); };
}
export const backDepth = () => stack.length;
export const clearBackStack = () => { stack = []; };

/** What a Back press should do, given how many overlays are open and the current tab. */
export function decideBack(depth: number, tab: string): BackAction {
  return depth > 0 ? 'close' : tab !== 'Workshop' ? 'workshop' : 'none';
}

/** Run one Back press. The entry stays until its overlay really closes (its effect cleanup unregisters it), so a sub-screen can step up a level. */
export function handleBack(tab: string, goWorkshop: () => void): BackAction {
  const act = decideBack(stack.length, tab);
  if (act === 'close') stack[stack.length - 1].close();
  else if (act === 'workshop') goWorkshop();
  return act;
}

const SENTINEL = 'gw-back-sentinel';
const isSentinel = () => (history.state as any)?.[SENTINEL] === true;

/** Install the history sentinel and popstate handler. Returns a teardown. */
export function installBackButton(getTab: () => string, goWorkshop: () => void): () => void {
  if (typeof history === 'undefined') return () => {};
  const push = () => { try { history.pushState({ [SENTINEL]: true }, ''); } catch { /* ignore */ } };
  let gestureArmed = false;
  push();
  const onPop = () => {
    handleBack(getTab(), goWorkshop);
    if (!isSentinel()) { push(); gestureArmed = false; }
  };
  // First interaction after load or after a pop: add a sentinel made inside a user gesture (Chrome will not skip it).
  const onGesture = () => { if (gestureArmed) return; gestureArmed = true; push(); };
  window.addEventListener('popstate', onPop);
  window.addEventListener('pointerdown', onGesture, true);
  window.addEventListener('keydown', onGesture, true);
  return () => {
    window.removeEventListener('popstate', onPop);
    window.removeEventListener('pointerdown', onGesture, true);
    window.removeEventListener('keydown', onGesture, true);
  };
}
