export interface SteamEnrichedData {
  developer?: string;
  publisher?: string;
  description?: string;
  image?: string;
  genres?: string[];
  releaseDate?: string;
}

/**
 * Helper to extract Steam App ID from any store.steampowered.com URL.
 */
export function extractSteamAppId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/\/app\/(\d+)/i) || url.match(/steampowered\.com.*?(\d{5,7})/);
  return match ? match[1] : null;
}

/**
 * Fetches free game metadata directly from Steam Storefront API using the App ID.
 */
export async function enrichSteamDeal(url: string): Promise<SteamEnrichedData | null> {
  const appId = extractSteamAppId(url);
  if (!appId) return null;

  try {
    const apiUrl = `https://store.steampowered.com/api/appdetails?appids=${appId}`;
    console.log(`[SteamGamesEnricher] Fetching Steam promotions API for App ID "${appId}"...`);
    
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Steam API: status ${response.status}`);
    }

    const json = await response.json();
    if (json[appId] && json[appId].success) {
      const data = json[appId].data;
      const developers = data.developers || [];
      const publishers = data.publishers || [];
      const description = data.short_description || data.about_the_game || undefined;
      const image = data.header_image || undefined;
      const genres = data.genres ? data.genres.map((g: any) => g.description) : undefined;
      const releaseDate = data.release_date?.date || undefined;

      return {
        developer: developers[0] || undefined,
        publisher: publishers[0] || undefined,
        description,
        image,
        genres,
        releaseDate
      };
    }
  } catch (error) {
    console.warn(`[SteamGamesEnricher] Failed to enrich Steam deal for App ID ${appId}:`, error);
  }
  return null;
}
