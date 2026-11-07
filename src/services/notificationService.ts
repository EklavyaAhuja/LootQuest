import { Notifications } from '../utils/expoGoCompat';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { fetchFreeGameFindings, RedditPost, parseRedditTitle } from './redditService';
import { getAppSettings, getSeenPosts, addSeenPosts } from './storageService';
import { getCachedDeal } from './DealCache';
import { Deal } from '../models/Deal';
import {
  normalizeTitle,
  getCanonicalPlatform,
  getCleanPlatform,
  isStoreHost,
  isThirdPartyTaskHost,
  determineClaimMethod,
} from '../utils/dealUtils';

let messaging: any = null;
try {
  if (Platform.OS !== 'web') {
    messaging = require('@react-native-firebase/messaging').default;
    if (__DEV__) {
      console.log('[NotificationService] Firebase Messaging initialized.');
    }
  }
} catch (e) {
  if (__DEV__) {
    console.warn('[NotificationService] Firebase Messaging is not available (Expo Go / non-native environment). FCM notifications disabled.');
  }
}

const FCM_TOKEN_CACHE_KEY = 'fgf_fcm_token_v1';

const BACKGROUND_FETCH_TASK = 'FGF_BACKGROUND_FETCH_TASK';

// Configure how notifications are handled when the app is open
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch {
  // Expo Go: expo-notifications native handler not available
}

/**
 * Configure dedicated notification channel on Android for custom sound & high importance
 */
export async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('fgf_loot_alerts', {
        name: 'Claimr Alerts',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#39ff14',
        enableVibrate: true,
        showBadge: true,
      });
    } catch {}
  }
}

// Ensure notification channel is initialized early on module load
setupNotificationChannel().catch(() => {});

/**
 * Check current notification permission status without prompting
 */
export async function getNotificationPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') return 'granted';
      if (Notification.permission === 'denied') return 'denied';
      return 'undetermined';
    }
    return 'denied';
  }

  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') return 'granted';
    if (status === 'denied') return 'denied';
    return 'undetermined';
  } catch {
    return 'undetermined';
  }
}

/**
 * Request permission for local notifications
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
      } catch (err) {
        console.warn('[NotificationService] Web notification permission error:', err);
        return false;
      }
    }
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  if (finalStatus === 'granted') {
    await setupNotificationChannel();
  }
  
  return finalStatus === 'granted';
}

export function stripEmojis(str: string): string {
  if (!str) return '';
  return str
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F191}-\u{1F251}\u{1F004}\u{1F0CF}\u{1F170}-\u{1F171}\u{1F17E}-\u{1F17F}\u{1F18E}\u{3030}\u{2B50}\u{2B55}\u{2934}-\u{2935}\u{2B05}-\u{2B07}\u{2B1B}-\u{2B1C}\u{3297}\u{3299}\u{FE0F}]/gu, '')
    .replace(/^[🆓🎁🎮📢🔥⚡✨👀\s]+/u, '')
    .replace(/[🆓🎁🎮📢🔥⚡✨👀]+/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Helper to format type tags nicely (e.g. free_game -> Free Game, dlc -> DLC)
 */
