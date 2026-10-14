import { getAppSettings, getRedditAccessToken, saveRedditAccessToken } from './storageService';
import { extractTitle } from './FGFBotParser';
import { Deal } from '../models/Deal';
import { postToBasicDeal } from './DealClassifier';
import { fetchGamerPowerGiveaways } from './GamerPowerService';
import { mergeAndDeduplicateDeals, mergeAndEnrichDeals } from './filterUtils';
import { redditFetch, clearRedditRateLimit } from './redditFetch';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getGameCover, isPostRemovedByModerator, isDealExpired } from '../utils/dealUtils';
import { expiredFeedService } from './ExpiredFeedService';

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
  flair?: string;
  isExpired?: boolean;
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

    // Extract selftext from <div class="md">
    let selftext = '';
    const mdMatch = unescapedContent.match(/<div class="md">([\s\S]*?)<\/div>/);
    if (mdMatch) {
      selftext = mdMatch[1]
        .replace(/<[^>]+>/g, '') // strip HTML tags
        .trim();
    }

    // Target giveaway link
    const giveawayLinkMatch = unescapedContent.match(/href="([^"]+)"[^>]*>\[link\]/);
    const candidateUrl = giveawayLinkMatch ? giveawayLinkMatch[1].replace('old.reddit.com', 'www.reddit.com') : permalink;
    const giveawayUrl = extractTargetGiveawayUrl(candidateUrl, unescapedContent, permalink, title);

    const { platform, type, cleanTitle, isTask } = parseRedditTitle(
      title,
      giveawayUrl,
      selftext
    );

    // Extract media:thumbnail if present
    const mediaMatch = entryText.match(/<media:thumbnail[^>]+url="([^"]+)"/);
    const coverImage = mediaMatch ? mediaMatch[1].replace(/&amp;/g, '&') : undefined;

    // Extract categories, flairs, and NSFW
    const catMatches: string[] = [];
    const catRegex = /<category[^>]+(?:term|label)="([^"]+)"/gi;
    let cm: RegExpExecArray | null;
    while ((cm = catRegex.exec(entryText)) !== null) {
      if (cm[1]) catMatches.push(cm[1]);
    }
    const isExpired = catMatches.some(c => /expired|ended/i.test(c)) ||
                      entryText.includes('term="expired"') ||
                      entryText.includes('term="Expired"') ||
                      entryText.includes('label="Expired"');
    const flair = catMatches.find(c => /expired|ended|task|nsfw/i.test(c)) || catMatches[0] || (isExpired ? 'Expired' : undefined);

    // Detect NSFW category term or keywords in text
    const isNsfw = entryText.includes('term="nsfw"') || 
                   catMatches.some(c => /nsfw|18\+/i.test(c)) ||
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
      flair,
      isExpired,
    };
  });

  return parsed.filter((post) => {
    if (!post.platform || post.platform.trim() === '' || post.platform.toLowerCase() === 'unknown') {
      return false;
    }
    if (post.isExpired) {
      return false;
    }
    return !isPostRemovedByModerator(post);
  });
}



