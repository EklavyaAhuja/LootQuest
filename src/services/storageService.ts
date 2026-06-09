import AsyncStorage from '@react-native-async-storage/async-storage';
import { RedditPost } from './redditService';

const ASYNC_KEYS = {
  SETTINGS: 'fgf_user_settings',
  SEEN_POSTS: 'fgf_seen_post_ids',
};

export interface AppSettings {
  notificationsEnabled: boolean;
  notificationPlatforms: string[]; // e.g. ['Steam', 'Epic Games', 'GOG'] (empty = all)
  notificationTypes: string[]; // e.g. ['Game', 'DLC', 'Beta'] (empty = all)
  backgroundIntervalMinutes: number; // e.g. 15, 30, 60
  theme: 'cartoon-classic' | 'cartoon-dark' | 'cartoon-pastel';
  redditClientId?: string; // Optional client id for authenticated requests
}

const DEFAULT_SETTINGS: AppSettings = {
  notificationsEnabled: true,
  notificationPlatforms: [],
  notificationTypes: ['Game'], // default only notify for full games
  backgroundIntervalMinutes: 30,
  theme: 'cartoon-classic',
  redditClientId: '',
};

/**
 * REDDIT OAUTH TOKEN CACHE
 */
export async function getRedditAccessToken(): Promise<string | null> {
  try {
    const token = await AsyncStorage.getItem('fgf_reddit_token');
    const expiry = await AsyncStorage.getItem('fgf_reddit_token_expiry');
    if (!token || !expiry) return null;
    
    // Check if expired (leave 60 seconds buffer)
    if (Date.now() > Number(expiry) - 60000) {
      return null;
    }
    return token;
  } catch (e) {
    return null;
  }
}

export async function saveRedditAccessToken(token: string, expiresSeconds: number): Promise<void> {
  try {
    const expiryTime = Date.now() + (expiresSeconds * 1000);
    await AsyncStorage.setItem('fgf_reddit_token', token);
    await AsyncStorage.setItem('fgf_reddit_token_expiry', String(expiryTime));
  } catch (e) {
    console.error('Error saving Reddit access token:', e);
  }
}

// Gemini API storage functions removed

/**
 * APP SETTINGS
 */
export async function getAppSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(ASYNC_KEYS.SETTINGS);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (e) {
    console.error('Error reading app settings:', e);
    return DEFAULT_SETTINGS;
  }
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(ASYNC_KEYS.SETTINGS, JSON.stringify(settings));
  } catch (e) {
    console.error('Error saving app settings:', e);
  }
}

// AI Cache functions removed

/**
 * SEEN POSTS (For Background Notification deduplication)
 */
export async function getSeenPosts(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(ASYNC_KEYS.SEEN_POSTS);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Error reading seen posts:', e);
    return [];
  }
}

export async function addSeenPosts(postIds: string[]): Promise<void> {
  try {
    const current = await getSeenPosts();
    const updated = Array.from(new Set([...current, ...postIds])).slice(-200); // keep last 200 posts
    await AsyncStorage.setItem(ASYNC_KEYS.SEEN_POSTS, JSON.stringify(updated));
  } catch (e) {
    console.error('Error adding seen posts:', e);
  }
}

/**
 * CLAIMED AND TRACKED GAMES STORAGE (For Vault Screen)
 */
export async function getClaimedPosts(): Promise<RedditPost[]> {
  try {
    const raw = await AsyncStorage.getItem('fgf_claimed_posts');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Error reading claimed posts:', e);
    return [];
  }
}

export async function addClaimedPost(post: RedditPost): Promise<void> {
  try {
    const current = await getClaimedPosts();
    if (current.some(p => p.id === post.id)) return;
    const updated = [post, ...current];
    await AsyncStorage.setItem('fgf_claimed_posts', JSON.stringify(updated));
  } catch (e) {
    console.error('Error adding claimed post:', e);
  }
}

export async function removeClaimedPost(postId: string): Promise<void> {
  try {
    const current = await getClaimedPosts();
    const updated = current.filter(p => p.id !== postId);
    await AsyncStorage.setItem('fgf_claimed_posts', JSON.stringify(updated));
  } catch (e) {
    console.error('Error removing claimed post:', e);
  }
}

export async function getTrackedPosts(): Promise<RedditPost[]> {
  try {
    const raw = await AsyncStorage.getItem('fgf_tracked_posts');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Error reading tracked posts:', e);
    return [];
  }
}

export async function toggleTrackPost(post: RedditPost): Promise<boolean> {
  try {
    const current = await getTrackedPosts();
    const exists = current.some(p => p.id === post.id);
    let updated;
    if (exists) {
      updated = current.filter(p => p.id !== post.id);
    } else {
      updated = [post, ...current];
    }
    await AsyncStorage.setItem('fgf_tracked_posts', JSON.stringify(updated));
    return !exists; // returns new tracking state
  } catch (e) {
    console.error('Error toggling track post:', e);
    return false;
  }
}

