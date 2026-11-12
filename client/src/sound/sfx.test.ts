import { describe, it, expect } from 'vitest';
import { canPlay, createSfx, type AudioLike } from './sfx';
import { parseSettings, DEFAULT_SETTINGS } from '../settings-core';

function fakeCtx() {
  const log = { oscillators: 0, resumes: 0, suspends: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const ctx: AudioLike = {
    currentTime: 0, state: 'suspended', destination: {},
    resume() { log.resumes++; ctx.state = 'running'; }, suspend() { log.suspends++; ctx.state = 'suspended'; },
    createOscillator() { log.oscillators++; return { type: '', frequency: param(), connect() {}, start() {}, stop() {} }; },
    createGain() { return { gain: param(), connect() {} }; },
  };
  return { ctx, log };
}
function setup(over: { muted?: boolean; hidden?: boolean } = {}) {
  const f = fakeCtx(); const s = { muted: over.muted ?? false, hidden: over.hidden ?? false, t: 0 };
  const sfx = createSfx({ makeContext: () => f.ctx, isMuted: () => s.muted, isHidden: () => s.hidden, now: () => s.t });
  return { f, s, sfx };
}

describe('canPlay', () => {
  it('needs a gesture, no mute and a visible page', () => {
    expect(canPlay({ unlocked: true, muted: false, hidden: false })).toBe(true);
    expect(canPlay({ unlocked: false, muted: false, hidden: false })).toBe(false);
    expect(canPlay({ unlocked: true, muted: true, hidden: false })).toBe(false);
    expect(canPlay({ unlocked: true, muted: false, hidden: true })).toBe(false);
  });
});

describe('sfx gating', () => {
  it('is silent before the first gesture', () => {
    const { f, sfx } = setup();
    expect(sfx.play('collect')).toBe(false);
    expect(f.log.oscillators).toBe(0);
  });
  it('plays after unlock', () => {
    const { f, sfx } = setup();
    sfx.unlock();
    expect(sfx.play('levelUp')).toBe(true);
    expect(f.log.oscillators).toBe(4);
  });
  it('plays nothing while muted, and again when unmuted', () => {
    const { f, s, sfx } = setup({ muted: true });
    sfx.unlock();
    for (const n of ['tap', 'collect', 'levelUp', 'fountain'] as const) expect(sfx.play(n)).toBe(false);
    expect(f.log.oscillators).toBe(0);
    s.muted = false;
    expect(sfx.play('collect')).toBe(true);
  });
  it('plays nothing while the page is hidden and suspends the context', () => {
    const { f, s, sfx } = setup();
    sfx.unlock(); sfx.play('collect');
    s.hidden = true; sfx.visibilityChanged();
    expect(f.log.suspends).toBe(1);
    const before = f.log.oscillators;
    expect(sfx.play('fountain')).toBe(false);
    expect(f.log.oscillators).toBe(before);
    s.hidden = false; sfx.visibilityChanged();
    expect(sfx.play('tap')).toBe(true);
  });
  it('rate-limits taps', () => {
    const { s, sfx } = setup();
    sfx.unlock();
    expect(sfx.play('tap')).toBe(true);
    s.t = 10; expect(sfx.play('tap')).toBe(false);
    s.t = 100; expect(sfx.play('tap')).toBe(true);
  });
  it('stays silent when no audio context exists', () => {
    const sfx = createSfx({ makeContext: () => null, isMuted: () => false, isHidden: () => false });
    sfx.unlock();
    expect(sfx.play('collect')).toBe(false);
  });
});

describe('parseSettings', () => {
  it('defaults when empty or broken', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{nope')).toEqual(DEFAULT_SETTINGS);
  });
  it('reads the theme and ignores bad values', () => {
    expect(parseSettings('{"theme":"light"}').theme).toBe('light');
    expect(parseSettings('{"theme":"pink"}').theme).toBe('dark');
  });
  it('reads the muted flag and ignores wrong types', () => {
    expect(parseSettings('{"muted":true}').muted).toBe(true);
    expect(parseSettings('{"muted":"yes","reduceMotion":1}')).toEqual(DEFAULT_SETTINGS);
  });
});
