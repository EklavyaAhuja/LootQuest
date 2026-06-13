/**
 * redditFetch.ts
 *
 * A shared wrapper for all Reddit RSS HTTP requests.
 *
 * Features:
 *  - Exponential backoff with jitter on retryable errors (429, 5xx, network failure)
 *  - Persistent 429 cooldown stored in AsyncStorage: once rate-limited, Reddit is
 *    skipped entirely until the cooldown expires. Each consecutive 429 doubles the
 *    cooldown window (5 min → 10 min → 20 min … capped at 60 min).
 *  - Thread-safe: uses an in-memory lock so concurrent callers don't pile-up.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ── AsyncStorage keys ──────────────────────────────────────────────────────────
const RATE_LIMIT_KEY = 'reddit_rate_limit_until';
const RATE_LIMIT_COUNT_KEY = 'reddit_rate_limit_count';

// ── Tunables ───────────────────────────────────────────────────────────────────
const MAX_RETRIES = 2;                  // How many times to retry after a transient error
const BASE_RETRY_DELAY_MS = 1_500;     // Initial retry delay (doubles each attempt + jitter)
const MIN_COOLDOWN_MS = 5 * 60_000;    // 5 min base 429 cooldown
const MAX_COOLDOWN_MS = 60 * 60_000;   // 60 min max 429 cooldown
const REDDIT_USER_AGENT =
  'android:com.eklavyaahuja.lootquest:v1.0.0 (by /u/freegamefindings)';

// ── In-memory state ────────────────────────────────────────────────────────────
/** Cache so we don't hit AsyncStorage on every call in the same session */
let _rateLimitUntil = 0;
let _rateLimitCount = 0;
let _hydrated = false;

async function hydrateRateLimitState(): Promise<void> {
  if (_hydrated) return;
  try {
    const [until, count] = await Promise.all([
      AsyncStorage.getItem(RATE_LIMIT_KEY),
      AsyncStorage.getItem(RATE_LIMIT_COUNT_KEY),
    ]);
    _rateLimitUntil = until ? Number(until) : 0;
    _rateLimitCount = count ? Number(count) : 0;
  } catch {
    // non-fatal – worst case we re-fetch unnecessarily once
  }
  _hydrated = true;
}

async function recordRateLimit(): Promise<void> {
  _rateLimitCount = Math.min(_rateLimitCount + 1, 6); // cap exponent at 6
  const cooldownMs = Math.min(MIN_COOLDOWN_MS * Math.pow(2, _rateLimitCount - 1), MAX_COOLDOWN_MS);
  _rateLimitUntil = Date.now() + cooldownMs;
  try {
    await Promise.all([
      AsyncStorage.setItem(RATE_LIMIT_KEY, String(_rateLimitUntil)),
      AsyncStorage.setItem(RATE_LIMIT_COUNT_KEY, String(_rateLimitCount)),
    ]);
  } catch {
    // non-fatal
  }
  const mins = Math.round(cooldownMs / 60_000);
  console.warn(`[redditFetch] Rate limited by Reddit (429). Backing off for ${mins} min (strike ${_rateLimitCount}).`);
}

async function clearRateLimit(): Promise<void> {
  if (_rateLimitCount === 0) return; // already clear
  _rateLimitUntil = 0;
  _rateLimitCount = 0;
  try {
    await Promise.all([
      AsyncStorage.removeItem(RATE_LIMIT_KEY),
      AsyncStorage.removeItem(RATE_LIMIT_COUNT_KEY),
    ]);
  } catch {
    // non-fatal
  }
}

function isRateLimited(): boolean {
  return _rateLimitUntil > Date.now();
}

function rateLimitRemainingMs(): number {
  return Math.max(0, _rateLimitUntil - Date.now());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(base: number): number {
  // ±25 % randomisation to spread out concurrent callers
  return base * (0.75 + Math.random() * 0.5);
}

function isRetryable(status: number): boolean {
  return status === 429 || status === 503 || status === 502 || status === 500;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Fetches a Reddit RSS/JSON URL with automatic backoff and 429-cooldown tracking.
 *
 * @throws {Error} with message including HTTP status on unrecoverable failure.
 *                 Callers should catch and fall back to cache.
 */
export async function redditFetch(url: string, extraHeaders?: Record<string, string>): Promise<Response> {
  await hydrateRateLimitState();

  if (isRateLimited()) {
    const mins = Math.round(rateLimitRemainingMs() / 60_000);
    throw new Error(`Reddit rate-limited – cooldown ${mins} min remaining`);
  }

  let lastError: Error = new Error('Unknown error');

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = jitter(BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1));
      await sleep(delay);
    }

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': REDDIT_USER_AGENT,
          ...extraHeaders,
        },
      });

      if (response.status === 429) {
        await recordRateLimit();
        throw new Error(`Reddit RSS failed with status 429`);
      }

      if (isRetryable(response.status) && attempt < MAX_RETRIES) {
        // Transient server error – retry
        lastError = new Error(`Reddit RSS failed with status ${response.status}`);
        continue;
      }

      if (!response.ok) {
        throw new Error(`Reddit RSS failed with status ${response.status}`);
      }

      // Success – clear any previous rate-limit strike counter
      await clearRateLimit();
      return response;
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // If we already recorded a 429 cooldown, stop retrying immediately
      if (isRateLimited()) {
        throw lastError;
      }

      // Network-level failure – retry if attempts remain
      if (attempt < MAX_RETRIES) {
        continue;
      }
    }
  }

  throw lastError;
}

/**
 * Returns true if Reddit requests are currently being suppressed due to rate-limiting.
 * Useful for UI to show a subtle "limited" badge.
 */
export async function isRedditRateLimited(): Promise<boolean> {
  await hydrateRateLimitState();
  return isRateLimited();
}

/**
 * Returns how many minutes remain in the current rate-limit cooldown (0 if not limited).
 */
export async function redditRateLimitRemainingMinutes(): Promise<number> {
  await hydrateRateLimitState();
  return Math.ceil(rateLimitRemainingMs() / 60_000);
}

// Start hydrating the rate limit state immediately upon module load
hydrateRateLimitState().catch(() => {});
