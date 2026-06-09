import { RedditPost } from './redditService';
import { Deal } from '../models/Deal';
import { expiredFeedService } from './ExpiredFeedService';
import { tasksFeedService } from './TasksFeedService';
import { parseExpiryFromPostBody, getExpiryStatus, checkIsFullyFree } from './FGFBotParser';

export function classifyDeal(title: string, description: string): {
  type: Deal['type'];
  claimMethod: Deal['claimMethod'];
} {
  const text = `${title} ${description}`.toLowerCase();

  // 1. Detect Type
  let type: Deal['type'] = 'full_game';
  
  const dlcKeywords = ['dlc', 'expansion', 'add-on', 'addon', 'season pass'];
  const betaKeywords = ['beta', 'playtest', 'test build', 'alpha'];
  const itemKeywords = ['skin', 'weapon', 'mount', 'currency', 'coins', 'pack', 'in-game content'];

  if (dlcKeywords.some(kw => text.includes(kw))) {
    type = 'dlc';
  } else if (betaKeywords.some(kw => text.includes(kw))) {
    type = 'beta';
  } else if (itemKeywords.some(kw => text.includes(kw))) {
    type = 'item';
  } else {
    type = 'full_game';
  }

  // 2. Detect Claim Method
  let claimMethod: Deal['claimMethod'] = 'one_click';
  
  const taskKeywords = ['gleam', 'discord', 'follow', 'retweet', 'survey', 'watch stream', 'tasks', 'join group', 'complete', 'subscribe'];
  const oneClickKeywords = ['steam', 'epic', 'gog', 'claim now', 'free now', 'add to library', 'direct claim'];

  if (taskKeywords.some(kw => text.includes(kw))) {
    claimMethod = 'tasks';
  } else if (oneClickKeywords.some(kw => text.includes(kw))) {
    claimMethod = 'one_click';
  }

  return { type, claimMethod };
}

/**
 * Maps a RedditPost to a basic Deal object instantly.
 */
export function postToBasicDeal(post: RedditPost): Deal {
  const { type, claimMethod } = classifyDeal(post.title, post.selftext);
  const isExpiredFromFlair = expiredFeedService.isExpired(post.id);
  const isTaskFromFlair = tasksFeedService.isTask(post.id);
  const isFree = checkIsFullyFree(post.title, post.selftext);
  const postBodyExpiry = isFree ? (parseExpiryFromPostBody(post.selftext) || undefined) : undefined;

  return {
    id: post.id,
    title: post.cleanTitle || post.title,
    platform: post.platform,
    type,
    claimMethod: isTaskFromFlair ? 'tasks' : claimMethod,
    image: post.coverImage,
    url: post.url,
    author: post.author,
    description: post.selftext || undefined,
    expiresAt: postBodyExpiry,
    expiryStatus: isExpiredFromFlair ? 'EXPIRED' : (postBodyExpiry ? getExpiryStatus(postBodyExpiry) : undefined),
    isNsfw: post.isNsfw,
    createdAt: post.createdAt,
    redditUrl: post.permalink,
  };
}