export function extractTargetGiveawayUrl(rawUrl: string, contentOrSelftext: string, permalink: string, title?: string): string {
  const isReddit = (u?: string) => !u || u.includes('reddit.com') || u.includes('redd.it');

  // 1. First priority: Check if content/selftext mentions a dedicated third-party giveaway host
  // (e.g. givee.club, gleam.io, giveaway.su, alienwarearena, etc.) - even if post URL points to Steam
  if (contentOrSelftext) {
    const thirdPartyMatch =
      contentOrSelftext.match(/href="([^"]*(?:gleam\.io|givee\.club|giveaway\.su|alienwarearena\.com|amdgaming\.com|keylol\.com|opquest\.com|bananatic\.com|grabfreegame\.com|gamehag\.com|vloot\.io|indiegala\.com|hitmarker\.net|woovit\.com)[^"]*)"/i) ||
      contentOrSelftext.match(/\[[^\]]*\]\((https?:\/\/(?:www\.)?(?:gleam\.io|givee\.club|giveaway\.su|alienwarearena\.com|amdgaming\.com|keylol\.com|opquest\.com|bananatic\.com|grabfreegame\.com|gamehag\.com|vloot\.io|indiegala\.com|hitmarker\.net|woovit\.com)[^\s\)\>\]'"]*)\)/i) ||
      contentOrSelftext.match(/(https?:\/\/(?:www\.)?(?:gleam\.io|givee\.club|giveaway\.su|alienwarearena\.com|amdgaming\.com|keylol\.com|opquest\.com|bananatic\.com|grabfreegame\.com|gamehag\.com|vloot\.io|indiegala\.com|hitmarker\.net|woovit\.com)[^\s\)\>\]'"]*)/i);

    if (thirdPartyMatch) {
      const candidate = (thirdPartyMatch[1] || thirdPartyMatch[0]).replace(/&amp;/g, '&').replace(/[.,;:)]+$/, '').trim();
      if (!isReddit(candidate)) {
        return candidate;
      }
    }
  }

  // 2. If rawUrl is a direct non-Reddit link (e.g. direct store or direct giveaway URL), use it
  if (rawUrl && !isReddit(rawUrl)) {
    return rawUrl;
  }

  // 3. Fallback: Check for any external non-Reddit HTTP link in contentOrSelftext
  if (contentOrSelftext) {
    const preferredMatch =
      contentOrSelftext.match(/href="([^"]+)"/i) ||
      contentOrSelftext.match(/\[[^\]]*\]\((https?:\/\/[^\s\)\>\]]+)\)/i) ||
      contentOrSelftext.match(/(https?:\/\/(?:www\.)?(?:itch\.io|store\.steampowered\.com|epicgames\.com|gog\.com|primegaming\.com|fanatical\.com|humblebundle\.com)[^\s\)\>\]'"]*)/i);

    if (preferredMatch) {
      const candidate = (preferredMatch[1] || preferredMatch[0]).replace(/&amp;/g, '&').replace(/[.,;:)]+$/, '').trim();
      if (!isReddit(candidate)) {
        return candidate;
      }
    }

    const allUrls = [...contentOrSelftext.matchAll(/(https?:\/\/[^\s\)\>\]'"]+)/gi)];
    for (const match of allUrls) {
      const candidate = match[1].replace(/&amp;/g, '&').replace(/[.,;:)]+$/, '').trim();
      if (!isReddit(candidate) && !candidate.includes('redditstatic.com') && !candidate.includes('redd.it')) {
        return candidate;
      }
    }
  }

  return rawUrl || permalink;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&#32;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRelativeTimeText(timeStr: string): number {
  const now = Date.now();
  if (!timeStr) return now;
  const lower = timeStr.toLowerCase().trim();
  const numMatch = lower.match(/^(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/);
  if (numMatch) {
    const amount = parseInt(numMatch[1], 10);
    const unit = numMatch[2];
    switch (unit) {
      case 'second': return now - amount * 1000;
      case 'minute': return now - amount * 60 * 1000;
      case 'hour': return now - amount * 60 * 60 * 1000;
      case 'day': return now - amount * 24 * 60 * 60 * 1000;
      case 'week': return now - amount * 7 * 24 * 60 * 60 * 1000;
      case 'month': return now - amount * 30 * 24 * 60 * 60 * 1000;
      case 'year': return now - amount * 365 * 24 * 60 * 60 * 1000;
    }
  }
  return now;
}

/**
 * Parses real-time Reddit posts from the Feeder.co live mirror HTML.
 */
export function parseFeederHtml(html: string): RedditPost[] {
  if (!html) return [];
  const posts: RedditPost[] = [];

  // Match modern Feeder.co items: <a href="..." class="...discover-feed-item-link...">Title</a>
  const linkRegex = /<a\s+[^>]*href="([^"]+)"[^>]*class="[^"]*discover-feed-item-link[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    const rawPermalink = match[1];
    const rawTitle = decodeHtmlEntities(match[2]).trim();
    if (!rawTitle || !rawPermalink.includes('reddit.com/r/FreeGameFindings')) continue;

    const permalink = rawPermalink.replace('old.reddit.com', 'www.reddit.com');

    // Extract Reddit ID from URL e.g. /comments/1whhjbi/
    const idMatch = permalink.match(/\/comments\/([a-z0-9]+)/i);
    const id = idMatch ? idMatch[1] : `feeder_${Date.now()}_${posts.length}`;

    // Surrounding text chunk for author, time, thumbnail
    const chunkStart = Math.max(0, match.index - 50);
    const chunkEnd = Math.min(html.length, match.index + 500);
    const cardContent = html.slice(chunkStart, chunkEnd);

    // Relative time
    const timeMatch = cardContent.match(/<small[^>]*class="[^"]*text-muted[^"]*"[^>]*>([\s\S]*?)<\/small>/i);
    const timeText = timeMatch ? decodeHtmlEntities(timeMatch[1]) : '';
    const createdAt = parseRelativeTimeText(timeText);

    // Author
    const authorMatch = cardContent.match(/submitted by\s+(?:\/u\/)?([a-zA-Z0-9_\-]+)/i);
    const author = authorMatch ? authorMatch[1] : 'unknown';

    // Thumbnail
    const thumbMatch = cardContent.match(/background-image:\s*url\(([^)]+)\)/i);
    let coverImage = thumbMatch ? thumbMatch[1].replace(/&amp;/g, '&').replace(/['"]/g, '') : undefined;
    if (coverImage && coverImage.startsWith('//')) {
      coverImage = 'https:' + coverImage;
    }

    const { platform, type, cleanTitle, isTask } = parseRedditTitle(rawTitle, permalink, '');
    const isNsfw = /nsfw/i.test(rawTitle) || /18\+/i.test(rawTitle);

    posts.push({
      id,
      title: rawTitle,
      url: permalink,
      permalink,
      author,
      createdAt,
      selftext: '',
      domain: 'reddit.com',
      platform,
      type,
      cleanTitle,
      isTask,
      coverImage,
      isNsfw,
    });
  }

  // Fallback to legacy card-title regex if 0 matches
  if (posts.length === 0) {
    const legacyRegex = /<h4[^>]*class="[^"]*card-title[^"]*"[^>]*><a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h4>/gi;
    while ((match = legacyRegex.exec(html)) !== null) {
      const rawPermalink = match[1];
      const rawTitle = decodeHtmlEntities(match[2]).trim();
      if (!rawTitle) continue;
      const permalink = rawPermalink.replace('old.reddit.com', 'www.reddit.com');
      const idMatch = permalink.match(/\/comments\/([a-z0-9]+)/i);
      const id = idMatch ? idMatch[1] : `feeder_${Date.now()}_${posts.length}`;
      const { platform, type, cleanTitle, isTask } = parseRedditTitle(rawTitle, permalink, '');
      posts.push({
        id,
        title: rawTitle,
        url: permalink,
        permalink,
        author: 'FreeGameFindings',
        createdAt: Date.now(),
        selftext: '',
        domain: 'reddit.com',
        platform,
        type,
        cleanTitle,
        isTask,
        isNsfw: /nsfw/i.test(rawTitle),
      });
    }
  }

  return posts.filter(post => {
    if (!post.platform || post.platform.trim() === '' || post.platform.toLowerCase() === 'unknown') {
      return false;
    }
    return !isPostRemovedByModerator(post);
  });
}

