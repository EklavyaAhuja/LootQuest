import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { fetchFreeGameFindings, RedditPost, parseRedditTitle } from './redditService';
import { getAppSettings, getSeenPosts, addSeenPosts } from './storageService';
import { getCachedDeal } from './DealCache';
import { Deal } from '../models/Deal';
import { normalizeTitle } from '../utils/dealUtils';

let messaging: any = null;
try {
  messaging = require('@react-native-firebase/messaging').default;
  if (__DEV__) {
    console.log('[NotificationService] Firebase Messaging initialized.');
  }
} catch (e) {
  if (__DEV__) {
    console.warn('[NotificationService] Firebase Messaging is not available (Expo Go / non-native environment). FCM notifications disabled.');
  }
}

const FCM_TOKEN_CACHE_KEY = 'fgf_fcm_token_v1';

const BACKGROUND_FETCH_TASK = 'FGF_BACKGROUND_FETCH_TASK';

// Configure how notifications are handled when the app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Configure dedicated notification channel on Android for custom sound
 */
export async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('fgf_loot_alerts', {
      name: 'Loot Quest Alerts',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'long_expected.mp3',
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#39ff14',
    });
  }
}

/**
 * Request permission for local notifications
 */
export async function requestNotificationPermissions(): Promise<boolean> {
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
 * Send a local notification for a free game
 */
export async function sendFreeGameNotification(post: RedditPost): Promise<void> {
  const formattedType = formatType(post.type);
  const titlePrefix = formattedType.toLowerCase().startsWith('free') ? '' : 'Free ';
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `🎁 ${titlePrefix}${formattedType} on ${post.platform}!`,
      body: post.cleanTitle,
      data: {
        postId: post.id,
        url: post.url,
        permalink: post.permalink,
        gameTitle: post.cleanTitle,
        platform: post.platform,
        isTask: post.isTask,
      },
      sound: 'long_expected.mp3',
      priority: Notifications.AndroidNotificationPriority.HIGH,
      ...Platform.select({
        android: {
          channelId: 'fgf_loot_alerts',
        },
      }),
    },
    trigger: null, // deliver immediately
  });
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
    const formattedType = formatType(post.type || 'game');
    const descPrefix = formattedType.toLowerCase().startsWith('free') ? '' : 'Free ';

    // Resolve cover image from current feed cache or deal cache with robust matching
    let coverImage = post.coverImage;

    if (!coverImage) {
      try {
        const feedCacheRaw = await AsyncStorage.getItem('fgf_merged_feed_cache');
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

    const newAlert = {
      id: post.id,
      title: isAnnouncement ? post.title : (post.cleanTitle || post.title),
      description: isAnnouncement ? post.cleanTitle : `${descPrefix}${formattedType} on ${post.platform}! Claim it now.`,
      timestamp: Date.now(),
      platform: post.platform,
      isLive: true,
      claimedCount: isAnnouncement ? 'Notice' : 'Active',
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
  } catch (error) {
    console.error('[NotificationService] Error in registerFCMToken:', error);
  }
}

/**
 * Processes incoming foreground/background FCM messages.
 */
async function handleRemoteMessage(remoteMessage: any): Promise<void> {
  try {
    const { title, body, url, postId, isCustom, image, redditTitle, platform } = remoteMessage.data || {};
    if (title || body) {
      if (isCustom === 'true') {
        const mockPost: RedditPost = {
          id: postId || remoteMessage.messageId || String(Date.now()),
          title: title || 'LootQuest Alert',
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
            sound: 'long_expected.mp3',
            priority: Notifications.AndroidNotificationPriority.HIGH,
            ...Platform.select({
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

      const mockPost: RedditPost = {
        id: postId || remoteMessage.messageId || String(Date.now()),
        title: rawTitle,
        cleanTitle: parsed.cleanTitle,
        platform: parsed.platform,
        type: parsed.type,
        url: url || '',
        permalink: url || '',
        author: 'Freebie Radar',
        createdAt: Date.now(),
        selftext: '',
        domain: '',
        isTask: parsed.isTask,
        coverImage: image || undefined,
      };

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

// Register FCM background message handler at the module level ( Hermes / entry point early registration )
if (messaging) {
  messaging().setBackgroundMessageHandler(async (remoteMessage: any) => {
    console.log('[NotificationService] Background FCM message received:', remoteMessage);
    await handleRemoteMessage(remoteMessage);
  });

  // Handle foreground messages
  messaging().onMessage(async (remoteMessage: any) => {
    console.log('[NotificationService] Foreground FCM message received:', remoteMessage);
    await handleRemoteMessage(remoteMessage);
  });
}


