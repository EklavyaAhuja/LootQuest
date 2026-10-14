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
  hasMigratedToAllEnabledV3?: boolean;
  anonymousUsageCount: boolean; // e.g. default true
}

export const DEFAULT_NOTIFICATION_PLATFORMS = [
  'Steam',
  'Epic Games',
  'GOG',
  'itch.io',
  'Ubisoft',
  'Stove',
  'Alienware Arena',
  'Prime Gaming',
  'Playstation',
  'Xbox',
];

export const DEFAULT_NOTIFICATION_TYPES = ['Game', 'DLC', 'Beta'];

const DEFAULT_SETTINGS: AppSettings = {
  notificationsEnabled: true,
  notificationPlatforms: [...DEFAULT_NOTIFICATION_PLATFORMS],
  notificationTypes: [...DEFAULT_NOTIFICATION_TYPES],
  backgroundIntervalMinutes: 30,
  theme: 'cartoon-classic',
  redditClientId: '',
  hasMigratedToAllEnabledV3: true,
  anonymousUsageCount: true,
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
    const parsed = JSON.parse(raw);
    
    let migrated = false;
    
    // Migration: Ensure all platforms and filters are checked for existing users upgrade
    if (!parsed.hasMigratedToAllEnabledV3) {
      parsed.notificationPlatforms = [...DEFAULT_SETTINGS.notificationPlatforms];
      parsed.notificationTypes = [...DEFAULT_SETTINGS.notificationTypes];
      parsed.hasMigratedToAllEnabledV3 = true;
      migrated = true;
    }
    
    // Fallback: only if notificationPlatforms was never initialized
    if (!parsed.hasOwnProperty('notificationPlatforms') || !Array.isArray(parsed.notificationPlatforms)) {
      parsed.notificationPlatforms = [...DEFAULT_SETTINGS.notificationPlatforms];
      migrated = true;
    }
    
    // Fallback: only if notificationTypes was never initialized
    if (!parsed.hasOwnProperty('notificationTypes') || !Array.isArray(parsed.notificationTypes)) {
      parsed.notificationTypes = [...DEFAULT_SETTINGS.notificationTypes];
      migrated = true;
    }
    
    const finalSettings = { ...DEFAULT_SETTINGS, ...parsed };
    if (migrated) {
      await saveAppSettings(finalSettings);
    }
    return finalSettings;
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

import { cleanDisplayTitle } from '../utils/dealUtils';

/**
 * CLAIMED AND TRACKED GAMES STORAGE (For Vault Screen)
 */
export async function getClaimedPosts(): Promise<RedditPost[]> {
  try {
    const raw = await AsyncStorage.getItem('fgf_claimed_posts');
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];

    // Deduplicate by clean title and id
    const seen = new Set<string>();
    const deduped: any[] = [];
    for (const item of list) {
      if (!item) continue;
      const cleanKey = cleanDisplayTitle(item.title || item.cleanTitle || '').toLowerCase().trim();
      const idKey = item.id ? String(item.id).trim() : '';
      const key = cleanKey || idKey;
      if (!key) continue;
      if (seen.has(key) || (idKey && seen.has(idKey))) {
        continue;
      }
      seen.add(key);
      if (idKey) seen.add(idKey);
      deduped.push(item);
    }
    if (deduped.length !== list.length) {
      AsyncStorage.setItem('fgf_claimed_posts', JSON.stringify(deduped)).catch(() => {});
    }
    return deduped;
  } catch (e) {
    console.error('Error reading claimed posts:', e);
    return [];
  }
}

export async function addClaimedPost(post: RedditPost | any): Promise<void> {
  try {
    const current = await getClaimedPosts();
    const postTitle = cleanDisplayTitle(post.title || post.cleanTitle || '').toLowerCase().trim();
    const exists = current.some((p: any) => {
      if (p.id && post.id && p.id === post.id) return true;
      const pTitle = cleanDisplayTitle(p.title || p.cleanTitle || '').toLowerCase().trim();
      return postTitle && pTitle && pTitle === postTitle;
    });
    if (exists) return;
    const updated = [post, ...current];
    await AsyncStorage.setItem('fgf_claimed_posts', JSON.stringify(updated));
  } catch (e) {
    console.error('Error adding claimed post:', e);
  }
}

export async function removeClaimedPost(postId: string, title?: string): Promise<void> {
  try {
    const current = await getClaimedPosts();
    const cleanTargetTitle = (title || '').toLowerCase().trim();
    const updated = current.filter((p: any) => {
      if (p.id && postId && p.id === postId) return false;
      if (cleanTargetTitle && (p.title || p.cleanTitle || '').toLowerCase().trim() === cleanTargetTitle) return false;
      return true;
    });
    await AsyncStorage.setItem('fgf_claimed_posts', JSON.stringify(updated));
  } catch (e) {
    console.error('Error removing claimed post:', e);
  }
}

export async function updateClaimedPostDetails(postId: string, updates: { image?: string; worth?: string }): Promise<void> {
  try {
    const current = await getClaimedPosts();
    let hasChanges = false;
    const updated = current.map((p: any) => {
      if (p.id === postId) {
        hasChanges = true;
        return {
          ...p,
          ...(updates.image && updates.image !== 'placeholder' ? { image: updates.image, coverImage: updates.image } : {}),
          ...(updates.worth ? { worth: updates.worth } : {}),
        };
      }
      return p;
    });
    if (hasChanges) {
      await AsyncStorage.setItem('fgf_claimed_posts', JSON.stringify(updated));
    }
  } catch (e) {
    console.error('Error updating claimed post details:', e);
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

