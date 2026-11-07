/**
 * Central configuration for Prime Gaming notice & link targets.
 */
export const PRIME_GAMING_CONFIG = {
  // Primary URL tested: loads with HTTP 200 without redirect
  PRIMARY_URL: 'https://luna.amazon.com/claims/home',
  // Fallback URL tested: HTTP 302 redirecting to luna.amazon.com/claims/home?g=s
  FALLBACK_URL: 'https://gaming.amazon.com/home',
};
