export interface Deal {
  id: string;
  title: string;
  platform: string;
  type: "full_game" | "dlc" | "beta" | "item" | "mobile_game" | "loot";
  claimMethod: "one_click" | "tasks" | "unknown";
  image?: string;
  url: string;
  author?: string;
  description?: string;        // Raw Reddit post selftext
  aboutGame?: string;          // Parsed game description from FGF_Info_Bot comment
  instructions?: string;       // Parsed giveaway instructions from FGF_Info_Bot comment
  originalPrice?: string;
  currentPrice?: string;
  expiresAt?: string; // ISO 8601 Timestamp of expiry date/time
  expiryStatus?: "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "UNKNOWN";
  developer?: string;
  releaseDate?: string;
  genres?: string[];
  achievements?: number;
  tradingCards?: number;
  reviewScore?: string;
  steamDbRating?: string;
  steamRatingPercent?: number;
  steamReviewCount?: number;
  steamUrl?: string;
  parserConfidence?: number; // diagnostic metric
  isNsfw?: boolean;
  createdAt?: number; // Unix timestamp in milliseconds
  redditUrl?: string;
  source?: "reddit" | "gamerpower" | string;
  gamerPowerId?: string;
  claimedUsers?: number;
  worth?: string;
  endDate?: string | null;
  giveawayUrl?: string; // The real giveaway link (Gleam, Givee.club, store, etc.)
  storeUrl?: string;    // Steam / Epic / GOG store page used for metadata & Steam icon
  publisher?: string;
  isEntryRequired?: boolean;
  entrySiteLabel?: string;
  isExpired?: boolean;
  timeLeft?: string;
  platforms?: string[];
  isEstimated?: boolean;
  isGame?: boolean;
  resolvedImage?: string;
  resolvedPoster?: string;
  resolvedSource?: 'steam' | 'epic' | 'gamerpower' | 'reddit' | 'fallback';
  redditOriginalImage?: string;
  is18Plus?: boolean;
  steamAppId?: string;
  screenshots?: Array<{ id: number; path_thumbnail: string; path_full: string }>;
  bannerImage?: string;
  fullDescription?: string;
}

