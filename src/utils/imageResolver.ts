/**
 * Utility to resolve cover image URLs for games from their store links and title search.
 */

/**
 * Searches Steam store by title and returns the header CDN image URL for the best match.
 * Tries multiple cleaned variants of the title to maximise match rate.
 */
async function fetchSteamImageByTitle(title: string): Promise<string | undefined> {
  if (!title || title.trim().length < 2) return undefined;

  // Clean leading tags like "[Steam] (Game) Relaxing Simulator" -> "Relaxing Simulator"
  let cleanTitle = title
    .replace(/^\[[^\]]+\]\s*/g, '')
    .replace(/^\([^)]+\)\s*/g, '')
    .replace(/^\[[^\]]+\]\s*/g, '')
    .replace(/^\([^)]+\)\s*/g, '')
    .trim();

  // Build a list of progressively shorter title variants to try
  const variants: string[] = [];

  const addVariant = (t: string) => {
    const cleaned = t.replace(/\s+/g, ' ').trim();
    if (cleaned.length >= 2 && !variants.includes(cleaned)) {
      variants.push(cleaned);
    }
  };

  addVariant(cleanTitle);

  // Strip common suffixes: ": Chapters 1-3", "- Free Items", "(DLC)", etc.
  let stripped = title
    .replace(/:\s*chapters?\s*[\d\-–]+/gi, '')     // ": Chapters 1-3"
    .replace(/\s*[:\-–]\s*(free|dlc|items?|beta|alpha|pack|bundle|edition|update|patch)\b.*/gi, '')
    .replace(/\s*\([^)]*\)\s*$/, '')               // trailing parenthetical
    .replace(/\s*\[[^\]]*\]\s*$/, '')              // trailing bracket
    .trim();
  addVariant(stripped);

  // Also try splitting on " - " and taking the first part only
  const dashIdx = title.indexOf(' - ');
  if (dashIdx > 3) {
    addVariant(title.substring(0, dashIdx));
  }

  // Split on ":" and take the first part
  const colonIdx = title.indexOf(':');
  if (colonIdx > 3) {
    addVariant(title.substring(0, colonIdx));
  }

  // Try taking first 3 words (handles compound names)
  const words = stripped.split(' ').filter(Boolean);
  if (words.length > 3) {
    addVariant(words.slice(0, 3).join(' '));
  }
  if (words.length > 2) {
    addVariant(words.slice(0, 2).join(' '));
  }

  for (const variant of variants) {
    try {
      const encoded = encodeURIComponent(variant);
      const searchUrl = `https://store.steampowered.com/api/storesearch/?term=${encoded}&l=english&cc=US`;
      const resp = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      if (!resp.ok) continue;
      const json = await resp.json();
      const items: any[] = json?.items || [];
      if (items.length === 0) continue;

      // Prefer exact title match; fall back to first result
      const cleanVariant = variant.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
      const exactMatch = items.find((item: any) => {
        const itemName = (item.name || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
        return itemName === cleanVariant || itemName.startsWith(cleanVariant);
      });
      const best = exactMatch || items[0];
      if (best?.id) {
        const staticUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${best.id}/header.jpg`;
        try {
          const testResp = await fetch(staticUrl, { method: 'HEAD' });
          if (testResp.status === 200) {
            return staticUrl;
          }
          // If 404, fetch Steam store page and scrape the real og:image
          const pageUrl = `https://store.steampowered.com/app/${best.id}`;
          const pageResp = await fetch(pageUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
          });
          if (pageResp.ok) {
            const html = await pageResp.text();
            const ogMatch =
              html.match(/<meta\s+[^>]*property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
              html.match(/<meta\s+[^>]*content=["']([^"']+)["']\s+property=["']og:image["']/i);
            if (ogMatch && ogMatch[1]) {
              let imgUrl = ogMatch[1].trim().replace(/&amp;/g, '&');
              if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
              return imgUrl;
            }
          }
        } catch {}
        return staticUrl; // ultimate fallback
      }
    } catch (e) {
      // try next variant
    }
  }
  console.warn(`[imageResolver] Steam title search exhausted all variants for "${title}"`);
  return undefined;
}


/**
 * Resolves an image from an Epic Games Store product slug URL via their CDN.
 */
async function fetchEpicSlugImage(url: string): Promise<string | undefined> {
  try {
    // Extract slug from Epic URL, e.g. store.epicgames.com/p/wytchwood-android-cad0ea
    const slugMatch = url.match(/epicgames\.com\/p\/([^/?#]+)/i) ||
                      url.match(/epicgames\.com\/store\/[^/]+\/product\/([^/?#]+)/i);
    if (!slugMatch) return undefined;
    const slug = slugMatch[1];

    // Call Epic's catalog API to find the product metadata
    const apiUrl = `https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US&allowCountries=US`;
    const resp = await fetch(apiUrl);
    if (!resp.ok) return undefined;
    const data = await resp.json();
    const elements: any[] = data?.data?.Catalog?.searchStore?.elements || [];

    // Match by slug
    const cleanSlug = slug.toLowerCase().replace(/-[a-z0-9]{6}$/, ''); // strip trailing hash suffix
    const matched = elements.find((el: any) => {
      const ps = (el.productSlug || el.urlSlug || '').toLowerCase();
      return ps.includes(cleanSlug) || cleanSlug.includes(ps.substring(0, Math.min(ps.length, 15)));
    });

    if (matched) {
      const keyImages: any[] = matched.keyImages || [];
      const wide = keyImages.find((img: any) =>
        img.type === 'OfferImageWide' || img.type === 'DieselGameBoxWide' || img.type === 'featuredMedia'
      ) || keyImages.find((img: any) => img.type === 'Thumbnail') || keyImages[0];
      if (wide?.url) return wide.url;
    }
  } catch (e) {
    console.warn(`[imageResolver] Epic slug image fetch failed:`, e);
  }
  return undefined;
}

/**
 * Main export: resolves a cover image given the store URL and optionally the game title.
 * 
 * Resolution order:
 * 1. Direct Steam /app/{id} URL → CDN header.jpg (zero fetch)
 * 2. Epic Games Store URL → Epic catalog API
 * 3. og:image / twitter:image scrape from the page HTML
 * 4. Steam store search by title (best-effort fuzzy match)
 */
export async function fetchImageFromUrl(url: string, title?: string): Promise<string | undefined> {
  if (!url && !title) return undefined;

  try {
    if (url) {
      // 1. Steam direct URL — extract app ID from any steampowered.com URL
      const steamMatch = url.match(/\/app\/(\d+)/i) ||
                         url.match(/steampowered\.com.*?(\d{5,7})/);
      if (steamMatch) {
        const appId = steamMatch[1];
        const staticUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`;
        try {
          const testResp = await fetch(staticUrl, { method: 'HEAD' });
          if (testResp.status === 200) {
            return staticUrl;
          }
          console.log(`[imageResolver] Static Steam header returns ${testResp.status} for ${appId}. Falling back to page scrape.`);
        } catch (err) {
          console.warn(`[imageResolver] Failed to HEAD check Steam static URL for ${appId}:`, err);
        }
      }

      // 2. Epic Games Store slug URL
      if (url.toLowerCase().includes('epicgames.com')) {
        const epicImg = await fetchEpicSlugImage(url);
        if (epicImg) return epicImg;
      }

      // 3. Fetch page HTML and extract og:image / twitter:image
      try {
        let fetchUrl = url;
        if (fetchUrl.toLowerCase().includes('reddit.com') && !fetchUrl.toLowerCase().includes('old.reddit.com')) {
          fetchUrl = fetchUrl.replace(/(www\.)?reddit\.com/i, 'old.reddit.com');
        }
        const response = await fetch(fetchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });
        if (response.ok) {
          const html = await response.text();

          // Also check for Steam app links embedded in page redirects (only for non-Steam URLs)
          if (!url.toLowerCase().includes('steampowered.com')) {
            const embeddedSteamMatch = html.match(/steampowered\.com\/app\/(\d+)/i);
            if (embeddedSteamMatch) {
              const appId = embeddedSteamMatch[1];
              const embeddedStaticUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`;
              try {
                const testResp = await fetch(embeddedStaticUrl, { method: 'HEAD' });
                if (testResp.status === 200) {
                  return embeddedStaticUrl;
                }
              } catch {}
            }
          }

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
      } catch {
        // Page fetch failed — fall through to title search
      }
    }

    // 4. Title-based Steam store search (fallback for task/giveaway URLs)
    if (title) {
      const steamImg = await fetchSteamImageByTitle(title);
      if (steamImg) return steamImg;
    }
  } catch (e) {
    console.warn(`[fetchImageFromUrl] Failed to resolve image for ${url}:`, e);
  }
  return undefined;
}
