// Claimr Web PWA Service Worker (App Shell Cache, Stale-While-Revalidate Feed, Offline Fallback)
const SHELL_CACHE_NAME = 'claimr-shell-v19';
const FEED_CACHE_NAME = 'claimr-feed-v3';

const APP_SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
  '/claimr-wordmark.png',
  '/Icon_Latest.png',
  '/icon-192.png',
  '/icon-192-maskable.png',
  '/icon-512.png',
  '/icon-512-maskable.png',
];

// 1. Install Event: Pre-cache App Shell & immediately take over
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL_ASSETS).catch((err) => {
        console.warn('[SW] App shell pre-caching partial failure:', err);
      });
    })
  );
  self.skipWaiting();
});

// 2. Activate Event: Clean up outdated caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== SHELL_CACHE_NAME && key !== FEED_CACHE_NAME) {
            console.log('[SW] Deleting stale cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// 3. User-triggered update message handler
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 4. Fetch Handler: Strategy routing
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Only handle http: and https: requests (bypass chrome-extension:, about:, etc.)
  if (!req.url.startsWith('http://') && !req.url.startsWith('https://')) return;

  const url = new URL(req.url);

  // Bypass dev tools, hot updates, and WebSocket debuggers
  if (url.pathname.includes('hot-update') || url.pathname.includes('_expo/ws') || url.protocol === 'ws:' || url.protocol === 'wss:') {
    return;
  }

  // A. API & Proxy Requests: Stale-While-Revalidate with timestamped offline fallback
  if (url.pathname.startsWith('/api/proxy') || url.hostname.includes('reddit.com') || url.hostname.includes('gamerpower.com')) {
    event.respondWith(
      caches.open(FEED_CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(req);

        const fetchPromise = fetch(req)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              // Clone and store with a fetched-at timestamp header
              const headers = new Headers(networkResponse.headers);
              headers.set('x-claimr-cached-at', new Date().toISOString());
              const toCache = networkResponse.clone();
              cache.put(req, toCache).catch(() => {});
            }
            return networkResponse;
          })
          .catch(() => {
            if (cachedResponse) {
              return cachedResponse;
            }
            return new Response(JSON.stringify({ error: 'Network unavailable', offline: true }), {
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'application/json' },
            });
          });

        // Return cached immediately if available, otherwise wait for network
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // B. Navigation Requests (SPA): Network-First, fallback to cached index.html
  if (req.mode === 'navigate' || req.destination === 'document' || (url.origin === self.location.origin && url.pathname === '/')) {
    event.respondWith(
      fetch(req)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(SHELL_CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedDoc = await caches.match(req);
          if (cachedDoc) return cachedDoc;
          const fallback = (await caches.match('/index.html')) || (await caches.match('/'));
          if (fallback) return fallback;
          return new Response('<!DOCTYPE html><html><body>Claimr is currently offline.</body></html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          });
        })
    );
    return;
  }

  // C. App Shell & Static Assets: Cache-First, fallback to network
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;

        return fetch(req)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              const copy = networkResponse.clone();
              caches.open(SHELL_CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
            }
            return networkResponse;
          })
          .catch(() => {
            return new Response('', { status: 404, statusText: 'Not Found' });
          });
      })
    );
    return;
  }

  // D. External assets (fonts, images): Stale-While-Revalidate with guaranteed Response fallback
  event.respondWith(
    caches.match(req).then(async (cached) => {
      try {
        const netRes = await fetch(req);
        if (netRes && netRes.status === 200) {
          const copy = netRes.clone();
          caches.open(SHELL_CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return netRes;
      } catch {
        if (cached) return cached;
        // Never resolve undefined to event.respondWith
        return new Response('', { status: 404, statusText: 'Resource Not Available' });
      }
    })
  );
});

