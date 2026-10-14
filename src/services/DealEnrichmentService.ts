import { Deal } from '../models/Deal';
import { getCachedDeal, saveCachedDeal } from './DealCache';
import { fetchBotComment } from './redditService';
import { parseBotComment, getExpiryStatus, parseExpiryFromPostBody, checkIsFullyFree } from './FGFBotParser';
import { expiredFeedService } from './ExpiredFeedService';
import { tasksFeedService } from './TasksFeedService';
import { enrichEpicDeal } from './EpicGamesEnricher';
import { enrichSteamDeal } from './SteamGamesEnricher';
import { fetchImageFromUrl } from '../utils/imageResolver';
import { getTimeLeft, resolveGamerPowerRedirect, determineClaimMethod, getGameCover, classifyGiveawayHost, extractSteamAppId, isValidArtworkUrl } from '../utils/dealUtils';

const MAX_CONCURRENT_ENRICHMENTS = 3;

class DealEnrichmentService {
  private queue: Array<{ deal: Deal; onUpdate: (deal: Deal) => void }> = [];
  private activeCount = 0;
  private processedIds = new Set<string>();
  private listeners = new Set<(deal: Deal) => void>();
  private batchListeners = new Set<(deals: Deal[]) => void>();
  private pendingBatch: Deal[] = [];
  private batchTimer: any = null;
  private dealCacheMap = new Map<string, Deal>();

