import { Deal } from '../models/Deal';
import { expiredFeedService } from '../services/ExpiredFeedService';

/**
 * Robust Hermes-safe date parser that maps date strings to Unix milliseconds.
 */
export function parseDateToMs(dateStr?: string | null): number {
  if (!dateStr || dateStr.trim() === '' || dateStr.toUpperCase() === 'N/A') {
    return Date.now();
  }
  try {
    let normalized = dateStr.trim();
    
    // Check if the date string is a placeholder (ending in 23:59:00, 23:59:59, or 00:00:00)
    // We match this regardless of whether there is an offset/timezone suffix at the end (like Z or +00:00)
    const isPlaceholder = /[\sT](?:23:59:00|23:59:59|00:00:00)/.test(normalized);
    
    if (isPlaceholder) {
      const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})[\sT](\d{2}):(\d{2}):(\d{2})/);
      if (match) {
        const year = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        const day = parseInt(match[3], 10);
        const hour = parseInt(match[4], 10);
        const minute = parseInt(match[5], 10);
        const second = parseInt(match[6], 10);
        const localTime = new Date(year, month, day, hour, minute, second).getTime();
        if (!isNaN(localTime)) return localTime;
      }
    }

    // Force UTC timezone for date-times lacking offset suffixes (skip for placeholders)
    if (!isPlaceholder) {
      if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(normalized)) {
        normalized = normalized.replace(' ', 'T') + 'Z';
      } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(normalized)) {
        normalized = normalized + 'Z';
      }
    }

    const t = Date.parse(normalized);
    if (!isNaN(t)) return t;

    const withT = normalized.replace(' ', 'T');
    const t2 = Date.parse(withT);
    if (!isNaN(t2)) return t2;

    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
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
    console.warn('[dealUtils] Date parsing failed for:', dateStr, e);
  }
  return Date.now();
}

/**
 * Determines if a deal has expired using client-side validation.
 */
export const isDealExpired = (deal?: Deal | null): boolean => {
  if (!deal) return false;
  if (deal.isExpired === true) return true;
  if (deal.expiryStatus === 'EXPIRED') return true;

  // Check ExpiredFeedService (flair:Expired on FGF Reddit cross-matched by ID, title, and Steam ID)
  if (expiredFeedService.isExpired(deal)) {
    return true;
  }

  // Check current price: If current price is not 0 (not Free, not $0, not 0), then it's expired or fake
  // ONLY for direct storefront deals where the user claims directly on that store!
  // Third-party key giveaways (Legion Gaming, Alienware, Gleam, etc.) give keys for paid Steam games,
  // so the retail price on Steam does not mean the third-party giveaway has expired.
  const isDirectStoreDeal =
    (deal.url || '').toLowerCase().includes('steampowered.com') ||
    (deal.url || '').toLowerCase().includes('epicgames.com');
  if (isDirectStoreDeal && deal.currentPrice) {
    const p = deal.currentPrice.toLowerCase().trim();
    if (p && p !== 'free' && p !== '$0' && p !== '$0.00' && p !== '0' && p !== '0.00' && p !== 'free to play') {
      const match = p.match(/(\d+[.,]?\d*)/);
      if (match) {
        const numeric = parseFloat(match[1].replace(',', '.'));
        if (numeric > 0) {
          return true; // Non-zero price means promotion ended!
        }
      }
    }
  }

  // Check date string expiry
  const dateStr = deal.expiresAt || deal.endDate;
  if (
    dateStr &&
    dateStr.toUpperCase() !== 'N/A' &&
    !dateStr.toUpperCase().includes('PERMANENT') &&
    !dateStr.toUpperCase().includes('NO EXP')
  ) {
    const endTime = parseDateToMs(dateStr);
    if (!isNaN(endTime) && endTime <= Date.now()) {
      return true;
    }
  }

  // Check title markers and known expired drops
  const t = (deal.title || '').toLowerCase();
  const c = ((deal as any).cleanTitle || '').toLowerCase();
  if (
    t.includes('fireside feelings') ||
    c.includes('fireside feelings') ||
    t.includes('fireside_feelings') ||
    t.includes('pony island') ||
    c.includes('pony island') ||
    t.includes('pony_island') ||
    deal.id === '1x2c8f2' ||
    deal.id === '1x1qq4d' ||
    deal.id === 't3_1x1qq4d' ||
    (deal.url && (deal.url.includes('2990600') || deal.url.includes('405640'))) ||
    (deal.giveawayUrl && (deal.giveawayUrl.includes('2990600') || deal.giveawayUrl.includes('405640'))) ||
    (deal.storeUrl && (deal.storeUrl.includes('2990600') || deal.storeUrl.includes('405640')))
  ) {
    return true;
  }

  if (t.includes('[expired]') || t.includes('(expired)') || t.includes('expired:')) {
    return true;
  }

  return false;
};

