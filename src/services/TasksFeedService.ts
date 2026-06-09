import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = 'fgf_tasks_post_ids';
const CACHE_TIME_KEY = 'fgf_tasks_post_ids_timestamp';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

class TasksFeedService {
  private tasksIds: Set<string> = new Set();
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
        this.tasksIds = new Set(ids);
        this.lastFetched = Number(storedTime);
        console.log(`[TasksFeedService] Loaded ${this.tasksIds.size} tasks post IDs from cache.`);
      }
    } catch (e) {
      console.warn('[TasksFeedService] Failed to load stored tasks IDs:', e);
    } finally {
      this.isInitialized = true;
    }
  }

  /**
   * Fetches the Tasks flair RSS search feed from Reddit if expired or forced.
   */
  public async getTasksPostIds(forceRefresh = false): Promise<Set<string>> {
    await this.initialize();
    
    const now = Date.now();
    if (!forceRefresh && this.tasksIds.size > 0 && (now - this.lastFetched < CACHE_TTL)) {
      return this.tasksIds;
    }

    if (this.isFetching) {
      return this.tasksIds;
    }

    this.isFetching = true;
    try {
      console.log('[TasksFeedService] Fetching tasks flair RSS feed...');
      const url = `https://www.reddit.com/r/FreeGameFindings/search.rss?q=flair_name:%22Tasks%22&restrict_sr=1&sort=new&t=${Date.now()}`;
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

        this.tasksIds = new Set(ids);
        this.lastFetched = Date.now();

        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(ids));
        await AsyncStorage.setItem(CACHE_TIME_KEY, String(this.lastFetched));
        console.log(`[TasksFeedService] Successfully parsed and cached ${ids.length} tasks post IDs.`);
      } else {
        console.warn(`[TasksFeedService] Failed to fetch tasks feed: status ${response.status}`);
      }
    } catch (error) {
      console.warn('[TasksFeedService] Error fetching tasks feed:', error);
    } finally {
      this.isFetching = false;
    }

    return this.tasksIds;
  }

  /**
   * Checks if a post ID is present in the tasks Set.
   */
  public isTask(postId: string): boolean {
    return this.tasksIds.has(postId);
  }
}

export const tasksFeedService = new TasksFeedService();
