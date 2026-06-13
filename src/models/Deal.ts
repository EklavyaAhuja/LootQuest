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
  parserConfidence?: number; // diagnostic metric
  isNsfw?: boolean;
  createdAt?: number; // Unix timestamp in milliseconds
  redditUrl?: string;
  source?: "reddit" | "gamerpower" | string;
  gamerPowerId?: string;
  claimedUsers?: number;
  worth?: string;
  endDate?: string | null;
  platforms?: string[];
  isExpired?: boolean;
  timeLeft?: string;
}

