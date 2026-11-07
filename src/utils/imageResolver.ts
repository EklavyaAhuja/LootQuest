import { Platform } from 'react-native';
import { extractEpicSlug } from '../services/EpicGamesEnricher';
import { getEpicPromotionsCatalog } from '../services/EpicPromotionsService';
import { fetchWithProxy } from '../services/redditService';

/**
 * Utility to resolve cover image URLs for games from their store links.
 */

export interface EpicStoreProductMeta {
  title?: string;
  wideImage?: string;
  posterImage?: string;
  description?: string;
  seller?: string;
  screenshots?: Array<{ id: number; path_thumbnail: string; path_full: string }>;
}

const epicGraphQLCache = new Map<string, EpicStoreProductMeta | null>();

/**
 * Queries Epic Games Store's official public GraphQL search for any game title or slug.
 * Works natively and through same-origin proxy on Web.
 */
export async function queryEpicGraphQLStore(
  searchTerm: string,
  timeoutMs = 4500
): Promise<EpicStoreProductMeta | null> {
  if (!searchTerm) return null;
  const cleanKey = searchTerm.trim().toLowerCase();
  if (epicGraphQLCache.has(cleanKey)) {
    return epicGraphQLCache.get(cleanKey) || null;
  }

  try {
    const query = JSON.stringify({
      query: `query searchStoreQuery($keywords: String) {
        Catalog {
          searchStore(keywords: $keywords) {
            elements {
              title
              description
              seller { name }
              productSlug
              urlSlug
              keyImages { type url }
            }
          }
        }
      }`,
      variables: { keywords: searchTerm },
    });

    const targetUrl = 'https://store.epicgames.com/graphql';
    const resp = await fetchWithProxy(targetUrl, timeoutMs, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: query,
    });

    if (!resp.ok) {
      epicGraphQLCache.set(cleanKey, null);
      return null;
    }

    const json = await resp.json();
    const elements: any[] = json?.data?.Catalog?.searchStore?.elements || [];
    if (!elements || elements.length === 0) {
      epicGraphQLCache.set(cleanKey, null);
      return null;
    }

    // Rank elements by match relevance
    const cleanSearch = searchTerm.toLowerCase().replace(/[^a-z0-9]/g, '');
    const matched =
      elements.find((el: any) => {
        const elTitle = (el.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return elTitle === cleanSearch || elTitle.includes(cleanSearch) || cleanSearch.includes(elTitle);
      }) || elements[0];

    const keyImages: any[] = matched?.keyImages || [];
    const wide =
      keyImages.find(
        (k: any) =>
          k.type === 'OfferImageWide' ||
          k.type === 'DieselStoreFrontWide' ||
          k.type === 'DieselGameBoxWide' ||
          k.type === 'featuredMedia'
      )?.url ||
      keyImages.find((k: any) => k.type === 'Thumbnail')?.url ||
      keyImages[0]?.url;

    const poster =
      keyImages.find(
        (k: any) =>
          k.type === 'OfferImageTall' ||
          k.type === 'DieselStoreFrontTall' ||
          k.type === 'Thumbnail'
      )?.url || wide;

    const screenshots = keyImages
      .filter((k: any) => k.type === 'GalleryImage' && k.url)
      .map((k: any, idx: number) => ({
        id: idx + 1,
        path_thumbnail: k.url,
        path_full: k.url,
      }));

    const result: EpicStoreProductMeta = {
      title: matched?.title,
      description: matched?.description,
      seller: matched?.seller?.name,
      wideImage: wide,
      posterImage: poster,
      screenshots: screenshots.length > 0 ? screenshots : undefined,
    };

    epicGraphQLCache.set(cleanKey, result);
    return result;
  } catch (err) {
    epicGraphQLCache.set(cleanKey, null);
    return null;
  }
}

/**
 * Resolves an image from an Epic Games Store product slug URL via shared promotional catalogue
 * or official GraphQL store search.
 */