/**
 * Returns a human-readable countdown string for the time remaining.
 */
export const getTimeLeft = (endDate: string | null | undefined): string => {
  if (!endDate || endDate.trim() === '' || endDate.toUpperCase() === 'N/A') {
    return "No expiry";
  }

  const endTime = parseDateToMs(endDate);
  const now = Date.now();
  const diffMs = endTime - now;

  if (diffMs <= 0) return "Expired";

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (diffHours >= 24) {
    const days = Math.floor(diffHours / 24);
    return `${days}d ${diffHours % 24}h left`;
  } else if (diffHours >= 1) {
    return `${diffHours}h ${diffMinutes}m left`;
  } else {
    return `${diffMinutes}m left`;
  }
};

/**
 * Smartly determines the claim difficulty (one_click vs tasks) of a deal.
 */
export function determineClaimMethod(
  instructions: string = "",
  title: string = "",
  platforms: string = "",
  url: string = ""
): "one_click" | "tasks" | "unknown" {
  const lowerUrl = url.toLowerCase();
  const text = (instructions + " " + title + " " + platforms + " " + url).toLowerCase();

  // IndieGala is always one_click as requested
  if (lowerUrl.includes("indiegala.com") || text.includes("indiegala")) {
    return "one_click";
  }

  // Task hosts that always require external steps
  const taskHosts = [
    "alienware",
    "gleam",
    "givee.club",
    "keylol",
    "giveaway.su",
    "opquest",
    "steelseries",
    "grabfreegame",
    "gemsloot",
    "vloot",
    "polymarket",
  ];

  // Actual external task actions
  const externalTaskKeywords = [
    "complete task",
    "complete two task",
    "enter giveaway",
    "join group",          // e.g. Steam join group
    "join our discord",
    "join our server",
    "follow us on",
    "follow our",
    "retweet",
    "like and retweet",
    "subscribe to",
    "wishlist",
    "visit and wait",
    "visit and answer",
    "answer question",
    "use code",            // promo/referral codes
    "refer a friend",
    "survey",
    "share this",
    "tweet about",
  ];

  if (
    taskHosts.some(kw => text.includes(kw)) ||
    externalTaskKeywords.some(kw => text.includes(kw))
  ) {
    return "tasks";
  }

  // Check if it matches popular direct storefronts / consoles / platforms (excluding generic "pc")
  const lowerPlat = platforms.toLowerCase();
  const directStorefronts = [
    "steam",
    "epic",
    "gog",
    "itch",
    "nintendo",
    "switch",
    "playstation",
    "ps4",
    "ps5",
    "psn",
    "psa",
    "xbox",
    "stove",
    "mobile",
    "android",
    "ios",
    ""
  ];

  const isDirectStore = directStorefronts.some(store => {
    if (store === "") {
      return lowerPlat.trim() === "";
    }
    return lowerPlat.includes(store);
  });

  if (isDirectStore) {
    return "one_click";
  }

  // If it is not on a direct storefront/platform, assume it's tasks
  return "tasks";
}

/**
 * Normalizes title for deduplication comparison
 */
export function normalizeTitle(t: string): string {
  if (!t) return "";
  return t
    .toLowerCase()
    .replace(/\[[^\]]+\]/g, "") // remove brackets
    .replace(/\([^)]+\)/g, "")   // remove parentheses
    .replace(/[^a-z0-9]/gi, "")  // remove non-alphanumeric
    .trim();
}

export function getCanonicalPlatform(platform: string): string {
  const plat = (platform || "").toLowerCase();
  if (plat.includes("playstation") || plat.includes("ps4") || plat.includes("ps5")) return "playstation";
  if (plat.includes("xbox")) return "xbox";
  if (plat.includes("switch") || plat.includes("nintendo")) return "switch";
  if (plat.includes("mobile") || plat.includes("android") || plat.includes("ios")) return "mobile";
  // All other PC storefronts (Steam, Epic Games, GOG, itch.io, Stove, PC) normalize to "pc"
  return "pc";
}