export function formatType(type: string): string {
  if (!type) return 'Game';
  return type
    .split(/[-_]+/)
    .map(word => {
      const w = word.toLowerCase();
      if (w === 'dlc') return 'DLC';
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Resolves the true platform/host and claim difficulty by verifying URLs and raw titles.
 */
export function resolveDealHostAndDifficulty(
  rawPlatform: string,
  url?: string,
  title?: string,
  selftext?: string,
  isTaskFlag?: boolean
): {
  keyPlatform: string;     // The platform the key activates on (Steam, Epic, GOG, etc.)
  actualHost: string;      // The actual place where user claims (Steam, Givee.Club, Alienware Arena, etc.)
  isDirectStore: boolean;  // True if hosted directly on official storefront
  isTask: boolean;         // True if tasks/entries required
  claimMethod: 'one_click' | 'tasks';
} {
  const plat = (rawPlatform || '').trim();
  const rawUrl = (url || '').trim();
  const rawTitle = (title || '').trim();
  const rawSelf = (selftext || '').trim();

  const actualHost = getCleanPlatform(plat, rawTitle, rawSelf, rawUrl);
  const directStore = isStoreHost(rawUrl);
  const taskHost = isThirdPartyTaskHost(`${plat} ${rawTitle} ${rawSelf} ${rawUrl}`);
  const method = determineClaimMethod(rawSelf, rawTitle, plat, rawUrl);
  const requiresTasks = Boolean(isTaskFlag) || taskHost || (!directStore && Boolean(rawUrl)) || method === 'tasks';

  let keyPlat = plat;
  if (!keyPlat || keyPlat.toLowerCase() === 'unknown' || keyPlat.toLowerCase() === 'pc') {
    if (directStore) {
      keyPlat = actualHost;
    }
  }

  return {
    keyPlatform: keyPlat,
    actualHost: actualHost || plat || 'PC',
    isDirectStore: directStore,
    isTask: requiresTasks,
    claimMethod: requiresTasks ? 'tasks' : 'one_click',
  };
}

/**
 * Returns a simple, calm, verified notification title without clickbait or shouty emojis.
 */
export function getCatchyNotificationTitle(
  platform: string,
  type: string,
  url?: string,
  title?: string,
  isTask?: boolean
): string {
  const rawType = (type || '').trim().toLowerCase();
  if (rawType.includes('announcement')) {
    return 'Claimr update';
  }

  const { keyPlatform, actualHost, isDirectStore, isTask: requiresTasks } = resolveDealHostAndDifficulty(
    platform,
    url,
    title,
    '',
    isTask
  );

  const isDlc = rawType.includes('dlc') || rawType.includes('expansion') || rawType.includes('addon');
  const isBeta = rawType.includes('beta') || rawType.includes('alpha') || rawType.includes('playtest');

  // If this is a third-party task host (e.g. Givee.Club, Gleam, Alienware Arena, etc.)
  if (!isDirectStore && requiresTasks) {
    const keyPrefix = keyPlatform && keyPlatform.toLowerCase() !== 'pc' && keyPlatform.toLowerCase() !== actualHost.toLowerCase()
      ? `${keyPlatform} `
      : '';
    if (isDlc) {
      return `${keyPrefix}DLC key on ${actualHost}`;
    }
    if (isBeta) {
      return `${keyPrefix}Beta on ${actualHost}`;
    }
    return `${keyPrefix}key on ${actualHost}`;
  }

  // Direct storefront or non-task giveaway
  const displayHost = isDirectStore ? actualHost : (actualHost || platform || 'PC');
  if (isDlc) {
    return `Free DLC on ${displayHost}`;
  }
  if (isBeta) {
    return `Beta on ${displayHost}`;
  }
  return `Free on ${displayHost}`;
}

/**
 * Returns a calm, truthful notification description / alert log subtitle.
 */
export function getCatchyNotificationDescription(
  platform: string,
  type: string,
  url?: string,
  title?: string,
  isTask?: boolean
): string {
  const rawType = (type || '').trim().toLowerCase();
  const { actualHost, isDirectStore, isTask: requiresTasks, keyPlatform } = resolveDealHostAndDifficulty(
    platform,
    url,
    title,
    '',
    isTask
  );

  if (!isDirectStore && requiresTasks) {
    const keyInfo = keyPlatform && keyPlatform.toLowerCase() !== actualHost.toLowerCase()
      ? `${keyPlatform} key giveaway`
      : 'Giveaway';
    return `${keyInfo} on ${actualHost} (tasks required).`;
  }

  if (rawType.includes('dlc')) {
    return `Free DLC on ${actualHost}. Requires base game.`;
  }
  if (rawType.includes('beta')) {
    return `Beta access on ${actualHost}. Limited time.`;
  }
  return `Free on ${actualHost}. Limited time claim.`;
}

/**
 * Send a local notification for a free game
 */
export async function sendFreeGameNotification(post: RedditPost): Promise<void> {
  const title = getCatchyNotificationTitle(post.platform, post.type, post.url, post.title, post.isTask);
  const { isTask } = resolveDealHostAndDifficulty(post.platform, post.url, post.title, post.selftext, post.isTask);
  const body = post.cleanTitle + (isTask ? ' · Tasks required' : '');

  if (Platform.OS === 'web') {
    // 1. Dispatch browser / ServiceWorker notification
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.ready;
          await reg.showNotification(title, {
            body: body,
            icon: post.coverImage || '/Icon_Latest.png',
            badge: '/favicon.png',
            data: {
              url: post.url || post.permalink,
              postId: post.id,
              gameTitle: post.cleanTitle,
              platform: post.platform,
              isTask: isTask,
            },
          });
          return;
        } catch (swErr) {
          console.warn('[NotificationService] ServiceWorker notification error:', swErr);
        }
      }

      try {
        new Notification(title, {
          body: body,
          icon: post.coverImage || '/Icon_Latest.png',
        });
      } catch (e) {
        console.warn('[NotificationService] Window Notification error:', e);
      }
    }
    return;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: title,
      body: body,
      data: {
        postId: post.id,
        url: post.url,
        permalink: post.permalink,
        gameTitle: post.cleanTitle,
        platform: post.platform,
        isTask: isTask,
      },
      priority: Notifications.AndroidNotificationPriority.HIGH,
      ...Platform.select({
        ios: {
          sound: 'default',
        },
        android: {
          channelId: 'fgf_loot_alerts',
        },
      }),
    },
    trigger: null, // deliver immediately
  });
}

function playNotificationChime() {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // First tone (D5: 587.33Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.18, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);

    // Second tone (A5: 880Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.1);
    gain2.gain.setValueAtTime(0.2, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.5);
  } catch {}
}

/**
 * Send an immediate test notification to verify delivery and permissions
 */
export async function sendTestNotification(): Promise<{ success: boolean; message: string }> {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        let perm = Notification.permission;
        if (perm !== 'granted') {
          perm = await Notification.requestPermission();
        }
        if (perm === 'granted') {
          // Play audible confirmation chime immediately
          playNotificationChime();

          const origin = window.location.origin || '';
          const iconUrl = origin ? `${origin}/Icon_Latest.png` : '/Icon_Latest.png';
          const badgeUrl = origin ? `${origin}/favicon.png` : '/favicon.png';

          let sentViaSW = false;
          if ('serviceWorker' in navigator) {
            try {
              // 1. Try Service Worker with race timeout so it never hangs
              const reg = await Promise.race([
                navigator.serviceWorker.ready,
                new Promise<null>((r) => setTimeout(() => r(null), 1500)),
              ]);
              if (reg && typeof reg.showNotification === 'function') {
                await reg.showNotification('Free on Steam · Claimr', {
                  body: 'Half-Life 2 · 100% Free to Keep',
                  icon: iconUrl,
                  badge: badgeUrl,
                  tag: 'test-notification-' + Date.now(),
                  requireInteraction: true,
                });
                sentViaSW = true;
              }
            } catch (swErr) {
              console.warn('[NotificationService] SW showNotification error:', swErr);
            }
          }

          // 2. Direct Window Notification fallback if SW didn't fire
          if (!sentViaSW) {
            try {
              const notif = new Notification('Free on Steam · Claimr', {
                body: 'Half-Life 2 · 100% Free to Keep',
                icon: iconUrl,
                requireInteraction: true,
              });
              notif.onclick = () => window.focus();
            } catch (wErr) {
              console.warn('[NotificationService] Direct Notification error:', wErr);
            }
          }

          return { success: true, message: 'Dispatched to Windows/Browser' };
        }
        return { success: false, message: 'Notification permission denied in browser' };
      }
      return { success: false, message: 'Web notifications not supported' };
    }

    try {
      await requestNotificationPermissions();
    } catch {}

    await setupNotificationChannel();

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Free on Steam',
        body: 'Half-Life 2',
        data: {
          postId: 'test-alert-' + Date.now(),
          gameTitle: 'Half-Life 2',
          platform: 'Steam',
          isTest: true,
        },
        priority: Notifications.AndroidNotificationPriority.HIGH,
        ...Platform.select({
          ios: {
            sound: 'default',
          },
          android: {
            channelId: 'fgf_loot_alerts',
          },
        }),
      },
      trigger: null, // deliver immediately
    });

    try {
      await addAlertLog({
        id: 'test-' + Date.now(),
        title: '[Steam] Half-Life 2 (Free / 100% off)',
        cleanTitle: 'Half-Life 2',
        platform: 'Steam',
        type: 'game',
        url: 'https://store.steampowered.com/app/220/HalfLife_2/',
        permalink: 'https://store.steampowered.com/app/220/HalfLife_2/',
        author: 'Claimr',
        selftext: '',
        domain: 'steampowered.com',
        isTask: false,
        createdAt: Date.now(),
      });
    } catch {}

    return { success: true, message: 'Test notification delivered!' };
  } catch (err: any) {
    console.warn('[NotificationService] sendTestNotification error:', err);
    return { success: false, message: err?.message || 'Failed to dispatch notification' };
  }
}


