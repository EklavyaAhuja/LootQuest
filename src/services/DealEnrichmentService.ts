import { Deal } from '../models/Deal';
import { getCachedDeal, saveCachedDeal } from './DealCache';
import { fetchBotComment } from './redditService';
import { parseBotComment, getExpiryStatus, parseExpiryFromPostBody, checkIsFullyFree } from './FGFBotParser';
import { expiredFeedService } from './ExpiredFeedService';
import { tasksFeedService } from './TasksFeedService';
import { enrichEpicDeal } from './EpicGamesEnricher';
import { fetchImageFromUrl } from '../utils/imageResolver';

const MAX_CONCURRENT_ENRICHMENTS = 3;

class DealEnrichmentService {
  private queue: Array<{ deal: Deal; onUpdate: (deal: Deal) => void }> = [];
  private activeCount = 0;
  private processedIds = new Set<string>();

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
      onUpdate({
        ...deal,
        ...cached,
        expiryStatus: isExpiredFromFlair ? 'EXPIRED' : cached.expiryStatus,
        claimMethod: isTaskFromFlair ? 'tasks' : (cached.claimMethod || deal.claimMethod)
      });
      return;
    }

    // Check if it's an Epic Games deal
    const isEpic = (deal.platform || '').toLowerCase().includes('epic') || (deal.url || '').toLowerCase().includes('epicgames.com');
    let epicData: any = null;
    if (isEpic) {
      epicData = await enrichEpicDeal(deal.title);
    }

    // 2. Fetch comments RSS
    const botResult = await fetchBotComment(deal.id, deal.title);
    
    if (botResult) {
      const { body: botComment, storeUrl: botStoreUrl } = botResult;

      // 3. Parse bot comment
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

      // Merge bot comment details and Epic metadata
      const finalExpiresAt = epicData?.expiresAt || expiresAt;

      // Image resolution priority:
      // 1. Epic enrichment image (highest quality)
      // 2. Already-resolved deal image
      // 3. Bot comment Store Page URL extracted from HTML <a href> (most reliable for Steam games)
      // 4. Fallback: URL/title-based resolver
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
        expiryStatus: isExpiredFromFlair ? 'EXPIRED' : (finalExpiresAt ? getExpiryStatus(finalExpiresAt) : 'UNKNOWN'),
        claimMethod: isTaskFromFlair ? 'tasks' : deal.claimMethod,
        developer: epicData?.developer || parsed.developer || undefined,
        releaseDate: parsed.releaseDate || undefined,
        genres: parsed.genres.length > 0 ? parsed.genres : undefined,
        achievements: parsed.achievements !== null ? parsed.achievements : undefined,
        tradingCards: parsed.tradingCards !== null ? parsed.tradingCards : undefined,
        reviewScore: parsed.reviewScore || undefined,
        steamDbRating: parsed.steamDbRating || undefined,
        aboutGame: epicData?.description || parsed.aboutGame || undefined,
        instructions: parsed.instructions || undefined,
        parserConfidence: parsed.parserConfidence,
        image: resolvedImage || 'placeholder',
        url: epicData?.url || deal.url,
      };



      // 4. Save to cache
      await saveCachedDeal(deal.id, enriched, botComment);

      // 5. Update UI
      onUpdate(enriched);
    } else {
      // If RSS comments fetch returns null (no bot comment available yet), 
      // we still check post body expiry and flair expiry before returning.
      const isExpiredFromFlair = expiredFeedService.isExpired(deal.id);
      const isTaskFromFlair = tasksFeedService.isTask(deal.id);
      const isFree = checkIsFullyFree(deal.title, deal.description);
      const postBodyExpiry = isFree ? (parseExpiryFromPostBody(deal.description) || undefined) : undefined;
      
      const finalExpiresAt = epicData?.expiresAt || postBodyExpiry;

      let resolvedImage = epicData?.image || deal.image;
      if (!resolvedImage) {
        resolvedImage = await fetchImageFromUrl(deal.url, deal.title);
      }

      const basicEnriched: Deal = {
        ...deal,
        expiresAt: finalExpiresAt,
        expiryStatus: isExpiredFromFlair ? 'EXPIRED' : (finalExpiresAt ? getExpiryStatus(finalExpiresAt) : 'UNKNOWN'),
        developer: epicData?.developer || undefined,
        aboutGame: epicData?.description || undefined,
        image: resolvedImage || 'placeholder',
        url: epicData?.url || deal.url,
        claimMethod: isTaskFromFlair ? 'tasks' : deal.claimMethod,
      };
      await saveCachedDeal(deal.id, basicEnriched, '');
      onUpdate(basicEnriched);
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
