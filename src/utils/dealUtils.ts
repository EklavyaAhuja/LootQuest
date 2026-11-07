import { Platform } from 'react-native';
import { Deal } from '../models/Deal';
import { expiredFeedService } from '../services/ExpiredFeedService';

/**
 * Computes the exact UTC ISO expiry date string for Epic Games' weekly Thursday giveaway.
 * Epic giveaways run Thursday 15:00:00 UTC (8:30 PM IST) to Thursday 15:00:00 UTC.
 */
export function getEpicWeeklyExpiry(referenceDateMs: number = Date.now()): string {
  const d = new Date(referenceDateMs);
  const currentDay = d.getUTCDay(); // 0 is Sunday, 4 is Thursday
  const currentHour = d.getUTCHours();
  const currentMin = d.getUTCMinutes();

  let daysUntilThursday = (4 - currentDay + 7) % 7;
  // If today is Thursday:
  if (daysUntilThursday === 0) {
    // If it's already past 15:00 UTC on Thursday, the current giveaway ends NEXT Thursday (7 days later)
    if (currentHour > 15 || (currentHour === 15 && currentMin > 0)) {
      daysUntilThursday = 7;
    }
  }

  const expiry = new Date(Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() + daysUntilThursday,
    15, 0, 0, 0
  ));
  return expiry.toISOString();
}

/**
 * Normalizes any Epic Games end date (PC or Mobile) so that:
 * 1. If it has a date (e.g. from GamerPower "2026-10-22 23:59:00"), the time is corrected to 15:00:00.000Z (8:30 PM IST).
 * 2. If it is null/undefined/N/A, it is assigned the current Epic weekly Thursday 15:00 UTC expiry.
 */
export function normalizeEpicEndDate(rawDate?: string | null): string {
  if (!rawDate || rawDate.trim() === '' || rawDate.toUpperCase() === 'N/A') {
    return getEpicWeeklyExpiry();
  }
  const match = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    return new Date(Date.UTC(year, month, day, 15, 0, 0, 0)).toISOString();
  }
  return getEpicWeeklyExpiry();
}

/**
 * Robust Hermes-safe date parser that maps date strings to Unix milliseconds.
 * Returns NaN for empty, missing, or unparseable dates (never Date.now() to prevent false expirations).
 */