export async function fetchEpicSlugImage(url: string, title?: string): Promise<string | undefined> {
  try {
    const slug = extractEpicSlug(url);

    // 1. Check shared promotional catalogue first (in-memory cached, instant)
    if (slug) {
      const elements = await getEpicPromotionsCatalog();
      if (Array.isArray(elements) && elements.length > 0) {
        const cleanSlug = slug.toLowerCase().replace(/-[a-z0-9]{6}$/, '');
        const matched = elements.find((el: any) => {
          const ps = (el.productSlug || el.urlSlug || '').toLowerCase();
          return ps.includes(cleanSlug) || cleanSlug.includes(ps.substring(0, Math.min(ps.length, 15)));
        });

        if (matched) {
          const keyImages: any[] = matched.keyImages || [];
          const wide =
            keyImages.find(
              (img: any) =>
                img.type === 'OfferImageWide' ||
                img.type === 'DieselStoreFrontWide' ||
                img.type === 'DieselGameBoxWide' ||
                img.type === 'featuredMedia'
            ) ||
            keyImages.find((img: any) => img.type === 'Thumbnail' || img.type === 'OfferImageTall') ||
            keyImages[0];
          if (wide?.url) return wide.url;
        }
      }
    }

    // 2. Query Epic Games official GraphQL store search (works for ALL Epic titles!)
    const termsToTry: string[] = [];
    if (slug) {
      const cleanSlugWords = slug
        .replace(/-[a-z0-9]{6}$/, '')
        .replace(/-/g, ' ')
        .trim();
      if (cleanSlugWords) termsToTry.push(cleanSlugWords);
    }
    if (title) {
      const cleanTitle = title
        .replace(/^\[[^\]]+\]\s*/, '')
        .replace(/\([^)]+\)\s*/, '')
        .replace(/\b(?:giveaways?|free)\b/gi, '')
        .replace(/[\u2010-\u2015\u2212]/g, ' ')
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (cleanTitle && !termsToTry.includes(cleanTitle)) {
        termsToTry.push(cleanTitle);
      }
    }

    for (const term of termsToTry) {
      const meta = await queryEpicGraphQLStore(term);
      if (meta?.wideImage) {
        return meta.wideImage;
      }
    }
  } catch (e) {
    console.warn(`[imageResolver] Epic slug image fetch failed:`, e);
  }
  return undefined;
}

/**
 * Main export: resolves a cover image given the store URL or game title.
 * 
 * Resolution order:
 * 1. Direct Steam /app/{id} URL → CDN header.jpg
 * 2. Epic Games Store URL → Epic shared catalog or GraphQL store search
 * 3. og:image / twitter:image scrape from the page HTML
 */
export async function fetchImageFromUrl(url?: string, _title?: string, timeoutMs = 4000): Promise<string | undefined> {
  if (!url && !_title) return undefined;

  try {
    // 1. Steam direct URL — extract app ID from any steampowered.com URL
    if (url) {
      const steamMatch =
        url.match(/\/app\/(\d+)/i) ||
        url.match(/steampowered\.com.*?(\d{5,7})/);
      if (steamMatch) {
        const appId = steamMatch[1];
        const staticUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`;
        if (Platform.OS === 'web') {
          return staticUrl;
        }
        try {
          const testResp = await fetch(staticUrl, { method: 'HEAD' });
          if (testResp.status === 200) {
            return staticUrl;
          }
        } catch (err) {
          console.warn(`[imageResolver] Failed to HEAD check Steam static URL for ${appId}:`, err);
        }
      }
    }

    // 2. Epic Games Store slug URL or Epic title
    if ((url && url.toLowerCase().includes('epicgames.com')) || (_title && _title.toLowerCase().includes('epic'))) {
      const epicImg = await fetchEpicSlugImage(url || '', _title);
      if (epicImg) return epicImg;
    }

    // 3. Fetch page HTML and extract og:image / twitter:image with timeout
    if (url) {
      try {
        let fetchUrl = url;
        if (fetchUrl.toLowerCase().includes('reddit.com') && !fetchUrl.toLowerCase().includes('old.reddit.com')) {
          fetchUrl = fetchUrl.replace(/(www\.)?reddit\.com/i, 'old.reddit.com');
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const response = await (Platform.OS === 'web'
          ? fetchWithProxy(fetchUrl, timeoutMs)
          : fetch(fetchUrl, {
              signal: controller.signal,
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              },
            }));
        clearTimeout(timer);
        if (response.ok) {
          const html = await response.text();

          const ogMatch =
            html.match(/<meta\s+[^>]*property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
            html.match(/<meta\s+[^>]*content=["']([^"']+)["']\s+property=["']og:image["']/i) ||
            html.match(/<meta\s+[^>]*name=["']twitter:image["']\s+content=["']([^"']+)["']/i) ||
            html.match(/<meta\s+[^>]*content=["']([^"']+)["']\s+name=["']twitter:image["']/i);

          if (ogMatch && ogMatch[1]) {
            let imgUrl = ogMatch[1].trim().replace(/&amp;/g, '&');
            if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
            // Skip tiny placeholder images (favicon-size)
            if (!imgUrl.includes('favicon') && !imgUrl.endsWith('.ico')) {
              return imgUrl;
            }
          }
        }
      } catch {}
    }
  } catch (e) {
    console.warn(`[fetchImageFromUrl] Failed to resolve image for ${url}:`, e);
  }
  return undefined;
}
