/* Lexicon Manor service worker — hand-rolled (ARCHITECTURE §9). OWNER: A8.
 *
 * Strategy:
 *  - Precache the full app shell + ALL generated content JSON at install
 *    (offline day-one play, AAA 7.4). The PRECACHE list below is injected by
 *    scripts/build-sw-precache.ts after `vite build` — the file as committed
 *    is a dev-only shell that caches nothing.
 *  - Cache-first for precached/hashed assets; network-first for navigations
 *    (index.html) so deploys are picked up, falling back to the cached shell
 *    offline.
 *  - New deploy = new VERSION = new cache name; activate deletes old caches.
 *  - SKIP_WAITING message from the page drives the "new edition" prompt flow
 *    (app/pwa.ts). No Background Sync, no push — neither exists on iOS; all
 *    persistence happens from the page.
 */

/* __INJECT_VERSION__ */
const VERSION = 'dev';
/* __INJECT_PRECACHE__ */
const PRECACHE = [];

const CACHE_NAME = `lexicon-manor-${VERSION}`;
const INDEX_URL = PRECACHE.find((u) => u.endsWith('/index.html')) || 'index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => undefined), // a failed precache never bricks install
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('lexicon-manor-') && k !== CACHE_NAME)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first so a new deploy's index.html wins; cached
  // shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(INDEX_URL, copy)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match(INDEX_URL, { ignoreSearch: true }).then((hit) => hit || Response.error())),
    );
    return;
  }

  // Everything else same-origin: cache-first (hashed assets + content JSON),
  // topping the cache up from the network for anything the precache missed.
  event.respondWith(
    caches.match(req, { ignoreSearch: false }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => undefined);
          }
          return res;
        }),
    ),
  );
});
