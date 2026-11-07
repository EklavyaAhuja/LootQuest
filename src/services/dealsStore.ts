import { Image, Platform, AppState } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Deal } from '../models/Deal';
import { fetchMergedGameFeed, getStoredMergedDeals, fetchWithProxy, checkRedditPostsStatus } from './redditService';
import { dealEnrichmentService } from './DealEnrichmentService';
import {
  isDealExpired,
  parseDateToMs,
  isPostRemovedByModerator,
  cleanDisplayTitle,
  extractSteamAppId,
  isGameOnlyDeal,
  calculateVaultValue,
  calculateFreeRightNowValue,
  isSessionFailedUrl,
  markSessionFailedUrl,
  isPrimeDeal,
  parsePrimeGameTitles,
  cleanPrimePostTitle,
  formatPrimeGameDisplayNames,
  getTimeLeft,
  cleanGameDescription,
  determineClaimMethod,
  isThirdPartyTaskHost,
  getCanonicalKey,
  normalizeTitle,
  getCanonicalPlatform,
} from '../utils/dealUtils';
import { PRIME_GAMING_CONFIG } from '../config/primeGaming';
import { getClaimedPosts, addClaimedPost, removeClaimedPost } from './storageService';
import { postToBasicDeal } from './DealClassifier';
import { searchSteamAppId } from './SteamGamesEnricher';
import { extractEpicSlug, fetchEpicProductContent } from './EpicGamesEnricher';
import { getEpicPromotionsCatalog } from './EpicPromotionsService';
import { fetchImageFromUrl } from '../utils/imageResolver';
import { expiredFeedService } from './ExpiredFeedService';


// Storage Keys
const STORAGE_KEYS = {
  FEED_CACHE: 'fgf_merged_feed_cache_v5',
  RESOLVED_IMAGES: 'claimr_resolved_images_v3',
  RESOLVED_POSTERS: 'claimr_resolved_posters_v3',
  RESOLVED_SOURCES: 'claimr_resolved_sources_v3',
  IMAGE_RETRY_MAP: 'claimr_image_retry_map_v3',
  ALWAYS_SHOW_18PLUS: 'claimr_always_show_18plus',
  STEAM_SCREENSHOTS_PREFIX: 'claimr_screenshots_',
  EPIC_PROMOTIONS_CACHE: 'claimr_epic_promotions_cache_v2',
};

/**
 * Universal cross-source deal deduplication function.
 * Matches across:
 * 1. Exact Deal ID
 * 2. Canonical key (Title + Platform)
 * 3. Normalized Title + Canonical Platform (e.g. "GMH - Good Morning Human" vs "GMH - Good Morning Human Giveaways")
 * 4. Clean Display Title + Canonical Platform
 * 5. Steam App ID + Canonical Platform
 * 6. Epic Product Slug + Canonical Platform
 */
export function deduplicateDealsList(deals: Deal[]): Deal[] {
  const result: Deal[] = [];
  const seenIds = new Set<string>();
  const seenCanonKeys = new Map<string, Deal>();
  const seenTitles = new Map<string, Deal>();
  const seenCleans = new Map<string, Deal>();
  const seenSteam = new Map<string, Deal>();
  const seenEpic = new Map<string, Deal>();

  for (const d of deals) {
    if (!d || isDealExpired(d) || isPostRemovedByModerator(d) || expiredFeedService.isExpired(d)) {
      continue;
    }

    // Immediately purge legacy hardcoded mock IDs (e.g. LISA: The Definitive Edition which is no longer free)
    if (d.id === 'epic_lisa_definitive' || d.id === 'epic_sorry_were_closed' || d.id === 'steam_letter_quest' || d.id === 'steam_wild_eight' || d.id === 'epic_mobile_galaxy_kart') {
      continue;
    }

    if (isPrimeDeal(d)) {
      result.push(d);
      continue;
    }

    const plat = getCanonicalPlatform(d.platform);
    const norm = normalizeTitle(d.title);
    const clean = cleanDisplayTitle(d.title).toLowerCase().replace(/[^a-z0-9]/gi, '');
    const steamId = d.steamAppId || (d.url ? extractSteamAppId(d.url) : '');
    const epicSlug = d.url && d.url.includes('epicgames.com') ? extractEpicSlug(d.url) : '';
    const canonKey = getCanonicalKey(d.title, d.platform, d.url || d.storeUrl);

    let existing: Deal | undefined;
    if (d.id && seenIds.has(d.id)) {
      existing = result.find((x) => x.id === d.id);
    } else if (canonKey && canonKey.length > 3 && seenCanonKeys.has(canonKey)) {
      existing = seenCanonKeys.get(canonKey);
    } else if (norm.length >= 3 && seenTitles.has(`${norm}_${plat}`)) {
      existing = seenTitles.get(`${norm}_${plat}`);
    } else if (clean.length >= 3 && seenCleans.has(`${clean}_${plat}`)) {
      existing = seenCleans.get(`${clean}_${plat}`);
    } else if (steamId && seenSteam.has(`${steamId}_${plat}`)) {
      existing = seenSteam.get(`${steamId}_${plat}`);
    } else if (epicSlug && seenEpic.has(`${epicSlug}_${plat}`)) {
      existing = seenEpic.get(`${epicSlug}_${plat}`);
    }

    if (existing) {
      const preferredImage = (!existing.image || existing.image.includes('default') || existing.image.includes('placeholder'))
        ? d.image
        : (d.image && !d.image.includes('default') && !d.image.includes('placeholder') ? d.image : existing.image);
      const preferredUrl = (d.url && (d.url.includes('epicgames.com') || d.url.includes('steampowered.com') || d.url.includes('gog.com')))
        ? d.url
        : (existing.url || d.url);
      const preferredWorth = d.worth || existing.worth;

      existing.image = preferredImage;
      existing.url = preferredUrl;
      existing.worth = preferredWorth;
      existing.steamRatingPercent = existing.steamRatingPercent ?? d.steamRatingPercent;
      existing.metacriticScore = existing.metacriticScore ?? d.metacriticScore;
      existing.claimedUsers = Math.max(existing.claimedUsers || 0, d.claimedUsers || 0);
      if (d.id) seenIds.add(d.id);
      continue;
    }

    result.push(d);
    if (d.id) seenIds.add(d.id);
    if (canonKey && canonKey.length > 3) seenCanonKeys.set(canonKey, d);
    if (norm.length >= 3) seenTitles.set(`${norm}_${plat}`, d);
    if (clean.length >= 3) seenCleans.set(`${clean}_${plat}`, d);
    if (steamId) seenSteam.set(`${steamId}_${plat}`, d);
    if (epicSlug) seenEpic.set(`${epicSlug}_${plat}`, d);
  }

  return result;
}

export interface FeedFilters {
  stores: string[]; // ['all'] or ['steam', 'epic']
  types: string[]; // ['all'] or ['game', 'dlc', 'beta']
  claimMethods: string[]; // ['any'] or ['one_click', 'tasks']
  sortId: 'new' | 'end' | 'val' | 'claims';
  search: string;
}

export interface StoreOption {
  id: string;
  label: string;
}

export interface TypeOption {
  id: string;
  label: string;
}

export interface ClaimMethodOption {
  id: string;
  label: string;
}

export interface PrimeNoticeData {
  deal: Deal;
  postIds: string[];
  gameNames: string[];
  displayNamesText: string;
  endDate?: string | null;
  timeLeft?: string;
}

export const STORE_OPTIONS: StoreOption[] = [
  { id: 'all', label: 'All stores' },
  { id: 'steam', label: 'Steam' },
  { id: 'epic', label: 'Epic' },
  { id: 'gog', label: 'GOG' },
  { id: 'prime', label: 'Prime Gaming' },
  { id: 'itch', label: 'itch.io' },
  { id: 'playstation', label: 'PlayStation' },
  { id: 'xbox', label: 'Xbox' },
  { id: 'mobile', label: 'Mobile' },
];

export const TYPE_OPTIONS: TypeOption[] = [
  { id: 'all', label: 'All' },
  { id: 'game', label: 'Game' },
  { id: 'dlc', label: 'DLC' },
  { id: 'beta', label: 'Beta' },
  { id: '18plus', label: '18+ / Mature' },
];

export const CLAIM_METHOD_OPTIONS: ClaimMethodOption[] = [
  { id: 'any', label: 'Any' },
  { id: 'one_click', label: 'One-click' },
  { id: 'tasks', label: 'Tasks required' },
];

// Helper: Normalize Candidate URL
export function normalizeCandidateUrl(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  let clean = raw.trim()
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');

  const lower = clean.toLowerCase();
  if (
    !lower ||
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

export function isBadArt(u?: string | null): boolean {
  return typeof u === 'string' && (u.includes('library_hero') || u.includes('page_bg'));
}

export interface ImageProbeResult {
  status: 'success' | 'timeout' | 'error';
  width: number;
  height: number;
}

// Helper: Probe image dimensions with Image.getSize and report status
export function probeImageDimensions(
  url: string,
  timeoutMs = 6000
): Promise<ImageProbeResult> {
  return new Promise((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({ status: 'timeout', width: 0, height: 0 });
      }
    }, timeoutMs);

    Image.getSize(
      url,
      (width, height) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          if (width > 1 && height > 1) {
            resolve({ status: 'success', width, height });
          } else {
            resolve({ status: 'error', width: 0, height: 0 });
          }
        }
      },
      () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve({ status: 'error', width: 0, height: 0 });
        }
      }
    );
  });
}

// Backward-compatible helper: Get image dimensions with Image.getSize
export async function getImageDimensions(
  url: string,
  timeoutMs = 6000
): Promise<{ width: number; height: number } | null> {
  const res = await probeImageDimensions(url, timeoutMs);
  return res.status === 'success' ? { width: res.width, height: res.height } : null;
}

// Backward-compatible helper: Verify image with Image.getSize
export async function verifyImageDimensions(url: string, timeoutMs = 6000, minWidth = 100): Promise<boolean> {
  const dims = await getImageDimensions(url, timeoutMs);
  return !!dims && dims.width >= minWidth;
}

// Extract Steam app ID from deal URLs, deal fields, or post description
export function extractSteamAppIdFromDealUrls(deal: Deal): string | null {
  if ((deal as any).steamAppId && /^\d+$/.test(String((deal as any).steamAppId))) {
    return String((deal as any).steamAppId);
  }
  const urlsToCheck = [deal.storeUrl, deal.giveawayUrl, deal.steamUrl, deal.url].filter(Boolean) as string[];
  for (const u of urlsToCheck) {
    if (u.includes('steampowered.com') || u.includes('steamcommunity.com') || u.includes('/app/')) {
      const match = u.match(/(?:store\.steampowered\.com\/app|steamcommunity\.com\/app)\/(\d+)/i) ||
                    u.match(/\/app\/(\d+)/i);
      if (match && match[1] && /^\d+$/.test(match[1])) {
        return match[1];
      }
    }
  }
  // Check post body or instructions
  const textToCheck = [deal.description, deal.instructions].filter(Boolean) as string[];
  for (const text of textToCheck) {
    const match = text.match(/store\.steampowered\.com\/app\/(\d+)/i);
    if (match && match[1] && /^\d+$/.test(match[1])) {
      return match[1];
    }
  }
  // If GamerPower deal has an extracted storeUrl pointing to Steam
  if (deal.source === 'gamerpower' || deal.id.startsWith('gp_')) {
    if (deal.storeUrl && deal.storeUrl.includes('steampowered.com')) {
      const match = deal.storeUrl.match(/\/app\/(\d+)/i);
      if (match && match[1] && /^\d+$/.test(match[1])) {
        return match[1];
      }
    }
  }
  return null;
}

export interface CandidateItem {
  url: string;
  source: 'steam' | 'epic' | 'gamerpower' | 'reddit' | 'fallback';
}

