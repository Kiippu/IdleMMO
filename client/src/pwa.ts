// Service worker registration + "new version waiting" handshake.
// In dev mode (vite dev) we skip registration entirely — SW caching plus HMR
// is a well-known source of stale-module pain. Production builds (vite build
// → vite preview, Cloudflare Pages) register normally.
//
// Update flow:
// 1. A new SW is detected. It enters the "installed, waiting" state because
//    sw.js intentionally does NOT call self.skipWaiting() on install.
// 2. We invoke the onUpdate callback with a `restart` function.
// 3. The UI shows an inline banner (App.svelte). When the user clicks it, restart() posts
//    { type: 'skipWaiting' } to the waiting SW, waits for the browser to
//    switch controllers, then reloads the page.

export type OnUpdate = (restart: () => void) => void;

export function registerServiceWorker(onUpdate: OnUpdate): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV) return;

  navigator.serviceWorker
    .register('/sw.js')
    .then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) {
        onUpdate(() => restartWith(reg.waiting!));
      }
      reg.addEventListener('updatefound', () => {
        const next = reg.installing;
        if (!next) return;
        next.addEventListener('statechange', () => {
          if (next.state === 'installed' && navigator.serviceWorker.controller) {
            onUpdate(() => restartWith(next));
          }
        });
      });
    })
    .catch((err) => {
      console.warn('Service worker registration failed', err);
    });
}

function restartWith(sw: ServiceWorker): void {
  const onChange = () => {
    navigator.serviceWorker.removeEventListener('controllerchange', onChange);
    location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', onChange);
  sw.postMessage({ type: 'skipWaiting' });
}