/**
 * Log a new alert to stored notification logs history
 */
// Helper to extract Steam App ID from URL
function extractSteamAppId(url?: string): string | null {
  if (!url) return null;
  const match = url.match(/\/app\/(\d+)/i);
  return match ? match[1] : null;
}

// Helper to extract Reddit post ID (e.g. 15x123) from a full ID or URL
function extractRedditId(idOrUrl?: string): string | null {
  if (!idOrUrl) return null;
  
  if (idOrUrl.includes('reddit.com') && idOrUrl.includes('/comments/')) {
    const match = idOrUrl.match(/\/comments\/([a-z0-9]{5,8})/i);
    if (match) return match[1];
  }
  
  const lastPart = idOrUrl.split(':').pop() || '';
  const cleanId = lastPart.replace('t3_', '').trim();
  if (/^[a-z0-9]{5,10}$/i.test(cleanId) && !idOrUrl.startsWith('gp_')) {
    return cleanId;
  }
  return null;
}

// Helper to clean URL for comparison
function cleanUrlForComparison(url?: string): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    return (u.hostname + u.pathname).toLowerCase().replace(/\/$/, '');
  } catch {
    return url.toLowerCase().replace(/https?:\/\//, '').replace(/\/$/, '');
  }
}

/**
 * Log a new alert to stored notification logs history
 */
export async function addAlertLog(post: RedditPost): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem('fgf_notification_logs_v2');
    const logs = raw ? JSON.parse(raw) : [];

    // Deduplicate
    if (logs.some((l: any) => l.id === post.id)) {
      return;
    }

    const isAnnouncement = post.type === 'announcement';

    // Resolve cover image from current feed cache or deal cache with robust matching
    let coverImage = post.coverImage;

    if (!coverImage) {
      try {
        const feedCacheRaw = await AsyncStorage.getItem('fgf_merged_feed_cache_v3');
        const feedDeals: Deal[] = feedCacheRaw ? JSON.parse(feedCacheRaw) : [];

        const alertRedditId = extractRedditId(post.id) || extractRedditId(post.url);
        const alertCleanUrl = post.url ? cleanUrlForComparison(post.url) : '';
        const alertNormTitle = normalizeTitle(post.title);
        const alertSteamAppId = extractSteamAppId(post.url);

        let matchedDealId: string | undefined = undefined;

        for (const deal of feedDeals) {
          let isMatch = deal.id === post.id;

          if (!isMatch && alertRedditId) {
            const dealRedditId = extractRedditId(deal.id) || extractRedditId(deal.redditUrl) || extractRedditId(deal.url);
            if (dealRedditId && dealRedditId === alertRedditId) {
              isMatch = true;
            }
          }

          if (!isMatch && alertSteamAppId) {
            const dealSteamAppId = extractSteamAppId(deal.url);
            if (dealSteamAppId && dealSteamAppId === alertSteamAppId) {
              isMatch = true;
            }
          }

          if (!isMatch && alertCleanUrl) {
            const dealCleanUrl = deal.url ? cleanUrlForComparison(deal.url) : '';
            const dealRedditCleanUrl = deal.redditUrl ? cleanUrlForComparison(deal.redditUrl) : '';
            if (dealCleanUrl === alertCleanUrl || dealRedditCleanUrl === alertCleanUrl) {
              isMatch = true;
            }
          }

          if (!isMatch) {
            const dealNormTitle = normalizeTitle(deal.title);
            const isSamePlatform = 
              post.platform.toLowerCase() === deal.platform.toLowerCase() ||
              (post.platform.toLowerCase().includes('epic') && deal.platform.toLowerCase().includes('epic')) ||
              (post.platform.toLowerCase().includes('steam') && deal.platform.toLowerCase().includes('steam'));
            if (isSamePlatform && alertNormTitle && alertNormTitle === dealNormTitle) {
              isMatch = true;
            }
          }

          if (isMatch) {
            matchedDealId = deal.id;
            if (deal.image && deal.image !== 'placeholder') {
              coverImage = deal.image;
              break;
            }
          }
        }

        if (!coverImage) {
          const cacheKeysToTry = new Set<string>();
          cacheKeysToTry.add(post.id);
          if (alertRedditId) {
            cacheKeysToTry.add(alertRedditId);
            cacheKeysToTry.add(`t3_${alertRedditId}`);
          }
          if (matchedDealId) {
            cacheKeysToTry.add(matchedDealId);
          }

          for (const cacheKey of cacheKeysToTry) {
            const cachedDeal = await getCachedDeal(cacheKey);
            if (cachedDeal && cachedDeal.image && cachedDeal.image !== 'placeholder') {
              coverImage = cachedDeal.image;
              break;
            }
          }
        }
      } catch (e) {
        console.warn('[NotificationService] Error matching image during addAlertLog:', e);
      }
    }

    const hostDetails = resolveDealHostAndDifficulty(
      post.platform,
      post.url,
      post.title,
      post.selftext,
      post.isTask
    );

    const newAlert = {
      id: post.id,
      title: stripEmojis(isAnnouncement ? post.title : (post.cleanTitle || post.title)),
      description: stripEmojis(
        isAnnouncement
          ? post.cleanTitle
          : getCatchyNotificationDescription(post.platform, post.type, post.url, post.title, hostDetails.isTask)
      ),
      timestamp: Date.now(),
      platform: hostDetails.isDirectStore ? hostDetails.actualHost : post.platform,
      isLive: true,
      claimedCount: isAnnouncement ? 'Notice' : (hostDetails.isTask ? 'Tasks' : 'Active'),
      actionType: post.url ? 'claim' : 'details',
      actionUrl: post.url || undefined,
      coverImage: coverImage || undefined,
    };

    const updated = [newAlert, ...logs].slice(0, 50); // Keep last 50 alerts
    await AsyncStorage.setItem('fgf_notification_logs_v2', JSON.stringify(updated));
  } catch (e) {
    console.error('Error adding alert log:', e);
  }
}