export function buildCandidatesForDeal(
  deal: Deal,
  epicElements: any[] | null,
  slot: 'wide' | 'poster'
): CandidateItem[] {
  const candidates: CandidateItem[] = [];
  const addedUrls = new Set<string>();

  const isPortraitUrl = (u?: string | null) => {
    if (!u) return false;
    const l = u.toLowerCase();
    return l.includes('library_600x900') || l.includes('tall') || l.includes('600x900') || l.includes('gqv76.png') || l.includes('kcgyv.png');
  };

  const pushCandidate = (url?: string | null, source: 'steam' | 'epic' | 'gamerpower' | 'reddit' = 'gamerpower') => {
    const norm = normalizeCandidateUrl(url);
    if (norm && !addedUrls.has(norm)) {
      if (slot === 'wide' && isPortraitUrl(norm)) {
        return; // strictly exclude portrait URLs for wide slot
      }
      addedUrls.add(norm);
      candidates.push({ url: norm, source });
    }
  };

  // 1. Detect if this is an Epic Games deal
  const isEpic = (deal.platform || '').toLowerCase().includes('epic') ||
                 (deal.storeUrl || '').includes('epicgames.com') ||
                 (deal.giveawayUrl || '').includes('epicgames.com') ||
                 (deal.url || '').includes('epicgames.com') ||
                 (deal.image || '').includes('epicgames.com') ||
                 (deal.resolvedImage || '').includes('epicgames.com');

  const pushEpicCandidates = () => {
    if (slot === 'poster' && (deal as any).epicPosterImage) {
      pushCandidate((deal as any).epicPosterImage, 'epic');
    } else if (slot !== 'poster' && (deal as any).epicWideImage) {
      pushCandidate((deal as any).epicWideImage, 'epic');
    }

    if (Array.isArray(epicElements) && epicElements.length > 0) {
      const cleanTarget = cleanDisplayTitle(deal.title).trim().toLowerCase();
      const normTarget = cleanTarget.replace(/\b(?:giveaway|free)\b/gi, '').replace(/\s+/g, ' ').trim();

      const match = epicElements.find((el: any) => {
        if (!el.title) return false;
        const elTitle = cleanDisplayTitle(el.title).trim().toLowerCase();
        if (elTitle === cleanTarget || elTitle === normTarget) return true;
        const elNorm = elTitle.replace(/\b(?:giveaway|free)\b/gi, '').replace(/\s+/g, ' ').trim();
        return elNorm === normTarget || normTarget.includes(elNorm) || elNorm.includes(normTarget);
      });

      if (match && Array.isArray(match.keyImages)) {
        if (slot === 'poster') {
          const tall = match.keyImages.find((k: any) =>
            k.url && (k.type === 'OfferImageTall' || k.type === 'DieselStoreFrontTall' || k.type === 'Thumbnail')
          );
          if (tall?.url) pushCandidate(tall.url, 'epic');
          const wide = match.keyImages.find((k: any) =>
            k.url && (k.type === 'OfferImageWide' || k.type === 'DieselStoreFrontWide' || k.type === 'featuredMedia')
          );
          if (wide?.url) pushCandidate(wide.url, 'epic');
        } else {
          // STRICTLY WIDE: ONLY OfferImageWide, DieselStoreFrontWide, or featuredMedia
          // Never push tall images into wide slot!
          const wide = match.keyImages.find((k: any) =>
            k.url && (k.type === 'OfferImageWide' || k.type === 'DieselStoreFrontWide' || k.type === 'featuredMedia')
          );
          if (wide?.url) pushCandidate(wide.url, 'epic');
        }
      }
    }

    if (deal.resolvedImage && deal.resolvedImage.includes('epicgames.com') && slot === 'wide') {
      pushCandidate(deal.resolvedImage, 'epic');
    }
    if (deal.image && deal.image.includes('epicgames.com')) {
      pushCandidate(deal.image, 'epic');
    }
  };

  const pushSteamCandidates = () => {
    const steamAppId = extractSteamAppIdFromDealUrls(deal);
    if (steamAppId && /^\d+$/.test(steamAppId)) {
      if (slot === 'poster') {
        pushCandidate(`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/library_600x900.jpg`, 'steam');
        pushCandidate(`https://cdn.cloudflare.steamstatic.com/steam/apps/${steamAppId}/library_600x900.jpg`, 'steam');
        pushCandidate(`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/header.jpg`, 'steam');
        pushCandidate(`https://cdn.cloudflare.steamstatic.com/steam/apps/${steamAppId}/header.jpg`, 'steam');
      } else {
        // ALWAYS choose images with title text (header.jpg, capsule) instead of textless library_hero.jpg
        pushCandidate(`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/header.jpg`, 'steam');
        pushCandidate(`https://cdn.cloudflare.steamstatic.com/steam/apps/${steamAppId}/header.jpg`, 'steam');
        pushCandidate(`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/capsule_616x353.jpg`, 'steam');
        pushCandidate(`https://cdn.cloudflare.steamstatic.com/steam/apps/${steamAppId}/capsule_616x353.jpg`, 'steam');
      }
    }
  };

  // For Epic Games: Epic official high-res art takes top priority, Steam serves as fallback
  // For Steam/Others: Steam official art with title text takes top priority, Epic serves as fallback
  if (isEpic) {
    pushEpicCandidates();
    pushSteamCandidates();
  } else {
    pushSteamCandidates();
    pushEpicCandidates();
  }

  // 3. GamerPower: use the largest field available (the full "image", not "thumbnail")
  if (deal.image && (deal.image.includes('gamerpower.com') || deal.source === 'gamerpower' || deal.id.startsWith('gp_'))) {
    pushCandidate(deal.image, 'gamerpower');
  } else if (deal.gamerPowerId || deal.id.startsWith('gp_')) {
    const gpId = deal.gamerPowerId || deal.id.replace('gp_', '');
    pushCandidate(`https://www.gamerpower.com/offers-1/${gpId}.jpg`, 'gamerpower');
    pushCandidate(`https://www.gamerpower.com/offers/1b/${gpId}.jpg`, 'gamerpower');
  }

  // 4. Reddit: use the ORIGINAL image (preview.images[0].source.url).
  // For third-party key giveaway hosts (Legion Gaming, Alienware, Gleam, Steelseries),
  // Reddit link preview is almost always the host community's generic logo/banner.
  // Don't push host logos if we already have official Steam/Epic game art candidates!
  const isThirdPartyHost = (deal.url || '').includes('gaming.lenovo.com') ||
                           (deal.url || '').includes('alienwarearena.com') ||
                           (deal.url || '').includes('steelseries.com') ||
                           (deal.url || '').includes('gleam.io') ||
                           (deal.url || '').includes('givee.club');

  if (!isThirdPartyHost || candidates.length === 0) {
    if (deal.redditOriginalImage) {
      pushCandidate(deal.redditOriginalImage, 'reddit');
    }
    if ((deal as any).coverImage) {
      pushCandidate((deal as any).coverImage, 'reddit');
    }
    if (deal.image && !addedUrls.has(normalizeCandidateUrl(deal.image) || '')) {
      pushCandidate(deal.image, deal.source === 'gamerpower' ? 'gamerpower' : 'reddit');
    }
  }

  return candidates;
}

export async function resolveCandidateItem(
  candidates: CandidateItem[],
  minWidth: number,
  slot: 'wide' | 'poster' = 'wide'
): Promise<{
  winner: { url: string; source: 'steam' | 'epic' | 'gamerpower' | 'reddit' | 'fallback'; width: number; height: number } | null;
  hadTimeout: boolean;
}> {
  if (!candidates || candidates.length === 0) return { winner: null, hadTimeout: false };

  // Filter valid, non-failed candidates
  const validCandidates: Array<{ c: CandidateItem; norm: string; index: number }> = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const norm = normalizeCandidateUrl(c.url);
    if (norm && !isSessionFailedUrl(norm)) {
      validCandidates.push({ c, norm, index: i });
    }
  }

  if (validCandidates.length === 0) return { winner: null, hadTimeout: false };

  let hadTimeout = false;

  // Probe all candidates concurrently with 6000ms timeout (Follow-up A)
  const probeResults = await Promise.all(
    validCandidates.map(async ({ c, norm, index }) => {
      const res = await probeImageDimensions(norm, 6000);
      if (res.status === 'success') {
        return { url: norm, source: c.source, width: res.width, height: res.height, index };
      }
      if (res.status === 'timeout') {
        hadTimeout = true;
        // Do NOT markSessionFailedUrl on timeout (soft failure, retry on next sync/launch)
        return null;
      }
      // Hard failure (404, bad dimensions, corrupted image)
      markSessionFailedUrl(norm);
      return null;
    })
  );

  const passedCandidates = probeResults.filter((r): r is NonNullable<typeof r> => r !== null);
  if (passedCandidates.length === 0) return { winner: null, hadTimeout };

  // Aspect ratio gating:
  // For wide slot: Strictly reject portrait images (height > width) so text is never cropped!
  let eligibleCandidates = passedCandidates;
  if (slot === 'wide') {
    const wideOnly = passedCandidates.filter((p) => p.width >= p.height);
    if (wideOnly.length > 0) {
      eligibleCandidates = wideOnly;
    } else {
      // No true wide image passed probe; return null to preserve fallback text layout rather than a cropped portrait
      return { winner: null, hadTimeout };
    }
  } else if (slot === 'poster') {
    const posterOnly = passedCandidates.filter((p) => p.height >= p.width);
    if (posterOnly.length > 0) {
      eligibleCandidates = posterOnly;
    }
  }

  // Pick the highest-priority candidate that passed the minWidth check (lowest index in candidates array)
  const qualifying = eligibleCandidates
    .filter((p) => p.width >= minWidth)
    .sort((a, b) => a.index - b.index);

  if (qualifying.length > 0) {
    const winner = qualifying[0];
    return { winner: { url: winner.url, source: winner.source, width: winner.width, height: winner.height }, hadTimeout };
  }

  // If none met minWidth, fall back to the largest width among eligible candidates
  eligibleCandidates.sort((a, b) => b.width - a.width);
  const fallback = eligibleCandidates[0];
  return { winner: { url: fallback.url, source: fallback.source, width: fallback.width, height: fallback.height }, hadTimeout };
}

// Concurrency limiter for background og:image scrape (max 2 at a time, Follow-up B)
let activeScrapesCount = 0;
const scrapeWaitQueue: Array<() => void> = [];

function acquireScrapeSlot(): Promise<() => void> {
  if (activeScrapesCount < 2) {
    activeScrapesCount++;
    return Promise.resolve(() => releaseScrapeSlot());
  }
  return new Promise((resolve) => {
    scrapeWaitQueue.push(() => {
      activeScrapesCount++;
      resolve(() => releaseScrapeSlot());
    });
  });
}

function releaseScrapeSlot() {
  activeScrapesCount--;
  if (scrapeWaitQueue.length > 0) {
    const next = scrapeWaitQueue.shift();
    if (next) next();
  }
}

// 24-hour cache for failed page scrapes (Follow-up B)
const SCRAPE_NONE_FOUND_KEY = '@claimr_scrape_none_found_v2';
const LEGACY_SCRAPE_NONE_FOUND_KEY = '@lootquest_scrape_none_found_v2';
let scrapeNoneFoundCache: Record<string, number> | null = null;

async function loadScrapeNoneFoundCache(): Promise<Record<string, number>> {
  if (scrapeNoneFoundCache) return scrapeNoneFoundCache;
  try {
    let raw = await AsyncStorage.getItem(SCRAPE_NONE_FOUND_KEY);
    if (!raw) {
      raw = await AsyncStorage.getItem(LEGACY_SCRAPE_NONE_FOUND_KEY);
    }
    scrapeNoneFoundCache = raw ? JSON.parse(raw) : {};
  } catch {
    scrapeNoneFoundCache = {};
  }
  return scrapeNoneFoundCache || {};
}

function saveScrapeNoneFoundCache() {
  if (scrapeNoneFoundCache) {
    AsyncStorage.setItem(SCRAPE_NONE_FOUND_KEY, JSON.stringify(scrapeNoneFoundCache)).catch(() => {});
  }
}

export async function scrapeOgImageFallback(deal: Deal): Promise<string | null> {
  const targetUrl = deal.storeUrl || deal.giveawayUrl || deal.url;
  if (!targetUrl || isSessionFailedUrl(targetUrl)) return null;

  const cache = await loadScrapeNoneFoundCache();
  const lastFailed = cache[targetUrl];
  const now = Date.now();
  if (lastFailed && now - lastFailed < 24 * 3600 * 1000) {
    return null; // Cached "none found" for 24 hours
  }

  const release = await acquireScrapeSlot();
  try {
    const scraped = await fetchImageFromUrl(targetUrl, deal.title, 4000);
    if (scraped) {
      const probe = await probeImageDimensions(scraped, 6000);
      if (probe.status === 'success' && probe.width >= 200) {
        return scraped;
      }
    }
    // Record none found for 24h
    cache[targetUrl] = now;
    saveScrapeNoneFoundCache();
    return null;
  } catch {
    cache[targetUrl] = now;
    saveScrapeNoneFoundCache();
    return null;
  } finally {
    release();
  }
}

