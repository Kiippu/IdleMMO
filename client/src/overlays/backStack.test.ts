import { describe, it, expect, beforeEach } from 'vitest';
import { pushBack, handleBack, decideBack, backDepth, clearBackStack } from './backStack.svelte';

describe('back stack', () => {
  beforeEach(clearBackStack);
  it('decides: overlay open closes it; otherwise other tab goes to Workshop; Workshop does nothing', () => {
    expect(decideBack(2, 'War Room')).toBe('close');
    expect(decideBack(0, 'War Room')).toBe('workshop');
    expect(decideBack(0, 'Workshop')).toBe('none');
  });
  it('closes the top overlay one per press, in order', () => {
    const log: string[] = [];
    const offItem = pushBack(() => { log.push('item'); offItem(); });
    const offConfirm = pushBack(() => { log.push('confirm'); offConfirm(); });
    let tab = 'Shop'; const go = () => { tab = 'Workshop'; };
    expect(handleBack(tab, go)).toBe('close'); expect(log).toEqual(['confirm']); expect(backDepth()).toBe(1);
    expect(handleBack(tab, go)).toBe('close'); expect(log).toEqual(['confirm', 'item']);
    expect(handleBack(tab, go)).toBe('workshop'); expect(tab).toBe('Workshop');
    expect(handleBack(tab, go)).toBe('none');
  });
  it('an overlay that only steps up a level stays on the stack', () => {
    let level = 1; pushBack(() => { level--; });
    handleBack('Workshop', () => {}); expect(level).toBe(0); expect(backDepth()).toBe(1);
  });
  it('unregister removes only its own entry and is idempotent', () => {
    const a = pushBack(() => {}); pushBack(() => {});
    a(); a(); expect(backDepth()).toBe(1);
  });
});
