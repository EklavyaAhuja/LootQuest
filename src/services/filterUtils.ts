import { Deal } from '../models/Deal';

/**
 * Normalizes title for comparing duplicates
 */
// === TITLE NORMALIZATION (More Aggressive) ===
export const normalizeTitle = (title: string): string => {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')                        // remove bracket contents (e.g. [Steam])
    .replace(/\([^)]*\)/g, ' ')                          // remove parenthesis contents (e.g. (Game))
    .replace(/\{[^}]*\}/g, ' ')                          // remove curly brace contents
    .replace(/[^a-z0-9]/gi, ' ')                         // replace non-alphanumeric with space
    .replace(/\b(free|giveaway|key|loot|pc|steam|epic|indiegala|gog|100%\s*off|now|available|on reddit|reddit|other|dlc|beta|alpha|game)\b/gi, ' ')
    .replace(/\s+/g, ' ')                                // collapse multiple spaces
    .trim();
};

// === CLEAN URL ===
export const cleanUrlForKey = (url: string): string => {
  if (!url) return '';
  try {
    const u = new URL(url);
    return (u.hostname + u.pathname).toLowerCase().replace(/\/$/, '');
  } catch {
    return url.toLowerCase().replace(/https?:\/\//, '').replace(/\/$/, '');
  }
};

// === PRIMARY PLATFORM (Fixed) ===
const getPrimaryPlatform = (platforms: string[] | string | undefined): string => {
  let platStr = '';
  
  if (Array.isArray(platforms)) {
    platStr = platforms[0] || '';
  } else if (typeof platforms === 'string') {
    platStr = platforms;
  }

  const p = platStr.toLowerCase();
  if (p.includes('steam')) return 'steam';
  if (p.includes('epic')) return 'epic';
  if (p.includes('gog')) return 'gog';
  if (p.includes('itch')) return 'itch';
  if (p.includes('stove')) return 'stove';
  if (p.includes('alienware')) return 'alienware';
  if (p.includes('playstation') || p.includes('ps4') || p.includes('ps5')) return 'playstation';
  if (p.includes('xbox')) return 'xbox';
  if (p.includes('android') || p.includes('ios') || p.includes('mobile')) return 'mobile';
  
  return p.replace(/[^a-z0-9]/g, '').trim() || 'unknown';
};

// === UNIQUE KEY GENERATOR (Improved) ===
export const getDealUniqueKey = (deal: Deal): string[] => {
  const keys: string[] = [];
  let normTitle = normalizeTitle(deal.title);

  // 1. Strongest: GamerPower ID
  if (deal.gamerPowerId) keys.push(`gp_${deal.gamerPowerId}`);

  // 2. URLs
  if (deal.url) keys.push(`url_${cleanUrlForKey(deal.url)}`);
  if ((deal as any).openGiveawayUrl) keys.push(`url_${cleanUrlForKey((deal as any).openGiveawayUrl)}`);
  if ((deal as any).open_giveaway_url) keys.push(`url_${cleanUrlForKey((deal as any).open_giveaway_url)}`);

  // 3. Core name — take first 6 meaningful words
  const words = normTitle.split(' ').filter(w => w.length > 1);
  const coreName = words.slice(0, 6).join(' ');

  if (coreName.length > 5) {
    keys.push(`core_${coreName}`);
  }

  // 4. Combo fallback
  const platform = getPrimaryPlatform(deal.platforms || deal.platform);
  if (coreName) {
    keys.push(`combo_${coreName}_${platform}`);
  }

  // 5. PC-generic Combo fallback for cross-store PC matchups (Steam, Epic Games, GOG, itch.io, Stove, PC)
  const isPc = ['steam', 'epic', 'gog', 'itch', 'stove', 'pc', 'drm-free'].includes(platform);
  if (coreName && isPc) {
    keys.push(`combo_${coreName}_pc_generic`);
  }

  const uniqueKeys = [...new Set(keys)];
  return uniqueKeys;
};

/**
 * Filter deals based on category, platform, claimMethod, showExpired, and text search query.
 */
export function filterDeals(
  deals: Deal[],
  filters: {
    category: string;
    platform: string;
    claimMethod: string;
    showExpired: boolean;
    search: string;
  }
): Deal[] {
  const { category, platform, claimMethod, showExpired, search } = filters;
  const searchLower = search.trim().toLowerCase();

  return deals.filter((deal) => {
    // 1. Text Search Heuristics
    if (searchLower.length > 0) {
      const titleMatches = deal.title.toLowerCase().includes(searchLower);
      const descMatches = deal.description?.toLowerCase().includes(searchLower) || false;
      const platformMatches = deal.platform.toLowerCase().includes(searchLower);
      
      if (!titleMatches && !descMatches && !platformMatches) {
        return false;
      }
    }

    // 2. Platform Filter (Supports partial matching like Mobile -> Android, iOS)
    if (platform !== 'All') {
      const filterPlat = platform.toLowerCase();
      const dealPlats = [
        deal.platform.toLowerCase()
      ];

      let matchesPlatform = false;
      if (filterPlat === 'mobile') {
        matchesPlatform = dealPlats.some((p) =>
          ['mobile', 'android', 'ios', 'google play', 'app store'].some((kw) => p.includes(kw))
        );
      } else if (filterPlat === 'itch.io') {
        matchesPlatform = dealPlats.some((p) => p.includes('itch') && !p.includes('switch'));
      } else {
        matchesPlatform = dealPlats.some((p) => p.includes(filterPlat));
      }

      if (!matchesPlatform) return false;
    }

    // 3. Category/Type Filter
    if (category !== 'All') {
      let matchesCategory = false;
      if (category === 'Game') {
        matchesCategory = deal.type === 'full_game';
      } else if (category === 'DLC') {
        matchesCategory = deal.type === 'dlc' || deal.type === 'item' || deal.type === 'loot';
      } else if (category === 'Beta') {
        matchesCategory = deal.type === 'beta';
      } else if (category === 'Mobile Game') {
        matchesCategory = deal.type === 'mobile_game';
      }

      if (!matchesCategory) return false;
    }

    // 4. Claim Method Filter
    if (claimMethod !== 'All') {
      let matchesClaim = false;
      if (claimMethod === 'One-Click') {
        matchesClaim = deal.claimMethod === 'one_click';
      } else if (claimMethod === 'Tasks Required') {
        matchesClaim = deal.claimMethod === 'tasks';
      }

      if (!matchesClaim) return false;
    }

    // 5. Expiry Status Filter
    if (!showExpired) {
      if (deal.expiryStatus === 'EXPIRED' || deal.isExpired) {
        return false;
      }
    }

    return true;
  });
}

// Helper to combine best data from both versions
const enrichDeal = (base: Deal, extra: Deal): Deal => {
  return {
    ...base,
    // Take better data from Reddit if missing in GamerPower
    description: base.description || extra.description,
    aboutGame: base.aboutGame || extra.aboutGame,
    instructions: base.instructions || extra.instructions,
    developer: base.developer || extra.developer,
    releaseDate: base.releaseDate || extra.releaseDate,
    genres: base.genres || extra.genres,
    achievements: base.achievements || extra.achievements,
    tradingCards: base.tradingCards || extra.tradingCards,
    reviewScore: base.reviewScore || extra.reviewScore,
    steamDbRating: base.steamDbRating || extra.steamDbRating,
    expiresAt: base.expiresAt || extra.expiresAt,
    expiryStatus: (base.expiryStatus && base.expiryStatus !== 'UNKNOWN') ? base.expiryStatus : extra.expiryStatus,
    image: base.image || extra.image,
    createdAt: base.createdAt || extra.createdAt,
    redditUrl: base.redditUrl || extra.redditUrl || extra.url,
  };
};

/**
 * Full merge & enrichment of GamerPower and Reddit deals.
 */
export const mergeAndEnrichDeals = (gpDeals: Deal[], redditDeals: Deal[]): Deal[] => {
  const dealMap = new Map<string, Deal>();
  const keyToPrimaryKeyMap = new Map<string, string>();

  // GamerPower first
  gpDeals.forEach(deal => {
    const keys = getDealUniqueKey(deal);
    const primaryKey = keys[0] || `gp_${deal.gamerPowerId || Date.now()}`;
    dealMap.set(primaryKey, { ...deal, source: 'gamerpower' });

    keys.forEach(k => keyToPrimaryKeyMap.set(k, primaryKey));
  });

  // Reddit enrichment / addition
  redditDeals.forEach(redditDeal => {
    const keys = getDealUniqueKey(redditDeal);
    let matchedPrimaryKey: string | null = null;

    for (const key of keys) {
      if (keyToPrimaryKeyMap.has(key)) {
        matchedPrimaryKey = keyToPrimaryKeyMap.get(key)!;
        break;
      }
    }

    if (matchedPrimaryKey) {
      const existing = dealMap.get(matchedPrimaryKey)!;
      dealMap.set(matchedPrimaryKey, enrichDeal(existing, redditDeal));
    } else {
      const primaryKey = keys[0] || `reddit_${Date.now()}`;
      dealMap.set(primaryKey, { ...redditDeal, source: 'reddit' });
      keys.forEach(k => keyToPrimaryKeyMap.set(k, primaryKey));
    }
  });

  return Array.from(dealMap.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
};

/**
 * Merges existing deals with incoming new deals and deduplicates/enriches them.
 */
export const mergeAndDeduplicateDeals = (existing: Deal[], incoming: Deal[]): Deal[] => {
  return mergeAndEnrichDeals(existing, incoming);
};