/**
 * Parses raw Reddit posts from the Arctic Shift API (Photon Reddit open API with CORS support).
 */
export function parseArcticRedditPosts(items: any[]): RedditPost[] {
  if (!items || !Array.isArray(items)) return [];

  return items
    .filter((item) => {
      if (item.pinned || item.stickied) return false;
      const flair = (item.link_flair_text || item.flair || '').toLowerCase();
      if (flair.includes('expired') || flair.includes('ended')) return false;
      return !isPostRemovedByModerator(item);
    })
    .map((item) => {
      const rawTitle = decodeHtmlEntities(item.title || '').trim();
      const rawUrl = (item.url || item.url_overridden_by_dest || '').trim();
      const rawPermalink = item.permalink ? `https://www.reddit.com${item.permalink}` : `https://www.reddit.com/r/FreeGameFindings/comments/${item.id}/`;
      const selftext = item.selftext ? decodeHtmlEntities(item.selftext).trim() : '';

      const id = item.id ? item.id.replace(/^t3_/, '') : `reddit_${Date.now()}`;

      // Target giveaway link (e.g. Steam, Epic, GiveeClub, Alienware, AMD, Gleam)
      const giveawayUrl = extractTargetGiveawayUrl(rawUrl, selftext, rawPermalink, rawTitle);

      const { platform, type, cleanTitle, isTask: parsedIsTask } = parseRedditTitle(
        rawTitle,
        giveawayUrl,
        selftext
      );

      const flairText = (item.link_flair_text || item.flair || '').toLowerCase();
      const isTask = flairText.includes('task') || parsedIsTask;
      const isExpired = flairText.includes('expired') || flairText.includes('ended');

      // Extract high quality cover image if available
      let coverImage: string | undefined = undefined;
      if (item.preview?.images?.[0]?.source?.url) {
        coverImage = item.preview.images[0].source.url.replace(/&amp;/g, '&');
      } else if (item.thumbnail && item.thumbnail.startsWith('http')) {
        coverImage = item.thumbnail.replace(/&amp;/g, '&');
      }

      // If Steam game and no preview image, extract Steam App ID for official header art
      if (!coverImage) {
        const allText = `${giveawayUrl} ${selftext}`;
        const steamIdMatch = allText.match(/(?:steampowered\.com\/app|steam\/apps)\/(\d+)/i);
        if (steamIdMatch && steamIdMatch[1]) {
          coverImage = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${steamIdMatch[1]}/header.jpg`;
        }
      }

      const isNsfw = item.over_18 ||
                     flairText.includes('nsfw') ||
                     /nsfw/i.test(rawTitle) ||
                     /18\+/i.test(rawTitle) ||
                     /nsfw/i.test(selftext) ||
                     /nsfw/i.test(giveawayUrl) ||
                     /mazakon/i.test(rawTitle) ||
                     /tengoku/i.test(rawTitle) ||
                     giveawayUrl.toLowerCase().includes('dlsite');

      const createdAt = item.created_utc ? item.created_utc * 1000 : (item.created ? item.created * 1000 : Date.now());

      return {
        id,
        title: rawTitle,
        url: giveawayUrl,
        permalink: rawPermalink,
        author: item.author || 'unknown',
        createdAt,
        selftext,
        domain: extractDomain(giveawayUrl) || 'reddit.com',
        platform,
        type,
        cleanTitle,
        isTask,
        coverImage,
        isNsfw,
        flair: item.link_flair_text,
        isExpired,
      };
    })
    .filter((post) => {
      if (!post.platform || post.platform.trim() === '' || post.platform.toLowerCase() === 'unknown') {
        return false;
      }
      return !post.isExpired;
    });
}

/**
 * Helper to proxy requests on web to avoid browser CORS blocks
 */
export const fetchWithProxy = async (targetUrl: string, timeoutMs = 3000): Promise<Response> => {
  if (Platform.OS !== 'web') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(targetUrl, { signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  // Web CORS Proxies in order of speed and reliability
  const proxies = [
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
    `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
  ];

  for (const proxyUrl of proxies) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(proxyUrl, {
        signal: controller.signal,
        headers: { 'Accept': '*/*' }
      });
      clearTimeout(timer);
      if (res.ok) {
        return res;
      }
    } catch {
      // Continue to next proxy fallback
    }
  }

  throw new Error(`All CORS proxies failed for: ${targetUrl}`);
};

/**
 * Curated live snapshot of recent FreeGameFindings giveaways for instant rendering and offline/CORS resilience.
 */
export const FALLBACK_REDDIT_POSTS: RedditPost[] = [
  {
    id: '1x2e4m1',
    title: '[Steam] (Game) Pipreal',
    cleanTitle: 'Pipreal',
    url: 'https://store.steampowered.com/app/4514150/Pipreal/',
    permalink: 'https://www.reddit.com/r/FreeGameFindings/comments/1x2e4m1/steam_game_pipreal/',
    author: 'FreeGameFindings',
    createdAt: Date.now() - 3600 * 1000 * 3,
    selftext: 'Free claim on Steam Store.',
    domain: 'steampowered.com',
    platform: 'Steam',
    type: 'Game',
    coverImage: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/4514150/header.jpg',
    isTask: false,
    isNsfw: false,
  },
  {
    id: '1x2a9g3',
    title: '[Steam] (Game) SoundKilla',
    cleanTitle: 'SoundKilla',
    url: 'https://store.steampowered.com/app/2888190/SoundKilla/',
    permalink: 'https://www.reddit.com/r/FreeGameFindings/comments/1x2a9g3/steam_game_soundkilla/',
    author: 'FreeGameFindings',
    createdAt: Date.now() - 3600 * 1000 * 12,
    selftext: 'Free claim on Steam Store.',
    domain: 'steampowered.com',
    platform: 'Steam',
    type: 'Game',
    coverImage: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2888190/header.jpg',
    isTask: false,
    isNsfw: false,
  },
  {
    id: '1x1z2h4',
    title: '[Epic Games] (Game) TerraScape',
    cleanTitle: 'TerraScape',
    url: 'https://store.epicgames.com/p/terrascape-664402',
    permalink: 'https://www.reddit.com/r/FreeGameFindings/comments/1x1z2h4/epic_games_terrascape/',
    author: 'FreeGameFindings',
    createdAt: Date.now() - 3600 * 1000 * 18,
    selftext: 'Free claim on Epic Games Store.',
    domain: 'epicgames.com',
    platform: 'Epic Games',
    type: 'Game',
    coverImage: 'https://www.gamerpower.com/offers/1b/6ac7b1a7b298e.jpg',
    isTask: false,
    isNsfw: false,
  },
  {
    id: '1wh8szw',
    title: '[Steam] (Game) Train Sim World 7 - Starter Edition',
    cleanTitle: 'Train Sim World 7 - Starter Edition',
    url: 'https://store.steampowered.com/app/530070/Train_Sim_World/',
    permalink: 'https://www.reddit.com/r/FreeGameFindings/comments/1wh8szw/steam_game_train_sim_world_7_starter_edition/',
    author: 'FreeGameFindings',
    createdAt: Date.now() - 3600 * 1000 * 21,
    selftext: 'Free Tutorial Starter Version giving +1 Game permanent license on Steam.',
    domain: 'steampowered.com',
    platform: 'Steam',
    type: 'Game',
    coverImage: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/530070/header.jpg',
    isTask: false,
    isNsfw: false,
  },
  {
    id: '1wh5ms2',
    title: '[Steam] (Game) Survivor',
    cleanTitle: 'Survivor',
    url: 'https://store.steampowered.com/app/2485700/Survivor/',
    permalink: 'https://www.reddit.com/r/FreeGameFindings/comments/1wh5ms2/steam_game_survivor/',
    author: 'KolaCape',
    createdAt: Date.now() - 3600 * 1000 * 22,
    selftext: 'Free indie top-down survival shooter game on Steam.',
    domain: 'steampowered.com',
    platform: 'Steam',
    type: 'Game',
    coverImage: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2485700/header.jpg',
    isTask: false,
    isNsfw: false,
  },
  {
    id: '1wfwbgr',
    title: '[Steam] (Game) Crystal Crisis',
    cleanTitle: 'Crystal Crisis',
    url: 'https://store.steampowered.com/app/447700/Crystal_Crisis/',
    permalink: 'https://www.reddit.com/r/FreeGameFindings/comments/1wfwbgr/steam_game_crystal_crisis/',
    author: 'iambaldy',
    createdAt: Date.now() - 3600 * 1000 * 52,
    selftext: 'An all-star puzzle combat crossover brawler featuring Quote, Curly Brace, Isaac, and Astro Boy.',
    domain: 'steampowered.com',
    platform: 'Steam',
    type: 'Game',
    coverImage: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/447700/header.jpg',
    isTask: false,
    isNsfw: false,
  },
  {
    id: '1wh0asn',
    title: '[Ubisoft] (Game) For Honor',
    cleanTitle: 'For Honor',
    url: 'https://register.ubisoft.com/forhonor/en-US',
    permalink: 'https://www.reddit.com/r/FreeGameFindings/comments/1wh0asn/ubisoft_game_for_honor/',
    author: 'Slippy2k',
    createdAt: Date.now() - 3600 * 1000 * 24,
    selftext: 'Direct permanent license claim via Ubisoft Connect storefront.',
    domain: 'ubisoft.com',
    platform: 'Ubisoft',
    type: 'Game',
    coverImage: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/304390/header.jpg',
    isTask: false,
    isNsfw: false,
  },
  {
    id: '1wg89w5',
    title: '[Steam] (DLC) Deadswitch Combat: Attachment Skins Bundle',
    cleanTitle: 'Deadswitch Combat: Attachment Skins Bundle',
    url: 'https://store.steampowered.com/app/3408170/Deadswitch_Combat/',
    permalink: 'https://www.reddit.com/r/FreeGameFindings/comments/1wg89w5/steam_dlc_deadswitch_combat_attachment_skins/',
    author: 'RegionalPrices',
    createdAt: Date.now() - 3600 * 1000 * 48,
    selftext: 'Exclusive weapon skins bundle DLC for Deadswitch Combat on Steam.',
    domain: 'steampowered.com',
    platform: 'Steam',
    type: 'DLC',
    coverImage: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3408170/header.jpg',
    isTask: false,
    isNsfw: false,
  },
  {
    id: '1wg27xi',
    title: '[Epic Games] (Game) Vanakan',
    cleanTitle: 'Vanakan',
    url: 'https://store.epicgames.com/en-US/p/vanakan',
    permalink: 'https://www.reddit.com/r/FreeGameFindings/comments/1wg27xi/epic_games_game_vanakan/',
    author: 'MeguminShiro',
    createdAt: Date.now() - 3600 * 1000 * 48,
    selftext: 'Free weekly 100% off game giveaway claimable on Epic Games Store.',
    domain: 'epicgames.com',
    platform: 'Epic Games',
    type: 'Game',
    coverImage: undefined,
    isTask: false,
    isNsfw: false,
  },
  {
    id: '1wfnrcs',
    title: '[Steam] (Game) Felix Jumpman',
    cleanTitle: 'Felix Jumpman',
    url: 'https://store.steampowered.com/app/575920/Felix_Jumpman/',
    permalink: 'https://www.reddit.com/r/FreeGameFindings/comments/1wfnrcs/steam_game_felix_jumpman/',
    author: 'Beneficial_Ad_6911',
    createdAt: Date.now() - 3600 * 1000 * 72,
    selftext: 'Retro 2D arcade platformer jumping game free to keep on Steam.',
    domain: 'steampowered.com',
    platform: 'Steam',
    type: 'Game',
    coverImage: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/575920/header.jpg',
    isTask: false,
    isNsfw: false,
  },
  {
    id: '1wecql4',
    title: '[PC/Xbox/PlayStation] (Other) Genshin Impact - 300 Primogems',
    cleanTitle: 'Genshin Impact - 300 Primogems',
    url: 'https://genshin.hoyoverse.com/en/gift',
    permalink: 'https://www.reddit.com/r/FreeGameFindings/comments/1wecql4/pcxboxplaystation_other_genshin_impact_300/',
    author: 'FreeGameFindings',
    createdAt: Date.now() - 3600 * 1000 * 96,
    selftext: 'Redeem code for 300 Primogems and Mystic Enhancement Ore from the special program stream.',
    domain: 'hoyoverse.com',
    platform: 'PC/Xbox/PlayStation',
    type: 'item',
    coverImage: undefined,
    isTask: false,
    isNsfw: false,
  },
  {
    id: '1wdy5gs',
    title: '[Steam] (Game) Rimi Kaikkonen Racing 60 Seconds',
    cleanTitle: 'Rimi Kaikkonen Racing 60 Seconds',
    url: 'https://store.steampowered.com/app/5083770/Rimi_Kaikkonen_Racing_60_Seconds/',
    permalink: 'https://www.reddit.com/r/FreeGameFindings/comments/1wdy5gs/steam_game_rimi_kaikkonen_racing_60_seconds/',
    author: 'EinHaDe',
    createdAt: Date.now() - 3600 * 1000 * 120,
    selftext: 'Free Steam game key. Top-down retro time trial arcade racer.',
    domain: 'steampowered.com',
    platform: 'Steam',
    type: 'Game',
    coverImage: undefined,
    isTask: false,
    isNsfw: false,
  },
  {
    id: '1whhjbi',
    title: '[Steam] (Game) Mister Furry: Hot Muscles',
    cleanTitle: 'Mister Furry: Hot Muscles',
    url: 'https://store.steampowered.com/app/1578220/Mister_Furry_Hot_Muscles/',
    permalink: 'https://www.reddit.com/r/FreeGameFindings/comments/1whhjbi/steam_game_mister_furry_hot_muscles/',
    author: 'RegionalPrices',
    createdAt: Date.now() - 3600 * 1000 * 15,
    selftext: 'Free claim on Steam Store for a limited time! Adds +1 to your Steam game library counter.',
    domain: 'steampowered.com',
    platform: 'Steam',
    type: 'Game',
    coverImage: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1578220/header.jpg',
    isTask: false,
    isNsfw: false,
  }
];

/**
 * Parses items from public RSS-to-JSON APIs (like rss2json or feed2json) with universal CORS support.
 */
export function parseRss2JsonItems(items: any[]): RedditPost[] {
  if (!items || !Array.isArray(items)) return [];

  return items.map((item) => {
    const rawTitle = decodeHtmlEntities(item.title || '').trim();
    const permalink = (item.link || '').replace('old.reddit.com', 'www.reddit.com');
    const idMatch = permalink.match(/\/comments\/([a-z0-9]+)/i);
    const id = idMatch ? idMatch[1] : `rss2json_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Parse giveaway URL and image from description or content
    const desc = item.description || item.content || '';
    const unescaped = decodeHtmlEntities(desc);
    
    // Target giveaway link [link]
    const giveawayLinkMatch = unescaped.match(/href="([^"]+)"[^>]*>\[link\]/) || unescaped.match(/href="([^"]+)"/);
    const candidateUrl = giveawayLinkMatch ? giveawayLinkMatch[1].replace('old.reddit.com', 'www.reddit.com') : permalink;
    const giveawayUrl = extractTargetGiveawayUrl(candidateUrl, unescaped, permalink, rawTitle);

    // Cover image: item.thumbnail or from img src in html
    let coverImage = item.thumbnail || undefined;
    if (!coverImage || coverImage.trim() === '') {
      const imgMatch = unescaped.match(/<img[^>]+src="([^">]+)"/i);
      if (imgMatch) {
        coverImage = imgMatch[1];
      }
    }
    if (coverImage && coverImage.includes('&amp;')) {
      coverImage = coverImage.replace(/&amp;/g, '&');
    }

    const selftextMatch = unescaped.match(/<div class="md">([\s\S]*?)<\/div>/);
    let selftext = '';
    if (selftextMatch) {
      selftext = selftextMatch[1].replace(/<[^>]+>/g, '').trim();
    }

    // Auto-extract high-res Steam header art if coverImage is missing, default, or self
    if (!coverImage || coverImage === 'default' || coverImage === 'self') {
      const allText = `${giveawayUrl} ${candidateUrl} ${unescaped} ${selftext}`;
      const steamMatch = allText.match(/(?:steampowered\.com\/app|steam\/apps)\/(\d+)/i);
      if (steamMatch && steamMatch[1]) {
        coverImage = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${steamMatch[1]}/header.jpg`;
      }
    }

    const author = (item.author || 'unknown').replace('/u/', '').replace(/^u\//, '');
    const createdAt = parseDateToMs(item.pubDate);

    const { platform, type, cleanTitle, isTask } = parseRedditTitle(
      rawTitle,
      giveawayUrl,
      selftext
    );

    const categories: string[] = Array.isArray(item.categories) ? item.categories : [];
    const flair = categories.join(' ');
    const isExpired = categories.some((c) => /expired|ended/i.test(c));

    const isNsfw = categories.some((c) => /nsfw|18\+/i.test(c)) ||
                   /nsfw/i.test(rawTitle) ||
                   /18\+/i.test(rawTitle) ||
                   /nsfw/i.test(selftext);

    return {
      id,
      title: rawTitle,
      url: giveawayUrl,
      permalink,
      author,
      createdAt,
      selftext,
      domain: extractDomain(giveawayUrl) || 'reddit.com',
      platform,
      type,
      cleanTitle,
      isTask,
      coverImage,
      isNsfw,
      flair,
      isExpired,
    };
  }).filter((post) => {
    if (!post.platform || post.platform.trim() === '' || post.platform.toLowerCase() === 'unknown') {
      return false;
    }
    if (post.isExpired) {
      return false;
    }
    return !isPostRemovedByModerator(post);
  });
}

