import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  Pressable,
  Animated,
  Easing,
  Platform,
  Vibration,
  AccessibilityInfo,
  AppState,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hapticFeedback } from '../utils/haptics';
import { checkIsReduceMotionEnabled, subscribeToReduceMotion } from '../utils/motion';
import { Deal } from '../models/Deal';
import { dealsStore } from '../services/dealsStore';
import {
  isDealExpired,
  getTimeLeft,
  isDealClaimed,
  calculateVaultValue,
  parseDateToMs,
  getGiveawayHostName,
  isGameOnlyDeal,
  isPostRemovedByModerator,
  cleanDisplayTitle,
  clearSessionFailedUrls,
} from '../utils/dealUtils';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, RADIUS } from '../theme/theme';
import GameArtwork from '../components/GameArtwork';
import CountdownClock from '../components/CountdownClock';
import StoreIcon, { storeShortName } from '../components/StoreIcon';
import TypeBadge from '../components/TypeBadge';
import Price from '../components/Price';
import { useAppClockMinutes } from '../services/appClock';
import { PosterCard, BannerCard, LandscapeCard, useCardPressScale } from '../components/UnifiedCards';
import { HomeSkeleton, useSkeletonDisplay } from '../components/LootSkeleton';
import AnimatedSyncHairline from '../components/AnimatedSyncHairline';
import AnimatedCardEntrance from '../components/AnimatedCardEntrance';
import MonospacePullTicker from '../components/MonospacePullTicker';

let hasAnimatedHomeFirstLaunch = false;

const TOP_RATED_CARD_WIDTH = 270;
const TOP_RATED_CARD_GAP = 14;
const TOP_RATED_STEP = TOP_RATED_CARD_WIDTH + TOP_RATED_CARD_GAP; // 284

interface HomeScreenProps {
  onDealSelect: (deal: Deal) => void;
  claimedDeals: Deal[];
  userName: string;
  scrollRef?: React.RefObject<any>;
  onNavigateToFeed?: (params?: { filterUnclaimed?: boolean }) => void;
  isDetailOpen?: boolean;
  isActive?: boolean;
}

// ─── Stats Number Count-Up (Part 2 Item 4: 700ms ease-out) ──────────────────
function AnimatedCountUp({
  value,
  prefix = '',
  suffix = '',
  duration = 900,
  style,
  reduceMotion = false,
}: {
  value: number | string;
  prefix?: string;
  suffix?: string;
  duration?: number;
  style?: any;
  reduceMotion?: boolean;
}) {
  const numTarget =
    typeof value === 'number'
      ? value
      : parseFloat(String(value).replace(/[^0-9.]/g, '')) || 0;

  const [displayNum, setDisplayNum] = useState(() => (reduceMotion ? numTarget : 0));
  const prevTargetRef = useRef(reduceMotion ? numTarget : 0);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduceMotion) {
      setDisplayNum(numTarget);
      prevTargetRef.current = numTarget;
      return;
    }

    const startVal = prevTargetRef.current;
    const endVal = numTarget;
    prevTargetRef.current = endVal;

    if (startVal === endVal) {
      setDisplayNum(endVal);
      return;
    }

    const startTime = Date.now();

    const frame = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // ease-out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = startVal + (endVal - startVal) * ease;
      setDisplayNum(Math.round(current));

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(frame);
      } else {
        setDisplayNum(endVal);
      }
    };

    animFrameRef.current = requestAnimationFrame(frame);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [numTarget, duration, reduceMotion]);

  return (
    <Text style={style}>
      {prefix}
      {displayNum.toLocaleString()}
      {suffix}
    </Text>
  );
}

