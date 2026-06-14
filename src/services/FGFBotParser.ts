import { Deal } from '../models/Deal';
import { parseDateToMs } from '../utils/dealUtils';

export interface ParsedBotData {
  title: string | null;
  price: string | null;
  originalPrice: string | null;
  expiresAt: string | null; // ISO Timestamp
  releaseDate: string | null;
  developer: string | null;
  genres: string[];
  achievements: number | null;
  tradingCards: number | null;
  reviewScore: string | null;
  steamDbRating: string | null;
  aboutGame: string | null;    // Free-text game description from bot comment header
  instructions: string | null; // Giveaway instructions from bot comment giveaway section
  parserConfidence: number;
  isFullyFree: boolean | null; // Flag to indicate if the deal is 100% off
  storeUrl: string | null;     // Direct Steam/GOG store page URL from bot navigation line
}

/**
 * Extracts the game/giveaway title from the FGF_Info_Bot comment using a priority sequence:
 * 1. First standalone game title line
 * 2. Store Page heading title
 * 3. Bold title match
 * 4. Fallback extraction
 */
function findNavigationLineIndex(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lower = line.toLowerCase();
    if (line.includes('|') && 
        lower.includes('store page') && 
        !lower.includes('i am a bot') && 
        !lower.startsWith('reviews:') && 
        !lower.startsWith('gog reviews:') && 
        !lower.startsWith('steam reviews:')) {
      return i;
    }
  }
  return -1;
}

function findGiveawayStartIndex(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase().replace(/\*/g, '');
    if (
      lower.startsWith('giveaway details') ||
      lower.startsWith('required accounts:') ||
      lower.startsWith('tasks:') ||
      lower.startsWith('links:')
    ) {
      return i;
    }
  }
  return -1;
}

function extractTitleFromNavigation(lines: string[]): string | null {
  const navIndex = findNavigationLineIndex(lines);
  if (navIndex > 0) {
    for (let i = navIndex - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.length > 0) {
        const cleanVal = line.replace(/\*\*|#|__|`/g, '').trim();
        return cleanVal;
      }
    }
  }
  return null;
}

/**
 * Extracts the game/giveaway title from the FGF_Info_Bot comment using a priority sequence:
 * 1. Title extracted relative to the navigation line (if present)
 * 2. First standalone game title line
 * 3. Store Page heading title
 * 4. Bold title match
 * 5. Fallback extraction
 */