/**
 * Generates a canonical key for cross-source deduplication
 */
export function getCanonicalKey(title: string, platform: string): string {
  return `${normalizeTitle(title)}_${getCanonicalPlatform(platform)}`;
}

/**
 * Checks if a deal is already claimed by comparing canonical keys and IDs
 */
export function isDealClaimed(deal: Deal, claimedDeals: Array<{ id?: string; title?: string; platform?: string }>): boolean {
  if (!deal || !Array.isArray(claimedDeals) || claimedDeals.length === 0) return false;
  const dealId = deal.id ? deal.id.trim() : '';
  const dealNormTitle = normalizeTitle(deal.title);

  return claimedDeals.some(c => {
    if (!c) return false;
    const cId = c.id ? c.id.trim() : '';
    // 1. Guarded ID comparison: both must exist and be non-empty
    if (dealId && cId && dealId === cId) return true;

    // 2. Canonical title comparison: both normalized titles must be at least 3 chars long
    const cNormTitle = normalizeTitle(c.title || '');
    if (dealNormTitle.length >= 3 && cNormTitle.length >= 3 && dealNormTitle === cNormTitle) {
      if (getCanonicalPlatform(deal.platform) === getCanonicalPlatform(c.platform || '')) {
        return true;
      }
    }
    return false;
  });
}

/**
 * Safely extracts a direct storefront URL from instructions, description, or fallbackUrl
 */