// Seeded Random / Hash for Top Rated daily shuffle
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getDailyTopRatedSet(pool: Deal[]): Deal[] {
  if (pool.length <= 10) return pool;

  const currentDay = Math.floor(Date.now() / 86400000);
  const prevDay = currentDay - 1;

  function seededRandom(seed: number) {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const prevPickedIds = new Set<string>();
  const prevScored = pool.map((deal) => {
    const idHash = hashString(deal.id || deal.title || '');
    return {
      deal,
      score: seededRandom(prevDay * 10007 + (idHash % 100003)),
    };
  });
  prevScored.sort((a, b) => b.score - a.score);
  prevScored.slice(0, 10).forEach((x) => prevPickedIds.add(x.deal.id));

  const canAvoidPrev = pool.length >= 15;
  const currScored = pool.map((deal) => {
    const idHash = hashString(deal.id || deal.title || '');
    const baseR = seededRandom(currentDay * 10007 + (idHash % 100003));
    const wasInPrev = prevPickedIds.has(deal.id);
    const score = canAvoidPrev && wasInPrev ? baseR * 0.15 : baseR;
    return { deal, score };
  });

  currScored.sort((a, b) => b.score - a.score);
  return currScored.slice(0, 10).map((x) => x.deal);
}

// Parse price numeric from worth or originalPrice
function parseNumericPrice(deal: Deal): number {
  if (deal.isEstimated) return 0;
  const raw = deal.worth || deal.originalPrice || '';
  const num = parseFloat(raw.replace(/[^0-9.]/g, ''));
  return isNaN(num) ? 0 : num;
}

// ─────────────────────────────────────────────────────────────────────────────
// CENTRAL DEALS STORE CLASS
// ─────────────────────────────────────────────────────────────────────────────

class DealsStore {
  private deals: Deal[] = [];
  private claimedMap: Record<string, boolean> = {};
  private claimedDeals: Deal[] = [];
  private resolvedImages: Record<string, string> = {}; // dealId -> verified wide/banner URL
  private resolvedPosters: Record<string, string> = {}; // dealId -> verified poster URL
  private resolvedSources: Record<string, 'steam' | 'epic' | 'gamerpower' | 'reddit' | 'fallback'> = {};
  private retryMap: Record<string, { nextRetry: number; attempt: number }> = {};
  private alwaysShow18Plus: boolean = false;
  private revealed18PlusIds: Set<string> = new Set();
  private syncState: 'idle' | 'syncing' | 'synced_just_now' = 'idle';
  private initialized: boolean = false;
  private hasSyncedOnce: boolean = false;
  private enrichedCacheSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Set<() => void> = new Set();
  private epicPromotionsCache: any[] | null = null;
  private upgradeRunning: boolean = false;
  private hasUpgradedOnce: boolean = false;
  private syncGeneration: number = 0;
  private isBackgroundWorkRunning: boolean = false;
  private lastSyncTimestamp: number = 0;
  private isOfflineState: boolean = false;
  private currentHeroId: string | null = null;
  private steamDescriptionsCache = new Map<string, string>();
  private firstSeenMap: Record<string, number> = {};
  private firstSeenSaveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    (globalThis as any).__DEALS_STORE__ = this;
  }

  public subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  public getSyncState() {
    return this.syncState;
  }

  public hasCompletedSync(): boolean {
    return this.hasSyncedOnce;
  }

  public getLastSyncTimestamp(): number {
    return this.lastSyncTimestamp;
  }

  public isOffline(): boolean {
    return this.isOfflineState;
  }

  // ─── Throttled Feed Cache Save (Item 9) ──────────────────────────────────
  private feedCacheSaveTimer: any = null;
  private lastFeedCacheSaveTime = 0;
  private hasPendingFeedCacheWrite = false;

  public scheduleThrottledFeedCacheSave(): void {
    this.hasPendingFeedCacheWrite = true;
    const now = Date.now();
    const elapsed = now - this.lastFeedCacheSaveTime;
    if (elapsed >= 5000) {
      this.flushFeedCache();
    } else if (!this.feedCacheSaveTimer) {
      this.feedCacheSaveTimer = setTimeout(() => {
        this.flushFeedCache();
      }, 5000 - elapsed);
    }
  }

  public flushFeedCache(): void {
    if (this.feedCacheSaveTimer) {
      clearTimeout(this.feedCacheSaveTimer);
      this.feedCacheSaveTimer = null;
    }
    this.hasPendingFeedCacheWrite = false;
    this.lastFeedCacheSaveTime = Date.now();
    AsyncStorage.setItem(STORAGE_KEYS.FEED_CACHE, JSON.stringify(this.deals)).catch(() => {});
  }

  private scheduleFirstSeenSave(): void {
    if (this.firstSeenSaveTimer) return;
    this.firstSeenSaveTimer = setTimeout(() => {
      this.firstSeenSaveTimer = null;
      this.flushFirstSeenMap();
    }, 2000);
  }

  private flushFirstSeenMap(): void {
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const activeIds = new Set(this.deals.map((d) => d.id));
    const pruned: Record<string, number> = {};
    for (const [id, timestamp] of Object.entries(this.firstSeenMap)) {
      if (activeIds.has(id) || (now - timestamp < THIRTY_DAYS_MS)) {
        pruned[id] = timestamp;
      }
    }
    this.firstSeenMap = pruned;
    AsyncStorage.setItem('claimr_first_seen_v1', JSON.stringify(pruned)).catch(() => {});
  }

  private scheduleEnrichedCacheSave() {
    this.scheduleThrottledFeedCacheSave();
  }

  // ─── Storage Cleanup (Item 10) ───────────────────────────────────────────
  public async runStorageCleanup(): Promise<void> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const now = Date.now();
      const ONE_DAY_MS = 24 * 3600 * 1000;
      const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;

      // Whitelist of critical keys that must NEVER be deleted
      const PROTECTED_PREFIXES = [
        'fgf_claimed_',
        'claimr_vault_',
        'lootquest_vault_',
        'app_settings',
        'claimr_install_id',
        'lootquest_install_id',
        'claimr_resolved_images_v3',
        'lootquest_resolved_images_v3',
        'claimr_resolved_posters_v3',
        'lootquest_resolved_posters_v3',
        'claimr_resolved_sources_v3',
        'lootquest_resolved_sources_v3',
        'claimr_image_retry_map_v3',
        'lootquest_image_retry_map_v3',
        'fgf_custom_filters_',
        'fgf_merged_feed_cache_v3',
      ];

      const isProtected = (k: string) => PROTECTED_PREFIXES.some((p) => k.startsWith(p));

      const dealCacheKeys = allKeys.filter((k) => k.startsWith('fgf_deal_cache_') && !isProtected(k));
      const screenshotKeys = allKeys.filter(
        (k) => (k.startsWith('claimr_screenshots_') || k.startsWith('lootquest_screenshots_')) && !isProtected(k)
      );

      const keysToDelete: string[] = [];

      // Check deal caches in batches of 15
      const BATCH_SIZE = 15;
      for (let i = 0; i < dealCacheKeys.length; i += BATCH_SIZE) {
        const batch = dealCacheKeys.slice(i, i + BATCH_SIZE);
        const pairs = await AsyncStorage.multiGet(batch);
        for (const [key, val] of pairs) {
          if (val) {
            try {
              const parsed = JSON.parse(val);
              if (parsed.timestamp && now - parsed.timestamp > ONE_DAY_MS) {
                keysToDelete.push(key);
              }
            } catch {
              keysToDelete.push(key);
            }
          }
        }
        await new Promise((r) => setTimeout(r, 40));
      }

      // Check screenshot caches in batches of 15
      for (let i = 0; i < screenshotKeys.length; i += BATCH_SIZE) {
        const batch = screenshotKeys.slice(i, i + BATCH_SIZE);
        const pairs = await AsyncStorage.multiGet(batch);
        for (const [key, val] of pairs) {
          if (val) {
            try {
              const parsed = JSON.parse(val);
              if (parsed.timestamp && now - parsed.timestamp > SEVEN_DAYS_MS) {
                keysToDelete.push(key);
              }
            } catch {
              keysToDelete.push(key);
            }
          }
        }
        await new Promise((r) => setTimeout(r, 40));
      }

      // Check lootquest_resolved_images_v2: delete only if v3 exists and has keys
      if (allKeys.includes('lootquest_resolved_images_v2') && allKeys.includes('lootquest_resolved_images_v3')) {
        keysToDelete.push('lootquest_resolved_images_v2');
      }

      // Delete any leftover RAWG caches
      const rawgKeys = allKeys.filter((k) => k.toLowerCase().includes('rawg') && !isProtected(k));
      if (rawgKeys.length > 0) {
        keysToDelete.push(...rawgKeys);
      }

      // Delete in batches of 20 with yields
      for (let i = 0; i < keysToDelete.length; i += 20) {
        const delBatch = keysToDelete.slice(i, i + 20);
        await AsyncStorage.multiRemove(delBatch);
        await new Promise((r) => setTimeout(r, 40));
      }
    } catch (e) {
      console.warn('[DealsStore] Storage cleanup warning:', e);
    }
  }

  public getAlwaysShow18Plus() {
    return this.alwaysShow18Plus;
  }

  public is18PlusRevealed(dealId: string) {
    return this.alwaysShow18Plus || this.revealed18PlusIds.has(dealId);
  }

  public async setAlwaysShow18Plus(value: boolean) {
    this.alwaysShow18Plus = value;
    await AsyncStorage.setItem(STORAGE_KEYS.ALWAYS_SHOW_18PLUS, JSON.stringify(value));
    this.notify();
  }

  public reveal18PlusDeal(dealId: string) {
    this.revealed18PlusIds.add(dealId);
    this.notify();
  }

  // Helper: Get Epic promotions catalog via shared service (single cache and in-flight fetch)
  public async getEpicPromotionsElements(): Promise<any[]> {
    return getEpicPromotionsCatalog();
  }

  // ─── Initialization ────────────────────────────────────────────────────────
  public async init() {
    if (this.initialized) return;
    this.initialized = true;

    // Load persisted settings & caches concurrently
    try {
      // Clear legacy cache from older versions to prevent resurrecting old 157-deal caches
      AsyncStorage.removeItem('fgf_merged_feed_cache').catch(() => {});

      const [
        savedDeals,
        savedClaimed,
        savedImages,
        savedPosters,
        savedSources,
        savedRetries,
        saved18Plus,
        savedFirstSeen,
      ] = await Promise.all([
        getStoredMergedDeals(),
        getClaimedPosts(),
        AsyncStorage.getItem(STORAGE_KEYS.RESOLVED_IMAGES),
        AsyncStorage.getItem(STORAGE_KEYS.RESOLVED_POSTERS),
        AsyncStorage.getItem(STORAGE_KEYS.RESOLVED_SOURCES),
        AsyncStorage.getItem(STORAGE_KEYS.IMAGE_RETRY_MAP),
        AsyncStorage.getItem(STORAGE_KEYS.ALWAYS_SHOW_18PLUS),
        AsyncStorage.getItem('claimr_first_seen_v1'),
      ]);

      if (!savedFirstSeen) {
        savedFirstSeen = await AsyncStorage.getItem('lootquest_first_seen_v1').catch(() => null);
      }

      if (savedFirstSeen) {
        try {
          this.firstSeenMap = JSON.parse(savedFirstSeen);
        } catch {}
      }

      if (savedImages) {
        try {
          this.resolvedImages = JSON.parse(savedImages);
          // Purge any stale generic host logos, textless library_hero images, or portrait images so wide slot gets true landscape artwork
          let purged = false;
          const isStaleOrPortraitWide = (u: string) =>
            u.includes('gaming.lenovo.com') ||
            u.includes('alienwarearena.com') ||
            u.includes('steelseries.com') ||
            u.includes('gleam.io') ||
            u.includes('redditstatic.com') ||
            u.includes('thumbs.redditmedia.com') ||
            u.includes('library_hero') ||
            u.includes('page_bg') ||
            u.includes('library_600x900') ||
            u.includes('OfferImageTall') ||
            u.includes('DieselStoreFrontTall') ||
            u.includes('tall') ||
            u.includes('600x900') ||
            u.includes('gqv76.png') ||
            u.includes('kcgyv.png');

          for (const [id, imgUrl] of Object.entries(this.resolvedImages)) {
            if (typeof imgUrl === 'string' && isStaleOrPortraitWide(imgUrl)) {
              delete this.resolvedImages[id];
              delete this.resolvedPosters[id];
              delete this.resolvedSources[id];
              purged = true;
            }
          }
          if (purged) {
            AsyncStorage.setItem(STORAGE_KEYS.RESOLVED_IMAGES, JSON.stringify(this.resolvedImages)).catch(() => {});
            AsyncStorage.setItem(STORAGE_KEYS.RESOLVED_POSTERS, JSON.stringify(this.resolvedPosters)).catch(() => {});
            AsyncStorage.setItem(STORAGE_KEYS.RESOLVED_SOURCES, JSON.stringify(this.resolvedSources)).catch(() => {});
          }
        } catch {}
      } else {
        try {
          const oldV3 = await AsyncStorage.getItem('lootquest_resolved_images_v3');
          if (oldV3) {
            this.resolvedImages = JSON.parse(oldV3);
          } else {
            const oldV2 = await AsyncStorage.getItem('lootquest_resolved_images_v2');
            if (oldV2) this.resolvedImages = JSON.parse(oldV2);
          }
        } catch {}
      }

      if (savedPosters) {
        try {
          this.resolvedPosters = JSON.parse(savedPosters);
          let posterPurged = false;
          for (const [id, posterUrl] of Object.entries(this.resolvedPosters)) {
            if (
              typeof posterUrl === 'string' &&
              (posterUrl.includes('gaming.lenovo.com') ||
               posterUrl.includes('alienwarearena.com') ||
               posterUrl.includes('steelseries.com') ||
               posterUrl.includes('gleam.io') ||
               posterUrl.includes('redditstatic.com') ||
               posterUrl.includes('thumbs.redditmedia.com') ||
               posterUrl.includes('library_hero') ||
               posterUrl.includes('page_bg'))
            ) {
              delete this.resolvedPosters[id];
              posterPurged = true;
            }
          }
          if (posterPurged) {
            AsyncStorage.setItem(STORAGE_KEYS.RESOLVED_POSTERS, JSON.stringify(this.resolvedPosters)).catch(() => {});
          }
        } catch {}
      } else {
        try {
          const oldPosters = await AsyncStorage.getItem('lootquest_resolved_posters_v3');
          if (oldPosters) this.resolvedPosters = JSON.parse(oldPosters);
        } catch {}
      }

      if (savedSources) {
        try {
          this.resolvedSources = JSON.parse(savedSources);
        } catch {}
      } else {
        try {
          const oldSources = await AsyncStorage.getItem('lootquest_resolved_sources_v3');
          if (oldSources) this.resolvedSources = JSON.parse(oldSources);
        } catch {}
      }

      if (savedRetries) {
        try {
          this.retryMap = JSON.parse(savedRetries);
        } catch {}
      }

      if (saved18Plus) {
        try {
          this.alwaysShow18Plus = JSON.parse(saved18Plus);
        } catch {}
      }

      // Build claimed map with deduplication by clean title and id
      const seenClaimed = new Set<string>();
      const dedupedClaimed: Deal[] = [];

      for (const rawP of (savedClaimed || [])) {
        if (!rawP) continue;
        const p: any = rawP;
        const b = postToBasicDeal(p);
        const isBadArt = (u?: string) => typeof u === 'string' && (u.includes('library_hero') || u.includes('page_bg'));
        const isPortraitUrl = (u?: string) => typeof u === 'string' && (u.includes('library_600x900') || u.includes('tall') || u.includes('600x900') || u.includes('gqv76.png') || u.includes('kcgyv.png'));
        if (p.resolvedImage && !isBadArt(p.resolvedImage) && !isPortraitUrl(p.resolvedImage)) b.resolvedImage = p.resolvedImage;
        if (!b.resolvedImage && this.resolvedImages[b.id] && !isBadArt(this.resolvedImages[b.id]) && !isPortraitUrl(this.resolvedImages[b.id])) {
          b.resolvedImage = this.resolvedImages[b.id];
        }
        if (p.resolvedPoster && !isBadArt(p.resolvedPoster)) b.resolvedPoster = p.resolvedPoster;
        if (!b.resolvedPoster && this.resolvedPosters[b.id] && !isBadArt(this.resolvedPosters[b.id])) {
          b.resolvedPoster = this.resolvedPosters[b.id];
        }
        if (this.resolvedSources[b.id]) {
          b.resolvedSource = this.resolvedSources[b.id];
        }
        if (typeof p.steamRatingPercent === 'number') b.steamRatingPercent = p.steamRatingPercent;
        if (typeof p.steamReviewCount === 'number') b.steamReviewCount = p.steamReviewCount;

        const cleanKey = cleanDisplayTitle(b.title).toLowerCase().trim();
        const idKey = b.id ? String(b.id).trim() : '';
        const key = cleanKey || idKey;
        if (!key || seenClaimed.has(key) || (idKey && seenClaimed.has(idKey))) {
          continue;
        }
        seenClaimed.add(key);
        if (idKey) seenClaimed.add(idKey);
        const effectiveGiveawayUrl = b.giveawayUrl || (b.url && !b.url.includes('reddit.com') ? b.url : undefined);
        b.claimMethod = determineClaimMethod(
          b.instructions || '',
          b.title || '',
          b.platform || '',
          effectiveGiveawayUrl || b.url,
          b.id,
          b.source
        );
        dedupedClaimed.push(b);
      }

      this.claimedDeals = dedupedClaimed;

      this.claimedMap = {};
      for (const d of this.claimedDeals) {
        if (d.id) this.claimedMap[d.id] = true;
      }

      if (savedDeals && savedDeals.length > 0) {
        this.deals = deduplicateDealsList(
          savedDeals
            .map((d) => this.applyClassifications(d))
            .filter((d) => !isDealExpired(d) && !isPostRemovedByModerator(d) && !expiredFeedService.isExpired(d))
        );
      }

      this.notify();

      // On app open: re-check cached Reddit posts individually by ID against Reddit
      this.recheckCachedRedditDeals();
    } catch (e) {
      console.warn('[DealsStore] Initialization hydration warning:', e);
    }

    // Subscribe to continuous expired flair feed updates to purge ended games immediately
    expiredFeedService.subscribe(() => {
      this.purgeExpiredDeals();
    });

    // Start continuous fetching of expired flairs (checks every 5 minutes, foreground only, skip if sync ran < 2m)
    expiredFeedService.startContinuousPolling(5 * 60 * 1000, () => this.lastSyncTimestamp);

    // Subscribe to deal enrichment service updates
    dealEnrichmentService.subscribeBatch((batch) => {
      if (!batch || batch.length === 0) return;
      const batchMap = new Map(batch.map((d) => [d.id, d]));
      let hasChanges = false;
      this.deals = this.deals.map((p) => {
        const updated = batchMap.get(p.id);
        if (!updated) return p;
        hasChanges = true;
        const merged = {
          ...p,
          ...updated,
          // Preserve classification, type, and claimed state so filter counts & categories never jump
          type: p.type,
          claimMethod: p.claimMethod,
          is18Plus: p.is18Plus,
          isNsfw: p.isNsfw,
          claimedUsers: p.claimedUsers ?? updated.claimedUsers,
          worth: p.worth ?? updated.worth,
          endDate: p.endDate !== undefined ? p.endDate : updated.endDate,
          isExpired: p.isExpired !== undefined ? p.isExpired : updated.isExpired,
        };
        return this.applyClassifications(merged);
      });
      if (hasChanges) {
        this.notify();
        this.scheduleEnrichedCacheSave();
      }
    });

    // Start background sync & vault image backfill
    this.resolveVaultImages();
    this.sync(false);

    // Re-resolve existing deals and Vault items once in the background
    this.reResolveExistingDealsAndVaultOnce();

    // Storage cleanup once per launch in background (Item 10)
    setTimeout(() => {
      this.runStorageCleanup();
    }, 4000);

    // Flush feed cache when app goes to background (Item 9)
    AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        if (this.hasPendingFeedCacheWrite) {
          this.flushFeedCache();
        }
      }
    });
  }

  /**
   * Purges newly expired deals from live feed and saves updated cache.
   */
  public purgeExpiredDeals(): boolean {
    const beforeCount = this.deals.length;
    this.deals = this.deals.filter((d) => !isDealExpired(d) && !isPostRemovedByModerator(d) && !expiredFeedService.isExpired(d));
    const purged = beforeCount - this.deals.length;
    if (purged > 0) {
      console.log(`[DealsStore] Purged ${purged} newly expired or removed deal(s) from live feed.`);
      AsyncStorage.setItem(STORAGE_KEYS.FEED_CACHE, JSON.stringify(this.deals)).catch(() => {});
      this.notify();
      return true;
    }
    return false;
  }

  /**
   * Re-checks cached Reddit deals by post ID against Reddit / Arctic Shift on app launch.
   * Purges any removed or deleted posts from memory and storage caches, while keeping user's vault intact.
   */
  public async recheckCachedRedditDeals(): Promise<void> {
    try {
      const redditDeals = this.deals.filter((d) => d.source === 'reddit' || Boolean(d.redditUrl));
      if (redditDeals.length === 0) return;

      const ids = redditDeals.map((d) => d.id);
      const statusMap = await checkRedditPostsStatus(ids);

      const beforeCount = this.deals.length;
      this.deals = this.deals.filter((d) => {
        if (d.source === 'reddit' || Boolean(d.redditUrl)) {
          const status = statusMap.get(d.id);
          if (status === 'removed' || isPostRemovedByModerator(d) || expiredFeedService.isExpired(d)) {
            console.log(`[DealsStore] App-open recheck purged removed post: ${d.id} (${d.title})`);
            return false;
          }
        }
        return true;
      });

      if (this.deals.length < beforeCount) {
        AsyncStorage.setItem(STORAGE_KEYS.FEED_CACHE, JSON.stringify(this.deals)).catch(() => {});
        this.notify();
      }
    } catch (e) {
      console.warn('[DealsStore] App-open Reddit recheck error:', e);
    }
  }

  public updateDeal(id: string, patch: Partial<Deal>): void {
    let changed = false;
    this.deals = this.deals.map((d) => {
      if (d.id === id) {
        changed = true;
        return { ...d, ...patch };
      }
      return d;
    });
    if (changed) {
      this.notify();
    }
  }

  // ─── Classification Helper ──────────────────────────────────────────────────
  private applyClassifications(deal: Deal): Deal {
    // 18+ / NSFW detection
    const isReddit18 = deal.isNsfw === true;
    const titleLower = (deal.title || '').toLowerCase();
    const descLower = (deal.description || '').toLowerCase();
    const textHasMature =
      titleLower.includes('nsfw') ||
      titleLower.includes('18+') ||
      titleLower.includes('[18+]') ||
      descLower.includes('nsfw') ||
      descLower.includes('18+');
    const is18Plus = isReddit18 || textHasMature;

    // Attach resolvedImage, resolvedPoster, resolvedSource if present in memory map
    const rawWinnerImage = deal.resolvedImage || this.resolvedImages[deal.id];
    const rawWinnerPoster = deal.resolvedPoster || this.resolvedPosters[deal.id];
    const isPortraitUrl = (u?: string | null) =>
      typeof u === 'string' && (u.includes('library_600x900') || u.includes('tall') || u.includes('600x900') || u.includes('gqv76.png') || u.includes('kcgyv.png'));
    const winnerImage = !isBadArt(rawWinnerImage) && !isPortraitUrl(rawWinnerImage) ? rawWinnerImage : undefined;
    const winnerPoster = !isBadArt(rawWinnerPoster) ? rawWinnerPoster : undefined;
    const winnerSource = deal.resolvedSource || this.resolvedSources[deal.id];

    if (!this.firstSeenMap[deal.id]) {
      this.firstSeenMap[deal.id] = deal.firstSeenAt || deal.publishedAt || deal.createdAt || (Date.now() - 86400000);
      this.scheduleFirstSeenSave();
    }
    const firstSeenAt = deal.firstSeenAt || this.firstSeenMap[deal.id];
    const publishedAt = deal.publishedAt || deal.createdAt || Date.now();

    const effectiveGiveawayUrl = deal.giveawayUrl || (deal.url && !deal.url.includes('reddit.com') ? deal.url : undefined);
    const updatedClaimMethod = determineClaimMethod(
      deal.instructions || '',
      deal.title || '',
      deal.platform || '',
      effectiveGiveawayUrl || deal.url,
      deal.id,
      deal.source
    );

    return {
      ...deal,
      claimMethod: updatedClaimMethod,
      firstSeenAt,
      publishedAt,
      is18Plus,
      isNsfw: is18Plus,
      resolvedImage: winnerImage,
      resolvedPoster: winnerPoster,
      resolvedSource: winnerSource,
    };
  }

  // ─── Thumbnail Resolution Pipeline (Items 5, 7, 8) ──────────────────────────
  private async resolveImagesForDeals(dealsList: Deal[], generation?: number): Promise<Deal[]> {
    const now = Date.now();
    let cacheUpdated = false;
    const epicElements = await this.getEpicPromotionsElements();

    const processSingleDeal = async (deal: Deal) => {
      if (generation !== undefined && this.syncGeneration !== generation) return;

      // Direct Steam app ID from URL or title search for non-Epic games
      if (!deal.steamAppId) {
        const directAppId = extractSteamAppIdFromDealUrls(deal);
        if (directAppId) {
          deal.steamAppId = directAppId;
          deal.steamUrl = `https://store.steampowered.com/app/${directAppId}/`;
        } else {
          const isEpicDeal =
            (deal.platform || '').toLowerCase().includes('epic') ||
            (deal.url || '').toLowerCase().includes('epicgames.com') ||
            (deal.storeUrl || '').toLowerCase().includes('epicgames.com');
          if (!isEpicDeal) {
            const foundId = await searchSteamAppId(deal.title);
            if (foundId && /^\d+$/.test(foundId)) {
              deal.steamAppId = foundId;
              deal.steamUrl = `https://store.steampowered.com/app/${foundId}/`;
            }
          }
        }
      }

      // Check retry map: if backoff active, keep existing resolved image
      const retryInfo = this.retryMap[deal.id];
      if (retryInfo && now < retryInfo.nextRetry) {
        if (this.resolvedImages[deal.id] && !isBadArt(this.resolvedImages[deal.id])) deal.resolvedImage = this.resolvedImages[deal.id];
        if (this.resolvedPosters[deal.id] && !isBadArt(this.resolvedPosters[deal.id])) deal.resolvedPoster = this.resolvedPosters[deal.id];
        deal.resolvedSource = this.resolvedSources[deal.id] || 'fallback';
        return;
      }

      // Skip deals that already have a verified resolved image (Item 8)
      const currentImg = deal.resolvedImage || this.resolvedImages[deal.id] || '';
      const isStaleHostLogo =
        typeof currentImg === 'string' &&
        (currentImg.includes('gaming.lenovo.com') ||
         currentImg.includes('alienwarearena.com') ||
         currentImg.includes('steelseries.com') ||
         currentImg.includes('gleam.io') ||
         currentImg.includes('redditstatic.com') ||
         currentImg.includes('thumbs.redditmedia.com') ||
         currentImg.includes('library_hero') ||
         currentImg.includes('page_bg') ||
         currentImg.includes('library_600x900') ||
         currentImg.includes('tall') ||
         currentImg.includes('gqv76.png') ||
         currentImg.includes('kcgyv.png'));

      if (isStaleHostLogo) {
        delete this.resolvedImages[deal.id];
        delete this.resolvedPosters[deal.id];
        delete this.resolvedSources[deal.id];
        deal.resolvedImage = undefined;
        deal.resolvedPoster = undefined;
      } else if (deal.resolvedImage && this.resolvedImages[deal.id] && this.resolvedSources[deal.id]) {
        deal.resolvedPoster = deal.resolvedPoster || this.resolvedPosters[deal.id];
        deal.resolvedSource = this.resolvedSources[deal.id];
        return;
      }

      // Build candidates per slot type (Item 7: uses keyImages from promotions catalog)
      const wideCandidates = buildCandidatesForDeal(deal, epicElements, 'wide');
      const posterCandidates = buildCandidatesForDeal(deal, epicElements, 'poster');

      // Probe candidates concurrently with 6000ms timeout (Follow-up A)
      const [wideRes, posterRes] = await Promise.all([
        resolveCandidateItem(wideCandidates, 300, 'wide'),
        resolveCandidateItem(posterCandidates, 200, 'poster'),
      ]);

      let wideWinner = wideRes.winner;
      let posterWinner = posterRes.winner;
      let winnerSource: 'steam' | 'epic' | 'gamerpower' | 'reddit' | 'fallback' =
        wideWinner?.source || posterWinner?.source || 'fallback';

      // Follow-up B: If every candidate failed, run background og:image scrape (max 2 at a time, 4000ms timeout)
      if (!wideWinner && !posterWinner) {
        const scraped = await scrapeOgImageFallback(deal);
        if (scraped) {
          wideWinner = { url: scraped, source: 'fallback', width: 300, height: 180 };
          posterWinner = { url: scraped, source: 'fallback', width: 300, height: 180 };
          winnerSource = 'fallback';
        }
      }

      if (wideWinner || posterWinner) {
        if (wideWinner) {
          deal.resolvedImage = wideWinner.url;
          this.resolvedImages[deal.id] = wideWinner.url;
        }
        if (posterWinner) {
          deal.resolvedPoster = posterWinner.url;
          this.resolvedPosters[deal.id] = posterWinner.url;
        }
        deal.resolvedSource = winnerSource;
        this.resolvedSources[deal.id] = winnerSource;
        delete this.retryMap[deal.id];
        cacheUpdated = true;

        if (Platform.OS !== 'web') {
          if (wideWinner?.url) ExpoImage.prefetch(wideWinner.url).catch(() => {});
          if (posterWinner?.url && posterWinner.url !== wideWinner?.url) ExpoImage.prefetch(posterWinner.url).catch(() => {});
        }
      } else {
        const hadTimeout = wideRes.hadTimeout || posterRes.hadTimeout;
        if (hadTimeout) {
          // Soft failure due to timeout: DO NOT apply 1-hour backoff!
          // Leave retryMap unblocked so next launch/sync retries
          deal.resolvedImage = undefined;
          deal.resolvedPoster = undefined;
          deal.resolvedSource = 'fallback';
          this.resolvedSources[deal.id] = 'fallback';
        } else {
          // Hard failure (404, invalid image, tiny placeholder): apply backoff
          const attempt = (retryInfo?.attempt || 0) + 1;
          const delayMs = attempt === 1 ? 3600 * 1000 : attempt === 2 ? 6 * 3600 * 1000 : 24 * 3600 * 1000;
          this.retryMap[deal.id] = { nextRetry: now + delayMs, attempt };
          deal.resolvedImage = undefined;
          deal.resolvedPoster = undefined;
          deal.resolvedSource = 'fallback';
          this.resolvedSources[deal.id] = 'fallback';
        }
      }
    };

    // Process deals in pools of 4 (Item 8)
    const POOL_SIZE = 4;
    for (let i = 0; i < dealsList.length; i += POOL_SIZE) {
      if (generation !== undefined && this.syncGeneration !== generation) {
        return dealsList;
      }
      const pool = dealsList.slice(i, i + POOL_SIZE);
      await Promise.all(pool.map((deal) => processSingleDeal(deal)));
    }

    if (cacheUpdated) {
      AsyncStorage.setItem(STORAGE_KEYS.RESOLVED_IMAGES, JSON.stringify(this.resolvedImages)).catch(() => {});
      AsyncStorage.setItem(STORAGE_KEYS.RESOLVED_POSTERS, JSON.stringify(this.resolvedPosters)).catch(() => {});
      AsyncStorage.setItem(STORAGE_KEYS.RESOLVED_SOURCES, JSON.stringify(this.resolvedSources)).catch(() => {});
      AsyncStorage.setItem(STORAGE_KEYS.IMAGE_RETRY_MAP, JSON.stringify(this.retryMap)).catch(() => {});
    }

    return dealsList;
  }

  // ─── Sync Pipeline (Item 1) ────────────────────────────────────────────────
  public async sync(forceRefresh = false) {
    if (this.syncState === 'syncing') return;
    this.syncState = 'syncing';
    this.notify();

    const currentGeneration = ++this.syncGeneration;

    try {
      // 1. Fetch GamerPower and Reddit merged
      const result = await fetchMergedGameFeed('new', 40, undefined, forceRefresh);
      let rawDeals = (result.deals || []).filter((d) => !isPostRemovedByModerator(d) && !expiredFeedService.isExpired(d));

      // If a newer sync was triggered while network fetch was pending, abort
      if (this.syncGeneration !== currentGeneration) return;

      // Identify older Reddit deals in this.deals that are missing from the fresh fetch
      const freshDealIds = new Set(rawDeals.map((d) => d.id));
      const missingRedditDeals = this.deals.filter(
        (d) => (d.source === 'reddit' || Boolean(d.redditUrl) || d.isFromNotification) && !freshDealIds.has(d.id)
      );

      // Re-check missing Reddit posts individually by ID against Reddit / Arctic Shift
      let survivingMissingDeals: Deal[] = [];
      if (missingRedditDeals.length > 0) {
        const missingIds = missingRedditDeals.map((d) => d.id);
        const statusMap = await checkRedditPostsStatus(missingIds);

        survivingMissingDeals = missingRedditDeals.filter((d) => {
          const status = statusMap.get(d.id);
          // If explicitly marked removed or deleted, or flagged by moderator, purge!
          if (status === 'removed' || isPostRemovedByModerator(d) || expiredFeedService.isExpired(d)) {
            console.log(`[DealsStore] Purging removed/deleted Reddit post: ${d.id} (${d.title})`);
            return false;
          }
          // Still active on Reddit, retain it
          return true;
        });
      }

      // Combine fresh deals + surviving older deals that dropped off page 1
      const allDeals = [...rawDeals, ...survivingMissingDeals];

      // 2. Normalize, dedupe, classify (type, claimMethod, 18+ flag)
      let classified = allDeals.map((d) => this.applyClassifications(d));

      // 3. Build map of existing deals to preserve enriched ratings & metadata across reloads
      const existingDealMap = new Map<string, Deal>();
      for (const d of this.deals) {
        if (d && d.id && !isPostRemovedByModerator(d)) existingDealMap.set(d.id, d);
      }
      for (const cd of this.claimedDeals) {
        if (cd && cd.id && !existingDealMap.has(cd.id)) existingDealMap.set(cd.id, cd);
      }

      // Merge enriched metadata from existing deals into classified deals before resolution
      const preservedDeals = classified
        .map((d) => {
          const prev = existingDealMap.get(d.id) || dealEnrichmentService.getEnrichedDeal(d.id);
          if (!prev) return d;
          // Ensure a removed post never survives by being merged with another copy
          if (isPostRemovedByModerator(prev) || isPostRemovedByModerator(d)) {
            return null;
          }
          return {
            ...prev,
            ...d, // fresh feed parameters (timeLeft, claims, etc.)
            steamRatingPercent: d.steamRatingPercent ?? prev.steamRatingPercent,
            steamReviewCount: d.steamReviewCount ?? prev.steamReviewCount,
            steamDbRating: d.steamDbRating ?? prev.steamDbRating,
            reviewScore: d.reviewScore ?? prev.reviewScore,
            developer: d.developer ?? prev.developer,
            publisher: d.publisher ?? prev.publisher,
            releaseDate: (d.releaseDate && d.releaseDate !== 'N/A') ? d.releaseDate : prev.releaseDate,
            genres: (d.genres && d.genres.length > 0) ? d.genres : prev.genres,
            achievements: d.achievements ?? prev.achievements,
            tradingCards: d.tradingCards ?? prev.tradingCards,
            aboutGame: d.aboutGame || prev.aboutGame,
            fullDescription: d.fullDescription || prev.fullDescription,
            instructions: d.instructions || prev.instructions,
            screenshots: (d.screenshots && d.screenshots.length > 0) ? d.screenshots : prev.screenshots,
            bannerImage: d.bannerImage || prev.bannerImage,
            steamAppId: d.steamAppId || prev.steamAppId,
            steamUrl: d.steamUrl || prev.steamUrl,
            resolvedPoster: d.resolvedPoster || prev.resolvedPoster,
            resolvedImage: d.resolvedImage || prev.resolvedImage,
            resolvedSource: d.resolvedSource || prev.resolvedSource,
            currentPrice: d.currentPrice || prev.currentPrice,
            originalPrice: d.originalPrice || prev.originalPrice,
            worth: d.worth || prev.worth,
            claimedUsers: d.claimedUsers ?? prev.claimedUsers,
            playtimeHours: d.playtimeHours ?? prev.playtimeHours,
            metacriticScore: d.metacriticScore ?? prev.metacriticScore,
            trailerUrl: d.trailerUrl || prev.trailerUrl,
            trailerThumbnail: d.trailerThumbnail || prev.trailerThumbnail,
          };
        })
        .filter(Boolean) as Deal[];

      // Filter out deals that have expired or been removed by moderators, with robust multi-key deduplication
      this.deals = deduplicateDealsList(preservedDeals);
      this.hasSyncedOnce = true;
      this.lastSyncTimestamp = Date.now();
      this.isOfflineState = false;

      // Pin current hero deal to keep hero ordering rock-solid stable during background work
      this.currentHeroId = this.computeHero()?.id || null;

      // Publish fresh deals and mark sync as synced_just_now right away!
      this.syncState = 'synced_just_now';
      this.notify();
      setTimeout(() => {
        if (this.syncState === 'synced_just_now') {
          this.syncState = 'idle';
          this.notify();
        }
      }, 2200);

      // Save initial merged feed cache immediately after publish
      AsyncStorage.setItem(STORAGE_KEYS.FEED_CACHE, JSON.stringify(this.deals)).catch(() => {});

      // Launch background image resolution and deal enrichment (generation-guarded)
      this.runBackgroundSyncWork(currentGeneration, [...this.deals]);
    } catch (e) {
      console.warn('[DealsStore] Sync error:', e);
      this.syncState = 'idle';
      this.isOfflineState = true;
      this.notify();
    }
  }

  private async runBackgroundSyncWork(generation: number, dealsToProcess: Deal[]): Promise<void> {
    // If background work is already running, wait for it to cleanly abort due to generation change
    while (this.isBackgroundWorkRunning) {
      if (this.syncGeneration !== generation) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    if (this.syncGeneration !== generation) return;

    this.isBackgroundWorkRunning = true;
    try {
      // 1. Resolve images for deals in background
      const resolvedDeals = await this.resolveImagesForDeals(dealsToProcess, generation);
      if (this.syncGeneration !== generation) return;

      // Update deals in store with newly resolved images through the same notify path
      const resolvedMap = new Map(resolvedDeals.map((d) => [d.id, d]));
      let hasImageChanges = false;
      this.deals = this.deals.map((deal) => {
        const resolved = resolvedMap.get(deal.id);
        if (!resolved) return deal;
        if (
          deal.resolvedImage !== resolved.resolvedImage ||
          deal.resolvedPoster !== resolved.resolvedPoster ||
          deal.resolvedSource !== resolved.resolvedSource
        ) {
          hasImageChanges = true;
          return {
            ...deal,
            resolvedImage: resolved.resolvedImage,
            resolvedPoster: resolved.resolvedPoster,
            resolvedSource: resolved.resolvedSource,
            bannerImage: resolved.bannerImage || deal.bannerImage,
            steamAppId: resolved.steamAppId || deal.steamAppId,
            steamUrl: resolved.steamUrl || deal.steamUrl,
          };
        }
        return deal;
      });

      if (hasImageChanges) {
        this.notify();
      }

      if (this.syncGeneration !== generation) return;

      // 2. Deal enrichment in background (Steam appreviews/appdetails, Epic).
      // Enriched deals merge into this.deals via the subscribeBatch listener
      dealEnrichmentService.enrichDeals(this.deals, undefined, () => {
        if (this.syncGeneration === generation) {
          this.currentHeroId = this.computeHero()?.id || null;
          this.notify();
        }
      });

      // 3. One expired-flair lookup per sync: reuse cached result to remove newly expired or removed deals
      const hasExpired = this.deals.some((d) => isDealExpired(d) || isPostRemovedByModerator(d) || expiredFeedService.isExpired(d));
      if (hasExpired) {
        this.deals = this.deals.filter((d) => !isDealExpired(d) && !isPostRemovedByModerator(d) && !expiredFeedService.isExpired(d));
        this.notify();
      }

      if (this.syncGeneration !== generation) return;

      // 4. Vault images & cleanup
      this.resolveVaultImages();
      this.cleanupEndedDealImages();
    } finally {
      this.isBackgroundWorkRunning = false;
    }
  }

  // ─── Vault Images Backfill & Resolution ────────────────────────────────────
  private vaultCheckedIds = new Set<string>();

  public async resolveVaultImages() {
    let modified = false;
    const epicElements = await this.getEpicPromotionsElements();

    for (const d of this.claimedDeals) {
      if (this.vaultCheckedIds.has(d.id)) continue;
      this.vaultCheckedIds.add(d.id);

      if (d.resolvedImage && this.resolvedImages[d.id] && this.resolvedSources[d.id]) {
        d.resolvedPoster = d.resolvedPoster || this.resolvedPosters[d.id];
        d.resolvedSource = this.resolvedSources[d.id];
        continue;
      }

      if (this.resolvedImages[d.id]) {
        d.resolvedImage = this.resolvedImages[d.id];
        d.resolvedPoster = this.resolvedPosters[d.id];
        d.resolvedSource = this.resolvedSources[d.id] || 'fallback';
        continue;
      }

      // Check if this deal exists in active deals with an already resolved image
      const activeMatch = this.deals.find((ad) => ad.id === d.id);
      if (activeMatch?.resolvedImage) {
        d.resolvedImage = activeMatch.resolvedImage;
        this.resolvedImages[d.id] = activeMatch.resolvedImage;
        if (activeMatch.resolvedPoster) {
          d.resolvedPoster = activeMatch.resolvedPoster;
          this.resolvedPosters[d.id] = activeMatch.resolvedPoster;
        }
        if (activeMatch.resolvedSource) {
          d.resolvedSource = activeMatch.resolvedSource;
          this.resolvedSources[d.id] = activeMatch.resolvedSource;
        }
        modified = true;
        continue;
      }

      const wideCandidates = buildCandidatesForDeal(d, epicElements, 'wide');
      const wideRes = await resolveCandidateItem(wideCandidates, 300, 'wide');
      const wideWinner = wideRes.winner;

      const posterCandidates = buildCandidatesForDeal(d, epicElements, 'poster');
      const posterRes = await resolveCandidateItem(posterCandidates, 200, 'poster');
      const posterWinner = posterRes.winner;

      const winnerSource: 'steam' | 'epic' | 'gamerpower' | 'reddit' | 'fallback' =
        wideWinner?.source || posterWinner?.source || 'fallback';

      if (wideWinner || posterWinner) {
        if (wideWinner) {
          d.resolvedImage = wideWinner.url;
          this.resolvedImages[d.id] = wideWinner.url;
        }
        if (posterWinner) {
          d.resolvedPoster = posterWinner.url;
          this.resolvedPosters[d.id] = posterWinner.url;
        }
        d.resolvedSource = winnerSource;
        this.resolvedSources[d.id] = winnerSource;
        modified = true;

        if (Platform.OS !== 'web') {
          if (wideWinner?.url) ExpoImage.prefetch(wideWinner.url).catch(() => {});
          if (posterWinner?.url && posterWinner.url !== wideWinner?.url) ExpoImage.prefetch(posterWinner.url).catch(() => {});
        }
      }
    }

    if (modified) {
      await AsyncStorage.setItem(STORAGE_KEYS.RESOLVED_IMAGES, JSON.stringify(this.resolvedImages)).catch(() => {});
      await AsyncStorage.setItem(STORAGE_KEYS.RESOLVED_POSTERS, JSON.stringify(this.resolvedPosters)).catch(() => {});
      await AsyncStorage.setItem(STORAGE_KEYS.RESOLVED_SOURCES, JSON.stringify(this.resolvedSources)).catch(() => {});
      this.notify();
    }
  }

  // ─── Background Quality Upgrade for Existing Deals & Vault Items ───────────
  public async reResolveExistingDealsAndVaultOnce() {
    if (this.upgradeRunning || this.hasUpgradedOnce) return;
    try {
      this.upgradeRunning = true;
      const epicElements = await this.getEpicPromotionsElements();

      const allItems: Deal[] = [...this.deals];
      for (const cd of this.claimedDeals) {
        if (!allItems.some((d) => d.id === cd.id)) {
          allItems.push(cd);
        }
      }

      let modified = false;
      const BATCH_SIZE = 3;

      for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
        const batch = allItems.slice(i, i + BATCH_SIZE);
        for (const deal of batch) {
          const wideCandidates = buildCandidatesForDeal(deal, epicElements, 'wide');
          const wideRes = await resolveCandidateItem(wideCandidates, 300, 'wide');
          const wideWinner = wideRes.winner;

          const posterCandidates = buildCandidatesForDeal(deal, epicElements, 'poster');
          const posterRes = await resolveCandidateItem(posterCandidates, 200, 'poster');
          const posterWinner = posterRes.winner;

          if (wideWinner) {
            deal.resolvedImage = wideWinner.url;
            this.resolvedImages[deal.id] = wideWinner.url;
            modified = true;
          }
          if (posterWinner) {
            deal.resolvedPoster = posterWinner.url;
            this.resolvedPosters[deal.id] = posterWinner.url;
            modified = true;
          }
          const src = wideWinner?.source || posterWinner?.source || 'fallback';
          deal.resolvedSource = src;
          this.resolvedSources[deal.id] = src;
        }
        await new Promise((r) => setTimeout(r, 120));
      }

      if (modified) {
        await AsyncStorage.setItem(STORAGE_KEYS.RESOLVED_IMAGES, JSON.stringify(this.resolvedImages)).catch(() => {});
        await AsyncStorage.setItem(STORAGE_KEYS.RESOLVED_POSTERS, JSON.stringify(this.resolvedPosters)).catch(() => {});
        await AsyncStorage.setItem(STORAGE_KEYS.RESOLVED_SOURCES, JSON.stringify(this.resolvedSources)).catch(() => {});
      }
      this.hasUpgradedOnce = true;

      this.upgradeRunning = false;
      this.notify();
    } catch (e) {
      console.warn('[DealsStore] Background thumbnail upgrade error:', e);
      this.upgradeRunning = false;
    }
  }

  // ─── Image Source Statistics Selector ──────────────────────────────────────
  public getImageSourceStats() {
    const counts = {
      steam: 0,
      epic: 0,
      gamerpower: 0,
      reddit: 0,
      fallback: 0,
    };

    const feedItems = this.getActiveDeals();
    const details: Array<{ id: string; title: string; source: string; url?: string }> = [];

    for (const deal of feedItems) {
      const src = deal.resolvedSource || this.resolvedSources[deal.id] || (deal.resolvedImage ? 'gamerpower' : 'fallback');
      if (src in counts) {
        counts[src as keyof typeof counts]++;
      } else {
        counts.fallback++;
      }
      details.push({
        id: deal.id,
        title: deal.title,
        source: src,
        url: deal.resolvedImage || deal.image,
      });
    }

    return { counts, total: feedItems.length, details };
  }

  // ─── Image Cache Cleanup (Item 5) ──────────────────────────────────────────
  private cleanupEndedDealImages() {
    const now = Date.now();
    const SEVEN_DAYS_MS = 7 * 86400 * 1000;
    let modified = false;

    for (const deal of this.deals) {
      if (deal.isExpired || deal.expiryStatus === 'EXPIRED') {
        // Never delete images for Vault items
        if (this.claimedMap[deal.id] || this.claimedDeals.some((c) => c.id === deal.id)) continue;

        const endMs = parseDateToMs(deal.endDate || deal.expiresAt);
        if (endMs && now - endMs > SEVEN_DAYS_MS) {
          if (this.resolvedImages[deal.id]) {
            delete this.resolvedImages[deal.id];
            modified = true;
          }
        }
      }
    }

    if (modified) {
      AsyncStorage.setItem(STORAGE_KEYS.RESOLVED_IMAGES, JSON.stringify(this.resolvedImages)).catch(() => {});
    }
  }

  // ─── Claim Actions (Item 1 & 5) ────────────────────────────────────────────
  public async claimDeal(deal: Deal) {
    if (this.claimedMap[deal.id]) return;

    // Ensure winner image is resolved
    let imageToSave = deal.resolvedImage || this.resolvedImages[deal.id];
    if (!imageToSave) {
      const candidates = [deal.image, (deal as any).coverImage].filter(Boolean) as string[];
      for (const c of candidates) {
        const norm = normalizeCandidateUrl(c);
        if (norm) {
          imageToSave = norm;
          break;
        }
      }
      if (!imageToSave) {
        const urls = [deal.storeUrl, deal.steamUrl, deal.giveawayUrl, deal.url].filter(Boolean).join(' ');
        const steamId = extractSteamAppId(urls);
        if (steamId && /^\d+$/.test(steamId)) {
          imageToSave = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${steamId}/header.jpg`;
        }
      }
    }

    const isPortrait = (u?: string | null) =>
      typeof u === 'string' && (u.includes('library_600x900') || u.includes('tall') || u.includes('600x900') || u.includes('gqv76.png') || u.includes('kcgyv.png'));

    const posterToSave = deal.resolvedPoster || this.resolvedPosters[deal.id];
    const finalWide = imageToSave && !isPortrait(imageToSave) ? imageToSave : undefined;
    const finalPoster = posterToSave || (imageToSave ? imageToSave : undefined);

    const claimRecord = {
      id: deal.id,
      title: deal.title,
      cleanTitle: cleanDisplayTitle(deal.title),
      url: deal.giveawayUrl || deal.url,
      giveawayUrl: deal.giveawayUrl || deal.url,
      storeUrl: deal.storeUrl || deal.steamUrl,
      platform: deal.platform,
      worth: deal.worth || deal.originalPrice || undefined,
      image: finalWide || finalPoster,
      resolvedImage: finalWide,
      resolvedPoster: finalPoster,
      type: deal.type,
      claimedAt: Date.now(),
      is18Plus: deal.is18Plus,
      steamRatingPercent: deal.steamRatingPercent,
      steamReviewCount: deal.steamReviewCount,
      developer: deal.developer,
      publisher: deal.publisher,
      releaseDate: deal.releaseDate,
    };

    await addClaimedPost(claimRecord);

    this.claimedMap[deal.id] = true;
    const cleanT = cleanDisplayTitle(deal.title).toLowerCase().trim();
    this.claimedDeals = [
      this.applyClassifications(claimRecord as any),
      ...this.claimedDeals.filter(
        (d) => d.id !== deal.id && cleanDisplayTitle(d.title).toLowerCase().trim() !== cleanT
      ),
    ];

    if (imageToSave) {
      this.resolvedImages[deal.id] = imageToSave;
      AsyncStorage.setItem(STORAGE_KEYS.RESOLVED_IMAGES, JSON.stringify(this.resolvedImages)).catch(() => {});
    }
    if (posterToSave) {
      this.resolvedPosters[deal.id] = posterToSave;
      AsyncStorage.setItem(STORAGE_KEYS.RESOLVED_POSTERS, JSON.stringify(this.resolvedPosters)).catch(() => {});
    }

    if (this.currentHeroId === deal.id) {
      this.currentHeroId = null;
    }

    this.notify();
  }

  public async unclaimDeal(dealId: string, title?: string) {
    await removeClaimedPost(dealId, title);
    delete this.claimedMap[dealId];
    this.claimedDeals = this.claimedDeals.filter(
      (d) => d.id !== dealId && (title ? cleanDisplayTitle(d.title) !== cleanDisplayTitle(title) : true)
    );
    this.currentHeroId = null;
    this.notify();
  }

  public isClaimed(dealId: string): boolean {
    return !!this.claimedMap[dealId];
  }

  // ─── Steam Screenshots Central Service (Item 8) ───────────────────────────
  public async getSteamScreenshots(
    appId: string
  ): Promise<Array<{ id: number; path_thumbnail: string; path_full: string }>> {
    if (!appId || !/^\d+$/.test(appId)) return [];

    const cacheKey = `${STORAGE_KEYS.STEAM_SCREENSHOTS_PREFIX}${appId}`;
    const SEVEN_DAYS_MS = 7 * 86400 * 1000;

    try {
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed.timestamp === 'number' && Date.now() - parsed.timestamp < SEVEN_DAYS_MS) {
          return parsed.screenshots || [];
        }
      }
    } catch {}

    try {
      const url = `https://store.steampowered.com/api/appdetails?appids=${appId}`;
      let resp: Response;
      if (Platform.OS === 'web') {
        resp = await fetchWithProxy(url, 6000);
      } else {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        resp = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });
        clearTimeout(timer);
      }

      if (!resp.ok) {
        return [];
      }

      const json = await resp.json();
      const appData = json[appId]?.data;

      // Extract and cache Steam game description simultaneously with screenshots
      if (appData) {
        const descText = cleanGameDescription(appData.short_description || appData.about_the_game);
        if (descText) {
          this.steamDescriptionsCache.set(appId, descText);
          AsyncStorage.setItem(`@claimr_steam_desc_${appId}`, descText).catch(() => {});
        }
      }

      const rawScreenshots: any[] = appData?.screenshots || [];

      const normalizedScreenshots = rawScreenshots.map((s) => ({
        id: s.id,
        path_thumbnail: normalizeCandidateUrl(s.path_thumbnail) || s.path_thumbnail,
        path_full: normalizeCandidateUrl(s.path_full) || s.path_full,
      }));

      // Cache the result (including empty list) for 7 days
      await AsyncStorage.setItem(
        cacheKey,
        JSON.stringify({
          timestamp: Date.now(),
          screenshots: normalizedScreenshots,
        })
      );

      return normalizedScreenshots;
    } catch {
      return [];
    }
  }

  // ─── Epic Games Screenshots Central Service ──────────────────────────────
  public async getEpicScreenshots(
    title: string,
    url?: string
  ): Promise<Array<{ id: number; path_thumbnail: string; path_full: string }>> {
    // 1. If an Epic store URL with a slug is present, fetch screenshots from Epic's official product content API
    const epicSlug = extractEpicSlug(url);
    if (epicSlug) {
      try {
        const content = await fetchEpicProductContent(epicSlug);
        if (content && Array.isArray(content.screenshots) && content.screenshots.length > 0) {
          return content.screenshots;
        }
      } catch (err) {
        console.warn(`[dealsStore] Epic content API screenshots fetch failed for ${epicSlug}:`, err);
      }
    }

    const cleanTarget = cleanDisplayTitle(title).trim().toLowerCase();
    if (!cleanTarget) return [];

    const cacheKey = `claimr_epic_screenshots_${cleanTarget.replace(/[^a-z0-9]/g, '')}`;
    const legacyCacheKey = `lootquest_epic_screenshots_${cleanTarget.replace(/[^a-z0-9]/g, '')}`;
    const SEVEN_DAYS_MS = 7 * 86400 * 1000;

    try {
      let cached = await AsyncStorage.getItem(cacheKey);
      if (!cached) {
        cached = await AsyncStorage.getItem(legacyCacheKey);
      }
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed.timestamp === 'number' && Date.now() - parsed.timestamp < SEVEN_DAYS_MS) {
          return parsed.screenshots || [];
        }
      }
    } catch {}

    try {
      const promoUrl = 'https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions';
      let resp: Response;
      if (Platform.OS === 'web') {
        resp = await fetchWithProxy(promoUrl, 6000);
      } else {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        resp = await fetch(promoUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });
        clearTimeout(timer);
      }

      if (!resp.ok) {
        return [];
      }

      const json = await resp.json();
      const elements: any[] = json.data?.Catalog?.searchStore?.elements || [];

      // EXACT TITLE MATCH inside Epic's promotional catalogue
      const match = elements.find((el: any) => {
        if (!el.title) return false;
        const elClean = cleanDisplayTitle(el.title).trim().toLowerCase();
        return elClean === cleanTarget;
      });

      if (!match || !Array.isArray(match.keyImages)) {
        return [];
      }

      const screenshotTypes = ['featuredMedia', 'GalleryImage', 'Screenshot', 'DieselStoreFrontWide'];
      const rawImages = match.keyImages.filter((k: any) => k.url && screenshotTypes.includes(k.type));

      const screenshots = rawImages.map((k: any, idx: number) => ({
        id: idx + 1,
        path_thumbnail: normalizeCandidateUrl(k.url) || k.url,
        path_full: normalizeCandidateUrl(k.url) || k.url,
      }));

      // Cache result for 7 days
      await AsyncStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), screenshots })).catch(() => {});
      return screenshots;
    } catch {
      return [];
    }
  }

  // Unified Screenshots Selector for Any Deal (Steam or Epic)
  public async getScreenshotsForDeal(
    deal: Deal
  ): Promise<Array<{ id: number; path_thumbnail: string; path_full: string }>> {
    // Never fetch screenshots for 18+ gated deals before user reveals them
    if (deal.is18Plus && !this.is18PlusRevealed(deal.id)) {
      return [];
    }

    // 1. Check Steam App ID directly from deal URLs or deal.steamAppId
    const urls = [deal.storeUrl, deal.steamUrl, deal.giveawayUrl, deal.url].filter(Boolean).join(' ');
    const steamAppId = extractSteamAppId(urls) || deal.steamAppId;

    if (steamAppId && /^\d+$/.test(steamAppId)) {
      const steamScreenshots = await this.getSteamScreenshots(steamAppId);
      if (steamScreenshots && steamScreenshots.length > 0) {
        return steamScreenshots;
      }
    }

    // 2. Epic Games Store screenshots: check Epic product content API by slug or promotional feed by title
    const isEpic =
      (deal.platform || '').toLowerCase().includes('epic') ||
      (deal.url || '').toLowerCase().includes('epicgames.com') ||
      (deal.storeUrl || '').toLowerCase().includes('epicgames.com');

    if (isEpic) {
      const epicScreenshots = await this.getEpicScreenshots(deal.title, deal.url || deal.storeUrl || deal.giveawayUrl);
      if (epicScreenshots && epicScreenshots.length > 0) {
        return epicScreenshots;
      }
    }

    // 3. Steam title search: for third-party giveaways (key sites, Legion Gaming)
    //    and multi-platform games (e.g. Voidtrain on Epic whose screenshots exist on Steam)
    const foundAppId = await searchSteamAppId(deal.title);
    if (foundAppId && /^\d+$/.test(foundAppId)) {
      this.updateDeal(deal.id, {
        steamAppId: foundAppId,
        steamUrl: `https://store.steampowered.com/app/${foundAppId}/`,
      });
      const steamScreenshots = await this.getSteamScreenshots(foundAppId);
      if (steamScreenshots && steamScreenshots.length > 0) {
        return steamScreenshots;
      }
    }

    return [];
  }

  public getCachedSteamDescription(appId: string): string | undefined {
    return this.steamDescriptionsCache.get(appId);
  }

  public async fetchSteamDescription(appId: string): Promise<string | null> {
    if (this.steamDescriptionsCache.has(appId)) {
      return this.steamDescriptionsCache.get(appId) || null;
    }
    try {
      let stored = await AsyncStorage.getItem(`@claimr_steam_desc_${appId}`);
      if (!stored) {
        stored = await AsyncStorage.getItem(`@lootquest_steam_desc_${appId}`);
      }
      if (stored) {
        this.steamDescriptionsCache.set(appId, stored);
        return stored;
      }
    } catch {}
    return null;
  }

  // Unified Trailer Selector for Any Deal
  public async getTrailerForDeal(
    deal: Deal
  ): Promise<{ url: string; thumbnail?: string } | null> {
    if (deal.trailerUrl) {
      return { url: deal.trailerUrl, thumbnail: deal.trailerThumbnail };
    }
    const urls = [deal.storeUrl, deal.steamUrl, deal.giveawayUrl, deal.url].filter(Boolean).join(' ');
    let steamAppId = extractSteamAppId(urls) || deal.steamAppId;
    if (!steamAppId && deal.title) {
      steamAppId = (await searchSteamAppId(deal.title)) || undefined;
    }
    if (steamAppId && /^\d+$/.test(steamAppId)) {
      const cacheKey = `@claimr_trailer_${steamAppId}`;
      const legacyCacheKey = `@lootquest_trailer_${steamAppId}`;
      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
      try {
        let cached = await AsyncStorage.getItem(cacheKey);
        if (!cached) {
          cached = await AsyncStorage.getItem(legacyCacheKey);
        }
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.timestamp && Date.now() - parsed.timestamp < SEVEN_DAYS_MS && parsed.trailer) {
            this.updateDeal(deal.id, {
              trailerUrl: parsed.trailer.url,
              trailerThumbnail: parsed.trailer.thumbnail,
            });
            return parsed.trailer;
          }
        }
      } catch {}

      try {
        const trailerApiUrl = `https://store.steampowered.com/api/appdetails?appids=${steamAppId}`;
        const res = Platform.OS === 'web'
          ? await fetchWithProxy(trailerApiUrl, 6000)
          : await fetch(trailerApiUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (res.ok) {
          const json = await res.json();
          const movies = json[steamAppId]?.data?.movies;
          if (Array.isArray(movies) && movies.length > 0) {
            const m = movies[0];
            const trailerUrl = m.mp4?.['480'] || m.mp4?.max || m.hls_h264 || undefined;
            if (trailerUrl) {
              const result = { url: trailerUrl, thumbnail: m.thumbnail || undefined };
              this.updateDeal(deal.id, {
                trailerUrl: result.url,
                trailerThumbnail: result.thumbnail,
              });
              await AsyncStorage.setItem(
                cacheKey,
                JSON.stringify({ timestamp: Date.now(), trailer: result })
              ).catch(() => {});
              return result;
            }
          }
        }
      } catch {}
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SELECTORS (Only ways to read data, no screen calculations)
  // ─────────────────────────────────────────────────────────────────────────

  // Selector: Prime Gaming Consolidated Notice
  public getPrimeNotice(): PrimeNoticeData | null {
    const activePrimePosts = this.deals.filter(
      (d) => isPrimeDeal(d) && !isDealExpired(d) && !isPostRemovedByModerator(d) && !expiredFeedService.isExpired(d)
    );
    if (activePrimePosts.length === 0) {
      return null;
    }

    const postIds = activePrimePosts.map((d) => d.id);
    const gameNames = parsePrimeGameTitles(activePrimePosts);
    const displayNamesText =
      formatPrimeGameDisplayNames(gameNames) ||
      activePrimePosts.map((p) => cleanPrimePostTitle(p.title)).join(', ');

    // Expiry: real end date from a post if one exists, otherwise none. Never invented.
    let earliestEndMs: number | null = null;
    let earliestEndStr: string | null = null;
    const now = Date.now();

    for (const p of activePrimePosts) {
      const rawEnd = p.endDate || p.expiresAt;
      if (rawEnd) {
        const upper = String(rawEnd).toUpperCase().trim();
        if (
          upper !== 'N/A' &&
          !upper.includes('PERMANENT') &&
          !upper.includes('NO EXP') &&
          !upper.includes('UNKNOWN') &&
          upper !== 'LIVE'
        ) {
          const endMs = parseDateToMs(rawEnd);
          if (!isNaN(endMs) && endMs > now) {
            if (earliestEndMs === null || endMs < earliestEndMs) {
              earliestEndMs = endMs;
              earliestEndStr = rawEnd;
            }
          }
        }
      }
    }

    const timeLeft = earliestEndStr ? getTimeLeft(earliestEndStr) : undefined;

    const newestPrimePost = activePrimePosts.reduce((latest, p) =>
      (p.createdAt || 0) > (latest.createdAt || 0) ? p : latest,
      activePrimePosts[0]
    );

    const noticeDeal: Deal = {
      id: 'prime-gaming-notice',
      title: 'Prime Gaming',
      platform: 'Prime Gaming',
      type: 'full_game',
      claimMethod: 'one_click',
      url: PRIME_GAMING_CONFIG.PRIMARY_URL,
      giveawayUrl: PRIME_GAMING_CONFIG.PRIMARY_URL,
      storeUrl: PRIME_GAMING_CONFIG.PRIMARY_URL,
      isBundleNotice: true,
      bundleGamesText: displayNamesText,
      createdAt: newestPrimePost?.createdAt,
      publishedAt: newestPrimePost?.publishedAt || newestPrimePost?.createdAt,
      firstSeenAt: newestPrimePost?.firstSeenAt,
      redditUrl: newestPrimePost?.redditUrl || (newestPrimePost?.source === 'reddit' ? newestPrimePost?.url : undefined),
      endDate: earliestEndStr || null,
      expiresAt: earliestEndStr || undefined,
      timeLeft: timeLeft || undefined,
    };

    return {
      deal: noticeDeal,
      postIds,
      gameNames,
      displayNamesText,
      endDate: earliestEndStr,
      timeLeft,
    };
  }

  public getPrimeNoticeDeal(): Deal {
    const notice = this.getPrimeNotice();
    if (notice) return notice.deal;
    return {
      id: 'prime-gaming-notice',
      title: 'Prime Gaming',
      platform: 'Prime Gaming',
      type: 'full_game',
      claimMethod: 'one_click',
      url: PRIME_GAMING_CONFIG.PRIMARY_URL,
      giveawayUrl: PRIME_GAMING_CONFIG.PRIMARY_URL,
      storeUrl: PRIME_GAMING_CONFIG.PRIMARY_URL,
      isBundleNotice: true,
      bundleGamesText: '',
      endDate: null,
    };
  }

  // Selector: Get Deal By ID
  public getDealById(id: string): Deal | null {
    if (!id) return null;
    if (id === 'prime-gaming-notice') {
      return this.getPrimeNoticeDeal();
    }
    const primeNotice = this.getPrimeNotice();
    if (primeNotice && primeNotice.postIds.includes(id)) {
      return primeNotice.deal;
    }
    const found = this.deals.find((d) => d.id === id);
    if (found) {
      if (isPrimeDeal(found)) {
        return this.getPrimeNoticeDeal();
      }
      return found;
    }
    const claimed = this.claimedDeals.find((d) => d.id === id);
    if (claimed) return claimed;
    return null;
  }

  // Upsert a deal (e.g. from a push notification or deep link) so it immediately exists in the store
  public upsertDeal(deal: Deal) {
    if (!deal || !deal.id) return;
    const idx = this.deals.findIndex((d) => d.id === deal.id);
    if (idx >= 0) {
      this.deals[idx] = { ...this.deals[idx], ...deal };
    } else {
      this.deals.unshift(deal);
    }
    this.notify();
  }

  // Selector: Active Deals (non-expired, non-moderator-removed, includes both claimed and unclaimed, consolidated Prime Gaming deal at its real post position)
  public getActiveDeals(): Deal[] {
    const rawList: Deal[] = [];
    let purgedAny = false;
    for (const d of this.deals) {
      if (!isDealExpired(d) && !isPostRemovedByModerator(d) && !expiredFeedService.isExpired(d)) {
        rawList.push(d);
      } else {
        purgedAny = true;
      }
    }

    const deduped = deduplicateDealsList(rawList);
    const map = new Map<string, Deal>();
    for (const d of deduped) {
      if (!isPrimeDeal(d)) {
        map.set(d.id, d);
      }
    }

    const primeNotice = this.getPrimeNotice();
    if (primeNotice && primeNotice.deal) {
      map.set(primeNotice.deal.id, primeNotice.deal);
    }

    if (purgedAny) {
      this.deals = this.deals.filter(
        (d) => !isDealExpired(d) && !isPostRemovedByModerator(d) && !expiredFeedService.isExpired(d)
      );
      AsyncStorage.setItem(STORAGE_KEYS.FEED_CACHE, JSON.stringify(this.deals)).catch(() => {});
    }
    return Array.from(map.values());
  }

  // Selector: Unclaimed Deals
  public getUnclaimedDeals(): Deal[] {
    return this.getActiveDeals().filter((d) => !this.claimedMap[d.id]);
  }

  // Selector: Home Hero
  // Candidates: active, UNCLAIMED deals that have an expiry date. Deals with no expiry are never the hero while any deal with an expiry exists.
  // Among candidates, prefer ones worth showing: real retail price of $10 or more (isEstimated prices don't count) OR a real Steam rating of 80%+ with at least 25 reviews.
  // Pick the one with the least time left; ties alphabetical (localeCompare, case-insensitive).
  // If none pass the check, use the least-time candidate.
  // If there are no candidates with an expiry, show "All caught up" (returns null). Do NOT fall back to a no-expiry deal.
  // No rotation, deterministic and stable.
  public computeHero(): Deal | null {
    const unclaimed = this.getUnclaimedDeals();
    if (unclaimed.length === 0) return null;

    // Filter out hidden 18+ deals AND non-game deals (no DLCs, betas, items, loot) AND bundle notices
    const visibleUnclaimed = unclaimed.filter(
      (d) => (!d.is18Plus || this.is18PlusRevealed(d.id)) && isGameOnlyDeal(d) && !d.isBundleNotice
    );
    if (visibleUnclaimed.length === 0) return null;

    const now = Date.now();

    const getValidExpiryMs = (d: Deal): number | null => {
      const rawEnd = d.endDate || d.expiresAt;
      if (!rawEnd) return null;
      const upper = String(rawEnd).toUpperCase().trim();
      if (
        upper === 'N/A' ||
        upper.includes('PERMANENT') ||
        upper.includes('NO EXP') ||
        upper.includes('UNKNOWN') ||
        upper === 'LIVE'
      ) {
        return null;
      }
      const endMs = parseDateToMs(rawEnd);
      if (isNaN(endMs) || endMs <= now) return null;
      return endMs;
    };

    // Tier 1: game-only deals with a real expiry date
    const candidatesWithExpiry = visibleUnclaimed.filter((d) => getValidExpiryMs(d) !== null);

    if (candidatesWithExpiry.length > 0) {
      // Prefer high-value ($10+, non-estimated) OR high-rated (≥80% Steam, ≥25 reviews)
      const worthShowing = candidatesWithExpiry.filter((d) => {
        const price = parseNumericPrice(d);
        const isHighValue = !d.isEstimated && price >= 10;
        const isHighRated =
          typeof d.steamRatingPercent === 'number' &&
          d.steamRatingPercent >= 80 &&
          typeof d.steamReviewCount === 'number' &&
          d.steamReviewCount >= 25;
        return isHighValue || isHighRated;
      });

      const pool = worthShowing.length > 0 ? worthShowing : candidatesWithExpiry;

      const sorted = [...pool].sort((a, b) => {
        const aMs = getValidExpiryMs(a)!;
        const bMs = getValidExpiryMs(b)!;
        if (aMs !== bMs) return aMs - bMs; // Least time left
        return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
      });

      return sorted[0];
    }

    // Tier 2 (big if): no expiring games at all → top-rated game with no expiry (best Steam rating, ≥25 reviews)
    const noExpiryGames = visibleUnclaimed; // all are already game-only, all have no expiry here
    const rated = noExpiryGames
      .filter(
        (d) =>
          typeof d.steamRatingPercent === 'number' &&
          d.steamRatingPercent >= 60 &&
          typeof d.steamReviewCount === 'number' &&
          d.steamReviewCount >= 25
      )
      .sort((a, b) => (b.steamRatingPercent || 0) - (a.steamRatingPercent || 0));

    if (rated.length > 0) return rated[0];

    // Tier 3 (big if): no rated no-expiry games either → null (All caught up)
    return null;
  }

  public getHero(): Deal | null {
    const unclaimed = this.getUnclaimedDeals();
    if (unclaimed.length === 0) return null;

    const visibleUnclaimed = unclaimed.filter(
      (d) => (!d.is18Plus || this.is18PlusRevealed(d.id)) && isGameOnlyDeal(d) && !d.isBundleNotice
    );
    if (visibleUnclaimed.length === 0) return null;

    if (this.currentHeroId) {
      const pinned = visibleUnclaimed.find((d) => d.id === this.currentHeroId);
      if (pinned && !isDealExpired(pinned) && !expiredFeedService.isExpired(pinned)) {
        return pinned;
      }
    }

    const hero = this.computeHero();
    this.currentHeroId = hero ? hero.id : null;
    return hero;
  }

  // Selector: Ending Soon (Active unclaimed drops with deadline, least time first, no no-expiry deals)
  public getEndingSoon(excludeId?: string): Deal[] {
    const unclaimed = this.getUnclaimedDeals();
    const now = Date.now();

    const getValidExpiryMs = (d: Deal): number | null => {
      const rawEnd = d.endDate || d.expiresAt;
      if (!rawEnd) return null;
      const upper = String(rawEnd).toUpperCase().trim();
      if (
        upper === 'N/A' ||
        upper.includes('PERMANENT') ||
        upper.includes('NO EXP') ||
        upper.includes('UNKNOWN') ||
        upper === 'LIVE'
      ) {
        return null;
      }
      const endMs = parseDateToMs(rawEnd);
      if (isNaN(endMs) || endMs <= now) return null;
      return endMs;
    };

    return unclaimed
      .filter((d) => {
        if (excludeId && d.id === excludeId) return false;
        if (d.isBundleNotice) return false;
        return getValidExpiryMs(d) !== null;
      })
      .sort((a, b) => {
        const aMs = getValidExpiryMs(a)!;
        const bMs = getValidExpiryMs(b)!;
        if (aMs !== bMs) return aMs - bMs;
        return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
      });
  }

  // Selector: Top Rated (Pool >= 80% and >= 25 reviews, seeded daily shuffle)
  // Hidden 18+ deals are never used while hidden. If fewer than 3 qualify, hide section.
  public getTopRated(): Deal[] {
    const active = this.getActiveDeals().filter(
      (d) => !this.isClaimed(d.id) && (!d.is18Plus || this.is18PlusRevealed(d.id))
    );

    // Only real Steam rating >= 80% and >= 25 reviews
    const list = active.filter((d) => {
      const pct = d.steamRatingPercent;
      const count = d.steamReviewCount;
      if (typeof pct !== 'number' || pct < 80 || typeof count !== 'number' || count < 25) return false;
      return isGameOnlyDeal(d);
    });

    // If fewer than 3 qualify, hide the section
    if (list.length < 3) {
      return [];
    }

    list.sort((a, b) => {
      const diffPct = (b.steamRatingPercent || 0) - (a.steamRatingPercent || 0);
      if (diffPct !== 0) return diffPct;
      return (b.steamReviewCount || 0) - (a.steamReviewCount || 0);
    });

    return getDailyTopRatedSet(list);
  }

  // Helper: Matches Store Multi-select
  public matchStoreFilter(deal: Deal, stores: string[]): boolean {
    if (!stores || stores.length === 0 || stores.includes('all')) return true;

    const dealPlat = (deal.platform || '').toLowerCase();
    const allPlats = Array.isArray(deal.platforms) ? deal.platforms.join(' ').toLowerCase() : dealPlat;
    const entryLabel = (deal.entrySiteLabel || '').toLowerCase();
    const combined = `${dealPlat} ${allPlats} ${entryLabel}`;
    const url = (deal.storeUrl || deal.giveawayUrl || deal.url || '').toLowerCase();

    return stores.some((s) => {
      const storeId = s.toLowerCase();
      if (storeId === 'mobile') {
        return (
          ['mobile', 'android', 'ios', 'google play', 'app store'].some((kw) => combined.includes(kw)) ||
          url.includes('play.google.com') ||
          url.includes('apps.apple.com') ||
          deal.type === 'mobile_game' ||
          !!deal.androidUrl ||
          !!deal.iosUrl
        );
      }
      if (storeId === 'prime') {
        return (
          combined.includes('prime') ||
          combined.includes('amazon') ||
          url.includes('gaming.amazon') ||
          url.includes('primegaming') ||
          url.includes('luna.amazon')
        );
      }
      if (storeId === 'itch') {
        return /\bitch(?:\.io)?\b/i.test(combined) || url.includes('itch.io');
      }
      if (storeId === 'playstation') {
        return combined.includes('playstation') || combined.includes('ps4') || combined.includes('ps5') || url.includes('playstation.com');
      }
      if (storeId === 'xbox') {
        return combined.includes('xbox') || url.includes('xbox.com') || url.includes('microsoft.com');
      }
      if (storeId === 'epic') {
        return combined.includes('epic') || url.includes('epicgames.com');
      }
      if (storeId === 'steam') {
        return combined.includes('steam') || url.includes('steampowered.com') || url.includes('steamcommunity.com');
      }
      if (storeId === 'gog') {
        return combined.includes('gog') || url.includes('gog.com');
      }
      return combined.includes(storeId);
    });
  }

  // Helper: Matches Type Multi-select
  private matchTypeFilter(deal: Deal, types: string[]): boolean {
    if (!types || types.length === 0 || types.includes('all')) return true;

    return types.some((t) => {
      const typeId = t.toLowerCase();
      if (typeId === 'game') {
        return deal.type === 'full_game' || deal.type === 'mobile_game';
      }
      if (typeId === 'dlc') {
        return deal.type === 'dlc' || deal.type === 'item' || deal.type === 'loot';
      }
      if (typeId === 'beta') {
        return deal.type === 'beta';
      }
      if (typeId === '18plus' || typeId === '18+') {
        return deal.is18Plus === true || deal.isNsfw === true;
      }
      return false;
    });
  }

  // Helper: Matches Claim Method Multi-select
  private matchClaimMethodFilter(deal: Deal, claimMethods: string[]): boolean {
    if (!claimMethods || claimMethods.length === 0 || claimMethods.includes('any')) return true;

    const isTask = deal.claimMethod === 'tasks' || isThirdPartyTaskHost(deal);

    return claimMethods.some((cm) => {
      const methodId = cm.toLowerCase();
      if (methodId === 'one_click') return !isTask;
      if (methodId === 'tasks') return isTask;
      return false;
    });
  }

  // Selector: Feed Results (Item 3)
  // Multi-select OR within group, AND across groups. Sort single.
  public getFeedResults(filters: FeedFilters): Deal[] {
    const active = this.getActiveDeals();
    const searchLower = (filters.search || '').trim().toLowerCase();

    const filtered = active.filter((deal) => {
      // Search query (title, platform, description, bundle games)
      if (searchLower.length > 0) {
        const titleMatch = (deal.title || '').toLowerCase().includes(searchLower);
        const descMatch = (deal.description || '').toLowerCase().includes(searchLower);
        const platMatch = (deal.platform || '').toLowerCase().includes(searchLower);
        const bundleMatch = deal.isBundleNotice && (deal.bundleGamesText || '').toLowerCase().includes(searchLower);
        if (!titleMatch && !descMatch && !platMatch && !bundleMatch) return false;
      }

      // Group filters (AND across groups)
      if (!this.matchStoreFilter(deal, filters.stores)) return false;
      if (!this.matchTypeFilter(deal, filters.types)) return false;
      if (!this.matchClaimMethodFilter(deal, filters.claimMethods)) return false;

      return true;
    });

    // Single Sort
    const now = Date.now();
    filtered.sort((a, b) => {
      if (filters.sortId === 'end') {
        const aMs = parseDateToMs(a.endDate || a.expiresAt);
        const bMs = parseDateToMs(b.endDate || b.expiresAt);
        const aRem = aMs > now ? aMs - now : Infinity;
        const bRem = bMs > now ? bMs - now : Infinity;
        return aRem - bRem;
      }
      if (filters.sortId === 'val') {
        const aVal = parseNumericPrice(a);
        const bVal = parseNumericPrice(b);
        return bVal - aVal;
      }
      if (filters.sortId === 'claims') {
        return (b.claimedUsers || 0) - (a.claimedUsers || 0);
      }
      // 'new' order: publishedAt descending, then firstSeenAt descending, then title (localeCompare, case-insensitive)
      const aPub = a.publishedAt ?? a.createdAt ?? 0;
      const bPub = b.publishedAt ?? b.createdAt ?? 0;
      if (bPub !== aPub) {
        return bPub - aPub;
      }
      const aFirst = a.firstSeenAt ?? 0;
      const bFirst = b.firstSeenAt ?? 0;
      if (bFirst !== aFirst) {
        return bFirst - aFirst;
      }
      return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
    });

    return filtered;
  }

  // Selector: Filter Counts (Item 3)
  // Dynamic count for each chip given other active filters
  public getFilterCounts(filters: FeedFilters): {
    stores: Record<string, number>;
    types: Record<string, number>;
    claimMethods: Record<string, number>;
  } {
    const active = this.getActiveDeals();
    const searchLower = (filters.search || '').trim().toLowerCase();

    // Base list matching search query
    const baseList = active.filter((deal) => {
      if (searchLower.length > 0) {
        const titleMatch = (deal.title || '').toLowerCase().includes(searchLower);
        const descMatch = (deal.description || '').toLowerCase().includes(searchLower);
        const platMatch = (deal.platform || '').toLowerCase().includes(searchLower);
        const bundleMatch = deal.isBundleNotice && (deal.bundleGamesText || '').toLowerCase().includes(searchLower);
        if (!titleMatch && !descMatch && !platMatch && !bundleMatch) return false;
      }
      return true;
    });

    const storeCounts: Record<string, number> = {};
    const primeNotice = this.getPrimeNotice();
    for (const opt of STORE_OPTIONS) {
      if (opt.id === 'all') {
        // Count matching types and claimMethods
        storeCounts['all'] = baseList.filter(
          (d) => this.matchTypeFilter(d, filters.types) && this.matchClaimMethodFilter(d, filters.claimMethods)
        ).length;
      } else if (opt.id === 'prime') {
        storeCounts['prime'] = primeNotice ? 1 : 0;
      } else {
        storeCounts[opt.id] = baseList.filter(
          (d) =>
            this.matchStoreFilter(d, [opt.id]) &&
            this.matchTypeFilter(d, filters.types) &&
            this.matchClaimMethodFilter(d, filters.claimMethods)
        ).length;
      }
    }

    const typeCounts: Record<string, number> = {};
    for (const opt of TYPE_OPTIONS) {
      if (opt.id === 'all') {
        typeCounts['all'] = baseList.filter(
          (d) => this.matchStoreFilter(d, filters.stores) && this.matchClaimMethodFilter(d, filters.claimMethods)
        ).length;
      } else {
        typeCounts[opt.id] = baseList.filter(
          (d) =>
            this.matchTypeFilter(d, [opt.id]) &&
            this.matchStoreFilter(d, filters.stores) &&
            this.matchClaimMethodFilter(d, filters.claimMethods)
        ).length;
      }
    }

    const claimMethodCounts: Record<string, number> = {};
    for (const opt of CLAIM_METHOD_OPTIONS) {
      if (opt.id === 'any') {
        claimMethodCounts['any'] = baseList.filter(
          (d) => this.matchStoreFilter(d, filters.stores) && this.matchTypeFilter(d, filters.types)
        ).length;
      } else {
        claimMethodCounts[opt.id] = baseList.filter(
          (d) =>
            this.matchClaimMethodFilter(d, [opt.id]) &&
            this.matchStoreFilter(d, filters.stores) &&
            this.matchTypeFilter(d, filters.types)
        ).length;
      }
    }

    return {
      stores: storeCounts,
      types: typeCounts,
      claimMethods: claimMethodCounts,
    };
  }

  // Selector: Vault Items (Deduplicated so games like Pony Island never appear twice)
  public getVaultItems(filter: string = 'All'): Deal[] {
    const seen = new Set<string>();
    const deduped: Deal[] = [];

    for (const d of this.claimedDeals) {
      if (!d) continue;
      const cleanKey = cleanDisplayTitle(d.title).toLowerCase().trim();
      const idKey = d.id ? String(d.id).trim() : '';
      const key = cleanKey || idKey;
      if (!key || seen.has(key) || (idKey && seen.has(idKey))) {
        continue;
      }
      seen.add(key);
      if (idKey) seen.add(idKey);
      deduped.push(d);
    }

    if (filter === 'All') return deduped;
    const f = filter.toLowerCase();

    return deduped.filter((d) => {
      const plat = (d.platform || '').toLowerCase();
      if (f === 'pc') {
        return plat.includes('pc') || plat.includes('steam') || plat.includes('epic') || plat.includes('gog');
      }
      if (f === 'console') {
        return plat.includes('playstation') || plat.includes('xbox') || plat.includes('switch');
      }
      return plat.includes(f);
    });
  }

  // Selector: Stats (Item 2: Counts that agree)
  // Live right now = activeDeals.length
  // To claim = unclaimed active deals
  // Live - Claimed = To Claim
  public getStats() {
    const active = this.getActiveDeals();
    const liveCount = active.length;
    const claimedCount = active.filter((d) => this.claimedMap[d.id]).length;
    const toClaimCount = liveCount - claimedCount;
    const endingSoonCount = this.getEndingSoon().length;
    const freeRightNowValue = calculateFreeRightNowValue(active, this.claimedMap);

    return {
      liveCount,
      claimedCount,
      toClaimCount,
      endingSoonCount,
      totalClaimedVault: this.claimedDeals.length,
      vaultValueSaved: calculateVaultValue(this.claimedDeals),
      freeRightNowValue,
    };
  }
}

export const dealsStore = new DealsStore();
