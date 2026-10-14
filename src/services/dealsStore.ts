import { Image, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Deal } from '../models/Deal';
import { fetchMergedGameFeed, getStoredMergedDeals } from './redditService';
import { dealEnrichmentService } from './DealEnrichmentService';
import {
  isDealExpired,
  parseDateToMs,
  isPostRemovedByModerator,
  cleanDisplayTitle,
  extractSteamAppId,
  isGameOnlyDeal,
  calculateVaultValue,
  isSessionFailedUrl,
  markSessionFailedUrl,
} from '../utils/dealUtils';
import { getClaimedPosts, addClaimedPost, removeClaimedPost } from './storageService';
import { postToBasicDeal } from './DealClassifier';
import { searchSteamAppId } from './SteamGamesEnricher';
import { extractEpicSlug, fetchEpicProductContent } from './EpicGamesEnricher';
import { fetchImageFromUrl } from '../utils/imageResolver';

// Storage Keys
const STORAGE_KEYS = {
  RESOLVED_IMAGES: 'lootquest_resolved_images_v3',
  RESOLVED_POSTERS: 'lootquest_resolved_posters_v3',
  RESOLVED_SOURCES: 'lootquest_resolved_sources_v3',
  IMAGE_RETRY_MAP: 'lootquest_image_retry_map_v3',
  IMAGE_UPGRADE_DONE: 'lootquest_image_upgrade_done_v4',
  ALWAYS_SHOW_18PLUS: 'lootquest_always_show_18plus',
  STEAM_SCREENSHOTS_PREFIX: 'lootquest_screenshots_',
  EPIC_PROMOTIONS_CACHE: 'lootquest_epic_promotions_cache_v2',
};

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

export const STORE_OPTIONS: StoreOption[] = [
  { id: 'all', label: 'All stores' },
  { id: 'steam', label: 'Steam' },
  { id: 'epic', label: 'Epic' },
  { id: 'gog', label: 'GOG' },
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
    !lower.startsWith('http')
  ) {
    return null;
  }

  if (clean.startsWith('http://')) {
    clean = 'https://' + clean.slice(7);
  }
  return clean;
}

// Helper: Get image dimensions with Image.getSize
export function getImageDimensions(
  url: string,
  timeoutMs = 3500
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    }, timeoutMs);

    Image.getSize(
      url,
      (width, height) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          if (width > 1 && height > 1) {
            resolve({ width, height });
          } else {
            resolve(null);
          }
        }
      },
      () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(null);
        }
      }
    );
  });
}

// Backward-compatible helper: Verify image with Image.getSize
export async function verifyImageDimensions(url: string, timeoutMs = 3500, minWidth = 100): Promise<boolean> {
  const dims = await getImageDimensions(url, timeoutMs);
  return !!dims && dims.width >= minWidth;
}

