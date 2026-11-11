import { describe, it, expect } from 'vitest';
import { memoryStorage } from '@guildwright/engine';
import { importLegacyLocalStorage } from './v4Import';

describe('legacy v4 import', () => {
  it('copies the blob when nothing is stored yet', () => {
    const st = memoryStorage();
    expect(importLegacyLocalStorage(st, 'k', '{"v":4}')).toBe(true);
    expect(st.getItem('k')).toBe('{"v":4}');
  });
  it('never overwrites an existing save', () => {
    const st = memoryStorage();
    st.setItem('k', '{"v":6}');
    expect(importLegacyLocalStorage(st, 'k', '{"v":4}')).toBe(false);
    expect(st.getItem('k')).toBe('{"v":6}');
  });
  it('does nothing without a blob', () => {
    const st = memoryStorage();
    expect(importLegacyLocalStorage(st, 'k', null)).toBe(false);
    expect(st.getItem('k')).toBeNull();
  });
});
