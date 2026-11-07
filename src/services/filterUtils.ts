import { Deal } from '../models/Deal';
import { isDealExpired, isThirdPartyTaskHost, extractSteamAppId, getCanonicalPlatform, isPostRemovedByModerator } from '../utils/dealUtils';

/**
 * Normalizes title for comparing duplicates
 */
// === TITLE NORMALIZATION (More Aggressive & Accurate) ===
export const normalizeTitle = (title: string): string => {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')                        // remove bracket contents (e.g. [Steam])
    .replace(/\([^)]*\)/g, ' ')                          // remove parenthesis contents (e.g. (Game))
    .replace(/\{[^}]*\}/g, ' ')                          // remove curly brace contents
    .replace(/[^a-z0-9]/gi, ' ')                         // replace non-alphanumeric with space
    .replace(/\b(free|giveaways?|giveaway|key|loot|pc|steam|epic|indiegala|gog|itch|stove|alienware|steelseries|100%\s*off|now|available|on reddit|reddit|other|dlc|beta|alpha|game|playtest|starter edition|starter pack)\b/gi, ' ')
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
    return url.toLowerCase().replace(/https?:\/\//, '').replace(/[?#].*$/, '').replace(/\/$/, '');
  }
};

// === PRIMARY PLATFORM (Fixed) ===
export const getPrimaryPlatform = (platforms: string[] | string | undefined): string => {
  let platStr = '';
  
  if (Array.isArray(platforms)) {
    platStr = platforms.join(' ');
  } else if (typeof platforms === 'string') {
    platStr = platforms;
  }

  const p = platStr.toLowerCase();
  if (p.includes('android') || p.includes('ios') || p.includes('mobile')) return 'mobile';
  if (p.includes('steam')) return 'steam';
  if (p.includes('epic')) return 'epic';
  if (p.includes('gog')) return 'gog';
  if (/\bitch(?:\.io)?\b/i.test(p)) return 'itch';
  if (p.includes('indiegala')) return 'indiegala';
  if (p.includes('stove')) return 'stove';
  if (p.includes('alienware')) return 'alienware';
  if (p.includes('playstation') || p.includes('ps4') || p.includes('ps5')) return 'playstation';
  if (p.includes('xbox')) return 'xbox';
  
  return p.replace(/[^a-z0-9]/g, '').trim() || 'pc';
};

// All PC storefronts and variants
const PC_STOREFRONTS = new Set([
  'steam', 'epic', 'gog', 'itch', 'indiegala', 'stove', 'alienware', 'steelseries',
  'pc', 'drm-free', 'prime', 'prime gaming', 'amazon', 'ubisoft', 'ea', 'battlenet'
]);