  public subscribe(listener: (deal: Deal) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public subscribeBatch(listener: (deals: Deal[]) => void) {
    this.batchListeners.add(listener);
    return () => {
      this.batchListeners.delete(listener);
    };
  }

  public notify(deal: Deal) {
    this.dealCacheMap.set(deal.id, deal);
    this.listeners.forEach(l => l(deal));

    // Batch notifications every 150ms to prevent thrashing the React Native JS thread
    this.pendingBatch.push(deal);
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        const batch = [...this.pendingBatch];
        this.pendingBatch = [];
        this.batchTimer = null;
        if (batch.length > 0) {
          this.batchListeners.forEach(l => l(batch));
        }
      }, 150);
    }
  }

  public getEnrichedDeal(id: string): Deal | undefined {
    return this.dealCacheMap.get(id);
  }

  /**
   * Enqueues a list of deals for background enrichment.
   */
  public enrichDeals(deals: Deal[], onUpdate?: (deal: Deal) => void): void {
    for (const deal of deals) {
      if (this.processedIds.has(deal.id)) {
        const cached = this.dealCacheMap.get(deal.id);
        if (cached) {
          if (onUpdate) {
            onUpdate(cached);
          }
          this.notify(cached);
        }
        continue;
      }
      this.queue.push({ deal, onUpdate: onUpdate || (() => {}) });
    }
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.activeCount >= MAX_CONCURRENT_ENRICHMENTS || this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift();
    if (!item) return;

    this.activeCount++;
    this.processedIds.add(item.deal.id);

    try {
      await this.enrichSingleDeal(item.deal, item.onUpdate);
    } catch (err) {
      console.warn(`[DealEnrichmentService] Failed to enrich deal ${item.deal.id}:`, err);
    } finally {
      this.activeCount--;
      this.processQueue();
    }

    // Try processing next items in queue
    this.processQueue();
  }

  private async enrichSingleDeal(deal: Deal, onUpdate: (deal: Deal) => void): Promise<void> {
    // 1. Check local cache first
    const cached = await getCachedDeal(deal.id);
    if (cached && cached.image && cached.image !== 'placeholder') {
      const isExpiredFromFlair = expiredFeedService.isExpired(deal.id);
      const isTaskFromFlair = tasksFeedService.isTask(deal.id);
      // CRITICAL: Giveaway metadata takes strict priority.
      // A live giveaway image from GamerPower or Reddit must NEVER be overwritten by cached Steam artwork.
      const isLiveGiveawayImage = deal.image && deal.image !== 'placeholder' && isValidArtworkUrl(deal.image) && !deal.image.includes('steamstatic');
      const resolvedImage = isLiveGiveawayImage ? deal.image : (cached.image || deal.image);

      const cachedMerged = {
        ...deal,
        ...cached,
        image: resolvedImage,
        platform: deal.platform,
        type: deal.type,
        // ALWAYS keep deal.url as the primary giveaway link if valid external URL
        url: (deal.url && !deal.url.includes('reddit.com')) ? deal.url : (cached.url || deal.url),
        steamUrl: cached.steamUrl || deal.steamUrl || (cached.url?.includes('steampowered.com') ? cached.url : undefined),
        expiryStatus: isExpiredFromFlair ? 'EXPIRED' : cached.expiryStatus,
        claimMethod: isTaskFromFlair
          ? 'tasks'
          : determineClaimMethod(
              cached.instructions || deal.instructions || '',
              deal.title,
              deal.platform,
              (deal.url && !deal.url.includes('reddit.com')) ? deal.url : (cached.url || deal.url)
            ),
        // Always prefer live API values for mutable counters/dates so stale
        // DealCache (24 h TTL) never buries fresher GamerPower data.
        claimedUsers: deal.claimedUsers ?? cached.claimedUsers,
        worth:        deal.worth        ?? cached.worth,
        endDate:      deal.endDate      !== undefined ? deal.endDate      : cached.endDate,
        isExpired:    deal.isExpired    !== undefined ? deal.isExpired    : cached.isExpired,
      };
      cachedMerged.timeLeft = getTimeLeft(cachedMerged.expiresAt || cachedMerged.endDate);
      onUpdate(cachedMerged);
      this.notify(cachedMerged);
      return;
    }

    // If it's a GamerPower post, resolve redirect URL first, and enrich via Steam/Epic storefronts and/or Reddit comments RSS
    if (deal.id.startsWith('gp_')) {
      try {
        let resolvedUrl = deal.url;
        if (deal.url && deal.url.includes('gamerpower.com/open/')) {
          resolvedUrl = await resolveGamerPowerRedirect(deal.url);
        }

        let steamData: any = null;
        let epicData: any = null;

        const isSteam = (deal.platform || '').toLowerCase().includes('steam') || resolvedUrl.toLowerCase().includes('steampowered.com');
        if (isSteam || !deal.steamUrl) {
          steamData = await enrichSteamDeal(resolvedUrl, deal.title);
        }

        const isEpic = (deal.platform || '').toLowerCase().includes('epic') || resolvedUrl.toLowerCase().includes('epicgames.com');
        if (isEpic) {
          epicData = await enrichEpicDeal(deal.title, resolvedUrl || deal.url);
        }

        // Try to fetch bot comment from Reddit if merged
        let botResult = null;
        if (deal.redditUrl) {
          botResult = await fetchBotComment(deal.id, deal.title, deal.redditUrl);
        }

        const isExpiredFromFlair = expiredFeedService.isExpired(deal.id);
        const isTaskFromFlair = tasksFeedService.isTask(deal.id);

        let parsed: any = {};
        let finalExpiresAt = epicData?.expiresAt || deal.expiresAt;
        let botCommentRaw = '';

        if (botResult) {
          botCommentRaw = botResult.body;
          parsed = parseBotComment(botResult.body);
          if (parsed.isFullyFree === true) {
            finalExpiresAt = parsed.expiresAt || parseExpiryFromPostBody(deal.description) || finalExpiresAt;
          } else if (parsed.isFullyFree === false) {
            finalExpiresAt = undefined;
          } else {
            const isFree = checkIsFullyFree(deal.title, deal.description);
            if (isFree) {
              finalExpiresAt = parseExpiryFromPostBody(deal.description) || finalExpiresAt;
            }
          }
        }

        const realGiveawayUrl = (parsed.giveawayUrl)
          ? parsed.giveawayUrl
          : deal.giveawayUrl || (deal.url && !deal.url.includes('reddit.com') ? deal.url : undefined) || (resolvedUrl && !resolvedUrl.includes('reddit.com') ? resolvedUrl : undefined) || deal.url;
        const realStoreUrl = parsed.storeUrl || steamData?.steamUrl || epicData?.url || deal.storeUrl || deal.steamUrl;
        const hostInfo = classifyGiveawayHost(realGiveawayUrl);

        const isDirectSteamGiveaway = (realGiveawayUrl || '').toLowerCase().includes('steampowered.com');
        const isSteamExpired = isDirectSteamGiveaway && steamData?.isExpired === true;

        const enriched: Deal = {
          ...deal,
          url: realGiveawayUrl,
          giveawayUrl: realGiveawayUrl,
          storeUrl: realStoreUrl,
          isEntryRequired: false,
          entrySiteLabel: undefined,
          originalPrice: parsed.originalPrice || steamData?.originalPrice || deal.originalPrice,
          currentPrice: parsed.price || (isDirectSteamGiveaway ? steamData?.currentPrice : undefined) || deal.currentPrice || 'Free',
          expiresAt: finalExpiresAt,
          isExpired: isExpiredFromFlair || isSteamExpired || deal.isExpired || false,
          expiryStatus: (isExpiredFromFlair || isSteamExpired) ? 'EXPIRED' : (finalExpiresAt ? getExpiryStatus(finalExpiresAt) : (deal.expiryStatus || 'UNKNOWN')),
          claimMethod: isTaskFromFlair
            ? 'tasks'
            : determineClaimMethod(
                parsed.instructions || deal.instructions || '',
                deal.title,
                deal.platform,
                realGiveawayUrl
              ),
          developer: steamData?.developer || epicData?.developer || parsed.developer || deal.developer,
          image: (deal.image && deal.image !== 'placeholder' && isValidArtworkUrl(deal.image))
            ? deal.image
            : ((extractSteamAppId(deal.url || resolvedUrl) ? steamData?.image : undefined) || epicData?.image || steamData?.image || getGameCover(deal.id, deal.url, steamData?.steamUrl || deal.steamUrl) || deal.image),
          releaseDate: steamData?.releaseDate || parsed.releaseDate || deal.releaseDate,
          achievements: parsed.achievements !== null && parsed.achievements !== undefined ? parsed.achievements : deal.achievements,
          tradingCards: parsed.tradingCards !== null && parsed.tradingCards !== undefined ? parsed.tradingCards : deal.tradingCards,
          reviewScore: steamData?.reviewScore || parsed.reviewScore || deal.reviewScore,
          steamDbRating: steamData?.steamDbRating || parsed.steamDbRating || deal.steamDbRating,
          steamRatingPercent: steamData?.steamRatingPercent !== undefined ? steamData.steamRatingPercent : deal.steamRatingPercent,
          steamReviewCount: steamData?.steamReviewCount !== undefined ? steamData.steamReviewCount : deal.steamReviewCount,
          steamUrl: steamData?.steamUrl || parsed.storeUrl || (resolvedUrl.includes('steampowered.com') ? resolvedUrl : deal.steamUrl),
          timeLeft: getTimeLeft(finalExpiresAt || deal.endDate),
          isGame: steamData?.isGame !== undefined ? steamData.isGame : deal.isGame,
          type: deal.type,
        };

        await saveCachedDeal(deal.id, enriched, botCommentRaw);
        onUpdate(enriched);
        this.notify(enriched);
        return;
      } catch (err) {
        console.warn(`[DealEnrichmentService] GamerPower enrichment failed for ${deal.id}:`, err);
      }
    }

    // Check if it's an Epic Games deal (safe to enrich in background since it doesn't query Reddit)
    const isEpic = (deal.platform || '').toLowerCase().includes('epic') || (deal.url || '').toLowerCase().includes('epicgames.com');
    if (isEpic) {
      try {
        const epicData = await enrichEpicDeal(deal.title, deal.url);
        if (epicData) {
          const isExpiredFromFlair = expiredFeedService.isExpired(deal.id);
          const isTaskFromFlair = tasksFeedService.isTask(deal.id);
          const finalExpiresAt = epicData.expiresAt || deal.expiresAt;
          const enriched: Deal = {
            ...deal,
            expiresAt: finalExpiresAt,
            expiryStatus: isExpiredFromFlair ? 'EXPIRED' : (finalExpiresAt ? getExpiryStatus(finalExpiresAt) : (deal.expiryStatus || 'UNKNOWN')),
            claimMethod: isTaskFromFlair
              ? 'tasks'
              : determineClaimMethod(
                  deal.instructions || '',
                  deal.title,
                  deal.platform,
                  epicData.url || deal.url
                ),
            developer: epicData.developer || deal.developer,
            publisher: epicData.publisher || deal.publisher,
            aboutGame: epicData.description || deal.aboutGame,
            image: epicData.image || deal.image || 'placeholder',
            url: epicData.url || deal.url,
            timeLeft: getTimeLeft(finalExpiresAt || deal.endDate),
          };
          await saveCachedDeal(deal.id, enriched, '');
          onUpdate(enriched);
          this.notify(enriched);
          return;
        }
      } catch (err) {
        console.warn('[DealEnrichmentService] Epic background enrichment failed:', err);
      }
    }

    // Check if it's a Steam deal (safe to enrich in background since it queries Steam Storefront API directly)
    const isSteam = (deal.platform || '').toLowerCase().includes('steam') || (deal.url || '').toLowerCase().includes('steampowered.com');
    if (isSteam || !deal.steamUrl) {
      try {
        const steamData = await enrichSteamDeal(deal.url, deal.title);
        if (steamData) {
          const isExpiredFromFlair = expiredFeedService.isExpired(deal.id);
          const isTaskFromFlair = tasksFeedService.isTask(deal.id);
          // Keep deal.url as the original giveaway link unless it was already a direct Steam store link
          const isDirectSteamUrl = (deal.url || '').toLowerCase().includes('steampowered.com');
          // Only mark expired from Steam pricing if the deal was directly claiming on Steam store
          const isSteamExpired = isDirectSteamUrl && steamData.isExpired === true;
          const isThirdPartyHost = (deal.url || '').includes('gaming.lenovo.com') ||
                                   (deal.url || '').includes('alienwarearena.com') ||
                                   (deal.url || '').includes('gleam.io') ||
                                   (deal.url || '').includes('steelseries.com');
          const officialSteamCover = steamData.image || (steamData.steamUrl ? getGameCover(deal.id, deal.url, steamData.steamUrl) : undefined);

          const enriched: Deal = {
            ...deal,
            url: isDirectSteamUrl ? (steamData.resolvedStoreUrl || deal.url) : deal.url,
            isExpired: isExpiredFromFlair || isSteamExpired || deal.isExpired || false,
            expiryStatus: (isExpiredFromFlair || isSteamExpired) ? 'EXPIRED' : (deal.expiresAt ? getExpiryStatus(deal.expiresAt) : (deal.expiryStatus || 'UNKNOWN')),
            currentPrice: (isDirectSteamUrl ? steamData.currentPrice : undefined) || deal.currentPrice || 'Free',
            originalPrice: steamData.originalPrice || deal.originalPrice,
            claimMethod: isTaskFromFlair
              ? 'tasks'
              : determineClaimMethod(
                  deal.instructions || '',
                  deal.title,
                  deal.platform,
                  deal.url
                ),
            developer: steamData.developer || deal.developer,
            publisher: steamData.publisher || deal.publisher,
            aboutGame: steamData.description || deal.aboutGame,
            genres: steamData.genres || deal.genres,
            image: isThirdPartyHost
              ? (officialSteamCover || deal.image)
              : ((deal.image && deal.image !== 'placeholder' && isValidArtworkUrl(deal.image))
                  ? deal.image
                  : ((isDirectSteamUrl ? steamData.image : undefined) || officialSteamCover || deal.image)),
            releaseDate: steamData.releaseDate || deal.releaseDate,
            reviewScore: steamData.reviewScore || deal.reviewScore,
            steamDbRating: steamData.steamDbRating || deal.steamDbRating,
            steamRatingPercent: steamData.steamRatingPercent !== undefined ? steamData.steamRatingPercent : deal.steamRatingPercent,
            steamReviewCount: steamData.steamReviewCount !== undefined ? steamData.steamReviewCount : deal.steamReviewCount,
            steamUrl: steamData.steamUrl || steamData.resolvedStoreUrl || deal.steamUrl,
            timeLeft: getTimeLeft(deal.expiresAt || deal.endDate),
            isGame: steamData.isGame !== undefined ? steamData.isGame : deal.isGame,
            type: deal.type,
          };
          await saveCachedDeal(deal.id, enriched, '');
          onUpdate(enriched);
          this.notify(enriched);
          return;
        }
      } catch (err) {
        console.warn('[DealEnrichmentService] Steam background enrichment failed:', err);
      }
    }

    // For non-cached, non-Epic games, we do NOT perform background Reddit comments RSS fetch
    // to prevent rate-limiting. They will be enriched lazily when the user opens the DetailScreen.
  }

  /**
   * Enriches a deal by fetching comments RSS and saves the result in the shared DealCache.
   * This is used by the background prefetch queue.
   */
  public async enrichAndCache(deal: Deal): Promise<void> {
    // Resolve GamerPower redirect if necessary
    let resolvedUrl = deal.url;
    if (deal.url && deal.url.includes('gamerpower.com/open/')) {
      resolvedUrl = await resolveGamerPowerRedirect(deal.url);
    }

    // Check if it's an Epic Games deal
    const isEpic = (deal.platform || '').toLowerCase().includes('epic') || resolvedUrl.toLowerCase().includes('epicgames.com');
    let epicData: any = null;
    if (isEpic) {
      try {
        epicData = await enrichEpicDeal(deal.title);
      } catch (err) {
        console.warn('[DealEnrichmentService] Epic background enrichment failed:', err);
      }
    }

    // Check if it's a Steam deal
    const isSteam = (deal.platform || '').toLowerCase().includes('steam') || resolvedUrl.toLowerCase().includes('steampowered.com');
    let steamData: any = null;
    if (isSteam) {
      try {
        steamData = await enrichSteamDeal(resolvedUrl, deal.title);
      } catch (err) {
        console.warn('[DealEnrichmentService] Steam background enrichment failed:', err);
      }
    }

    const botResult = await fetchBotComment(deal.id, deal.title, deal.redditUrl);
    
    if (botResult) {
      const { body: botComment, storeUrl: botStoreUrl } = botResult;
      const parsed = parseBotComment(botComment);
      
      const isExpiredFromFlair = expiredFeedService.isExpired(deal.id);
      const isTaskFromFlair = tasksFeedService.isTask(deal.id);
      let expiresAt: string | undefined = undefined;
      if (parsed.isFullyFree === true) {
        expiresAt = parsed.expiresAt || parseExpiryFromPostBody(deal.description) || undefined;
      } else if (parsed.isFullyFree === false) {
        expiresAt = undefined;
      } else {
        const isFree = checkIsFullyFree(deal.title, deal.description);
        if (isFree) {
          expiresAt = parseExpiryFromPostBody(deal.description) || undefined;
        }
      }

      const finalExpiresAt = epicData?.expiresAt || expiresAt || deal.expiresAt;

      let resolvedImage = (deal.image && deal.image !== 'placeholder') ? deal.image : epicData?.image;
      if (!resolvedImage && botStoreUrl) {
        resolvedImage = await fetchImageFromUrl(botStoreUrl, deal.title);
      }
      if (!resolvedImage) {
        resolvedImage = await fetchImageFromUrl(resolvedUrl, deal.title);
      }

      const realGiveawayUrl = (parsed.giveawayUrl)
        ? parsed.giveawayUrl
        : deal.giveawayUrl || (deal.url && !deal.url.includes('reddit.com') ? deal.url : undefined) || (resolvedUrl && !resolvedUrl.includes('reddit.com') ? resolvedUrl : undefined) || deal.url;
      const realStoreUrl = parsed.storeUrl || steamData?.steamUrl || epicData?.url || deal.storeUrl || deal.steamUrl;
      const hostInfo = classifyGiveawayHost(realGiveawayUrl);

      const enriched: Deal = {
          ...deal,
          originalPrice: parsed.originalPrice || steamData?.originalPrice || deal.originalPrice || undefined,
          currentPrice: parsed.price || steamData?.currentPrice || deal.currentPrice || undefined,
          expiresAt: finalExpiresAt,
          isExpired: isExpiredFromFlair || steamData?.isExpired || deal.isExpired || false,
          expiryStatus: (isExpiredFromFlair || steamData?.isExpired) ? 'EXPIRED' : (finalExpiresAt ? getExpiryStatus(finalExpiresAt) : (deal.expiryStatus || 'UNKNOWN')),
          claimMethod: isTaskFromFlair
            ? 'tasks'
            : determineClaimMethod(
                parsed.instructions || undefined,
                deal.title,
                deal.platform,
                realGiveawayUrl
              ),
          developer: steamData?.developer || epicData?.developer || parsed.developer || deal.developer,
          publisher: deal.publisher,
          releaseDate: steamData?.releaseDate || parsed.releaseDate || deal.releaseDate || undefined,
          genres: steamData?.genres || (parsed.genres.length > 0 ? parsed.genres : (deal.genres || undefined)),
          achievements: parsed.achievements !== null ? parsed.achievements : (deal.achievements || undefined),
          tradingCards: parsed.tradingCards !== null ? parsed.tradingCards : (deal.tradingCards || undefined),
          reviewScore: parsed.reviewScore || steamData?.reviewScore || deal.reviewScore || undefined,
          steamDbRating: parsed.steamDbRating || steamData?.steamDbRating || deal.steamDbRating || undefined,
          steamRatingPercent: steamData?.steamRatingPercent !== undefined ? steamData.steamRatingPercent : deal.steamRatingPercent,
          steamReviewCount: steamData?.steamReviewCount !== undefined ? steamData.steamReviewCount : deal.steamReviewCount,
          steamUrl: steamData?.steamUrl || parsed.storeUrl || deal.steamUrl,
          storeUrl: realStoreUrl,
          giveawayUrl: realGiveawayUrl,
          isEntryRequired: false,
          entrySiteLabel: undefined,
          aboutGame: steamData?.description || epicData?.description || parsed.aboutGame || deal.aboutGame,
          instructions: parsed.instructions || undefined,
          parserConfidence: parsed.parserConfidence,
          image: (deal.image && deal.image !== 'placeholder' && isValidArtworkUrl(deal.image))
            ? deal.image
            : (epicData?.image || resolvedImage || steamData?.image || deal.image),
          url: realGiveawayUrl,
          timeLeft: getTimeLeft(finalExpiresAt || deal.endDate),
          isGame: steamData?.isGame !== undefined ? steamData.isGame : deal.isGame,
          type: deal.type,
        };

      await saveCachedDeal(deal.id, enriched, botComment);
      this.notify(enriched);
    } else {
      // If comments RSS fetch returns null, check post body and flairs before saving basic cache
      const isExpiredFromFlair = expiredFeedService.isExpired(deal.id);
      const isTaskFromFlair = tasksFeedService.isTask(deal.id);
      const isFree = checkIsFullyFree(deal.title, deal.description);
      const postBodyExpiry = isFree ? (parseExpiryFromPostBody(deal.description) || undefined) : undefined;
      
      const finalExpiresAt = epicData?.expiresAt || postBodyExpiry || deal.expiresAt;

      let resolvedImage = (deal.image && deal.image !== 'placeholder' && isValidArtworkUrl(deal.image))
        ? deal.image
        : (epicData?.image || steamData?.image || deal.image);
      if (!resolvedImage) {
        resolvedImage = await fetchImageFromUrl(resolvedUrl, deal.title);
      }

      const basicEnriched: Deal = {
        ...deal,
        expiresAt: finalExpiresAt,
        expiryStatus: isExpiredFromFlair ? 'EXPIRED' : (finalExpiresAt ? getExpiryStatus(finalExpiresAt) : (deal.expiryStatus || 'UNKNOWN')),
        claimMethod: isTaskFromFlair
          ? 'tasks'
          : determineClaimMethod(
              deal.instructions || '',
              deal.title,
              deal.platform,
              epicData?.url || resolvedUrl
            ),
        developer: steamData?.developer || epicData?.developer || deal.developer,
        aboutGame: steamData?.description || epicData?.description || deal.aboutGame,
        image: resolvedImage || 'placeholder',
        genres: steamData?.genres || deal.genres,
        releaseDate: steamData?.releaseDate || deal.releaseDate,
        url: (deal.url && !deal.url.includes('reddit.com')) ? deal.url : (epicData?.url || resolvedUrl || deal.url),
        steamUrl: steamData?.steamUrl || steamData?.resolvedStoreUrl || deal.steamUrl,
        timeLeft: getTimeLeft(finalExpiresAt || deal.endDate),
      };

      await saveCachedDeal(deal.id, basicEnriched, '');
      this.notify(basicEnriched);
    }
  }

  /**
   * Resets the processed set (e.g. for pull-to-refresh)
   */
  public reset(): void {
    this.processedIds.clear();
    this.queue = [];
    this.activeCount = 0;
  }
}

export const dealEnrichmentService = new DealEnrichmentService();
