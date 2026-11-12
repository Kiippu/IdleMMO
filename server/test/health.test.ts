import { describe, expect, it, vi } from 'vitest';
import { route, VERSION, type RouterEnv } from '../src/router';

/** Minimal D1 stub: prepare(sql).first() returns the given row, or throws. */
function fakeDb(result: { n: number } | Error): D1Database {
  const stmt = {
    first: async () => {
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return { prepare: () => stmt } as unknown as D1Database;
}
const env = (db: D1Database, LOG_HEADERS?: string): RouterEnv => ({ DB: db, LOG_HEADERS });

describe('router', () => {
  it('GET /api/health reports the database and its table count', async () => {
    const res = (await route(new Request('http://x/api/health'), env(fakeDb({ n: 5 }))))!;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: VERSION, db: true, tables: 5 });
  });
  it('GET /api/health still answers when the database fails', async () => {
    const res = (await route(new Request('http://x/api/health'), env(fakeDb(new Error('no db')))))!;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: VERSION, db: false, tables: 0 });
  });
  it('unknown /api route is 404', async () => {
    expect((await route(new Request('http://x/api/nope'), env(fakeDb({ n: 0 }))))!.status).toBe(404);
  });
  it('non-api paths fall through to static assets', async () => {
    expect(await route(new Request('http://x/'), env(fakeDb({ n: 0 })))).toBeNull();
  });
  it('logs forwarded headers only when LOG_HEADERS is 1', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const req = () => new Request('http://x/api/health', { headers: { origin: 'https://a.trycloudflare.com', 'cf-connecting-ip': '1.2.3.4' } });
    await route(req(), env(fakeDb({ n: 1 })));
    expect(log).not.toHaveBeenCalled();
    await route(req(), env(fakeDb({ n: 1 }), '1'));
    expect(log).toHaveBeenCalledTimes(1);
    const line = log.mock.calls[0].join(' ');
    expect(line).toContain('https://a.trycloudflare.com');
    expect(line).toContain('1.2.3.4');
    expect(line).toContain('x-forwarded-host');
    log.mockRestore();
  });
  it('never logs headers for static asset requests', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await route(new Request('http://x/index.html'), env(fakeDb({ n: 1 }), '1'));
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
