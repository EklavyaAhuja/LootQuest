import { Deal } from '../models/Deal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWithProxy } from './redditService';

const EPIC_PROMO_API = 'https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US&allowCountries=US';
const SHARED_CATALOG_CACHE_KEY = 'claimr_epic_promotions_cache_v2';
const LEGACY_CATALOG_CACHE_KEY = 'lootquest_epic_promotions_cache_v2';
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// In-memory cache & in-flight deduplication promise
let inMemoryCatalog: any[] | null = null;
let inMemoryCatalogTimestamp = 0;
let inFlightCatalogPromise: Promise<any[]> | null = null;

/**
 * Shared singleton fetcher for Epic free games promotions catalog.
 * Shares ONE cache entry and ONE in-flight fetch across all consumers.
 */
export async function getEpicPromotionsCatalog(forceRefresh = false): Promise<any[]> {
  const now = Date.now();

  // 1. Check in-memory cache
  if (!forceRefresh && inMemoryCatalog && now - inMemoryCatalogTimestamp < CACHE_TTL) {
    return inMemoryCatalog;
  }

  // 2. Return in-flight promise if currently fetching
  if (inFlightCatalogPromise) {
    return inFlightCatalogPromise;
  }

  // 3. Check persistent AsyncStorage cache if not forcing refresh
  if (!forceRefresh) {
    try {
      let cached = await AsyncStorage.getItem(SHARED_CATALOG_CACHE_KEY);
      if (!cached) {
        cached = await AsyncStorage.getItem(LEGACY_CATALOG_CACHE_KEY);
      }
      if (cached) {
        const { timestamp, elements } = JSON.parse(cached);
        if (now - timestamp < CACHE_TTL && Array.isArray(elements) && elements.length > 0) {
          inMemoryCatalog = elements;
          inMemoryCatalogTimestamp = timestamp;
          return elements;
        }
      }
    } catch (_) {}
  }

  // 4. Fetch from network with in-flight deduplication
  inFlightCatalogPromise = (async () => {
    try {
      const res = await fetchWithProxy(EPIC_PROMO_API, 8000);

      if (!res.ok) {
        console.warn(`[EpicPromotionsService] Fetch failed with status ${res.status}`);
        return inMemoryCatalog || [];
      }

      const data = await res.json();
      const elements = data?.data?.Catalog?.searchStore?.elements;
      if (!Array.isArray(elements)) return inMemoryCatalog || [];

      inMemoryCatalog = elements;
      inMemoryCatalogTimestamp = Date.now();

      AsyncStorage.setItem(
        SHARED_CATALOG_CACHE_KEY,
        JSON.stringify({ timestamp: inMemoryCatalogTimestamp, elements })
      ).catch(() => {});

      return elements;
    } catch (err: any) {
      console.warn('[EpicPromotionsService] Catalog fetch error:', err.message || err);
      // Fallback to expired cache if available
      if (inMemoryCatalog) return inMemoryCatalog;
      try {
        const cached = await AsyncStorage.getItem(SHARED_CATALOG_CACHE_KEY);
        if (cached) {
          const { elements } = JSON.parse(cached);
          if (Array.isArray(elements)) return elements;
        }
      } catch (_) {}
      return [];
    } finally {
      inFlightCatalogPromise = null;
    }
  })();

  return inFlightCatalogPromise;
}

export async function fetchEpicGamesPromotions(forceRefresh = false): Promise<Deal[]> {
  const elements = await getEpicPromotionsCatalog(forceRefresh);
  if (!Array.isArray(elements) || elements.length === 0) return [];

  const now = Date.now();
  const activeDeals: Deal[] = [];

  for (const item of elements) {
    // Find 100% off discount offers
    const promoOffers = item?.promotions?.promotionalOffers?.[0]?.promotionalOffers || [];
    const freeOffer = promoOffers.find((offer: any) => offer?.discountSetting?.discountPercentage === 0);

    if (!freeOffer) continue;

    const startDate = freeOffer.startDate ? new Date(freeOffer.startDate).getTime() : 0;
    const endDate = freeOffer.endDate ? new Date(freeOffer.endDate).getTime() : 0;

    // Ensure promotion is live right now
    if (startDate > now) continue;
    if (endDate > 0 && endDate <= now) continue;

    const pageSlug = item.productSlug || item.urlSlug || item.catalogNs?.mappings?.[0]?.pageSlug || '';
    const storeUrl = pageSlug ? `https://store.epicgames.com/p/${pageSlug}` : 'https://store.epicgames.com';

    const keyImages = item.keyImages || [];
    const wideImg = keyImages.find((k: any) => k.type === 'DieselStoreFrontWide' || k.type === 'OfferImageWide')?.url;
    const tallImg = keyImages.find((k: any) => k.type === 'Thumbnail' || k.type === 'OfferImageTall')?.url;
    const bestImage = wideImg || tallImg || keyImages[0]?.url || '';

    const originalPriceCents = item.price?.totalPrice?.originalPrice || 0;
    const worth = originalPriceCents > 0 ? `$${(originalPriceCents / 100).toFixed(2)}` : 'Free';

    const deal: Deal = {
      id: `epic_${item.id}`,
      title: item.title,
      description: item.description || `Claim ${item.title} free on Epic Games Store.`,
      aboutGame: item.description || '',
      instructions: 'Click Claim Deal to visit Epic Games Store and claim directly to your account.',
      platform: 'Epic Games',
      platforms: ['Epic Games', 'PC'],
      type: 'full_game',
      worth: worth,
      originalPrice: worth,
      currentPrice: 'Free',
      image: bestImage,
      resolvedImage: bestImage,
      resolvedPoster: tallImg || wideImg || bestImage,
      url: storeUrl,
      giveawayUrl: storeUrl,
      claimMethod: 'one_click',
      isExpired: false,
      expiryStatus: 'ACTIVE',
      endDate: endDate ? new Date(endDate).toISOString() : undefined,
      expiresAt: endDate ? new Date(endDate).toISOString() : undefined,
      createdAt: startDate || Date.now(),
      source: 'epic_promotions',
      developer: item.seller?.name || undefined,
      publisher: item.seller?.name || undefined,
    };

    activeDeals.push(deal);
  }

  return activeDeals;
}
