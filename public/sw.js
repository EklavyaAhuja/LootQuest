// LootQuest Web PWA Service Worker (Web Push & Offline Caching)
const CACHE_NAME = 'lootquest-pwa-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/manifest.json',
  '/favicon.png',
  '/Icon_Latest.png'
];

// 1. Install & Activate Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {
        console.warn('[SW] Caching initial assets skipped');
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker activated.');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// 2. Fetch Handler (Only handle same-origin static assets)
self.addEventListener('fetch', (event) => {
  // Only handle GET requests for same-origin static assets
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Bypass dev tools, hot-reload, and socket connections
  if (event.request.url.includes('_expo') || event.request.url.includes('hot-update') || event.request.url.includes('ws')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      });
    }).catch(() => {
      return fetch(event.request);
    })
  );
});

// 3. Web Push Notification Listener
self.addEventListener('push', (event) => {
  console.log('[SW] Web Push notification received!');

  let notificationData = {
    title: '🎁 New Free Game Alert!',
    body: 'A new free game deal was just spotted on LootQuest!',
    url: '/',
    icon: '/Icon_Latest.png',
    badge: '/favicon.png',
    image: undefined
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      const data = payload.data || payload.notification || payload;

      notificationData.title = data.title || payload.title || notificationData.title;
      notificationData.body = data.body || payload.body || data.cleanTitle || notificationData.body;
      notificationData.url = data.url || data.actionUrl || notificationData.url;
      if (data.image || data.coverImage) {
        notificationData.image = data.image || data.coverImage;
      }
    } catch (err) {
      console.warn('[SW] Could not parse push JSON, using raw text:', event.data.text());
      notificationData.body = event.data.text();
    }
  }

  const options = {
    body: notificationData.body,
    icon: notificationData.icon,
    badge: notificationData.badge,
    image: notificationData.image,
    vibrate: [200, 100, 200],
    data: {
      url: notificationData.url,
      dateOfArrival: Date.now()
    },
    actions: [
      { action: 'claim', title: '🎮 Claim Deal' },
      { action: 'close', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(notificationData.title, options)
  );
});

// 4. Notification Click Listener
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked action:', event.action);
  event.notification.close();

  if (event.action === 'close') return;

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          if (targetUrl && targetUrl !== '/') {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
