import { getAppSettings, getRedditAccessToken, saveRedditAccessToken } from './storageService';
import { extractTitle } from './FGFBotParser';
import { Deal } from '../models/Deal';
import { postToBasicDeal } from './DealClassifier';
import { fetchGamerPowerGiveaways } from './GamerPowerService';
import { mergeAndDeduplicateDeals, mergeAndEnrichDeals } from './filterUtils';
import { extractDirectStoreUrl, normalizeTitle } from '../utils/dealUtils';
import { redditFetch } from './redditFetch';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface RedditPost {
  id: string;
  title: string;
  url: string;
  permalink: string;
  author: string;
  createdAt: number;
  selftext: string;
  domain: string;
  platform: string;
  type: string;
  cleanTitle: string;
  isTask: boolean;
  coverImage?: string;
  isNsfw?: boolean;
}



/**
 * Extracts platform, type, clean title, and basic task heuristic from Reddit title
 */
export function parseRedditTitle(title: string, url: string, selftext: string): {
  platform: string;
  type: string;
  cleanTitle: string;
  isTask: boolean;
} {
  let platform = 'Unknown';
  let type = 'Game';
  let cleanTitle = title;

  // 1. Extract Platform: e.g. [Steam], [Epic Games], [Steam/GOG]
  const platformRegex = /^\[([^\]]+)\]/;
  const platformMatch = title.match(platformRegex);
  if (platformMatch) {
    platform = platformMatch[1].trim();
    cleanTitle = cleanTitle.replace(platformRegex, '').trim();
  }

  // 2. Extract Type: e.g. (Game), (DLC), (Beta), (Alpha)
  const typeRegex = /\(([^)]+)\)/;
  const typeMatch = cleanTitle.match(typeRegex);
  if (typeMatch) {
    type = typeMatch[1].trim();
    cleanTitle = cleanTitle.replace(typeRegex, '').trim();
  }

  // Clean up any double spaces or leading/trailing dashes/punctuation
  cleanTitle = cleanTitle
    .replace(/^[\s\-:|]+|[\s\-:|]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // 3. Determine if it requires a task (heuristics)
  const taskDomains = [
    'gleam.io',
    'giveaway.su',
    'alienwarearena.com',
    'keylol.com',
    'givee.club',
    'grabfreegame.com',
    'bananatic.com',
    'twitch.tv',
    'youtube.com',
    'twitter.com',
  ];
  
  const lowerUrl = url.toLowerCase();
  const lowerSelftext = selftext.toLowerCase();
  const lowerTitle = title.toLowerCase();

  const domainHasTask = taskDomains.some((d) => lowerUrl.includes(d));
  const textHasTaskKeywords = [
    'task', 'gleam', 'join group', 'retweet', 'follow on', 'wishlist',
    'level', 'newsletter', 'subscribe', 'complete', 'link account',
    'key left', 'keys left', 'giveaway.su'
  ].some((kw) => lowerSelftext.includes(kw) || lowerTitle.includes(kw));

  // Direct store links are usually NOT tasks unless specified
  const isDirectStore = [
    'steampowered.com',
    'epicgames.com',
    'gog.com',
    'itch.io',
    'nintendo.com',
    'playstation.com',
    'xbox.com',
    'microsoft.com'
  ].some((store) => lowerUrl.includes(store));

  const isTask = domainHasTask || (textHasTaskKeywords && !isDirectStore);

  return {
    platform,
    type,
    cleanTitle,
    isTask,
  };
}

/**
 * Helper to extract domain name from a URL
 */
