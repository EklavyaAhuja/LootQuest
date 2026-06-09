import { getAppSettings, getRedditAccessToken, saveRedditAccessToken } from './storageService';
import { extractTitle } from './FGFBotParser';

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
 * Custom base64 encoder to avoid global btoa crashes in Hermes
 */
function base64Encode(str: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  let i = 0;
  const len = str.length;
  while (i < len) {
    const c1 = str.charCodeAt(i++) & 0xff;
    if (i === len) {
      out += chars.charAt(c1 >> 2);
      out += chars.charAt((c1 & 0x3) << 4);
      out += '==';
      break;
    }
    const c2 = str.charCodeAt(i++);
    if (i === len) {
      out += chars.charAt(c1 >> 2);
      out += chars.charAt(((c1 & 0x3) << 4) | ((c2 & 0xF0) >> 4));
      out += chars.charAt((c2 & 0xF) << 2);
      out += '=';
      break;
    }
    const c3 = str.charCodeAt(i++);
    out += chars.charAt(c1 >> 2);
    out += chars.charAt(((c1 & 0x3) << 4) | ((c2 & 0xF0) >> 4));
    out += chars.charAt(((c2 & 0xF) << 2) | ((c3 & 0xC0) >> 6));
    out += chars.charAt(c3 & 0x3F);
  }
  return out;
}

/**
 * Requests a new application-only anonymous OAuth token from Reddit
 */
