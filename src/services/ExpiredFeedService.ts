import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { redditFetch } from './redditFetch';
import { fetchWithProxy } from './redditService';

const CACHE_KEY_IDS = 'fgf_expired_post_ids_v2';
const CACHE_KEY_TITLES = 'fgf_expired_titles_v2';
const CACHE_KEY_STEAM_IDS = 'fgf_expired_steam_ids_v2';
const CACHE_TIME_KEY = 'fgf_expired_post_ids_timestamp_v2';
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes TTL for rapid live updates

export function normalizeGameTitle(title: string): string {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, '') // remove [Steam], [Epic], etc.
    .replace(/\([^)]*\)/g, '')   // remove (Game), (DLC), etc.
    .replace(/[^a-z0-9]/g, '')   // keep only alphanumeric
    .trim();
}

export function extractSteamAppIdFromString(text?: string | null): string | null {
  if (!text) return null;
  const match = text.match(/(?:steampowered\.com\/app|steam\/apps)\/(\d+)/i);
  return match && match[1] ? match[1] : null;
}

export class ExpiredFeedService {
  private expiredIds: Set<string> = new Set([
    '1x1qq4d', 't3_1x1qq4d', '1x2c8f2', '1x2a9g3', '1x1z2h4', '1x026p2', 't3_1x026p2',
    '1x8hiqh', 't3_1x8hiqh', '1x7f0yr', 't3_1x7f0yr', '1x9doou', 't3_1x9doou', '1x762p1', 't3_1x762p1',
    '1x8juzt', 't3_1x8juzt', '1x6nylf', 't3_1x6nylf', '1x99241', 't3_1x99241', '1x97z85', 't3_1x97z85'
  ]);
  private expiredTitles: Set<string> = new Set([
    'firesidefeelings', 'fireside feelings', 'fishermurs', 'slavistan', 'ponyisland', 'pony island', 'blairwitch', 'blair witch',
    'rocksmith2014', 'rocksmith 2014', 'polycraft', 'geometry dash', 'geometrydash'
  ]);
  private expiredSteamAppIds: Set<string> = new Set(['2990600', '1496730', '1319760', '405640', '1092660']);
  private lastFetched = 0;
  private isFetching = false;
  private isInitialized = false;
  private pollingTimer: any = null;
  private listeners: Set<(hasNewExpired: boolean) => void> = new Set();

  /**
   * Subscribes a listener to be notified immediately when newly expired deals/flairs are discovered.
   */
  public subscribe(listener: (hasNewExpired: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(hasNewExpired: boolean): void {
    for (const listener of this.listeners) {
      try {
        listener(hasNewExpired);
      } catch (err) {
        console.warn('[ExpiredFeedService] Listener notification error:', err);
      }
    }
  }

  /**
   * Starts continuous polling for expired flair updates.
   * Default interval: 5 minutes (300,000ms).
   * Runs only while the app is in the foreground, and skips ticks if a sync ran in the last 2 minutes.
   */
  public startContinuousPolling(
    intervalMs = 5 * 60 * 1000,
    getLastSyncTime?: () => number
  ): void {
    if (this.pollingTimer) return;
    // Initial fetch
    this.getExpiredPostIds(false).catch(() => {});

    // Periodic check every intervalMs (default 5 min)
    this.pollingTimer = setInterval(() => {
      // 1. Only while app is in foreground
      if (AppState.currentState !== 'active') {
        return;
      }

      // 2. Skip a tick if a sync ran in the last 2 minutes
      if (getLastSyncTime) {
        const lastSync = getLastSyncTime();
        if (lastSync > 0 && Date.now() - lastSync < 2 * 60 * 1000) {
          return;
        }
      }

      this.getExpiredPostIds(true).catch(() => {});
    }, intervalMs);
    console.log(`[ExpiredFeedService] Expired flair polling started (interval: ${intervalMs}ms, foreground-only)`);
  }

  /**
   * Stops continuous background polling.
   */
  public stopContinuousPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
      console.log('[ExpiredFeedService] Continuous polling stopped');
    }
  }