export function extractTitleFromLines(lines: string[]): string | null {
  const cleanLines = lines.map(line => line.trim()).filter(l => l.length > 0);
  if (cleanLines.length === 0) return null;

  // Try using the navigation line index first (most robust)
  const navTitle = extractTitleFromNavigation(cleanLines);
  if (navTitle) {
    return navTitle;
  }

  const isLabelOrSignature = (line: string) => {
    const lower = line.replace(/\*/g, '').toLowerCase();
    return (
      lower.startsWith('price:') ||
      lower.startsWith('developer:') ||
      lower.startsWith('developers:') ||
      lower.startsWith('release date:') ||
      lower.startsWith('genre/tags:') ||
      lower.startsWith('reviews:') ||
      lower.startsWith('steamdb rating:') ||
      lower.includes('has ') ||
      lower.includes('beep boop') ||
      lower.includes('i am a bot') ||
      lower.includes('giveaway details') ||
      lower.includes('required accounts:') ||
      lower.includes('tasks:') ||
      lower.includes('links:') ||
      lower.includes('store page') ||
      line.includes('|')
    );
  };

  // 1. First standalone game title line
  for (const line of cleanLines) {
    const cleanVal = line.replace(/\*\*|#|__|`/g, '').trim();
    if (cleanVal.length > 0 && cleanVal.length < 100 && !isLabelOrSignature(line)) {
      return cleanVal;
    }
  }

  // 2. Store Page heading title
  for (const line of cleanLines) {
    if (line.startsWith('#') || line.startsWith('##')) {
      const cleanVal = line.replace(/[#*`]/g, '').trim();
      if (cleanVal.length > 0 && cleanVal.length < 100 && !isLabelOrSignature(line)) {
        return cleanVal;
      }
    }
  }

  // 3. Bold title match
  for (const line of cleanLines) {
    const boldMatch = line.match(/\*\*(.*?)\*\*/);
    if (boldMatch && boldMatch[1]) {
      const cleanVal = boldMatch[1].replace(/[#*`]/g, '').trim();
      if (cleanVal.length > 0 && cleanVal.length < 100 && !isLabelOrSignature(line)) {
        return cleanVal;
      }
    }
  }

  // 4. Fallback extraction
  const firstLine = cleanLines[0].replace(/[#*`]/g, '').trim();
  return firstLine ? firstLine.substring(0, 100) : null;
}

/**
 * Backward compatible title extractor wrapping extractTitleFromLines
 */
export function extractTitle(botComment: string): string | null {
  const lines = botComment.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  return extractTitleFromLines(lines);
}

/**
 * Parses raw date string from the bot comment into an ISO 8601 string.
 * Handles:
 *   - "June 8, 18:45 UTC"        (no year, has time)
 *   - "June 8, 2026"             (year, no time)
 *   - "January 30, 2018"         (year, no time)
 *   - "June 8, 2026 at 18:45 UTC"(year + time)
 */
export function parseDateStringToIso(dateStr: string): string | null {
  try {
    let cleanStr = dateStr.trim();
    if (!cleanStr) return null;

    const currentYear = new Date().getFullYear();
    const MONTHS: Record<string, number> = {
      january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
      july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
    };

    // Pattern: "Month Day, HH:MM TZ" or "Month Day, HH:MM UTC" (no year, has time)
    // e.g. "June 8, 18:45 UTC"
    const noYearWithTime = cleanStr.match(
      /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{1,2}):(\d{2})\s*(UTC|utc)?$/i
    );
    if (noYearWithTime) {
      const [, monthStr, dayStr, hourStr, minStr] = noYearWithTime;
      const month = MONTHS[monthStr.toLowerCase()];
      if (month !== undefined) {
        const day   = parseInt(dayStr, 10);
        const hour  = parseInt(hourStr, 10);
        const min   = parseInt(minStr, 10);
        let year = currentYear;
        const candidate = new Date(Date.UTC(year, month, day, hour, min));
        // If the candidate is more than 30 days in the past, roll to next year
        if (candidate.getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000) {
          year = currentYear + 1;
        }
        const result = new Date(Date.UTC(year, month, day, hour, min));
        return result.toISOString();
      }
    }

    // Pattern: "Month Day, Year" (no time) e.g. "January 30, 2018"
    const monthDayYear = cleanStr.match(
      /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/i
    );
    if (monthDayYear) {
      const [, monthStr, dayStr, yearStr] = monthDayYear;
      const month = MONTHS[monthStr.toLowerCase()];
      if (month !== undefined) {
        const result = new Date(Date.UTC(
          parseInt(yearStr, 10),
          month,
          parseInt(dayStr, 10)
        ));
        return result.toISOString();
      }
    }

    // Pattern: "Month Day" (no year, no time) e.g. "June 8"
    const monthDay = cleanStr.match(/^([A-Za-z]+)\s+(\d{1,2})$/i);
    if (monthDay) {
      const [, monthStr, dayStr] = monthDay;
      const month = MONTHS[monthStr.toLowerCase()];
      if (month !== undefined) {
        let year = currentYear;
        const candidate = new Date(Date.UTC(year, month, parseInt(dayStr, 10)));
        if (candidate.getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000) {
          year = currentYear + 1;
        }
        return new Date(Date.UTC(year, month, parseInt(dayStr, 10))).toISOString();
      }
    }

    // Generic fallback via Date.parse (Hermes-safe: strip commas)
    if (!/\b\d{4}\b/.test(cleanStr)) {
      // No year — try appending current year before the time component
      // e.g. "June 8 18:45 UTC" -> handled above, but just in case
      cleanStr = `${cleanStr} ${currentYear}`;
    }
    const hermesSafeStr = cleanStr.replace(/,/g, '');
    const t = Date.parse(hermesSafeStr);
    if (!isNaN(t)) {
      const parsedDate = new Date(t);
      if (parsedDate.getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000) {
        parsedDate.setFullYear(currentYear + 1);
      }
      return parsedDate.toISOString();
    }
  } catch (e) {
    console.warn(`[FGFBotParser] Failed to parse date string "${dateStr}":`, e);
  }
  return null;
}

/**
 * Main parser that parses the comment line-by-line instead of greedy global matches
 */
// Lines that indicate a structured labeled field — used to detect the boundary between the
// free-text game description zone and the metadata zone.
const LABEL_LINE_PREFIXES = [
  'price:', 'release date:', 'developer:', 'developers:', 'genre/tags:',
  'reviews:', 'steamdb rating:', 'has ', 'giveaway details', 'required accounts:',
  'tasks:', 'links:', 'store page', 'gog reviews:', 'steam reviews:',
  'gog features:', 'steam features:', 'features:',
];

function isStructuredLabelLine(line: string): boolean {
  const lower = line.toLowerCase().replace(/\*/g, '');
  if (LABEL_LINE_PREFIXES.some(prefix => lower.startsWith(prefix))) {
    // Special check for 'has ' to avoid false positives on game description lines
    if (lower.startsWith('has ')) {
      return lower.includes('achievements') || lower.includes('trading cards') || lower.includes('cards');
    }
    return true;
  }
  return line.includes('|');
}

/**
 * Extracts the free-text game description from the bot comment.
 *
 * FGF_Info_Bot comment structure:
 *   Line 1: Game title
 *   Line 2: Store Page | Community Hub | SteamDB   (navigation — skip)
 *   Line 3: Reviews: ... (label — skip)
 *   Line 4: [DESCRIPTION TEXT — what we want]
 *   Line 5: Price: ...
 *   ...
 *
 * Strategy: scan lines starting AFTER the navigation line (if present).
 * Skip labeled metadata lines, reviews, navigation, and bot signature.
 * Collect everything else before the "Price:" line.
 */
function extractAboutGame(lines: string[]): string | null {
  const cleanLines = lines.map(line => line.trim());
  const navIndex = findNavigationLineIndex(cleanLines);

  const descLines: string[] = [];
  const startIndex = navIndex !== -1 ? navIndex + 1 : 0;
  let titleSkipped = navIndex !== -1;

  for (let i = startIndex; i < cleanLines.length; i++) {
    const trimmed = cleanLines[i];
    if (!trimmed) continue;

    // Stop collecting once we hit the Price: line
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('price:')) {
      break;
    }

    // Skip navigation/separator lines (contain | or are just punctuation)
    if (trimmed.includes('|')) continue;

    // Skip labeled metadata lines
    if (isStructuredLabelLine(trimmed)) continue;

    // Skip bot signature lines, bare URLs, and Steam/GOG cross-reference header lines
    const cleanLower = lower.replace(/^[#*_`]+/, '').trim();
    if (
      lower.includes('beep boop') ||
      lower.includes('i am a bot') ||
      cleanLower.startsWith('game with the same name on') ||
      /^https?:\/\//.test(trimmed)
    ) continue;

    // Skip the very first non-skipped line — that is the game title
    if (!titleSkipped) {
      titleSkipped = true;
      continue;
    }

    // Collect remaining lines — strip leading/trailing markdown
    const cleanLine = trimmed.replace(/^[#*_`]+/, '').replace(/[#*_`]+$/, '').trim();
    if (cleanLine.length > 0) {
      descLines.push(cleanLine);
    }
  }

  const result = descLines.join(' ').trim();
  return result.length > 0 ? result : null;
}

/**
 * Extracts giveaway instructions from the bot comment.
 * Looks for the giveaway section starting with Giveaway details / Required accounts / Tasks.
 */
function extractInstructions(lines: string[]): string | null {
  const cleanLines = lines.map(line => line.trim());
  const navIndex = findNavigationLineIndex(cleanLines);
  const giveawayStartIndex = findGiveawayStartIndex(cleanLines);

  if (giveawayStartIndex === -1) {
    return null;
  }

  const isGiveawayAtTop = navIndex !== -1 && giveawayStartIndex < navIndex;
  const instrLines: string[] = [];

  for (let i = giveawayStartIndex; i < cleanLines.length; i++) {
    const trimmed = cleanLines[i];
    if (!trimmed) continue;

    const lower = trimmed.toLowerCase().replace(/\*/g, '');

    // Stop if giveaway is at the top and we reached the game title/navigation
    if (isGiveawayAtTop && navIndex !== -1 && i >= navIndex - 1) {
      break;
    }

    // Stop at bot signature
    if (lower.includes('beep boop') || lower.includes('i am a bot')) {
      break;
    }

    // Strip markdown and collect
    const cleanLine = trimmed.replace(/^[#*_`]+/, '').replace(/[#*_`]+$/, '').trim();
    if (cleanLine.length > 0) {
      instrLines.push(cleanLine);
    }
  }

  const result = instrLines.join('\n').trim();
  return result.length > 0 ? result : null;
}

export function parseBotComment(botComment: string): ParsedBotData {
  let matchedFields = 0;
  const totalFields = 10; // title, price, originalPrice, expiresAt, releaseDate, developer, genres, achievements, tradingCards, reviewScore/steamDbRating

  // Clean markdown asterisks to make parsing robust
  const cleanComment = botComment.replace(/\*/g, '');
  const lines = cleanComment.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);

  // 1. Title (Use raw comment split to preserve bold check priorities)
  const title = extractTitleFromLines(botComment.split(/\r?\n/));
  if (title) matchedFields++;

  // 2. About the game (free-text block before structured labels)
  const aboutGame = extractAboutGame(lines);

  // 3. Giveaway instructions
  const instructions = extractInstructions(lines);

  // 3b. Extract store URL from pipe-separated navigation line
  // FGF_Info_Bot includes a line like: "Store Page | Community Hub | SteamDB"
  // The actual links are in the raw (non-stripped) comment as markdown: [Store Page](https://store.steampowered.com/app/...)
  let storeUrl: string | null = null;
  const storeUrlMatch = botComment.match(/\[(?:Store Page|store page)[^\]]*\]\(([^)]+)\)/i) ||
                         botComment.match(/(https?:\/\/store\.steampowered\.com\/app\/\d+[^\s)"']*)/i) ||
                         botComment.match(/(https?:\/\/www\.gog\.com\/[^\s)"']*game[^\s)"']*)/i);
  if (storeUrlMatch) {
    storeUrl = storeUrlMatch[1].trim();
  }

  // Parse fields line-by-line
  let originalPrice: string | null = null;
  let currentPrice: string | null = null;
  let expiresAt: string | null = null;
  let releaseDate: string | null = null;
  let developer: string | null = null;
  let genres: string[] = [];
  let achievements: number | null = null;
  let tradingCards: number | null = null;
  let reviewScore: string | null = null;
  let steamDbRating: string | null = null;
  let isFullyFree: boolean | null = null;

  // Logging variables
  let priceLine: string | null = null;
  let expiryMatch: any = null;
  let expiryText: string | null = null;
  let releaseDateMatch: any = null;

  for (const line of lines) {
    const lowerLine = line.toLowerCase();

    // A. Price & Expiry
    if (lowerLine.startsWith('price:')) {
      priceLine = line;
      const priceText = line.substring(6).trim();

      // Original price extraction (e.g. $19.99)
      const origMatch = priceText.match(/(~\s*)?(\$[0-9.]+)/i);
      if (origMatch) {
        originalPrice = origMatch[2].trim();
        matchedFields++;
      }

      // Current price check (usually Free)
      if (priceText.toLowerCase().includes('free')) {
        currentPrice = 'Free';
        matchedFields++;
      }



      // Expiry date — ONLY extract if deal is 100% off.
      // Reddit/FGF Bot may use: -100%, −100% (U+2212), –100% (en-dash), or just "Free"
      // We normalise the price text before checking.
      const normalisedPrice = priceText
        .replace(/\u2212/g, '-')   // Unicode minus sign → ASCII hyphen
        .replace(/\u2013/g, '-')   // En-dash → ASCII hyphen
        .replace(/\u2014/g, '-');  // Em-dash → ASCII hyphen

      const priceIsFullyFree =
        normalisedPrice.includes('-100%') ||
        normalisedPrice.toLowerCase().includes('free (-100') ||
        // Some posts format as "(Free)" with no percentage
        /\(\s*free\s*\)/i.test(normalisedPrice);

      isFullyFree = priceIsFullyFree;



      if (isFullyFree) {
        // Match "until DATE" anywhere in the price line (inside or outside parens)
        const untilMatch = normalisedPrice.match(/until\s+([^)]+)/i);
        if (untilMatch) {
          expiryMatch = untilMatch;
          expiryText = untilMatch[1].trim();
          expiresAt = parseDateStringToIso(expiryText);

          if (expiresAt) matchedFields++;
        }
      }
    }

    // B. Release Date
    if (lowerLine.startsWith('release date:')) {
      const releaseMatch = line.match(/Release\s*Date:\s*([^|*\r\n]+?)(?=(?:\s*(?:Developer|Developers|Genre\/Tags):)|$)/i);
      if (releaseMatch) {
        releaseDateMatch = releaseMatch;
        releaseDate = releaseMatch[1].trim();
        matchedFields++;
      }
    }

    // C. Developer / Developers
    if (lowerLine.startsWith('developer:') || lowerLine.startsWith('developers:')) {
      const devMatch = line.match(/(?:Developer|Developers):\s*([^\r\n]+)/i);
      if (devMatch) {
        developer = devMatch[1].trim();
        matchedFields++;
      }
    }

    // D. Genre/Tags
    if (lowerLine.startsWith('genre/tags:')) {
      const genreMatch = line.match(/Genre\/Tags:\s*([^\r\n]+)/i);
      if (genreMatch) {
        genres = genreMatch[1]
          .split(',')
          .map(g => g.trim())
          .filter(g => g.length > 0);
        if (genres.length > 0) matchedFields++;
      }
    }

    // E. Achievements
    if (lowerLine.includes('achievements')) {
      const achMatch = line.match(/Has\s+(\d+)\s+achievements/i);
      if (achMatch) {
        achievements = parseInt(achMatch[1], 10);
        matchedFields++;
      }
    }

    // F. Trading Cards
    if (lowerLine.includes('trading cards')) {
      const cardsMatch = line.match(/Has\s+(\d+)\s+trading\s+cards/i);
      if (cardsMatch) {
        tradingCards = parseInt(cardsMatch[1], 10);
        matchedFields++;
      }
    }

    // G. Review Score
    if (lowerLine.startsWith('reviews:') || lowerLine.startsWith('gog reviews:') || lowerLine.startsWith('steam reviews:')) {
      const reviewMatch = line.match(/(?:gog\s+|steam\s+)?reviews:\s*([^(|*\r\n]+)/i);
      if (reviewMatch) {
        reviewScore = reviewMatch[1].trim();
        matchedFields++;
      }
    }

    // H. SteamDB Rating
    if (lowerLine.startsWith('steamdb rating:')) {
      const steamDbMatch = line.match(/SteamDB Rating:\s*(\d+%)/i);
      if (steamDbMatch) {
        steamDbRating = steamDbMatch[1].trim();
        matchedFields++;
      }
    }
  }

  const expiryStatus = getExpiryStatus(expiresAt || undefined);

  const parserConfidence = matchedFields / totalFields;

  return {
    title,
    price: currentPrice,
    originalPrice,
    expiresAt,
    releaseDate,
    developer,
    genres,
    achievements,
    tradingCards,
    reviewScore,
    steamDbRating,
    aboutGame,
    instructions,
    parserConfidence,
    isFullyFree,
    storeUrl,
  };
}

/**
 * Computes deal expiry status based on expiresAt timestamp.
 */
export function getExpiryStatus(expiresAt?: string): Deal['expiryStatus'] {
  if (!expiresAt) return 'UNKNOWN';

  try {
    const expiryTime = parseDateToMs(expiresAt);
    if (isNaN(expiryTime)) return 'UNKNOWN';

    const timeDiff = expiryTime - Date.now();
    if (timeDiff < 0) {
      return 'EXPIRED';
    } else if (timeDiff <= 12 * 60 * 60 * 1000) { // 12 hours
      return 'EXPIRING_SOON';
    } else {
      return 'ACTIVE';
    }
  } catch {
    return 'UNKNOWN';
  }
}

/**
 * Extracts expiry date from post body (selftext) if present.
 */
export function parseExpiryFromPostBody(selftext?: string): string | null {
  if (!selftext) return null;

  // Look for patterns like "until June 15", "expires June 15", "ends June 15", "available until June 15"
  const patterns = [
    /until\s+([a-zA-Z]+\s+\d+(?:,\s+\d{4})?(?:\s+\d{2}:\d{2})?(?:\s+[a-zA-Z]+)?)/i,
    /expires\s+(?:on\s+)?([a-zA-Z]+\s+\d+(?:,\s+\d{4})?(?:\s+\d{2}:\d{2})?(?:\s+[a-zA-Z]+)?)/i,
    /ends\s+(?:on\s+)?([a-zA-Z]+\s+\d+(?:,\s+\d{4})?(?:\s+\d{2}:\d{2})?(?:\s+[a-zA-Z]+)?)/i,
  ];

  for (const pattern of patterns) {
    const match = selftext.match(pattern);
    if (match && match[1]) {
      const parsed = parseDateStringToIso(match[1]);
      if (parsed) return parsed;
    }
  }

  return null;
}

/**
 * Checks if the Reddit post indicates a 100% off deal (fully free).
 */
export function checkIsFullyFree(title: string, description?: string): boolean {
  const text = `${title} ${description || ''}`.toLowerCase();
  
  // Look for partial discount indicators like "50% off", "80% off", etc.
  // but allow "100% off" or "100% free" or simply "free"
  const pctMatches = text.match(/\d+%\s*(?:off|discount)/g) || text.match(/-\s*\d+%/g);
  if (pctMatches) {
    const has100 = pctMatches.some(m => m.includes('100'));
    if (!has100) {
      // Contains partial discounts, e.g. "80% off"
      return false;
    }
  }

  return true;
}

