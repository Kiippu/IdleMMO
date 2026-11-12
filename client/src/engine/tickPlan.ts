// When should the worker tick next? Idle: once a second. With a rep running: exactly when it completes
// (plus a hair of slack so float rounding never leaves it 0.0001s short), never more than 1s away.
export const TICK_MAX_MS = 1000;
export const TICK_MIN_MS = 4;
export const TICK_SLACK_MS = 1;

export function nextTickDelay(secLeft: number | null | undefined): number {
  if (secLeft == null || !isFinite(secLeft)) return TICK_MAX_MS;
  const ms = secLeft * 1000 + TICK_SLACK_MS;
  return Math.max(TICK_MIN_MS, Math.min(TICK_MAX_MS, Math.ceil(ms)));
}

/**
 * One worker tick at wall time `nowMs`: advance by the real time since `lastMs`, stamp the rep timing
 * on state.active, and say when to tick next. Pure apart from the engine call, so tests drive it with a fake clock.
 */
export function runTick(E: any, state: any, nowMs: number, lastMs: number): { events: any[]; delayMs: number } {
  const dt = Math.max(0, (nowMs - lastMs) / 1000);
  let events: any[] = [];
  if (dt > 0) events = E.tick(state, dt, { visible: true }) as any[];
  const r = E.stampRep(state, nowMs);
  return { events, delayMs: nextTickDelay(r ? r.secLeft : null) };
}
