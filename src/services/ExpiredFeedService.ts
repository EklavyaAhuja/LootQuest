import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { redditFetch } from './redditFetch';
import { fetchWithProxy } from './redditService';

const CACHE_KEY_IDS = 'fgf_expired_post_ids_v2';
const CACHE_KEY_TITLES = 'fgf_expired_titles_v2';
const CACHE_KEY_STEAM_IDS = 'fgf_expired_steam_ids_v2';
const CACHE_TIME_KEY = 'fgf_expired_post_ids_timestamp_v2';
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes for prompt expiry updates

function normalizeGameTitle(title: string): string {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, '') // remove [Steam], [Epic], etc.
    .replace(/\([^)]*\)/g, '')   // remove (Game), (DLC), etc.
    .replace(/[^a-z0-9]/g, '')   // keep only alphanumeric
    .trim();
}

function extractSteamAppIdFromString(text?: string | null): string | null {
  if (!text) return null;
  const match = text.match(/(?:steampowered\.com\/app|steam\/apps)\/(\d+)/i);
  return match && match[1] ? match[1] : null;
}

class ExpiredFeedService {
  private expiredIds: Set<string> = new Set([
    '1x1qq4d', 't3_1x1qq4d', '1x2c8f2', '1x2a9g3', '1x1z2h4'
  ]);
  private expiredTitles: Set<string> = new Set([
    'firesidefeelings', 'fireside feelings', 'fishermurs', 'slavistan', 'ponyisland', 'pony island'
  ]);
  private expiredSteamAppIds: Set<string> = new Set(['2990600', '1496730', '1319760', '405640']);
  private lastFetched = 0;
  private isFetching = false;
  private isInitialized = false;

  /**
   * Initializes the service by reading cached IDs, titles, and Steam App IDs from storage.
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    try {
      const [storedIds, storedTitles, storedSteam, storedTime] = await Promise.all([
        AsyncStorage.getItem(CACHE_KEY_IDS),
        AsyncStorage.getItem(CACHE_KEY_TITLES),
        AsyncStorage.getItem(CACHE_KEY_STEAM_IDS),
        AsyncStorage.getItem(CACHE_TIME_KEY),
      ]);

      if (storedIds) {
        const parsed = JSON.parse(storedIds);
        if (Array.isArray(parsed)) parsed.forEach((id: string) => this.expiredIds.add(id));
      }
      if (storedTitles) {
        const parsed = JSON.parse(storedTitles);
        if (Array.isArray(parsed)) parsed.forEach((t: string) => this.expiredTitles.add(t));
      }
      if (storedSteam) {
        const parsed = JSON.parse(storedSteam);
        if (Array.isArray(parsed)) parsed.forEach((s: string) => this.expiredSteamAppIds.add(s));
      }
      if (storedTime) {
        this.lastFetched = Number(storedTime);
      }
    } catch (e) {
      console.warn('[ExpiredFeedService] Failed to load stored expired data:', e);
    } finally {
      this.isInitialized = true;
    }
  }

  /**
   * Fetches the expired flair RSS search feed from Reddit if cache expired or forced.
   */
  public async getExpiredPostIds(forceRefresh = false): Promise<Set<string>> {
    await this.initialize();

    const now = Date.now();
    if (!forceRefresh && this.expiredIds.size > 0 && now - this.lastFetched < CACHE_TTL) {
      return this.expiredIds;
    }

    if (this.isFetching) {
      return this.expiredIds;
    }

    this.isFetching = true;
    try {
      const rssUrl = 'https://old.reddit.com/r/FreeGameFindings/search.rss?q=flair:Expired&restrict_sr=1&sort=new';
      const response = await (Platform.OS === 'web' ? fetchWithProxy(rssUrl, 3000) : redditFetch(rssUrl));

      if (response && response.ok) {
        const xml = await response.text();
        const entries = xml.split('<entry>');
        entries.shift(); // remove XML header metadata

        const newIds: string[] = [];
        const newTitles: string[] = [];
        const newSteamIds: string[] = [];

        for (const entry of entries) {
          // 1. Post ID
          const idMatch = entry.match(/<id>([^<]+)<\/id>/);
          if (idMatch) {
            const rawId = idMatch[1].trim();
            const cleanId = rawId.replace(/^t3_/, '').trim();
            if (cleanId) {
              newIds.push(cleanId);
              newIds.push(rawId);
            }
          }

          // 2. Title
          const titleMatch = entry.match(/<title>([^<]+)<\/title>/);
          if (titleMatch) {
            const rawTitle = titleMatch[1].trim();
            const norm = normalizeGameTitle(rawTitle);
            if (norm && norm.length >= 3) {
              newTitles.push(norm);
            }
          }

          // 3. Steam App ID
          const steamId = extractSteamAppIdFromString(entry);
          if (steamId) {
            newSteamIds.push(steamId);
          }
        }

        // Merge rather than overwrite so static known expired items and prior cache are never lost
        newIds.forEach((id) => this.expiredIds.add(id));
        newTitles.forEach((t) => this.expiredTitles.add(t));
        newSteamIds.forEach((s) => this.expiredSteamAppIds.add(s));
        this.lastFetched = Date.now();

        await Promise.all([
          AsyncStorage.setItem(CACHE_KEY_IDS, JSON.stringify(Array.from(this.expiredIds))),
          AsyncStorage.setItem(CACHE_KEY_TITLES, JSON.stringify(Array.from(this.expiredTitles))),
          AsyncStorage.setItem(CACHE_KEY_STEAM_IDS, JSON.stringify(Array.from(this.expiredSteamAppIds))),
          AsyncStorage.setItem(CACHE_TIME_KEY, String(this.lastFetched)),
        ]);

        console.log(`[ExpiredFeedService] Updated expired cache: ${this.expiredIds.size} IDs, ${this.expiredTitles.size} titles, ${this.expiredSteamAppIds.size} Steam IDs.`);
      }
    } catch (error) {
      console.warn('[ExpiredFeedService] Expired flair fetch failed, using cached data:', error);
    } finally {
      this.isFetching = false;
    }

    return this.expiredIds;
  }