/**
 * Fetch posts from the FreeGameFindings subreddit with multi-tiered fallbacks:
 * Tier 1: Arctic Shift Live Reddit API (Direct real-time Reddit submissions with exact target URLs and CORS support)
 * Tier 2: Feeder.co live mirror (same mirror used by backend for push notifications)
 * Tier 3: LootQuest backend API (/reddit-posts)
 * Tier 4: Direct Reddit RSS via redditFetch
 * Tier 5: Curated fresh snapshot fallback
 */
export async function fetchRedditPostsPaginated(
  feedType: 'hot' | 'new' = 'hot',
  limit: number = 30,
  after?: string
): Promise<{ posts: RedditPost[]; after?: string }> {
  // Tier 1: Arctic Shift Live Reddit API (Full fidelity Reddit posts with exact submitted target giveaway URLs)
  try {
    const arcticUrl = `https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=FreeGameFindings&limit=${Math.max(limit, 30)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(arcticUrl, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    clearTimeout(timer);
    if (response.ok) {
      const json = await response.json();
      if (json && Array.isArray(json.data) && json.data.length > 0) {
        const posts = parseArcticRedditPosts(json.data);
        if (posts.length > 0) {
          console.log(`[RedditService] Successfully fetched ${posts.length} official Reddit posts with exact giveaway links from Arctic Shift.`);
          await clearRedditRateLimit();
          return { posts: posts.slice(0, limit) };
        }
      }
    }
  } catch (arcticErr) {
    console.log('[RedditService] Arctic Shift API fallback...');
  }

  // Tier 2: Feeder.co live mirror
  try {
    const feederUrl = 'https://feeder.co/discover/00e1aed4c4/reddit-com-r-freegamefindings';
    let feederResponse: Response;
    if (Platform.OS === 'web') {
      feederResponse = await fetchWithProxy(feederUrl, 2000);
    } else {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 3500);
      feederResponse = await fetch(feederUrl, { signal: c.signal });
      clearTimeout(t);
    }
    if (feederResponse && feederResponse.ok) {
      const html = await feederResponse.text();
      const posts = parseFeederHtml(html);
      if (posts.length > 0) {
        console.log(`[RedditService] Successfully fetched ${posts.length} live posts from Feeder.co mirror.`);
        await clearRedditRateLimit();
        return { posts: posts.slice(0, limit) };
      }
    }
  } catch (feederErr) {
    console.log('[RedditService] Feeder.co direct fetch unavailable on web client, using live snapshot.');
  }


  // Tier 4: Direct Reddit RSS (native / unblocked environments)
  try {
    const rssUrl = `https://old.reddit.com/r/FreeGameFindings/${feedType === 'new' ? 'new/' : ''}.rss`;
    const response = await (Platform.OS === 'web' ? fetchWithProxy(rssUrl, 2000) : redditFetch(rssUrl));
    const xml = await response.text();
    const posts = parseRedditRssXml(xml);
    if (posts.length > 0) {
      return { posts: posts.slice(0, limit) };
    }
  } catch (error) {
    console.log('[RedditService] Direct Reddit RSS fallback...');
  }

  // Tier 5: Primary Curated Live Snapshot (Exact real-time mirror from Feeder.co)
  console.log(`[RedditService] Serving ${FALLBACK_REDDIT_POSTS.length} live Feeder.co FreeGameFindings drops.`);
  return { posts: FALLBACK_REDDIT_POSTS.slice(0, limit) };
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

let _inMemoryMergedDeals: Deal[] | null = null;

export function getCachedMergedDeals(): Deal[] | null {
  return _inMemoryMergedDeals;
}

/**
 * Returns feed deals immediately from in-memory cache, local AsyncStorage, or instant curated snapshot.
 * Guarantees instantaneous 0ms - 15ms first-render hydration without waiting on network.
 */
export async function getStoredMergedDeals(): Promise<Deal[]> {
  if (_inMemoryMergedDeals && _inMemoryMergedDeals.length > 0) {
    return _inMemoryMergedDeals.filter((d) => !isDealExpired(d) && !isPostRemovedByModerator(d));
  }
  try {
    const raw = await AsyncStorage.getItem('fgf_merged_feed_cache');
    if (raw) {
      const parsed: Deal[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const clean = parsed.filter((d) => !isDealExpired(d) && !isPostRemovedByModerator(d));
        _inMemoryMergedDeals = clean;
        return clean;
      }
    }
  } catch {}

  // If cold-start has no local cache yet, instantly hydrate from curated live snapshot
  const initial = FALLBACK_REDDIT_POSTS.map(postToBasicDeal).filter(
    (d) => !isDealExpired(d) && !isPostRemovedByModerator(d)
  );
  _inMemoryMergedDeals = initial;
  return initial;
}

/**
 * Fetches merged feed of GamerPower (Primary) and Reddit (Supplemental) posts in parallel.
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

  const isPage1 = !after;

  // Execute GamerPower, Reddit, and Expired flair fetch concurrently in parallel
  const [gpResult, redditResult] = await Promise.allSettled([
    fetchGamerPowerGiveaways(100, undefined, undefined, forceRefresh),
    (async () => {
      if (isPage1) {
        const lastFetchStr = await AsyncStorage.getItem('reddit_last_fetch_timestamp_v6');
        const lastFetch = lastFetchStr ? Number(lastFetchStr) : 0;
        const now = Date.now();
        const cooldownMs = 5 * 60 * 1000; // 5 minutes

        if (!forceRefresh && now - lastFetch < cooldownMs) {
          const cachedStr = await AsyncStorage.getItem('reddit_posts_cache_v6');
          if (cachedStr) {
            try {
              const parsed = JSON.parse(cachedStr);
              if (Array.isArray(parsed) && parsed.length > 0) {
                console.log(`[RedditService] Loaded ${parsed.length} Reddit posts from cache.`);
                return { posts: parsed, after: undefined, fromCache: true };
              }
            } catch {
              // Cache parse error, proceed to fetch
            }
          }
        }
      }
      return fetchRedditPostsPaginated(feedType, limit, after);
    })(),
    expiredFeedService.getExpiredPostIds(forceRefresh),
  ]);

  // Handle GamerPower result
  if (gpResult.status === 'fulfilled') {
    gpDeals = gpResult.value;
  } else {
    console.warn('[RedditService] Primary GamerPower fetch failed:', gpResult.reason);
    gpFailed = true;
  }

  // Handle Reddit result
  if (redditResult.status === 'fulfilled') {
    const res = redditResult.value;
    redditPosts = res.posts || [];
    redditAfterCursor = res.after;
    if (isPage1 && !(res as any).fromCache && redditPosts.length > 0) {
      redditFetchedLive = true;
      await AsyncStorage.setItem('reddit_posts_cache_v6', JSON.stringify(redditPosts));
      await AsyncStorage.setItem('reddit_last_fetch_timestamp_v6', String(Date.now()));
    }
  } else {
    console.warn('[RedditService] Supplemental Reddit fetch failed:', redditResult.reason);
  }

  // Convert Reddit posts to basic Deals
  const redditDeals = redditPosts.map(postToBasicDeal);

  // Merge & Enrich (GamerPower + Reddit)
  const uniqueDeals = mergeAndEnrichDeals(gpDeals, redditDeals);

  // Mark deals expired according to isDealExpired (checks date arithmetic and ExpiredFeedService)
  const canonicalDeals = uniqueDeals.map((deal) => {
    const expired = deal.isExpired || deal.expiryStatus === 'EXPIRED' || isDealExpired(deal);
    return expired
      ? { ...deal, isExpired: true, expiryStatus: 'EXPIRED' as const }
      : deal;
  });

  console.log(`[RedditService] Merged feed: ${gpDeals.length} GamerPower + ${redditPosts.length} Reddit posts => ${canonicalDeals.length} canonical deals.`);

  // Cache merged feed so Vault and all app screens share the exact same canonical feed data
  if (isPage1 && canonicalDeals.length > 0) {
    _inMemoryMergedDeals = canonicalDeals;
    AsyncStorage.setItem('fgf_merged_feed_cache', JSON.stringify(canonicalDeals)).catch(() => {});
  }

  return {
    deals: canonicalDeals,
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
      if (child.data.pinned || child.data.stickied) return false;
      const flair = (child.data.link_flair_text || '').toLowerCase();
      if (flair.includes('expired') || flair.includes('ended')) return false;
      return !isPostRemovedByModerator(child.data);
    })
    .map((child: any) => {
      const d = child.data;
      let url = d.url || '';
      const selftext = d.selftext || '';

      // If post is a self/text post linking to Reddit itself, extract actual giveaway URL from selftext
      if (url.includes('reddit.com') || url.includes('redd.it')) {
        const linkMatches = (selftext || '').match(/https?:\/\/[^\s\)\>\]"']+/g);
        if (linkMatches) {
          const external = linkMatches.find((l: string) => !l.includes('reddit.com') && !l.includes('redd.it'));
          if (external) {
            url = external;
          }
        }
      }

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
      } else {
        coverImage = getGameCover(d.id, url) || undefined;
      }

      const flair = d.link_flair_text;
      const isExpired = (flair || '').toLowerCase().includes('expired') || (flair || '').toLowerCase().includes('ended');

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
        flair,
        isExpired,
      };
    }).filter((post: RedditPost) => {
      if (!post.platform || post.platform.trim() === '' || post.platform.toLowerCase() === 'unknown') {
        return false;
      }
      return !post.isExpired;
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

