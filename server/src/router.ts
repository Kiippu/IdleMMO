export const VERSION = '0.0.0';

/** Pure router for /api/* so it can be unit tested without the Workers runtime. */
export function route(request: Request): Response | null {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/api/health') {
    return Response.json({ ok: true, version: VERSION });
  }
  if (url.pathname.startsWith('/api/')) {
    return Response.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  return null;
}
