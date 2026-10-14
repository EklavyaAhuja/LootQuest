import { RedditPost } from './redditService';
import { Deal } from '../models/Deal';
import { expiredFeedService } from './ExpiredFeedService';
import { tasksFeedService } from './TasksFeedService';
import { parseExpiryFromPostBody, getExpiryStatus, checkIsFullyFree } from './FGFBotParser';
import { isDealExpired, getTimeLeft, determineClaimMethod, getCleanPlatform, classifyGiveawayHost, getGameCover } from '../utils/dealUtils';

export function classifyDeal(title: string, description: string, platform?: string, url?: string, rawType?: string): {
  type: Deal['type'];
  claimMethod: Deal['claimMethod'];
} {
  const text = `${title} ${description} ${url || ''}`.toLowerCase();
  const plat = (platform || '').toLowerCase();
  const rawTypeLower = (rawType || '').toLowerCase().trim();

  // 1. Detect Type
  let type: Deal['type'] = 'full_game';
  
  const isMobile =
    plat.includes('android') ||
    plat.includes('ios') ||
    plat.includes('mobile') ||
    plat.includes('google play') ||
    plat.includes('app store') ||
    /\b(android|apk|google play|app store)\b/i.test(title);

  const titleLower = title.toLowerCase();

  // Explicit Reddit tags like [Steam] (Game) or [Epic] (DLC) have highest priority
  const hasGameTag =
    rawTypeLower === 'game' ||
    rawTypeLower === 'full_game' ||
    /\((?:game|full game)\)/i.test(title);

  const hasDlcTag =
    rawTypeLower === 'dlc' ||
    /\((?:dlc|expansion|add-on|addon)\)/i.test(title);

  const hasBetaTag =
    rawTypeLower === 'beta' ||
    rawTypeLower === 'alpha' ||
    rawTypeLower === 'playtest' ||
    /\((?:beta|alpha|playtest)\)/i.test(title);

  const hasItemTag =
    rawTypeLower === 'other' ||
    rawTypeLower === 'loot' ||
    rawTypeLower === 'item' ||
    /\((?:other|loot|item)\)/i.test(title);

  if (hasGameTag) {
    type = isMobile ? 'mobile_game' : 'full_game';
  } else if (hasDlcTag) {
    type = 'dlc';
  } else if (hasBetaTag) {
    type = 'beta';
  } else if (hasItemTag) {
    type = 'item';
  } else if (/\b(dlc|expansion|add-on|addon|season pass)\b/i.test(titleLower)) {
    // Only infer DLC from title keywords, NEVER from description/body
    type = 'dlc';
  } else if (/\b(closed beta|open beta|playtest|alpha test)\b/i.test(titleLower)) {
    type = 'beta';
  } else if (/\b(skin|in-game item|currency pack|starter pack)\b/i.test(titleLower)) {
    type = 'item';
  } else if (isMobile) {
    type = 'mobile_game';
  } else {
    type = 'full_game';
  }

  // 2. Detect Claim Method
  const claimMethod = determineClaimMethod(description, title, platform, url);
  
  return { type, claimMethod };
}

/**
 * Maps a RedditPost to a basic Deal object instantly.
 */
