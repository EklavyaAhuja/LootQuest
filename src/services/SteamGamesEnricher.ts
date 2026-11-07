import { extractEpicSlug } from './EpicGamesEnricher';
import { getEpicPromotionsCatalog } from './EpicPromotionsService';
import { formatDisplayDate } from '../utils/dealUtils';
import { Deal } from '../models/Deal';
import { Platform } from 'react-native';
import { fetchWithProxy } from './redditService';
import { cleanGameDescription } from '../utils/dealUtils';

export interface SteamEnrichedData {
  steamAppId?: string;
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
  trailerUrl?: string;
  trailerThumbnail?: string;
  metacriticScore?: number;
  playtimeHours?: number;
  gameModes?: string[];
  gameMode?: string;
}

/**
 * Helper to extract Steam App ID from any store.steampowered.com URL.
 */
export function extractSteamAppId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/\/app\/(\d+)/i) || url.match(/steampowered\.com.*?(\d{4,8})/);
  return match ? match[1] : null;
}

import AsyncStorage from '@react-native-async-storage/async-storage';

const STEAM_TITLE_CACHE_KEY = 'claimr_steam_title_appids_v2';
const LEGACY_STEAM_TITLE_CACHE_KEY = 'lootquest_steam_title_appids_v2';
const FOUND_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
const NOT_FOUND_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

interface TitleCacheEntry {
  appId?: string | null;
  playtime?: string | null;
  timestamp: number;
}

let inMemoryTitleMap: Record<string, TitleCacheEntry> | null = null;
let isMapLoaded = false;

async function loadTitleCacheMap(): Promise<Record<string, TitleCacheEntry>> {
  if (isMapLoaded && inMemoryTitleMap) return inMemoryTitleMap;
  try {
    let raw = await AsyncStorage.getItem(STEAM_TITLE_CACHE_KEY);
    if (!raw) {
      raw = await AsyncStorage.getItem(LEGACY_STEAM_TITLE_CACHE_KEY);
    }
    if (raw) {
      inMemoryTitleMap = JSON.parse(raw);
    }
  } catch {}
  if (!inMemoryTitleMap) inMemoryTitleMap = {};
  isMapLoaded = true;
  return inMemoryTitleMap;
}

function saveTitleCacheMap() {
  if (inMemoryTitleMap) {
    AsyncStorage.setItem(STEAM_TITLE_CACHE_KEY, JSON.stringify(inMemoryTitleMap)).catch(() => {});
  }
}

// ─── SteamSpy Playtime Queue (One request at a time, min 1100ms between calls) ───
let lastSteamSpyCallTime = 0;
const steamSpyQueue: Array<() => void> = [];
let isSteamSpyActive = false;

async function acquireSteamSpySlot(): Promise<() => void> {
  const proceed = async (resolve: (release: () => void) => void) => {
    isSteamSpyActive = true;
    const now = Date.now();
    const elapsed = now - lastSteamSpyCallTime;
    if (elapsed < 1100) {
      await new Promise((r) => setTimeout(r, 1100 - elapsed));
    }
    lastSteamSpyCallTime = Date.now();
    resolve(() => {
      isSteamSpyActive = false;
      lastSteamSpyCallTime = Date.now();
      if (steamSpyQueue.length > 0) {
        const next = steamSpyQueue.shift();
        if (next) next();
      }
    });
  };

  if (!isSteamSpyActive) {
    return new Promise((resolve) => proceed(resolve));
  }
  return new Promise((resolve) => {
    steamSpyQueue.push(() => proceed(resolve));
  });
}

/**
 * Fetches playtime metrics from SteamSpy for a verified Steam App ID.
 * Called on the game page only (never during feed sync).
 * Rate-limited: one request at a time, minimum 1100 ms between calls.
 * 3500 ms timeout. Format: under 60 minutes "45m", otherwise rounded hours "5h".
 * Cached in the single existing Steam-data AsyncStorage map (found: 30 days, none: 7 days).
 */
