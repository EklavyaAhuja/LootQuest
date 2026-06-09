import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = 'fgf_expired_post_ids';
const CACHE_TIME_KEY = 'fgf_expired_post_ids_timestamp';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

class ExpiredFeedService {
  private expiredIds: Set<string> = new Set();
  private lastFetched = 0;
  private isFetching = false;
  private isInitialized = false;

  /**
   * Initializes the service by reading cached IDs from local storage.
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    try {
      const storedIds = await AsyncStorage.getItem(CACHE_KEY);
      const storedTime = await AsyncStorage.getItem(CACHE_TIME_KEY);

      if (storedIds && storedTime) {
        const ids: string[] = JSON.parse(storedIds);
        this.expiredIds = new Set(ids);
        this.lastFetched = Number(storedTime);
        console.log(`[ExpiredFeedService] Loaded ${this.expiredIds.size} expired post IDs from cache.`);
      }
    } catch (e) {
      console.warn('[ExpiredFeedService] Failed to load stored expired IDs:', e);
    } finally {
      this.isInitialized = true;
    }
  }

  /**
   * Fetches the expired flair RSS search feed from Reddit if expired or forced.
   */
  public async getExpiredPostIds(forceRefresh = false): Promise<Set<string>> {
    await this.initialize();
    
    const now = Date.now();
    if (!forceRefresh && this.expiredIds.size > 0 && (now - this.lastFetched < CACHE_TTL)) {
      return this.expiredIds;
    }

    if (this.isFetching) {
      return this.expiredIds;
    }

    this.isFetching = true;
    try {
      console.log('[ExpiredFeedService] Fetching expired flair RSS feed...');
      const url = `https://www.reddit.com/r/FreeGameFindings/search.rss?q=flair_name:%22Expired%22&restrict_sr=1&sort=new&t=${Date.now()}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'android:com.freegamefindings.app:v1.0.0 (by /u/freegamefindings)',
        },
      });

      if (response.ok) {
        const xml = await response.text();
        const entries = xml.split('<entry>');
        entries.shift(); // remove XML header metadata

        const ids: string[] = [];
        for (const entry of entries) {
          const idMatch = entry.match(/<id>([^<]+)<\/id>/);
          if (idMatch) {
            const cleanId = idMatch[1].replace('t3_', '').trim();
            if (cleanId) {
              ids.push(cleanId);
            }
          }
        }

        this.expiredIds = new Set(ids);
        this.lastFetched = Date.now();

        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(ids));
        await AsyncStorage.setItem(CACHE_TIME_KEY, String(this.lastFetched));
        console.log(`[ExpiredFeedService] Successfully parsed and cached ${ids.length} expired post IDs.`);
      } else {
        console.warn(`[ExpiredFeedService] Failed to fetch expired feed: status ${response.status}`);
      }
    } catch (error) {
      console.warn('[ExpiredFeedService] Error fetching expired feed:', error);
    } finally {
      this.isFetching = false;
    }

    return this.expiredIds;
  }

  /**
   * Checks if a post ID is present in the expired Set.
   */
  public isExpired(postId: string): boolean {
    return this.expiredIds.has(postId);
  }
}

export const expiredFeedService = new ExpiredFeedService();
