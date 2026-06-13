import { Deal } from '../models/Deal';
import { getCachedDeal, saveCachedDeal } from './DealCache';
import { fetchBotComment } from './redditService';
import { parseBotComment, getExpiryStatus, parseExpiryFromPostBody, checkIsFullyFree } from './FGFBotParser';
import { expiredFeedService } from './ExpiredFeedService';
import { tasksFeedService } from './TasksFeedService';
import { enrichEpicDeal } from './EpicGamesEnricher';
import { fetchImageFromUrl } from '../utils/imageResolver';
import { getTimeLeft } from '../utils/dealUtils';

const MAX_CONCURRENT_ENRICHMENTS = 3;

class DealEnrichmentService {
  private queue: Array<{ deal: Deal; onUpdate: (deal: Deal) => void }> = [];
  private activeCount = 0;
  private processedIds = new Set<string>();
  private listeners = new Set<(deal: Deal) => void>();

  public subscribe(listener: (deal: Deal) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public notify(deal: Deal) {
    this.listeners.forEach(l => l(deal));
  }

  /**
   * Enqueues a list of deals for background enrichment.
   */
  public enrichDeals(deals: Deal[], onUpdate: (deal: Deal) => void): void {
    for (const deal of deals) {
      if (this.processedIds.has(deal.id)) continue;
      this.queue.push({ deal, onUpdate });
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
      const cachedMerged = {
        ...deal,
        ...cached,
        platform: deal.platform,
        expiryStatus: isExpiredFromFlair ? 'EXPIRED' : cached.expiryStatus,
        claimMethod: isTaskFromFlair ? 'tasks' : (cached.claimMethod || deal.claimMethod),
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

    // Check if it's an Epic Games deal (safe to enrich in background since it doesn't query Reddit)
    const isEpic = (deal.platform || '').toLowerCase().includes('epic') || (deal.url || '').toLowerCase().includes('epicgames.com');
    if (isEpic) {
      try {
        const epicData = await enrichEpicDeal(deal.title);
        if (epicData) {
          const isExpiredFromFlair = expiredFeedService.isExpired(deal.id);
          const isTaskFromFlair = tasksFeedService.isTask(deal.id);
          const finalExpiresAt = epicData.expiresAt || deal.expiresAt;
          const enriched: Deal = {
            ...deal,
            expiresAt: finalExpiresAt,
            expiryStatus: isExpiredFromFlair ? 'EXPIRED' : (finalExpiresAt ? getExpiryStatus(finalExpiresAt) : (deal.expiryStatus || 'UNKNOWN')),
            claimMethod: isTaskFromFlair ? 'tasks' : deal.claimMethod,
            developer: epicData.developer || deal.developer,
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

    // For non-cached, non-Epic games, we do NOT perform background Reddit comments RSS fetch
    // to prevent rate-limiting. They will be enriched lazily when the user opens the DetailScreen.
  }

  /**
   * Enriches a deal by fetching comments RSS and saves the result in the shared DealCache.
   * This is used by the background prefetch queue.
   */
  public async enrichAndCache(deal: Deal): Promise<void> {
    // Check if it's an Epic Games deal
    const isEpic = (deal.platform || '').toLowerCase().includes('epic') || (deal.url || '').toLowerCase().includes('epicgames.com');
    let epicData: any = null;
    if (isEpic) {
      try {
        epicData = await enrichEpicDeal(deal.title);
      } catch (err) {
        console.warn('[DealEnrichmentService] Epic background enrichment failed:', err);
      }
    }

    const botResult = await fetchBotComment(deal.id, deal.title);
    
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

      let resolvedImage = epicData?.image || deal.image;
      if (!resolvedImage && botStoreUrl) {
        resolvedImage = await fetchImageFromUrl(botStoreUrl, deal.title);
      }
      if (!resolvedImage) {
        resolvedImage = await fetchImageFromUrl(deal.url, deal.title);
      }

      const enriched: Deal = {
        ...deal,
        originalPrice: parsed.originalPrice || undefined,
        currentPrice: parsed.price || undefined,
        expiresAt: finalExpiresAt,
        expiryStatus: isExpiredFromFlair ? 'EXPIRED' : (finalExpiresAt ? getExpiryStatus(finalExpiresAt) : (deal.expiryStatus || 'UNKNOWN')),
        claimMethod: isTaskFromFlair ? 'tasks' : deal.claimMethod,
        developer: epicData?.developer || parsed.developer || deal.developer,
        releaseDate: parsed.releaseDate || deal.releaseDate || undefined,
        genres: parsed.genres.length > 0 ? parsed.genres : (deal.genres || undefined),
        achievements: parsed.achievements !== null ? parsed.achievements : (deal.achievements || undefined),
        tradingCards: parsed.tradingCards !== null ? parsed.tradingCards : (deal.tradingCards || undefined),
        reviewScore: parsed.reviewScore || deal.reviewScore || undefined,
        steamDbRating: parsed.steamDbRating || deal.steamDbRating || undefined,
        aboutGame: epicData?.description || parsed.aboutGame || deal.aboutGame,
        instructions: parsed.instructions || undefined,
        parserConfidence: parsed.parserConfidence,
        image: resolvedImage,
        url: epicData?.url || parsed.storeUrl || deal.url,
        timeLeft: getTimeLeft(finalExpiresAt || deal.endDate),
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

      let resolvedImage = epicData?.image || deal.image;
      if (!resolvedImage) {
        resolvedImage = await fetchImageFromUrl(deal.url, deal.title);
      }

      const basicEnriched: Deal = {
        ...deal,
        expiresAt: finalExpiresAt,
        expiryStatus: isExpiredFromFlair ? 'EXPIRED' : (finalExpiresAt ? getExpiryStatus(finalExpiresAt) : (deal.expiryStatus || 'UNKNOWN')),
        claimMethod: isTaskFromFlair ? 'tasks' : deal.claimMethod,
        developer: epicData?.developer || deal.developer,
        aboutGame: epicData?.description || deal.aboutGame,
        image: resolvedImage || 'placeholder',
        url: epicData?.url || deal.url,
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
