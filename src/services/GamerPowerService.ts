import AsyncStorage from '@react-native-async-storage/async-storage';
import { Deal } from '../models/Deal';
import { classifyDeal } from './DealClassifier';
import { isDealExpired, getTimeLeft, parseDateToMs, determineClaimMethod, getCleanPlatform, extractDirectStoreUrl } from '../utils/dealUtils';

const CACHE_PREFIX = 'fgf_gp_cache_v6_';
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes TTL

function extractDomain(url: string): string {
  try {
    const matches = url.match(/^https?:\/\/([^/?#]+)(?:[/?#]|$)/i);
    return matches && matches[1] ? matches[1].replace('www.', '') : '';
  } catch (e) {
    return '';
  }
}

/**
 * Normalizes GamerPower's date strings ("YYYY-MM-DD HH:MM:SS") to ISO format.
 */
function parseGamerPowerDate(dateStr?: string): string | null {
  if (!dateStr || dateStr.trim() === '' || dateStr.toUpperCase() === 'N/A') {
    return null;
  }
  try {
    const cleanStr = dateStr.replace(' ', 'T');
    const isPlaceholder = /(?:23:59:00|23:59:59|00:00:00)$/.test(dateStr);
    if (isPlaceholder) {
      return cleanStr;
    }
    const cleanStrWithZ = cleanStr + 'Z';
    const d = new Date(cleanStrWithZ);
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}





/**
 * Fetches giveaways from GamerPower API, maps them to Deals, and caches the result.
 */
export async function fetchGamerPowerGiveaways(
  limit = 50,
  platform?: string,
  type?: string,
  forceRefresh = false
): Promise<Deal[]> {
  const cacheKey = `${CACHE_PREFIX}${platform || 'all'}_${type || 'all'}`;

  // 1. Try Cache First
  if (!forceRefresh) {
    try {
      const cachedData = await AsyncStorage.getItem(cacheKey);
      if (cachedData) {
        const { cachedAt, deals } = JSON.parse(cachedData);
        if (Date.now() - cachedAt < CACHE_TTL) {
          console.log(`[GamerPowerService] Loaded ${deals.length} deals from cache.`);
          return deals.slice(0, limit);
        }
      }
    } catch (err) {
      console.warn('[GamerPowerService] Cache read error:', err);
    }
  }

  // 2. Fetch from API
  let url = 'https://www.gamerpower.com/api/giveaways';
  const queryParams: string[] = [];

  if (platform) {
    queryParams.push(`platform=${encodeURIComponent(platform.toLowerCase())}`);
  }
  if (type) {
    queryParams.push(`type=${encodeURIComponent(type.toLowerCase())}`);
  }

  if (queryParams.length > 0) {
    url += '?' + queryParams.join('&');
  }

  console.log(`[GamerPowerService] Fetching from API: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GamerPower API request failed: status ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error('GamerPower API response is not an array');
  }

  // 3. Map items to Deal schema
  const deals: Deal[] = data.map((item: any) => {
    const id = 'gp_' + item.id;
    const rawUrl = item.open_giveaway_url || item.open_giveaway || item.gamerpower_url || '';
    const giveawayUrl = extractDirectStoreUrl(item.instructions || '', item.description || '', rawUrl);
    
    // Normalize platforms
    const rawPlats = item.platforms
      ? item.platforms.split(',').map((p: string) => p.trim())
      : ['PC'];

    const platformString = getCleanPlatform(rawPlats, item.title || '', item.instructions || '', giveawayUrl);

    // Smart Type Classification
    const classification = classifyDeal(item.title, item.description || '', platformString, giveawayUrl);
    let finalType: Deal['type'] = 'full_game';

    // Map GamerPower native type to our enum
    const gpType = (item.type || '').toLowerCase();
    if (gpType === 'loot' || gpType === 'item') {
      finalType = 'loot';
    } else if (gpType === 'beta') {
      finalType = 'beta';
    } else if (gpType === 'dlc') {
      finalType = 'dlc';
    } else {
      finalType = classification.type || 'full_game';
    }

    const claimMethod = determineClaimMethod(item.instructions || '', item.title || '', platformString, giveawayUrl);

    // End Date parsing with fallback logic
    const expiresAt = parseGamerPowerDate(item.end_date) || undefined;
    
    const description = item.description || '';
    const instructions = item.instructions || '';

    // Clean title
    const cleanTitle = item.title
      .replace(/\s*\([^)]+\)\s*/g, ' ')
      .replace(/\s+Giveaway\s*$/i, '')
      .replace(/\s+Key\s*$/i, '')
      .trim();

    const mappedDeal: Deal = {
      id,
      title: cleanTitle,
      platform: platformString,
      type: finalType,
      claimMethod,
      image: item.image || item.thumbnail || undefined,
      url: giveawayUrl,
      author: 'GamerPower',
      description: `${description}\n\nInstructions:\n${instructions}`,
      aboutGame: description,
      instructions: instructions,
      originalPrice: item.worth !== 'N/A' ? item.worth : undefined,
      currentPrice: 'Free',
      expiresAt,
      expiryStatus: (item.status?.toLowerCase() === 'expired' || (expiresAt && parseDateToMs(expiresAt) < Date.now())) ? 'EXPIRED' : (expiresAt ? 'ACTIVE' : 'UNKNOWN'),
      createdAt: parseDateToMs(item.published_date),
      redditUrl: item.gamerpower_url || undefined,
      source: 'gamerpower',
      gamerPowerId: String(item.id),
      claimedUsers: typeof item.users === 'number' ? item.users : parseInt(item.users) || undefined,
      worth: item.worth !== 'N/A' ? item.worth : undefined,
      endDate: item.end_date !== 'N/A' ? item.end_date : null,
      platforms: rawPlats,
      releaseDate: item.published_date 
        ? new Date(parseDateToMs(item.published_date)).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
        : "N/A",
    };

    // Store isExpired and timeLeft
    mappedDeal.isExpired = item.status?.toLowerCase() === 'expired' || isDealExpired(mappedDeal);
    mappedDeal.timeLeft = getTimeLeft(mappedDeal.expiresAt || mappedDeal.endDate);
    if (mappedDeal.isExpired) {
      mappedDeal.expiryStatus = 'EXPIRED';
    }

    return mappedDeal;
  });

  // 4. Save to cache
  try {
    const cacheEntry = {
      cachedAt: Date.now(),
      deals,
    };
    await AsyncStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
  } catch (err) {
    console.warn('[GamerPowerService] Cache save error:', err);
  }

  return deals.slice(0, limit);
}