async function acquireRedditToken(clientId: string): Promise<string> {
  try {
    const authHeader = 'Basic ' + base64Encode(clientId + ':');
    const response = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'android:com.freegamefindings.app:v1.0.0 (by /u/freegamefindings)',
      },
      body: 'grant_type=client_credentials&device_id=DO_NOT_TRACK_THIS_DEVICE',
    });

    if (!response.ok) {
      throw new Error(`Token request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.access_token) {
      throw new Error('No access token returned from Reddit API');
    }

    await saveRedditAccessToken(data.access_token, data.expires_in || 3600);
    return data.access_token;
  } catch (error) {
    console.error('Failed to acquire Reddit token:', error);
    throw error;
  }
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
 * Parses raw Reddit RSS XML into RedditPost objects
 */
function parseRedditRssXml(xmlText: string): RedditPost[] {
  const entries = xmlText.split('<entry>');
  entries.shift(); // remove feed metadata header

  const parsed = entries.map((entryText) => {
    // 1. Title
    const titleMatch = entryText.match(/<title>([\s\S]*?)<\/title>/);
    const title = titleMatch ? titleMatch[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : '';

    // 2. Link
    const permalinkMatch = entryText.match(/<link\s+href="([^"]+)"/);
    const permalink = permalinkMatch ? permalinkMatch[1] : '';

    // 3. ID
    const idMatch = entryText.match(/<id>([^<]+)<\/id>/);
    const fullId = idMatch ? idMatch[1] : '';
    const id = fullId.replace('t3_', '');

    // 4. Author
    const authorMatch = entryText.match(/<author><name>([^<]+)<\/name>/);
    const author = authorMatch ? authorMatch[1].replace('/u/', '') : 'unknown';

    // 5. Date
    const publishedMatch = entryText.match(/<published>([^<]+)<\/published>/);
    const createdAt = publishedMatch ? new Date(publishedMatch[1]).getTime() : Date.now();

    // 6. Content (giveaway url and selftext)
    const contentMatch = entryText.match(/<content type="html">([\s\S]*?)<\/content>/);
    const htmlContent = contentMatch ? contentMatch[1] : '';

    const unescapedContent = htmlContent
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#32;/g, ' ');

    // Target giveaway link
    const giveawayLinkMatch = unescapedContent.match(/href="([^"]+)"[^>]*>\[link\]/);
    const giveawayUrl = giveawayLinkMatch ? giveawayLinkMatch[1] : permalink;

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
 * Fetch RSS directly from Reddit
 */
async function fetchViaDirectRss(feedType: 'hot' | 'new'): Promise<RedditPost[]> {
  const rssUrl = `https://www.reddit.com/r/FreeGameFindings/${feedType === 'new' ? 'new/' : ''}.rss?t=${Date.now()}`;
  console.log(`Attempting direct RSS fetch from: ${rssUrl}`);

  const response = await fetch(rssUrl, {
    headers: {
      'User-Agent': 'android:com.freegamefindings.app:v1.0.0 (by /u/freegamefindings)',
    },
  });

  if (!response.ok) {
    throw new Error(`Direct RSS failed with status ${response.status}`);
  }

  const xml = await response.text();
  return parseRedditRssXml(xml);
}

/**
 * Fetch RSS via public CORS proxy (e.g. corsproxy.io)
 */
async function fetchViaProxyRss(feedType: 'hot' | 'new'): Promise<RedditPost[]> {
  const rssUrl = `https://www.reddit.com/r/FreeGameFindings/${feedType === 'new' ? 'new/' : ''}.rss?t=${Date.now()}`;
  const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(rssUrl)}`;
  console.log(`Attempting proxied RSS fetch from: ${proxyUrl}`);

  const response = await fetch(proxyUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`Proxied RSS failed with status ${response.status}`);
  }

  const xml = await response.text();
  return parseRedditRssXml(xml);
}

/**
 * Fetch giveaways using the rss2json converter proxy
 */
async function fetchViaRss2Json(feedType: 'hot' | 'new'): Promise<RedditPost[]> {
  const rssUrl = `https://www.reddit.com/r/FreeGameFindings/${feedType === 'new' ? 'new/' : ''}.rss?t=${Date.now()}`;
  const fetchUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;

  console.log(`Attempting to fetch via rss2json: ${fetchUrl}`);
  const response = await fetch(fetchUrl);
  if (!response.ok) {
    throw new Error(`rss2json request failed with status ${response.status}`);
  }

  const data = await response.json();
  if (data.status !== 'ok') {
    throw new Error(`rss2json response status: ${data.status}`);
  }

  const items = data.items || [];
  const parsed = items.map((item: any) => {
    const id = item.guid ? item.guid.replace('t3_', '') : 'rss_' + Math.random().toString(36).substr(2, 9);
    const description = item.description || '';

    const linkMatch = description.match(/href="([^"]+)"[^>]*>\[link\]/);
    let giveawayUrl = item.link || '';
    if (linkMatch) {
      giveawayUrl = linkMatch[1].replace(/&amp;/g, '&');
    }

    let selftext = '';
    const mdMatch = description.match(/<div class="md">([\s\S]*?)<\/div>/);
    if (mdMatch) {
      selftext = mdMatch[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
    }

    const { platform, type, cleanTitle, isTask } = parseRedditTitle(
      item.title || '',
      giveawayUrl,
      selftext
    );

    const coverImage = item.thumbnail && item.thumbnail.length > 0 ? item.thumbnail.replace(/&amp;/g, '&') : undefined;

    const categories = item.categories || [];
    const isNsfw = categories.some((c: string) => c.toLowerCase().includes('nsfw')) ||
                   /nsfw/i.test(item.title || '') ||
                   /18\+/i.test(item.title || '') ||
                   /nsfw/i.test(selftext) ||
                   /nsfw/i.test(giveawayUrl) ||
                   /mazakon/i.test(item.title || '') ||
                   /tengoku/i.test(item.title || '') ||
                   giveawayUrl.toLowerCase().includes('dlsite');

    return {
      id,
      title: item.title || '',
      url: giveawayUrl,
      permalink: item.link || '',
      author: item.author ? item.author.replace('/u/', '') : 'unknown',
      createdAt: item.pubDate ? new Date(item.pubDate.replace(' ', 'T')).getTime() : Date.now(),
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

  return parsed.filter((post: any) => {
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
 * Fetch giveaways using the GamerPower API (No authentication, stable JSON output, native cover images)
 */
async function fetchViaGamerPower(feedType: 'hot' | 'new', limit: number): Promise<RedditPost[]> {
  const url = 'https://www.gamerpower.com/api/giveaways';
  console.log(`Fetching feed from GamerPower API: ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GamerPower request failed with status ${response.status}`);
  }

  const arr = await response.json();
  if (!Array.isArray(arr)) {
    throw new Error('GamerPower did not return an array');
  }

  const activeGiveaways = arr.filter((item) => item.status === 'Active');

  // GamerPower API naturally returns newest first. 
  // If user requested 'new', sort by id descending.
  const sorted = feedType === 'new'
    ? activeGiveaways.sort((a, b) => b.id - a.id)
    : activeGiveaways;

  return sorted.slice(0, limit).map((item: any) => {
    const id = 'gp_' + item.id;
    const giveawayUrl = item.open_giveaway_url || item.open_giveaway || item.gamerpower_url || '';

    // Standardize platform tags
    let platform = 'PC';
    const lowerPlatforms = (item.platforms || '').toLowerCase();
    if (lowerPlatforms.includes('steam')) platform = 'Steam';
    else if (lowerPlatforms.includes('epic')) platform = 'Epic Games';
    else if (lowerPlatforms.includes('gog')) platform = 'GOG';
    else if (lowerPlatforms.includes('itch')) platform = 'itch.io';
    else if (lowerPlatforms.includes('playstation') || lowerPlatforms.includes('ps4') || lowerPlatforms.includes('ps5')) platform = 'Playstation';
    else if (lowerPlatforms.includes('xbox')) platform = 'Xbox';
    else if (lowerPlatforms.includes('switch') || lowerPlatforms.includes('nintendo')) platform = 'Nintendo Switch';
    else if (lowerPlatforms.includes('mobile') || lowerPlatforms.includes('android') || lowerPlatforms.includes('ios')) platform = 'Mobile';

    // Heuristics to check if task-based claim is required
    const lowerInstructions = (item.instructions || '').toLowerCase();
    const lowerUrl = giveawayUrl.toLowerCase();
    const isDirectStore = ['steampowered.com', 'epicgames.com', 'gog.com', 'itch.io'].some((d) => lowerUrl.includes(d));
    const isTask = !isDirectStore || ['tasks', 'alienware', 'steelseries', 'gleam', 'social', 'follow', 'retweet', 'newsletter'].some((k) => lowerInstructions.includes(k));

    // Remove parentheses and trailing giveaway suffixes from title
    const cleanTitle = item.title
      .replace(/\s*\([^)]+\)\s*/g, ' ')
      .replace(/\s+Giveaway\s*$/i, '')
      .replace(/\s+Key\s*$/i, '')
      .trim();

    // Compile description and instructions to recreate selftext
    const selftext = `${item.description || ''}\n\nInstructions:\n${item.instructions || ''}`;

    const isNsfw = /nsfw/i.test(item.title || '') ||
                   /18\+/i.test(item.title || '') ||
                   /nsfw/i.test(selftext) ||
                   /nsfw/i.test(giveawayUrl) ||
                   /mazakon/i.test(item.title || '') ||
                   /tengoku/i.test(item.title || '') ||
                   giveawayUrl.toLowerCase().includes('dlsite');

    return {
      id,
      title: item.title || '',
      url: giveawayUrl,
      permalink: item.gamerpower_url || giveawayUrl,
      author: 'GamerPower',
      createdAt: item.published_date ? new Date(item.published_date.replace(' ', 'T')).getTime() : Date.now(),
      selftext,
      domain: extractDomain(giveawayUrl),
      platform,
      type: item.type || 'Game',
      cleanTitle,
      isTask,
      coverImage: item.image || item.thumbnail || '',
      isNsfw,
    };
  }).filter((post) => {
    return post.platform && post.platform.trim() !== '' && post.platform.toLowerCase() !== 'unknown';
  });
}

/**
 * Fetch posts from the FreeGameFindings subreddit JSON feed
 * @param feedType 'hot' or 'new'
 * @param limit number of posts to fetch
 */
export async function fetchFreeGameFindings(
  feedType: 'hot' | 'new' = 'hot',
  limit: number = 30
): Promise<RedditPost[]> {
  try {
    const settings = await getAppSettings();
    const clientId = settings?.redditClientId;

    // A: Official OAuth Path (If Client ID is configured)
    if (clientId && clientId.trim().length > 0) {
      try {
        console.log('Fetching Reddit feed using official OAuth API...');
        let token = await getRedditAccessToken();
        if (!token) {
          token = await acquireRedditToken(clientId.trim());
        }

        const response = await fetch(
          `https://oauth.reddit.com/r/FreeGameFindings/${feedType}.json?limit=${limit}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'User-Agent': 'android:com.freegamefindings.app:v1.0.0 (by /u/freegamefindings)',
            },
          }
        );

        if (!response.ok) {
          throw new Error(`OAuth Request failed with status ${response.status}`);
        }

        const data = await response.json();
        return parseRedditJson(data);
      } catch (oauthError) {
        console.warn('OAuth fetch failed, falling back to GamerPower API:', oauthError);
      }
    }

    // B: Try Direct RSS fetch (Fast, no middleware, direct Reddit server fetch)
    try {
      const directRssData = await fetchViaDirectRss(feedType);
      if (directRssData && directRssData.length > 0) {
        console.log('Successfully fetched feed via Direct RSS.');
        return directRssData.slice(0, limit);
      }
    } catch (directRssError) {
      console.warn('Direct RSS fetch failed, falling back to Proxied RSS:', directRssError);
    }

    // C: Try Proxied RSS fetch (uses corsproxy.io to pull Reddit RSS XML)
    try {
      const proxyRssData = await fetchViaProxyRss(feedType);
      if (proxyRssData && proxyRssData.length > 0) {
        console.log('Successfully fetched feed via Proxied RSS.');
        return proxyRssData.slice(0, limit);
      }
    } catch (proxyRssError) {
      console.warn('Proxied RSS fetch failed, falling back to rss2json converter:', proxyRssError);
    }

    // D: Try public RSS-to-JSON converter (Backup proxy API)
    try {
      const rssData = await fetchViaRss2Json(feedType);
      if (rssData && rssData.length > 0) {
        console.log('Successfully fetched feed via RSS converter.');
        return rssData.slice(0, limit);
      }
    } catch (rssError) {
      console.warn('RSS converter failed, falling back to public JSON proxies:', rssError);
    }

    // E: Fallback Proxy Chain (If everything else failed)
    const fallbacks = [
      { name: 'corsproxy.io', url: (target: string) => `https://corsproxy.io/?url=${encodeURIComponent(target)}` },
      { name: 'allorigins.win', url: (target: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(target)}` },
      { name: 'direct-www', url: (target: string) => target },
      { name: 'direct-old', url: (target: string) => target.replace('www.reddit.com', 'old.reddit.com') },
    ];

    let lastError: any = null;
    const targetUrl = `https://www.reddit.com/r/FreeGameFindings/${feedType}.json?limit=${limit}&t=${Date.now()}`;

    for (const source of fallbacks) {
      try {
        console.log(`Attempting to fetch Reddit feed via ${source.name}...`);
        const fetchUrl = source.url(targetUrl);
        const response = await fetch(fetchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          },
        });

        if (!response.ok) {
          throw new Error(`Failed with status ${response.status}`);
        }

        let rawData: any;
        if (source.name === 'allorigins.win') {
          const proxyResult = await response.json();
          if (!proxyResult.contents) throw new Error('Proxy returned empty contents');
          rawData = JSON.parse(proxyResult.contents);
        } else {
          rawData = await response.json();
        }

        return parseRedditJson(rawData);
      } catch (error) {
        console.warn(`Source ${source.name} failed:`, error);
        lastError = error;
      }
    }

    // F: Try GamerPower API as a final backup (No authentication, stable JSON output, native cover images)
    try {
      console.log('Reddit endpoints failed. Falling back to GamerPower API as backup...');
      const gpData = await fetchViaGamerPower(feedType, limit);
      if (gpData && gpData.length > 0) {
        console.log('Successfully fetched feed via GamerPower API.');
        return gpData;
      }
    } catch (gpError) {
      console.warn('GamerPower fallback fetch failed:', gpError);
      lastError = gpError;
    }

    throw lastError || new Error('All fetch methods failed');
  } catch (error) {
    console.error('Error in fetchFreeGameFindings:', error);
    throw error;
  }
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
export async function fetchBotComment(postId: string, postTitle?: string): Promise<BotCommentResult | null> {
  // If it's a GamerPower post (starts with gp_), it won't have a direct Reddit comment
  if (postId.startsWith('gp_')) {
    return null;
  }
  
  const targetUrl = `https://www.reddit.com/comments/${postId}/.rss`;
  
  try {
    console.log(`[RedditService] Fetching comments RSS for post ${postId} directly...`);
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'android:com.freegamefindings.app:v1.0.0 (by /u/freegamefindings)',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch comments RSS: status ${response.status}`);
    }
    
    const xmlText = await response.text();
    return selectBestBotComment(xmlText, postTitle);
  } catch (error) {
    console.warn(`[RedditService] Failed to fetch comments RSS for post ${postId}:`, error);
    return null;
  }
}

