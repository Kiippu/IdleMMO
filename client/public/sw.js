// Guildwright service worker. Plain JS (no build step) so client/public/
// serves it directly at /sw.js. Scope is the whole origin.
//
// Caching strategy:
// - Navigations (HTML): network-first with cache fallback. Players always get
//   the newest shell when online; offline falls back to the last-good copy.
// - Hashed assets (JS/CSS/images under /assets/): cache-first, since the hash
//   rolls on every build and stale is impossible.
// - /api/*: network-only. Never cached.
// - Cross-origin requests: pass through.
//
// Bump CACHE_VERSION to invalidate the runtime cache across all clients.
// _headers (see client/public/_headers) sets no-cache on this file so a new
// deploy reaches browsers promptly.

const CACHE_VERSION = 'v1';
const RUNTIME_CACHE = `gw-runtime-${CACHE_VERSION}`;
const SHELL_KEY = '/';

self.addEventListener('install', () => {
  // Deliberately NOT calling skipWaiting(): the app shows an in-page
  // "Restart" toast when a new SW is waiting; the user decides when to
  // activate it.
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith('gw-') && k !== RUNTIME_CACHE).map((k) => caches.delete(k)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) return; // network-only

  if (req.mode === 'navigate') {
    event.respondWith(networkFirstShell(req));
    return;
  }

  event.respondWith(cacheFirstAsset(req));
});

async function networkFirstShell(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const resp = await fetch(req);
    if (resp.ok) cache.put(SHELL_KEY, resp.clone());
    return resp;
  } catch {
    const hit = await cache.match(SHELL_KEY);
    if (hit) return hit;
    throw new Error('offline and no cached shell');
  }
}

async function cacheFirstAsset(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const resp = await fetch(req);
  if (resp.ok) cache.put(req, resp.clone());
  return resp;
}