// Extract Steam app ID from deal URLs, deal fields, or post description
export function extractSteamAppIdFromDealUrls(deal: Deal): string | null {
  if (deal.steamAppId && /^\d+$/.test(deal.steamAppId)) {
    return deal.steamAppId;
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
  source: 'steam' | 'epic' | 'gamerpower' | 'reddit';
}

export function buildCandidatesForDeal(
  deal: Deal,
  epicElements: any[] | null,
  slot: 'wide' | 'poster'
): CandidateItem[] {
  const candidates: CandidateItem[] = [];
  const addedUrls = new Set<string>();

  const pushCandidate = (url?: string | null, source: 'steam' | 'epic' | 'gamerpower' | 'reddit' = 'gamerpower') => {
    const norm = normalizeCandidateUrl(url);
    if (norm && !addedUrls.has(norm)) {
      addedUrls.add(norm);
      candidates.push({ url: norm, source });
    }
  };

  // 1. Steam official art: if Steam app ID is known on the deal
  const steamAppId = extractSteamAppIdFromDealUrls(deal) || deal.steamAppId;
  if (steamAppId && /^\d+$/.test(steamAppId)) {
    if (slot === 'poster') {
      pushCandidate(`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/library_600x900.jpg`, 'steam');
      pushCandidate(`https://cdn.cloudflare.steamstatic.com/steam/apps/${steamAppId}/library_600x900.jpg`, 'steam');
      pushCandidate(`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/header.jpg`, 'steam');
      pushCandidate(`https://cdn.cloudflare.steamstatic.com/steam/apps/${steamAppId}/header.jpg`, 'steam');
    } else {
      pushCandidate(`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/library_hero.jpg`, 'steam');
      pushCandidate(`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/header.jpg`, 'steam');
      pushCandidate(`https://cdn.cloudflare.steamstatic.com/steam/apps/${steamAppId}/header.jpg`, 'steam');
    }
  }

  // 2. Epic official art (supports both Epic content API and promotional catalogue)
  const isEpic = (deal.platform || '').toLowerCase().includes('epic') ||
                 (deal.storeUrl || '').includes('epicgames.com') ||
                 (deal.giveawayUrl || '').includes('epicgames.com') ||
                 (deal.url || '').includes('epicgames.com');
  if (isEpic) {
    if (slot === 'poster' && (deal as any).epicPosterImage) {
      pushCandidate((deal as any).epicPosterImage, 'epic');
    } else if (slot !== 'poster' && (deal as any).epicWideImage) {
      pushCandidate((deal as any).epicWideImage, 'epic');
    }

    if (Array.isArray(epicElements) && epicElements.length > 0) {
      const cleanTarget = cleanDisplayTitle(deal.title).trim().toLowerCase();
      const match = epicElements.find((el: any) => {
        if (!el.title) return false;
        return cleanDisplayTitle(el.title).trim().toLowerCase() === cleanTarget;
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
          const wide = match.keyImages.find((k: any) =>
            k.url && (k.type === 'OfferImageWide' || k.type === 'DieselStoreFrontWide' || k.type === 'featuredMedia')
          );
          if (wide?.url) pushCandidate(wide.url, 'epic');
        }
      }
    }
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
  minWidth: number
): Promise<{ url: string; source: 'steam' | 'epic' | 'gamerpower' | 'reddit'; width: number; height: number } | null> {
  const loadedCandidates: Array<{ url: string; source: 'steam' | 'epic' | 'gamerpower' | 'reddit'; width: number; height: number }> = [];

  for (const c of candidates) {
    const norm = normalizeCandidateUrl(c.url);
    if (!norm) continue;
    if (isSessionFailedUrl(norm)) continue;

    const dims = await getImageDimensions(norm, 3500);
    if (!dims) {
      markSessionFailedUrl(norm);
      continue;
    }

    loadedCandidates.push({ url: norm, source: c.source, width: dims.width, height: dims.height });
    if (dims.width >= minWidth) {
      return { url: norm, source: c.source, width: dims.width, height: dims.height };
    }
  }

  // If every candidate is below the limit, use the biggest one that loaded instead of fallback surface
  if (loadedCandidates.length > 0) {
    loadedCandidates.sort((a, b) => b.width - a.width);
    return loadedCandidates[0];
  }

  return null;
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

  // Persist the merged feed (now including enriched ratings/metadata) so
  // ratings survive app reloads instead of disappearing until re-enrichment.
  private scheduleEnrichedCacheSave() {
    if (this.enrichedCacheSaveTimer) clearTimeout(this.enrichedCacheSaveTimer);
    this.enrichedCacheSaveTimer = setTimeout(() => {
      AsyncStorage.setItem('fgf_merged_feed_cache', JSON.stringify(this.deals)).catch(() => {});
    }, 1500);
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

  // Helper: Get Epic promotions catalog (cached in memory and AsyncStorage for 7 days)
  public async getEpicPromotionsElements(): Promise<any[]> {
    if (this.epicPromotionsCache && this.epicPromotionsCache.length > 0) {
      return this.epicPromotionsCache;
    }
    const SEVEN_DAYS_MS = 7 * 86400 * 1000;
    try {
      const cached = await AsyncStorage.getItem(STORAGE_KEYS.EPIC_PROMOTIONS_CACHE);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed.timestamp === 'number' && Date.now() - parsed.timestamp < SEVEN_DAYS_MS) {
          this.epicPromotionsCache = parsed.elements || [];
          return this.epicPromotionsCache || [];
        }
      }
    } catch {}

    try {
      const url = 'https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions';
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const resp = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      clearTimeout(timer);
      if (resp.ok) {
        const json = await resp.json();
        const elements: any[] = json.data?.Catalog?.searchStore?.elements || [];
        this.epicPromotionsCache = elements;
        await AsyncStorage.setItem(
          STORAGE_KEYS.EPIC_PROMOTIONS_CACHE,
          JSON.stringify({ timestamp: Date.now(), elements })
        ).catch(() => {});
        return elements;
      }
    } catch {}
    return [];
  }

  // ─── Initialization ────────────────────────────────────────────────────────
  public async init() {
    if (this.initialized) return;
    this.initialized = true;

    // Load persisted settings & caches concurrently
    try {
      const [
        savedDeals,
        savedClaimed,
        savedImages,
        savedPosters,
        savedSources,
        savedRetries,
        saved18Plus,
      ] = await Promise.all([
        getStoredMergedDeals(),
        getClaimedPosts(),
        AsyncStorage.getItem(STORAGE_KEYS.RESOLVED_IMAGES),
        AsyncStorage.getItem(STORAGE_KEYS.RESOLVED_POSTERS),
        AsyncStorage.getItem(STORAGE_KEYS.RESOLVED_SOURCES),
        AsyncStorage.getItem(STORAGE_KEYS.IMAGE_RETRY_MAP),
        AsyncStorage.getItem(STORAGE_KEYS.ALWAYS_SHOW_18PLUS),
      ]);

      if (savedImages) {
        try {
          this.resolvedImages = JSON.parse(savedImages);
          // Purge any stale generic host logos from old versions so they upgrade to official Steam/Epic artwork
          let purged = false;
          for (const [id, imgUrl] of Object.entries(this.resolvedImages)) {
            if (
              typeof imgUrl === 'string' &&
              (imgUrl.includes('gaming.lenovo.com') ||
               imgUrl.includes('alienwarearena.com') ||
               imgUrl.includes('steelseries.com') ||
               imgUrl.includes('gleam.io') ||
               imgUrl.includes('redditstatic.com') ||
               imgUrl.includes('thumbs.redditmedia.com'))
            ) {
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
          const oldV2 = await AsyncStorage.getItem('lootquest_resolved_images_v2');
          if (oldV2) this.resolvedImages = JSON.parse(oldV2);
        } catch {}
      }

      if (savedPosters) {
        try {
          this.resolvedPosters = JSON.parse(savedPosters);
        } catch {}
      }

      if (savedSources) {
        try {
          this.resolvedSources = JSON.parse(savedSources);
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
        if (p.resolvedImage) b.resolvedImage = p.resolvedImage;
        if (!b.resolvedImage && this.resolvedImages[b.id]) {
          b.resolvedImage = this.resolvedImages[b.id];
        }
        if (p.resolvedPoster) b.resolvedPoster = p.resolvedPoster;
        if (!b.resolvedPoster && this.resolvedPosters[b.id]) {
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
        dedupedClaimed.push(b);
      }

      this.claimedDeals = dedupedClaimed;

      this.claimedMap = {};
      for (const d of this.claimedDeals) {
        if (d.id) this.claimedMap[d.id] = true;
      }

      if (savedDeals && savedDeals.length > 0) {
        this.deals = savedDeals.map((d) => this.applyClassifications(d));
      }

      this.notify();
    } catch (e) {
      console.warn('[DealsStore] Initialization hydration warning:', e);
    }

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
    const winnerImage = deal.resolvedImage || this.resolvedImages[deal.id];
    const winnerPoster = deal.resolvedPoster || this.resolvedPosters[deal.id];
    const winnerSource = deal.resolvedSource || this.resolvedSources[deal.id];

    return {
      ...deal,
      is18Plus,
      isNsfw: is18Plus,
      resolvedImage: winnerImage,
      resolvedPoster: winnerPoster,
      resolvedSource: winnerSource,
    };
  }

  // ─── Thumbnail Resolution Pipeline (Item 5) ────────────────────────────────
  private async resolveImagesForDeals(dealsList: Deal[]): Promise<Deal[]> {
    const now = Date.now();
    let cacheUpdated = false;
    const epicElements = await this.getEpicPromotionsElements();

    for (const deal of dealsList) {
      // Pre-pass: check if game is available on Steam or Epic to resolve official art
      if (!deal.steamAppId) {
        const directAppId = extractSteamAppIdFromDealUrls(deal);
        if (directAppId) {
          deal.steamAppId = directAppId;
          deal.steamUrl = `https://store.steampowered.com/app/${directAppId}/`;
        } else {
          // If third-party giveaway host (Legion Gaming, Alienware, Gleam, Steelseries) or PC/Steam deal:
          const isThirdPartyOrPc =
            (deal.url || '').includes('gaming.lenovo.com') ||
            (deal.url || '').includes('alienwarearena.com') ||
            (deal.url || '').includes('steelseries.com') ||
            (deal.url || '').includes('gleam.io') ||
            (deal.url || '').includes('givee.club') ||
            (deal.platform || '').toLowerCase().includes('steam') ||
            (deal.platform || '').toLowerCase().includes('pc') ||
            (deal.title || '').toLowerCase().includes('[steam]');
          if (isThirdPartyOrPc) {
            try {
              const foundId = await searchSteamAppId(deal.title);
              if (foundId && /^\d+$/.test(foundId)) {
                deal.steamAppId = foundId;
                deal.steamUrl = `https://store.steampowered.com/app/${foundId}/`;
              }
            } catch {}
          }
        }
      }

      // Check Epic slug for official Epic store artwork and details (e.g. Voidtrain)
      const isEpicDeal =
        (deal.platform || '').toLowerCase().includes('epic') ||
        (deal.storeUrl || '').includes('epicgames.com') ||
        (deal.giveawayUrl || '').includes('epicgames.com') ||
        (deal.url || '').includes('epicgames.com');
      if (isEpicDeal) {
        const epicSlug = extractEpicSlug(deal.url || deal.storeUrl || deal.giveawayUrl);
        if (epicSlug) {
          try {
            const content = await fetchEpicProductContent(epicSlug);
            if (content) {
              if (content.wideImage) (deal as any).epicWideImage = content.wideImage;
              if (content.posterImage) (deal as any).epicPosterImage = content.posterImage;
              if (content.developer && !deal.developer) deal.developer = content.developer;
              if (content.publisher && !deal.publisher) deal.publisher = content.publisher;
              if (content.description && !deal.aboutGame) deal.aboutGame = content.description;
            }
          } catch {}
        }
      }

      const retryInfo = this.retryMap[deal.id];
      if (retryInfo && now < retryInfo.nextRetry) {
        if (this.resolvedImages[deal.id]) deal.resolvedImage = this.resolvedImages[deal.id];
        if (this.resolvedPosters[deal.id]) deal.resolvedPoster = this.resolvedPosters[deal.id];
        deal.resolvedSource = this.resolvedSources[deal.id] || 'fallback';
        continue;
      }

      // If already resolved with verified image and source, keep it (unless it was a generic host logo now upgradable to Steam/Epic art)
      const currentImg = deal.resolvedImage || this.resolvedImages[deal.id] || '';
      const isStaleHostLogo =
        typeof currentImg === 'string' &&
        (currentImg.includes('gaming.lenovo.com') ||
         currentImg.includes('alienwarearena.com') ||
         currentImg.includes('steelseries.com') ||
         currentImg.includes('gleam.io') ||
         currentImg.includes('redditstatic.com') ||
         currentImg.includes('thumbs.redditmedia.com'));

      const isThirdPartyWithSteam =
        deal.steamAppId &&
        ((deal.url || '').includes('gaming.lenovo.com') ||
         (deal.url || '').includes('alienwarearena.com') ||
         (deal.url || '').includes('steelseries.com') ||
         (deal.url || '').includes('gleam.io'));

      if (!isStaleHostLogo && !isThirdPartyWithSteam && deal.resolvedImage && this.resolvedImages[deal.id] && this.resolvedSources[deal.id]) {
        deal.resolvedPoster = deal.resolvedPoster || this.resolvedPosters[deal.id];
        deal.resolvedSource = this.resolvedSources[deal.id];
        continue;
      }

      // Build candidates per slot type
      const wideCandidates = buildCandidatesForDeal(deal, epicElements, 'wide');
      const wideWinner = await resolveCandidateItem(wideCandidates, 300);

      const posterCandidates = buildCandidatesForDeal(deal, epicElements, 'poster');
      const posterWinner = await resolveCandidateItem(posterCandidates, 200);

      const winnerSource: 'steam' | 'epic' | 'gamerpower' | 'reddit' | 'fallback' =
        wideWinner?.source || posterWinner?.source || 'fallback';

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
          if (wideWinner?.url) Image.prefetch(wideWinner.url).catch(() => {});
          if (posterWinner?.url && posterWinner.url !== wideWinner?.url) Image.prefetch(posterWinner.url).catch(() => {});
        }
      } else {
        const attempt = (retryInfo?.attempt || 0) + 1;
        const delayMs = attempt === 1 ? 3600 * 1000 : attempt === 2 ? 6 * 3600 * 1000 : 24 * 3600 * 1000;
        this.retryMap[deal.id] = { nextRetry: now + delayMs, attempt };
        deal.resolvedImage = undefined;
        deal.resolvedPoster = undefined;
        deal.resolvedSource = 'fallback';
        this.resolvedSources[deal.id] = 'fallback';
      }

      // Store-art fallback for third-party giveaways (key sites, Legion Gaming,
      // direct store links): no usable candidate from URLs, so ask the stores
      // directly — og:image page scrape, Epic slug lookup, Steam title search.
      if (!deal.resolvedImage || !deal.resolvedPoster) {
        const storeImg = await fetchImageFromUrl(
          deal.url || deal.giveawayUrl || deal.storeUrl || undefined,
          deal.title
        );
        if (storeImg) {
          if (!deal.resolvedImage) {
            deal.resolvedImage = storeImg;
            this.resolvedImages[deal.id] = storeImg;
          }
          if (!deal.resolvedPoster) {
            deal.resolvedPoster = storeImg;
            this.resolvedPosters[deal.id] = storeImg;
          }
          cacheUpdated = true;
        }
      }
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

    try {
      // 1. Fetch GamerPower and Reddit merged
      const result = await fetchMergedGameFeed('new', 40, undefined, forceRefresh);
      let rawDeals = result.deals || [];

      // 2. Normalize, dedupe, classify (type, claimMethod, 18+ flag)
      let classified = rawDeals.map((d) => this.applyClassifications(d));

      // 3. Build map of existing deals to preserve enriched ratings & metadata across reloads
      const existingDealMap = new Map<string, Deal>();
      for (const d of this.deals) {
        if (d && d.id) existingDealMap.set(d.id, d);
      }
      for (const cd of this.claimedDeals) {
        if (cd && cd.id && !existingDealMap.has(cd.id)) existingDealMap.set(cd.id, cd);
      }

      // Merge enriched metadata from existing deals into classified deals before resolution
      const preservedDeals = classified.map((d) => {
        const prev = existingDealMap.get(d.id) || dealEnrichmentService.getEnrichedDeal(d.id);
        if (!prev) return d;
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
        };
      });

      // 4. Resolve images at sync time
      const resolvedDeals = await this.resolveImagesForDeals(preservedDeals);

      // Enrichment runs in the background (Steam appreviews/appdetails, Epic).
      // Enriched deals merge into this.deals via the subscribeBatch listener
      // set up in init(), so ratings/metadata appear as they arrive.
      dealEnrichmentService.enrichDeals(resolvedDeals);

      this.deals = resolvedDeals;
      this.resolveVaultImages();

      // 5. Cleanup ended deals older than 7 days from image cache (never delete Vault items)
      this.cleanupEndedDealImages();

      // Save to cache
      await AsyncStorage.setItem('fgf_merged_feed_cache', JSON.stringify(this.deals));

      this.syncState = 'synced_just_now';
      this.hasSyncedOnce = true;
      this.notify();
      setTimeout(() => {
        this.syncState = 'idle';
        this.notify();
      }, 2200);
    } catch (e) {
      console.warn('[DealsStore] Sync error:', e);
      this.syncState = 'idle';
      this.notify();
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
      const wideWinner = await resolveCandidateItem(wideCandidates, 300);

      const posterCandidates = buildCandidatesForDeal(d, epicElements, 'poster');
      const posterWinner = await resolveCandidateItem(posterCandidates, 200);

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
          if (wideWinner?.url) Image.prefetch(wideWinner.url).catch(() => {});
          if (posterWinner?.url && posterWinner.url !== wideWinner?.url) Image.prefetch(posterWinner.url).catch(() => {});
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
    if (this.upgradeRunning) return;
    try {
      const upgradeDone = await AsyncStorage.getItem(STORAGE_KEYS.IMAGE_UPGRADE_DONE);
      if (upgradeDone === 'true') return;

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
          const wideWinner = await resolveCandidateItem(wideCandidates, 300);

          const posterCandidates = buildCandidatesForDeal(deal, epicElements, 'poster');
          const posterWinner = await resolveCandidateItem(posterCandidates, 200);

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
      await AsyncStorage.setItem(STORAGE_KEYS.IMAGE_UPGRADE_DONE, 'true').catch(() => {});

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

    const posterToSave = deal.resolvedPoster || this.resolvedPosters[deal.id];
    const claimRecord = {
      id: deal.id,
      title: deal.title,
      cleanTitle: cleanDisplayTitle(deal.title),
      url: deal.giveawayUrl || deal.url,
      giveawayUrl: deal.giveawayUrl || deal.url,
      storeUrl: deal.storeUrl || deal.steamUrl,
      platform: deal.platform,
      worth: deal.worth || deal.originalPrice || undefined,
      image: imageToSave,
      resolvedImage: imageToSave,
      resolvedPoster: posterToSave,
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

    this.notify();
  }

  public async unclaimDeal(dealId: string, title?: string) {
    await removeClaimedPost(dealId, title);
    delete this.claimedMap[dealId];
    this.claimedDeals = this.claimedDeals.filter(
      (d) => d.id !== dealId && (title ? cleanDisplayTitle(d.title) !== cleanDisplayTitle(title) : true)
    );
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
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);

      const resp = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      clearTimeout(timer);

      if (!resp.ok) {
        return [];
      }

      const json = await resp.json();
      const appData = json[appId]?.data;
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

    const cacheKey = `lootquest_epic_screenshots_${cleanTarget.replace(/[^a-z0-9]/g, '')}`;
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
      const promoUrl = 'https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions';
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);

      const resp = await fetch(promoUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      clearTimeout(timer);

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
      const steamScreenshots = await this.getSteamScreenshots(foundAppId);
      if (steamScreenshots && steamScreenshots.length > 0) {
        return steamScreenshots;
      }
    }

    return [];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SELECTORS (Only ways to read data, no screen calculations)
  // ─────────────────────────────────────────────────────────────────────────

  // Selector: Active Deals (non-expired, non-moderator-removed, includes both claimed and unclaimed)
  public getActiveDeals(): Deal[] {
    const map = new Map<string, Deal>();
    for (const d of this.deals) {
      if (!isDealExpired(d) && !isPostRemovedByModerator(d)) {
        map.set(d.id, d);
      }
    }
    // Also include any claimed deals that are still active
    for (const d of this.claimedDeals) {
      if (!isDealExpired(d) && !isPostRemovedByModerator(d)) {
        if (!map.has(d.id)) {
          map.set(d.id, d);
        }
      }
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
  public getHero(): Deal | null {
    const unclaimed = this.getUnclaimedDeals();
    if (unclaimed.length === 0) return null;

    // Filter out hidden 18+ deals AND non-game deals (no DLCs, betas, items, loot)
    const visibleUnclaimed = unclaimed.filter(
      (d) => (!d.is18Plus || this.is18PlusRevealed(d.id)) && isGameOnlyDeal(d)
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
  // Hidden 18+ deals are never used while hidden
  public getTopRated(): Deal[] {
    const active = this.getActiveDeals().filter(
      (d) => !this.isClaimed(d.id) && (!d.is18Plus || this.is18PlusRevealed(d.id))
    );

    // Tier 1: Real Steam rating >= 80% and >= 25 reviews
    let list = active.filter((d) => {
      const pct = d.steamRatingPercent;
      const count = d.steamReviewCount;
      if (typeof pct !== 'number' || pct < 80 || typeof count !== 'number' || count < 25) return false;
      return isGameOnlyDeal(d);
    });

    // Tier 2: Real Steam rating >= 75%
    if (list.length < 3) {
      list = active.filter((d) => {
        const pct = d.steamRatingPercent;
        return typeof pct === 'number' && pct >= 75 && isGameOnlyDeal(d);
      });
    }

    // Tier 3: Active games
    if (list.length < 3) {
      list = active.filter((d) => isGameOnlyDeal(d));
    }

    list.sort((a, b) => {
      const diffPct = (b.steamRatingPercent || 0) - (a.steamRatingPercent || 0);
      if (diffPct !== 0) return diffPct;
      return (b.steamReviewCount || 0) - (a.steamReviewCount || 0);
    });

    return getDailyTopRatedSet(list);
  }

  // Helper: Matches Store Multi-select
  private matchStoreFilter(deal: Deal, stores: string[]): boolean {
    if (!stores || stores.length === 0 || stores.includes('all')) return true;
    const dealPlat = (deal.platform || '').toLowerCase();

    return stores.some((s) => {
      const storeId = s.toLowerCase();
      if (storeId === 'mobile') {
        return ['mobile', 'android', 'ios', 'google play', 'app store'].some((kw) => dealPlat.includes(kw));
      }
      if (storeId === 'itch') {
        return dealPlat.includes('itch') && !dealPlat.includes('switch');
      }
      if (storeId === 'playstation') {
        return dealPlat.includes('playstation') || dealPlat.includes('ps4') || dealPlat.includes('ps5');
      }
      return dealPlat.includes(storeId);
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

    return claimMethods.some((cm) => {
      const methodId = cm.toLowerCase();
      if (methodId === 'one_click') return deal.claimMethod === 'one_click';
      if (methodId === 'tasks') return deal.claimMethod === 'tasks';
      return false;
    });
  }

  // Selector: Feed Results (Item 3)
  // Multi-select OR within group, AND across groups. Sort single.
  public getFeedResults(filters: FeedFilters): Deal[] {
    const active = this.getActiveDeals();
    const searchLower = (filters.search || '').trim().toLowerCase();

    const filtered = active.filter((deal) => {
      // Search query (title, platform, description)
      if (searchLower.length > 0) {
        const titleMatch = (deal.title || '').toLowerCase().includes(searchLower);
        const descMatch = (deal.description || '').toLowerCase().includes(searchLower);
        const platMatch = (deal.platform || '').toLowerCase().includes(searchLower);
        if (!titleMatch && !descMatch && !platMatch) return false;
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
      // 'new'
      return (b.createdAt || 0) - (a.createdAt || 0);
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
        if (!titleMatch && !descMatch && !platMatch) return false;
      }
      return true;
    });

    const storeCounts: Record<string, number> = {};
    for (const opt of STORE_OPTIONS) {
      if (opt.id === 'all') {
        // Count matching types and claimMethods
        storeCounts['all'] = baseList.filter(
          (d) => this.matchTypeFilter(d, filters.types) && this.matchClaimMethodFilter(d, filters.claimMethods)
        ).length;
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

    return {
      liveCount,
      claimedCount,
      toClaimCount,
      endingSoonCount,
      totalClaimedVault: this.claimedDeals.length,
      vaultValueSaved: calculateVaultValue(this.claimedDeals),
    };
  }
}

export const dealsStore = new DealsStore();