/**
 * Log an incoming push notification (FCM remote or local) directly into Alerts screen storage
 */
export async function addAlertLogFromNotification(content: any): Promise<void> {
  try {
    if (!content) return;
    const data = content.data || {};
    const rawTitle = content.title || data.title || '';
    const rawBody = content.body || data.body || '';
    const id = data.postId ? String(data.postId) : `notif_${Date.now()}`;
    const url = data.url || undefined;

    const isAnnouncement =
      data.isCustom === 'true' ||
      data.isCustom === true ||
      data.type === 'announcement' ||
      (data.platform || '').toLowerCase() === 'announcement';

    let displayTitle = rawTitle;
    if (data.gameTitle) {
      displayTitle = data.gameTitle;
    } else if (data.redditTitle) {
      displayTitle = data.redditTitle.replace(/^\[[^\]]+\]\s*/, '').replace(/\([^)]+\)\s*/, '').trim();
    }
    displayTitle = stripEmojis(displayTitle);

    const hostDetails = resolveDealHostAndDifficulty(
      data.platform || 'PC',
      url,
      data.redditTitle || rawTitle,
      '',
      data.isTask === 'true' || data.isTask === true
    );

    const platform = isAnnouncement
      ? 'Announcement'
      : (hostDetails.isDirectStore ? hostDetails.actualHost : (data.platform || 'PC'));
    const description = stripEmojis(rawBody || (isAnnouncement
      ? displayTitle
      : getCatchyNotificationDescription(data.platform || 'PC', data.type || 'game', url, rawTitle, hostDetails.isTask)));

    const raw = await AsyncStorage.getItem('fgf_notification_logs_v2');
    const logs: any[] = raw ? JSON.parse(raw) : [];

    // Deduplicate
    if (logs.some((l) => l.id === id)) {
      return;
    }

    const newAlert = {
      id,
      title: displayTitle || 'New Freebie Alert',
      description,
      timestamp: Date.now(),
      platform,
      isLive: true,
      isAnnouncement,
      actionUrl: isAnnouncement ? undefined : url, // Announcements have no claim link
      coverImage: data.image || undefined,
    };

    const updated = [newAlert, ...logs].slice(0, 50);
    await AsyncStorage.setItem('fgf_notification_logs_v2', JSON.stringify(updated));

    // Update unread count
    const curUnread = await AsyncStorage.getItem('fgf_unread_alerts_count');
    const nextCount = (parseInt(curUnread || '0', 10) || 0) + 1;
    await AsyncStorage.setItem('fgf_unread_alerts_count', String(nextCount));
  } catch (e) {
    console.warn('[NotificationService] Error logging incoming notification to alerts:', e);
  }
}

/**
 * Syncs any pending push notifications captured by the Service Worker (in Cache API)
 * into AsyncStorage ('fgf_notification_logs_v2') and increments unread count.
 */
export async function syncPendingPwaAlerts(): Promise<void> {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !('caches' in window)) {
    return;
  }
  try {
    const cache = await window.caches.open('claimr-alerts-cache');
    const res = await cache.match('/__claimr_alerts.json');
    if (!res) return;

    const swAlerts = await res.json();
    if (!Array.isArray(swAlerts) || swAlerts.length === 0) return;

    const raw = await AsyncStorage.getItem('fgf_notification_logs_v2');
    const logs: any[] = raw ? JSON.parse(raw) : [];
    const existingIds = new Set(logs.map((l: any) => l.id));

    let addedCount = 0;
    for (const a of swAlerts) {
      if (a && a.id && !existingIds.has(a.id)) {
        logs.unshift({
          id: a.id,
          title: stripEmojis(a.title || 'New Freebie Alert'),
          description: stripEmojis(a.description || 'Limited time claim.'),
          timestamp: a.timestamp || Date.now(),
          platform: a.platform || 'Steam',
          isLive: true,
          isAnnouncement: Boolean(a.isAnnouncement),
          actionUrl: a.actionUrl,
          coverImage: a.coverImage,
        });
        existingIds.add(a.id);
        addedCount++;
      }
    }

    if (addedCount > 0) {
      const updated = logs.slice(0, 50);
      await AsyncStorage.setItem('fgf_notification_logs_v2', JSON.stringify(updated));

      const curUnread = await AsyncStorage.getItem('fgf_unread_alerts_count');
      const nextCount = (parseInt(curUnread || '0', 10) || 0) + addedCount;
      await AsyncStorage.setItem('fgf_unread_alerts_count', String(nextCount));
    }
  } catch (err) {
    console.warn('[NotificationService] Error syncing pending PWA alerts:', err);
  }
}

/**
 * Register the background fetch task (No-op after pre-release hardening)
 */
export async function registerBackgroundFetch(): Promise<void> {
  // Client-side background fetch task removed in favor of backend FCM push notifications.
  return Promise.resolve();
}

/**
 * Unregister background fetch task (No-op after pre-release hardening)
 */
export async function unregisterBackgroundFetch(): Promise<void> {
  return Promise.resolve();
}

/**
 * Utility to seed initial post IDs so the app doesn't notify about existing hot posts
 * when first installed / opened.
 */
