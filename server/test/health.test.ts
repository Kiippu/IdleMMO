import { describe, expect, it } from 'vitest';
import { route, VERSION } from '../src/router';

describe('router', () => {
  it('GET /api/health returns ok', async () => {
    const res = route(new Request('http://x/api/health'))!;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: VERSION });
  });
  it('unknown /api route is 404', () => {
    expect(route(new Request('http://x/api/nope'))!.status).toBe(404);
  });
  it('non-api paths fall through to static assets', () => {
    expect(route(new Request('http://x/'))).toBeNull();
  });
});
