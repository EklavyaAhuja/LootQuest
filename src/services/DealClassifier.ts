import { RedditPost } from './redditService';
import { Deal } from '../models/Deal';
import { expiredFeedService } from './ExpiredFeedService';
import { tasksFeedService } from './TasksFeedService';
import { parseExpiryFromPostBody, getExpiryStatus, checkIsFullyFree } from './FGFBotParser';
import { isDealExpired, getTimeLeft, determineClaimMethod, getCleanPlatform } from '../utils/dealUtils';

export function classifyDeal(title: string, description: string, platform?: string, url?: string): {
  type: Deal['type'];
  claimMethod: Deal['claimMethod'];
} {
  const text = `${title} ${description} ${url || ''}`.toLowerCase();
  const plat = (platform || '').toLowerCase();

  // 1. Detect Type
  let type: Deal['type'] = 'full_game';
  
  const dlcKeywords = ['dlc', 'expansion', 'add-on', 'addon', 'season pass'];
  const betaKeywords = ['beta', 'playtest', 'test build', 'alpha'];
  const itemKeywords = ['skin', 'weapon', 'mount', 'currency', 'coins', 'pack', 'in-game content'];
  const mobileKeywords = ['android', 'ios', 'mobile', 'google play', 'app store', 'iphone', 'ipad', 'apk'];

  if (
    plat.includes('android') ||
    plat.includes('ios') ||
    plat.includes('mobile') ||
    plat.includes('google play') ||
    plat.includes('app store')
  ) {
    type = 'mobile_game';
  } else if (mobileKeywords.some(kw => text.includes(kw))) {
    type = 'mobile_game';
  } else if (dlcKeywords.some(kw => text.includes(kw))) {
    type = 'dlc';
  } else if (betaKeywords.some(kw => text.includes(kw))) {
    type = 'beta';
  } else if (itemKeywords.some(kw => text.includes(kw))) {
    type = 'item';
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
  
  const { type, claimMethod } = classifyDeal(title, selftext, platform, url);
  const isExpiredFromFlair = expiredFeedService.isExpired(post.id);
  const isTaskFromFlair = tasksFeedService.isTask(post.id);
  const isFree = checkIsFullyFree(title, selftext);
  const postBodyExpiry = isFree ? (parseExpiryFromPostBody(selftext) || undefined) : undefined;

  const mappedDeal: Deal = {
    id: post.id,
    title: post.cleanTitle || title,
    platform: getCleanPlatform(platform, title, selftext, url),
    type,
    claimMethod: (isTaskFromFlair || post.isTask) ? 'tasks' : claimMethod,
    image: post.coverImage || anyPost.image,
    url: url,
    author: post.author || anyPost.author,
    description: selftext || undefined,
    expiresAt: postBodyExpiry || anyPost.expiresAt,
    expiryStatus: isExpiredFromFlair ? 'EXPIRED' : (postBodyExpiry ? getExpiryStatus(postBodyExpiry) : (anyPost.expiryStatus || undefined)),
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
  if (anyPost.originalPrice !== undefined) mappedDeal.originalPrice = anyPost.originalPrice;
  if (anyPost.worth !== undefined) mappedDeal.worth = anyPost.worth;
  if (anyPost.currentPrice !== undefined) mappedDeal.currentPrice = anyPost.currentPrice;
  if (anyPost.developer !== undefined) mappedDeal.developer = anyPost.developer;
  if (anyPost.aboutGame !== undefined) mappedDeal.aboutGame = anyPost.aboutGame;
  if (anyPost.instructions !== undefined) mappedDeal.instructions = anyPost.instructions;
  if (anyPost.genres !== undefined) mappedDeal.genres = anyPost.genres;
  if (anyPost.achievements !== undefined) mappedDeal.achievements = anyPost.achievements;
  if (anyPost.tradingCards !== undefined) mappedDeal.tradingCards = anyPost.tradingCards;
  if (anyPost.reviewScore !== undefined) mappedDeal.reviewScore = anyPost.reviewScore;
  if (anyPost.steamDbRating !== undefined) mappedDeal.steamDbRating = anyPost.steamDbRating;

  return mappedDeal;
}