export function parseDateToMs(dateStr?: string | null): number {
  if (!dateStr || typeof dateStr !== 'string') {
    return NaN;
  }
  const trimmed = dateStr.trim();
  if (
    trimmed === '' ||
    trimmed.toUpperCase() === 'N/A' ||
    trimmed.toUpperCase().includes('PERMANENT') ||
    trimmed.toUpperCase().includes('NO EXP') ||
    trimmed.toUpperCase().includes('UNKNOWN') ||
    trimmed.toUpperCase() === 'LIVE'
  ) {
    return NaN;
  }
  try {
    let normalized = trimmed;
    
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
  return NaN;
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
  const plat = (deal.platform || '').toLowerCase();
  const urlLower = (deal.url || deal.giveawayUrl || deal.storeUrl || '').toLowerCase();

  // Filter out ancient stale itch.io and IndieGala drops given fake ending-today dates
  const isItchOrIndieGala = plat.includes('itch') || plat.includes('indiegala') || urlLower.includes('itch.io') || urlLower.includes('indiegala');
  if (isItchOrIndieGala) {
    if (
      t.includes('cherophobia') ||
      t.includes('lord and savior') ||
      t.includes('game dev simulator') ||
      t.includes('roseblight') ||
      t.includes('project malice') ||
      t.includes('buckler') ||
      t.includes('solace inc') ||
      t.includes('ancient evil') ||
      t.includes('last room') ||
      t.includes('best plumber') ||
      t.includes('sausage hunter') ||
      t.includes('battle ram') ||
      t.includes('leaper') ||
      t.includes('my darkest witch')
    ) {
      return true;
    }
  }

  // Check staleness by published date: giveaways published > 60 days ago with near-term or today end dates
  const pubTime = deal.publishedAt || deal.createdAt;
  if (pubTime && typeof pubTime === 'number') {
    const ageDays = (Date.now() - pubTime) / (1000 * 60 * 60 * 24);
    if (isItchOrIndieGala && ageDays > 25) {
      return true;
    }
    if (ageDays > 60 && dateStr && !dateStr.toUpperCase().includes('PERMANENT')) {
      return true;
    }
  }

  if (
    t.includes('fireside feelings') ||
    c.includes('fireside feelings') ||
    t.includes('fireside_feelings') ||
    t.includes('pony island') ||
    c.includes('pony island') ||
    t.includes('pony_island') ||
    t.includes('blair witch') ||
    c.includes('blair witch') ||
    t.includes('for honor') ||
    c.includes('for honor') ||
    t.includes('survivor starter pack') ||
    c.includes('survivor starter pack') ||
    t.includes('dead frontier') ||
    c.includes('dead frontier') ||
    (t.includes('survivor') && (plat.includes('steam') || urlLower.includes('steam'))) ||
    deal.id === '1x2c8f2' ||
    deal.id === '1x1qq4d' ||
    deal.id === 't3_1x1qq4d' ||
    deal.id === '1x026p2' ||
    deal.id === 't3_1x026p2' ||
    (deal.url && (deal.url.includes('2990600') || deal.url.includes('405640') || deal.url.includes('1092660'))) ||
    (deal.giveawayUrl && (deal.giveawayUrl.includes('2990600') || deal.giveawayUrl.includes('405640') || deal.giveawayUrl.includes('1092660'))) ||
    (deal.storeUrl && (deal.storeUrl.includes('2990600') || deal.storeUrl.includes('405640') || deal.storeUrl.includes('1092660')))
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
 * For Epic Games weekly giveaways, normalizes to Thursday 15:00 UTC and ensures time never exceeds 7 days.
 */
export const getTimeLeft = (endDate: string | null | undefined, platform?: string): string => {
  if (!endDate || endDate.trim() === '' || endDate.toUpperCase() === 'N/A') {
    return "No expiry";
  }

  const isEpic = !!(platform && (platform.toLowerCase().includes('epic') || platform.toLowerCase().includes('epic games')));
  const effectiveEndDate = isEpic ? normalizeEpicEndDate(endDate) : endDate;

  const endTime = parseDateToMs(effectiveEndDate);
  const now = Date.now();
  const diffMs = endTime - now;

  if (diffMs <= 0) return "Expired";

  let diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  // Cap at 7 days (168 hours) if it's an Epic Games weekly giveaway
  if (isEpic && diffHours > 168) {
    diffHours = 168;
  }

  if (diffHours >= 24) {
    const days = Math.floor(diffHours / 24);
    if (days > 30) {
      return "Ongoing";
    }
    const remHours = diffHours % 24;
    return `${days}d ${remHours}h left`;
  } else if (diffHours >= 1) {
    return `${diffHours}h ${diffMinutes}m left`;
  } else {
    return `${diffMinutes}m left`;
  }
};

export const STORE_DOMAINS = [
  'steampowered.com',
  'steamcommunity.com',
  'epicgames.com',
  'gog.com',
  'itch.io',
  'playstation.com',
  'sony.com',
  'xbox.com',
  'microsoft.com',
  'ubisoft.com',
  'ea.com',
  'origin.com',
  'indiegala.com',
  'gaming.amazon.com',
  'amazon.com',
  'onstove.com',
  'stove.com',
  'blizzard.com',
  'battle.net',
  'rockstargames.com',
  'play.google.com',
  'apps.apple.com',
];

export function isStoreHost(giveawayUrl?: string | null): boolean {
  if (!giveawayUrl) return false;
  let hostname = '';
  try {
    const parsed = new URL(giveawayUrl);
    hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    const match = giveawayUrl.match(/https?:\/\/(?:www\.)?([^\/\s]+)/i);
    hostname = match ? match[1].toLowerCase() : '';
  }
  if (!hostname) return false;

  return STORE_DOMAINS.some((domain) => hostname === domain || hostname.endsWith('.' + domain));
}

export function isThirdPartyTaskHost(dealOrText: any): boolean {
  if (!dealOrText) return false;
  let text = '';
  if (typeof dealOrText === 'string') {
    text = dealOrText.toLowerCase();
  } else {
    const plat = (dealOrText.platform || '').toLowerCase();
    const plats = Array.isArray(dealOrText.platforms) ? dealOrText.platforms.join(' ').toLowerCase() : '';
    const title = (dealOrText.title || '').toLowerCase();
    const desc = (dealOrText.description || '').toLowerCase();
    const inst = (dealOrText.instructions || '').toLowerCase();
    const url = (dealOrText.open_giveaway_url || dealOrText.giveawayUrl || dealOrText.url || '').toLowerCase();
    text = `${plat} ${plats} ${title} ${desc} ${inst} ${url}`;
  }

  const externalHosts = [
    'alienware',
    'steelseries',
    'gaming.lenovo.com',
    'lenovo legion',
    'gleam.io',
    'gleam',
    'givee.club',
    'givee',
    'keylol',
    'grabfreegame',
    'opiumpulses',
    'gamehag',
    'giveaway.su',
    'giveawaysu',
    'simplo.gg',
  ];

  return externalHosts.some((h) => text.includes(h));
}

/**
 * Smartly determines the claim difficulty (one_click vs tasks) of a deal.
 * External task hosts (Alienware Arena, SteelSeries, Gleam, Givee, etc.) require tasks.
 * Store hosts (steam, epic, gog, itch, playstation, xbox, ubisoft...) = One-click.
 */
export function determineClaimMethod(
  instructions: string = "",
  title: string = "",
  platforms: string = "",
  url: string = "",
  id?: string,
  source?: string
): "one_click" | "tasks" | "unknown" {
  const combinedText = `${instructions} ${title} ${platforms} ${url}`;
  // 1. External task host (Alienware Arena, SteelSeries, Gleam, Givee, Lenovo, etc.)
  if (isThirdPartyTaskHost(combinedText)) {
    return "tasks";
  }

  const targetUrl = (url || '').trim();

  // 2. Direct store host (steam, epicgames, gog, itch, playstation, xbox, etc.) -> one_click
  if (targetUrl && isStoreHost(targetUrl)) {
    return "one_click";
  }

  // 3. GamerPower giveaways not on third-party task hosts are one-click
  if (
    source === 'gamerpower' ||
    (id && String(id).startsWith('gp_')) ||
    (url && url.toLowerCase().includes('gamerpower.com'))
  ) {
    return "one_click";
  }

  if (!targetUrl) {
    return "one_click";
  }

  // 4. Non-store external hosts -> tasks required
  return "tasks";
}

/**
 * Normalizes title for deduplication comparison
 */
export function normalizeTitle(t: string): string {
  if (!t) return "";
  return t
    .toLowerCase()
    .replace(/\[[^\]]+\]/g, "") // remove brackets e.g. [Epic Games]
    .replace(/\([^)]+\)/g, "")   // remove parentheses e.g. (Game)
    .replace(/\b(?:giveaways?|giveaway|giveaways|free|loot|pack|drop)\b/gi, "") // strip giveaway buzzwords
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
export function getCanonicalKey(title: string, platform: string, url?: string): string {
  const norm = normalizeTitle(title);
  const plat = getCanonicalPlatform(platform);
  // Universal common denominator between GamerPower and Reddit / Epic is the normalized title and canonical platform
  if (norm.length >= 3) {
    return `${norm}_${plat}`;
  }
  if (url) {
    const steamId = extractSteamAppId(url);
    if (steamId) return `steam_${steamId}_${plat}`;
    const epicMatch = url.match(/epicgames\.com\/(?:[a-z]{2}(?:-[A-Za-z]{2})?\/)?(?:p|product|bundles)\/([a-z0-9_\-]+)/i);
    if (epicMatch) {
      const slug = epicMatch[1].replace(/-[a-z0-9]{6}$/, '').toLowerCase();
      return `epic_${slug}_${plat}`;
    }
  }
  return `${norm}_${plat}`;
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
  
  // 1. Epic Instant Checkout (bypasses "Download the Epic Games App" mobile wall)
  const epicCheckoutPattern = /(https?:\/\/store\.epicgames\.com\/purchase\?offers=[^\s)"']*)/i;
  const epicCheckoutMatch = text.match(epicCheckoutPattern);
  if (epicCheckoutMatch) return epicCheckoutMatch[1];

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
  if (text.includes("gaming.lenovo.com") || text.includes("lenovo legion")) {
    return "Lenovo Legion";
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
  const isMobile =
    text.includes("mobile") ||
    text.includes("android") ||
    text.includes("ios") ||
    text.includes("google play") ||
    text.includes("app store");

  if (text.includes("epicgames.com") || text.includes("epic games") || text.includes("epic")) {
    return isMobile ? "Epic Games Mobile" : "Epic Games";
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

  // On web, direct cross-origin fetches to gamerpower.com are blocked by browser CORS.
  // Direct clicking opens the link in a browser tab where redirects work out-of-the-box.
  if (Platform.OS === 'web' || typeof window !== 'undefined') {
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
  } catch {
    // Silent fallback to avoid noisy console spam on network timeout/CORS
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    return response.url || url;
  } catch {
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
    !lower.startsWith('http') ||
    lower.includes('library_hero') ||
    lower.includes('page_bg')
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

  // Remove GamerPower/giveaway buzzwords: "Giveaway", "Giveaways", "Free"
  title = title.replace(/\s+(?:giveaways?|giveaway|giveaways)\b/gi, '');
  title = title.replace(/\s*\(?\s*(?:giveaway|giveaways|free)\s*\)?\s*$/gi, '');

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

  // 3. GamerPower direct offer thumbnail (ONLY for true GamerPower deals)
  const isGamerPower = id.startsWith('gp_') || searchString.includes('gamerpower.com');
  if (isGamerPower) {
    const gpNumericId = id.replace(/^gp_/, '').trim();
    if (/^\d{3,6}$/.test(gpNumericId)) {
      return `https://www.gamerpower.com/offers-1/${gpNumericId}.jpg`;
    } else if (/^[a-zA-Z0-9_\-]{3,}$/.test(gpNumericId) && !gpNumericId.startsWith('1x') && !/^[a-z0-9]{6,8}$/i.test(gpNumericId)) {
      return `https://www.gamerpower.com/offers/1b/${gpNumericId}.jpg`;
    }
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
 * Calculates sum of retail values of deals that are live right now and not yet claimed.
 * Skips deals with no known price (never defaults to zero or fallback price),
 * and counts each game once (deduplicated by normalized title).
 */
export function calculateFreeRightNowValue(
  activeDeals: Deal[],
  claimedMap: Record<string, boolean> = {}
): number {
  if (!Array.isArray(activeDeals) || activeDeals.length === 0) return 0;
  const seenGames = new Set<string>();
  let total = 0;

  for (const deal of activeDeals) {
    if (!deal) continue;
    // Must be unclaimed
    if (claimedMap[deal.id]) continue;
    // Skip deals with no known price (do not count as zero, no fallback)
    if (!deal.worth || deal.isEstimated) continue;
    const cleanStr = deal.worth.replace(/[^0-9.]/g, '');
    const num = parseFloat(cleanStr);
    if (isNaN(num) || num <= 0) continue;

    // Count each game once
    const normKey = cleanDisplayTitle(deal.title || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    if (!normKey || seenGames.has(normKey)) continue;
    seenGames.add(normKey);

    total += num;
  }

  return total;
}

/**
 * Detects if a post/deal was removed or flagged by moderators on Reddit.
 * Filters out posts with mod flairs, deletion markers, and mod posts.
 */
export function isPostRemovedByModerator(item?: any): boolean {
  if (!item) return true;
  const target = item.data || item;
  const t = (target.title || target.cleanTitle || '').toLowerCase().trim();
  const flair = (target.link_flair_text || target.flair || '').toLowerCase().trim();
  const author = (target.author || '').toLowerCase().trim();
  const body = (target.selftext || target.description || target.content || target.body || '').toLowerCase().trim();

  // 1. Mod / administrative / megathread posts
  if (
    t.includes('mod post') ||
    t.includes('mega thread') ||
    t.includes('megathread') ||
    t.includes('weekly discussion') ||
    t.includes('exiled giveaways') ||
    t.includes('your furry mother') ||
    (target.id && String(target.id).includes('1x8hfcw'))
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

  // 3. removed_by_category set to anything (moderator, automod_filtered, reddit, deleted, author, etc.)
  if (
    target.removed_by_category !== undefined &&
    target.removed_by_category !== null &&
    target.removed_by_category !== '' &&
    target.removed_by_category !== false
  ) {
    return true;
  }

  // 4. Removal reason present (removal_reason, mod_note, etc.)
  if (
    (target.removal_reason !== undefined && target.removal_reason !== null && target.removal_reason !== '' && target.removal_reason !== false) ||
    (target.mod_note !== undefined && target.mod_note !== null && target.mod_note !== '')
  ) {
    return true;
  }

  // 5. Author is deleted
  if (
    author === '[deleted]' ||
    author === 'deleted' ||
    author === '/u/[deleted]' ||
    author === 'u/[deleted]'
  ) {
    return true;
  }

  // 6. Body text of [removed] or [deleted]
  if (
    body === '[removed]' ||
    body === '[removed by moderator]' ||
    body === '[deleted]' ||
    body.startsWith('[removed]') ||
    body.startsWith('[deleted]')
  ) {
    return true;
  }

  // 7. Banned, removed flag, robot indexable false, or Arctic Shift removal meta
  if (
    Boolean(target.banned_by) ||
    Boolean(target.banned_at_utc) ||
    target.removed === true ||
    target.is_robot_indexable === false ||
    target._meta?.was_deleted_later === true ||
    (target._meta?.removal_type && target._meta.removal_type !== 'none')
  ) {
    return true;
  }

  // 8. Marked expired on item
  if (target.isExpired === true) {
    return true;
  }

  // 9. Flair indicators (FGF uses "Removed", "Removed - Rule X", "Rule Violation", "Expired", "Ended")
  if (
    flair === 'removed' ||
    flair.includes('removed') ||
    flair.includes('rule violation') ||
    flair.includes('rule break') ||
    flair.includes('expired') ||
    flair.includes('ended') ||
    expiredFeedService.isExpired(target)
  ) {
    return true;
  }

  // 10. Original Reddit Title indicators
  const origTitle = (target.originalRedditTitle || '').toLowerCase().trim();
  if (
    origTitle === '[removed]' ||
    origTitle === '[deleted]' ||
    origTitle.includes('removed by moderator') ||
    origTitle.includes('[removed by reddit]')
  ) {
    return true;
  }

  // 11. Nested raw post indicators
  if (target.rawRedditData && target.rawRedditData !== target) {
    if (isPostRemovedByModerator(target.rawRedditData)) return true;
  }
  if (target.rawPost && target.rawPost !== target) {
    if (isPostRemovedByModerator(target.rawPost)) return true;
  }

  // 8. Self/text posts whose giveaway link is just the Reddit comments page itself without external store destination
  const rawUrl = (item.giveawayUrl || item.url || '').toLowerCase();
  const isOnlyRedditLink = rawUrl.includes('/r/freegamefindings/comments/') &&
    !item.storeUrl &&
    !item.steamUrl &&
    !item.steamAppId;
  if (isOnlyRedditLink) {
    if (
      body === '[removed]' ||
      Boolean(item.removed_by_category) ||
      item.is_robot_indexable === false ||
      item.domain === 'self.FreeGameFindings' ||
      t.includes('geometry dash') ||
      t.includes('rocksmith') ||
      t.includes('polycraft')
    ) {
      return true;
    }
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

  // GamerPower giveaways are always one-click store drops, never tasks
  if (deal.source === 'gamerpower' || (deal.id && String(deal.id).startsWith('gp_')) || target.includes('gamerpower.com')) {
    return { host: deal.platform || 'Store', isTaskHost: false };
  }

  if (target.includes('gaming.lenovo.com') || target.includes('lenovo')) return { host: 'Lenovo Legion', isTaskHost: true };
  if (target.includes('steelseries.com') || target.includes('steelseries')) return { host: 'SteelSeries', isTaskHost: true };
  if (target.includes('gleam.io') || target.includes('gleam')) return { host: 'Gleam', isTaskHost: true };
  if (target.includes('givee.club')) return { host: 'Givee.club', isTaskHost: true };
  if (target.includes('keylol.com') || target.includes('keylol')) return { host: 'Keylol', isTaskHost: true };
  if (target.includes('grabfreegame')) return { host: 'GrabFreeGame', isTaskHost: true };
  if (target.includes('alienwarearena.com') || target.includes('alienware')) return { host: 'Alienware Arena', isTaskHost: true };
  if (target.includes('onstove.com') || target.includes('stove')) return { host: 'Stove', isTaskHost: false };
  if (target.includes('primegaming') || target.includes('gaming.amazon') || target.includes('amazon')) return { host: 'Prime Gaming', isTaskHost: false };

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

  if (hostname.includes('gamerpower.com') || (giveawayUrl && giveawayUrl.includes('gamerpower.com'))) {
    return {
      isDirectClaim: true,
      isEntryRequired: false,
      siteLabel: 'Direct claim',
      hostDomain: hostname || 'gamerpower.com',
    };
  }

  const isStore = isStoreHost(giveawayUrl);

  return {
    isDirectClaim: isStore,
    isEntryRequired: !isStore,
    siteLabel: isStore
      ? 'Direct claim'
      : hostname.includes('gleam')
      ? 'Gleam'
      : hostname.includes('givee')
      ? 'Givee.club'
      : 'Tasks required',
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

  const isPortraitUrl = (u?: string | null) => {
    if (!u) return false;
    const l = u.toLowerCase();
    return l.includes('library_600x900') || l.includes('tall') || l.includes('600x900') || l.includes('portrait');
  };

  const addUri = (uri?: string | null) => {
    if (uri && isValidArtworkUrl(uri) && !added.has(uri)) {
      if (format === 'wide' && isPortraitUrl(uri)) {
        return;
      }
      added.add(uri);
      chain.push(uri);
    }
  };

  // 0. Epic Games: If deal is on Epic Games, prioritize official Epic artwork
  const isEpic = (deal.platform || '').toLowerCase().includes('epic') ||
                 (deal.storeUrl || '').includes('epicgames.com') ||
                 (deal.giveawayUrl || '').includes('epicgames.com') ||
                 (deal.url || '').includes('epicgames.com') ||
                 (deal.image || '').includes('epicgames.com');

  if (isEpic) {
    if (format === 'portrait') {
      if (deal.resolvedPoster) addUri(deal.resolvedPoster);
      if (deal.image) addUri(deal.image);
      if ((deal as any).thumbnail) addUri((deal as any).thumbnail);
      if ((deal as any).coverImage) addUri((deal as any).coverImage);
    } else {
      if (deal.resolvedImage) addUri(deal.resolvedImage);
      if (deal.image && !isPortraitUrl(deal.image)) addUri(deal.image);
      if ((deal as any).coverImage && !isPortraitUrl((deal as any).coverImage)) addUri((deal as any).coverImage);
    }
  }

  // 1. GamerPower image variants (ONLY for actual GamerPower deals, never for Reddit post IDs)
  const isActualGamerPower = deal.source === 'gamerpower' || (deal.id && deal.id.startsWith('gp_')) || !!(deal as any).gamerPowerId;
  const gpMatch = (deal.image || '').match(/gamerpower\.com\/(?:offers(?:-1|\/1b|\/1)?)\/([a-zA-Z0-9_\-]+)\.jpg/i);
  
  if (isActualGamerPower) {
    const gpKey = gpMatch ? gpMatch[1] : (deal.gamerPowerId || (deal.id && deal.id.startsWith('gp_') ? deal.id.replace('gp_', '') : ''));
    if (gpKey && !gpKey.startsWith('1x') && /^\d+$/.test(gpKey)) {
      addUri(`https://www.gamerpower.com/offers-1/${gpKey}.jpg`);
      addUri(`https://www.gamerpower.com/offers/1b/${gpKey}.jpg`);
      addUri(`https://www.gamerpower.com/offers/1/${gpKey}.jpg`);
      addUri(`https://www.gamerpower.com/offers/${gpKey}.jpg`);
    } else if (gpKey && !gpKey.startsWith('1x') && /^[a-zA-Z0-9_\-]{3,}$/.test(gpKey) && !/^[a-z0-9]{6,8}$/i.test(gpKey)) {
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

/**
 * Detects whether a deal belongs to Prime Gaming / Amazon Prime.
 */
export function isPrimeDeal(deal?: Deal | null): boolean {
  if (!deal) return false;
  if (deal.isBundleNotice) return true;
  const plat = (deal.platform || '').toLowerCase();
  const store = ((deal as any).store || '').toLowerCase();
  const title = (deal.title || '').toLowerCase();
  const combined = `${plat} ${store} ${title}`;
  const urls = [deal.url, deal.storeUrl, deal.giveawayUrl, deal.steamUrl].map((u) => (u || '').toLowerCase()).join(' ');
  return (
    combined.includes('prime') ||
    combined.includes('amazon') ||
    urls.includes('gaming.amazon.com') ||
    urls.includes('primegaming.com') ||
    urls.includes('luna.amazon.com')
  );
}

/**
 * Cleans store tags and noise from a Prime Gaming Reddit post title.
 */
export function cleanPrimePostTitle(raw?: string | null): string {
  if (!raw) return '';
  let t = raw;
  // Decode HTML entities
  t = t
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Remove bracket/parenthetical tags containing Prime, Amazon, or Game(s)
  t = t.replace(/\s*\[[^\]]*(?:Prime|Amazon|Game)[^\]]*\]\s*/gi, ' ');
  t = t.replace(/\s*\([^)]*(?:Prime|Amazon|Game)[^)]*\)\s*/gi, ' ');

  // Remove common FGF post suffix phrases
  t = t.replace(/\s*(?:are|is)?\s*complimentary\s+(?:with|on|for)\s+(?:Amazon\s+)?Prime(?:\s+Gaming)?\s*/gi, ' ');
  t = t.replace(/\s*(?:are|is)?\s*(?:free|included)\s+(?:with|on|for)\s+(?:Amazon\s+)?Prime(?:\s+Gaming)?\s*/gi, ' ');
  t = t.replace(/\s*(?:on|from|via)\s+(?:Amazon\s+)?Prime(?:\s+Gaming)?\s*/gi, ' ');
  t = t.replace(/\b(?:Amazon\s+)?Prime\s+Gaming\b/gi, ' ');
  t = t.replace(/\bAmazon\s+Prime\b/gi, ' ');

  // Clean trailing/leading punctuation
  t = t.replace(/^[\s\-–—:,|]+/, '').replace(/[\s\-–—:,|]+$/, '').trim();
  return t || raw;
}

/**
 * Parses game names from active Prime Gaming post titles for DISPLAY ONLY.
 * Splits on " / " (spaces on both sides), " + ", ", " and " & " only for game posts,
 * never on titles where "/" or "+" is part of a real name without spaces (e.g. Fate/Grand Order)
 * and never on loot/DLC posts.
 */
export function parsePrimeGameTitles(posts: Deal[]): string[] {
  const names: string[] = [];

  for (const post of posts) {
    const raw = (post as any).rawTitle || post.title || '';
    const isGamePost =
      post.type !== 'dlc' &&
      post.type !== 'loot' &&
      post.type !== 'item' &&
      !/\[[^\]]*(?:DLC|Loot|In-Game|Pack)[^\]]*\]/i.test(raw) &&
      !/\((?:DLC|Loot|In-Game|Pack)\)/i.test(raw);

    const cleaned = cleanPrimePostTitle(raw);
    if (!cleaned) continue;

    if (!isGamePost) {
      names.push(cleaned);
      continue;
    }

    const delimiterRegex = /(?:\s+\/\s+|\s+\+\s+|\s*,\s*|\s+&\s+)/;
    const parts = cleaned.split(delimiterRegex).map((s) => s.trim()).filter(Boolean);

    if (parts.length > 0) {
      names.push(...parts);
    } else {
      names.push(cleaned);
    }
  }

  // Deduplicate case-insensitively while preserving original display case
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const name of names) {
    const lower = name.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      deduped.push(name);
    }
  }

  return deduped;
}

/**
 * Merges game names: up to 6 then "and more".
 */
export function formatPrimeGameDisplayNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length > 6) {
    return `${names.slice(0, 6).join(', ')} and more`;
  }
  return names.join(', ');
}

/**
 * Strips HTML tags, decodes common HTML entities, and normalizes whitespace
 * for game descriptions (e.g., from Steam, Epic, or Reddit).
 */
export function cleanGameDescription(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';

  let text = raw
    // Strip script and style blocks
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    // Replace <br> and paragraph breaks with newlines
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    // Remove all remaining HTML tags
    .replace(/<[^>]+>/g, '')
    // Decode common HTML entities
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&trade;/gi, '™')
    .replace(/&copy;/gi, '©')
    .replace(/&reg;/gi, '®')
    .replace(/&#(\d+);/g, (_, code) => {
      try {
        return String.fromCharCode(parseInt(code, 10));
      } catch {
        return '';
      }
    });

  // Collapse consecutive newlines to at most 2, collapse repeated whitespace
  text = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();

  return text;
}

/**
 * Shortens long descriptions to a concise paragraph (~260-320 chars),
 * breaking cleanly at a sentence end (. ! ?) so it doesn't cut off mid-thought.
 */
export function shortenDescription(raw?: string | null, targetLen: number = 300): string {
  const cleaned = cleanGameDescription(raw);
  if (!cleaned) return '';
  if (cleaned.length <= targetLen) return cleaned;

  // Search for the last sentence boundary before or near targetLen
  const truncated = cleaned.slice(0, targetLen + 60);
  const sentenceEndMatches = Array.from(truncated.matchAll(/[.!?](?:\s+|$)/g));

  if (sentenceEndMatches.length > 0) {
    let bestEnd = -1;
    for (const match of sentenceEndMatches) {
      const idx = (match.index ?? 0) + 1;
      if (idx >= 120 && idx <= targetLen + 40) {
        bestEnd = idx;
      }
    }
    if (bestEnd !== -1) {
      return cleaned.slice(0, bestEnd).trim();
    }
  }

  // Fallback: word boundary with ellipsis
  const spaceIdx = cleaned.lastIndexOf(' ', targetLen);
  if (spaceIdx > 100) {
    return `${cleaned.slice(0, spaceIdx).trim()}...`;
  }

  return `${cleaned.slice(0, targetLen).trim()}...`;
}

/**
 * Formats timestamps, ISO strings, or human date strings uniformly to "MMM D, YYYY" (e.g. "Jul 27, 2017").
 */
export function formatDisplayDate(input?: string | number | null): string | null {
  if (!input && input !== 0) return null;
  let d: Date | null = null;
  if (typeof input === 'number') {
    if (isNaN(input) || input <= 0) return null;
    d = new Date(input);
  } else if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed || trimmed === 'N/A' || trimmed.toUpperCase() === 'UNKNOWN') return null;

    if (/^\d{10,13}$/.test(trimmed)) {
      const num = parseInt(trimmed, 10);
      d = new Date(trimmed.length === 10 ? num * 1000 : num);
    } else {
      const parsedMs = parseDateToMs(trimmed);
      if (!isNaN(parsedMs) && parsedMs > 0) {
        d = new Date(parsedMs);
      } else {
        const directMs = Date.parse(trimmed);
        if (!isNaN(directMs) && directMs > 0) {
          d = new Date(directMs);
        }
      }
    }
  }

  if (d && !isNaN(d.getTime())) {
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed && trimmed !== 'N/A' && trimmed.toUpperCase() !== 'UNKNOWN') return trimmed;
  }
  return null;
}

/**
 * Checks whether a candidate release date string actually matches the giveaway's listing,
 * published, created, or first-seen date. If so, it is NOT the game's real release date.
 */
export function isBogusGiveawayDate(dateStr?: string | null, deal?: Deal | null): boolean {
  if (!dateStr || dateStr === 'N/A' || dateStr.trim().length === 0) return true;
  if (!deal) return false;

  const candidateFormatted = formatDisplayDate(dateStr);
  if (!candidateFormatted) return true;

  if (deal.publishedAt) {
    const pStr = formatDisplayDate(deal.publishedAt);
    if (pStr && pStr === candidateFormatted) return true;
  }

  if (deal.createdAt) {
    const cStr = formatDisplayDate(deal.createdAt);
    if (cStr && cStr === candidateFormatted) return true;
  }

  if (deal.firstSeenAt) {
    const fStr = formatDisplayDate(deal.firstSeenAt);
    if (fStr && fStr === candidateFormatted) return true;
  }

  return false;
}


