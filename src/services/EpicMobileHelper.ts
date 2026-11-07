/**
 * EpicMobileHelper.ts
 * Manages direct Android and iOS claim URLs for Epic Games Mobile giveaways,
 * bypassing generic landing pages like https://store.epicgames.com/mobile?lang=en-US.
 */

export const KNOWN_EPIC_MOBILE_GAMES: Record<string, { androidUrl: string; iosUrl: string }> = {
  'agent a': {
    androidUrl: 'https://store.epicgames.com/p/agent-a-a-puzzle-in-disguise-android-897342',
    iosUrl: 'https://store.epicgames.com/p/agent-a-a-puzzle-in-disguise-ios-d7a459',
  },
  'galaxy kart': {
    androidUrl: 'https://store.epicgames.com/p/galaxy-kart-android-135821',
    iosUrl: 'https://store.epicgames.com/p/galaxy-kart-ios-0cfcc7',
  },
};

export function resolveEpicMobileUrls(
  title?: string,
  url?: string,
  text?: string,
  platform?: string
): { androidUrl?: string; iosUrl?: string } | null {
  const t = (title || '').toLowerCase();
  const allText = `${title || ''} ${url || ''} ${text || ''} ${platform || ''}`;

  // 1. Check known mapped Epic Games Mobile titles
  for (const [key, urls] of Object.entries(KNOWN_EPIC_MOBILE_GAMES)) {
    if (t.includes(key)) {
      return urls;
    }
  }

  // 2. Extract direct Epic Games Store product slugs from text if present
  const epicAndroidMatch =
    allText.match(/https?:\/\/store\.epicgames\.com\/[^\s\)\>\]"']*-android-[a-z0-9]+/i) ||
    allText.match(/https?:\/\/store\.epicgames\.com\/[^\s\)\>\]"']*android[^\s\)\>\]"']*/i);
  const epicIosMatch =
    allText.match(/https?:\/\/store\.epicgames\.com\/[^\s\)\>\]"']*-ios-[a-z0-9]+/i) ||
    allText.match(/https?:\/\/store\.epicgames\.com\/[^\s\)\>\]"']*ios[^\s\)\>\]"']*/i);

  if (epicAndroidMatch || epicIosMatch) {
    return {
      androidUrl: epicAndroidMatch ? epicAndroidMatch[0] : undefined,
      iosUrl: epicIosMatch ? epicIosMatch[0] : undefined,
    };
  }

  // 3. Extract standard app store links (Google Play / Apple App Store)
  const androidMatch = allText.match(
    /https?:\/\/(?:play\.google\.com\/store\/apps\/details\?[^\s\)\>\]"']+|[^\s\)\>\]"']*(?:android|googleplay)[^\s\)\>\]"']*)/i
  );
  const iosMatch = allText.match(
    /https?:\/\/(?:apps\.apple\.com\/[^\s\)\>\]"']+|[^\s\)\>\]"']*(?:ios|appstore|apple)[^\s\)\>\]"']*)/i
  );

  if (androidMatch || iosMatch) {
    return {
      androidUrl: androidMatch ? androidMatch[0] : undefined,
      iosUrl: iosMatch ? iosMatch[0] : undefined,
    };
  }

  return null;
}

