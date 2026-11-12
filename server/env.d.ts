export interface Env {
  DB: D1Database;
  GUILD: DurableObjectNamespace;
  ASSETS: Fetcher;
  /** "1" logs request headers on every /api call (set in server/.dev.vars; see .dev.vars.example). */
  LOG_HEADERS?: string;
}
