const CACHE_NAME = 'personal-finance-v2';

const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Install Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        await cache.addAll(urlsToCache);
      } catch (err) {
        // Ignore cache failures during installation
        console.warn('Some assets could not be cached.', err);
      }
    })
  );

  self.skipWaiting();
});

// Activate Service Worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      )
    )
  );

  self.clients.claim();
});

// Fetch - Network First
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // Never cache API requests
  if (
    url.hostname.includes('api.anthropic.com') ||
    url.hostname.includes('supabase.co') ||
    url.pathname.startsWith('/.netlify/functions/')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache only successful basic responses
        if (
          response &&
          response.status === 200 &&
          response.type === 'basic'
        ) {
          const responseToCache = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }

        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request, {
          ignoreSearch: true,
        });

        return cached || Response.error();
      })
  );
});

// Notification Click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    self.clients
      .matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      .then((clients) => {
        const existing = clients.find((client) =>
          client.url.startsWith(self.location.origin)
        );

        if (existing) {
          return existing.focus();
        }

        return self.clients.openWindow('/#development');
      })
  );
});