// Helper to strip any emojis from notification title & body
function stripEmojis(str) {
  if (!str) return '';
  return str
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F191}-\u{1F251}\u{1F004}\u{1F0CF}\u{1F170}-\u{1F171}\u{1F17E}-\u{1F17F}\u{1F18E}\u{3030}\u{2B50}\u{2B55}\u{2934}-\u{2935}\u{2B05}-\u{2B07}\u{2B1B}-\u{2B1C}\u{3297}\u{3299}\u{FE0F}]/gu, '')
    .replace(/^[🆓🎁🎮📢🔥⚡✨👀\s]+/u, '')
    .replace(/[🆓🎁🎮📢🔥⚡✨👀]+/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const STORE_DOMAINS = [
  'store.steampowered.com',
  'steampowered.com',
  'epicgames.com',
  'store.epicgames.com',
  'gog.com',
  'itch.io',
  'ubisoft.com',
  'store.ubisoft.com',
  'ea.com',
  'store.playstation.com',
  'playstation.com',
  'xbox.com',
  'microsoft.com',
  'battle.net',
  'stove.co.kr',
  'page.onstove.com',
  'indiegala.com',
  'fanatical.com',
  'humblebundle.com',
  'primegaming.com',
  'gaming.amazon.com',
];

const THIRD_PARTY_TASK_HOSTS = [
  { match: 'gleam.io', name: 'Gleam' },
  { match: 'gleam', name: 'Gleam' },
  { match: 'givee.club', name: 'Givee.Club' },
  { match: 'givee', name: 'Givee.Club' },
  { match: 'alienwarearena.com', name: 'Alienware Arena' },
  { match: 'alienware', name: 'Alienware Arena' },
  { match: 'gaming.lenovo.com', name: 'Lenovo Legion' },
  { match: 'steelseries', name: 'SteelSeries' },
  { match: 'keylol', name: 'Keylol' },
  { match: 'grabfreegame', name: 'GrabFreeGames' },
  { match: 'opiumpulses', name: 'Opium Pulses' },
  { match: 'gamehag', name: 'Gamehag' },
  { match: 'giveaway.su', name: 'Giveaway.su' },
  { match: 'giveawaysu', name: 'Giveaway.su' },
  { match: 'simplo.gg', name: 'Simplo' },
];

function isStoreHostUrl(giveawayUrl) {
  if (!giveawayUrl) return false;
  let hostname = '';
  try {
    const parsed = new URL(giveawayUrl);
    hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    const match = giveawayUrl.match(/https?:\/\/(?:www\.)?([^\/\s]+)/i);
    hostname = match ? match[1].toLowerCase() : '';
  }
  if (!hostname) return false;
  return STORE_DOMAINS.some((domain) => hostname === domain || hostname.endsWith('.' + domain));
}

function resolveGiveawayHost(url, platform, rawTitle) {
  const urlLower = (url || '').toLowerCase();
  for (const item of THIRD_PARTY_TASK_HOSTS) {
    if (urlLower.includes(item.match)) return item.name;
  }
  if (urlLower.includes('steampowered.com') || urlLower.includes('steamcommunity.com')) return 'Steam';
  if (urlLower.includes('epicgames.com')) return 'Epic Games';
  if (urlLower.includes('gog.com')) return 'GOG';
  if (urlLower.includes('itch.io')) return 'itch.io';
  if (urlLower.includes('ubisoft.com')) return 'Ubisoft';
  if (urlLower.includes('xbox.com')) return 'Xbox';
  if (urlLower.includes('playstation.com')) return 'PlayStation';
  if (urlLower.includes('ea.com')) return 'EA';
  if (urlLower.includes('stove') || urlLower.includes('onstove')) return 'Stove';
  if (urlLower.includes('amazon') || urlLower.includes('primegaming')) return 'Prime Gaming';

  const titleLower = (rawTitle || '').toLowerCase();
  for (const item of THIRD_PARTY_TASK_HOSTS) {
    if (titleLower.includes(item.match)) return item.name;
  }

  if (platform && platform.toLowerCase() !== 'pc' && platform.toLowerCase() !== 'unknown') {
    return platform;
  }
  return 'Steam';
}

function resolveIsTask(url, rawTitle, explicitTask) {
  if (typeof explicitTask === 'boolean') return explicitTask;
  const str = `${url || ''} ${rawTitle || ''}`.toLowerCase();
  for (const item of THIRD_PARTY_TASK_HOSTS) {
    if (str.includes(item.match)) return true;
  }
  if (str.includes('task') || str.includes('actions required') || str.includes('entries required') || str.includes('gleam') || str.includes('givee')) {
    return true;
  }
  if (url && !isStoreHostUrl(url)) {
    return true;
  }
  return false;
}

function cleanGameTitleText(raw) {
  if (!raw) return '';
  return raw
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/^\([^)]+\)\s*/, '')
    .replace(/\s*-\s*Gleam.*$/i, '')
    .replace(/\s*-\s*Givee.*$/i, '')
    .replace(/\s*-\s*Alienware.*$/i, '')
    .trim();
}

