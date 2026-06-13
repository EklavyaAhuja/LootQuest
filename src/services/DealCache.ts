import AsyncStorage from '@react-native-async-storage/async-storage';
import { Deal } from '../models/Deal';

const CACHE_PREFIX = 'fgf_deal_cache_';
const CURRENT_VERSION = 21;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export interface CacheEntry {
  version: number;
  cachedAt: number;
  deal: Deal;
  rawBotComment?: string;
}

/**
 * Retrieves a cached Deal from AsyncStorage if it is not expired and version matches.
 */
export async function getCachedDeal(postId: string): Promise<Deal | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + postId);
    if (!raw) return null;

    const entry: CacheEntry = JSON.parse(raw);
    
    // Check version compatibility
    if (entry.version !== CURRENT_VERSION) {
      console.log(`[DealCache] Cache entry version mismatch for ${postId}. Invalidating.`);
      await AsyncStorage.removeItem(CACHE_PREFIX + postId);
      return null;
    }

    // Check expiration (TTL)
    const now = Date.now();
    if (now - entry.cachedAt > CACHE_TTL) {
      console.log(`[DealCache] Cache entry expired for ${postId}. Invalidating.`);
      await AsyncStorage.removeItem(CACHE_PREFIX + postId);
      return null;
    }

    return entry.deal;
  } catch (error) {
    console.error(`[DealCache] Failed to read cache for ${postId}:`, error);
    return null;
  }
}

/**
 * Retrieves the raw cache entry, including the original bot comment if available.
 */
export async function getRawCachedEntry(postId: string): Promise<CacheEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + postId);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Stores a Deal and its raw bot comment into the cache.
 */
export async function saveCachedDeal(postId: string, deal: Deal, rawBotComment?: string): Promise<void> {
  try {
    const entry: CacheEntry = {
      version: CURRENT_VERSION,
      cachedAt: Date.now(),
      deal,
      rawBotComment,
    };
    await AsyncStorage.setItem(CACHE_PREFIX + postId, JSON.stringify(entry));
  } catch (error) {
    console.error(`[DealCache] Failed to save cache for ${postId}:`, error);
  }
}

/**
 * Removes a cached Deal.
 */
export async function removeCachedDeal(postId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_PREFIX + postId);
  } catch {}
}
