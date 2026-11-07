import { resolveEpicMobileUrls } from '../services/EpicMobileHelper';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Share,
  Platform,
  StatusBar,
  Animated,
  Easing,
  Vibration,
  AccessibilityInfo,
  Modal,
  Dimensions,
  FlatList,
  BackHandler,
  AppState,
  AppStateStatus,
  InteractionManager,
  Linking,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { ContainedModal } from '../components/ContainedModal';
import { copyToClipboard } from '../utils/clipboard';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolation,
  runOnJS,
  withSpring,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, RADIUS } from '../theme/theme';
import { Deal } from '../models/Deal';
import { dealsStore } from '../services/dealsStore';
import {
  extractSteamAppId,
  parseDateToMs,
  getGiveawayHostName,
  cleanDisplayTitle,
  cleanGameDescription,
  isDealExpired,
  formatDisplayDate,
  isBogusGiveawayDate,
} from '../utils/dealUtils';
import { searchSteamAppId, enrichSteamDeal, fetchSteamSpyPlaytime, fetchExactStoreReleaseDate, getStoreIdentifier, storeReleaseDateCache } from '../services/SteamGamesEnricher';
import { extractEpicSlug } from '../services/EpicGamesEnricher';
import { getEpicPromotionsCatalog } from '../services/EpicPromotionsService';
import { fetchWithProxy } from '../services/redditService';
import { useAppClockSeconds } from '../services/appClock';
import * as WebBrowser from 'expo-web-browser';
import { PRIME_GAMING_CONFIG } from '../config/primeGaming';
import GameArtwork from '../components/GameArtwork';
import CountdownClock from '../components/CountdownClock';
import StoreIcon, { storeShortName } from '../components/StoreIcon';
import TypeBadge from '../components/TypeBadge';
import Price from '../components/Price';
import { useSafeAreaInsets, SafeAreaProvider } from '../utils/useSafeAreaInsets';
import { LinearGradient } from '../components/LinearGradient';
import Gate18PlusModal from '../components/Gate18PlusModal';
import ZoomableImage from '../components/ZoomableImage';
import NativeTrailerPlayer, { openTrailerWithFallback } from '../components/NativeTrailerPlayer';
import { hapticFeedback } from '../utils/haptics';
import { checkIsReduceMotionEnabled, subscribeToReduceMotion } from '../utils/motion';
import { useCardPressScale } from '../components/UnifiedCards';
import Svg, { Path } from 'react-native-svg';

const AnimatedPath = Animated.createAnimatedComponent(Path);

export function formatType(type?: string): string {
  const t = (type || 'full_game').toLowerCase();
  if (t === 'dlc') return 'DLC';
  if (t === 'beta') return 'Beta';
  if (t === 'loot' || t === 'item') return 'Loot';
  if (t === 'mobile_game' || t.includes('mobile')) return 'Mobile';
  return 'Game';
}

export function openExternalLink(url: string | undefined | null) {
  if (!url) return;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
  }

  WebBrowser.openBrowserAsync(url).catch(() => {
    Linking.openURL(url).catch(() => {});
  });
}

import {
  savePendingClaim,
  hasValidPendingClaim,
  removePendingClaim,
} from '../services/pendingClaimService';

let ExpoVideoModule: any = null;
try {
  ExpoVideoModule = require('expo-video');
} catch {
  ExpoVideoModule = null;
}

// In-memory cache for game release dates fetched from stores by exact store ID / slug
function getMetacriticColor(score: number): string {
  if (score >= 75) return '#34C759';
  if (score >= 50) return '#FFCC00';
  return '#FF3B30';
}

interface DetailScreenProps {
  deal: Deal;
  onClose: () => void;
  onClaimed?: (deal: Deal) => void;
}

