/**
 * SolShot Service Worker
 *
 * Minimal service worker for PWA installability.
 * Caches the app shell (HTML, CSS, JS) for fast loads.
 * Network-first for API/socket calls (game requires live server).
 *
 * Note: This is NOT full offline mode — the game requires
 * a live server connection for multiplayer gameplay.
 */

const CACHE_NAME = 'solshot-v1';
const APP_SHELL = [
  '/',
  '/index.html',
];

// Install: cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL);
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  // Claim all clients immediately
  self.clients.claim();
});

// Fetch: network-first for everything (game needs live server)
// Falls back to cache only for app shell resources
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests and socket.io
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('socket.io')) return;
  if (event.request.url.includes('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses for app shell
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // Offline fallback: try cache
        return caches.match(event.request);
      })
  );
});
