import { resolveEpicMobileUrls } from './EpicMobileHelper';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Deal } from '../models/Deal';
import { classifyDeal } from './DealClassifier';
import { fetchWithProxy } from './redditService';
import { isDealExpired, getTimeLeft, parseDateToMs, determineClaimMethod, getCleanPlatform, extractDirectStoreUrl, classifyGiveawayHost, normalizeEpicEndDate, isThirdPartyTaskHost } from '../utils/dealUtils';

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

  // 2. Fetch from API (only query active giveaways to minimize payload size)
  let url = 'https://www.gamerpower.com/api/giveaways';
  const queryParams: string[] = ['status=active'];

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
  let data: any = null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000); // 12s timeout for reliable mobile networks

  try {
    let response: Response;
    if (Platform.OS === 'web') {
      try {
        // Direct browser fetch - GamerPower API natively includes Access-Control-Allow-Origin: *
        response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
          },
        });
      } catch (webDirectErr) {
        console.warn('[GamerPowerService] Direct web fetch failed, trying proxy fallback:', webDirectErr);
        response = await fetchWithProxy(url, 12000);
      }
    } else {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
    }
    clearTimeout(timer);
    if (!response.ok) {
      throw new Error(`GamerPower API request failed: status ${response.status}`);
    }
    data = await response.json();
  } catch (err) {
    clearTimeout(timer);
    console.warn('[GamerPowerService] Direct API fetch failed or timed out:', err);
    // Graceful fallback to existing cache even if expired
    try {
      const fallbackCached = await AsyncStorage.getItem(cacheKey);
      if (fallbackCached) {
        const { deals } = JSON.parse(fallbackCached);
        if (Array.isArray(deals) && deals.length > 0) {
          console.log(`[GamerPowerService] Serving ${deals.length} cached deals on fallback.`);
          return deals.slice(0, limit);
        }
      }
    } catch {}
  }

  if (!Array.isArray(data) || data.length === 0) {
    // If empty or invalid, try cache before giving up
    try {
      const fallbackCached = await AsyncStorage.getItem(cacheKey);
      if (fallbackCached) {
        const { deals } = JSON.parse(fallbackCached);
        if (Array.isArray(deals) && deals.length > 0) {
          return deals.slice(0, limit);
        }
      }
    } catch {}
    return [];
  }

  // 3. Map items to Deal schema
  const deals: Deal[] = data.map((item: any) => {
    const id = 'gp_' + item.id;
    const rawUrl = item.open_giveaway_url || item.open_giveaway || item.gamerpower_url || '';
    let realGiveawayUrl = rawUrl;
    const extractedStore = extractDirectStoreUrl(item.instructions || '', item.description || '', '');
    const realStoreUrl = extractedStore || (rawUrl.includes('store.steampowered') || rawUrl.includes('epicgames.com') || rawUrl.includes('gog.com') ? rawUrl : undefined);
    const hostInfo = classifyGiveawayHost(realGiveawayUrl);
    
    // Normalize platforms
    const rawPlats = item.platforms
      ? item.platforms.split(',').map((p: string) => p.trim())
      : ['PC'];

    const platformString = getCleanPlatform(rawPlats, item.title || '', item.instructions || '', realGiveawayUrl);
    const isTaskHost = isThirdPartyTaskHost(`${item.title} ${item.instructions} ${realGiveawayUrl} ${platformString}`);

    // Smart Type Classification
    const classification = classifyDeal(item.title, item.description || '', platformString, realGiveawayUrl);
    let finalType: Deal['type'] = 'full_game';

    // Map GamerPower native type to our enum
    const gpType = (item.type || '').toLowerCase();
    if (gpType === 'loot' || gpType === 'item' || gpType === 'other') {
      finalType = 'loot';
    } else if (gpType === 'beta' || gpType === 'early access') {
      finalType = 'beta';
    } else if (gpType === 'dlc') {
      finalType = 'dlc';
    } else {
      finalType = classification.type || 'full_game';
    }

    const claimMethod: Deal['claimMethod'] = isTaskHost
      ? 'tasks'
      : determineClaimMethod(item.instructions, item.title, item.platforms, realGiveawayUrl, id, 'gamerpower');

    // End Date parsing with fallback logic
    const isEpicDeal = !isTaskHost && (platformString.toLowerCase().includes('epic') || realGiveawayUrl.includes('epicgames.com'));
    const expiresAt = isEpicDeal
      ? normalizeEpicEndDate(item.end_date)
      : (parseGamerPowerDate(item.end_date) || undefined);
    
    const description = item.description || '';
    const instructions = item.instructions || '';

    // Clean title: remove trailing giveaway, key, and platform tags
    let cleanTitle = item.title
      .replace(/\s*\([^)]+\)\s*/g, ' ')
      .trim();
    cleanTitle = cleanTitle
      .replace(/\s+(?:Steam\s+Key|Steam|Key|Giveaway|Drop|Pack|Edition)\s*$/gi, '')
      .replace(/\s+(?:Steam\s+Key|Steam|Key|Giveaway|Drop|Pack|Edition)\s*$/gi, '')
      .trim();

    const epicMobile = resolveEpicMobileUrls(
      cleanTitle,
      realGiveawayUrl,
      `${item.instructions || ''} ${item.description || ''}`,
      platformString
    );
    const finalAndroidUrl = epicMobile?.androidUrl;
    const finalIosUrl = epicMobile?.iosUrl;
    if (epicMobile) {
      finalType = 'mobile_game';
      if (realGiveawayUrl.includes('gamerpower.com/open') || realGiveawayUrl.includes('store.epicgames.com/mobile')) {
        realGiveawayUrl = finalAndroidUrl || finalIosUrl || realGiveawayUrl;
      }
    }

    const mappedDeal: Deal = {
      id,
      title: cleanTitle,
      platform: epicMobile ? 'Epic Games' : platformString,
      type: finalType,
      claimMethod,
      androidUrl: finalAndroidUrl,
      iosUrl: finalIosUrl,
      image: item.image || item.thumbnail || undefined,
      url: realGiveawayUrl,
      giveawayUrl: realGiveawayUrl,
      storeUrl: realStoreUrl || (epicMobile ? realGiveawayUrl : undefined),
      isEntryRequired: isTaskHost,
      entrySiteLabel: isTaskHost ? platformString : undefined,
      author: undefined,
      description: `${description}\n\nInstructions:\n${instructions}`,
      aboutGame: description,
      instructions: instructions,
      originalPrice: item.worth !== 'N/A' ? item.worth : undefined,
      currentPrice: 'Free',
      expiresAt,
      expiryStatus: (item.status?.toLowerCase() === 'expired' || (expiresAt && parseDateToMs(expiresAt) < Date.now())) ? 'EXPIRED' : (expiresAt ? 'ACTIVE' : 'UNKNOWN'),
      createdAt: parseDateToMs(item.published_date),
      publishedAt: parseDateToMs(item.published_date),
      redditUrl: item.gamerpower_url || undefined,
      source: 'gamerpower',
      gamerPowerId: String(item.id),
      claimedUsers: typeof item.users === 'number' ? item.users : parseInt(item.users) || undefined,
      worth: item.worth !== 'N/A' ? item.worth : undefined,
      endDate: isEpicDeal ? expiresAt : (item.end_date !== 'N/A' ? item.end_date : null),
      platforms: rawPlats && rawPlats.length > 0 ? rawPlats : (isTaskHost ? [platformString] : ['PC']),
      releaseDate: undefined,
    };

    // Store isExpired and timeLeft
    mappedDeal.isExpired = item.status?.toLowerCase() === 'expired' || isDealExpired(mappedDeal);
    mappedDeal.timeLeft = getTimeLeft(mappedDeal.expiresAt || mappedDeal.endDate, mappedDeal.platform);
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
