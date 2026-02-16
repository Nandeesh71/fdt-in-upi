// Service Worker for FDT PWA
// Provides offline support and credential caching

const CACHE_NAME = 'fdt-cache-v1';
const STATIC_CACHE = 'fdt-static-v1';
const urlsToCache = [
  '/',
  '/manifest.json'
];

// Install event - cache essential resources
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  // Immediately activate the new service worker
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          console.log('[Service Worker] Deleting cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    })
  );
  // Take control of all clients
  self.clients.claim();
});

// Fetch event - network first strategy for development
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip chrome extension requests
  if (event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  // Network first strategy - always try fresh from network first
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Return the fresh response
        return response;
      })
      .catch(() => {
        // On network failure, try cache
        return caches.match(event.request)
          .then((response) => {
            // Return cached response if available
            return response || new Response('Offline - page not cached', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({
                'Content-Type': 'text/plain'
              })
            });
          });
      })
  );
});

// Handle messages from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