export async function seedInitialSeenPosts(): Promise<void> {
  try {
    const seenIds = await getSeenPosts();
    if (seenIds.length === 0) {
      const posts = await fetchFreeGameFindings('new', 30);
      const postIds = posts.map((p) => p.id);
      await addSeenPosts(postIds);
      console.log('Seeded initial seen posts successfully.');

      // Prepopulate the top 5 recent posts as initial alert logs in the Alerts screen
      const initialAlerts = posts.slice(0, 5).map((post) => ({
        id: post.id,
        title: post.cleanTitle || post.title,
        description: `Free ${post.type || 'game'} on ${post.platform}! Claim it now.`,
        timestamp: post.createdAt || Date.now(),
        platform: post.platform,
        isLive: true,
        claimedCount: 'Active',
        actionType: 'claim',
        actionUrl: post.url,
        coverImage: post.coverImage || undefined,
      }));
      await AsyncStorage.setItem('fgf_notification_logs_v2', JSON.stringify(initialAlerts));
      console.log('Seeded initial alert logs successfully.');
    }
  } catch (err) {
    console.error('Error seeding seen posts:', err);
  }
}

/**
 * Register FCM token with the backend.
 * - Skips gracefully if Firebase Messaging is unavailable (Expo Go / non-native builds).
 * - Sends the token on EVERY app launch (heartbeat/re-sync) so the backend
 *   automatically re-populates its token table after any redeploy that wipes
 *   in-memory or SQLite state. The backend upserts via INSERT OR REPLACE,
 *   so duplicate registrations are safe and cheap.
 * - Fire-and-forget: never blocks app startup.
 */
export async function registerFCMToken(): Promise<void> {
  try {
    if (!messaging) {
      if (__DEV__) {
        console.warn('[NotificationService] Skipping registerFCMToken: Firebase Messaging is not available.');
      }
      return;
    }

    // Request permission to receive FCM messages (required on iOS, safe no-op on Android)
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus?.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus?.PROVISIONAL ||
      authStatus === 1 || // AUTHORIZED fallback
      authStatus === 2;  // PROVISIONAL fallback
    
    if (!enabled) {
      if (__DEV__) {
        console.warn('[NotificationService] FCM permission not granted. Skipping token registration.');
      }
      return;
    }

    const fcmToken = await messaging().getToken();
    if (!fcmToken) {
      if (__DEV__) {
        console.warn('[NotificationService] Could not acquire FCM token. Device may not support FCM.');
      }
      return;
    }

    if (__DEV__) {
      console.log('[NotificationService] FCM Token acquired (FULL):', fcmToken);
    }

    // Always re-send the token to the backend on every launch so it survives
    // backend redeployments that wipe in-memory / SQLite state.
    // This is fire-and-forget — we intentionally do NOT await the registration
    // call in a way that would block the caller, but we do await it here so
    // errors are caught and logged without crashing the app.
    fetch('https://lootquest-backend.onrender.com/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: fcmToken }),
    })
      .then(async (response) => {
        if (response.ok) {
          // Keep the cache in sync so token-change listeners still work correctly
          await AsyncStorage.setItem(FCM_TOKEN_CACHE_KEY, fcmToken);
          if (__DEV__) {
            console.log('[NotificationService] ✅ FCM token re-synced with backend.');
          }
        } else {
          console.error('[NotificationService] Failed to re-sync FCM token. Backend status:', response.status);
        }
      })
      .catch((err) => {
        console.error('[NotificationService] Network error re-syncing FCM token:', err);
      });
  } catch (error: any) {
    if (error?.message?.includes('FIS_AUTH_ERROR')) {
      if (__DEV__) {
        console.warn('[NotificationService] Firebase Installation FIS_AUTH_ERROR: Development package name not registered in Firebase console. Remote FCM is disabled in dev client.');
      }
    } else {
      console.error('[NotificationService] Error in registerFCMToken:', error);
    }
  }
}

export const VAPID_PUBLIC_KEY =
  process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ||
  'BKhdpUFx1EmuDrTGDwlGieYyrXY-rLHsdy4dFOnwN22AerSslFLAKnYNB9rZoDqUfy_aRvjAfT5lrmHEvkwgE6M';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Subscribes to standard browser Web Push (VAPID) and registers the subscription
 * with the Claimr backend server so notifications arrive even when PWA/browser is closed.
 */
export async function registerWebPushSubscription(): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  if (Notification.permission !== 'granted') return false;

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();

    if (!sub) {
      const convertedKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey as any,
      });
    }

    if (sub) {
      const subJson = sub.toJSON();
      await fetch('https://lootquest-backend.onrender.com/register-web-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subJson }),
      });
      console.log('[NotificationService] ✅ Web push subscription registered with backend.');
      return true;
    }
  } catch (err) {
    console.warn('[NotificationService] Web push subscription failed:', err);
  }
  return false;
}

function cleanTitleForMatching(t: string): string {
  if (!t) return "";
  return t
    .toLowerCase()
    .replace(/\[[^\]]+\]/g, "") // remove brackets
    .replace(/\([^)]+\)/g, "")   // remove parentheses
    // remove common platform/promo keywords as words
    .replace(/\b(steam|gog|epicgames|epic|itchio|itch|playstation|xbox|pc|dlc|key|giveaway|free|game|pack|bundle)\b/g, "")
    .replace(/[^a-z0-9]/gi, "")  // remove non-alphanumeric
    .trim();
}

