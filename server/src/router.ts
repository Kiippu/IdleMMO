import type { Env } from '../env';

export const VERSION = '0.0.0';

/** The router only needs the database and the optional header-logging switch, so tests can pass a stub. */
export type RouterEnv = Pick<Env, 'DB' | 'LOG_HEADERS'>;

/** Headers we log (LOG_HEADERS=1) to learn what cloudflared forwards before the M1 Origin check is written. */
const LOGGED_HEADERS = ['host', 'origin', 'x-forwarded-host', 'x-forwarded-proto', 'cf-connecting-ip'] as const;

/** Count user tables, or null if D1 can't be reached. */
async function dbTables(db: D1Database): Promise<number | null> {
  try {
    const row = await db
      .prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND substr(name, 1, 7) != 'sqlite_' AND substr(name, 1, 4) != '_cf_'")
      .first<{ n: number }>();
    return row ? Number(row.n) : null;
  } catch {
    return null;
  }
}

/** Router for /api/*. Returns null for anything else so static assets are served. */
export async function route(request: Request, env: RouterEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return null;

  if (env.LOG_HEADERS === '1') {
    const seen = Object.fromEntries(LOGGED_HEADERS.map((h) => [h, request.headers.get(h)]));
    console.log('[headers]', request.method, url.pathname, JSON.stringify(seen));
  }

  if (request.method === 'GET' && url.pathname === '/api/health') {
    const tables = await dbTables(env.DB);
    return Response.json({ ok: true, version: VERSION, db: tables != null, tables: tables ?? 0 });
  }
  return Response.json({ ok: false, error: 'not_found' }, { status: 404 });
}
