/**
 * sw.js — CampNav Christ College PWA Service Worker
 * Enables offline usage, instant panorama loading, and native installability.
 */

const CACHE_NAME_STATIC = 'campnav-static-v2';
const CACHE_NAME_PANORAMAS = 'campnav-panoramas-v2';
const CACHE_NAME_ASSETS = 'campnav-assets-v2';

const STATIC_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/campusnav.svg',
];

// Install: Precache App Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME_STATIC).then((cache) => {
      return cache.addAll(STATIC_URLS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up older cache versions
self.addEventListener('activate', (event) => {
  const currentCaches = [CACHE_NAME_STATIC, CACHE_NAME_PANORAMAS, CACHE_NAME_ASSETS];
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (!currentCaches.includes(key)) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Strategy depending on request type
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests and browser extensions
  if (event.request.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // 1. Panorama Images: Cache-First strategy
  // Panoramas are large static assets that never change once captured
  if (
    url.pathname.includes('/panoramas/') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.jpeg') ||
    url.pathname.endsWith('.webp')
  ) {
    event.respondWith(
      caches.open(CACHE_NAME_PANORAMAS).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => {
            // Fallback: return empty or cached default if offline
            return cachedResponse || new Response(null, { status: 404 });
          });
        });
      })
    );
    return;
  }

  // 2. Static Bundles (JS, CSS, SVGs, Fonts): Stale-While-Revalidate
  if (
    url.pathname.includes('/assets/') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      caches.open(CACHE_NAME_ASSETS).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          const fetchPromise = fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => cachedResponse);

          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // 3. Navigation / HTML Requests: Network-First with Cache Fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const resClone = networkResponse.clone();
          caches.open(CACHE_NAME_STATIC).then((cache) => cache.put(event.request, resClone));
        }
        return networkResponse;
      }).catch(() => {
        return caches.match('/index.html') || caches.match('/');
      })
    );
    return;
  }

  // 4. Default: Network with Cache fallback
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        return networkResponse;
      }).catch(() => {
        return cachedResponse;
      });
    })
  );
});

// Listen for skipWaiting messages
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