export function isPlatformSelectedForNotification(
  dealPlatform: string | string[],
  selectedPlatforms: string[],
  url?: string,
  title?: string,
  isTask?: boolean
): boolean {
  if (!selectedPlatforms || selectedPlatforms.length === 0) {
    return false;
  }

  const platStr = Array.isArray(dealPlatform) ? dealPlatform.join(' ') : (dealPlatform || '');
  const selectedLower = selectedPlatforms.map((p) => p.toLowerCase().trim());
  const hasOthersSelected = selectedLower.includes('others') || selectedLower.includes('other');

  // If a URL is available, resolve verified actual host and check if it's a direct store
  if (url) {
    const { actualHost, isDirectStore } = resolveDealHostAndDifficulty(
      platStr,
      url,
      title,
      '',
      isTask
    );
    const actualHostLower = actualHost.toLowerCase();

    // 1. Direct storefronts match their corresponding store selection
    if (isDirectStore) {
      const matchedStores: string[] = [];
      if (actualHostLower.includes('steam')) matchedStores.push('steam');
      if (actualHostLower.includes('epic')) matchedStores.push('epic games');
      if (actualHostLower.includes('gog')) matchedStores.push('gog');
      if (/\bitch(?:\.io)?\b/i.test(actualHostLower)) matchedStores.push('itch.io');
      if (actualHostLower.includes('ubisoft') || actualHostLower.includes('uplay')) matchedStores.push('ubisoft');
      if (actualHostLower.includes('stove')) matchedStores.push('stove');
      if (actualHostLower.includes('prime') || actualHostLower.includes('amazon')) matchedStores.push('prime gaming');
      if (actualHostLower.includes('playstation') || actualHostLower.includes('ps4') || actualHostLower.includes('ps5') || actualHostLower.includes('psn')) matchedStores.push('playstation');
      if (actualHostLower.includes('xbox')) matchedStores.push('xbox');
      if (actualHostLower.includes('indiegala') || actualHostLower.includes('gala')) matchedStores.push('indiegala');

      if (matchedStores.length > 0) {
        return matchedStores.some((store) => selectedLower.includes(store));
      }

      return (
        hasOthersSelected ||
        selectedLower.includes('pc')
      );
    }

    // 2. Specific external giveaway hosts (e.g. Alienware Arena)
    if (actualHostLower.includes('alienware')) {
      return selectedLower.includes('alienware arena') || hasOthersSelected;
    }

    // 3. Other third-party giveaway hosts (Givee.Club, Gleam, Keylol, GrabFreeGame, Giveaway.su, etc.)
    // These belong to the "Others" category.
    // They do NOT falsely match direct store toggles like "Steam" or "Epic Games"
    // They are ONLY allowed if "Others" is enabled!
    return hasOthersSelected;
  }

  // Fallback when no URL is available (match based on platform string)
  const platLower = platStr.toLowerCase().trim();
  const matchedStores: string[] = [];
  if (platLower.includes('steam')) matchedStores.push('steam');
  if (platLower.includes('epic')) matchedStores.push('epic games');
  if (platLower.includes('gog')) matchedStores.push('gog');
  if (/\bitch(?:\.io)?\b/i.test(platLower)) matchedStores.push('itch.io');
  if (platLower.includes('ubisoft') || platLower.includes('uplay')) matchedStores.push('ubisoft');
  if (platLower.includes('stove')) matchedStores.push('stove');
  if (platLower.includes('alienware')) matchedStores.push('alienware arena');
  if (platLower.includes('prime') || platLower.includes('amazon')) matchedStores.push('prime gaming');
  if (platLower.includes('playstation') || platLower.includes('ps4') || platLower.includes('ps5') || platLower.includes('psn')) matchedStores.push('playstation');
  if (platLower.includes('xbox')) matchedStores.push('xbox');
  if (platLower.includes('indiegala') || platLower.includes('gala')) matchedStores.push('indiegala');

  if (matchedStores.length > 0) {
    return matchedStores.some((store) => selectedLower.includes(store));
  }

  return (
    hasOthersSelected ||
    selectedLower.includes('pc')
  );
}

export function isTypeSelectedForNotification(
  rawType: string,
  rawTitle: string,
  selectedTypes: string[]
): boolean {
  if (!selectedTypes || selectedTypes.length === 0) {
    return false;
  }

  const selectedLower = selectedTypes.map((t) => t.toLowerCase());
  const typeLower = (rawType || '').toLowerCase().trim();
  const titleLower = (rawTitle || '').toLowerCase().trim();

  let category = 'game';

  // 1. Beta / Alpha / Playtest
  if (
    typeLower.includes('beta') ||
    typeLower.includes('alpha') ||
    typeLower.includes('playtest') ||
    /\((?:beta|alpha|playtest)\)/i.test(titleLower) ||
    /\b(closed beta|open beta|playtest|alpha test)\b/i.test(titleLower)
  ) {
    category = 'beta';
  }
  // 2. DLC / In-game loot / Items
  else if (
    typeLower.includes('dlc') ||
    typeLower.includes('item') ||
    typeLower.includes('loot') ||
    /\((?:dlc|expansion|add-on|addon|loot|item)\)/i.test(titleLower) ||
    /\b(dlc|expansion|add-on|addon|season pass)\b/i.test(titleLower)
  ) {
    category = 'dlc';
  }
  // 3. Full games
  else {
    category = 'game';
  }

  return selectedLower.includes(category);
}

/**
 * Processes incoming foreground/background FCM messages.
 */