  /**
   * Directly records a newly discovered expired deal or post into the live expired set and storage.
   */
  public async recordExpired(id?: string | null, title?: string | null, urlOrSteamId?: string | null): Promise<void> {
    let hasNew = false;
    if (id) {
      const cleanId = String(id).replace(/^t3_/, '').trim();
      if (cleanId && !this.expiredIds.has(cleanId)) {
        this.expiredIds.add(cleanId);
        this.expiredIds.add(`t3_${cleanId}`);
        hasNew = true;
      }
    }
    if (title) {
      const norm = normalizeGameTitle(title);
      if (norm && norm.length >= 3 && !this.expiredTitles.has(norm)) {
        this.expiredTitles.add(norm);
        hasNew = true;
      }
    }
    if (urlOrSteamId) {
      const steamId = /^\d+$/.test(urlOrSteamId) ? urlOrSteamId : extractSteamAppIdFromString(urlOrSteamId);
      if (steamId && !this.expiredSteamAppIds.has(steamId)) {
        this.expiredSteamAppIds.add(steamId);
        hasNew = true;
      }
    }

    if (hasNew) {
      this.saveToStorage().catch(() => {});
      this.notifyListeners(true);
    }
  }

  private async saveToStorage(): Promise<void> {
    try {
      await Promise.all([
        AsyncStorage.setItem(CACHE_KEY_IDS, JSON.stringify(Array.from(this.expiredIds))),
        AsyncStorage.setItem(CACHE_KEY_TITLES, JSON.stringify(Array.from(this.expiredTitles))),
        AsyncStorage.setItem(CACHE_KEY_STEAM_IDS, JSON.stringify(Array.from(this.expiredSteamAppIds))),
        AsyncStorage.setItem(CACHE_TIME_KEY, String(this.lastFetched || Date.now())),
      ]);
    } catch (e) {
      console.warn('[ExpiredFeedService] Failed to persist expired data:', e);
    }
  }

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
   * Continuously fetches the expired flair feed from Reddit & Arctic Shift to instantly remove ended games.
   */
  public async getExpiredPostIds(forceRefresh = false): Promise<Set<string>> {
    await this.initialize();

    const now = Date.now();
    // Launch sync and background checks use the 60s cache; manual pull-to-sync (forceRefresh=true) bypasses it!
    if (!forceRefresh && this.expiredIds.size > 0 && now - this.lastFetched < 60000) {
      return this.expiredIds;
    }

    if (this.isFetching) {
      return this.expiredIds;
    }

    this.isFetching = true;
    const initialCount = this.expiredIds.size + this.expiredTitles.size + this.expiredSteamAppIds.size;
    const newIds: string[] = [];
    const newTitles: string[] = [];
    const newSteamIds: string[] = [];

    // Parallel Source 1: Arctic Shift live search for link_flair_text=Expired & mod removals (CORS supported, fast)
    const arcticPromise = (async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4500);
        const [expiredRes, latestRes] = await Promise.allSettled([
          fetch('https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=FreeGameFindings&link_flair_text=Expired&limit=30', {
            signal: controller.signal,
            headers: { 'Accept': 'application/json' },
          }),
          fetch('https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=FreeGameFindings&limit=30', {
            signal: controller.signal,
            headers: { 'Accept': 'application/json' },
          }),
        ]);
        clearTimeout(timer);

        const processItems = (items: any[]) => {
          if (!Array.isArray(items)) return;
          for (const item of items) {
            const isRemovedOrExpired =
              Boolean(item.removed_by_category) ||
              Boolean(item.banned_by) ||
              item.is_robot_indexable === false ||
              item.selftext === '[removed]' ||
              item.selftext === '[deleted]' ||
              item.title === '[ Removed by moderator ]' ||
              (item.link_flair_text && /expired|ended|removed|rule violation|rule break/i.test(item.link_flair_text));

            if (isRemovedOrExpired) {
              if (item.id) {
                const cleanId = String(item.id).replace(/^t3_/, '').trim();
                newIds.push(cleanId);
                newIds.push(`t3_${cleanId}`);
              }
              if (item.title) {
                const norm = normalizeGameTitle(item.title);
                if (norm && norm.length >= 3) newTitles.push(norm);
              }
              const allText = `${item.url || ''} ${item.selftext || ''}`;
              const steamId = extractSteamAppIdFromString(allText);
              if (steamId) newSteamIds.push(steamId);
            }
          }
        };

        if (expiredRes.status === 'fulfilled' && expiredRes.value.ok) {
          const json = await expiredRes.value.json();
          if (json?.data) {
            for (const item of json.data) {
              if (item.id) {
                const cleanId = String(item.id).replace(/^t3_/, '').trim();
                newIds.push(cleanId);
                newIds.push(`t3_${cleanId}`);
              }
              if (item.title) {
                const norm = normalizeGameTitle(item.title);
                if (norm && norm.length >= 3) newTitles.push(norm);
              }
              const allText = `${item.url || ''} ${item.selftext || ''}`;
              const steamId = extractSteamAppIdFromString(allText);
              if (steamId) newSteamIds.push(steamId);
            }
          }
        }

        if (latestRes.status === 'fulfilled' && latestRes.value.ok) {
          const json = await latestRes.value.json();
          if (json?.data) {
            processItems(json.data);
          }
        }
      } catch {
        // Non-fatal, handled by other sources
      }
    })();

    // Parallel Source 2: Reddit search RSS for flair:Expired
    const redditRssPromise = (async () => {
      try {
        const rssUrl = 'https://www.reddit.com/r/FreeGameFindings/search.rss?q=flair%3AExpired&sort=new&restrict_sr=on';
        const response = await (Platform.OS === 'web' ? fetchWithProxy(rssUrl, 5000) : redditFetch(rssUrl));

        if (response && response.ok) {
          const xml = await response.text();
          const entryRegex = /<(?:entry|item)[\s>]([\s\S]*?)<\/(?:entry|item)>/gi;
          let match;

          while ((match = entryRegex.exec(xml)) !== null) {
            const entry = match[1];

            // 1. Post ID
            const idMatch = entry.match(/<id>([^<]+)<\/id>/) || entry.match(/comments\/([a-z0-9]+)/i);
            if (idMatch) {
              const rawId = idMatch[1].trim();
              const cleanId = rawId.replace(/^t3_/, '').trim();
              if (cleanId) {
                newIds.push(cleanId);
                newIds.push(`t3_${cleanId}`);
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
        }
      } catch {
        // Non-fatal
      }
    })();

    try {
      await Promise.allSettled([arcticPromise, redditRssPromise]);

      newIds.forEach((id) => this.expiredIds.add(id));
      newTitles.forEach((t) => this.expiredTitles.add(t));
      newSteamIds.forEach((s) => this.expiredSteamAppIds.add(s));
      this.lastFetched = Date.now();

      const newCount = this.expiredIds.size + this.expiredTitles.size + this.expiredSteamAppIds.size;
      const hasAddedNew = newCount > initialCount;

      if (hasAddedNew || newIds.length > 0) {
        await this.saveToStorage();
        console.log(`[ExpiredFeedService] Updated expired cache: ${this.expiredIds.size} IDs, ${this.expiredTitles.size} titles, ${this.expiredSteamAppIds.size} Steam IDs.`);
        if (hasAddedNew) {
          this.notifyListeners(true);
        }
      }
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
      if (norm && norm.length >= 3) {
        if (this.expiredTitles.has(norm)) return true;
        for (const exp of this.expiredTitles) {
          if (exp.length >= 6 && (norm.includes(exp) || exp.includes(norm))) {
            return true;
          }
        }
      }
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
      deal.steamAppId ||
      extractSteamAppIdFromString(deal.url) ||
      extractSteamAppIdFromString(deal.giveawayUrl) ||
      extractSteamAppIdFromString(deal.storeUrl) ||
      extractSteamAppIdFromString(deal.steamUrl);
    if (steamId && this.expiredSteamAppIds.has(String(steamId).trim())) {
      return true;
    }

    // 4. Normalized title match (cross-matches GamerPower and Reddit identical titles)
    const normTitle = normalizeGameTitle(deal.title || deal.cleanTitle || '');
    if (normTitle && normTitle.length >= 3) {
      if (this.expiredTitles.has(normTitle)) return true;
      for (const exp of this.expiredTitles) {
        if (exp.length >= 6 && (normTitle.includes(exp) || exp.includes(normTitle))) {
          return true;
        }
      }
    }

    // 5. Object flair or isExpired / removal flags directly present
    if (
      deal.isExpired === true ||
      deal.expiryStatus === 'EXPIRED' ||
      deal.removed === true ||
      Boolean(deal.removed_by_category) ||
      Boolean(deal.banned_by) ||
      deal.is_robot_indexable === false
    ) {
      return true;
    }
    const flair = String(deal.link_flair_text || deal.flair || '').toLowerCase();
    if (
      flair.includes('expired') ||
      flair.includes('ended') ||
      flair.includes('removed') ||
      flair.includes('rule violation') ||
      flair.includes('rule break')
    ) {
      return true;
    }

    return false;
  }
}

export const expiredFeedService = new ExpiredFeedService();