function extractDomain(url: string): string {
  try {
    const matches = url.match(/^https?:\/\/([^/?#]+)(?:[/?#]|$)/i);
    return matches && matches[1] ? matches[1].replace('www.', '') : '';
  } catch (e) {
    return '';
  }
}

/**
 * Robust Hermes-safe date parser that maps date strings to Unix milliseconds.
 */
function parseDateToMs(dateStr?: string): number {
  if (!dateStr || dateStr.trim() === '' || dateStr.toUpperCase() === 'N/A') {
    return Date.now();
  }
  try {
    const t = Date.parse(dateStr);
    if (!isNaN(t)) return t;

    const withT = dateStr.replace(' ', 'T');
    const t2 = Date.parse(withT);
    if (!isNaN(t2)) return t2;

    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);
      const hour = parseInt(match[4], 10);
      const minute = parseInt(match[5], 10);
      const second = parseInt(match[6], 10);
      const utc = Date.UTC(year, month, day, hour, minute, second);
      if (!isNaN(utc)) return utc;
    }
  } catch (e) {
    console.warn('[redditService] Date parsing failed for:', dateStr, e);
  }
  return Date.now();
}

/**
 * Parses raw Reddit RSS XML into RedditPost objects
 */
function parseRedditRssXml(xmlText: string): RedditPost[] {
  const entries = xmlText.split('<entry>');
  entries.shift(); // remove feed metadata header

  const clean = (s: string) => s.replace(/^<!\[CDATA\[/gi, '').replace(/\]\]>$/gi, '').trim();

  const parsed = entries.map((entryText) => {
    // 1. Title
    const titleMatch = entryText.match(/<title>([\s\S]*?)<\/title>/);
    let title = titleMatch ? titleMatch[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : '';
    title = clean(title);

    // 2. Link
    const permalinkMatch = entryText.match(/<link\s+href="([^"]+)"/) || entryText.match(/<link\s+[^>]*href=["']([^"']+)["']/i);
    let permalink = permalinkMatch ? permalinkMatch[1].replace('old.reddit.com', 'www.reddit.com') : '';
    permalink = clean(permalink);

    // 3. ID
    const idMatch = entryText.match(/<id>([^<]+)<\/id>/);
    let fullId = idMatch ? idMatch[1] : '';
    fullId = clean(fullId);
    let id = fullId.replace('t3_', '');
    if (id.includes('/comments/')) {
      const m = id.match(/\/comments\/([a-z0-9]+)/i);
      if (m && m[1]) id = m[1];
    }

    // 4. Author
    const authorMatch = entryText.match(/<author><name>([^<]+)<\/name>/);
    let author = authorMatch ? authorMatch[1].replace('/u/', '') : 'unknown';
    author = clean(author);

    // 5. Date
    const publishedMatch = entryText.match(/<published>([^<]+)<\/published>/) || entryText.match(/<updated>([^<]+)<\/updated>/);
    const publishedRaw = publishedMatch ? publishedMatch[1] : '';
    const cleanPublished = clean(publishedRaw);
    const createdAt = cleanPublished ? new Date(cleanPublished).getTime() : Date.now();

    // 6. Content (giveaway url and selftext)
    const contentMatch = entryText.match(/<content type="html">([\s\S]*?)<\/content>/) || entryText.match(/<summary type="html">([\s\S]*?)<\/summary>/);
    let htmlContent = contentMatch ? contentMatch[1] : '';
    htmlContent = clean(htmlContent);

    const unescapedContent = htmlContent
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#32;/g, ' ');

    // Target giveaway link
    const giveawayLinkMatch = unescapedContent.match(/href="([^"]+)"[^>]*>\[link\]/);
    const giveawayUrl = giveawayLinkMatch ? giveawayLinkMatch[1].replace('old.reddit.com', 'www.reddit.com') : permalink;

    // Extract selftext from <div class="md">
    let selftext = '';
    const mdMatch = unescapedContent.match(/<div class="md">([\s\S]*?)<\/div>/);
    if (mdMatch) {
      selftext = mdMatch[1]
        .replace(/<[^>]+>/g, '') // strip HTML tags
        .trim();
    }

    const { platform, type, cleanTitle, isTask } = parseRedditTitle(
      title,
      giveawayUrl,
      selftext
    );

    // Extract media:thumbnail if present
    const mediaMatch = entryText.match(/<media:thumbnail[^>]+url="([^"]+)"/);
    const coverImage = mediaMatch ? mediaMatch[1].replace(/&amp;/g, '&') : undefined;

    // Detect NSFW category term or keywords in text
    const isNsfw = entryText.includes('term="nsfw"') || 
                   /nsfw/i.test(title) || 
                   /18\+/i.test(title) || 
                   /nsfw/i.test(selftext) || 
                   /nsfw/i.test(giveawayUrl) ||
                   /mazakon/i.test(title) ||
                   /tengoku/i.test(title) ||
                   giveawayUrl.toLowerCase().includes('dlsite');

    return {
      id,
      title,
      url: giveawayUrl,
      permalink,
      author,
      createdAt,
      selftext,
      domain: extractDomain(giveawayUrl),
      platform,
      type,
      cleanTitle,
      isTask,
      coverImage,
      isNsfw,
    };
  });

  return parsed.filter((post) => {
    if (!post.platform || post.platform.trim() === '' || post.platform.toLowerCase() === 'unknown') {
      return false;
    }
    const titleLower = post.title.toLowerCase();
    const isModOrMega =
      titleLower.includes('mod post') ||
      titleLower.includes('mega thread') ||
      titleLower.includes('weekly discussion') ||
      titleLower.includes('exiled giveaways');
    return !isModOrMega;
  });
}



