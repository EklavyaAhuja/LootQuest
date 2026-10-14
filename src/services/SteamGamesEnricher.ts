import { Platform } from 'react-native';
import { fetchWithProxy } from './redditService';

export interface SteamEnrichedData {
  developer?: string;
  publisher?: string;
  description?: string;
  image?: string;
  genres?: string[];
  releaseDate?: string;
  resolvedStoreUrl?: string;
  steamUrl?: string;
  reviewScore?: string;
  steamDbRating?: string;
  steamRatingPercent?: number;
  steamReviewCount?: number;
  isGame?: boolean;
  currentPrice?: string;
  originalPrice?: string;
  isExpired?: boolean;
  isFree?: boolean;
}

/**
 * Helper to extract Steam App ID from any store.steampowered.com URL.
 */
export function extractSteamAppId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/\/app\/(\d+)/i) || url.match(/steampowered\.com.*?(\d{4,8})/);
  return match ? match[1] : null;
}

const steamAppIdCache = new Map<string, string>();

let activeSearchCount = 0;
const searchQueue: Array<() => void> = [];

async function acquireSearchSlot(): Promise<() => void> {
  if (activeSearchCount < 2) {
    activeSearchCount++;
    return () => {
      activeSearchCount--;
      if (searchQueue.length > 0) {
        const next = searchQueue.shift();
        if (next) next();
      }
    };
  }
  return new Promise((resolve) => {
    searchQueue.push(() => {
      activeSearchCount++;
      resolve(() => {
        activeSearchCount--;
        if (searchQueue.length > 0) {
          const next = searchQueue.shift();
          if (next) next();
        }
      });
    });
  });
}

/**
 * Smart title helper for exact Steam store searching.
 * Cleans Reddit post noise, promo text, multi-game bundle lists, and tags.
 */
