// Generated sound effects: Web Audio synthesis only, no audio files.
// Nothing plays until the first user gesture, while muted, or while the page is hidden.
export type SfxName = 'tap' | 'collect' | 'levelUp' | 'fountain' | 'coin' | 'start';

/** Pure gate: sound may play only after a gesture, when not muted, and when the page is visible. */
export const canPlay = (g: { unlocked: boolean; muted: boolean; hidden: boolean }): boolean => g.unlocked && !g.muted && !g.hidden;

type Param = { value: number; setValueAtTime(v: number, t: number): unknown; linearRampToValueAtTime(v: number, t: number): unknown; exponentialRampToValueAtTime(v: number, t: number): unknown };
export interface AudioLike {
  currentTime: number;
  state: string;
  destination: unknown;
  resume(): Promise<void> | void;
  suspend(): Promise<void> | void;
  createOscillator(): { type: string; frequency: Param; connect(n: unknown): unknown; start(t: number): void; stop(t: number): void };
  createGain(): { gain: Param; connect(n: unknown): unknown };
}
export interface SfxDeps { makeContext: () => AudioLike | null; isMuted: () => boolean; isHidden: () => boolean; now?: () => number }

const MASTER = 0.5;     // overall ceiling; every voice below is also gentle
/** Minimum gap per sound so a burst of events (a 50-item fountain) is one sound, not fifty. */
const MIN_GAP_MS: Record<SfxName, number> = { tap: 45, collect: 260, levelUp: 0, fountain: 600, coin: 220, start: 120 };

export function createSfx(deps: SfxDeps) {
  let unlocked = false;
  let ctx: AudioLike | null = null;
  const last: Partial<Record<SfxName, number>> = {};
  const now = deps.now ?? (() => Date.now());

  const open = () => canPlay({ unlocked, muted: deps.isMuted(), hidden: deps.isHidden() });

  function voice(c: AudioLike, type: string, f0: number, f1: number, t0: number, dur: number, peak: number) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.linearRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak * MASTER, t0 + Math.min(0.01, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  const recipes: Record<SfxName, (c: AudioLike, t: number) => void> = {
    tap: (c, t) => voice(c, 'triangle', 520, 440, t, 0.05, 0.05),
    collect: (c, t) => { voice(c, 'sine', 660, 660, t, 0.12, 0.16); voice(c, 'sine', 880, 880, t + 0.09, 0.2, 0.16); },
    coin: (c, t) => [1568, 2093, 2637, 3136].forEach((f, i) => voice(c, 'triangle', f, f * 1.01, t + i * 0.05, 0.14, 0.09)),
    start: (c, t) => { voice(c, 'triangle', 440, 440, t, 0.08, 0.1); voice(c, 'triangle', 660, 660, t + 0.07, 0.12, 0.1); },
    levelUp: (c, t) => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => voice(c, 'triangle', f, f, t + i * 0.09, i === 3 ? 0.4 : 0.14, 0.18)),
    fountain: (c, t) => {
      voice(c, 'sine', 330, 990, t, 0.5, 0.08);
      for (let i = 0; i < 8; i++) { const f = 1200 + ((i * 337) % 1200); voice(c, 'sine', f, f * 1.02, t + 0.06 * i, 0.12, 0.07); }
    },
  };

  return {
    /** Call from a real user gesture handler (pointerdown / keydown). Creates and resumes the context. */
    unlock() {
      if (!unlocked) { ctx = deps.makeContext(); unlocked = ctx !== null; }
      if (ctx && ctx.state === 'suspended' && !deps.isHidden()) void ctx.resume();
    },
    play(name: SfxName): boolean {
      if (!open() || !ctx) return false;
      const t = now(); const gap = MIN_GAP_MS[name];
      if (gap > 0) { if (t - (last[name] ?? -1e9) < gap) return false; last[name] = t; }
      if (ctx.state === 'suspended') void ctx.resume();
      recipes[name](ctx, ctx.currentTime);
      return true;
    },
    /** Call when the page hides or shows so nothing keeps sounding in the background. */
    visibilityChanged() {
      if (!ctx) return;
      if (deps.isHidden()) void ctx.suspend(); else if (!deps.isMuted()) void ctx.resume();
    },
    get unlocked() { return unlocked; },
  };
}