export default function DetailScreen({ deal, onClose, onClaimed }: DetailScreenProps) {
  const isBundleNotice = Boolean(deal.isBundleNotice || deal.id === 'prime-gaming-notice');
  const [storeVersion, setStoreVersion] = useState(0);
  const [isClaimed, setIsClaimed] = useState(() => (isBundleNotice ? false : dealsStore.isClaimed(deal.id)));
  const [descExpanded, setDescExpanded] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [steamDescription, setSteamDescription] = useState<string | null>(() => deal.steamDescription || null);
  const [steamMetacritic, setSteamMetacritic] = useState<number | null>(() => (typeof deal.metacriticScore === 'number' && deal.metacriticScore > 0 ? deal.metacriticScore : null));
  const [gameMode, setGameMode] = useState<string | null>(() => deal.gameMode || (deal.gameModes && deal.gameModes[0]) || null);
  const [playtimeFormatted, setPlaytimeFormatted] = useState<string | null>(() => deal.playtimeFormatted || null);
  const [realReleaseDate, setRealReleaseDate] = useState<string | null>(() => {
    const storeId = getStoreIdentifier(deal);
    if (storeId && storeReleaseDateCache.has(storeId)) {
      return storeReleaseDateCache.get(storeId) || null;
    }
    if (deal.releaseDate && !isBogusGiveawayDate(deal.releaseDate, deal)) {
      return formatDisplayDate(deal.releaseDate);
    }
    return null;
  });
  const [isReduceMotion, setIsReduceMotion] = useState(false);
  const [show18Warning, setShow18Warning] = useState(
    () => !isBundleNotice && deal.is18Plus && !dealsStore.is18PlusRevealed(deal.id) && !dealsStore.getAlwaysShow18Plus()
  );
  const [showClaimPrompt, setShowClaimPrompt] = useState(false);
  const isClaimingRef = useRef(false);
  const isOpeningBrowserRef = useRef(false);
  const [undoToastVisible, setUndoToastVisible] = useState(false);
  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [nativeTrailerVisible, setNativeTrailerVisible] = useState(false);

  // Animations & Scroll state
  const scrollRef = useRef<any>(null);
  const popScale = useRef(new Animated.Value(1)).current;
  const floatY = useRef(new Animated.Value(0)).current;
  const floatOpacity = useRef(new Animated.Value(0)).current;
  const borderFlashAnim = useRef(new Animated.Value(0)).current;
  const reanimatedScrollY = useSharedValue(0);

  const [isHeroOffscreen, setIsHeroOffscreen] = useState(false);
  const isHeroOffscreenRef = useRef(false);

  const setHeroOffscreen = useCallback((offscreen: boolean) => {
    if (isHeroOffscreenRef.current !== offscreen) {
      isHeroOffscreenRef.current = offscreen;
      setIsHeroOffscreen(offscreen);
    }
  }, []);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      reanimatedScrollY.value = event.contentOffset.y;
      if (event.contentOffset.y >= 260) {
        runOnJS(setHeroOffscreen)(true);
      } else {
        runOnJS(setHeroOffscreen)(false);
      }
    },
  });

  // Left-edge swipe-back gesture: user can swipe from the left edge to dismiss
  const edgePanGesture = useMemo(() => {
    return Gesture.Pan()
      .activeOffsetX([10, 9999])
      .onEnd((e) => {
        'worklet';
        if (e.translationX > 60 || e.velocityX > 400) {
          runOnJS(onClose)();
        }
      });
  }, [onClose]);

  useEffect(() => {
    scrollRef.current?.scrollTo?.({ y: 0, animated: false });
    reanimatedScrollY.value = 0;
  }, [deal.id, reanimatedScrollY]);

  // Media state
  const [screenshots, setScreenshots] = useState<Array<{ id: number; path_thumbnail: string; path_full: string }>>([]);
  const [selectedScreenshotIndex, setSelectedScreenshotIndex] = useState<number | null>(null);
  const [isModalZoomed, setIsModalZoomed] = useState(false);
  const [webVideoActive, setWebVideoActive] = useState<boolean>(false);
  const [webVideoMuted, setWebVideoMuted] = useState<boolean>(true);
  const [webTrailerUnavailable, setWebTrailerUnavailable] = useState<boolean>(false);

  useEffect(() => {
    checkIsReduceMotionEnabled().then(setIsReduceMotion);
    return subscribeToReduceMotion(setIsReduceMotion);
  }, []);

  // Below-fold content mounted immediately so descriptions, media & specs are never blank
  const [heavyMounted, setHeavyMounted] = useState(true);

  // Claim moment self-drawing checkmark (350ms stroke-dashoffset) & unclaim 180ms fade-swap
  const checkmarkAnim = useRef(new Animated.Value(isClaimed ? 0 : 28)).current;
  const unclaimFadeAnim = useRef(new Animated.Value(1)).current;

  // Hero image scroll parallax on UI thread (0.5x scroll capped at 150; pull down elastic stretch 1 + overscroll/600 max 1.25)
  const heroAnimatedStyle = useAnimatedStyle(() => {
    if (isReduceMotion) {
      return { transform: [{ translateY: 0 }, { scale: 1 }] };
    }
    const translateY = interpolate(
      reanimatedScrollY.value,
      [0, 300],
      [0, 150],
      Extrapolation.CLAMP
    );
    const scale = interpolate(
      reanimatedScrollY.value,
      [-150, 0],
      [1.25, 1],
      Extrapolation.CLAMP
    );
    return {
      transform: [{ translateY }, { scale }],
    };
  });

  const stickyHeaderStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      reanimatedScrollY.value,
      [180, 240],
      [0, 1],
      Extrapolation.CLAMP
    );
    return {
      opacity,
      pointerEvents: opacity > 0.5 ? 'auto' : 'none',
    };
  });

  const floatingHeaderStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      reanimatedScrollY.value,
      [140, 200],
      [1, 0],
      Extrapolation.CLAMP
    );
    return {
      opacity,
      pointerEvents: opacity > 0.5 ? 'auto' : 'none',
    };
  });

  // Modal sheet slide-in 320ms bezier(0.22, 1, 0.36, 1) (Part 2 Item g)
  const sheetSpring = useRef(new Animated.Value(300)).current;
  const viewerSpring = useRef(new Animated.Value(200)).current;

  // Press feedback hooks for buttons (scale to 0.96 over 100ms, spring back to 1)
  const ctaBtnPress = useCardPressScale(isReduceMotion);
  const sheetPrimaryPress = useCardPressScale(isReduceMotion);
  const sheetSecondaryPress = useCardPressScale(isReduceMotion);

  useEffect(() => {
    if (showClaimPrompt) {
      if (isReduceMotion) {
        sheetSpring.setValue(0);
        return;
      }
      sheetSpring.setValue(300);
      Animated.timing(sheetSpring, {
        toValue: 0,
        duration: 320,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: true,
      }).start();
    }
  }, [showClaimPrompt, isReduceMotion, sheetSpring]);

  const prevScreenshotIndexRef = useRef<number | null>(null);
  useEffect(() => {
    const wasOpen = prevScreenshotIndexRef.current !== null;
    const isNowOpen = selectedScreenshotIndex !== null;
    prevScreenshotIndexRef.current = selectedScreenshotIndex;

    // Only spring on initial viewer entrance, never on horizontal swiping between images
    if (!wasOpen && isNowOpen) {
      if (isReduceMotion) {
        viewerSpring.setValue(0);
        return;
      }
      viewerSpring.setValue(200);
      Animated.spring(viewerSpring, {
        toValue: 0,
        friction: 8,
        tension: 130,
        useNativeDriver: true,
      }).start();
    }
  }, [selectedScreenshotIndex, isReduceMotion, viewerSpring]);

  // Subscribe to dealsStore for live updates to this deal
  useEffect(() => {
    if (isBundleNotice) return;
    setIsClaimed(dealsStore.isClaimed(deal.id));
    const unsub = dealsStore.subscribe(() => {
      setIsClaimed(dealsStore.isClaimed(deal.id));
      setStoreVersion((v) => v + 1);
    });
    return () => unsub();
  }, [deal.id, isBundleNotice]);

  // Read latest live version of deal from central store
  const currentDeal = useMemo(() => {
    if (isBundleNotice) {
      const notice = dealsStore.getPrimeNotice();
      if (notice) return notice.deal;
      return deal;
    }
    const fromActive = dealsStore.getActiveDeals().find((d) => d.id === deal.id);
    if (fromActive) return fromActive;
    const fromVault = dealsStore.getVaultItems('All').find((d) => d.id === deal.id);
    if (fromVault) return fromVault;
    return deal;
  }, [deal, storeVersion, isBundleNotice]);

  // 2c & 2d: Pending claim prompt listener on foreground return and screen mount (gated on heavyMounted)
  useEffect(() => {
    if (isBundleNotice || !heavyMounted) return;
    let isMounted = true;

    const checkAndShowPrompt = async () => {
      if (isClaimed || isBundleNotice) return;
      const hasPending = await hasValidPendingClaim(currentDeal.id);
      if (hasPending && isMounted) {
        setShowClaimPrompt(true);
      }
    };

    // Show prompt when opening game page if pending claim within 24h
    checkAndShowPrompt();

    // AppState becomes active (returning to foreground)
    const appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        checkAndShowPrompt();
      }
    });

    // Web visibilitychange event
    let onVisibilityChange: (() => void) | null = null;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      onVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          checkAndShowPrompt();
        }
      };
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    return () => {
      isMounted = false;
      appStateSubscription.remove();
      if (onVisibilityChange && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    };
  }, [currentDeal.id, isClaimed, isBundleNotice, heavyMounted]);

  const epicMobileUrls = resolveEpicMobileUrls(
    currentDeal.title,
    currentDeal.url || currentDeal.giveawayUrl,
    `${currentDeal.instructions || ''} ${currentDeal.description || ''}`,
    currentDeal.platform
  );
  const androidUrl = currentDeal.androidUrl || epicMobileUrls?.androidUrl || null;
  const iosUrl = currentDeal.iosUrl || epicMobileUrls?.iosUrl || null;

  // Prime Gaming detection
  const isPrimeDeal = useMemo(() => {
    const plat = (currentDeal.platform || '').toLowerCase();
    const url = (currentDeal.url || currentDeal.storeUrl || currentDeal.giveawayUrl || '').toLowerCase();
    return (
      plat.includes('prime') ||
      plat.includes('amazon') ||
      url.includes('gaming.amazon') ||
      url.includes('primegaming')
    );
  }, [currentDeal]);

  // Detect direct third-party giveaway links (Lenovo Legion, SteelSeries, Alienware, Gleam, etc.)
  const thirdPartyLink = useMemo(() => {
    const text = `${currentDeal.giveawayUrl || ''} ${currentDeal.url || ''} ${currentDeal.instructions || ''} ${currentDeal.description || ''}`;
    const m = text.match(/(https?:\/\/(?:www\.)?(?:gaming\.lenovo\.com|lenovo\.com|steelseries\.com|alienwarearena\.com|gleam\.io|givee\.club|giveaway\.su|amdgaming\.com|keylol\.com|opquest\.com)[^\s\)\>\]'"]*)/i);
    return m ? m[1].replace(/[.,;:)]+$/, '').trim() : null;
  }, [currentDeal]);

  // Real giveaway link vs Store link: Always prefer real third-party giveaway claim page over paid store link!
  const defaultMobileUrl = Platform.OS === 'ios' ? (iosUrl || androidUrl) : (androidUrl || iosUrl);
  const giveawayTargetUrl = defaultMobileUrl || thirdPartyLink || currentDeal.giveawayUrl || currentDeal.url;

  // Trailer state & Metacritic / Playtime metrics
  const [trailer, setTrailer] = useState<{ url: string; thumbnail?: string } | null>(() => {
    if (currentDeal.trailerUrl) {
      return { url: currentDeal.trailerUrl, thumbnail: currentDeal.trailerThumbnail };
    }
    return null;
  });

  const [steamMetrics, setSteamMetrics] = useState<{
    ratingPercent?: number;
    reviewCount?: number;
    reviewScore?: string;
  } | null>(() => {
    if (typeof currentDeal.steamRatingPercent === 'number' && currentDeal.steamRatingPercent > 0) {
      return {
        ratingPercent: currentDeal.steamRatingPercent,
        reviewCount: currentDeal.steamReviewCount,
        reviewScore: currentDeal.reviewScore,
      };
    }
    return null;
  });

  useEffect(() => {
    if (isBundleNotice || !heavyMounted) return;
    let active = true;
    dealsStore.getTrailerForDeal(currentDeal).then((t) => {
      if (active && t) setTrailer(t);
    });

    return () => {
      active = false;
    };
  }, [currentDeal.id, currentDeal.title, isBundleNotice, heavyMounted]);

  // Trusted Steam app ID: read strictly from a Steam URL on the deal or deal.steamAppId
  const trustedSteamAppId = useMemo(() => {
    if (isBundleNotice) return null;
    if (currentDeal.steamAppId && /^\d+$/.test(currentDeal.steamAppId)) {
      return currentDeal.steamAppId;
    }
    const urls = [currentDeal.storeUrl, currentDeal.steamUrl, currentDeal.giveawayUrl, currentDeal.url]
      .filter(Boolean)
      .join(' ');
    return extractSteamAppId(urls);
  }, [currentDeal, isBundleNotice]);

  const [discoveredSteamUrl, setDiscoveredSteamUrl] = useState<string | null>(() => {
    if (isBundleNotice) return null;
    if (currentDeal.storeUrl && currentDeal.storeUrl.includes('steam')) {
      return currentDeal.storeUrl;
    }
    if (currentDeal.steamUrl) {
      return currentDeal.steamUrl;
    }
    if (currentDeal.steamAppId && /^\d+$/.test(currentDeal.steamAppId)) {
      return `https://store.steampowered.com/app/${currentDeal.steamAppId}/`;
    }
    if (trustedSteamAppId) {
      return `https://store.steampowered.com/app/${trustedSteamAppId}/`;
    }
    return null;
  });

  const [steamCheckDone, setSteamCheckDone] = useState<boolean>(() => {
    return Boolean(
      (currentDeal.storeUrl && currentDeal.storeUrl.includes('steam')) ||
      currentDeal.steamUrl ||
      (currentDeal.steamAppId && /^\d+$/.test(currentDeal.steamAppId)) ||
      (currentDeal.platform && currentDeal.platform.toLowerCase().includes('steam'))
    );
  });

  // On-demand Steam store resolution & live Steam review / rating enrichment
  useEffect(() => {
    if (isBundleNotice) return;
    let active = true;

    async function loadSteamData() {
      // 1. Identify Steam App ID or Store URL
      let targetUrl =
        currentDeal.storeUrl && currentDeal.storeUrl.includes('steam')
          ? currentDeal.storeUrl
          : currentDeal.steamUrl;

      if (!targetUrl && currentDeal.steamAppId && /^\d+$/.test(currentDeal.steamAppId)) {
        targetUrl = `https://store.steampowered.com/app/${currentDeal.steamAppId}/`;
      }

      if (!targetUrl) {
        const foundId = await searchSteamAppId(currentDeal.title);
        if (foundId) {
          targetUrl = `https://store.steampowered.com/app/${foundId}/`;
        }
      }

      if (!active) return;

      if (targetUrl) {
        setDiscoveredSteamUrl(targetUrl);
      }
      setSteamCheckDone(true);

      if (!targetUrl) return;

      // 2. Enrich with Steam Reviews, Rating, and Details
      try {
        const steamData = await enrichSteamDeal(targetUrl, currentDeal.title);
        if (active && steamData) {
          if (steamData.steamUrl) {
            setDiscoveredSteamUrl(steamData.steamUrl);
          }
          if (steamData.description) {
            const cleaned = cleanGameDescription(steamData.description);
            if (cleaned) {
              setSteamDescription(cleaned);
            }
          }
          if (typeof steamData.steamRatingPercent === 'number' && steamData.steamRatingPercent > 0) {
            setSteamMetrics({
              ratingPercent: steamData.steamRatingPercent,
              reviewCount: steamData.steamReviewCount,
              reviewScore: steamData.reviewScore || currentDeal.reviewScore,
            });
          }
          if (typeof steamData.metacriticScore === 'number' && steamData.metacriticScore > 0) {
            setSteamMetacritic(steamData.metacriticScore);
          }
          if (steamData.gameMode) {
            setGameMode(steamData.gameMode);
          }

          const targetAppId = steamData.steamAppId || trustedSteamAppId;
          const reviewCount = steamData.steamReviewCount ?? currentDeal.steamReviewCount ?? 0;
          if (targetAppId && reviewCount >= 25) {
            fetchSteamSpyPlaytime(targetAppId).then((pt) => {
              if (active && pt) {
                setPlaytimeFormatted(pt);
                dealsStore.updateDeal(currentDeal.id, {
                  playtimeFormatted: pt,
                });
              }
            }).catch(() => {});
          }

          if (steamData.releaseDate && trustedSteamAppId) {
            const formatted = formatDisplayDate(steamData.releaseDate);
            if (formatted) {
              setRealReleaseDate(formatted);
              storeReleaseDateCache.set(`steam_${trustedSteamAppId}`, formatted);
            }
          }

          const reliableRelease = (steamData.releaseDate && trustedSteamAppId)
            ? (formatDisplayDate(steamData.releaseDate) || undefined)
            : (isBogusGiveawayDate(currentDeal.releaseDate, currentDeal) ? undefined : currentDeal.releaseDate);

          dealsStore.updateDeal(currentDeal.id, {
            steamAppId: steamData.steamAppId || currentDeal.steamAppId,
            steamUrl: steamData.steamUrl || targetUrl,
            steamRatingPercent: steamData.steamRatingPercent,
            steamReviewCount: steamData.steamReviewCount,
            reviewScore: steamData.reviewScore || currentDeal.reviewScore,
            metacriticScore: currentDeal.metacriticScore || steamData.metacriticScore,
            gameModes: steamData.gameModes || currentDeal.gameModes,
            gameMode: steamData.gameMode || currentDeal.gameMode,
            developer: currentDeal.developer || steamData.developer,
            publisher: currentDeal.publisher || steamData.publisher,
            releaseDate: reliableRelease,
            genres: currentDeal.genres || steamData.genres,
            aboutGame: steamData.description ? cleanGameDescription(steamData.description) : currentDeal.aboutGame,
            steamDescription: steamData.description ? cleanGameDescription(steamData.description) : currentDeal.steamDescription,
          });
        }
      } catch (err) {
        console.warn('[DetailScreen] Live Steam enrichment failed:', err);
      }
    }

    loadSteamData();

    return () => {
      active = false;
    };
  }, [currentDeal.id, currentDeal.title, currentDeal.storeUrl, currentDeal.steamUrl, currentDeal.steamAppId, isBundleNotice, heavyMounted]);

  // Store release date fetch when detail opens (Steam, Epic, GOG exact ID match, cached, 3.5s timeout)
  useEffect(() => {
    if (isBundleNotice) return;
    let active = true;
    const storeId = getStoreIdentifier(currentDeal);

    if (storeId && !storeReleaseDateCache.has(storeId)) {
      fetchExactStoreReleaseDate(currentDeal).then((date) => {
        if (active && date) {
          setRealReleaseDate(date);
          dealsStore.updateDeal(currentDeal.id, { releaseDate: date });
        }
      }).catch(() => {});
    }

    return () => {
      active = false;
    };
  }, [currentDeal.id, isBundleNotice]);

  const steamStoreUrl = useMemo(() => {
    if (isBundleNotice) return null;
    if (discoveredSteamUrl && /store\.steampowered\.com\/app\/\d+/i.test(discoveredSteamUrl)) {
      return discoveredSteamUrl;
    }
    if (currentDeal.storeUrl && /store\.steampowered\.com\/app\/\d+/i.test(currentDeal.storeUrl)) {
      return currentDeal.storeUrl;
    }
    if (currentDeal.steamUrl && /store\.steampowered\.com\/app\/\d+/i.test(currentDeal.steamUrl)) {
      return currentDeal.steamUrl;
    }
    if (trustedSteamAppId) {
      return `https://store.steampowered.com/app/${trustedSteamAppId}/`;
    }
    return null;
  }, [discoveredSteamUrl, currentDeal.storeUrl, currentDeal.steamUrl, trustedSteamAppId, isBundleNotice]);

  const hasSteamPage = Boolean(steamStoreUrl);

  // Load screenshots
  useEffect(() => {
    if (isBundleNotice || !heavyMounted) return;
    let active = true;
    if (currentDeal.is18Plus && !dealsStore.is18PlusRevealed(currentDeal.id) && !dealsStore.getAlwaysShow18Plus()) {
      return;
    }

    dealsStore.getScreenshotsForDeal(currentDeal).then((data) => {
      if (active && Array.isArray(data)) {
        setScreenshots(data);
        const steamId = currentDeal.steamAppId || (trustedSteamAppId ? trustedSteamAppId : null);
        if (steamId) {
          const cachedDesc = dealsStore.getCachedSteamDescription(steamId);
          if (cachedDesc) {
            setSteamDescription(cachedDesc);
          }
        }
      }
    });

    return () => {
      active = false;
    };
  }, [
    currentDeal.id,
    currentDeal.is18Plus,
    currentDeal.platform,
    currentDeal.title,
    currentDeal.steamUrl,
    currentDeal.storeUrl,
    currentDeal.giveawayUrl,
    currentDeal.url,
    isBundleNotice,
    heavyMounted,
  ]);

  // Hardware back button handler on Android when screenshot viewer is active
  useEffect(() => {
    if (selectedScreenshotIndex !== null) {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        setSelectedScreenshotIndex(null);
        return true;
      });
      return () => sub.remove();
    }
  }, [selectedScreenshotIndex]);

  // Prefetch adjacent full screenshots in media viewer
  useEffect(() => {
    if (selectedScreenshotIndex === null) return;
    const nextItem = screenshots[selectedScreenshotIndex + 1];
    const prevItem = screenshots[selectedScreenshotIndex - 1];
    if (nextItem && nextItem.path_full) {
      ExpoImage.prefetch(nextItem.path_full).catch(() => {});
    }
    if (prevItem && prevItem.path_full) {
      ExpoImage.prefetch(prevItem.path_full).catch(() => {});
    }
  }, [selectedScreenshotIndex, screenshots]);

  const handleShare = async () => {
    try {
      if (isBundleNotice) {
        await Share.share({
          message: `Prime Gaming - Free games available with Amazon Prime. Found with Claimr: ${PRIME_GAMING_CONFIG.PRIMARY_URL}`,
          url: PRIME_GAMING_CONFIG.PRIMARY_URL,
          title: 'Prime Gaming',
        });
        return;
      }
      const rawExpiry = currentDeal.expiresAt || currentDeal.endDate;
      const expiryMs = rawExpiry ? parseDateToMs(rawExpiry) : 0;
      let untilText = '';
      if (expiryMs && expiryMs > Date.now()) {
        const dateFormatted = formatDisplayDate(expiryMs);
        untilText = dateFormatted ? ` until ${dateFormatted}` : '';
      }
      const storeName = storeShortName(currentDeal.platform) || currentDeal.platform || 'Store';
      const shareMsg = `${currentDeal.title} is free on ${storeName}${untilText}. Found with Claimr\n${giveawayTargetUrl}`;
      await Share.share({
        message: shareMsg,
        url: giveawayTargetUrl,
        title: currentDeal.title,
      });
    } catch {}
  };

  const extractedCode = useMemo(() => {
    const text = `${currentDeal.instructions || ''} ${currentDeal.description || ''}`;
    const patterns = [
      /(?:code|voucher|coupon|promo code|key)\s*(?:is|:|-)?\s*([A-Z0-9]{4,}(?:-[A-Z0-9]{4,})*)/i,
      /\b([A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}(?:-[A-Z0-9]{5})?)\b/i,
    ];
    for (const pat of patterns) {
      const match = text.match(pat);
      if (match && match[1]) {
        const clean = match[1].trim();
        if (!['HTTP', 'HTTPS', 'STEAM', 'EPIC', 'GAME', 'GIVEAWAY', 'FREE', 'TRUE', 'FALSE'].includes(clean.toUpperCase())) {
          return clean;
        }
      }
    }
    return null;
  }, [currentDeal.instructions, currentDeal.description]);

  const [copiedCode, setCopiedCode] = useState(false);

  const handleCopyCode = async (codeToCopy: string) => {
    await copyToClipboard(codeToCopy);
    hapticFeedback.success();
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleOpenSteam = () => {
    if (!steamStoreUrl) return;
    try {
      hapticFeedback.light();
      openExternalLink(steamStoreUrl);
    } catch (e) {
      console.warn('Failed to open Steam store URL:', e);
    }
  };

  const handleOpenTrailer = async () => {
    if (!trailer?.url) {
      if (Platform.OS === 'web') {
        setWebTrailerUnavailable(true);
        setTimeout(() => setWebTrailerUnavailable(false), 3500);
      }
      return;
    }
    if (Platform.OS === 'web') {
      setWebVideoActive(true);
      return;
    }

    hapticFeedback.medium();
    await openTrailerWithFallback(trailer.url, () => {
      setNativeTrailerVisible(true);
    });
  };

  const triggerClaimMoment = async () => {
    hapticFeedback.success();

    setIsClaimed(true);

    try {
      await removePendingClaim(currentDeal.id);
      await dealsStore.claimDeal(currentDeal);
      if (onClaimed) onClaimed(currentDeal);
    } catch (e) {
      console.error('Claim error:', e);
    }

    if (!isReduceMotion) {
      // Self-drawing SVG checkmark (350 ms)
      checkmarkAnim.setValue(28);
      Animated.timing(checkmarkAnim, {
        toValue: 0,
        duration: 350,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: false,
      }).start();

      // "+$X saved" floats up 18px and fades over 600ms
      floatY.setValue(0);
      floatOpacity.setValue(1);
      Animated.parallel([
        Animated.timing(floatY, {
          toValue: -18,
          duration: 600,
          easing: Easing.bezier(0.22, 1, 0.36, 1),
          useNativeDriver: true,
        }),
        Animated.timing(floatOpacity, {
          toValue: 0,
          duration: 600,
          easing: Easing.bezier(0.22, 1, 0.36, 1),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      checkmarkAnim.setValue(0);
      floatOpacity.setValue(0);
    }
  };

  const executeClaim = async () => {
    if (isClaimingRef.current || isClaimed) return;
    isClaimingRef.current = true;
    try {
      await removePendingClaim(currentDeal.id);
      setShowClaimPrompt(false);
      await triggerClaimMoment();
    } catch (e) {
      console.warn('executeClaim error:', e);
    } finally {
      isClaimingRef.current = false;
    }
  };

  const handleNotYet = async () => {
    try {
      await removePendingClaim(currentDeal.id);
      setShowClaimPrompt(false);
    } catch (e) {
      console.warn('handleNotYet error:', e);
    }
  };

  const handleUnclaim = async () => {
    try {
      hapticFeedback.light();
      if (isReduceMotion) {
        await dealsStore.unclaimDeal(currentDeal.id, currentDeal.title);
        setIsClaimed(false);
        checkmarkAnim.setValue(28);
        setStoreVersion((v) => v + 1);
        setUndoToastVisible(true);
      } else {
        // Simple 180 ms fade-swap back to "Claim", no bounce
        Animated.timing(unclaimFadeAnim, {
          toValue: 0,
          duration: 90,
          easing: Easing.linear,
          useNativeDriver: true,
        }).start(async () => {
          await dealsStore.unclaimDeal(currentDeal.id, currentDeal.title);
          setIsClaimed(false);
          checkmarkAnim.setValue(28);
          setStoreVersion((v) => v + 1);
          Animated.timing(unclaimFadeAnim, {
            toValue: 1,
            duration: 90,
            easing: Easing.linear,
            useNativeDriver: true,
          }).start();
          setUndoToastVisible(true);
        });
      }
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = setTimeout(() => {
        setUndoToastVisible(false);
      }, 4000);
    } catch (e) {
      hapticFeedback.warning();
      console.warn('handleUnclaim error:', e);
    }
  };

  const handleUndoUnclaim = async () => {
    try {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
      setUndoToastVisible(false);
      await dealsStore.claimDeal(currentDeal);
      hapticFeedback.success();
      setIsClaimed(true);
      checkmarkAnim.setValue(0);
    } catch (e) {
      hapticFeedback.warning();
      console.warn('handleUndoUnclaim error:', e);
    }
  };

  const handleDirectPress = () => {
    if (isOpeningBrowserRef.current) return;
    isOpeningBrowserRef.current = true;
    setTimeout(() => {
      isOpeningBrowserRef.current = false;
    }, 1000);

    // Prime notice: opens the configured Prime Gaming page only, no recording, no claim prompt
    if (isBundleNotice) {
      try {
        openExternalLink(PRIME_GAMING_CONFIG.PRIMARY_URL);
      } catch (e) {
        console.warn('Failed to open browser for Prime notice:', e);
      }
      return;
    }

    // 1 & 2: When deal is already claimed, the main button keeps its quiet claimed look
    // ("Claimed ✓") but stays FULLY TAPPABLE: opens giveaway link (or storeUrl).
    // Does NOT create pending claim, does NOT show prompt, does NOT change claimed state.
    if (isClaimed) {
      const targetUrl = currentDeal.giveawayUrl || giveawayTargetUrl || currentDeal.storeUrl || currentDeal.url || '';
      if (targetUrl) {
        try {
          openExternalLink(targetUrl);
        } catch (e) {
          console.warn('Failed to open browser for claimed deal:', e);
        }
      }
      return;
    }

    // 2b: When unclaimed: opens real giveaway link in external browser immediately,
    // records pending claim in background, and presents the confirmation sheet
    try {
      savePendingClaim(currentDeal, giveawayTargetUrl).catch((err) =>
        console.warn('savePendingClaim error:', err)
      );
      openExternalLink(giveawayTargetUrl);
      if (!isClaimed) {
        setShowClaimPrompt(true);
      }
    } catch (e) {
      console.warn('Failed to open claim browser:', e);
    }
  };

  const handleAndroidPress = () => {
    if (isOpeningBrowserRef.current) return;
    isOpeningBrowserRef.current = true;
    setTimeout(() => { isOpeningBrowserRef.current = false; }, 1000);

    if (isClaimed) {
      if (androidUrl) {
        openExternalLink(androidUrl);
      }
      return;
    }

    try {
      if (androidUrl) {
        savePendingClaim(currentDeal, androidUrl).catch((err) =>
          console.warn('savePendingClaim android error:', err)
        );
        openExternalLink(androidUrl);
        if (!isClaimed) {
          setShowClaimPrompt(true);
        }
      }
    } catch (e) {
      console.warn('handleAndroidPress error:', e);
    }
  };

  const handleIosPress = () => {
    if (isOpeningBrowserRef.current) return;
    isOpeningBrowserRef.current = true;
    setTimeout(() => { isOpeningBrowserRef.current = false; }, 1000);

    if (isClaimed) {
      if (iosUrl) {
        openExternalLink(iosUrl);
      }
      return;
    }

    try {
      if (iosUrl) {
        savePendingClaim(currentDeal, iosUrl).catch((err) =>
          console.warn('savePendingClaim ios error:', err)
        );
        openExternalLink(iosUrl);
        if (!isClaimed) {
          setShowClaimPrompt(true);
        }
      }
    } catch (e) {
      console.warn('handleIosPress error:', e);
    }
  };

  const rawWorth = currentDeal.worth || currentDeal.originalPrice;
  const cleanWorthLabel = rawWorth ? (rawWorth.startsWith('+') ? `${rawWorth} saved` : `+${rawWorth} saved`) : 'Free';

  // Description Tier Hierarchy:
  // Tier 1: Steam (accurate official description from Steam API or deal.steamDescription)
  // Description Hierarchy:
  // Tier 1: Steam (accurate official description from Steam API or deal.steamDescription)
  // Tier 2: Existing source (Reddit FGF Bot aboutGame, GamerPower, or promo copy fallback)
  const descriptionText = useMemo(() => {
    // Tier 1: Steam
    const steamCandidate =
      steamDescription ||
      currentDeal.steamDescription ||
      (currentDeal.platform.toLowerCase().includes('steam') && currentDeal.aboutGame ? currentDeal.aboutGame : null);
    if (steamCandidate && steamCandidate.trim().length > 0) {
      const cleaned = cleanGameDescription(steamCandidate);
      if (cleaned.length > 0) return cleaned;
    }

    // Tier 2: Existing way (Reddit FGF Bot aboutGame, GamerPower, or post body)
    const existingCandidate = currentDeal.aboutGame || currentDeal.description;
    if (existingCandidate && existingCandidate.trim().length > 0) {
      const cleaned = cleanGameDescription(existingCandidate);
      if (cleaned.length > 0) return cleaned;
    }

    // Fallback promo copy
    return `${currentDeal.title} is currently available for free claim on ${currentDeal.platform}. Add it to your collection before the promotion concludes.`;
  }, [
    steamDescription,
    currentDeal.steamDescription,
    currentDeal.aboutGame,
    currentDeal.description,
    currentDeal.platform,
    currentDeal.title,
  ]);

  const isDescLong = descriptionText.length > 180;

  const displayedDesc = useMemo(() => {
    if (descExpanded || !isDescLong) return descriptionText;
    const sub = descriptionText.slice(0, 220);
    const lastSpace = sub.lastIndexOf(' ');
    return (lastSpace > 160 ? sub.slice(0, lastSpace) : sub) + '...';
  }, [descriptionText, descExpanded, isDescLong]);

  const hostInfo = getGiveawayHostName(currentDeal);
  const insets = useSafeAreaInsets();
  const nowClock = useAppClockSeconds();
  const endMs = (currentDeal.expiresAt || currentDeal.endDate) ? parseDateToMs(currentDeal.expiresAt || currentDeal.endDate) : 0;
  const isDealEnded = Boolean(currentDeal.isNotFoundAfterSync || isDealExpired(currentDeal) || (endMs > 0 && endMs <= nowClock));

  // Stat Strip conditions & ratings
  const effectiveSteamRating = steamMetrics?.ratingPercent ?? currentDeal.steamRatingPercent;
  const effectiveSteamReviews = steamMetrics?.reviewCount ?? currentDeal.steamReviewCount;
  const effectiveReviewScore = steamMetrics?.reviewScore ?? currentDeal.reviewScore;
  const hasSteamRating = typeof effectiveSteamRating === 'number' && effectiveSteamRating > 0;

  // Stat Items: Metacritic score, Steam rating, Median playtime, People who claimed it
  const effectiveMetacritic = steamMetacritic ?? currentDeal.metacriticScore;
  const hasMetacritic = typeof effectiveMetacritic === 'number' && effectiveMetacritic > 0;
  const statMetrics: Array<{
    id: string;
    value: string;
    label: string;
    color?: string;
    icon: keyof typeof Ionicons.glyphMap;
    glassText: React.ReactNode;
  }> = [];

  if (hasMetacritic) {
    const mColor = getMetacriticColor(effectiveMetacritic);
    statMetrics.push({
      id: 'metacritic',
      value: String(effectiveMetacritic),
      label: 'Metascore',
      color: mColor,
      icon: 'ribbon-outline',
      glassText: (
        <>
          {'Metascore '}
          <Text style={[styles.soloGlassHighlight, { color: mColor }]}>
            {effectiveMetacritic}
          </Text>
          {' on Metacritic'}
        </>
      ),
    });
  } else if (hasSteamRating) {
    const sColor = effectiveSteamRating >= 75 ? '#34C759' : effectiveSteamRating >= 50 ? '#FFCC00' : '#FF3B30';
    statMetrics.push({
      id: 'steamRating',
      value: `${effectiveSteamRating}%`,
      label: 'Steam rating',
      color: sColor,
      icon: 'thumbs-up-outline',
      glassText: (
        <>
          <Text style={[styles.soloGlassHighlight, { color: sColor }]}>
            {effectiveSteamRating}%
          </Text>
          {' positive Steam user reviews'}
        </>
      ),
    });
  }

  const effectivePlaytime = playtimeFormatted ?? currentDeal.playtimeFormatted ?? null;
  if (effectivePlaytime && effectivePlaytime.trim().length > 0) {
    statMetrics.push({
      id: 'playtime',
      value: effectivePlaytime.trim(),
      label: 'Median playtime',
      color: '#EDEDEB',
      icon: 'time-outline',
      glassText: (
        <>
          {'Median playtime of '}
          <Text style={styles.soloGlassHighlight}>{effectivePlaytime.trim()}</Text>
        </>
      ),
    });
  }

  const claimedUsersCount = typeof currentDeal.claimedUsers === 'number' && currentDeal.claimedUsers > 0 ? currentDeal.claimedUsers : null;
  if (claimedUsersCount) {
    statMetrics.push({
      id: 'claimed',
      value: claimedUsersCount.toLocaleString(),
      label: 'Claimed',
      color: '#EDEDEB',
      icon: 'people',
      glassText: (
        <>
          <Text style={styles.soloGlassHighlight}>{claimedUsersCount.toLocaleString()} players</Text>
          {' claimed this giveaway'}
        </>
      ),
    });
  }

  const statItems = statMetrics;

  // Two-column Spec Sheet Rows: developer, publisher, release date, giveaway start date, genres, platforms
  const specRows: Array<{ label: string; value: string }> = [];

  if (currentDeal.developer && currentDeal.developer !== 'N/A' && currentDeal.developer.trim().length > 0) {
    specRows.push({ label: 'Developer', value: currentDeal.developer.trim() });
  }

  if (
    currentDeal.publisher &&
    currentDeal.publisher !== 'N/A' &&
    currentDeal.publisher.trim().length > 0 &&
    currentDeal.publisher.trim().toLowerCase() !== currentDeal.developer?.trim().toLowerCase()
  ) {
    specRows.push({ label: 'Publisher', value: currentDeal.publisher.trim() });
  }

  const displayRelease = realReleaseDate || (!isBogusGiveawayDate(currentDeal.releaseDate, currentDeal) ? (formatDisplayDate(currentDeal.releaseDate) || currentDeal.releaseDate) : null);
  if (displayRelease && displayRelease !== 'N/A' && displayRelease.trim().length > 0) {
    specRows.push({ label: 'Release Date', value: displayRelease.trim() });
  }

  const rawGiveawayDate = currentDeal.publishedAt || currentDeal.createdAt || currentDeal.firstSeenAt;
  const giveawayStartedDate = rawGiveawayDate ? formatDisplayDate(rawGiveawayDate) : null;
  if (giveawayStartedDate && giveawayStartedDate.trim().length > 0) {
    specRows.push({ label: 'Giveaway Started', value: giveawayStartedDate.trim() });
  }

  if (claimedUsersCount) {
    specRows.push({ label: 'Claimed', value: `${claimedUsersCount.toLocaleString()} players` });
  }

  if (currentDeal.genres && Array.isArray(currentDeal.genres) && currentDeal.genres.length > 0) {
    const genresStr = currentDeal.genres.filter(Boolean).join(', ');
    if (genresStr.trim().length > 0) {
      specRows.push({ label: 'Genres', value: genresStr.trim() });
    }
  }

  const displayPlatforms = (currentDeal.platforms && Array.isArray(currentDeal.platforms) && currentDeal.platforms.length > 0)
    ? currentDeal.platforms.filter(Boolean).join(', ')
    : (currentDeal.platform && currentDeal.platform !== 'Unknown' ? currentDeal.platform : null);
  if (displayPlatforms && displayPlatforms.trim().length > 0) {
    specRows.push({ label: 'Platforms', value: displayPlatforms.trim() });
  }

  if (isPrimeDeal) {
    specRows.push({ label: 'Requires', value: 'Amazon Prime' });
  }

  // Stat Strip conditions (Requirement 4: Steam, Playtime, Mode)
  const hasPlaytime = Boolean(effectivePlaytime && effectivePlaytime.trim().length > 0);

  const effectiveMode = gameMode ?? currentDeal.gameMode ?? null;
  const hasMode = Boolean(effectiveMode && effectiveMode.trim().length > 0);

  const hasStatStrip = hasSteamRating || hasPlaytime || hasMode;

  const hasMedia = (trailer && trailer.url) || screenshots.length > 0;
  const screenWidth = Dimensions.get('window').width;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" translucent={true} />

      {/* Left Edge Swipe-Back Handle (36px wide touch target on left edge, below top bar to avoid back button) */}
      <View pointerEvents="box-none" style={[styles.edgeSwipeContainer, { top: insets.top + 56 }]}>
        <GestureDetector gesture={edgePanGesture}>
          <View style={styles.edgeSwipeStrip} />
        </GestureDetector>
      </View>

      {/* Top Status Bar Spacer */}
      <View style={{ height: insets.top, backgroundColor: '#000000', width: '100%', zIndex: 45 }} />

      {/* STICKY TOP BAR: Opaque #000 header bar when scrolled, floating buttons when hero is visible */}
      <View pointerEvents="box-none" style={[styles.headerContainer, { top: insets.top, height: 56 }]}>
        {/* Floating buttons layer (visible when hero is at top) */}
        <Reanimated.View pointerEvents="box-none" style={[styles.floatingHeaderRow, floatingHeaderStyle]}>
          <Pressable onPress={onClose} onPressIn={onClose} unstable_pressDelay={0} hitSlop={20} style={styles.touchTarget48} accessibilityRole="button" accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={22} color="#EDEDEB" />
          </Pressable>

          <View style={styles.headerRightActions}>
            {hasSteamPage && (
              <Pressable onPress={handleOpenSteam} hitSlop={12} style={styles.touchTarget48} accessibilityRole="button" accessibilityLabel="Open on Steam">
                <StoreIcon store="steam" size={20} color="#EDEDEB" />
              </Pressable>
            )}
            <Pressable onPress={handleShare} hitSlop={12} style={styles.touchTarget48} accessibilityRole="button" accessibilityLabel="Share">
              <Ionicons name="share-outline" size={20} color="#EDEDEB" />
            </Pressable>
          </View>
        </Reanimated.View>

        {/* Opaque #000 sticky layer (fades in once hero scrolls out on UI thread; blocks content scrolling beneath) */}
        <Reanimated.View style={[styles.stickyOpaqueBar, stickyHeaderStyle]}>
          <Pressable onPress={onClose} onPressIn={onClose} unstable_pressDelay={0} hitSlop={20} style={styles.touchTarget48Transparent} accessibilityRole="button" accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={22} color="#EDEDEB" />
          </Pressable>

          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.stickyBarTitle}>
            {currentDeal.title}
          </Text>

          <View style={styles.headerRightActions}>
            {hasSteamPage && (
              <Pressable onPress={handleOpenSteam} hitSlop={12} style={styles.touchTarget48Transparent} accessibilityRole="button" accessibilityLabel="Open on Steam">
                <StoreIcon store="steam" size={20} color="#EDEDEB" />
              </Pressable>
            )}
            <Pressable onPress={handleShare} hitSlop={12} style={styles.touchTarget48Transparent} accessibilityRole="button" accessibilityLabel="Share">
              <Ionicons name="share-outline" size={20} color="#EDEDEB" />
            </Pressable>
          </View>
        </Reanimated.View>
      </View>

      <Reanimated.ScrollView
        ref={scrollRef as any}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={scrollHandler}
        nestedScrollEnabled={true}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 140 + insets.bottom }]}
      >
        {currentDeal.isNotFoundAfterSync ? (
          <View style={styles.endedContainer}>
            <View style={styles.endedIconWrap}>
              <Ionicons name="time-outline" size={48} color="#86868B" />
            </View>
            <Text style={styles.endedTitle}>This giveaway may have ended</Text>
            <Text style={styles.endedSubtitle}>
              {currentDeal.title} is no longer listed in active deals. The promotion may have expired or keys ran out.
            </Text>

            <View style={styles.endedActions}>
              <Pressable
                onPress={() => openExternalLink(currentDeal.giveawayUrl || currentDeal.url)}
                style={styles.endedOpenBtn}
                accessibilityRole="button"
                accessibilityLabel="Open link"
              >
                <Text style={styles.endedOpenBtnText}>Open link</Text>
              </Pressable>

              <Pressable
                onPress={onClose}
                onPressIn={onClose}
                unstable_pressDelay={0}
                style={styles.endedBackBtn}
                accessibilityRole="button"
                accessibilityLabel="Back"
              >
                <Text style={styles.endedBackBtnText}>Back</Text>
              </Pressable>
            </View>
          </View>
        ) : isBundleNotice ? (
          <View style={styles.bundleNoticeBody}>
            {/* Store Icon + Store Name */}
            <View style={styles.bundleTaglineRow}>
              <StoreIcon store="prime" size={16} color="#EDEDEB" />
              <Text style={styles.bundleTaglineText}>PRIME GAMING</Text>
            </View>

            {/* Main Title */}
            <Text style={styles.bundleTitle}>Prime Gaming</Text>

            {/* Tabular Countdown Clock if real expiry exists */}
            {(currentDeal.expiresAt || currentDeal.endDate) ? (
              <View style={styles.clockWrap}>
                <CountdownClock
                  endDate={currentDeal.expiresAt || currentDeal.endDate}
                  size="lg"
                />
              </View>
            ) : null}

            {/* Price Component / "Included with Prime" */}
            <View style={styles.bundlePriceRow}>
              <Text style={styles.bundlePriceText}>Included with Prime</Text>
            </View>

            {/* Ruled row "Requires: Amazon Prime membership" */}
            <View style={styles.bundleRuledRow}>
              <Text style={styles.bundleRuledLabel}>Requires</Text>
              <Text style={styles.bundleRuledValue}>Amazon Prime membership</Text>
            </View>

            {/* Game list text */}
            <View style={styles.bundleGamesSection}>
              <Text style={styles.bundleGamesPrompt}>
                Some of the games available now: <Text style={styles.bundleGamesList}>{currentDeal.bundleGamesText || 'Free games'}</Text>
              </Text>
              <Text style={styles.bundleFullPrompt}>Open Prime Gaming to see the full list.</Text>
            </View>
          </View>
        ) : (
          <>
            {/* Single Static Hero Artwork at natural aspect ratio with smooth bottom fade */}
            <View style={styles.artworkContainer}>
              <GameArtwork
                deal={currentDeal}
                uri={currentDeal.resolvedImage || currentDeal.image}
                title={currentDeal.title}
                platform={currentDeal.platform}
                isNsfw={currentDeal.isNsfw}
                isHero={true}
                resizeMode="contain"
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.heroBottomFade} pointerEvents="none">
                <LinearGradient
                  colors={[
                    'transparent',
                    'rgba(0, 0, 0, 0.25)',
                    'rgba(0, 0, 0, 0.75)',
                    '#000000',
                  ]}
                  locations={[0, 0.45, 0.8, 1.0]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              </View>
            </View>

            {/* Title large and bold under the art */}
            <Text style={styles.title}>{currentDeal.title}</Text>

            {/* Structured info layout under title */}
            <View style={styles.headerStructuredMeta}>
              <View style={styles.headerMetaTagsRow}>
                <View style={styles.headerStorePill}>
                  <StoreIcon
                    store={isPrimeDeal ? 'prime' : hostInfo.isTaskHost ? hostInfo.host : currentDeal.platform}
                    size={12}
                    color="#EDEDEB"
                  />
                  <Text style={styles.headerStoreText}>
                    {isPrimeDeal
                      ? 'PRIME GAMING'
                      : hostInfo.isTaskHost
                      ? hostInfo.host.toUpperCase()
                      : storeShortName(currentDeal.platform).toUpperCase()}
                  </Text>
                </View>

                <View style={styles.headerInfoPill}>
                  <Text style={styles.headerInfoPillText}>
                    {formatType(currentDeal.type || 'Game')}
                  </Text>
                </View>

                <View style={styles.headerInfoPill}>
                  <Text style={styles.headerInfoPillText}>
                    {currentDeal.claimMethod === 'tasks' ? 'Tasks' : 'One-Click'}
                  </Text>
                </View>

                {effectiveMode && (
                  <View style={styles.headerInfoPill}>
                    <Text style={styles.headerInfoPillText}>{effectiveMode}</Text>
                  </View>
                )}

                {hasSteamRating && hasMetacritic && (
                  <View style={styles.headerRatingBadge}>
                    <Ionicons name="star" size={10} color="#EDEDEB" />
                    <Text style={styles.headerRatingScore}>
                      {effectiveSteamRating}%
                    </Text>
                    {effectiveReviewScore ? (
                      <Text style={styles.headerRatingLabel} numberOfLines={1}>
                        {effectiveReviewScore}
                      </Text>
                    ) : null}
                  </View>
                )}
              </View>
            </View>

            {/* Value focus: retail price struck through next to large FREE, savings in big type */}
            <Price
              worth={currentDeal.worth || currentDeal.originalPrice}
              isEstimated={currentDeal.isEstimated}
              size="lg"
              style={styles.priceRow}
            />

            {/* Countdown: one row of large unboxed digits, thin progress line, digits turn orange under 24 hours */}
            {!isDealEnded && (
              <View style={styles.clockWrap}>
                <CountdownClock
                  key={`${currentDeal.id}_${currentDeal.expiresAt || currentDeal.endDate || 'permanent'}`}
                  endDate={currentDeal.expiresAt || currentDeal.endDate}
                  startDate={currentDeal.createdAt ? new Date(currentDeal.createdAt).toISOString() : undefined}
                  size="lg"
                />
              </View>
            )}

            {/* If 2 or more stats are present: show side-by-side multi-column stat row with dividers */}
            {statMetrics.length >= 2 && (
              <View style={styles.borderlessStatRow}>
                {statMetrics.map((item, idx) => (
                  <React.Fragment key={item.id}>
                    {idx > 0 && <View style={styles.statDivider} />}
                    <View style={styles.statItem}>
                      <Text style={[styles.statValue, item.color ? { color: item.color } : null]}>
                        {item.value}
                      </Text>
                      <Text style={styles.statLabelText}>{item.label}</Text>
                    </View>
                  </React.Fragment>
                ))}
              </View>
            )}

            {/* If single metric is present: show in glass box */}
            {statMetrics.length === 1 && (
              <View style={styles.soloGlassBanner}>
                <Ionicons
                  name={statMetrics[0].icon}
                  size={16}
                  color={statMetrics[0].color || '#EDEDEB'}
                  style={styles.soloGlassIcon}
                />
                <Text style={styles.soloGlassText}>
                  {statMetrics[0].glassText}
                </Text>
              </View>
            )}

            {/* Below-fold content (Media, About, Instructions, Specifications) */}
            <View>
                {/* Media Section: Horizontal strip of small thumbnails (Trailer first with play label, then screenshots) */}
                {(trailer?.url || screenshots.length > 0) && (
                  <View style={styles.mediaSectionWrap}>
                    <Text style={[styles.sectionLabel, { paddingHorizontal: 20 }]}>Media</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      nestedScrollEnabled={true}
                      contentContainerStyle={styles.mediaStripContent}
                    >
                      {/* Trailer Item First */}
                      {trailer?.url ? (
                        <Pressable
                          onPress={handleOpenTrailer}
                          style={styles.mediaThumbnailCard}
                          accessibilityRole="button"
                          accessibilityLabel="Play official trailer"
                        >
                          <ExpoImage
                            source={{ uri: trailer.thumbnail || currentDeal.resolvedImage || currentDeal.image }}
                            style={styles.mediaThumbnailImg}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                          />
                          <LinearGradient
                            colors={['transparent', 'rgba(0, 0, 0, 0.75)']}
                            start={{ x: 0, y: 0.35 }}
                            end={{ x: 0, y: 1 }}
                            style={StyleSheet.absoluteFill}
                          />
                          <View style={styles.trailerPlayBadge}>
                            <Ionicons name="play" size={10} color="#EDEDEB" style={{ marginRight: 4 }} />
                            <Text style={styles.trailerPlayText}>Trailer</Text>
                          </View>
                        </Pressable>
                      ) : null}

                      {/* Every Screenshot */}
                      {screenshots.map((s, idx) => (
                        <Pressable
                          key={`strip-thumb-${s.id || idx}`}
                          onPress={() => {
                            hapticFeedback.light();
                            setSelectedScreenshotIndex(idx);
                          }}
                          style={styles.mediaThumbnailCard}
                          accessibilityRole="imagebutton"
                          accessibilityLabel={`View screenshot ${idx + 1}`}
                        >
                          <ExpoImage
                            source={{ uri: s.path_thumbnail || s.path_full }}
                            style={styles.mediaThumbnailImg}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                          />
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* About / Description with Read More Toggle (Max 3 lines) */}
                <View style={styles.sectionWrap}>
                  <Text style={styles.sectionLabel}>About the game</Text>
                  <Text
                    numberOfLines={descExpanded ? undefined : 3}
                    ellipsizeMode="tail"
                    style={styles.descriptionText}
                  >
                    {descriptionText}
                  </Text>
                  {isDescLong && (
                    <Pressable
                      onPress={() => setDescExpanded(!descExpanded)}
                      hitSlop={8}
                      style={styles.readMoreBtn}
                      accessibilityRole="button"
                      accessibilityLabel={descExpanded ? "Read less description" : "Read more description"}
                    >
                      <Text style={styles.readMoreText}>{descExpanded ? 'Read less ↑' : 'Read more ↓'}</Text>
                    </Pressable>
                  )}
                </View>

                {/* Claim Voucher / Code if available */}
                {extractedCode && (
                  <View style={styles.sectionWrap}>
                    <View style={styles.detailsVoucherCard}>
                      <View style={styles.claimCodeHeader}>
                        <Text style={styles.claimCodeLabel}>Claim code / voucher</Text>
                        <Text style={styles.claimCodeTapHint}>{copiedCode ? 'Copied' : 'Tap to copy'}</Text>
                      </View>
                      <Pressable
                        onPress={() => handleCopyCode(extractedCode)}
                        style={styles.claimCodeBox}
                        accessibilityRole="button"
                        accessibilityLabel={`Copy claim code ${extractedCode}`}
                      >
                        <Text style={styles.claimCodeText} selectable={true}>{extractedCode}</Text>
                        <View style={styles.claimCodeBadge}>
                          <Ionicons
                            name={copiedCode ? "checkmark" : "copy-outline"}
                            size={13}
                            color={copiedCode ? "#34C759" : "#EDEDEB"}
                          />
                          <Text style={[styles.claimCodeBadgeText, copiedCode && { color: "#34C759" }]}>
                            {copiedCode ? 'Copied' : 'Copy'}
                          </Text>
                        </View>
                      </Pressable>
                    </View>
                  </View>
                )}

                {/* Claim Instructions if available */}
                {currentDeal.instructions && currentDeal.instructions.trim().length > 0 && (
                  <View style={styles.sectionWrap}>
                    <View style={styles.detailsInstructionsBlock}>
                      <Text style={styles.detailsSubLabel}>How to claim</Text>
                      <Text style={styles.instructionsText}>{currentDeal.instructions.trim()}</Text>
                    </View>
                  </View>
                )}

                {/* Two-column Spec Sheet (Permanently Visible) */}
                {specRows.length > 0 && (
                  <View style={styles.sectionWrap}>
                    <Text style={styles.sectionLabel}>Specifications</Text>
                    <View style={styles.specSheetList}>
                      {specRows.map((row, idx) => (
                        <View
                          key={row.label}
                          style={[
                            styles.specSheetRow,
                            idx === specRows.length - 1 && styles.specSheetRowLast,
                          ]}
                        >
                          <Text style={styles.specSheetLabel}>{row.label}</Text>
                          <Text numberOfLines={2} style={styles.specSheetValue}>
                            {row.value}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
            </View>
          </>
        )}
      </Reanimated.ScrollView>

      {/* Floating Bottom CTA */}
      {/* Floating Bottom CTA */}
      <View style={[styles.ctaContainer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
        {!isBundleNotice && !isDealEnded && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.floatLabelContainer,
              {
                opacity: floatOpacity,
                transform: [{ translateY: floatY }],
              },
            ]}
          >
            <Text style={styles.floatLabelText}>{cleanWorthLabel}</Text>
          </Animated.View>
        )}

        {isDealEnded ? (
          <View style={[styles.ctaBtn, styles.ctaBtnEnded]}>
            <Text style={styles.ctaBtnTextEnded}>Ended</Text>
          </View>
        ) : isBundleNotice ? (
          <Animated.View style={{ transform: [{ scale: ctaBtnPress.scaleAnim }], width: '100%' }}>
            <Pressable
              onPress={handleDirectPress}
              onPressIn={ctaBtnPress.onPressIn}
              onPressOut={ctaBtnPress.onPressOut}
              style={[styles.ctaBtn, styles.ctaBtnUnclaimed]}
              accessibilityRole="button"
              accessibilityLabel="Go to Prime Gaming Webpage"
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <StoreIcon store="prime" size={18} color="#0A0A0C" />
                <Text style={[styles.ctaBtnText, styles.ctaBtnTextUnclaimed]}>Go to Webpage</Text>
                <Ionicons name="open-outline" size={16} color="#0A0A0C" />
              </View>
            </Pressable>
          </Animated.View>
        ) : androidUrl && iosUrl ? (
          <Animated.View style={{ flexDirection: 'row', gap: 12, width: '100%', opacity: unclaimFadeAnim }}>
            <Animated.View style={{ flex: 1, transform: [{ scale: ctaBtnPress.scaleAnim }] }}>
              <Pressable
                onPress={handleAndroidPress}
                onLongPress={handleAndroidPress}
                delayLongPress={500}
                onPressIn={ctaBtnPress.onPressIn}
                onPressOut={ctaBtnPress.onPressOut}
                style={[
                  styles.ctaBtn,
                  isClaimed ? styles.ctaBtnClaimed : styles.ctaBtnUnclaimed,
                  { width: '100%' }
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                  {isClaimed ? (
                    <Ionicons name="checkmark" size={16} color="#A1A1A6" style={{ marginRight: 6 }} />
                  ) : (
                    <Ionicons name="logo-android" size={16} color="#000000" style={{ marginRight: 6 }} />
                  )}
                  <Text style={[styles.ctaBtnText, isClaimed ? styles.ctaBtnTextClaimed : styles.ctaBtnTextUnclaimed]}>
                    {isClaimed ? 'Claimed (Android)' : 'Claim (Android) ↗'}
                  </Text>
                </View>
              </Pressable>
            </Animated.View>

            <Animated.View style={{ flex: 1, transform: [{ scale: ctaBtnPress.scaleAnim }] }}>
              <Pressable
                onPress={handleIosPress}
                onLongPress={handleIosPress}
                delayLongPress={500}
                onPressIn={ctaBtnPress.onPressIn}
                onPressOut={ctaBtnPress.onPressOut}
                style={[
                  styles.ctaBtn,
                  isClaimed
                    ? styles.ctaBtnClaimed
                    : { width: '100%', backgroundColor: '#1C1C1E', borderWidth: 1, borderColor: '#3A3A3D' }
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                  {isClaimed ? (
                    <Ionicons name="checkmark" size={16} color="#A1A1A6" style={{ marginRight: 6 }} />
                  ) : (
                    <Ionicons name="logo-apple" size={16} color="#EDEDEB" style={{ marginRight: 6 }} />
                  )}
                  <Text style={[styles.ctaBtnText, { color: isClaimed ? '#A1A1A6' : '#EDEDEB' }]}>
                    {isClaimed ? 'Claimed (iOS)' : 'Claim (iOS) ↗'}
                  </Text>
                </View>
              </Pressable>
            </Animated.View>
          </Animated.View>
        ) : (
          <>
            <Animated.View style={{ opacity: unclaimFadeAnim, transform: [{ scale: ctaBtnPress.scaleAnim }], width: '100%' }}>
              <Pressable
                onPress={isClaimed ? undefined : handleDirectPress}
                onLongPress={isClaimed ? undefined : handleDirectPress}
                delayLongPress={500}
                onPressIn={isClaimed ? undefined : ctaBtnPress.onPressIn}
                onPressOut={isClaimed ? undefined : ctaBtnPress.onPressOut}
                disabled={isClaimed}
                style={[styles.ctaBtn, isClaimed ? styles.ctaBtnClaimed : styles.ctaBtnUnclaimed]}
                accessibilityRole="button"
                accessibilityLabel={isClaimed ? 'Claimed' : `Claim on ${currentDeal.platform || hostInfo.host || 'Store'}`}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                  {isClaimed && (
                    <Ionicons name="checkmark" size={17} color="#A1A1A6" style={{ marginRight: 6 }} />
                  )}
                  <Text style={[styles.ctaBtnText, isClaimed ? styles.ctaBtnTextClaimed : styles.ctaBtnTextUnclaimed]}>
                    {isClaimed
                      ? 'Claimed'
                      : hostInfo.isTaskHost
                      ? `Enter on ${hostInfo.host}`
                      : isPrimeDeal
                      ? 'Claim on Prime Gaming'
                      : `Claim on ${currentDeal.platform || hostInfo.host || 'Store'}`}
                  </Text>
                </View>
              </Pressable>
            </Animated.View>

            {/* Secondary Action: Undo if claimed, Mark as claimed if unclaimed */}
            <Pressable
              onPress={isClaimed ? handleUnclaim : executeClaim}
              style={styles.manualClaimBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={isClaimed ? 'Undo claim' : 'Mark as claimed'}
            >
              <Text style={styles.manualClaimText}>
                {isClaimed ? (
                  <>Claimed · <Text style={styles.manualClaimUnderline}>Undo</Text></>
                ) : (
                  <>Already claimed? <Text style={styles.manualClaimUnderline}>Mark as claimed</Text></>
                )}
              </Text>
            </Pressable>
          </>
        )}
      </View>

      {/* Undo Toast for Detail Page Unclaim */}
      {undoToastVisible && (
        <View style={[styles.undoToast, { bottom: insets.bottom + 76 }]}>
          <Text style={styles.undoToastText}>Removed from Vault</Text>
          <Text style={styles.undoToastDivider}>·</Text>
          <Pressable onPress={handleUndoUnclaim} hitSlop={8}>
            <Text style={styles.undoToastAction}>UNDO</Text>
          </Pressable>
        </View>
      )}

      {/* 2c & 2d: "Did you claim it?" Bottom Sheet Prompt */}
      {showClaimPrompt && (
        <ContainedModal
          visible={showClaimPrompt}
          transparent={true}
          statusBarTranslucent={true}
          navigationBarTranslucent={true}
          animationType="fade"
          onRequestClose={() => setShowClaimPrompt(false)}
        >
          <Pressable
            style={[
              styles.bottomSheetOverlay,
              {
                paddingBottom: Math.max(insets.bottom, 16) + 12,
              },
            ]}
            onPress={() => setShowClaimPrompt(false)}
          >
            <Animated.View
              style={[
                styles.bottomSheetDialog,
                {
                  transform: [{ translateY: sheetSpring }],
                },
              ]}
            >
              <Pressable style={{ width: '100%' }} onPress={(e) => e.stopPropagation()}>
                <View style={styles.sheetHandle} />
                <Text style={styles.sheetTitle}>Did you claim it?</Text>
                <Text style={styles.sheetSubtitle}>
                  Add {cleanDisplayTitle(currentDeal.title)} to your Vault to track your games and savings.
                </Text>

                <View style={styles.sheetActionRow}>
                  <Animated.View style={{ flex: 1, transform: [{ scale: sheetSecondaryPress.scaleAnim }] }}>
                    <Pressable
                      onPress={handleNotYet}
                      onPressIn={sheetSecondaryPress.onPressIn}
                      onPressOut={sheetSecondaryPress.onPressOut}
                      style={styles.sheetSecondaryBtn}
                      accessibilityRole="button"
                      accessibilityLabel="Not yet"
                    >
                      <Text style={styles.sheetSecondaryBtnText}>Not yet</Text>
                    </Pressable>
                  </Animated.View>

                  <Animated.View style={{ flex: 1, transform: [{ scale: sheetPrimaryPress.scaleAnim }] }}>
                    <Pressable
                      onPress={executeClaim}
                      onPressIn={sheetPrimaryPress.onPressIn}
                      onPressOut={sheetPrimaryPress.onPressOut}
                      style={styles.sheetPrimaryBtn}
                      accessibilityRole="button"
                      accessibilityLabel="Yes, add to Vault"
                    >
                      <Text style={styles.sheetPrimaryBtnText}>Yes, add to Vault</Text>
                    </Pressable>
                  </Animated.View>
                </View>
              </Pressable>
            </Animated.View>
          </Pressable>
        </ContainedModal>
      )}

      {/* Full-screen Screenshot Modal Viewer: Pinch/Pan/Swipe/DoubleTap */}
      {selectedScreenshotIndex !== null && (
        <ContainedModal
          visible={selectedScreenshotIndex !== null}
          transparent={true}
          statusBarTranslucent={true}
          navigationBarTranslucent={true}
          animationType="fade"
          onRequestClose={() => setSelectedScreenshotIndex(null)}
        >
          <View style={styles.modalRootContainer}>
            <StatusBar backgroundColor="#000000" barStyle="light-content" translucent={true} />
            <View style={[styles.modalHeaderBar, { paddingTop: Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 16 : 48) }]}>
              <Pressable
                onPress={() => {
                  hapticFeedback.light();
                  setSelectedScreenshotIndex(null);
                }}
                hitSlop={12}
                style={styles.modalCloseBtn48}
                accessibilityRole="button"
                accessibilityLabel="Close screenshot gallery"
              >
                <Ionicons name="close" size={26} color="#EDEDEB" />
              </Pressable>

              <Text style={styles.modalCounter}>
                {selectedScreenshotIndex !== null ? selectedScreenshotIndex + 1 : 1} / {screenshots.length}
              </Text>

              <View style={{ width: 48, height: 48 }} />
            </View>

            <Animated.View
              style={[
                styles.modalGalleryContainer,
                { transform: [{ translateY: viewerSpring }] },
              ]}
            >
              <FlatList
                data={screenshots}
                keyExtractor={(item, idx) => `modal-screen-${item.id || idx}`}
                horizontal
                pagingEnabled={!isModalZoomed}
                scrollEnabled={!isModalZoomed}
                showsHorizontalScrollIndicator={false}
                initialScrollIndex={selectedScreenshotIndex ?? 0}
                onScrollToIndexFailed={() => {}}
                getItemLayout={(_, index) => ({
                  length: screenWidth,
                  offset: screenWidth * index,
                  index,
                })}
                onMomentumScrollEnd={(e) => {
                  const nextIdx = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
                  setSelectedScreenshotIndex(nextIdx);
                  setIsModalZoomed(false);
                }}
                renderItem={({ item }) => (
                  <View style={[styles.modalImageWrapper, { width: screenWidth }]}>
                    <ZoomableImage
                      uri={item.path_full}
                      thumbnailUri={item.path_thumbnail}
                      width={screenWidth}
                      height={Dimensions.get('window').height * 0.78}
                      onZoomChange={setIsModalZoomed}
                      onSwipeDown={() => {
                        hapticFeedback.light();
                        setSelectedScreenshotIndex(null);
                      }}
                    />
                  </View>
                )}
              />
            </Animated.View>
          </View>
        </ContainedModal>
      )}

      {/* 18+ Mature Content Gate Modal */}
      {show18Warning && (
        <Gate18PlusModal
          visible={!!show18Warning}
          dealId={currentDeal.id}
          onClose={() => {
            setShow18Warning(false);
            if (!dealsStore.is18PlusRevealed(currentDeal.id) && !dealsStore.getAlwaysShow18Plus()) {
              onClose();
            }
          }}
          onRevealed={() => {
            setShow18Warning(false);
            dealsStore.getScreenshotsForDeal(currentDeal).then((data) => {
              if (Array.isArray(data)) setScreenshots(data);
            });
          }}
        />
      )}

      {/* Native In-App Trailer Player Modal (Mounted on-demand only when user taps it) */}
      {nativeTrailerVisible && (
        <NativeTrailerPlayer
          visible={nativeTrailerVisible}
          videoUrl={trailer?.url || ''}
          onClose={() => setNativeTrailerVisible(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  edgeSwipeContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 32,
    zIndex: 9999,
  },
  edgeSwipeStrip: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  container: {
    flex: 1,
    backgroundColor: '#000000',
    position: 'relative',
    overflow: 'hidden',
  },
  headerContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 50,
  },
  floatingHeaderRow: {
    ...(StyleSheet.absoluteFill as any),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  stickyOpaqueBar: {
    ...(StyleSheet.absoluteFill as any),
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  stickyBarTitle: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: '#EDEDEB',
    flex: 1,
    marginHorizontal: 12,
  },
  touchTarget48: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
  },
  touchTarget48Transparent: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scrollContent: {
    paddingBottom: 130,
  },
  artworkContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    maxHeight: 280,
    backgroundColor: '#000000',
    overflow: 'hidden',
    position: 'relative',
  },
  heroTopFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
    zIndex: 2,
  },
  heroBottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
    zIndex: 2,
  },
  title: {
    fontFamily: FONTS.extraBold,
    fontSize: 28,
    lineHeight: 34,
    color: '#EDEDEB',
    letterSpacing: -0.6,
    paddingHorizontal: 20,
    marginTop: 18,
  },
  headerStructuredMeta: {
    paddingHorizontal: 20,
    marginTop: 10,
  },
  headerMetaTagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  headerStorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerStoreText: {
    fontFamily: FONTS.mono,
    fontSize: 10.5,
    fontWeight: '700',
    color: '#EDEDEB',
    letterSpacing: 0.2,
  },
  headerInfoPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerInfoPillText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: '#A1A1A6',
    letterSpacing: 0.2,
  },
  headerRatingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerRatingScore: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: '#EDEDEB',
    letterSpacing: 0.2,
  },
  headerRatingLabel: {
    fontFamily: FONTS.regular,
    fontSize: 10.5,
    color: '#86868B',
  },
  priceRow: {
    paddingHorizontal: 20,
    marginTop: 18,
  },
  clockWrap: {
    paddingHorizontal: 20,
    marginTop: 24,
  },

  // Borderless Stat Row (Metacritic, Median Playtime, Claimed)
  borderlessStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    marginTop: 24,
    marginBottom: 6,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  statValue: {
    fontFamily: FONTS.extraBold,
    fontSize: 20,
    lineHeight: 24,
    color: '#EDEDEB',
    textAlign: 'center',
  },
  statLabelText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: '#86868B',
    letterSpacing: 0.2,
    marginTop: 4,
    textAlign: 'center',
  },

  // Solo Metric Glass Banner (Single Stat: Metacritic, Steam Rating, Playtime, or Claimed)
  soloGlassBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  soloGlassIcon: {
    marginRight: 10,
  },
  soloGlassText: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: '#8E8E93',
    letterSpacing: 0.1,
  },
  soloGlassHighlight: {
    fontFamily: FONTS.semiBold,
    fontSize: 13,
    color: '#EDEDEB',
  },

  // Solo Claimed Social Proof Banner (legacy alias)
  soloClaimedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  soloClaimedIcon: {
    marginRight: 10,
  },
  soloClaimedText: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: '#8E8E93',
    letterSpacing: 0.1,
  },
  soloClaimedHighlight: {
    fontFamily: FONTS.semiBold,
    fontSize: 13,
    color: '#EDEDEB',
  },

  // Media Strip below stats
  mediaSectionWrap: {
    marginTop: 36,
  },
  mediaStripContent: {
    paddingHorizontal: 20,
    gap: 12,
    marginTop: 10,
  },
  mediaThumbnailCard: {
    width: 124,
    height: 70,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#111317',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    position: 'relative',
  },
  mediaThumbnailImg: {
    width: '100%',
    height: '100%',
  },
  trailerPlayBadge: {
    position: 'absolute',
    bottom: 6,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  trailerPlayText: {
    fontFamily: FONTS.mono,
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.2,
    color: '#EDEDEB',
  },

  sectionWrap: {
    paddingHorizontal: 20,
    marginTop: 36,
  },
  sectionLabel: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: '#86868B',
    letterSpacing: 0.2,
  },
  descriptionText: {
    fontFamily: FONTS.regular,
    fontSize: 14.5,
    lineHeight: 22,
    color: '#EDEDEB',
    marginTop: 8,
  },
  readMoreBtn: {
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  readMoreText: {
    fontFamily: FONTS.mono,
    fontSize: 11.5,
    color: '#EDEDEB',
    fontWeight: '600',
  },
  claimCodeCard: {
    backgroundColor: '#111317',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 16,
    marginHorizontal: 20,
    marginTop: 24,
  },
  claimCodeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  claimCodeLabel: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    letterSpacing: 0.2,
    color: '#86868B',
  },
  claimCodeTapHint: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: '#636366',
  },
  claimCodeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0A0A0C',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  claimCodeText: {
    fontFamily: FONTS.mono,
    fontSize: 14,
    color: '#EDEDEB',
    fontWeight: '600',
    letterSpacing: 1,
    flex: 1,
    marginRight: 10,
  },
  claimCodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1E2025',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  claimCodeBadgeText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    fontWeight: '700',
    color: '#EDEDEB',
    letterSpacing: 0.5,
  },
  instructionsText: {
    fontFamily: FONTS.regular,
    fontSize: 13.5,
    lineHeight: 20,
    color: '#D1D1D6',
    marginTop: 8,
  },
  specSheetWrap: {
    paddingHorizontal: 20,
    marginTop: 36,
  },
  specSheetList: {
    marginTop: 12,
  },
  specSheetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  specSheetRowLast: {
    borderBottomWidth: 0,
  },
  specSheetLabel: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: '#86868B',
    letterSpacing: 0.5,
    flex: 1,
  },
  specSheetValue: {
    fontFamily: FONTS.medium,
    fontSize: 13.5,
    color: '#EDEDEB',
    textAlign: 'right',
    flex: 1.5,
  },
  detailsCollapsibleWrap: {
    paddingHorizontal: 20,
    marginTop: 36,
  },
  detailsHeaderPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#1C1C1E',
  },
  detailsHeaderTitle: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    fontWeight: '700',
    color: '#86868B',
    letterSpacing: 0.4,
  },
  detailsContentBody: {
    marginTop: 16,
    gap: 20,
  },
  detailsSubLabel: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: '#86868B',
    letterSpacing: 0.2,
    marginBottom: 8,
  },
  detailsInstructionsBlock: {
    backgroundColor: '#0D0E11',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 16,
  },
  detailsVoucherCard: {
    backgroundColor: '#0D0E11',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 16,
  },
  detailsInfoBlock: {
    marginTop: 4,
  },
  ruledSection: {
    paddingHorizontal: 20,
    marginTop: 32,
  },
  ruledCard: {
    backgroundColor: '#111317',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 16,
    marginTop: 8,
  },
  ruledRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  ruledLabel: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: '#86868B',
    letterSpacing: 0.2,
    flex: 1,
  },
  ruledValue: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: '#EDEDEB',
    textAlign: 'right',
    flex: 1.5,
  },
  playtimeAttribution: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: '#86868B',
    letterSpacing: 0.2,
    marginTop: 12,
  },
  plainRowsList: {
    marginTop: 8,
  },
  plainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.12)',
  },
  plainLabel: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: '#A1A1A6',
    letterSpacing: 0.2,
    flex: 1,
  },
  plainValue: {
    fontFamily: FONTS.bold,
    fontSize: 13.5,
    color: '#EDEDEB',
    textAlign: 'right',
    flex: 1.5,
  },
  ctaContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: '#000000',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
  },
  floatLabelContainer: {
    position: 'absolute',
    top: -24,
    alignSelf: 'center',
    zIndex: 20,
  },
  floatLabelText: {
    fontFamily: FONTS.extraBold,
    fontSize: 24,
    color: '#EDEDEB',
    letterSpacing: -0.5,
  },
  ctaBtn: {
    width: '100%',
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  ctaBtnEnded: {
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  ctaBtnTextEnded: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: '#636366',
  },
  ctaBtnUnclaimed: {
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  ctaBtnClaimed: {
    backgroundColor: '#161618',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  ctaBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    letterSpacing: 0.3,
    zIndex: 2,
  },
  ctaBtnTextUnclaimed: {
    color: '#0A0A0C',
  },
  ctaBtnTextClaimed: {
    color: '#EDEDEB',
  },
  modalRootContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  modalHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#000000',
    zIndex: 10,
  },
  modalCloseBtn48: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  modalCounter: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    color: '#EDEDEB',
    letterSpacing: 0.2,
    
  },
  modalGalleryContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 40,
    backgroundColor: '#000000',
  },
  modalImageWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  bottomSheetDialog: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: '#161618',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 24,
    minHeight: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 24,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3A3A3D',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontFamily: FONTS.extraBold,
    fontSize: 18,
    color: '#EDEDEB',
    marginBottom: 6,
  },
  sheetSubtitle: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: '#86868B',
    lineHeight: 20,
    marginBottom: 20,
  },
  sheetActionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  sheetSecondaryBtn: {
    flex: 1,
    height: 48,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: '#3A3A3D',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetSecondaryBtnText: {
    fontFamily: FONTS.mono,
    fontSize: 13,
    fontWeight: '600',
    color: '#86868B',
  },
  sheetPrimaryBtn: {
    flex: 1.25,
    height: 48,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: RADIUS.button,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetPrimaryBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 13.5,
    color: '#0A0A0C',
  },
  manualClaimBtn: {
    marginTop: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  manualClaimText: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: '#86868B',
  },
  manualClaimUnderline: {
    textDecorationLine: 'underline',
    color: '#EDEDEB',
  },
  undoToast: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 99,
  },
  undoToastText: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: '#EDEDEB',
  },
  undoToastDivider: {
    color: '#86868B',
    fontSize: 13,
  },
  undoToastAction: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.accent,
  },
  bundleNoticeBody: {
    paddingTop: 68,
    paddingHorizontal: 20,
  },
  bundleTaglineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  bundleTaglineText: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    fontWeight: '700',
    color: '#86868B',
    letterSpacing: 0.2,
  },
  bundleTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontSize: 32,
    fontWeight: '700',
    color: '#EDEDEB',
    letterSpacing: -0.5,
    marginBottom: 16,
  },
  bundlePriceRow: {
    marginTop: 8,
    marginBottom: 24,
  },
  bundlePriceText: {
    fontFamily: FONTS.mono,
    fontSize: 20,
    fontWeight: '700',
    color: '#EDEDEB',
    letterSpacing: -0.3,
  },
  bundleRuledRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#1C1C1E',
    marginBottom: 28,
  },
  bundleRuledLabel: {
    fontFamily: FONTS.mono,
    fontSize: 13,
    color: '#86868B',
    letterSpacing: 0.2,
  },
  bundleRuledValue: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: '#EDEDEB',
  },
  bundleGamesSection: {
    marginTop: 4,
  },
  bundleGamesPrompt: {
    fontFamily: FONTS.regular,
    fontSize: 15,
    lineHeight: 22,
    color: '#EDEDEB',
    marginBottom: 12,
  },
  bundleGamesList: {
    fontWeight: '600',
    color: '#FFFFFF',
  },
  bundleFullPrompt: {
    fontFamily: FONTS.mono,
    fontSize: 13,
    color: '#86868B',
    lineHeight: 18,
  },
  endedContainer: {
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 32,
    alignItems: 'center',
  },
  endedIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  endedTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontSize: 22,
    fontWeight: '700',
    color: '#EDEDEB',
    textAlign: 'center',
    marginBottom: 10,
  },
  endedSubtitle: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: '#86868B',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
    marginBottom: 28,
  },
  endedActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    maxWidth: 320,
  },
  endedOpenBtn: {
    flex: 1,
    height: 48,
    backgroundColor: '#2C2C2E',
    borderRadius: RADIUS.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endedOpenBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 13.5,
    color: '#EDEDEB',
  },
  endedBackBtn: {
    flex: 1,
    height: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endedBackBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 13.5,
    color: '#0A0A0C',
  },
});
