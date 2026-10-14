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
import { PosterCard, BannerCard, LandscapeCard } from '../components/UnifiedCards';
import { HomeSkeleton, useSkeletonDisplay } from '../components/LootSkeleton';
import AnimatedSyncHairline from '../components/AnimatedSyncHairline';

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
}

function getGreeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning,' : h < 17 ? 'Good afternoon,' : 'Good evening,';
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

// ─── Main HomeScreen Component ────────────────────────────────────────────────
export default function HomeScreen({
  onDealSelect,
  userName,
  scrollRef,
  onNavigateToFeed,
  isDetailOpen = false,
}: HomeScreenProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    dealsStore.init();
    const unsub = dealsStore.subscribe(() => setTick((t) => t + 1));
    return () => unsub();
  }, []);

  const syncState = dealsStore.getSyncState();
  const refreshing = syncState === 'syncing';
  const activeDeals = dealsStore.getActiveDeals();
  const heroDeal = dealsStore.getHero();
  const topRatedDeals = dealsStore.getTopRated();
  const endingSoon = dealsStore.getEndingSoon();
  const stats = dealsStore.getStats();

  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const [isReduceMotion, setIsReduceMotion] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);

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

  // Track app state for auto-advance pausing
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      setAppState(nextState);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setIsReduceMotion);
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setIsReduceMotion);
    return () => sub?.remove?.();
  }, []);

  const handleImageError = useCallback((id: string) => {
    setImageErrors((prev) => ({ ...prev, [id]: true }));
  }, []);

  const heroHostInfo = useMemo(() => (heroDeal ? getGiveawayHostName(heroDeal) : { host: '', isTaskHost: false }), [heroDeal]);

  // Endless loop FlatList setup: repeat enough times so it feels truly continuous
  const REPEAT_COUNT = useMemo(() => {
    const n = topRatedDeals.length;
    if (n === 0) return 1;
    return Math.max(16, Math.ceil(96 / n));
  }, [topRatedDeals.length]);

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
    if (isReduceMotion || appState !== 'active' || isDetailOpen || topRatedDeals.length < 2) return;

    autoAdvanceTimerRef.current = setInterval(() => {
      if (isInteractingRef.current || isDetailOpen) return;
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
          if (!isInteractingRef.current && !isDetailOpen) {
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
  }, [isReduceMotion, appState, isDetailOpen, topRatedDeals.length, REPEAT_COUNT]);

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
  const totalFreeValue = useMemo(() => {
    return `$${Math.round(stats.vaultValueSaved)}`;
  }, [stats.vaultValueSaved]);

  const liveCount = stats.liveCount;
  const claimedCount = stats.claimedCount;
  const toClaimCount = stats.toClaimCount;
  const endingSoonCount = endingSoon.length;

  // Claim moment on hero (Item 1 & 5)
  const triggerHeroClaimMoment = async () => {
    if (!heroDeal) return;
    if (Platform.OS === 'android') {
      try {
        Vibration.vibrate(20);
      } catch {}
    }

    try {
      await dealsStore.claimDeal(heroDeal);
    } catch {}

    if (!isReduceMotion) {
      Animated.sequence([
        Animated.timing(heroPopScale, { toValue: 1.04, duration: 250, useNativeDriver: true }),
        Animated.timing(heroPopScale, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();

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

  const { showSkeleton, contentFadeAnim } = useSkeletonDisplay(
    activeDeals.length === 0 || (syncState === 'syncing' && !dealsStore.hasCompletedSync()),
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
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => dealsStore.sync(true)}
            tintColor="#EDEDEB"
            colors={['#EDEDEB']}
            progressBackgroundColor="#0C0C0C"
          />
        }
      >
        {/* Top Header Row */}
        <View style={styles.topRow}>
          <View style={styles.liveIndicator}>
            <AnimatedPulseDot
              color={syncState === 'syncing' || refreshing ? '#4D4D52' : '#EDEDEB'}
              fast={syncState === 'syncing' || refreshing}
            />
            <Text
              style={[
                styles.liveLabel,
                (syncState === 'syncing' || refreshing) && styles.liveLabelSyncing,
              ]}
            >
              {syncState === 'syncing' || refreshing ? 'WATCHING FOR NEW DROPS...' : `${liveCount} LIVE RIGHT NOW · ${claimedCount} CLAIMED`}
            </Text>
          </View>
          <Pressable
            onPress={() => dealsStore.sync(true)}
            hitSlop={12}
            disabled={syncState === 'syncing' || refreshing}
            style={({ pressed }) => [
              styles.syncPill,
              (syncState === 'syncing' || refreshing) && styles.syncPillSyncing,
              syncState === 'synced_just_now' && styles.syncPillSynced,
              pressed && styles.syncPillPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Sync active deals"
          >
            {syncState === 'syncing' || refreshing ? (
              <View style={styles.syncingRow}>
                <Animated.View style={{ transform: [{ rotate: syncSpinInterpolate }] }}>
                  <Ionicons name="sync" size={12} color="#EDEDEB" />
                </Animated.View>
                <Text style={styles.syncingText}>Syncing...</Text>
              </View>
            ) : syncState === 'synced_just_now' ? (
              <View style={styles.syncingRow}>
                <Ionicons name="checkmark-circle" size={12} color="#EDEDEB" />
                <Text style={styles.syncedJustNowText}>Synced</Text>
              </View>
            ) : (
              <View style={styles.syncingRow}>
                <Ionicons name="sync-outline" size={12} color="#86868B" />
                <Text style={styles.syncBtnText}>Sync</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Editorial Greeting & Headline */}
        <Text style={styles.greetingText}>{getGreeting()}</Text>
        <Text style={styles.heading} numberOfLines={1} adjustsFontSizeToFit>{userName || 'Gamer'}.</Text>
        <Text style={styles.subheading}>{totalFreeValue} worth of games, free right now.</Text>

        {/* 3-Column Stats HUD */}
        <View style={styles.statsGrid}>
          <View style={styles.statCol}>
            <Text style={styles.statLabel}>TOTAL VALUE</Text>
            <Text style={styles.statValue}>{totalFreeValue}</Text>
          </View>
          <View style={[styles.statCol, styles.statColDivided]}>
            <Text style={styles.statLabel}>ENDING SOON</Text>
            <Text style={[styles.statValue, endingSoonCount > 0 && { color: '#FF8A5B' }]}>
              {endingSoonCount} drops
            </Text>
          </View>
          <Pressable
            onPress={() => onNavigateToFeed?.({ filterUnclaimed: true })}
            style={[styles.statCol, styles.statColDivided]}
          >
            <Text style={styles.statLabel}>TO CLAIM</Text>
            <Text style={[styles.statValue, toClaimCount > 0 ? { color: '#EDEDEB' } : { color: '#86868B' }]}>
              {toClaimCount} drops
            </Text>
          </Pressable>
        </View>

        {/* Home Hero: Unclaimed Only or Calm "All caught up" state (Round 3 Items 2, 4, 8) */}
        {heroDeal ? (
          <Animated.View style={[styles.hero, { borderColor: heroBorderColor }]}>
            <Pressable onPress={() => onDealSelect(heroDeal)}>
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
                {isUnder12Hours(heroDeal) && (
                  <View style={styles.heroScrimTimeBadge}>
                    <Text style={styles.heroScrimTimeText}>ENDING SOON</Text>
                  </View>
                )}
              </View>

              {/* Solid #000 info strip below */}
              <View style={styles.heroInfoStrip}>
                {/* Row 1: Type tag + Store icon + Store name */}
                <View style={styles.heroMetaRow}>
                  <View style={styles.heroMetaLeft}>
                    <TypeBadge type={heroDeal.type} size="sm" />
                    <StoreIcon store={heroHostInfo.isTaskHost ? heroHostInfo.host : heroDeal.platform} size={13} color="#EDEDEB" />
                    <Text style={styles.heroPlatformLabel}>
                      {(heroHostInfo.isTaskHost ? heroHostInfo.host : storeShortName(heroDeal.platform)).toUpperCase()}
                    </Text>
                  </View>
                  {heroDeal.steamRatingPercent && heroDeal.steamReviewCount && heroDeal.steamReviewCount >= 10 ? (
                    <Text style={styles.heroRatingLabel}>
                      ★ {heroDeal.steamRatingPercent}% STEAM
                    </Text>
                  ) : null}
                </View>

                {/* Row 2: Clean Title (max 2 lines) */}
                <Text numberOfLines={2} style={styles.heroTitle}>
                  {cleanDisplayTitle(heroDeal.title)}
                </Text>

                {/* Prominent Full-Width Countdown Clock with Progress Bar */}
                <View style={styles.heroClockWrap}>
                  <CountdownClock
                    endDate={heroDeal.endDate || heroDeal.expiresAt}
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

                  <Animated.View style={{ transform: [{ scale: heroPopScale }] }}>
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation?.();
                        triggerHeroClaimMoment();
                      }}
                      style={styles.heroBtn}
                    >
                      <Text style={styles.heroBtnText}>
                        {heroHostInfo.isTaskHost ? 'Enter' : 'Claim'}
                      </Text>
                    </Pressable>
                  </Animated.View>
                </View>
              </View>
            </Pressable>
          </Animated.View>
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
              keyExtractor={(item, index) => `${item.id}_${index}`}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.railContent}
              getItemLayout={(_, index) => ({ length: TOP_RATED_STEP, offset: TOP_RATED_STEP * index, index })}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onScrollBeginDrag={handleTouchStart}
              onScrollEndDrag={handleTouchEnd}
              onMomentumScrollEnd={handleMomentumScrollEnd}
              renderItem={({ item }) => (
                <View style={styles.topRatedItemWrap}>
                  <LandscapeCard
                    deal={item}
                    onPress={onDealSelect}
                    width={TOP_RATED_CARD_WIDTH}
                    imageErrors={imageErrors}
                    onImageError={handleImageError}
                  />
                </View>
              )}
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

            <View style={styles.bannerStack}>
              {endingSoonDeals.map((deal) => (
                <BannerCard
                  key={deal.id}
                  deal={deal}
                  onPress={onDealSelect}
                  onClaim={onDealSelect}
                  isClaimed={false}
                  imageErrors={imageErrors}
                  onImageError={handleImageError}
                />
              ))}
            </View>
          </View>
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
    paddingTop: Platform.OS === 'ios' ? 52 : 36,
    paddingBottom: 110,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
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
    letterSpacing: 1.2,
  },
  liveLabelSyncing: {
    color: '#86868B',
  },
  syncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#161618',
    borderWidth: 1,
    borderColor: '#1C1C1E',
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
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  heading: {
    fontFamily: FONTS.serif,
    fontSize: 48,
    lineHeight: 48,
    color: '#EDEDEB',
    letterSpacing: -1.2,
    marginBottom: 6,
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
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 26,
  },
  statCol: {
    flex: 1,
  },
  statColDivided: {
    borderLeftWidth: 1,
    borderLeftColor: '#1C1C1E',
    paddingLeft: 12,
  },
  statLabel: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: '#86868B',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  statValue: {
    fontFamily: FONTS.mono,
    fontSize: 16,
    fontWeight: '700',
    color: '#EDEDEB',
    marginTop: 4,
  },
  hero: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    backgroundColor: '#000000',
    marginBottom: 34,
  },
  heroArtworkContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#0C0C0C',
    position: 'relative',
  },
  heroScrimTimeBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255, 138, 91, 0.4)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    zIndex: 2,
  },
  heroScrimTimeText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    fontWeight: '700',
    color: '#FF8A5B',
    letterSpacing: 0.8,
  },
  heroInfoStrip: {
    backgroundColor: '#000000',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#1C1C1E',
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
    fontFamily: FONTS.serif,
    fontSize: 26,
    lineHeight: 30,
    color: '#EDEDEB',
    letterSpacing: -0.6,
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
    backgroundColor: '#EDEDEB',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: '#000000',
  },
  allCaughtUpCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1C1C1E',
    backgroundColor: '#0C0C0E',
    padding: 24,
    alignItems: 'center',
    marginBottom: 34,
  },
  allCaughtUpIcon: {
    marginBottom: 10,
  },
  allCaughtUpTitle: {
    fontFamily: FONTS.serif,
    fontSize: 24,
    color: '#EDEDEB',
    marginBottom: 4,
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
    borderColor: '#1C1C1E',
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
    letterSpacing: 1.2,
    color: '#86868B',
    textTransform: 'uppercase',
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
    fontFamily: FONTS.serif,
    fontSize: 20,
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
});
