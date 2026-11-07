import { vi, describe, it, expect, beforeEach } from 'vitest';

// Hoisted mock: idb.ts is the only path to the actual IndexedDB; we stub it so
// these tests run in plain Node and the facade's debounce/coalescing logic is
// what we exercise.
const idb = vi.hoisted(() => ({
  idbGet: vi.fn<(key: string) => Promise<string | null>>(),
  idbSet: vi.fn<(key: string, value: string) => Promise<void>>(),
  idbDelete: vi.fn<(key: string) => Promise<void>>(),
}));
vi.mock('./idb', () => idb);

const { createIdbStorage } = await import('./idbStorage');

describe('idbStorage facade', () => {
  beforeEach(() => {
    idb.idbGet.mockReset();
    idb.idbSet.mockReset().mockResolvedValue(undefined);
    idb.idbDelete.mockReset().mockResolvedValue(undefined);
  });

  it('getItem returns cached values synchronously; missing keys return null', () => {
    const { storage } = createIdbStorage();
    storage.setItem('k', 'v');
    expect(storage.getItem('k')).toBe('v');
    expect(storage.getItem('missing')).toBeNull();
  });

  it('coalesces a burst of setItem calls into one IDB write', async () => {
    vi.useFakeTimers();
    try {
      const { storage, flush } = createIdbStorage();
      for (let i = 0; i < 10; i++) storage.setItem('k', String(i));
      await vi.runAllTimersAsync();
      await flush();
      expect(idb.idbSet).toHaveBeenCalledTimes(1);
      expect(idb.idbSet).toHaveBeenCalledWith('k', '9');
    } finally {
      vi.useRealTimers();
    }
  });

  it('flush() forces the pending write immediately without waiting for the debounce', async () => {
    const { storage, flush } = createIdbStorage();
    storage.setItem('k', 'v');
    await flush();
    expect(idb.idbSet).toHaveBeenCalledWith('k', 'v');
  });

  it('removeItem clears the cache and queues an IDB delete', async () => {
    const { storage, flush } = createIdbStorage();
    storage.setItem('k', 'v');
    await flush();
    idb.idbSet.mockClear();
    storage.removeItem('k');
    expect(storage.getItem('k')).toBeNull();
    await flush();
    expect(idb.idbDelete).toHaveBeenCalledWith('k');
    expect(idb.idbSet).not.toHaveBeenCalled();
  });

  it('hydrate() populates the cache from IDB', async () => {
    idb.idbGet.mockResolvedValueOnce('existing-save-blob');
    const { storage, hydrate } = createIdbStorage();
    await hydrate(['guildwright-proto-v1']);
    expect(storage.getItem('guildwright-proto-v1')).toBe('existing-save-blob');
  });

  it('writes landing during an in-flight flush are not lost', async () => {
    let resolveFirst: () => void = () => {};
    idb.idbSet.mockImplementationOnce(() => new Promise<void>((r) => { resolveFirst = r; }));
    const { storage, flush } = createIdbStorage();
    storage.setItem('k', 'first');
    const p = flush();
    storage.setItem('k', 'second');
    resolveFirst();
    await p;
    await flush();
    expect(idb.idbSet).toHaveBeenNthCalledWith(1, 'k', 'first');
    expect(idb.idbSet).toHaveBeenNthCalledWith(2, 'k', 'second');
  });
});