function getGreetingBase(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function isUnder12Hours(deal: Deal): boolean {
  const rawEnd = deal.endDate || deal.expiresAt;
  if (!rawEnd) return false;
  const upper = String(rawEnd).toUpperCase().trim();
  if (upper === 'N/A' || upper.includes('PERMANENT') || upper.includes('NO EXP')) return false;
  const endMs = parseDateToMs(rawEnd);
  const diffHours = (endMs - Date.now()) / (1000 * 60 * 60);
  return diffHours > 0 && diffHours < 12;
}

// ─── Pulsing Live Dot (Theme Token #EDEDEB, No Lime) ──────────────────────────
function AnimatedPulseDot({ color = '#EDEDEB', fast = false }: { color?: string; fast?: boolean }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    const dur = fast ? 450 : 1200;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scaleAnim, {
            toValue: 1.6,
            duration: dur,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0.2,
            duration: dur,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: dur,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0.8,
            duration: dur,
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [scaleAnim, opacityAnim, fast]);

  return (
    <View style={styles.pulseContainer}>
      <Animated.View
        style={[
          styles.pulseRing,
          {
            backgroundColor: color,
            transform: [{ scale: scaleAnim }],
            opacity: opacityAnim,
          },
        ]}
      />
      <View style={[styles.pulseCore, { backgroundColor: color }]} />
    </View>
  );
}

let isDetailScreenActive = false;
export function setDetailScreenActive(active: boolean) {
  isDetailScreenActive = active;
}
export function getDetailScreenActive() {
  return isDetailScreenActive;
}

function CompactDealRow({
  deal,
  onPress,
}: {
  deal: Deal;
  onPress: (deal: Deal) => void;
}) {
  const rawEnd = deal.expiresAt || deal.endDate;
  const rawWorth = deal.worth || deal.originalPrice;
  const endMs = rawEnd ? parseDateToMs(rawEnd) : 0;
  const hoursLeft = endMs ? (endMs - Date.now()) / (1000 * 60 * 60) : 999;
  const isUrgent = hoursLeft > 0 && hoursLeft < 24;
  const timeLeft = getTimeLeft(rawEnd, deal.platform);
  const savings = rawWorth ? `Save ${rawWorth.startsWith('$') ? rawWorth : `$${rawWorth}`}` : 'FREE';

  const hasRealRating =
    typeof deal.steamRatingPercent === 'number' &&
    deal.steamRatingPercent > 0 &&
    (deal.steamReviewCount ? deal.steamReviewCount >= 10 : true);
  const ratingPercent = hasRealRating ? deal.steamRatingPercent : null;
  const storeName = storeShortName(deal.platform).toUpperCase();

  return (
    <Pressable
      onPress={() => onPress(deal)}
      style={({ pressed }) => [
        styles.compactRow,
        pressed && styles.compactRowPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${cleanDisplayTitle(deal.title)}, ${timeLeft}`}
    >
      <View style={styles.compactThumbWrap}>
        <GameArtwork
          deal={deal}
          uri={deal.resolvedPoster || deal.resolvedImage || deal.image}
          title={deal.title}
          platform={deal.platform}
          isNsfw={deal.isNsfw}
          style={styles.compactThumbImg}
        />
      </View>
      <View style={styles.compactInfoWrap}>
        <Text numberOfLines={1} style={styles.compactTitle}>
          {cleanDisplayTitle(deal.title)}
        </Text>
        <View style={styles.compactMetaRow}>
          {ratingPercent ? (
            <>
              <Text style={styles.compactRatingText}>
                {ratingPercent}%{deal.reviewScore ? ` ${deal.reviewScore}` : ''}
              </Text>
              <Text style={styles.compactDot}>·</Text>
            </>
          ) : null}
          <Text style={styles.compactStoreText}>{storeName}</Text>
          <Text style={styles.compactDot}>·</Text>
          <Text style={styles.compactSavings}>{savings}</Text>
          <Text style={styles.compactDot}>·</Text>
          <Text style={[styles.compactTimeLeft, isUrgent && styles.compactTimeLeftUrgent]}>
            {timeLeft}
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#636366" />
    </Pressable>
  );
}

// ─── Main HomeScreen Component ────────────────────────────────────────────────
function HomeScreen({
  onDealSelect,
  userName,
  scrollRef,
  onNavigateToFeed,
  isDetailOpen = false,
  isActive = true,
}: HomeScreenProps) {
  const insets = useSafeAreaInsets();
  const [, setTick] = useState(0);

  useEffect(() => {
    dealsStore.init();
    const unsub = dealsStore.subscribe(() => {
      setTick((t) => t + 1);
    });
    return () => unsub();
  }, []);

  const syncState = dealsStore.getSyncState();
  const refreshing = syncState === 'syncing';
  const activeDeals = dealsStore.getActiveDeals();
  const heroDeal = dealsStore.getHero();
  const topRatedDeals = dealsStore.getTopRated();
  const endingSoon = dealsStore.getEndingSoon();
  const stats = dealsStore.getStats();
  const primeNotice = dealsStore.getPrimeNotice();

  const nowMs = useAppClockMinutes();
  const lastSync = dealsStore.getLastSyncTimestamp();
  const isOffline = dealsStore.isOffline();
  const updatedText = useMemo(() => {
    if (!lastSync) return 'Updated just now';
    const diffMins = Math.floor((nowMs - lastSync) / 60000);
    if (diffMins <= 0) return 'Updated just now';
    if (diffMins === 1) return 'Updated 1 min ago';
    if (diffMins < 60) return `Updated ${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    return `Updated ${diffHours} hr ago`;
  }, [nowMs, lastSync]);

  // Prefetch images for visible items ahead of time (Req 3)
  useEffect(() => {
    const urls: string[] = [];
    if (heroDeal) {
      const uri = heroDeal.resolvedImage || heroDeal.image;
      if (uri) urls.push(uri);
    }
    topRatedDeals.slice(0, 6).forEach((d) => {
      const uri = d.resolvedImage || d.image || d.resolvedPoster;
      if (uri) urls.push(uri);
    });
    endingSoon.slice(0, 6).forEach((d) => {
      const uri = d.resolvedImage || d.image || d.resolvedPoster;
      if (uri) urls.push(uri);
    });
    urls.forEach((u) => {
      if (u && typeof u === 'string' && u.startsWith('http')) {
        ExpoImage.prefetch(u).catch(() => {});
      }
    });
  }, [heroDeal?.id, topRatedDeals.length, endingSoon.length]);

  const [isReduceMotion, setIsReduceMotion] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);

  // First-launch list entrance (Part 2 Item b: initial cards rise 16px and fade in with 60ms stagger)
  const [entranceTrigger, setEntranceTrigger] = useState(!hasAnimatedHomeFirstLaunch);
  useEffect(() => {
    if (!hasAnimatedHomeFirstLaunch) {
      hasAnimatedHomeFirstLaunch = true;
      const timer = setTimeout(() => {
        setEntranceTrigger(false);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  // Sync spin animation
  const syncSpinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let spinLoop: Animated.CompositeAnimation | null = null;
    if (syncState === 'syncing' || refreshing) {
      syncSpinAnim.setValue(0);
      spinLoop = Animated.loop(
        Animated.timing(syncSpinAnim, {
          toValue: 1,
          duration: 750,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      spinLoop.start();
    } else {
      syncSpinAnim.setValue(0);
    }
    return () => {
      spinLoop?.stop();
    };
  }, [syncState, refreshing, syncSpinAnim]);

  const syncSpinInterpolate = syncSpinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Hero animations
  const heroPopScale = useRef(new Animated.Value(1)).current;
  const heroBorderFlash = useRef(new Animated.Value(0)).current;

  // Press feedback hooks (Part 2 Item 1: 90ms down to 0.98, 140ms up to 1.0)
  const heroCardPress = useCardPressScale(isReduceMotion);
  const heroBtnPress = useCardPressScale(isReduceMotion);

  // Track app state for auto-advance pausing
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      setAppState(nextState);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    checkIsReduceMotionEnabled().then(setIsReduceMotion);
    return subscribeToReduceMotion(setIsReduceMotion);
  }, []);

  const handleImageError = useCallback((id: string) => {}, []);

  const topRatedKeyExtractor = useCallback((item: Deal, index: number) => `${item.id}_${index}`, []);

  const renderTopRatedItem = useCallback(
    ({ item }: { item: Deal }) => (
      <View style={styles.topRatedItemWrap}>
        <LandscapeCard
          deal={item}
          onPress={onDealSelect}
          width={TOP_RATED_CARD_WIDTH}
          onImageError={handleImageError}
        />
      </View>
    ),
    [onDealSelect, handleImageError]
  );

  const heroHostInfo = useMemo(() => (heroDeal ? getGiveawayHostName(heroDeal) : { host: '', isTaskHost: false }), [heroDeal]);

  // Endless loop FlatList setup: repeat 3 cycles so it loops smoothly with low memory
  const REPEAT_COUNT = 3;

  const repeatedTopRated = useMemo(() => {
    if (topRatedDeals.length < 2) return topRatedDeals;
    const arr: Deal[] = [];
    for (let i = 0; i < REPEAT_COUNT; i++) {
      arr.push(...topRatedDeals);
    }
    return arr;
  }, [topRatedDeals, REPEAT_COUNT]);

  const topRatedRailRef = useRef<FlatList<Deal>>(null);
  const topRatedIndexRef = useRef(0);
  const isRailInitializedRef = useRef(false);
  const isInteractingRef = useRef(false);
  const autoAdvanceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const resumeTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Jump to middle copy initially (only on first initialization)
  useEffect(() => {
    if (topRatedDeals.length >= 2 && !isRailInitializedRef.current) {
      isRailInitializedRef.current = true;
      const middleCycle = Math.floor(REPEAT_COUNT / 2);
      const startIndex = middleCycle * topRatedDeals.length;
      topRatedIndexRef.current = startIndex;
      setTimeout(() => {
        topRatedRailRef.current?.scrollToOffset({
          offset: startIndex * TOP_RATED_STEP,
          animated: false,
        });
      }, 50);
    }
  }, [topRatedDeals.length, REPEAT_COUNT]);

  // Auto-advance every 3.8 seconds, pause on touch/drag or while looking at a game
  const startAutoAdvance = useCallback(() => {
    if (autoAdvanceTimerRef.current) clearInterval(autoAdvanceTimerRef.current);
    if (isReduceMotion || appState !== 'active' || isDetailScreenActive || topRatedDeals.length < 2) return;

    autoAdvanceTimerRef.current = setInterval(() => {
      if (isInteractingRef.current || isDetailScreenActive) return;
      const N = topRatedDeals.length;
      if (N < 2) return;

      const nextIndex = topRatedIndexRef.current + 1;
      topRatedIndexRef.current = nextIndex;

      topRatedRailRef.current?.scrollToOffset({
        offset: nextIndex * TOP_RATED_STEP,
        animated: true,
      });

      // Silently normalize back to middle set when reaching the upper cycle threshold.
      // Shifting by an exact multiple of N cards is 100% invisible because all posters align identically.
      if (nextIndex >= (REPEAT_COUNT - 4) * N) {
        setTimeout(() => {
          if (!isInteractingRef.current && !isDetailScreenActive) {
            const shiftCycles = Math.floor(REPEAT_COUNT / 2);
            const normalizedIndex = nextIndex - shiftCycles * N;
            topRatedIndexRef.current = normalizedIndex;
            topRatedRailRef.current?.scrollToOffset({
              offset: normalizedIndex * TOP_RATED_STEP,
              animated: false,
            });
          }
        }, 600);
      }
    }, 3800);
  }, [isReduceMotion, appState, topRatedDeals.length, REPEAT_COUNT]);

  useEffect(() => {
    startAutoAdvance();
    return () => {
      if (autoAdvanceTimerRef.current) clearInterval(autoAdvanceTimerRef.current);
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, [startAutoAdvance]);

  const handleTouchStart = () => {
    isInteractingRef.current = true;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
  };

  const handleTouchEnd = () => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      isInteractingRef.current = false;
    }, 5000);
  };

  const handleMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const N = topRatedDeals.length;
    if (N < 2) return;

    let currentIdx = Math.round(offsetX / TOP_RATED_STEP);
    topRatedIndexRef.current = currentIdx;

    const minIndex = 2 * N;
    const maxIndex = (REPEAT_COUNT - 3) * N;

    if (currentIdx < minIndex || currentIdx > maxIndex) {
      const middleCycle = Math.floor(REPEAT_COUNT / 2);
      const offsetInCycle = ((currentIdx % N) + N) % N;
      const normalizedIndex = middleCycle * N + offsetInCycle;
      topRatedIndexRef.current = normalizedIndex;
      topRatedRailRef.current?.scrollToOffset({
        offset: normalizedIndex * TOP_RATED_STEP,
        animated: false,
      });
    }
  };

  // Section 2: Ending soon (Selector: unclaimed drops ending soon, excluding hero)
  const endingSoonDeals = useMemo(() => {
    return dealsStore.getEndingSoon(heroDeal?.id).slice(0, 4);
  }, [heroDeal?.id]);

  // Real-data stats from central dealsStore
  const targetFreeValue = stats.freeRightNowValue;
  const [displayFreeValue, setDisplayFreeValue] = useState(targetFreeValue);
  const currentFreeValueRef = useRef(displayFreeValue);

  useEffect(() => {
    const startVal = currentFreeValueRef.current;
    if (Math.abs(targetFreeValue - startVal) < 0.01) return;

    if (isReduceMotion) {
      setDisplayFreeValue(targetFreeValue);
      currentFreeValueRef.current = targetFreeValue;
      return;
    }

    const startTime = Date.now();
    const duration = 900; // 900ms ease-out cubic

    const step = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / duration);
      const factor = 1 - Math.pow(1 - progress, 3);
      const current = startVal + (targetFreeValue - startVal) * factor;
      setDisplayFreeValue(current);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        currentFreeValueRef.current = targetFreeValue;
        setDisplayFreeValue(targetFreeValue);
      }
    };

    requestAnimationFrame(step);
  }, [targetFreeValue, isReduceMotion]);

  const liveCount = stats.liveCount;
  const claimedCount = stats.claimedCount;
  const toClaimCount = stats.toClaimCount;
  const endingSoonCount = endingSoon.length;

  // Claim moment on hero (Item 1 & 5)
  const triggerHeroClaimMoment = async () => {
    if (!heroDeal) return;
    hapticFeedback.success();

    try {
      await dealsStore.claimDeal(heroDeal);
    } catch {}

    if (!isReduceMotion) {
      // Kick from compressed state: spring overshoots naturally to ~1.05 then settles at 1.0
      heroPopScale.setValue(0.96);
      Animated.spring(heroPopScale, {
        toValue: 1,
        stiffness: 200,
        damping: 10,
        mass: 0.8,
        overshootClamping: false,
        useNativeDriver: true,
      }).start();

      Animated.sequence([
        Animated.timing(heroBorderFlash, { toValue: 1, duration: 200, useNativeDriver: false }),
        Animated.timing(heroBorderFlash, { toValue: 0, duration: 200, useNativeDriver: false }),
      ]).start();
    }
  };

  const heroBorderColor = heroBorderFlash.interpolate({
    inputRange: [0, 1],
    outputRange: ['#1C1C1E', '#EDEDEB'],
  });

  const [pullDistance, setPullDistance] = useState(0);
  const hasTriggeredHapticRef = useRef(false);
  const touchStartY = useRef(0);
  const isPullingRef = useRef(false);

  const handlePullTouchStart = useCallback((e: any) => {
    if (Platform.OS !== 'web') return;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    touchStartY.current = clientY;
    isPullingRef.current = false;
  }, []);

  const handlePullTouchMove = useCallback((e: any) => {
    if (Platform.OS !== 'web') return;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const deltaY = clientY - touchStartY.current;
    
    const scrollEl = (scrollRef?.current as any)?.getScrollableNode?.() || (scrollRef?.current as any);
    const scrollTop = scrollEl?.scrollTop ?? 0;
    
    if (scrollTop <= 2 && deltaY > 0) {
      isPullingRef.current = true;
      const damped = Math.min(90, deltaY * 0.45);
      setPullDistance(damped);
      if (damped >= 60 && !hasTriggeredHapticRef.current) {
        hasTriggeredHapticRef.current = true;
        hapticFeedback.light();
      }
    } else if (isPullingRef.current && deltaY <= 0) {
      setPullDistance(0);
      isPullingRef.current = false;
    }
  }, [scrollRef]);

  const handlePullTouchEnd = useCallback(() => {
    if (Platform.OS !== 'web') return;
    if (isPullingRef.current) {
      if (pullDistance >= 55) {
        hapticFeedback.light();
        setEntranceTrigger(true);
        setTimeout(() => setEntranceTrigger(false), 1200);
        dealsStore.sync(true);
      }
      setPullDistance(0);
      isPullingRef.current = false;
      hasTriggeredHapticRef.current = false;
    }
  }, [pullDistance]);

  const handleScroll = useCallback((event: any) => {
    const y = event?.nativeEvent?.contentOffset?.y ?? 0;
    if (y < 0) {
      const dist = Math.abs(y);
      setPullDistance(dist);
      if (dist >= 65 && !hasTriggeredHapticRef.current) {
        hasTriggeredHapticRef.current = true;
        hapticFeedback.light();
      }
    } else {
      if (pullDistance !== 0 && !isPullingRef.current) setPullDistance(0);
      hasTriggeredHapticRef.current = false;
    }
  }, [pullDistance]);

  const { showSkeleton, contentFadeAnim } = useSkeletonDisplay(
    activeDeals.length === 0,
    400
  );

  if (showSkeleton) {
    return <HomeSkeleton />;
  }

  return (
    <Animated.View style={[styles.container, { opacity: contentFadeAnim }]}>
      <AnimatedSyncHairline active={syncState === 'syncing' || refreshing} />

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onTouchStart={handlePullTouchStart}
        onTouchMove={handlePullTouchMove}
        onTouchEnd={handlePullTouchEnd}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 6 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              hapticFeedback.light();
              setEntranceTrigger(true);
              setTimeout(() => setEntranceTrigger(false), 1200);
              dealsStore.sync(true);
            }}
            tintColor={Platform.OS === 'ios' ? '#EDEDEB' : undefined}
            colors={Platform.OS === 'android' ? ['#EDEDEB'] : undefined}
            progressBackgroundColor={Platform.OS === 'android' ? '#161618' : undefined}
          />
        }
      >
        {/* Minimalist Monospace Pull-to-Refresh Ticker */}
        <MonospacePullTicker
          pullDistance={pullDistance}
          isSyncing={refreshing}
          isSyncedJustNow={syncState === 'synced_just_now'}
        />

        {/* Top Header Row */}
        <View style={styles.topRow}>
          <Text style={styles.wordmarkSmall}>Claimr</Text>
          <View style={styles.headerRightGroup}>
            {Boolean(updatedText) && (
              <Text style={styles.updatedTextSmall}>{updatedText}</Text>
            )}
            <Pressable
              onPress={() => dealsStore.sync(true)}
              hitSlop={8}
              disabled={syncState === 'syncing' || refreshing}
              style={({ pressed }) => [
                styles.refreshBtn,
                pressed && styles.syncPillPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Sync active deals"
            >
              {syncState === 'syncing' || refreshing ? (
                <Animated.View style={{ transform: [{ rotate: syncSpinInterpolate }] }}>
                  <Ionicons name="sync" size={17} color="#EDEDEB" />
                </Animated.View>
              ) : syncState === 'synced_just_now' ? (
                <Ionicons name="checkmark-circle" size={17} color="#EDEDEB" />
              ) : (
                <Ionicons name="sync-outline" size={17} color="#86868B" />
              )}
            </Pressable>
          </View>
        </View>

        {isOffline && (
          <View style={styles.offlineBanner}>
            <Ionicons name="cloud-offline-outline" size={13} color="#A1A1A6" />
            <Text style={styles.offlineBannerText}>Offline · Showing cached deals</Text>
          </View>
        )}

        {/* Editorial Greeting */}
        <Text style={styles.greeting} numberOfLines={1}>
          {getGreetingBase()}, {userName || 'Hunter'}.
        </Text>

        {/* Large Hero Savings Number (Vault Style) */}
        <View style={styles.heroNumberSection}>
          <View style={styles.heroNumberLabelRow}>
            <View style={styles.heroDot} />
            <Text style={styles.heroNumberLabel}>FREE RIGHT NOW</Text>
          </View>
          <Text style={styles.bigHeroNumber}>${Math.round(displayFreeValue)}</Text>
        </View>

        {/* 2-Column Stats HUD: Ending soon and to claim */}
        <View style={styles.statsGrid}>
          <View style={styles.statCol}>
            <Text style={styles.statLabel}>ENDING SOON</Text>
            <AnimatedCountUp
              value={endingSoonCount}
              suffix=" drops"
              duration={700}
              reduceMotion={isReduceMotion}
              style={[styles.statValue, endingSoonCount > 0 && { color: '#FF8A5B' }]}
            />
          </View>
          <Pressable
            onPress={() => onNavigateToFeed?.({ filterUnclaimed: true })}
            style={[styles.statCol, styles.statColDivided]}
          >
            <Text style={styles.statLabel}>TO CLAIM</Text>
            <AnimatedCountUp
              value={toClaimCount}
              suffix=" drops"
              duration={700}
              reduceMotion={isReduceMotion}
              style={[styles.statValue, toClaimCount > 0 ? { color: '#EDEDEB' } : { color: '#86868B' }]}
            />
          </Pressable>
        </View>

        {/* Home Hero: Unclaimed Only or Calm "All caught up" state (Round 3 Items 2, 4, 8) */}
        {heroDeal ? (
          <AnimatedCardEntrance index={0} reduceMotion={isReduceMotion} enabled={entranceTrigger}>
            <Animated.View style={[styles.hero, { borderColor: heroBorderColor, transform: [{ scale: heroCardPress.scaleAnim }] }]}>
              <Pressable
                onPress={() => onDealSelect(heroDeal)}
                onPressIn={heroCardPress.handlePressIn}
                onPressOut={heroCardPress.handlePressOut}
                unstable_pressDelay={0}
              >
                {/* 16:9 Art on top - no text or buttons on art */}
                <View style={styles.heroArtworkContainer}>
                  <GameArtwork
                    deal={heroDeal}
                    uri={heroDeal.resolvedImage || heroDeal.image}
                    title={heroDeal.title}
                    platform={heroDeal.platform}
                    isNsfw={heroDeal.isNsfw}
                    isHero={true}
                    style={StyleSheet.absoluteFill}
                    onError={() => handleImageError(heroDeal.id)}
                  />
                </View>

                {/* Solid #000 info strip below */}
                <View style={styles.heroInfoStrip}>
                  {/* Row 1: Type and store as one plain small line */}
                  <View style={styles.heroMetaRow}>
                    <Text style={styles.heroMetaLine}>
                      {[
                        heroDeal.type === 'dlc' ? 'DLC' : heroDeal.type === 'beta' ? 'BETA' : 'GAME',
                        (heroHostInfo.isTaskHost ? heroHostInfo.host : storeShortName(heroDeal.platform)).toUpperCase(),
                        heroDeal.steamRatingPercent && heroDeal.steamReviewCount && heroDeal.steamReviewCount >= 10
                          ? `${heroDeal.steamRatingPercent}% Steam`
                          : null,
                      ].filter(Boolean).join('  ·  ')}
                    </Text>
                  </View>

                  {/* Row 2: Clean Title (max 2 lines) */}
                  <Text numberOfLines={2} style={styles.heroTitle}>
                    {cleanDisplayTitle(heroDeal.title)}
                  </Text>

                  {/* Prominent Full-Width Countdown Clock with Progress Bar */}
                  <View style={styles.heroClockWrap}>
                    <CountdownClock
                      key={`${heroDeal.id}_${heroDeal.expiresAt || heroDeal.endDate || 'permanent'}`}
                      endDate={heroDeal.expiresAt || heroDeal.endDate}
                      startDate={heroDeal.createdAt ? new Date(heroDeal.createdAt).toISOString() : undefined}
                      size="md"
                    />
                  </View>

                  {/* Row 3: Action Row (Price on left, Claim button on right) */}
                  <View style={styles.heroActionRow}>
                    <Price
                      worth={heroDeal.worth || heroDeal.originalPrice}
                      isEstimated={heroDeal.isEstimated}
                      size="md"
                    />

                    <Animated.View style={{ transform: [{ scale: heroPopScale }, { scale: heroBtnPress.scaleAnim }] }}>
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation?.();
                          onDealSelect(heroDeal);
                        }}
                        onPressIn={heroBtnPress.handlePressIn}
                        onPressOut={heroBtnPress.handlePressOut}
                        onTouchEnd={heroBtnPress.handlePressOut}
                        onTouchCancel={heroBtnPress.handlePressOut}
                        unstable_pressDelay={0}
                        style={styles.heroBtn}
                      >
                        <Text style={styles.heroBtnText}>
                          View
                        </Text>
                      </Pressable>
                    </Animated.View>
                  </View>
                </View>
              </Pressable>
            </Animated.View>
          </AnimatedCardEntrance>
        ) : (
          /* Calm "All caught up" state (Round 3 Item 8) */
          <View style={styles.allCaughtUpCard}>
            <View style={styles.allCaughtUpIcon}>
              <Ionicons name="checkmark-circle-outline" size={26} color="#EDEDEB" />
            </View>
            <Text style={styles.allCaughtUpTitle}>All caught up</Text>
            <Text style={styles.allCaughtUpSub}>No unclaimed drops ending soon.</Text>
            <Pressable
              onPress={() => onNavigateToFeed?.({ filterUnclaimed: true })}
              style={styles.allCaughtUpBtn}
            >
              <Text style={styles.allCaughtUpBtnText}>Browse active drops →</Text>
            </Pressable>
          </View>
        )}

        {/* Section 1: Top rated (Round 3 Item 7 & Round 4 Item 4) */}
        {topRatedDeals.length > 0 && (
          <View style={styles.sectionWrap}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>TOP RATED</Text>
            </View>

            <FlatList
              ref={topRatedRailRef}
              data={repeatedTopRated}
              keyExtractor={topRatedKeyExtractor}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.railContent}
              getItemLayout={(_, index) => ({ length: TOP_RATED_STEP, offset: TOP_RATED_STEP * index, index })}
              initialNumToRender={4}
              maxToRenderPerBatch={4}
              windowSize={3}
              removeClippedSubviews={Platform.OS === 'android'}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onScrollBeginDrag={handleTouchStart}
              onScrollEndDrag={handleTouchEnd}
              onMomentumScrollEnd={handleMomentumScrollEnd}
              renderItem={renderTopRatedItem}
            />
          </View>
        )}

        {/* Section 2: Ending soon (Round 3 Item 8, Round 4 Item 5) */}
        {endingSoonDeals.length > 0 && (
          <View style={styles.sectionWrap}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>ENDING SOON</Text>
              <Text style={styles.sectionCount}>{endingSoonDeals.length}</Text>
            </View>

            <View style={styles.compactList}>
              {endingSoonDeals.map((deal, idx) => (
                <View key={deal.id}>
                  {idx > 0 && <View style={styles.compactDivider} />}
                  <CompactDealRow
                    deal={deal}
                    onPress={onDealSelect}
                  />
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Prime Gaming Notice Row: below Ending soon and right above See all drops (non-removable) */}
        {primeNotice && (
          <Pressable
            onPress={() => onDealSelect(primeNotice.deal)}
            unstable_pressDelay={0}
            style={styles.primeNoticeRow}
            accessibilityRole="button"
            accessibilityLabel="Open Prime Gaming notice"
          >
            <View style={styles.primeNoticeLeft}>
              <View style={styles.primeNoticeCrownWrap}>
                <StoreIcon store="prime" size={16} color="#EDEDEB" />
              </View>
              <View style={styles.primeNoticeTextWrap}>
                <Text style={styles.primeNoticeTitle}>Prime Gaming</Text>
                <Text style={styles.primeNoticeSub}>Free games available now</Text>
              </View>
            </View>

            <View style={styles.primeNoticeRight}>
              {primeNotice.timeLeft ? (
                <Text style={styles.primeNoticeTimeLeft}>{primeNotice.timeLeft}</Text>
              ) : null}
              <Ionicons name="chevron-forward" size={16} color="#86868B" />
            </View>
          </Pressable>
        )}

        {/* Editorial Link to Complete Feed (Round 4 Item 5) */}
        <Pressable
          onPress={() => onNavigateToFeed?.()}
          style={styles.browseAllFeedRow}
        >
          <View>
            <Text style={styles.browseAllFeedTitle}>See all {liveCount} drops →</Text>
            <Text style={styles.browseAllFeedSub}>Every giveaway, with store and type filters</Text>
          </View>
          <Text style={styles.browseAllFeedCount}>{liveCount}</Text>
        </Pressable>
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 110,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  updatedText: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    color: '#A1A1A6',
    letterSpacing: 0.2,
    marginTop: 2,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  offlineBannerText: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: '#A1A1A6',
  },
  compactList: {
    backgroundColor: '#0D0D0E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    marginTop: 10,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  compactRowPressed: {
    backgroundColor: '#161618',
  },
  compactDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginLeft: 68,
  },
  compactThumbWrap: {
    width: 48,
    height: 48,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#1C1C1E',
    marginRight: 12,
  },
  compactThumbImg: {
    width: '100%',
    height: '100%',
  },
  compactInfoWrap: {
    flex: 1,
    marginRight: 8,
  },
  compactTitle: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: '#EDEDEB',
    letterSpacing: -0.2,
  },
  compactMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 6,
  },
  compactSavings: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: '#34C759',
  },
  compactRatingText: {
    fontFamily: FONTS.bold,
    fontSize: 11.5,
    color: '#EDEDEB',
  },
  compactStoreText: {
    fontFamily: FONTS.medium,
    fontSize: 11.5,
    color: '#86868B',
  },
  compactDot: {
    color: '#636366',
    fontSize: 11,
  },
  compactTimeLeft: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: '#A1A1A6',
    fontVariant: ['tabular-nums'],
  },
  compactTimeLeftUrgent: {
    color: '#FF8A5B',
    fontFamily: FONTS.bold,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pulseContainer: {
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  pulseCore: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveLabel: {
    fontFamily: FONTS.mono,
    fontSize: 10.5,
    fontWeight: '700',
    color: '#EDEDEB',
    letterSpacing: 0.2,
  },
  liveLabelSyncing: {
    color: '#86868B',
  },
  wordmark: {
    fontFamily: FONTS.display,
    fontSize: 22,
    color: '#EDEDEB',
    letterSpacing: -0.8,
  },
  wordmarkSmall: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: '#EDEDEB',
    letterSpacing: -0.3,
  },
  headerRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  updatedTextSmall: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: '#8E8E93',
    letterSpacing: 0.2,
  },
  refreshBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncBtn48: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  liveSubline: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    color: '#86868B',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  syncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#161618',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  syncPillPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },
  syncPillSyncing: {
    borderColor: '#4D4D52',
  },
  syncPillSynced: {
    borderColor: '#EDEDEB',
  },
  syncingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  syncingText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    fontWeight: '700',
    color: '#EDEDEB',
    letterSpacing: 0.5,
  },
  syncBtnText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    fontWeight: '600',
    color: '#86868B',
    letterSpacing: 0.5,
  },
  syncedJustNowText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    fontWeight: '700',
    color: '#EDEDEB',
    letterSpacing: 0.5,
  },
  greetingText: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    fontWeight: '500',
    color: '#86868B',
    letterSpacing: 0.2,
    
    marginBottom: 8,
  },
  heading: {
    fontFamily: FONTS.display,
    fontSize: 22,
    lineHeight: 26,
    color: '#EDEDEB',
    letterSpacing: -0.6,
    marginBottom: 16,
  },
  greeting: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    lineHeight: 18,
    color: '#8E8E93',
    marginBottom: 20,
  },
  heroNumberSection: {
    marginBottom: 28,
  },
  heroNumberLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  heroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#86868B',
  },
  heroNumberLabel: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    fontWeight: '700',
    color: '#86868B',
    letterSpacing: 0.2,
    
  },
  bigHeroNumber: {
    fontFamily: FONTS.display,
    fontSize: 52,
    lineHeight: 56,
    color: '#EDEDEB',
    letterSpacing: -1.5,
    marginTop: 4,
    marginBottom: 0,
  },
  subheading: {
    fontFamily: FONTS.regular,
    fontSize: 14.5,
    lineHeight: 20,
    color: '#86868B',
    marginBottom: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    backgroundColor: '#111317',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 32,
  },
  heroMetaLine: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: '#8E8E93',
    letterSpacing: 0.8,
    
  },
  statCol: {
    flex: 1,
  },
  statColDivided: {
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255, 255, 255, 0.08)',
    paddingLeft: 12,
  },
  statLabel: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: '#86868B',
    letterSpacing: 1,
    
  },
  statValue: {
    fontFamily: FONTS.mono,
    fontSize: 16,
    fontWeight: '700',
    color: '#EDEDEB',
    marginTop: 4,
  },
  hero: {
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: '#111317',
    marginBottom: 34,
  },
  heroArtworkContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#0C0C0C',
    position: 'relative',
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    overflow: 'hidden',
  },
  heroScrimTimeBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: COLORS.badgeUrgentBg,
    borderWidth: 1,
    borderColor: COLORS.badgeUrgentBorder,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    zIndex: 2,
  },
  heroScrimTimeText: {
    fontFamily: FONTS.mono,
    fontSize: 9.5,
    fontWeight: '700',
    color: COLORS.badgeUrgentText,
    letterSpacing: 0.8,
  },
  heroInfoStrip: {
    backgroundColor: '#111317',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  heroMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  heroMetaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroPlatformLabel: {
    fontFamily: FONTS.mono,
    fontSize: 10.5,
    fontWeight: '600',
    color: '#EDEDEB',
    letterSpacing: 0.8,
  },
  heroRatingLabel: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    fontWeight: '600',
    color: '#EDEDEB',
    letterSpacing: 0.6,
  },
  heroTitle: {
    fontFamily: FONTS.extraBold,
    fontSize: 22,
    lineHeight: 26,
    color: '#EDEDEB',
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  heroActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroClockWrap: {
    width: '100%',
    marginVertical: 6,
  },
  heroBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: '#0A0A0C',
  },
  allCaughtUpCard: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: '#111317',
    padding: 24,
    alignItems: 'center',
    marginBottom: 34,
  },
  allCaughtUpIcon: {
    marginBottom: 10,
  },
  allCaughtUpTitle: {
    fontFamily: FONTS.extraBold,
    fontSize: 20,
    color: '#EDEDEB',
    marginBottom: 4,
    letterSpacing: -0.4,
  },
  allCaughtUpSub: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: '#86868B',
    marginBottom: 14,
  },
  allCaughtUpBtn: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#161618',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  allCaughtUpBtnText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    fontWeight: '600',
    color: '#EDEDEB',
  },
  sectionWrap: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionLabel: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
    color: '#86868B',
    
  },
  sectionCount: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    color: '#86868B',
  },
  railContent: {
    paddingRight: 14,
    paddingBottom: 4,
  },
  topRatedItemWrap: {
    width: TOP_RATED_CARD_WIDTH,
    marginRight: TOP_RATED_CARD_GAP,
  },
  bannerStack: {
    gap: 14,
  },
  browseAllFeedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginTop: 8,
    marginBottom: 20,
  },
  browseAllFeedTitle: {
    fontFamily: FONTS.extraBold,
    fontSize: 17,
    color: '#EDEDEB',
    letterSpacing: -0.4,
  },
  browseAllFeedSub: {
    fontFamily: FONTS.regular,
    fontSize: 12.5,
    color: '#86868B',
    marginTop: 2,
  },
  browseAllFeedCount: {
    fontFamily: FONTS.mono,
    fontSize: 18,
    fontWeight: '700',
    color: '#EDEDEB',
  },
  primeNoticeRow: {
    height: 56,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#1C1C1E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 14,
    width: '100%',
  },
  primeNoticeContent: {
    flex: 1,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  primeNoticeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  primeNoticeCrownWrap: {
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primeNoticeTextWrap: {
    justifyContent: 'center',
  },
  primeNoticeTitle: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: '#EDEDEB',
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  primeNoticeSub: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: '#86868B',
    lineHeight: 14,
  },
  primeNoticeRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginRight: 4,
  },
  primeNoticeTimeLeft: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    color: '#86868B',
  },
});

export default React.memo(HomeScreen);