export function extractDirectStoreUrl(
  instructions: string = "",
  description: string = "",
  fallbackUrl: string = ""
): string {
  const text = `${instructions} ${description}`;
  
  const steamPattern = /(https?:\/\/(?:store\.)?steampowered\.com\/app\/\d+[^\s)"']*)/i;
  const epicPattern = /(https?:\/\/(?:www\.)?epicgames\.com\/[^\s)"']*)/i;
  const gogPattern = /(https?:\/\/(?:www\.)?gog\.com\/[^\s)"']*)/i;
  const itchPattern = /(https?:\/\/[^\s()"']+\.itch\.io\/[^\s)"']*)/i;
  
  const otherPattern = /(https?:\/\/[^\s()"']+(?:playstation\.com|xbox\.com|nintendo\.com|microsoft\.com|onstove\.com)[^\s)"']*)/i;

  const steamMatch = text.match(steamPattern);
  if (steamMatch) return steamMatch[1];

  const epicMatch = text.match(epicPattern);
  if (epicMatch) return epicMatch[1];

  const gogMatch = text.match(gogPattern);
  if (gogMatch) return gogMatch[1];

  const itchMatch = text.match(itchPattern);
  if (itchMatch) return itchMatch[1];

  const otherMatch = text.match(otherPattern);
  if (otherMatch) return otherMatch[1];

  return fallbackUrl;
}


/**
 * Normalizes platform lists/strings to show only clean store or console names.
 */
export function getCleanPlatform(
  platforms: string[] | string | undefined,
  title: string = "",
  instructions: string = "",
  url: string = ""
): string {
  const text = (instructions + " " + title + " " + url).toLowerCase();

  if (text.includes("alienware")) {
    return "Alienware Arena";
  }
  if (text.includes("indiegala")) {
    return "IndieGala";
  }
  if (text.includes("steelseries")) {
    return "SteelSeries";
  }
  if (text.includes("gleam.io") || text.includes("gleam")) {
    return "Gleam";
  }
  if (text.includes("givee.club")) {
    return "Givee.Club";
  }
  if (text.includes("keylol")) {
    return "Keylol";
  }
  if (text.includes("grabfreegame")) {
    return "GrabFreeGame";
  }
  if (text.includes("onstove.com") || text.includes("stove")) {
    return "Stove";
  }
  if (text.includes("itch.io") || text.includes("itchi.io") || text.includes("itch.co")) {
    return "itch.io";
  }
  if (text.includes("steampowered.com") || text.includes("steamcommunity.com") || text.includes("steam")) {
    return "Steam";
  }
  if (text.includes("epicgames.com") || text.includes("epic games")) {
    return "Epic Games";
  }
  if (text.includes("gog.com")) {
    return "GOG";
  }

  if (!platforms) return "PC";
  
  let rawList: string[] = [];
  if (Array.isArray(platforms)) {
    rawList = platforms;
  } else {
    rawList = platforms.split(/[,\/]+/).map(p => p.trim());
  }

  const cleanList: string[] = [];

  // Define storefront/console mappings
  const platformMappings = [
    { key: "steam", label: "Steam" },
    { key: "epic", label: "Epic Games" },
    { key: "gog", label: "GOG" },
    { key: "itch", label: "itch.io" },
    { key: "itchi", label: "itch.io" },
    { key: "stove", label: "Stove" },
    { key: "playstation", label: "Playstation" },
    { key: "ps4", label: "Playstation" },
    { key: "ps5", label: "Playstation" },
    { key: "xbox", label: "Xbox" },
    { key: "switch", label: "Nintendo Switch" },
    { key: "nintendo", label: "Nintendo Switch" },
    { key: "android", label: "Android" },
    { key: "ios", label: "iOS" },
    { key: "mobile", label: "Mobile" },
    { key: "drm-free", label: "DRM-Free" }
  ];

  // Search for matches in the raw list
  for (const raw of rawList) {
    const rLower = raw.toLowerCase();
    for (const mapping of platformMappings) {
      if (rLower.includes(mapping.key)) {
        if (mapping.key === "itch" && rLower.includes("switch")) {
          continue; // "switch" contains "itch", skip to next mapping
        }
        if (!cleanList.includes(mapping.label)) {
          cleanList.push(mapping.label);
        }
        break; // Match found for this raw string, move to next raw string
      }
    }
  }

  // If specific platforms are found, return them joined by "/"
  if (cleanList.length > 0) {
    // Priority: exclude "DRM-Free" if a more specific store (like itch.io or GOG) is present
    const stores = cleanList.filter(item => item !== "DRM-Free");
    if (stores.length > 0) {
      return stores.join("/");
    }
    return cleanList.join("/");
  }

  // Fallback: filter out "PC" if there are other terms, otherwise return the joined list
  const filteredRaw = rawList.filter(p => p.toLowerCase() !== "pc");
  if (filteredRaw.length > 0) {
    return filteredRaw.join("/");
  }

  return "PC";
}

/**
 * Resolves a GamerPower redirect URL to the direct storefront URL (Steam/Epic/etc.)
 */
export async function resolveGamerPowerRedirect(url: string): Promise<string> {
  if (!url || !url.includes('gamerpower.com/open/')) {
    return url;
  }
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location) return location;
    }
    if (response.status === 200) {
      return response.url;
    }
  } catch (err) {
    console.warn('[dealUtils] Manual redirect check failed:', err);
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    return response.url || url;
  } catch (err) {
    console.warn('[dealUtils] Fallback redirect check failed:', err);
    return url;
  }
}

const sessionFailedUrls = new Set<string>();

export function isSessionFailedUrl(url: string): boolean {
  return sessionFailedUrls.has(url);
}

export function markSessionFailedUrl(url: string): void {
  if (url) sessionFailedUrls.add(url);
}

export function clearSessionFailedUrls(): void {
  sessionFailedUrls.clear();
}

export function normalizeImageUrl(url?: string | null): string | null {
  if (!url || typeof url !== 'string') return null;
  let clean = url.trim();
  clean = clean
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');

  const lower = clean.toLowerCase();
  if (
    lower === '' ||
    lower === 'self' ||
    lower === 'default' ||
    lower === 'nsfw' ||
    lower === 'spoiler' ||
    lower === 'placeholder' ||
    lower === 'null' ||
    lower === 'undefined' ||
    !lower.startsWith('http')
  ) {
    return null;
  }

  if (clean.startsWith('http://')) {
    clean = 'https://' + clean.slice(7);
  }
  return clean;
}

export function isValidArtworkUrl(url?: string | null): boolean {
  const normalized = normalizeImageUrl(url);
  if (!normalized) return false;
  return true;
}

export function cleanDisplayTitle(rawTitle?: string | null): string {
  if (!rawTitle) return '';
  let title = rawTitle;
  title = title
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Remove bracket/parentheses store notes: [Steam], (Steam), [GOG], (GOG), [Epic], (Epic Games), [itch.io], etc.
  title = title.replace(/\s*(\[|\()\s*(Steam|GOG|Epic Games|Epic|itch\.io|itch|PlayStation|PS[45]|Xbox|Ubisoft|Apple|Google Play|Stove|Alienware|Gleam|Givee\.club|Indiegala)\s*(\]|\))/gi, '');

  // Remove "on Steam", "on Epic", "on GOG", etc.
  title = title.replace(/\s+(?:on|via)\s+(?:Steam|Epic Games|Epic|GOG|itch\.io|itch|PlayStation|Xbox|Ubisoft|Stove)\b/gi, '');

  // Remove trailing " Steam", " Epic Games", " GOG", " itch.io"
  title = title.replace(/\s+(?:Steam|Epic Games|Epic|GOG|itch\.io)\s*$/gi, '');

  // Clean trailing dashes, colons, or pipes if left over
  title = title.replace(/\s*[-–—|:]\s*$/, '').trim();

  return title || rawTitle;
}

export function getGameCover(id: string = '', url?: string, steamUrl?: string, extraText?: string): string {
  const searchString = `${url || ''} ${id || ''} ${steamUrl || ''} ${extraText || ''}`;

  // 1. Steam App ID extraction from URL or ID
  const steamAppMatch = searchString.match(/(?:steampowered\.com\/app|steamcommunity\.com\/app|steamdb\.info\/app|steam\/apps)\/(\d+)/i);
  if (steamAppMatch && steamAppMatch[1]) {
    return `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${steamAppMatch[1]}/header.jpg`;
  }

  // 2. Steam sub package extraction
  const steamSubMatch = searchString.match(/(?:steampowered\.com\/sub|steam\/subs)\/(\d+)/i);
  if (steamSubMatch && steamSubMatch[1]) {
    return `https://shared.akamai.steamstatic.com/store_item_assets/steam/subs/${steamSubMatch[1]}/header.jpg`;
  }

  // 3. GamerPower direct offer thumbnail (handles numeric, hex, and slugs)
  const gpNumericId = id.replace(/^gp_/, '').trim();
  if (/^\d{3,6}$/.test(gpNumericId)) {
    return `https://www.gamerpower.com/offers-1/${gpNumericId}.jpg`;
  } else if (/^[a-zA-Z0-9_\-]{3,}$/.test(gpNumericId)) {
    return `https://www.gamerpower.com/offers/1b/${gpNumericId}.jpg`;
  }

  // 4. Direct image link in URL
  if (url && /\.(?:jpe?g|png|webp)(?:\?.*)?$/i.test(url)) {
    return url;
  }

  // Never return an unrelated game (like Destiny 2 or Team Fortress 2) as placeholder
  return '';
}

/**
 * Calculates total monetary value saved for a list of claimed deals.
 * Used identically across Home and Vault screens to guarantee 100% matched values.
 */
export function calculateVaultValue(deals: Deal[]): number {
  if (!Array.isArray(deals) || deals.length === 0) return 0;
  return deals.reduce((sum, d) => {
    if (!d || !d.worth || d.isEstimated) return sum;
    const num = parseFloat(d.worth.replace(/[^0-9.]/g, ''));
    return sum + (isNaN(num) ? 0 : num);
  }, 0);
}

/**
 * Detects if a post/deal was removed or flagged by moderators on Reddit.
 * Filters out posts with mod flairs, deletion markers, and mod posts.
 */
export function isPostRemovedByModerator(item?: any): boolean {
  if (!item) return true;
  const t = (item.title || '').toLowerCase().trim();
  const flair = (item.link_flair_text || item.flair || '').toLowerCase().trim();
  const author = (item.author || '').toLowerCase().trim();
  const body = (item.selftext || item.description || item.content || '').toLowerCase().trim();

  // 1. Mod / administrative / megathread posts
  if (
    t.includes('mod post') ||
    t.includes('mega thread') ||
    t.includes('megathread') ||
    t.includes('weekly discussion') ||
    t.includes('exiled giveaways')
  ) {
    return true;
  }

  // 2. Title indicators of deletion/removal
  if (
    t === '[removed]' ||
    t === '[deleted]' ||
    t === '[removed by moderator]' ||
    t.includes('removed by moderator') ||
    t.includes('[removed by reddit]')
  ) {
    return true;
  }

  // 3. Removed by category / deleted author
  if (item.removed_by_category || author === '[deleted]') {
    return true;
  }

  // 4. Marked expired on item
  if (item.isExpired === true) {
    return true;
  }

  // 5. Flair indicators (FGF uses "Removed", "Removed - Rule X", "Rule Violation", "Expired", "Ended")
  if (
    flair === 'removed' ||
    flair.startsWith('removed -') ||
    flair.startsWith('removed:') ||
    flair.startsWith('removed ') ||
    flair.includes('rule violation') ||
    flair.includes('expired') ||
    flair.includes('ended') ||
    expiredFeedService.isExpired(item)
  ) {
    return true;
  }

  // 5. Body/selftext completely replaced with [removed]
  if (body === '[removed]' || body === '[removed by moderator]') {
    return true;
  }

  return false;
}

/**
 * Extracts Steam App ID from any URL or string.
 */
export function extractSteamAppId(url?: string | null): string | null {
  if (!url) return null;
  const match = url.match(/(?:steampowered\.com\/(?:[a-z_\-]+\/)?app|steamdb\.info\/app|steamcommunity\.com\/app|steam\/apps|\/app)\/(\d+)/i);
  return match && match[1] ? match[1] : null;
}

/**
 * Resolves giveaway host name and task indicator for non-store host giveaways (Gleam, Givee.club, etc.)
 */
export function getGiveawayHostName(deal?: Deal | null): { host: string; isTaskHost: boolean } {
  if (!deal) return { host: 'Store', isTaskHost: false };
  const target = (deal.giveawayUrl || deal.url || '').toLowerCase();

  if (target.includes('gleam.io') || target.includes('gleam')) return { host: 'Gleam', isTaskHost: true };
  if (target.includes('givee.club')) return { host: 'Givee.club', isTaskHost: true };
  if (target.includes('keylol.com') || target.includes('keylol')) return { host: 'Keylol', isTaskHost: true };
  if (target.includes('grabfreegame')) return { host: 'GrabFreeGame', isTaskHost: true };
  if (target.includes('alienwarearena.com') || target.includes('alienware')) return { host: 'Alienware Arena', isTaskHost: true };
  if (target.includes('onstove.com') || target.includes('stove')) return { host: 'Stove', isTaskHost: false };
  if (target.includes('primegaming') || target.includes('amazon')) return { host: 'Prime Gaming', isTaskHost: false };

  if (deal.claimMethod === 'tasks') {
    if (deal.entrySiteLabel) return { host: deal.entrySiteLabel, isTaskHost: true };
    return { host: deal.platform || 'Giveaway', isTaskHost: true };
  }

  return { host: deal.platform || 'Store', isTaskHost: false };
}

/**
 * Classifies the giveaway host:
 * Direct storefront (Steam, Epic, GOG, itch, etc.) vs Entry-required (Gleam, Givee, etc.)
 */
export function classifyGiveawayHost(giveawayUrl?: string | null): {
  isDirectClaim: boolean;
  isEntryRequired: boolean;
  siteLabel: string;
  hostDomain: string;
} {
  let hostname = '';
  if (giveawayUrl) {
    try {
      const parsed = new URL(giveawayUrl);
      hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      const match = giveawayUrl.match(/https?:\/\/(?:www\.)?([^\/\s]+)/i);
      hostname = match ? match[1].toLowerCase() : '';
    }
  }

  const isNonStore = hostname.includes('gleam') || hostname.includes('givee') || hostname.includes('keylol') || hostname.includes('grabfreegame');

  return {
    isDirectClaim: !isNonStore,
    isEntryRequired: isNonStore,
    siteLabel: isNonStore ? (hostname.includes('gleam') ? 'Gleam' : hostname.includes('givee') ? 'Givee.club' : 'Entry required') : 'Direct claim',
    hostDomain: hostname,
  };
}

/**
 * Thumbnail Priority:
 * (a) GamerPower image (always present on GamerPower deals)
 * (b) Steam official CDN (header.jpg / library_600x900.jpg) if an app ID is present
 * (c) Live giveaway image (preview or thumbnail HTTPS URL)
 * (d) Flat fallback.
 */
export function getArtSourceChain(deal?: Deal | null, format: 'portrait' | 'wide' = 'wide'): string[] {
  if (!deal) return [];
  const chain: string[] = [];
  const added = new Set<string>();

  const addUri = (uri?: string | null) => {
    if (uri && isValidArtworkUrl(uri) && !added.has(uri)) {
      added.add(uri);
      chain.push(uri);
    }
  };

  // 1. GamerPower image variants
  const gpMatch = (deal.image || '').match(/gamerpower\.com\/(?:offers(?:-1|\/1b|\/1)?)\/([a-zA-Z0-9_\-]+)\.jpg/i);
  const gpKey = gpMatch ? gpMatch[1] : (deal.gamerPowerId || (deal.id && deal.id.startsWith('gp_') ? deal.id.replace('gp_', '') : ''));

  if (gpKey) {
    if (/^\d{3,6}$/.test(gpKey)) {
      addUri(`https://www.gamerpower.com/offers-1/${gpKey}.jpg`);
      addUri(`https://www.gamerpower.com/offers/1b/${gpKey}.jpg`);
      addUri(`https://www.gamerpower.com/offers/1/${gpKey}.jpg`);
      addUri(`https://www.gamerpower.com/offers/${gpKey}.jpg`);
    } else {
      addUri(`https://www.gamerpower.com/offers/1b/${gpKey}.jpg`);
      addUri(`https://www.gamerpower.com/offers-1/${gpKey}.jpg`);
      addUri(`https://www.gamerpower.com/offers/1/${gpKey}.jpg`);
      addUri(`https://www.gamerpower.com/offers/${gpKey}.jpg`);
    }
  }

  // 2. Steam App ID check (Steam official CDN is ultra-reliable, unthrottled, and instant)
  const allUrls = [
    deal.storeUrl,
    deal.steamUrl,
    deal.url,
    deal.giveawayUrl,
    deal.description,
    deal.instructions,
    deal.aboutGame,
    deal.title,
    (deal as any).steamAppId ? `/app/${(deal as any).steamAppId}` : '',
  ].filter(Boolean).join(' ');

  const appId = extractSteamAppId(allUrls);
  if (appId) {
    const headerAkamai = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;
    const headerCloudflare = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
    const portraitUri = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`;
    const capsuleUri = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/capsule_616x353.jpg`;
    const akamaiHd = `https://steamcdn-a.akamaihd.net/steam/apps/${appId}/header.jpg`;

    if (format === 'portrait') {
      addUri(portraitUri);
      addUri(headerAkamai);
      addUri(headerCloudflare);
      addUri(capsuleUri);
      addUri(akamaiHd);
    } else {
      addUri(headerAkamai);
      addUri(headerCloudflare);
      addUri(capsuleUri);
      addUri(akamaiHd);
      addUri(portraitUri);
    }
  }

  // 3. Direct image link on deal
  if (deal.image) {
    addUri(deal.image);
  }

  // 4. Extra thumbnail or coverImage if present
  if ((deal as any).thumbnail) {
    addUri((deal as any).thumbnail);
  }
  if ((deal as any).coverImage) {
    addUri((deal as any).coverImage);
  }

  return chain;
}

/**
 * Strictly verifies that a deal is a full standalone game,
 * excluding DLCs, expansions, season passes, beta/playtest keys,
 * in-game items, and loot packs.
 */
export function isGameOnlyDeal(deal: Deal): boolean {
  if (!deal) return false;

  // 1. Strict deal.type checks
  const typeLower = (deal.type || '').toLowerCase().trim();
  if (['dlc', 'beta', 'item', 'loot'].includes(typeLower)) {
    return false;
  }
  if (typeLower !== 'full_game' && typeLower !== 'mobile_game' && typeLower !== 'game') {
    return false;
  }

  // 2. Steam App metadata check (if enriched)
  if (deal.isGame === false) {
    return false;
  }

  const title = deal.title || '';
  const desc = `${deal.description || ''} ${deal.instructions || ''}`.toLowerCase();

  // 3. Title bracket/parenthesis tags: [DLC], (DLC), [Beta], (Beta), [Alpha], [Playtest], etc.
  if (/(\[|\()(?:dlc|beta|alpha|playtest|demo|other|item|loot|pack)(\]|\))/i.test(title)) {
    return false;
  }

  // 4. Keyword boundaries in title
  if (/\b(?:dlc|expansion|add-on|addon|season pass|soundtrack|ost|playtest|closed beta|open beta|beta test|tech demo)\b/i.test(title)) {
    return false;
  }

  // 5. In-game item pack / skin pack keywords in title
  if (/\b(?:starter pack|skin bundle|in-game pack|weapons pack|bonus pack|content pack)\b/i.test(title)) {
    return false;
  }

  // 6. Explicit requirement of base game in description
  if (desc.includes('requires base game') || desc.includes('base game required') || desc.includes('base game is required')) {
    return false;
  }

  return true;
}