// === UNIQUE KEY GENERATOR (Improved) ===
export const getDealUniqueKey = (deal: Deal): string[] => {
  const keys: string[] = [];
  const rawTitle = deal.title || '';
  const normTitle = normalizeTitle(rawTitle);

  // 1. Strongest: GamerPower ID
  if (deal.gamerPowerId) keys.push(`gp_${deal.gamerPowerId}`);

  // 2. Steam App ID (Universal matching between GamerPower and Reddit)
  const candidateUrls = [
    deal.url,
    deal.storeUrl,
    deal.giveawayUrl,
    (deal as any).openGiveawayUrl,
    (deal as any).open_giveaway_url,
    (deal as any).directStoreUrl,
  ].filter(Boolean) as string[];

  for (const u of candidateUrls) {
    const steamId = extractSteamAppId(u);
    if (steamId) {
      keys.push(`steam_app_${steamId}`);
    }
  }

  // 3. Clean direct store URLs (ignoring gamerpower / reddit wrapper links)
  for (const u of candidateUrls) {
    if (!u.includes('gamerpower.com') && !u.includes('reddit.com') && !u.includes('redd.it')) {
      const cleanUrl = cleanUrlForKey(u);
      if (cleanUrl.length > 5) {
        keys.push(`url_${cleanUrl}`);
      }
    }
  }

  // 4. Collect all canonical platform groups across platforms array and deal.platform
  const rawPlats = Array.isArray(deal.platforms) ? deal.platforms : (deal.platform ? [deal.platform] : ['PC']);
  const platGroups = new Set<string>();
  const specificPlats = new Set<string>();

  for (const p of rawPlats) {
    const canon = getCanonicalPlatform(p);
    platGroups.add(canon);
    specificPlats.add(getPrimaryPlatform(p));
  }
  if (deal.platform) {
    platGroups.add(getCanonicalPlatform(deal.platform));
    specificPlats.add(getPrimaryPlatform(deal.platform));
  }

  // 5. Core Name + Platform Group combinations
  const words = normTitle.split(' ').filter(w => w.length >= 1);
  const coreName = words.slice(0, 6).join(' ');

  if (coreName.length >= 2) {
    // Platform-group keys (e.g. core_voidtrain big catch_xbox, core_voidtrain big catch_pc)
    for (const group of platGroups) {
      keys.push(`core_${coreName}_${group}`);
      keys.push(`combo_${coreName}_${group}`);
    }

    // Specific store keys (e.g. combo_voidtrain big catch_steam, combo_voidtrain big catch_epic)
    for (const sp of specificPlats) {
      keys.push(`combo_${coreName}_${sp}`);
    }

    // Generic PC fallback for cross-store PC matchups
    const hasPc = Array.from(platGroups).includes('pc') || Array.from(specificPlats).some(s => PC_STOREFRONTS.has(s));
    if (hasPc) {
      keys.push(`combo_${coreName}_pc_generic`);
    }
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
        (deal.platform || '').toLowerCase(),
        ...(Array.isArray(deal.platforms) ? deal.platforms.map((p) => (p || '').toLowerCase()) : []),
        (deal.entrySiteLabel || '').toLowerCase(),
      ];
      const url = (deal.storeUrl || deal.giveawayUrl || deal.url || '').toLowerCase();

      let matchesPlatform = false;
      if (filterPlat === 'mobile') {
        matchesPlatform =
          dealPlats.some((p) => ['mobile', 'android', 'ios', 'google play', 'app store'].some((kw) => p.includes(kw))) ||
          url.includes('play.google.com') ||
          url.includes('apps.apple.com');
      } else if (filterPlat === 'itch.io' || filterPlat === 'itch') {
        matchesPlatform = dealPlats.some((p) => /\bitch(?:\.io)?\b/i.test(p)) || url.includes('itch.io');
      } else {
        matchesPlatform = dealPlats.some((p) => p.includes(filterPlat)) || url.includes(filterPlat);
      }

      if (!matchesPlatform) return false;
    }

    // 3. Category/Type Filter
    if (category !== 'All') {
      let matchesCategory = false;
      if (category === 'Game') {
        matchesCategory = deal.type === 'full_game' || deal.type === 'mobile_game';
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
      const isTask = deal.claimMethod === 'tasks' || isThirdPartyTaskHost(deal);
      let matchesClaim = false;
      if (claimMethod === 'One-Click') {
        matchesClaim = !isTask;
      } else if (claimMethod === 'Tasks Required') {
        matchesClaim = isTask;
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
  // Prefer exact ISO timestamp (e.g. from official Epic API) over placeholder midnight dates (e.g. 23:59:00)
  const isPlaceholder = (s?: string | null) => !s || /(?:23:59:00|23:59:59|00:00:00)/.test(s);
  const candidates = [base.expiresAt, base.endDate, extra.expiresAt, extra.endDate].filter(Boolean) as string[];
  const accurateTimestamp = candidates.find((ts) => !isPlaceholder(ts));
  const fallbackTimestamp = candidates[0];
  const finalExpiry = accurateTimestamp || fallbackTimestamp;

  const mergedExpiresAt = finalExpiry;
  const mergedEndDate = finalExpiry;

  const expired = base.isExpired || extra.isExpired || isDealExpired(base) || isDealExpired(extra);

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
    endDate: mergedEndDate,
    expiresAt: mergedExpiresAt,
    isExpired: expired,
    expiryStatus: expired ? 'EXPIRED' : ((base.expiryStatus && base.expiryStatus !== 'UNKNOWN') ? base.expiryStatus : extra.expiryStatus),
    image: base.image || extra.image,
    createdAt: base.createdAt || extra.createdAt,
    redditUrl: base.redditUrl || extra.redditUrl || extra.url,
    androidUrl: base.androidUrl || extra.androidUrl,
    iosUrl: base.iosUrl || extra.iosUrl,
  };
};

/**
 * Full merge & enrichment of GamerPower and Reddit deals.
 */
export const mergeAndEnrichDeals = (gpDeals: Deal[], redditDeals: Deal[]): Deal[] => {
  const dealMap = new Map<string, Deal>();
  const keyToPrimaryKeyMap = new Map<string, string>();

  // Filter out any removed deals upfront
  const cleanGpDeals = (gpDeals || []).filter(deal => !isPostRemovedByModerator(deal));
  const cleanRedditDeals = (redditDeals || []).filter(deal => !isPostRemovedByModerator(deal));

  // GamerPower and Epic Official deals first (with intra-feed deduplication)
  cleanGpDeals.forEach(deal => {
    const keys = getDealUniqueKey(deal);
    let matchedPrimaryKey: string | null = null;
    for (const key of keys) {
      if (keyToPrimaryKeyMap.has(key)) {
        matchedPrimaryKey = keyToPrimaryKeyMap.get(key)!;
        break;
      }
    }

    if (matchedPrimaryKey && dealMap.has(matchedPrimaryKey)) {
      // Intra-feed duplicate found (e.g. GamerPower deal matching Epic official promo)
      const existing = dealMap.get(matchedPrimaryKey)!;
      const merged = enrichDeal(existing, deal);
      dealMap.set(matchedPrimaryKey, merged);
      keys.forEach(k => keyToPrimaryKeyMap.set(k, matchedPrimaryKey!));
    } else {
      const primaryKey = keys[0] || `gp_${deal.gamerPowerId || Date.now()}`;
      dealMap.set(primaryKey, { ...deal, source: deal.source || 'gamerpower' });
      keys.forEach(k => keyToPrimaryKeyMap.set(k, primaryKey));
    }
  });

  // Reddit enrichment / addition
  cleanRedditDeals.forEach(redditDeal => {
    if (isPostRemovedByModerator(redditDeal)) {
      return;
    }

    const keys = getDealUniqueKey(redditDeal);
    let matchedPrimaryKey: string | null = null;

    for (const key of keys) {
      if (keyToPrimaryKeyMap.has(key)) {
        matchedPrimaryKey = keyToPrimaryKeyMap.get(key)!;
        break;
      }
    }

    // Dynamic token containment fallback for multi-DLC, multi-game bundle or subtitle variants (e.g. Voidtrain Big Catch)
    if (!matchedPrimaryKey) {
      const redditCanonPlat = getCanonicalPlatform(redditDeal.platforms ? redditDeal.platforms[0] : (redditDeal.platform || ''));
      const redditNorm = normalizeTitle(redditDeal.title);
      const redditWords = redditNorm.split(' ').filter(w => w.length >= 1);

      if (redditWords.length >= 2 || redditNorm.length >= 3) {
        for (const [primaryKey, existing] of dealMap.entries()) {
          const existingPlats = Array.isArray(existing.platforms) ? existing.platforms : [existing.platform || ''];
          const existingCanonPlats = existingPlats.map(getCanonicalPlatform);
          const platMatch = existingCanonPlats.includes(redditCanonPlat);
          
          if (!platMatch) continue;

          const existingNorm = normalizeTitle(existing.title);
          if (existingNorm.length < 3) continue;

          // 1. Direct title containment (e.g. "The Green Light & The Black Within" contains "The Black Within")
          if (redditNorm.includes(existingNorm) || existingNorm.includes(redditNorm)) {
            matchedPrimaryKey = primaryKey;
            break;
          }

          // 2. High token overlap
          const existingWords = existingNorm.split(' ').filter(w => w.length >= 1);
          if (existingWords.length < 2) continue;

          const shorter = existingWords.length <= redditWords.length ? existingWords : redditWords;
          const longer = existingWords.length <= redditWords.length ? redditWords : existingWords;

          const matchCount = shorter.filter(w => longer.includes(w)).length;
          if (shorter[0] === longer[0] && matchCount >= shorter.length) {
            matchedPrimaryKey = primaryKey;
            break;
          }
        }
      }
    }

    if (matchedPrimaryKey) {
      const existing = dealMap.get(matchedPrimaryKey)!;
      if (isPostRemovedByModerator(existing) || isPostRemovedByModerator(redditDeal)) {
        dealMap.delete(matchedPrimaryKey);
      } else {
        const enriched = enrichDeal(existing, redditDeal);
        if (isPostRemovedByModerator(enriched)) {
          dealMap.delete(matchedPrimaryKey);
        } else {
          dealMap.set(matchedPrimaryKey, enriched);
        }
      }
    } else {
      const primaryKey = keys[0] || `reddit_${Date.now()}`;
      dealMap.set(primaryKey, { ...redditDeal, source: 'reddit' });
      keys.forEach(k => keyToPrimaryKeyMap.set(k, primaryKey));
    }
  });

  return Array.from(dealMap.values())
    .filter(deal => !isPostRemovedByModerator(deal))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
};

/**
 * Merges existing deals with incoming new deals and deduplicates/enriches them.
 */
export const mergeAndDeduplicateDeals = (existing: Deal[], incoming: Deal[]): Deal[] => {
  return mergeAndEnrichDeals(existing, incoming);
};