async function handleRemoteMessage(remoteMessage: any): Promise<void> {
  try {
    const data = remoteMessage.data || {};
    const notification = remoteMessage.notification || {};
    const title = data.title || notification.title || '';
    const body = data.body || notification.body || '';
    const { url, postId, isCustom, image, redditTitle, platform, type } = data;

    if (title || body) {
      const settings = await getAppSettings();

      if (isCustom === 'true') {
        const mockPost: RedditPost = {
          id: postId || remoteMessage.messageId || String(Date.now()),
          title: title || 'Claimr Alert',
          cleanTitle: body || '',
          platform: 'Announcement',
          type: 'announcement',
          url: url || '',
          permalink: url || '',
          author: 'Admin',
          createdAt: Date.now(),
          selftext: '',
          domain: '',
          isTask: false,
        };

        // Custom announcements bypass platform/type filters but respect global switch
        if (!settings.notificationsEnabled) {
          if (__DEV__) {
            console.log('[NotificationService] Skipping announcement because notifications are disabled globally.');
          }
          return;
        }

        // Schedule notification with exact custom title and message body
        await Notifications.scheduleNotificationAsync({
          content: {
            title: mockPost.title,
            body: mockPost.cleanTitle,
            data: { 
              postId: mockPost.id, 
              url: mockPost.url, 
              permalink: mockPost.permalink,
              gameTitle: mockPost.title,
              platform: mockPost.platform,
              isTask: mockPost.isTask,
            },
            priority: Notifications.AndroidNotificationPriority.HIGH,
            ...Platform.select({
              ios: {
                sound: 'default',
              },
              android: {
                channelId: 'fgf_loot_alerts',
              },
            }),
          },
          trigger: null, // deliver immediately
        });

        // Add to alert log
        await addAlertLog(mockPost);

        // Increment unread count
        const currentUnreadRaw = await AsyncStorage.getItem('fgf_unread_alerts_count');
        const currentUnread = currentUnreadRaw ? Number(currentUnreadRaw) : 0;
        await AsyncStorage.setItem('fgf_unread_alerts_count', String(currentUnread + 1));
        return;
      }

      // Standard game deal formatting
      let rawTitle = '';
      if (redditTitle) {
        rawTitle = redditTitle;
      } else if (title && title.startsWith('🆓 ')) {
        const cleanGameName = title.replace('🆓 ', '').trim();
        const platformName = platform || 'Steam';
        rawTitle = `[${platformName}] (Game) ${cleanGameName}`;
      } else {
        rawTitle = body || title || '';
      }

      const parsed = parseRedditTitle(rawTitle, url || '', '');

      const resolvedPlatform = (parsed.platform && parsed.platform !== 'Unknown')
        ? parsed.platform
        : (platform || 'Steam');

      const resolvedType = (parsed.type && parsed.type !== 'Game')
        ? parsed.type
        : (type || parsed.type || 'Game');

      const hostDetails = resolveDealHostAndDifficulty(
        resolvedPlatform,
        url || '',
        rawTitle,
        '',
        parsed.isTask
      );

      const mockPost: RedditPost = {
        id: postId || remoteMessage.messageId || String(Date.now()),
        title: rawTitle,
        cleanTitle: parsed.cleanTitle || title || 'Free Game',
        platform: hostDetails.isDirectStore ? hostDetails.actualHost : resolvedPlatform,
        type: resolvedType,
        url: url || '',
        permalink: url || '',
        author: 'Freebie Radar',
        createdAt: Date.now(),
        selftext: '',
        domain: '',
        isTask: hostDetails.isTask,
        coverImage: image || undefined,
      };

      // Deduplicate check: skip if we've already notified the user about this game on this platform within the last 7 days
      const incomingTitleClean = cleanTitleForMatching(mockPost.cleanTitle || mockPost.title);
      const incomingPlatCanonical = getCanonicalPlatform(mockPost.platform);
      
      const rawLogs = await AsyncStorage.getItem('fgf_notification_logs_v2');
      if (rawLogs) {
        let logs = [];
        try {
          logs = JSON.parse(rawLogs);
        } catch (e) {
          console.warn('[NotificationService] Error parsing notification logs history:', e);
        }
        const isDuplicate = logs.some((log: any) => {
          const logTitleClean = cleanTitleForMatching(log.title);
          const logPlatCanonical = getCanonicalPlatform(log.platform);
          
          const titleMatches = logTitleClean === incomingTitleClean;
          const platformMatches = logPlatCanonical === incomingPlatCanonical;
          
          const timeDiff = Math.abs(Date.now() - (log.timestamp || 0));
          const isRecent = timeDiff < 7 * 24 * 60 * 60 * 1000; // 7 days
          
          return titleMatches && platformMatches && isRecent;
        });

        if (isDuplicate) {
          if (__DEV__) {
            console.log(`[NotificationService] Skipping duplicate notification for "${mockPost.cleanTitle}" on platform "${mockPost.platform}".`);
          }
          return;
        }
      }

      // Filter check 1: Global notifications switch
      if (!settings.notificationsEnabled) {
        if (__DEV__) {
          console.log('[NotificationService] Skipping notification because notifications are disabled globally.');
        }
        return;
      }

      // Filter check 2: Platform filtering (verified host)
      const platformMatches = isPlatformSelectedForNotification(
        mockPost.platform || '',
        settings.notificationPlatforms || [],
        mockPost.url,
        mockPost.title,
        mockPost.isTask
      );

      if (!platformMatches) {
        if (__DEV__) {
          console.log(`[NotificationService] Skipping notification for "${mockPost.cleanTitle}" because platform/host "${hostDetails.actualHost}" is unchecked.`);
        }
        return;
      }

      // Filter check 3: Content Type filtering
      const typeMatches = isTypeSelectedForNotification(
        mockPost.type || '',
        mockPost.title || mockPost.cleanTitle || '',
        settings.notificationTypes || []
      );

      if (!typeMatches) {
        if (__DEV__) {
          console.log(`[NotificationService] Skipping notification for "${mockPost.cleanTitle}" because type "${mockPost.type}" is unchecked.`);
        }
        return;
      }

      await sendFreeGameNotification(mockPost);
      await addAlertLog(mockPost);

      const currentUnreadRaw = await AsyncStorage.getItem('fgf_unread_alerts_count');
      const currentUnread = currentUnreadRaw ? Number(currentUnreadRaw) : 0;
      await AsyncStorage.setItem('fgf_unread_alerts_count', String(currentUnread + 1));
    }
  } catch (err) {
    console.error('[NotificationService] Error handling remote message:', err);
  }
}

/**
 * Diagnostic helper to simulate receiving an FCM push notification
 */