export async function fetchSteamSpyPlaytime(appId: string): Promise<string | null> {
  if (!appId || !/^\d+$/.test(appId)) return null;

  const cacheKey = `spy_${appId}`;
  const cacheMap = await loadTitleCacheMap();
  const cached = cacheMap[cacheKey];
  const now = Date.now();

  if (cached && typeof cached.timestamp === 'number') {
    const ttl = cached.playtime ? FOUND_TTL : NOT_FOUND_TTL;
    if (now - cached.timestamp < ttl) {
      return cached.playtime || null;
    }
  }

  const releaseSlot = await acquireSteamSpySlot();
  try {
    const targetUrl = `https://steamspy.com/api.php?request=appdetails&appid=${appId}`;
    let json: any = null;

    if (Platform.OS === 'web') {
      const res = await fetchWithProxy(targetUrl, 3500);
      if (res && res.ok) {
        json = await res.json();
      }
    } else {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 3500);
      try {
        const res = await fetch(targetUrl, {
          signal: c.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });
        if (res.ok) {
          json = await res.json();
        }
      } finally {
        clearTimeout(t);
      }
    }

    let formattedPlaytime: string | null = null;
    if (json && typeof json.median_forever === 'number' && json.median_forever > 0) {
      const minutes = json.median_forever;
      if (minutes < 60) {
        formattedPlaytime = `${Math.round(minutes)}m`;
      } else {
        formattedPlaytime = `${Math.round(minutes / 60)}h`;
      }
    }

    cacheMap[cacheKey] = {
      playtime: formattedPlaytime,
      timestamp: Date.now(),
    };
    saveTitleCacheMap();

    return formattedPlaytime;
  } catch {
    // If SteamSpy fails or is blocked: hide cell silently, no error text
    cacheMap[cacheKey] = {
      playtime: null,
      timestamp: Date.now(),
    };
    saveTitleCacheMap();
    return null;
  } finally {
    releaseSlot();
  }
}

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

  // 0. Normalize unicode/smart quotes and backticks
  cleaned = cleaned.replace(/[’‘`]/g, "'").replace(/["“”]/g, ' ');

  // 1. Remove bracketed / parenthesized tags: [Steam], [GOG], [Epic Games], (Game), (DLC), (Beta), etc.
  cleaned = cleaned.replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ');

  // 2. Remove platform chains like "Steam/Epic", "Steam / Epic Games / GOG", "PC/Steam", etc.
  cleaned = cleaned.replace(/\b(?:steam|epic games|epic|gog|itch\.io|itch|ubisoft|uplay|origin|ea app|gog\.com|pc|mac|linux|android|ios|mobile)\s*(?:[\/|&+\\]\s*(?:steam|epic games|epic|gog|itch\.io|itch|ubisoft|uplay|origin|ea app|gog\.com|pc|mac|linux|android|ios|mobile)\b)+/gi, ' ');

  // 3. Remove store phrases like "on Steam", "from Epic Games", "Steam Key", "Epic Games Store"
  cleaned = cleaned.replace(/\b(?:on|for|from)\s+(?:steam|epic games|epic|gog|itch\.io|itch|prime gaming|amazon prime)\b/gi, ' ');
  cleaned = cleaned.replace(/\b(?:steam|epic games|epic|gog|itch\.io|itch)\s+(?:store|giveaway|key|free|drop|drops)\b/gi, ' ');

  // 4. Remove common FGF promo/context phrases
  cleaned = cleaned.replace(/\b(?:are\s+)?complimentary with.*$/i, ' ');
  cleaned = cleaned.replace(/\bfree with.*$/i, ' ');
  cleaned = cleaned.replace(/\bprime gaming\b/gi, ' ');
  cleaned = cleaned.replace(/\bamazon prime\b/gi, ' ');
  cleaned = cleaned.replace(/\bplaytest steam\b/gi, ' ');
  cleaned = cleaned.replace(/\bon steam\b/gi, ' ');
  cleaned = cleaned.replace(/\bplaytest\b/gi, ' ');
  cleaned = cleaned.replace(/\b100%\s*off\b/gi, ' ');

  // 5. Multi-game bundle: if split by '/' or ',', pick the first game
  if (cleaned.includes('/')) {
    cleaned = cleaned.split('/')[0];
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.split(',')[0];
  }

  // 6. Clean common fluff keywords and strip dangling punctuation
  // Preserves apostrophes inside words (e.g. We're, Freddy's, Assassin's)
  cleaned = cleaned
    .replace(/\b(giveaway|free|steam|key|game|loot|dlc|beta|alpha|itch\.io|epic|gog|starter edition|starter pack)\b/gi, ' ')
    .replace(/[^\w\s:\-–—']/gi, ' ')
    .replace(/(^|\s)'+|'+(\s|$)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove trailing dashes or colons left over from stripped text
  cleaned = cleaned.replace(/\s*[:\-–—]\s*$/, '').trim();

  return cleaned;
}

/**
 * Searches Steam Store search API by game title to find the exact App ID.
 * Strict exact-normalized-title matching only: no fuzzy matching.
 * Results cached in ONE AsyncStorage map (found: 30 days, not found: 7 days).
 * Throttled to 2 concurrent requests.
 */
const STEAM_TAGS_MAP: Record<number, string> = {
  1667: 'horror',
  21: 'adventure',
  492: 'indie',
  3964: 'pixel',
  4234: 'atmospheric',
  19: 'action',
  122: 'rpg',
  597: 'casual',
  599: 'simulation',
  9: 'strategy',
  25: 'adventure',
  1774: 'shooter',
  3839: 'first-person',
  1663: 'sci-fi',
  4085: 'anime',
};

export async function searchSteamAppId(title: string): Promise<string | null> {
  if (!title) return null;
  const cleanTitle = cleanGameTitleForSearch(title);
  if (!cleanTitle || cleanTitle.length < 2) return null;

  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normKey = normalize(cleanTitle);
  const normOriginal = normalize(title);
  if (!normKey || normKey.length < 2) return null;

  // Detect potential subtitle separator (e.g. "Home - A Unique Horror Adventure")
  const splitMatch = cleanTitle.match(/^(.+?)\s*[-–—:]\s*(.+)$/);
  const baseTitle = splitMatch ? splitMatch[1].trim() : '';
  const subtitle = splitMatch ? splitMatch[2].trim() : '';

  const cacheMap = await loadTitleCacheMap();
  const cached = cacheMap[normKey];
  const now = Date.now();

  if (cached) {
    // If cached found, return immediately
    if (cached.appId) return cached.appId;
    // If cached not-found, only skip if within 7 days AND no subtitle retry is available
    if (!baseTitle && now - cached.timestamp < NOT_FOUND_TTL) {
      return null;
    }
  }

  const releaseSlot = await acquireSearchSlot();

  try {
    const DEMO_OR_SECONDARY_REGEX = /\b(demo|prologue|playtest|beta|alpha|teaser|soundtrack|ost|art\s*book|extra|dlc|server|dedicated\s+server)\b|[\(\[\{]\s*(?:demo|prologue|playtest|beta|alpha)\s*[\)\]\}]/i;

    const isNotDemo = (name: string, original: string) => {
      const lower = name.toLowerCase();
      if (original.includes('demo')) return true;
      return !DEMO_OR_SECONDARY_REGEX.test(lower);
    };

    const fetchSteamEndpoint = async (url: string) => {
      if (Platform.OS === 'web') {
        return await fetchWithProxy(url, 5000);
      }
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 5000);
      try {
        const res = await fetch(url, {
          signal: c.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });
        return res;
      } finally {
        clearTimeout(t);
      }
    };

    // ─── PASS 1: Direct Steam storesearch with cleanTitle ───────────────────
    const searchUrl = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(cleanTitle)}&l=english&cc=US`;
    let response = await fetchSteamEndpoint(searchUrl);
    let data: any = null;

    if (response.ok) {
      data = await response.json();
    }

    // Fallback: If 0 items and cleanTitle contains an apostrophe, try searching without apostrophes (e.g. "We're" -> "Were")
    if ((!data || !Array.isArray(data.items) || data.items.length === 0) && cleanTitle.includes("'")) {
      const fallbackTerm = cleanTitle.replace(/'/g, '');
      const fallbackUrl = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(fallbackTerm)}&l=english&cc=US`;
      const fallbackRes = await fetchSteamEndpoint(fallbackUrl);
      if (fallbackRes.ok) {
        data = await fallbackRes.json();
      }
    }

    if (data && Array.isArray(data.items) && data.items.length > 0) {
      const target = cleanTitle.trim().toLowerCase();
      const normTarget = normKey;
      const targetNoApos = target.replace(/'/g, '');

      // 1. Exact name match (case-insensitive, with or without apostrophe)
      const exact = data.items.find((item: any) => {
        if (!isNotDemo(item.name || '', normOriginal)) return false;
        const itemName = (item.name || '').trim().toLowerCase();
        return itemName === target || itemName.replace(/'/g, '') === targetNoApos;
      });
      if (exact) {
        const id = String(exact.id);
        cacheMap[normKey] = { appId: id, timestamp: now };
        saveTitleCacheMap();
        return id;
      }

      // 2. Exact match ignoring punctuation/special characters (normalized)
      if (normTarget.length >= 3) {
        const exactNorm = data.items.find((item: any) => {
          if (!isNotDemo(item.name || '', normOriginal)) return false;
          const n = normalize(item.name || '');
          return n === normTarget || n === normOriginal;
        });
        if (exactNorm) {
          const id = String(exactNorm.id);
          cacheMap[normKey] = { appId: id, timestamp: now };
          saveTitleCacheMap();
          return id;
        }
      }

      // 3. Multi-result disambiguation: If search returned both full game and Demo/Prologue,
      // eliminate the demo and resolve to the definitive full game.
      const nonDemoItems = data.items.filter((item: any) => isNotDemo(item.name || '', normOriginal));
      if (nonDemoItems.length === 1) {
        const single = nonDemoItems[0];
        const n = normalize(single.name || '');
        if (n === normTarget || n === normOriginal || n.startsWith(normTarget) || normTarget.startsWith(n)) {
          const id = String(single.id);
          cacheMap[normKey] = { appId: id, timestamp: now };
          saveTitleCacheMap();
          return id;
        }
      }
    }

    // ─── PASS 2: Subtitle Fallback (e.g. "Home" from "Home - A Unique Horror Adventure") ──
    if (baseTitle && baseTitle.length >= 2) {
      const normBase = normalize(baseTitle);
      const subWords = subtitle.toLowerCase().split(/\W+/).filter((w) => w.length > 3);

      // Query Steam search results (returns up to 50 items with app IDs and tags)
      const resultsUrl = `https://store.steampowered.com/search/results/?query&start=0&count=50&dynamic_data=&sort_by=_ASC&term=${encodeURIComponent(
        baseTitle
      )}&infinite=1`;
      const resResults = await fetchSteamEndpoint(resultsUrl);

      if (resResults.ok) {
        const resData = await resResults.json();
        if (resData && typeof resData.results_html === 'string') {
          const regex = /<a href="https:\/\/store\.steampowered\.com\/app\/(\d+)\/[^"]*"([\s\S]*?)<\/a>/g;
          let match;
          const candidates: Array<{ id: string; name: string; tagIds: number[]; reviewCount: number }> = [];

          while ((match = regex.exec(resData.results_html)) !== null) {
            const candId = match[1];
            const block = match[2];
            const titleMatch = block.match(/<span class="title">([^<]+)<\/span>/);
            if (titleMatch) {
              const candName = titleMatch[1].trim();
              if (normalize(candName) === normBase && isNotDemo(candName, normOriginal)) {
                const tagidsMatch = block.match(/data-ds-tagids="\[(.*?)\]"/);
                const tagIds = tagidsMatch && tagidsMatch[1] ? tagidsMatch[1].split(',').map(Number) : [];
                const reviewMatch = block.match(/data-tooltip-html="([^"]+)"/);
                let reviewCount = 0;
                if (reviewMatch) {
                  const countMatch = reviewMatch[1].match(/([\d,]+)\s+user reviews/);
                  if (countMatch) {
                    reviewCount = parseInt(countMatch[1].replace(/,/g, ''), 10);
                  }
                }
                candidates.push({ id: candId, name: candName, tagIds, reviewCount });
              }
            }
          }

          if (candidates.length === 1) {
            const resolvedId = candidates[0].id;
            cacheMap[normKey] = { appId: resolvedId, timestamp: now };
            saveTitleCacheMap();
            return resolvedId;
          }

          if (candidates.length > 1) {
            let bestScore = -1;
            let bestAppId: string | null = null;

            for (const cand of candidates) {
              let score = 0;
              // Score based on subtitle keyword overlap with game tags
              for (const tid of cand.tagIds) {
                const tagWord = STEAM_TAGS_MAP[tid] || '';
                if (tagWord && subWords.includes(tagWord)) {
                  score += 10;
                }
              }
              // Popularity bonus for real established titles with reviews
              if (cand.reviewCount > 100) {
                score += Math.log10(cand.reviewCount);
              }
              if (score > bestScore) {
                bestScore = score;
                bestAppId = cand.id;
              }
            }

            if (bestAppId && bestScore > 0) {
              cacheMap[normKey] = { appId: bestAppId, timestamp: now };
              saveTitleCacheMap();
              return bestAppId;
            }
          }
        }
      }
    }

    // No match found: record not-found in cache for 7 days
    cacheMap[normKey] = { appId: null, timestamp: now };
    saveTitleCacheMap();
  } catch (err: any) {
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
 * If url doesn't have an App ID, searches by game title if deal is a full game.
 */
export async function enrichSteamDeal(url: string, title?: string, isFullGame = true): Promise<SteamEnrichedData | null> {
  const directAppId = extractSteamAppId(url);
  let appId = directAppId;
  let resolvedStoreUrl: string | undefined = undefined;

  // Skip title lookup if deal is not a full game (DLC, loot, codes, credits, extensions, gift packs)
  if (!appId && title && isFullGame) {
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

  // 1. Fetch App Reviews and App Details concurrently (SteamSpy is game-page only, never in enrichSteamDeal)
  // Query all-time reviews: language=all, purchase_type=all, review_type=all to get the true canonical Steam rating
  const reviewsUrl = `https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/?appid=${appId}&cursor=*&language=all&purchase_type=all&review_type=all&num_per_page=0`;
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
    const summary = reviewsResult.value.response?.query_summary || reviewsResult.value.query_summary;
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
  let trailerUrl: string | undefined;
  let trailerThumbnail: string | undefined;
  let metacriticScore: number | undefined;
  let playtimeHours: number | undefined;
  const gameModes: string[] = [];

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
      description = cleanGameDescription(data.short_description || data.about_the_game) || undefined;
      if (data.header_image) {
        image = data.header_image;
      } else if (fallbackHeader) {
        image = fallbackHeader;
      }
      genres = data.genres ? data.genres.map((g: any) => g.description) : undefined;
      releaseDate = data.release_date?.date || undefined;

      // Extract Game Mode from Steam categories (Requirement 3: Map to ONE label, real data only)
      let resolvedGameMode: string | undefined = undefined;
      if (Array.isArray(data.categories)) {
        const catDescs = data.categories.map((c: any) => String(c?.description || '').trim());
        if (catDescs.some((d: string) => /co-?op/i.test(d))) {
          resolvedGameMode = 'Co-op';
        } else if (catDescs.some((d: string) => /multi-?player|pvp/i.test(d))) {
          resolvedGameMode = 'Multiplayer';
        } else if (catDescs.some((d: string) => /single-?player/i.test(d))) {
          resolvedGameMode = 'Single-player';
        }
      }
      if (resolvedGameMode) {
        gameModes.push(resolvedGameMode);
      }

      // Extract Metacritic score
      if (data.metacritic && typeof data.metacritic.score === 'number' && data.metacritic.score > 0) {
        metacriticScore = data.metacritic.score;
      }

      // Extract Steam game name for exact title verification
      var steamGameName = data.name || undefined;

      // Extract Trailer
      if (Array.isArray(data.movies) && data.movies.length > 0) {
        const m = data.movies[0];
        trailerThumbnail = m.thumbnail || undefined;
        trailerUrl = m.mp4?.['480'] || m.mp4?.max || m.hls_h264 || undefined;
      }
    }
  }

  // Rating Guard: A rating applies ONLY when the App ID was read from a Steam URL on the deal
  // OR the normalized Steam title matches the deal's normalized title exactly.
  if (!directAppId) {
    const normalizeStr = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const normSteam = normalizeStr(steamGameName || '');
    const normDealClean = normalizeStr(cleanGameTitleForSearch(title || ''));
    const normDealRaw = normalizeStr(title || '');
    const isExactMatch = normSteam.length >= 2 && (normSteam === normDealClean || normSteam === normDealRaw);

    if (!isExactMatch) {
      steamRatingPercent = undefined;
      steamReviewCount = undefined;
      steamDbRating = undefined;
      reviewScore = undefined;
    }
  }

  const gameMode = gameModes.length > 0 ? gameModes[0] : undefined;

  return {
    steamAppId: appId,
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
    trailerUrl,
    metacriticScore,
    playtimeHours,
    gameModes: gameModes.length > 0 ? gameModes : undefined,
    gameMode,
  };
}



// ─── Store Release Date Resolver ──────────────────────────────────────────
export const storeReleaseDateCache = new Map<string, string | null>();

export function getStoreIdentifier(deal: Deal): string | null {
  const steamAppId =
    (deal.steamAppId && /^\d+$/.test(deal.steamAppId) ? deal.steamAppId : null) ||
    extractSteamAppId([deal.storeUrl, deal.steamUrl, deal.giveawayUrl, deal.url].filter(Boolean).join(' '));
  if (steamAppId) return `steam_${steamAppId}`;

  const epicSlug = extractEpicSlug([deal.storeUrl, deal.url, deal.giveawayUrl].filter(Boolean).join(' '));
  if (epicSlug) return `epic_${epicSlug.toLowerCase()}`;

  const gogMatch = [deal.storeUrl, deal.url, deal.giveawayUrl]
    .filter(Boolean)
    .join(' ')
    .match(/gog\.com\/(?:[a-z]{2}\/)?game\/([a-zA-Z0-9_-]+)/i);
  if (gogMatch && gogMatch[1]) return `gog_${gogMatch[1].toLowerCase()}`;

  return null;
}

export async function fetchExactStoreReleaseDate(deal: Deal): Promise<string | null> {
  const storeId = getStoreIdentifier(deal);
  if (!storeId) return null;

  if (storeReleaseDateCache.has(storeId)) {
    return storeReleaseDateCache.get(storeId) || null;
  }

  // 1. Steam store details by exact App ID
  if (storeId.startsWith('steam_')) {
    const appId = storeId.replace('steam_', '');
    try {
      const c = new AbortController();
      const timer = setTimeout(() => c.abort(), 3500);
      const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&filters=release_date`;
      const res = Platform.OS === 'web'
        ? await fetchWithProxy(url, 3500)
        : await fetch(url, { signal: c.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
      clearTimeout(timer);
      if (res.ok) {
        const json = await res.json();
        const rawDate = json?.[appId]?.data?.release_date?.date;
        if (rawDate && typeof rawDate === 'string' && rawDate.trim().length > 0) {
          const formatted = formatDisplayDate(rawDate);
          if (formatted) {
            storeReleaseDateCache.set(storeId, formatted);
            return formatted;
          }
        }
      }
    } catch {}
    storeReleaseDateCache.set(storeId, null);
    return null;
  }

  // 2. Epic Games by exact product slug
  if (storeId.startsWith('epic_')) {
    const slug = storeId.replace('epic_', '');
    try {
      const catalog = await getEpicPromotionsCatalog().catch(() => []);
      const match = catalog.find((el: any) => {
        const pSlug = (el.productSlug || el.urlSlug || el.catalogNs?.mappings?.[0]?.pageSlug || '').toLowerCase();
        return pSlug === slug || el.id === slug;
      });
      if (match?.releaseDate) {
        const formatted = formatDisplayDate(match.releaseDate);
        if (formatted) {
          storeReleaseDateCache.set(storeId, formatted);
          return formatted;
        }
      }

      const c = new AbortController();
      const timer = setTimeout(() => c.abort(), 3500);
      const contentUrl = `https://store-content-ipv4.ak.epicgames.com/api/en-US/content/products/${slug}`;
      const res = Platform.OS === 'web'
        ? await fetchWithProxy(contentUrl, 3500)
        : await fetch(contentUrl, { signal: c.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        const page0 = data?.pages?.[0]?.data;
        const rawDate = page0?.releaseDate || page0?.about?.releaseDate;
        if (rawDate) {
          const formatted = formatDisplayDate(rawDate);
          if (formatted) {
            storeReleaseDateCache.set(storeId, formatted);
            return formatted;
          }
        }
      }
    } catch {}
    storeReleaseDateCache.set(storeId, null);
    return null;
  }

  // 3. GOG by exact game slug
  if (storeId.startsWith('gog_')) {
    const slug = storeId.replace('gog_', '');
    try {
      const c = new AbortController();
      const timer = setTimeout(() => c.abort(), 3500);
      const url = `https://api.gog.com/products/${slug}`;
      const res = Platform.OS === 'web'
        ? await fetchWithProxy(url, 3500)
        : await fetch(url, { signal: c.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        const rawDate = data?.release_date;
        if (rawDate) {
          const formatted = formatDisplayDate(rawDate);
          if (formatted) {
            storeReleaseDateCache.set(storeId, formatted);
            return formatted;
          }
        }
      }
    } catch {}
    storeReleaseDateCache.set(storeId, null);
    return null;
  }

  return null;
}
