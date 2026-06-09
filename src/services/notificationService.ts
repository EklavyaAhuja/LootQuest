import * as Notifications from 'expo-notifications';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { fetchFreeGameFindings, RedditPost } from './redditService';
import { getAppSettings, getSeenPosts, addSeenPosts } from './storageService';

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
 * Send a local notification for a free game
 */
export async function sendFreeGameNotification(post: RedditPost): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `🎁 Free ${post.type} on ${post.platform}!`,
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
export async function addAlertLog(post: RedditPost): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem('fgf_notification_logs_v2');
    const logs = raw ? JSON.parse(raw) : [];

    // Deduplicate
    if (logs.some((l: any) => l.id === post.id)) {
      return;
    }

    const newAlert = {
      id: post.id,
      title: post.cleanTitle || post.title,
      description: `Free ${post.type || 'game'} on ${post.platform}! Claim it now.`,
      timestamp: Date.now(),
      platform: post.platform,
      isLive: true,
      claimedCount: 'Active',
      actionType: 'claim',
      actionUrl: post.url,
    };

    const updated = [newAlert, ...logs].slice(0, 50); // Keep last 50 alerts
    await AsyncStorage.setItem('fgf_notification_logs_v2', JSON.stringify(updated));
  } catch (e) {
    console.error('Error adding alert log:', e);
  }
}

/**
 * Core background fetch task handler.
 * Fetches the newest posts, checks if they are new, applies platform/type filters,
 * sends notifications, and updates the cache.
 */
TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  try {
    const settings = await getAppSettings();
    
    // If user disabled notifications, stop immediately
    if (!settings.notificationsEnabled) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const posts = await fetchFreeGameFindings('new', 20);
    if (posts.length === 0) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const seenIds = await getSeenPosts();
    
    // Filter posts that are:
    // 1. Not in seen list
    // 2. Matching platform filters (if platform filters are set)
    // 3. Matching type filters (if type filters are set)
    const newPosts = posts.filter((post) => {
      // Deduplicate
      if (seenIds.includes(post.id)) {
        return false;
      }

      // Filter by platform (if user set any)
      if (settings.notificationPlatforms.length > 0) {
        const matchesPlatform = settings.notificationPlatforms.some((plat) =>
          post.platform.toLowerCase().includes(plat.toLowerCase())
        );
        if (!matchesPlatform) return false;
      }

      // Filter by type (if user set any)
      if (settings.notificationTypes.length > 0) {
        const matchesType = settings.notificationTypes.some((t) =>
          post.type.toLowerCase().includes(t.toLowerCase())
        );
        if (!matchesType) return false;
      }

      return true;
    });

    if (newPosts.length === 0) {
      // No new filtered games found, but we update seen IDs to include all latest posts
      // so we don't process them again next time
      const allFetchedIds = posts.map(p => p.id);
      await addSeenPosts(allFetchedIds);
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // Trigger notifications and log alerts for new posts (reverse order so oldest of new is notified first)
    const reversedNewPosts = [...newPosts].reverse();
    for (const post of reversedNewPosts) {
      await sendFreeGameNotification(post);
      await addAlertLog(post);
    }

    // Increment unread count by number of new posts
    const currentUnreadRaw = await AsyncStorage.getItem('fgf_unread_alerts_count');
    const currentUnread = currentUnreadRaw ? Number(currentUnreadRaw) : 0;
    await AsyncStorage.setItem('fgf_unread_alerts_count', String(currentUnread + newPosts.length));

    // Add all fetched posts to the seen list
    const allFetchedIds = posts.map(p => p.id);
    await addSeenPosts(allFetchedIds);

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.error('Error in background fetch task:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

/**
 * Register the background fetch task
 */
export async function registerBackgroundFetch(): Promise<void> {
  try {
    const settings = await getAppSettings();
    
    // Check if task is already registered
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
    
    if (!settings.notificationsEnabled) {
      if (isRegistered) {
        await BackgroundFetch.unregisterTaskAsync(BACKGROUND_FETCH_TASK);
        console.log('Background fetch unregistered because notifications are disabled.');
      }
      return;
    }

    await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
      minimumInterval: settings.backgroundIntervalMinutes * 60, // in seconds
      stopOnTerminate: false, // continue running when app is closed
      startOnBoot: true, // run automatically on device boot
    });
    
    console.log(`Background fetch registered with interval ${settings.backgroundIntervalMinutes} minutes.`);
  } catch (err) {
    console.error('Failed to register background fetch:', err);
  }
}

/**
 * Unregister background fetch task
 */
export async function unregisterBackgroundFetch(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_FETCH_TASK);
      console.log('Background fetch task successfully unregistered.');
    }
  } catch (err) {
    console.error('Failed to unregister background fetch:', err);
  }
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
