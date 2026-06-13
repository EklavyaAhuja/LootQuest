import { Deal } from '../models/Deal';

/**
 * Robust Hermes-safe date parser that maps date strings to Unix milliseconds.
 */
export function parseDateToMs(dateStr?: string | null): number {
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
    console.warn('[dealUtils] Date parsing failed for:', dateStr, e);
  }
  return Date.now();
}

/**
 * Determines if a deal has expired using client-side validation.
 */
export const isDealExpired = (deal: Deal): boolean => {
  const dateStr = deal.expiresAt || deal.endDate;
  if (!dateStr || dateStr.toUpperCase() === 'N/A') return false;
  const endTime = parseDateToMs(dateStr);
  return endTime < Date.now();
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
  platforms: string = ""
): "one_click" | "tasks" | "unknown" {
  const text = (instructions + " " + title + " " + platforms).toLowerCase();

  // Task hosts that always require external steps
  const taskHosts = [
    "alienware",
    "indiegala giveaway",  // IndieGala giveaway contests, NOT their store
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

  // Everything else (log in, click claim, add to library) = one_click
  if (!instructions || instructions.trim() === "") {
    const lowerPlatforms = platforms.toLowerCase();
    const directStorefronts = ["steam", "epic", "gog", "itch", "nintendo", "playstation", "xbox", "stove"];
    const isDirectStorefront = directStorefronts.some(store => lowerPlatforms.includes(store));
    if (isDirectStorefront) {
      return "one_click";
    }
    return "unknown";
  }

  return "one_click";
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
export function isDealClaimed(deal: Deal, claimedDeals: Deal[]): boolean {
  if (!deal) return false;
  const dealKey = getCanonicalKey(deal.title, deal.platform);
  return claimedDeals.some(c => {
    if (c.id === deal.id) return true;
    return getCanonicalKey(c.title, c.platform) === dealKey;
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