  /**
   * Checks if a post ID or Deal object is marked expired by Reddit's Expired flair feed.
   */
  public isExpired(target: any): boolean {
    if (!target) return false;

    // String check (ID, Steam App ID, or raw Title)
    if (typeof target === 'string') {
      const trimmed = target.trim();
      const cleanId = trimmed.replace(/^t3_/, '');
      if (this.expiredIds.has(trimmed) || this.expiredIds.has(cleanId)) return true;
      if (this.expiredSteamAppIds.has(trimmed)) return true;

      const norm = normalizeGameTitle(trimmed);
      if (norm && norm.length >= 3 && this.expiredTitles.has(norm)) return true;
      return false;
    }

    // Deal object check
    const deal = target;

    // 1. Direct ID match
    if (deal.id) {
      const cleanId = String(deal.id).replace(/^t3_/, '').trim();
      if (this.expiredIds.has(cleanId) || this.expiredIds.has(deal.id)) return true;
    }

    // 2. Reddit URL / Permalink comment ID match
    const commentMatch = (deal.permalink || deal.redditUrl || deal.url || '').match(/\/comments\/([a-z0-9]+)/i);
    if (commentMatch && commentMatch[1]) {
      const commentId = commentMatch[1].trim();
      if (this.expiredIds.has(commentId)) return true;
    }

    // 3. Steam App ID match (cross-matches GamerPower and Reddit)
    const steamId =
      extractSteamAppIdFromString(deal.url) ||
      extractSteamAppIdFromString(deal.giveawayUrl) ||
      extractSteamAppIdFromString(deal.storeUrl) ||
      extractSteamAppIdFromString(deal.steamUrl);
    if (steamId && this.expiredSteamAppIds.has(steamId)) {
      return true;
    }

    // 4. Normalized title match (cross-matches GamerPower and Reddit identical titles)
    const normTitle = normalizeGameTitle(deal.title || deal.cleanTitle || '');
    if (normTitle && normTitle.length >= 3 && this.expiredTitles.has(normTitle)) {
      return true;
    }

    // 5. Object flair or isExpired flag directly present
    if (deal.isExpired === true) {
      return true;
    }
    const flair = String(deal.link_flair_text || deal.flair || '').toLowerCase();
    if (flair.includes('expired') || flair.includes('ended')) {
      return true;
    }

    return false;
  }
}

export const expiredFeedService = new ExpiredFeedService();