export async function testReceiveFCM(
  platform: string,
  type: string,
  cleanTitle: string,
  url?: string
): Promise<string> {
  const mockRedditTitle = `[${platform}] (${type}) ${cleanTitle}`;
  const dealUrl = url || '';
  const parsed = parseRedditTitle(mockRedditTitle, dealUrl, '');
  const hostDetails = resolveDealHostAndDifficulty(
    platform,
    dealUrl,
    mockRedditTitle,
    '',
    parsed.isTask
  );

  const remoteMessage = {
    data: {
      title: 'Claimr Alert',
      body: mockRedditTitle,
      redditTitle: mockRedditTitle,
      platform: platform,
      url: dealUrl,
      postId: 'test_fcm_' + platform.toLowerCase() + '_' + Date.now(),
    }
  };

  const settings = await getAppSettings();

  // Platform matching (verified host aware)
  const platformMatches = isPlatformSelectedForNotification(
    platform,
    settings.notificationPlatforms || [],
    dealUrl,
    mockRedditTitle,
    hostDetails.isTask
  );

  // Type matching
  const typeMatches = isTypeSelectedForNotification(type, mockRedditTitle, settings.notificationTypes || []);

  // Trace duplicate checking
  let isDuplicate = false;
  const incomingTitleClean = cleanTitleForMatching(cleanTitle);
  const incomingPlatCanonical = getCanonicalPlatform(platform);
  const rawLogs = await AsyncStorage.getItem('fgf_notification_logs_v2');
  if (rawLogs) {
    let logs = [];
    try {
      logs = JSON.parse(rawLogs);
    } catch (e) {
      console.warn('[NotificationService] Error parsing logs in testReceiveFCM:', e);
    }
    isDuplicate = logs.some((log: any) => {
      const logTitleClean = cleanTitleForMatching(log.title);
      const logPlatCanonical = getCanonicalPlatform(log.platform);
      
      const titleMatches = logTitleClean === incomingTitleClean;
      const platformMatches = logPlatCanonical === incomingPlatCanonical;
      
      const timeDiff = Math.abs(Date.now() - (log.timestamp || 0));
      const isRecent = timeDiff < 7 * 24 * 60 * 60 * 1000; // 7 days
      
      return titleMatches && platformMatches && isRecent;
    });
  }

  const allowed = settings.notificationsEnabled && platformMatches && typeMatches && !isDuplicate;

  if (allowed) {
    await handleRemoteMessage(remoteMessage);
    return `Allowed & Scheduled: "${mockRedditTitle}" (Host: ${hostDetails.actualHost}, Platform Switch: ${platformMatches ? 'On' : 'Off'}, Type Switch: ${typeMatches ? 'On' : 'Off'})`;
  } else if (isDuplicate) {
    return `Blocked: "${mockRedditTitle}" (Reason: Duplicate / Already Notified)`;
  } else {
    return `Blocked: "${mockRedditTitle}" (Global Notifications: ${settings.notificationsEnabled ? 'On' : 'Off'}, Host: ${hostDetails.actualHost}, Platform Switch: ${platformMatches ? 'On' : 'Off'}, Type Switch: ${typeMatches ? 'On' : 'Off'})`;
  }
}

// Register FCM background message handler at the module level ( Hermes / entry point early registration )
if (messaging && Platform.OS !== 'web') {
  try {
    messaging().setBackgroundMessageHandler(async (remoteMessage: any) => {
      console.log('[NotificationService] Background FCM message received:', remoteMessage);
      await handleRemoteMessage(remoteMessage);
    });

    // Handle foreground messages
    messaging().onMessage(async (remoteMessage: any) => {
      console.log('[NotificationService] Foreground FCM message received:', remoteMessage);
      await handleRemoteMessage(remoteMessage);
    });

    // Listen for FCM token refreshes and automatically sync with backend
    messaging().onTokenRefresh(async (refreshedToken: string) => {
      if (!refreshedToken) return;
      try {
        await fetch('https://lootquest-backend.onrender.com/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: refreshedToken }),
        });
        await AsyncStorage.setItem(FCM_TOKEN_CACHE_KEY, refreshedToken);
        console.log('[NotificationService] ✅ Refreshed FCM token registered with backend.');
      } catch (err) {
        console.error('[NotificationService] Failed to sync refreshed FCM token:', err);
      }
    });
  } catch (e) {
    if (__DEV__) {
      console.warn('[NotificationService] Failed to set FCM message handlers:', e);
    }
  }
}

/**
 * Starts periodic checking for new deals when running on Web / PWA.
 */
let webPollerStarted = false;
export function startWebDealPoller(onNewAlert?: () => void): () => void {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || webPollerStarted) {
    return () => {};
  }
  webPollerStarted = true;

  const checkWebDeals = async () => {
    try {
      const settings = await getAppSettings();
      if (!settings.notificationsEnabled) return;

      const seenIds = await getSeenPosts();
      if (!seenIds || seenIds.length === 0) return;

      const posts = await fetchFreeGameFindings('new', 25);
      const newPosts = posts.filter((p) => !seenIds.includes(p.id));

      if (newPosts.length === 0) return;

      for (const post of newPosts) {
        const platformMatches = isPlatformSelectedForNotification(
          post.platform || '',
          settings.notificationPlatforms || [],
          post.url,
          post.title,
          post.isTask
        );
        const typeMatches = isTypeSelectedForNotification(
          post.type || '',
          post.title || post.cleanTitle || '',
          settings.notificationTypes || []
        );

        if (platformMatches && typeMatches) {
          // Push notifications on Web/PWA are delivered by backend VAPID Web Push through service worker.
          // In-client poller only updates alert log & unread badge count to prevent duplicate notifications.
          await addAlertLog(post);

          const currentUnreadRaw = await AsyncStorage.getItem('fgf_unread_alerts_count');
          const currentUnread = currentUnreadRaw ? Number(currentUnreadRaw) : 0;
          await AsyncStorage.setItem('fgf_unread_alerts_count', String(currentUnread + 1));

          if (onNewAlert) {
            onNewAlert();
          }
        }
      }

      await addSeenPosts(newPosts.map((p) => p.id));
    } catch (err) {
      console.warn('[NotificationService] Web deal polling error:', err);
    }
  };

  // Poll every 5 minutes
  const interval = setInterval(checkWebDeals, 5 * 60 * 1000);

  // Also check when tab becomes visible again
  const handleVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      checkWebDeals();
    }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  return () => {
    clearInterval(interval);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  };
}

/**
 * Dispatches a web browser notification directly
 */
export async function sendWebNotification(
  title: string,
  body: string,
  icon?: string,
  url?: string
): Promise<void> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  try {
    const notif = new Notification(title, {
      body,
      icon: icon || '/Icon_Latest.png',
      badge: '/favicon.png',
      data: { url },
    });
    if (url) {
      notif.onclick = () => {
        window.open(url, '_blank');
      };
    }
  } catch {
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(title, {
          body,
          icon: icon || '/Icon_Latest.png',
          badge: '/favicon.png',
          data: { url },
        });
      } catch {}
    }
  }
}



