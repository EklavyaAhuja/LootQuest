import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { fetchFreeGameFindings, RedditPost, parseRedditTitle } from './redditService';
import { getAppSettings, getSeenPosts, addSeenPosts } from './storageService';

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
      data: { postId: post.id, url: post.url, permalink: post.permalink },
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
 * - Caches the last registered token in AsyncStorage to avoid redundant backend calls.
 * - Automatically re-registers if the token changes (e.g. after app reinstall).
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

    // Check if we already registered this exact token with the backend
    const cachedToken = await AsyncStorage.getItem(FCM_TOKEN_CACHE_KEY);
    if (cachedToken === fcmToken) {
      if (__DEV__) {
        console.log('[NotificationService] FCM token unchanged.');
      }
      return;
    }

    // Token is new or changed — register with backend
    const response = await fetch('https://lootquest-backend.onrender.com/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: fcmToken }),
    });

    if (response.ok) {
      // Cache the successfully registered token
      await AsyncStorage.setItem(FCM_TOKEN_CACHE_KEY, fcmToken);
      console.log('[NotificationService] ✅ FCM token registered successfully on backend.');
    } else {
      console.error('[NotificationService] Failed to register FCM token. Backend status:', response.status);
    }
  } catch (error) {
    console.error('[NotificationService] Error in registerFCMToken:', error);
  }
}

/**
 * Processes incoming foreground/background FCM messages.
 */
async function handleRemoteMessage(remoteMessage: any): Promise<void> {
  try {
    const { title, body, url, postId, isCustom } = remoteMessage.data || {};
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
            data: { postId: mockPost.id, url: mockPost.url, permalink: mockPost.permalink },
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
      const rawTitle = body || title;
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