export function postToBasicDeal(post: RedditPost): Deal {
  const anyPost = post as any;
  const selftext = post.selftext || anyPost.description || '';
  const title = post.title || anyPost.title || '';
  const platform = post.platform || anyPost.platform || '';
  const url = post.url || anyPost.url || '';
  
  const { type, claimMethod } = classifyDeal(title, selftext, platform, url, post.type || anyPost.type);
  const flairText = (post.flair || anyPost.link_flair_text || anyPost.flair || '').toLowerCase();
  const isExpiredFromPost = post.isExpired === true || flairText.includes('expired') || flairText.includes('ended');
  const isExpiredFromFlair = isExpiredFromPost || expiredFeedService.isExpired(post.id) || expiredFeedService.isExpired(post);
  const isTaskFromFlair = tasksFeedService.isTask(post.id);
  const isFree = checkIsFullyFree(title, selftext);
  const postBodyExpiry = isFree ? (parseExpiryFromPostBody(selftext) || undefined) : undefined;

  const hostInfo = classifyGiveawayHost(url);

  const mappedDeal: Deal = {
    id: post.id,
    title: post.cleanTitle || title,
    platform: getCleanPlatform(platform, title, selftext, url),
    type,
    claimMethod: (isTaskFromFlair || post.isTask) ? 'tasks' : claimMethod,
    image: post.coverImage || anyPost.image || getGameCover(post.id, url, undefined, selftext),
    url: url,
    giveawayUrl: anyPost.giveawayUrl || url,
    storeUrl: anyPost.storeUrl || anyPost.steamUrl,
    isEntryRequired: false,
    entrySiteLabel: undefined,
    author: post.author || anyPost.author,
    description: selftext || undefined,
    expiresAt: postBodyExpiry || anyPost.expiresAt,
    expiryStatus: isExpiredFromFlair ? 'EXPIRED' : (postBodyExpiry ? getExpiryStatus(postBodyExpiry) : (anyPost.expiryStatus || undefined)),
    isExpired: isExpiredFromFlair || anyPost.isExpired || false,
    isNsfw: post.isNsfw || anyPost.isNsfw,
    createdAt: post.createdAt || anyPost.createdAt,
    redditUrl: post.permalink || anyPost.redditUrl,
    source: post.domain ? 'reddit' : (anyPost.source || 'reddit'),
    platforms: platform ? platform.split('/').map((p: string) => p.trim()) : (anyPost.platforms || []),
    releaseDate: post.createdAt || anyPost.createdAt
      ? new Date(post.createdAt || anyPost.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : (anyPost.releaseDate || "N/A"),
  };

  mappedDeal.isExpired = isExpiredFromFlair || isDealExpired(mappedDeal);
  mappedDeal.timeLeft = getTimeLeft(mappedDeal.expiresAt || mappedDeal.endDate || anyPost.endDate);
  
  if (mappedDeal.isExpired) {
    mappedDeal.expiryStatus = 'EXPIRED';
  }

  // Preserve enriched details if input is already a Deal or has them
  if (anyPost.releaseDate && anyPost.releaseDate !== 'N/A') mappedDeal.releaseDate = anyPost.releaseDate;
  if (anyPost.originalPrice !== undefined) mappedDeal.originalPrice = anyPost.originalPrice;
  if (anyPost.worth !== undefined) mappedDeal.worth = anyPost.worth;
  if (anyPost.currentPrice !== undefined) mappedDeal.currentPrice = anyPost.currentPrice;
  if (anyPost.developer !== undefined) mappedDeal.developer = anyPost.developer;
  if (anyPost.publisher !== undefined) mappedDeal.publisher = anyPost.publisher;
  if (anyPost.aboutGame !== undefined) mappedDeal.aboutGame = anyPost.aboutGame;
  if (anyPost.fullDescription !== undefined) mappedDeal.fullDescription = anyPost.fullDescription;
  if (anyPost.instructions !== undefined) mappedDeal.instructions = anyPost.instructions;
  if (anyPost.genres !== undefined) mappedDeal.genres = anyPost.genres;
  if (anyPost.achievements !== undefined) mappedDeal.achievements = anyPost.achievements;
  if (anyPost.tradingCards !== undefined) mappedDeal.tradingCards = anyPost.tradingCards;
  if (anyPost.reviewScore !== undefined) mappedDeal.reviewScore = anyPost.reviewScore;
  if (anyPost.steamDbRating !== undefined) mappedDeal.steamDbRating = anyPost.steamDbRating;
  if (anyPost.steamRatingPercent !== undefined) mappedDeal.steamRatingPercent = anyPost.steamRatingPercent;
  if (anyPost.steamReviewCount !== undefined) mappedDeal.steamReviewCount = anyPost.steamReviewCount;
  if (anyPost.steamAppId !== undefined) mappedDeal.steamAppId = anyPost.steamAppId;
  if (anyPost.steamUrl !== undefined) mappedDeal.steamUrl = anyPost.steamUrl;
  if (anyPost.storeUrl !== undefined) mappedDeal.storeUrl = anyPost.storeUrl;
  if (anyPost.giveawayUrl !== undefined) mappedDeal.giveawayUrl = anyPost.giveawayUrl;
  if (anyPost.screenshots && anyPost.screenshots.length > 0) mappedDeal.screenshots = anyPost.screenshots;
  if (anyPost.bannerImage) mappedDeal.bannerImage = anyPost.bannerImage;
  if (anyPost.resolvedImage) mappedDeal.resolvedImage = anyPost.resolvedImage;
  if (anyPost.resolvedPoster) mappedDeal.resolvedPoster = anyPost.resolvedPoster;
  if (anyPost.resolvedSource) mappedDeal.resolvedSource = anyPost.resolvedSource;

  return mappedDeal;
}

