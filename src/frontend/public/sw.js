// Hand-written, no build step: caches the app shell opportunistically
// (whatever the browser actually requests) and keeps the last successful
// GET /api/state, so opening from the home screen is instant and works
// offline with the last-known state (technical brief section 8).
const CACHE_NAME = 'wlp-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      return response;
    })
    .catch(() => cached);
  return cached ?? network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // /api/state: fresh when online, last-known-good when not.
  if (url.pathname === '/api/state') {
    event.respondWith(networkFirst(request));
    return;
  }

  // Every other /api/* call (sync, writes) goes straight to the network;
  // caching a write response would be actively wrong.
  if (url.pathname.startsWith('/api/')) return;

  // App shell: instant from cache, refreshed in the background.
  event.respondWith(staleWhileRevalidate(request));
});
