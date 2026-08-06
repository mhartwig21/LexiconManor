/// <reference types="vite/client" />
/**
 * app/pwa.ts — OWNER: A8 (Platform).
 *
 * Service-worker registration + the "new edition" update flow
 * (ARCHITECTURE §9, AAA 7.6):
 *  - Registered only in production builds (never in dev — stale-cache hell).
 *  - Registered at `import.meta.env.BASE_URL + 'sw.js'` so the scope carries
 *    the Pages subpath (AAA 7.5).
 *  - `updatefound` → warm toast; on accept, SKIP_WAITING → controllerchange
 *    → reload. The prompt is DEFERRED while a puzzle is active and the reload
 *    only ever happens from the user's tap — never auto mid-puzzle.
 *  - All persistence happens from the page, never the SW (no Background Sync
 *    on iOS).
 */

import { useManorStore } from './store';
import { showPlatformToast } from './platform/toast';

let refreshing = false;

function midPuzzle(): boolean {
  return useManorStore.getState().day?.activeRoom != null;
}

function promptUpdate(reg: ServiceWorkerRegistration): void {
  const offer = () =>
    showPlatformToast({
      message: 'A new edition of the Manor has arrived.',
      actionLabel: 'Refresh',
      timeoutMs: 0,
      onAction: () => reg.waiting?.postMessage({ type: 'SKIP_WAITING' }),
    });

  if (!midPuzzle()) {
    offer();
    return;
  }
  // Wait for the room to be left; the prompt appears back on the blueprint.
  const unsub = useManorStore.subscribe((s) => {
    if (s.day?.activeRoom == null) {
      unsub();
      offer();
    }
  });
}

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((reg) => {
        // A waiting worker from a previous session — offer immediately.
        if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg);

        reg.addEventListener('updatefound', () => {
          const fresh = reg.installing;
          if (!fresh) return;
          fresh.addEventListener('statechange', () => {
            if (fresh.state === 'installed' && navigator.serviceWorker.controller) {
              promptUpdate(reg);
            }
          });
        });
      })
      .catch(() => {
        /* SW is a progressive enhancement — never load-bearing */
      });

    // Reload exactly once after the accepted worker takes control.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });
  });
}
