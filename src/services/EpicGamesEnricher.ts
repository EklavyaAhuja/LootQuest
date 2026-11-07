import { fetchWithProxy } from './redditService';
import { Platform } from 'react-native';
import { getEpicPromotionsCatalog } from './EpicPromotionsService';
import { queryEpicGraphQLStore } from '../utils/imageResolver';

export interface EpicEnrichedData {
  developer?: string;
  publisher?: string;
  description?: string;
  expiresAt?: string; // ISO 8601 string
  image?: string;
  url?: string;
}

function cleanTitleForMatch(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function extractExpiryFromPromotions(promotions: any): string | undefined {
  if (!promotions) return undefined;
  
  // Check active promotional offers
  const offers = promotions.promotionalOffers || [];
  for (const group of offers) {
    const subOffers = group.promotionalOffers || [];
    for (const offer of subOffers) {
      if (offer.discountSetting?.discountPercentage === 0) {
        return offer.endDate; // ISO 8601 string
      }
    }
  }
  
  return undefined;
}

function extractImageFromKeyImages(keyImages: any[]): string | undefined {
  if (!keyImages || keyImages.length === 0) return undefined;
  
  // Prefer OfferImageWide or featuredMedia or DieselStoreFrontWide
  const preferredTypes = ['OfferImageWide', 'featuredMedia', 'DieselStoreFrontWide', 'Thumbnail', 'OfferImageTall'];
  for (const type of preferredTypes) {
    const img = keyImages.find(i => i.type === type);
    if (img && img.url) return img.url;
  }
  
  return keyImages[0].url;
}

/**
 * Extracts the product slug from an Epic Games Store URL.
 * Handles patterns like:
 * store.epicgames.com/p/voidtrain
 * store.epicgames.com/en-US/p/voidtrain
 * store.epicgames.com/en-US/product/voidtrain
 */
export function extractEpicSlug(url?: string | null): string | null {
  if (!url) return null;
  const match = url.match(/(?:epicgames\.com.*?)?(?:p|product)\/([a-zA-Z0-9_-]+)/i);
  return match && match[1] ? match[1] : null;
}

export interface EpicProductContent {
  title?: string;
  wideImage?: string;
  posterImage?: string;
  developer?: string;
  publisher?: string;
  description?: string;
  screenshots: Array<{ id: number; path_thumbnail: string; path_full: string }>;
}

const epicContentCache = new Map<string, EpicProductContent | null>();

/**
 * Fetches rich product metadata and screenshots from Epic's official content API.
 */
export async function fetchEpicProductContent(slug: string): Promise<EpicProductContent | null> {
  if (!slug) return null;
  const cleanSlug = slug.toLowerCase().trim();
  if (epicContentCache.has(cleanSlug)) {
    return epicContentCache.get(cleanSlug) || null;
  }

  const slugsToTry = [cleanSlug];
  // Strip trailing 6-char hash suffix if present (e.g. wytchwood-android-cad0ea -> wytchwood-android)
  const strippedHash = cleanSlug.replace(/-[a-z0-9]{6}$/, '');
  if (strippedHash !== cleanSlug) {
    slugsToTry.push(strippedHash);
  }

  for (const s of slugsToTry) {
    // 1. Try modern official GraphQL store search first
    const slugWords = s.replace(/-/g, ' ').trim();
    try {
      const gqlResult = await queryEpicGraphQLStore(slugWords);
      if (gqlResult && (gqlResult.wideImage || gqlResult.description)) {
        const result: EpicProductContent = {
          title: gqlResult.title || undefined,
          wideImage: gqlResult.wideImage,
          posterImage: gqlResult.posterImage,
          developer: gqlResult.seller,
          publisher: gqlResult.seller,
          description: gqlResult.description,
          screenshots: gqlResult.screenshots || [],
        };
        epicContentCache.set(cleanSlug, result);
        return result;
      }
    } catch {}

    // 2. Fallback to legacy content API
    try {
      const apiUrl = `https://store-content-ipv4.ak.epicgames.com/api/en-US/content/products/${s}`;
      let resp: Response;
      if (Platform.OS === 'web') {
        resp = await fetchWithProxy(apiUrl, 4000);
      } else {
        const c = new AbortController();
        const timer = setTimeout(() => c.abort(), 4000);
        resp = await fetch(apiUrl, {
          signal: c.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        clearTimeout(timer);
      }

      if (!resp.ok) continue;
      const data = await resp.json();
      const page0 = data?.pages?.[0]?.data;
      if (!page0) continue;

      const hero = page0.hero || {};
      const about = page0.about || {};
      const gallery = page0.gallery || {};
      const carousel = page0.carousel || {};

      const wideImage = hero.backgroundImageUrl || carousel.items?.[0]?.image?.src || undefined;
      const posterImage = hero.portraitBackgroundImageUrl || about.image?.src || undefined;
      const developer = about.developerAttribution || undefined;
      const publisher = about.publisherAttribution || undefined;
      const description = about.shortDescription || (typeof about.description === 'string' ? about.description.replace(/^#+\s+/gm, '') : undefined);

      const screenshotUrls: string[] = [];
      const seen = new Set<string>();

      const addUrl = (u?: string) => {
        if (!u || seen.has(u)) return;
        seen.add(u);
        screenshotUrls.push(u);
      };

      if (Array.isArray(gallery.galleryImages)) {
        for (const g of gallery.galleryImages) {
          if (g?.src) addUrl(g.src);
        }
      }

      if (Array.isArray(carousel.items)) {
        for (const it of carousel.items) {
          if (it?.image?.src) addUrl(it.image.src);
        }
      }

      const screenshots = screenshotUrls.map((src, idx) => ({
        id: idx + 1,
        path_thumbnail: src,
        path_full: src,
      }));

      const result: EpicProductContent = {
        title: page0.title || data._title || undefined,
        wideImage,
        posterImage,
        developer,
        publisher,
        description,
        screenshots,
      };

      epicContentCache.set(cleanSlug, result);
      return result;
    } catch {
      // try next slug variant
    }
  }

  epicContentCache.set(cleanSlug, null);
  return null;
}

/**
 * Fetches free game metadata directly from Epic Games Store's official GraphQL store search,
 * static promotions endpoint, or product content API.
 */
export async function enrichEpicDeal(title: string, url?: string): Promise<EpicEnrichedData | null> {
  // 1. If an Epic store URL is present, query Epic product content or GraphQL API directly
  const slug = extractEpicSlug(url);
  if (slug) {
    try {
      const content = await fetchEpicProductContent(slug);
      if (content) {
        return {
          developer: content.developer,
          publisher: content.publisher,
          description: content.description,
          image: content.wideImage,
          url: `https://store.epicgames.com/p/${slug}`,
        };
      }
    } catch (e) {
      console.warn(`[EpicGamesEnricher] Content API fetch failed for slug ${slug}:`, e);
    }
  }

  // 2. Try direct GraphQL search using clean title
  const cleanTitle = (title || '')
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/\([^)]+\)\s*/, '')
    .replace(/\b(?:giveaways?|free)\b/gi, '')
    .replace(/[\u2010-\u2015\u2212]/g, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleanTitle) {
    try {
      const gqlResult = await queryEpicGraphQLStore(cleanTitle);
      if (gqlResult && (gqlResult.wideImage || gqlResult.description)) {
        return {
          developer: gqlResult.seller,
          publisher: gqlResult.seller,
          description: gqlResult.description,
          image: gqlResult.wideImage,
          url: url || undefined,
        };
      }
    } catch (e) {
      console.warn(`[EpicGamesEnricher] GraphQL search failed for title "${cleanTitle}":`, e);
    }
  }

  try {
    const elements = await getEpicPromotionsCatalog();
    
    const cleanTarget = cleanTitleForMatch(title);
    
    // Find matching game by title
    const match = elements.find((el: any) => {
      if (!el.title) return false;
      const cleanElTitle = cleanTitleForMatch(el.title);
      return cleanElTitle === cleanTarget || cleanElTitle.includes(cleanTarget) || cleanTarget.includes(cleanElTitle);
    });

    if (!match) {
      console.log(`[EpicGamesEnricher] No match found in Epic promotions feed for "${title}".`);
      return null;
    }

    console.log(`[EpicGamesEnricher] Found match: "${match.title}"`);
    
    let developer = match.customAttributes?.find((a: any) => a.key === 'developerName' || a.key === 'developer')?.value;
    let publisher = match.customAttributes?.find((a: any) => a.key === 'publisherName' || a.key === 'publisher')?.value;
    
    let sellerName = match.seller?.name;
    if (sellerName && (sellerName.toLowerCase().includes('test') || sellerName.toLowerCase() === 'epic games')) {
      sellerName = undefined;
    }
    if (sellerName) {
      if (!publisher) publisher = sellerName;
      if (!developer) developer = sellerName;
    }

    const description = match.description && match.description !== match.title ? match.description : undefined;
    const expiresAt = extractExpiryFromPromotions(match.promotions);
    const image = extractImageFromKeyImages(match.keyImages);
    
    const productSlug = match.productSlug || match.catalogNs?.mappings?.[0]?.pageSlug;
    const storeUrl = productSlug ? `https://store.epicgames.com/p/${productSlug}` : undefined;

    return {
      developer: developer || undefined,
      publisher: publisher || undefined,
      description: description || undefined,
      expiresAt: expiresAt || undefined,
      image: image || undefined,
      url: storeUrl || undefined
    };
  } catch (error) {
    console.warn('[EpicGamesEnricher] Enrichment failed:', error);
    return null;
  }
}