// Persist incoming push alerts to Cache API so PWA Alerts screen can sync them on launch
async function savePushAlertToCache(data) {
  try {
    const cache = await caches.open('claimr-alerts-cache');
    const existingRes = await cache.match('/__claimr_alerts.json');
    let alerts = [];
    if (existingRes) {
      try {
        alerts = await existingRes.json();
      } catch {}
    }
    const id = data.postId ? String(data.postId) : `notif_${Date.now()}`;
    if (!alerts.some((a) => a.id === id)) {
      alerts.unshift({
        id: id,
        title: data.gameTitle || data.displayTitle || 'New Freebie Alert',
        description: data.displayBody || 'Free giveaway available now.',
        timestamp: Date.now(),
        platform: data.actualHost || data.platform || 'Steam',
        isLive: true,
        actionUrl: data.url,
        coverImage: data.image || undefined,
      });
      alerts = alerts.slice(0, 50);
      await cache.put(
        '/__claimr_alerts.json',
        new Response(JSON.stringify(alerts), {
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }
  } catch (err) {
    console.warn('[SW] Error caching push alert:', err);
  }
}

// Notify any currently open Claimr tabs/windows about the new push
async function notifyOpenClients(data) {
  try {
    const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windowClients) {
      client.postMessage({
        type: 'CLAIMR_PUSH_RECEIVED',
        data: data,
      });
    }
  } catch (err) {
    console.warn('[SW] Error notifying open clients of push:', err);
  }
}

// 5. Push Notification Listener (Clean handler matching native Android app)
self.addEventListener('push', (event) => {
  let parsed = {};
  if (event.data) {
    try {
      parsed = event.data.json();
    } catch {
      parsed = { body: event.data.text() };
    }
  }

  const rawUrl = parsed.url || '';
  const rawReddit = parsed.redditTitle || '';
  const rawTitle = parsed.title || '';
  const rawBody = parsed.body || '';
  const platform = parsed.platform || 'Steam';
  const rawType = (parsed.type || '').toLowerCase();

  const gameTitle = stripEmojis(parsed.gameTitle || cleanGameTitleText(rawReddit) || cleanGameTitleText(rawTitle) || 'Free Game');
  const isDirect = isStoreHostUrl(rawUrl);
  const isTask = resolveIsTask(rawUrl, `${rawReddit} ${rawTitle} ${rawBody}`, parsed.isTask);
  const actualHost = resolveGiveawayHost(rawUrl, platform, rawReddit || rawTitle);

  const isDlc = rawType.includes('dlc') || rawReddit.toLowerCase().includes('dlc') || rawTitle.toLowerCase().includes('dlc');
  const isBeta = rawType.includes('beta') || rawReddit.toLowerCase().includes('beta') || rawTitle.toLowerCase().includes('beta');

  let displayTitle = '';
  // If the payload already includes a structured title like "Steam key on Gleam" or "Free on Steam", respect it
  if (rawTitle.includes(' on ') || rawTitle.startsWith('Free on ') || rawTitle.includes('key on')) {
    displayTitle = stripEmojis(rawTitle);
  } else if (!isDirect && isTask) {
    const keyPrefix = (platform && platform.toLowerCase() !== 'pc' && platform.toLowerCase() !== actualHost.toLowerCase())
      ? `${platform} `
      : '';
    if (isDlc) displayTitle = `${keyPrefix}DLC key on ${actualHost}`;
    else if (isBeta) displayTitle = `${keyPrefix}Beta on ${actualHost}`;
    else displayTitle = `${keyPrefix}key on ${actualHost}`;
  } else {
    const displayHost = isDirect ? actualHost : (actualHost || platform || 'Steam');
    if (isDlc) displayTitle = `Free DLC on ${displayHost}`;
    else if (isBeta) displayTitle = `Beta on ${displayHost}`;
    else displayTitle = `Free on ${displayHost}`;
  }

  // Display body: Clean game title + Tasks required tag (exact mirror of Android app)
  let displayBody = gameTitle;
  if (isTask) {
    if (!displayBody.toLowerCase().includes('task')) {
      displayBody += ' · Tasks required';
    }
  }

  const notifOptions = {
    body: displayBody,
    icon: parsed.image || '/Icon_Latest.png',
    badge: '/favicon.png',
    tag: parsed.postId ? `claimr-${parsed.postId}` : 'claimr-deal',
    renotify: false,
    data: {
      url: rawUrl,
      postId: parsed.postId,
      dealId: parsed.postId,
      gameTitle: gameTitle,
      platform: platform,
      isTask: isTask,
      actualHost: actualHost,
      image: parsed.image || '',
      displayTitle: displayTitle,
      displayBody: displayBody,
    },
  };
  if (parsed.image) {
    notifOptions.image = parsed.image;
  }

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(displayTitle, notifOptions),
      savePushAlertToCache(notifOptions.data),
      notifyOpenClients(notifOptions.data),
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notifData = event.notification.data || {};
  const postId = notifData.postId || notifData.dealId;

  const params = new URLSearchParams();
  if (postId) params.set('dealId', postId);
  if (notifData.gameTitle) params.set('title', notifData.gameTitle);
  if (notifData.url) params.set('url', notifData.url);
  if (notifData.platform) params.set('platform', notifData.platform);
  if (notifData.isTask !== undefined) params.set('isTask', notifData.isTask ? '1' : '0');
  if (notifData.image) params.set('image', notifData.image);

  const targetUrl = '/?' + params.toString();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({
            type: 'CLAIMR_NOTIFICATION_CLICK',
            data: notifData,
          });
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