/**
 * Fetch posts from the FreeGameFindings subreddit JSON feed
 * @param feedType 'hot' or 'new'
 * @param limit number of posts to fetch
 */


/**
 * Fetch posts from the FreeGameFindings subreddit JSON or RSS feed with pagination support.
 */
export async function fetchRedditPostsPaginated(
  feedType: 'hot' | 'new' = 'hot',
  limit: number = 30,
  after?: string
): Promise<{ posts: RedditPost[]; after?: string }> {
  try {
    const rssUrl = `https://old.reddit.com/r/FreeGameFindings/${feedType === 'new' ? 'new/' : ''}.rss`;
    // redditFetch handles 429 backoff – throws if rate-limited or unrecoverable
    const response = await redditFetch(rssUrl);
    const xml = await response.text();
    const posts = parseRedditRssXml(xml);
    return { posts: posts.slice(0, limit) };
  } catch (error) {
    console.warn('[RedditService] Reddit fetch failed, attempting OpenRSS fallback...', error);
    try {
      // OpenRSS fallback
      const openRssUrl = `https://openrss.org/feed/www.reddit.com/r/FreeGameFindings/${feedType === 'new' ? 'new/' : ''}`;
      const response = await fetch(openRssUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (response.ok) {
        const xml = await response.text();
        const posts = parseRedditRssXml(xml);
        console.log(`[RedditService] Successfully fetched ${posts.length} posts from OpenRSS fallback.`);
        return { posts: posts.slice(0, limit) };
      }
    } catch (fallbackError) {
      console.warn('[RedditService] OpenRSS fallback also failed:', fallbackError);
    }
    return { posts: [] };
  }
}

/**
 * Fetch posts from the FreeGameFindings subreddit JSON feed (Backwards Compatible signature)
 */
export async function fetchFreeGameFindings(
  feedType: 'hot' | 'new' = 'hot',
  limit: number = 30
): Promise<RedditPost[]> {
  try {
    const result = await fetchRedditPostsPaginated(feedType, limit);
    return result.posts;
  } catch (error) {
    console.error('[RedditService] Error in fetchFreeGameFindings wrapper:', error);
    return [];
  }
}

/**
 * Fetches merged feed of GamerPower (Primary) and Reddit (Supplemental) posts.
 */
export async function fetchMergedGameFeed(
  feedType: 'hot' | 'new' = 'new',
  limit: number = 30,
  after?: string,
  forceRefresh = false
): Promise<{ deals: Deal[]; after?: string; gpFailed?: boolean; redditFetchedLive?: boolean }> {
  let redditPosts: RedditPost[] = [];
  let redditAfterCursor: string | undefined = undefined;
  let gpDeals: Deal[] = [];
  let gpFailed = false;
  let redditFetchedLive = false;

  // 1. Fetch Reddit posts (subject to 5-minute client-side cooldown on page 1)
  try {
    const isPage1 = !after;
    let useCache = false;

    if (isPage1) {
      const lastFetchStr = await AsyncStorage.getItem('reddit_last_fetch_timestamp');
      const lastFetch = lastFetchStr ? Number(lastFetchStr) : 0;
      const now = Date.now();
      const cooldownMs = 5 * 60 * 1000; // 5 minutes

      if (!forceRefresh && now - lastFetch < cooldownMs) {
        useCache = true;
      }
    }

    if (useCache) {
      console.log('[RedditService] Reddit fetch is within 5-min cooldown. Loading from cache...');
      const cachedStr = await AsyncStorage.getItem('reddit_posts_cache');
      if (cachedStr) {
        redditPosts = JSON.parse(cachedStr);
      }
    } else {
      console.log('[RedditService] Fetching fresh Reddit posts...');
      const redditResult = await fetchRedditPostsPaginated(feedType, limit, after);
      redditPosts = redditResult.posts;
      redditAfterCursor = redditResult.after;
      
      if (isPage1) {
        redditFetchedLive = true;
      }

      if (isPage1 && redditPosts.length > 0) {
        await AsyncStorage.setItem('reddit_posts_cache', JSON.stringify(redditPosts));
        await AsyncStorage.setItem('reddit_last_fetch_timestamp', String(Date.now()));
      }
    }
  } catch (err) {
    console.warn('[RedditService] Supplemental Reddit fetch failed:', err);
    redditFetchedLive = false;
  }

  // 2. Fetch GamerPower (Always fetch to merge and enrich with Reddit deals on every page)
  try {
    gpDeals = await fetchGamerPowerGiveaways(100, undefined, undefined, forceRefresh);
  } catch (err) {
    console.warn('[RedditService] Primary GamerPower fetch failed:', err);
    gpFailed = true;
  }

  // Convert Reddit posts to basic Deals
  const redditDeals = redditPosts.map(postToBasicDeal);

  // Merge & Enrich (GamerPower first, supplemented/enriched by Reddit)
  const uniqueDeals = mergeAndEnrichDeals(gpDeals, redditDeals);

  return {
    deals: uniqueDeals,
    after: redditAfterCursor,
    gpFailed,
    redditFetchedLive,
  };
}

/**
 * Maps the raw Reddit JSON listing data to RedditPost instances
 */
function parseRedditJson(data: any): RedditPost[] {
  const children = data?.data?.children || [];

  return children
    .filter((child: any) => {
      // Exclude pinned posts (moderator announcements)
      return !child.data.pinned && !child.data.stickied;
    })
    .map((child: any) => {
      const d = child.data;
      const url = d.url || '';
      const selftext = d.selftext || '';
      const { platform, type, cleanTitle, isTask } = parseRedditTitle(
        d.title || '',
        url,
        selftext
      );

      // Extract cover image from preview or thumbnail
      let coverImage: string | undefined = undefined;
      if (d.preview?.images?.[0]?.source?.url) {
        coverImage = d.preview.images[0].source.url.replace(/&amp;/g, '&');
      } else if (d.thumbnail && d.thumbnail.startsWith('http')) {
        coverImage = d.thumbnail.replace(/&amp;/g, '&');
      }

      const isNsfw = d.over_18 ||
                     /nsfw/i.test(d.title || '') ||
                     /18\+/i.test(d.title || '') ||
                     /nsfw/i.test(selftext) ||
                     /nsfw/i.test(url) ||
                     /mazakon/i.test(d.title || '') ||
                     /tengoku/i.test(d.title || '') ||
                     url.toLowerCase().includes('dlsite');

      return {
        id: d.id,
        title: d.title || '',
        url: url,
        permalink: `https://www.reddit.com${d.permalink || ''}`,
        author: d.author || 'unknown',
        createdAt: (d.created_utc || 0) * 1000, // convert to ms
        selftext: selftext,
        domain: d.domain || '',
        platform,
        type,
        cleanTitle,
        isTask,
        coverImage,
        isNsfw,
      };
    }).filter((post: RedditPost) => {
      return post.platform && post.platform.trim() !== '' && post.platform.toLowerCase() !== 'unknown';
    });
}

/**
 * Helper to parse comments RSS XML feed to find and select the best matching FGF_Info_Bot comment.
 * Returns both the text body and any store URL found in the HTML anchor tags.
 */
function selectBestBotComment(xmlText: string, postTitle?: string): { body: string; storeUrl: string | null } | null {
  const entries = xmlText.split('<entry>');
  entries.shift(); // remove header feed metadata
  
  const candidates: Array<{ body: string; storeUrl: string | null; score: number }> = [];

  for (const entryText of entries) {
    const authorMatch = entryText.match(/<author><name>([^<]+)<\/name>/);
    const author = authorMatch ? authorMatch[1].trim() : '';
    
    if (author.toLowerCase().includes('fgf_info_bot')) {
      const contentMatch = entryText.match(/<content type="html">([\s\S]*?)<\/content>/);
      if (contentMatch) {
        // Unescape HTML entities
        const html = contentMatch[1]
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&#32;/g, ' ');

        // ── Extract store URL from <a href> BEFORE stripping tags ──
        // Reddit renders [Store Page](https://store.steampowered.com/app/...) as an anchor.
        // We grab the first Steam or GOG store href found in the HTML.
        let storeUrl: string | null = null;
        const hrefMatches = html.matchAll(/href=["']([^"']+)["']/gi);
        for (const m of hrefMatches) {
          const href = m[1];
          if (/store\.steampowered\.com\/app\/\d+/i.test(href) ||
              /www\.gog\.com\/(en\/)?game\//i.test(href)) {
            storeUrl = href;
            break;
          }
        }
          
        // Strip HTML tags to get raw markdown/text, preserving block newlines
        const withBlockNewlines = html.replace(/<\/?(p|div|br|li|tr|h[1-6]|ul|ol)[^>]*>/gi, '\n');
        const body = withBlockNewlines
          .replace(/<[^>]+>/g, '')
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .join('\n');

        // Calculate weighted score
        let score = 0;

        // Try extracting title
        const bodyTitle = extractTitle(body);
        if (bodyTitle && postTitle) {
          const cleanBodyTitle = bodyTitle.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
          const cleanPostTitle = postTitle.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

          if (cleanBodyTitle === cleanPostTitle) {
            score += 50;
          } else if (cleanPostTitle.includes(cleanBodyTitle) || cleanBodyTitle.includes(cleanPostTitle)) {
            score += 30;
          } else {
            // Title mismatch: heavily penalize so we don't accidentally pick another game's comment in same thread
            score -= 100;
          }
        }

        const lowerBody = body.toLowerCase();
        if (lowerBody.includes('price:')) score += 15;
        if (lowerBody.includes('free')) score += 10;
        if (lowerBody.includes('until')) score += 10;
        if (lowerBody.includes('reviews:') || lowerBody.includes('steamdb rating:')) score += 10;
        if (storeUrl) score += 5; // bonus for having a store link

        candidates.push({ body, storeUrl, score });
      }
    }
  }

  if (candidates.length === 0) return null;

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return { body: best.body, storeUrl: best.storeUrl };
}

export interface BotCommentResult {
  body: string;
  storeUrl: string | null;
}

/**
 * Fetches the helper bot comment (from FGF_Info_Bot) for a given post using ONLY comments RSS.
 * Returns both the cleaned text body and the extracted Steam/GOG store URL.
 */
export async function fetchBotComment(postId: string, postTitle?: string, redditUrl?: string): Promise<BotCommentResult | null> {
  let finalPostId = postId;
  // If it's a GamerPower post (starts with gp_), check if we have a merged Reddit URL
  if (postId.startsWith('gp_')) {
    if (redditUrl) {
      const match = redditUrl.match(/\/comments\/([a-z0-9]+)/i);
      if (match) {
        finalPostId = match[1];
      } else {
        return null;
      }
    } else {
      return null;
    }
  }
  
  const targetUrl = `https://old.reddit.com/comments/${finalPostId}/.rss`;
  
  try {
    console.log(`[RedditService] Fetching comments RSS for post ${postId} directly...`);
    // redditFetch handles 429 backoff – throws if rate-limited or unrecoverable
    const response = await redditFetch(targetUrl);
    const xmlText = await response.text();
    return selectBestBotComment(xmlText, postTitle);
  } catch (error) {
    console.warn(`[RedditService] Failed to fetch comments RSS for post ${postId}:`, error);
    return null;
  }
}