export function cleanGameTitleForSearch(title: string): string {
  if (!title) return '';
  let cleaned = title;

  // 1. Remove Reddit tags: [Steam], [GOG], [Epic Games], (Game), (DLC), (Beta), etc.
  cleaned = cleaned.replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ');

  // 2. Remove common FGF promo/context phrases
  cleaned = cleaned.replace(/\b(?:are\s+)?complimentary with.*$/i, ' ');
  cleaned = cleaned.replace(/\bfree with.*$/i, ' ');
  cleaned = cleaned.replace(/\bprime gaming\b/gi, ' ');
  cleaned = cleaned.replace(/\bamazon prime\b/gi, ' ');
  cleaned = cleaned.replace(/\bplaytest steam\b/gi, ' ');
  cleaned = cleaned.replace(/\bon steam\b/gi, ' ');
  cleaned = cleaned.replace(/\bplaytest\b/gi, ' ');
  cleaned = cleaned.replace(/\b100%\s*off\b/gi, ' ');

  // 3. Multi-game bundle: if split by '/' or ',', pick the first game
  if (cleaned.includes('/')) {
    cleaned = cleaned.split('/')[0];
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.split(',')[0];
  }

  // 4. Subtitle / Colon / Dash handling
  const colonParts = cleaned.split(/[:\-–—]/);
  if (colonParts.length > 1) {
    const first = colonParts[0].trim();
    const second = colonParts[1].trim();
    // If first part is an abbreviation / very short (e.g. 'BDSM'), prefer the descriptive second part
    if (first.length < 5 && second.length >= 5) {
      cleaned = second;
    } else if (first.length >= 4) {
      cleaned = first;
    }
  }

  // 5. Clean common fluff keywords
  cleaned = cleaned
    .replace(/\b(giveaway|free|steam|key|game|loot|dlc|beta|alpha|itch\.io|epic|gog|starter edition|starter pack)\b/gi, ' ')
    .replace(/[^\w\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned;
}

/**
 * Searches Steam Store search API by game title to find the exact App ID.
 * Throttled to 2 concurrent searches to prevent CORS proxy bottlenecks.
 */
export async function searchSteamAppId(title: string): Promise<string | null> {
  if (!title) return null;
  const cleanTitle = cleanGameTitleForSearch(title);
  if (!cleanTitle || cleanTitle.length < 2) return null;

  const cacheKey = cleanTitle.toLowerCase();
  if (steamAppIdCache.has(cacheKey)) {
    return steamAppIdCache.get(cacheKey)!;
  }

  const releaseSlot = await acquireSearchSlot();

  try {
    const searchUrl = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(cleanTitle)}&l=english&cc=US`;
    
    let response: Response;
    if (Platform.OS === 'web') {
      response = await fetchWithProxy(searchUrl, 5000);
    } else {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 5000);
      response = await fetch(searchUrl, {
        signal: c.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      clearTimeout(t);
    }

    if (response.ok) {
      const data = await response.json();
      if (data && data.items && data.items.length > 0) {
        const target = cleanTitle.trim().toLowerCase();
        // 1. Try exact name match
        const exact = data.items.find((item: any) => (item.name || '').trim().toLowerCase() === target);
        if (exact) {
          const id = String(exact.id);
          steamAppIdCache.set(cacheKey, id);
          return id;
        }

        // 2. Try exact match ignoring punctuation/special characters
        const normalize = (s: string) => s.replace(/[^a-z0-9]/g, '');
        const normTarget = normalize(target);
        if (normTarget.length >= 3) {
          const exactNorm = data.items.find((item: any) => {
            const n = normalize((item.name || '').toLowerCase());
            return n === normTarget;
          });
          if (exactNorm) {
            const id = String(exactNorm.id);
            steamAppIdCache.set(cacheKey, id);
            return id;
          }
        }

        // STRICT: Never do partial substring matches (e.g. "Meltdown Crew" for "Meltdown")
        // and never blindly fall back to items[0].
      }
    }
  } catch (err: any) {
    // Quietly ignore AbortError from background timeouts so logs stay clean
    if (err?.name !== 'AbortError') {
      console.warn('[SteamGamesEnricher] Steam store search failed for title:', cleanTitle, err);
    }
  } finally {
    releaseSlot();
  }
  return null;
}

/**
 * Fetches free game metadata and user reviews directly from Steam Storefront API using the App ID.
 * If url doesn't have an App ID, searches by game title if provided.
 */
export async function enrichSteamDeal(url: string, title?: string): Promise<SteamEnrichedData | null> {
  const directAppId = extractSteamAppId(url);
  let appId = directAppId;
  let resolvedStoreUrl: string | undefined = undefined;

  if (!appId && title) {
    appId = await searchSteamAppId(title);
  }

  if (appId) {
    resolvedStoreUrl = `https://store.steampowered.com/app/${appId}/`;
  }

  if (!appId) return null;

  const steamUrl = `https://store.steampowered.com/app/${appId}/`;
  const fallbackHeader = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;

  let reviewScore: string | undefined;
  let steamDbRating: string | undefined;
  let steamRatingPercent: number | undefined;
  let steamReviewCount: number | undefined;

  // 1. Fetch App Reviews concurrently with App Details
  const reviewsUrl = `https://store.steampowered.com/appreviews/${appId}?json=1&language=all&purchase_type=all`;
  const detailsUrl = `https://store.steampowered.com/api/appdetails?appids=${appId}`;

  const fetchResource = async (targetUrl: string, timeout = 3500) => {
    if (Platform.OS === 'web') {
      return await fetchWithProxy(targetUrl, timeout);
    }
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeout);
    const r = await fetch(targetUrl, {
      signal: c.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    clearTimeout(t);
    return r;
  };

  const [detailsResult, reviewsResult] = await Promise.allSettled([
    fetchResource(detailsUrl, 3500).then(r => r.ok ? r.json() : null),
    fetchResource(reviewsUrl, 3000).then(r => r.ok ? r.json() : null),
  ]);

  if (reviewsResult.status === 'fulfilled' && reviewsResult.value) {
    const summary = reviewsResult.value.query_summary;
    if (summary) {
      reviewScore = summary.review_score_desc || undefined;
      const totalReviews = summary.total_reviews || 0;
      const totalPositive = summary.total_positive || 0;
      steamReviewCount = totalReviews;
      if (totalReviews > 0) {
        const pct = Math.round((totalPositive / totalReviews) * 100);
        steamRatingPercent = pct;
        steamDbRating = `${pct}% (${totalReviews.toLocaleString()} reviews)`;
      } else if (reviewScore) {
        steamDbRating = reviewScore;
      }
    }
  }

  let developer: string | undefined;
  let publisher: string | undefined;
  let description: string | undefined;
  let image = fallbackHeader;
  let genres: string[] | undefined;
  let releaseDate: string | undefined;

  let isGame: boolean | undefined;
  let currentPrice: string | undefined;
  let originalPrice: string | undefined;
  let isExpired: boolean | undefined;
  let isFree: boolean | undefined;

  if (detailsResult.status === 'fulfilled' && detailsResult.value) {
    const json = detailsResult.value;
    if (json[appId] && json[appId].success) {
      const data = json[appId].data;
      if (data.type) {
        isGame = data.type === 'game';
      }
      isFree = data.is_free === true;

      // Price and Expiry Validation
      const isDirectSteam = (url || '').toLowerCase().includes('steampowered.com');
      if (data.is_free !== undefined) {
        if (data.is_free === false && data.price_overview) {
          const finalCents = data.price_overview.final;
          const discountPct = data.price_overview.discount_percent;
          if (finalCents > 0 && discountPct < 100) {
            // Only direct Steam store promotions expire when final price > 0.
            // Third-party key giveaways (Legion Gaming, Alienware, Gleam) give free keys for paid Steam games.
            if (isDirectSteam) {
              isExpired = true;
              currentPrice = data.price_overview.final_formatted || `$${(finalCents / 100).toFixed(2)}`;
            } else {
              isExpired = false;
              currentPrice = 'Free';
            }
            originalPrice = data.price_overview.initial_formatted || data.price_overview.final_formatted || `$${(finalCents / 100).toFixed(2)}`;
          } else if (finalCents === 0 || discountPct === 100) {
            currentPrice = 'Free';
            originalPrice = data.price_overview.initial_formatted || '$0.00';
          }
        } else if (data.is_free === true) {
          currentPrice = 'Free';
        }
      }

      const developers = data.developers || [];
      const publishers = data.publishers || [];
      developer = developers[0] || undefined;
      publisher = publishers[0] || undefined;
      description = data.short_description || data.about_the_game || undefined;
      if (data.header_image) {
        image = data.header_image;
      } else if (fallbackHeader) {
        image = fallbackHeader;
      }
      genres = data.genres ? data.genres.map((g: any) => g.description) : undefined;
      releaseDate = data.release_date?.date || undefined;
    }
  }

  return {
    developer,
    publisher,
    description,
    image,
    genres,
    releaseDate,
    resolvedStoreUrl: resolvedStoreUrl || steamUrl,
    steamUrl,
    reviewScore,
    steamDbRating,
    steamRatingPercent,
    steamReviewCount,
    isGame,
    currentPrice,
    originalPrice,
    isExpired,
    isFree,
  };
}

