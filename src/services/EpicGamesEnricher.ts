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
 * Fetches free game metadata directly from Epic Games Store's static promotions endpoint.
 */
export async function enrichEpicDeal(title: string): Promise<EpicEnrichedData | null> {
  try {
    const url = 'https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions';
    console.log(`[EpicGamesEnricher] Fetching Epic promotions feed for "${title}"...`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch promotions feed: status ${response.status}`);
    }

    const json = await response.json();
    const elements = json.data?.Catalog?.searchStore?.elements || [];
    
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
