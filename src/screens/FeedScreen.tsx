import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  ScrollView,
  RefreshControl,
  Pressable,
  Animated,
  Easing,
  Vibration,
  Platform,
  AccessibilityInfo,
  BackHandler,
  PanResponder,
  useWindowDimensions,
  Dimensions,
  Modal,
  Keyboard,
  AppState,
  Linking,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { ContainedModal } from '../components/ContainedModal';
import { FlashList } from '@shopify/flash-list';
import { useKeyboardHandler } from 'react-native-keyboard-controller';
import { runOnJS } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hapticFeedback } from '../utils/haptics';
import { checkIsReduceMotionEnabled, subscribeToReduceMotion } from '../utils/motion';
import { Deal } from '../models/Deal';
import { dealsStore, FeedFilters, STORE_OPTIONS } from '../services/dealsStore';
import { updateCheckerService, UpdateInfo } from '../services/updateCheckerService';
import { useAppClockMinutes } from '../services/appClock';
import {
  clearSessionFailedUrls,
  parseDateToMs,
  getTimeLeft,
  cleanDisplayTitle,
  isThirdPartyTaskHost,
} from '../utils/dealUtils';
import { FONTS, COLORS, RADIUS } from '../theme/theme';
import GameArtwork from '../components/GameArtwork';
import StoreIcon, { storeShortName } from '../components/StoreIcon';
import { formatRetailPrice } from '../components/Price';
import Gate18PlusModal from '../components/Gate18PlusModal';
import { FeedSkeleton, useSkeletonDisplay } from '../components/LootSkeleton';
import AnimatedSyncHairline from '../components/AnimatedSyncHairline';
import AnimatedCardEntrance from '../components/AnimatedCardEntrance';
import MonospacePullTicker from '../components/MonospacePullTicker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from '../utils/useSafeAreaInsets';

let hasAnimatedFeedFirstLaunch = false;

interface FeedScreenProps {
  onDealSelect: (deal: Deal) => void;
  claimedDeals?: Deal[];
  initialCategory?: string;
  onNewAlerts?: (count: number) => void;
  onConnectionError?: () => void;
  isActive?: boolean;
}

const TYPE_OPTIONS = [
  { id: 'game', label: 'Game' },
  { id: 'dlc', label: 'DLC' },
  { id: 'beta', label: 'Beta' },
];

const CLAIM_METHOD_OPTIONS = [
  { id: 'one_click', label: 'One-click' },
  { id: 'tasks', label: 'Tasks required' },
];

const SORTS = [
  { id: 'new', label: 'Newest' },
  { id: 'end', label: 'Ending soon' },
  { id: 'val', label: 'Highest value' },
  { id: 'claims', label: 'Most claimed' },
];

const FEED_FILTERS_KEY_V5 = 'claimr_feed_filters_v5';
const LEGACY_FEED_FILTERS_KEY_V5 = 'lootquest_feed_filters_v5';
const FEED_FILTERS_KEY_V4 = 'claimr_feed_filters_v4';
const LEGACY_FEED_FILTERS_KEY_V4 = 'lootquest_feed_filters_v4';
const LAST_FEED_VISIT_KEY = 'claimr_last_feed_visit_at';
const LEGACY_LAST_FEED_VISIT_KEY = 'lootquest_last_feed_visit_at';

function isUnder12Hours(deal: Deal): boolean {
  const rawEnd = deal.endDate || deal.expiresAt;
  if (!rawEnd) return false;
  const upper = String(rawEnd).toUpperCase().trim();
  if (upper === 'N/A' || upper.includes('PERMANENT') || upper.includes('NO EXP')) return false;
  const endMs = parseDateToMs(rawEnd);
  if (!endMs) return false;
  const diffHours = (endMs - Date.now()) / (1000 * 60 * 60);
  return diffHours > 0 && diffHours < 12;
}

function isDealExpiredOrDead(deal: Deal): boolean {
  if (deal.isExpired || deal.isNotFoundAfterSync) return true;
  const rawEnd = deal.endDate || deal.expiresAt;
  if (!rawEnd) return false;
  const upper = String(rawEnd).toUpperCase().trim();
  if (upper === 'N/A' || upper.includes('PERMANENT') || upper.includes('NO EXP')) return false;
  const endMs = parseDateToMs(rawEnd);
  if (endMs && endMs > 0 && endMs < Date.now()) return true;
  return false;
}

function dealMatchesStore(deal: Deal, storeId: string): boolean {
  return dealsStore.matchStoreFilter(deal, [storeId]);
}

/**
 * Animated store icon in the horizontal strip.
 * Unselected: 45% opacity, no underline.
 * Selected: 100% opacity, 2px #EDEDEB underline fading in over 120ms.
 */
function StoreStripItem({
  storeId,
  label,
  count,
  isSelected,
  onPress,
  reduceMotion,
}: {
  storeId: string;
  label: string;
  count?: number;
  isSelected: boolean;
  onPress: () => void;
  reduceMotion: boolean;
}) {
  const anim = useRef(new Animated.Value(isSelected ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      anim.setValue(isSelected ? 1 : 0);
    } else {
      Animated.spring(anim, {
        toValue: isSelected ? 1 : 0,
        stiffness: 400,
        damping: 28,
        mass: 0.7,
        useNativeDriver: true,
      }).start();
    }
  }, [isSelected, reduceMotion]);

  const iconOpacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 1],
  });

  return (
    <Pressable
      onPress={onPress}
      style={styles.storeStripTarget}
      accessibilityRole="button"
      accessibilityLabel={`${label}${count !== undefined ? ` (${count})` : ''}`}
      accessibilityState={{ selected: isSelected }}
    >
      <Animated.View style={[styles.storeStripContent, { opacity: iconOpacity }]}>
        <StoreIcon store={storeId} size={18} color="#EDEDEB" />
        {typeof count === 'number' && (
          <Text style={[styles.storeStripCount, isSelected && styles.storeStripCountSelected]}>
            {count}
          </Text>
        )}
      </Animated.View>
      <Animated.View
        style={[
          styles.storeUnderline,
          { opacity: anim },
        ]}
      />
    </Pressable>
  );
}

// ─── Individual Card Component ────────────────────────────────────────────────
interface ShelfCardProps {
  deal: Deal;
  cardW: number;
  cardH: number;
  artH: number;
  infoH: number;
  isNew: boolean;
  isClaimed: boolean;
  onPress: () => void;
  reduceMotion: boolean;
}

function ShelfCard({
  deal,
  cardW,
  cardH,
  artH,
  infoH,
  isNew,
  isClaimed,
  onPress,
  reduceMotion,
}: ShelfCardProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [show18Modal, setShow18Modal] = useState(false);

  const isGated =
    deal.is18Plus &&
    !dealsStore.is18PlusRevealed(deal.id) &&
    !dealsStore.getAlwaysShow18Plus();

  const handlePressIn = useCallback(() => {
    if (reduceMotion) return;
    Animated.timing(scaleAnim, {
      toValue: 0.97,
      duration: 100,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [reduceMotion, scaleAnim]);

  const handlePressOut = useCallback(() => {
    if (reduceMotion) return;
    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: 140,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [reduceMotion, scaleAnim]);

  useEffect(() => {
    return () => {
      scaleAnim.setValue(1);
    };
  }, [scaleAnim]);

  const handleCardPress = useCallback(() => {
    if (isGated) {
      setShow18Modal(true);
      return;
    }
    onPress();
  }, [isGated, onPress]);

  // Prime Gaming notice pinned card
  if (deal.isBundleNotice) {
    return (
      <Animated.View
        style={[
          styles.cardContainer,
          {
            width: cardW,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <Pressable
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          onTouchCancel={handlePressOut}
          unstable_pressDelay={0}
          style={[styles.cardPressable, { width: cardW }]}
          accessibilityRole="button"
          accessibilityLabel="Open Prime Gaming notice"
        >
          {/* 16:9 Art Surface */}
          <View
            style={[
              styles.artSurface,
              {
                width: cardW,
                height: artH,
                backgroundColor: '#121216',
                justifyContent: 'center',
                alignItems: 'center',
              },
            ]}
          >
            <StoreIcon store="prime" size={28} color="#EDEDEB" />
          </View>

          {/* Info Block */}
          <View style={styles.infoBlock}>
            {/* Row 1: Store Icon + Store Name */}
            <View style={styles.cardRow1}>
              <StoreIcon store="prime" size={14} color="#EDEDEB" />
              <Text numberOfLines={1} ellipsizeMode="tail" style={styles.storeShortName}>
                Prime Gaming
              </Text>
            </View>

            {/* Row 2: Title */}
            <Text numberOfLines={2} ellipsizeMode="tail" style={styles.cardTitle}>
              Prime Gaming
            </Text>

            {/* Row 3: Price + Time Left */}
            <View style={styles.cardRow3}>
              <Text numberOfLines={1} style={styles.freePrice}>
                Included with Prime
              </Text>
              <Text style={styles.timeLeftText}>∞</Text>
            </View>
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  // Regular deal pricing & expiry calculations
  const { priceText, estimated } = formatRetailPrice(deal.worth);
  const isEstimated = deal.isEstimated ?? estimated;
  const isUrgent = isUnder12Hours(deal);
  const rawEnd = deal.endDate || deal.expiresAt;
  const isNoExpiry =
    !rawEnd ||
    rawEnd === 'N/A' ||
    String(rawEnd).toUpperCase().includes('PERMANENT') ||
    String(rawEnd).toUpperCase().includes('NO EXP');
  const timeLeftDisplay = isNoExpiry ? '∞' : (deal.timeLeft || getTimeLeft(rawEnd, deal.platform) || '∞');
  const displayTitle = isGated ? '18+ game' : cleanDisplayTitle(deal.title);

  const hasRealRating =
    typeof deal.steamRatingPercent === 'number' &&
    deal.steamRatingPercent > 0 &&
    (deal.steamReviewCount ? deal.steamReviewCount >= 10 : true);

  return (
    <>
      <Animated.View
        style={[
          styles.cardContainer,
          {
            width: cardW,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <Pressable
          onPress={handleCardPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          onTouchCancel={handlePressOut}
          unstable_pressDelay={0}
          style={[styles.cardPressable, { width: cardW }]}
          accessibilityRole="button"
          accessibilityLabel={`${deal.title}${isClaimed ? ', claimed' : ''}`}
        >
          {/* Top 16:9 Art Surface (radius 6, no text or badges on top) */}
          <View style={[styles.artSurface, { width: cardW, height: artH }, isClaimed && { opacity: 0.65 }]}>
            {isGated ? (
              <View style={styles.gatedArtSurface}>
                <View style={styles.gated18Badge}>
                  <Text style={styles.gated18BadgeText}>18+</Text>
                </View>
                <Text style={styles.gatedArtTitle}>18+ game</Text>
                <Text style={styles.gatedArtSub}>Tap to view</Text>
              </View>
            ) : (
              <GameArtwork
                deal={deal}
                uri={deal.resolvedImage || deal.image || deal.resolvedPoster}
                format="wide"
                title={deal.title}
                platform={deal.platform}
                isNsfw={deal.isNsfw}
                showPlatformBadge={false}
                showBottomGradient={false}
                style={StyleSheet.absoluteFill}
              />
            )}
          </View>

          {/* Info Block */}
          <View style={styles.infoBlock}>
            {/* Title (exactly 2 lines, ellipsis) */}
            <Text numberOfLines={2} ellipsizeMode="tail" style={styles.cardTitle}>
              {displayTitle}
            </Text>

            {/* Info line under title: Store icon + Rating + Store name + tags */}
            <View style={styles.cardRow1}>
              <StoreIcon store={deal.platform} size={11} color="#EDEDEB" />
              <Text numberOfLines={1} ellipsizeMode="tail" style={styles.cardMetaText}>
                {hasRealRating ? (
                  <>
                    <Text style={styles.cardRatingBright}>
                      <Ionicons name="star" size={9} color="#EDEDEB" /> {deal.steamRatingPercent}%{deal.reviewScore ? ` ${deal.reviewScore}` : ''}
                    </Text>
                    <Text style={styles.cardMetaDot}>  ·  </Text>
                  </>
                ) : null}
                {[
                  storeShortName(deal.platform).toUpperCase(),
                  isNew ? 'NEW' : null,
                  deal.type === 'dlc' ? 'DLC' : deal.type === 'beta' ? 'BETA' : null,
                  deal.claimMethod === 'tasks' ? 'TASKS' : null,
                ].filter(Boolean).join('  ·  ')}
              </Text>
            </View>

            {/* Row 3: Useful Savings (left) + Expiry / Claimed (right) */}
            <View style={styles.cardRow3}>
              {isClaimed ? (
                <View style={styles.claimedRow}>
                  <Ionicons name="checkmark" size={11} color="#8E8E93" />
                  <Text numberOfLines={1} style={styles.claimedPlainText}>
                    Claimed
                  </Text>
                </View>
              ) : !isEstimated && priceText && priceText !== '$0' ? (
                <View style={styles.priceContainer}>
                  <Text numberOfLines={1} style={styles.freePrice}>
                    Save {priceText}
                  </Text>
                </View>
              ) : null}

              {!isClaimed && timeLeftDisplay && timeLeftDisplay !== '∞' && !isNoExpiry && (
                <Text
                  numberOfLines={1}
                  style={[
                    styles.timeLeftText,
                    isUrgent && styles.timeLeftUrgent,
                  ]}
                >
                  {timeLeftDisplay}
                </Text>
              )}
            </View>
          </View>
        </Pressable>
      </Animated.View>

      {/* 18+ Gate Confirmation Modal */}
      {show18Modal && (
        <Gate18PlusModal
          visible={show18Modal}
          dealId={deal.id}
          onClose={() => setShow18Modal(false)}
          onRevealed={() => onPress()}
        />
      )}
    </>
  );
}

// ─── FlatList Item Types & Row Representation ─────────────────────────────────
type FeedRowItem =
  | { type: 'divider'; id: string; title: string; count: number }
  | { type: 'row'; id: string; cards: (Deal | null)[] }
  | { type: 'horizontal_rail'; id: string; deals: Deal[] };

interface ShelfRowProps {
  item: FeedRowItem;
  rowIndex: number;
  cardW: number;
  cardH: number;
  artH: number;
  infoH: number;
  onDealSelect: (deal: Deal) => void;
  reduceMotion: boolean;
  isNewMap: Record<string, boolean>;
  claimedMap: Record<string, boolean>;
  isInitialEntrance: boolean;
}

function ShelfRowComponent({
  item,
  rowIndex,
  cardW,
  cardH,
  artH,
  infoH,
  onDealSelect,
  reduceMotion,
  isNewMap,
  claimedMap,
  isInitialEntrance,
}: ShelfRowProps) {
  if (item.type === 'divider') {
    return (
      <View style={styles.dividerRow}>
        <Text style={styles.dividerTitle}>
          {item.title} · {item.count}
        </Text>
        <View style={styles.dividerRule} />
      </View>
    );
  }

  if (item.type === 'horizontal_rail') {
    return (
      <View style={{ marginBottom: 12 }}>
        {item.deals.length === 1 ? (
          // Full-width card when there is 1 new deal
          <ShelfCard
            deal={item.deals[0]}
            cardW={cardW * 2 + 12}
            cardH={cardH}
            artH={artH}
            infoH={infoH}
            isNew={true}
            isClaimed={!!claimedMap[item.deals[0].id]}
            onPress={() => onDealSelect(item.deals[0])}
            reduceMotion={reduceMotion}
          />
        ) : (
          // Horizontal scrolling row when multiple new deals
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12, paddingRight: 20 }}
          >
            {item.deals.map((deal) => (
              <ShelfCard
                key={deal.id}
                deal={deal}
                cardW={cardW}
                cardH={cardH}
                artH={artH}
                infoH={infoH}
                isNew={true}
                isClaimed={!!claimedMap[deal.id]}
                onPress={() => onDealSelect(deal)}
                reduceMotion={reduceMotion}
              />
            ))}
          </ScrollView>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.shelfRow, { marginBottom: 12 }]}>
      {item.cards.map((deal, idx) => {
        if (!deal) {
          return (
            <View
              key={`spacer-${idx}`}
              style={{ width: cardW }}
              pointerEvents="none"
            />
          );
        }
        const cardIndex = rowIndex * item.cards.length + idx;
        return (
          <AnimatedCardEntrance
            key={deal.id}
            index={cardIndex}
            reduceMotion={reduceMotion}
            enabled={isInitialEntrance}
          >
            <ShelfCard
              deal={deal}
              cardW={cardW}
              cardH={cardH}
              artH={artH}
              infoH={infoH}
              isNew={!!isNewMap[deal.id]}
              isClaimed={!!claimedMap[deal.id]}
              onPress={() => onDealSelect(deal)}
              reduceMotion={reduceMotion}
            />
          </AnimatedCardEntrance>
        );
      })}
    </View>
  );
}

// Item 5: Memoized row component comparing ids, isNew, claimed, resolvedImage, and card width
const MemoizedShelfRow = React.memo(
  ShelfRowComponent,
  (prev, next) => {
    if (prev.item.type !== next.item.type) return false;
    if (prev.item.id !== next.item.id) return false;
    if (prev.cardW !== next.cardW || prev.cardH !== next.cardH) return false;
    if (prev.rowIndex !== next.rowIndex) return false;
    if (prev.isInitialEntrance !== next.isInitialEntrance) return false;

    if (prev.item.type === 'divider') {
      const p = prev.item;
      const n = next.item as { type: 'divider'; id: string; title: string; count: number };
      return p.title === n.title && p.count === n.count;
    }

    if (prev.item.type === 'horizontal_rail') {
      const p = prev.item as { type: 'horizontal_rail'; id: string; deals: Deal[] };
      const n = next.item as { type: 'horizontal_rail'; id: string; deals: Deal[] };
      if (p.deals.length !== n.deals.length) return false;
      return p.deals.every((d, i) => d.id === n.deals[i]?.id);
    }

    // Type === 'row'
    const prevCards = prev.item.cards;
    const nextCards = (next.item as { type: 'row'; id: string; cards: (Deal | null)[] }).cards;
    if (prevCards.length !== nextCards.length) return false;

    for (let i = 0; i < prevCards.length; i++) {
      const p = prevCards[i];
      const n = nextCards[i];
      if (p?.id !== n?.id) return false;
      if (p && n) {
        if (prev.isNewMap[p.id] !== next.isNewMap[n.id]) return false;
        if (prev.claimedMap[p.id] !== next.claimedMap[n.id]) return false;
        if (p.resolvedImage !== n.resolvedImage) return false;
      }
    }
    return true;
  }
);

// ─── Main FeedScreen ─────────────────────────────────────────────────────────
function FeedScreen({
  onDealSelect,
  initialCategory,
  onConnectionError,
  isActive = true,
}: FeedScreenProps) {
  const insets = useSafeAreaInsets();
  const { width: W, fontScale } = useWindowDimensions();

  // Layout calculations (Prompt 4 Item 2)
  // On web inside desktop wrapper, clamp to container width (<= 440) so cards match mobile UI
  const [containerW, setContainerW] = useState<number>(() => (Platform.OS === 'web' ? Math.min(W, 400) : W));

  useEffect(() => {
    if (Platform.OS !== 'web') {
      setContainerW(W);
    }
  }, [W]);

  const effectiveW = containerW > 0 ? containerW : (Platform.OS === 'web' ? Math.min(W, 400) : W);
  const numCols = effectiveW >= 600 ? 3 : 2;
  const cardW = Math.floor((effectiveW - 40 - (numCols - 1) * 12) / numCols);
  const artH = Math.round((cardW * 9) / 16);
  const effectiveFontScale = Math.min(fontScale || 1, 1.5);
  const infoH = Math.round(92 * effectiveFontScale);
  const cardH = artH + infoH;
  const rowGap = 16;

  const [, setStoreVersion] = useState(0);
  const [, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'synced_just_now'>('idle');

  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const pendingUpdateRef = useRef(false);

  // Multi-select state
  const [selectedStores, setSelectedStores] = useState<string[]>(['all']);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['all']);
  const [selectedClaimMethods, setSelectedClaimMethods] = useState<string[]>(['any']);
  const [sortIndex, setSortIndex] = useState<number>(0);
  const [search, setSearch] = useState(''); // Search text never saved
  const [isSearching, setIsSearching] = useState(false);

  // Native Update Checker state (Only alerts on newer native builds, e.g. >= 1.3.0)
  const [nativeUpdate, setNativeUpdate] = useState<UpdateInfo | null>(() =>
    updateCheckerService.getLatestUpdateInfo()
  );
  const [nativeUpdateDismissed, setNativeUpdateDismissed] = useState(false);

  useEffect(() => {
    const unsub = updateCheckerService.subscribe((info) => {
      setNativeUpdate(info);
      if (info && info.isUpdateAvailable) {
        updateCheckerService.isVersionDismissed(info.version).then((dismissed) => {
          setNativeUpdateDismissed(dismissed);
        });
      }
    });

    updateCheckerService.checkForUpdate().catch(() => {});
    return unsub;
  }, []);

  // Popover / Sheet visibility
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sortModalOpen, setSortModalOpen] = useState(false);
  const sheetAnim = useRef(new Animated.Value(Dimensions.get('window').height)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  // Reduced motion support
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    checkIsReduceMotionEnabled().then(setReduceMotion);
    return subscribeToReduceMotion(setReduceMotion);
  }, []);

  // First-launch list entrance (Part 2 Item b: initial cards rise 16px and fade in with 60ms stagger)
  const [entranceTrigger, setEntranceTrigger] = useState(!hasAnimatedFeedFirstLaunch);
  useEffect(() => {
    if (!hasAnimatedFeedFirstLaunch) {
      hasAnimatedFeedFirstLaunch = true;
      const timer = setTimeout(() => {
        setEntranceTrigger(false);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  // List cross-fade on filter result set change (120ms)
  const listFadeAnim = useRef(new Animated.Value(1)).current;

  // Header count 100ms fade on text change
  const countFadeAnim = useRef(new Animated.Value(1)).current;

  // ─── Item 1: lastFeedVisitAt & isNew tracking ──────────────────────────────
  const activeVisitTimeRef = useRef<number | null>(null);
  const newIdsSetRef = useRef<Set<string>>(new Set());
  const [newDealIdsState, setNewDealIdsState] = useState<Record<string, boolean>>({});

  // When Feed gains focus: read lastFeedVisitAt. If none or baseline reset, mark old deals as seen.
  useEffect(() => {
    if (isActive) {
      AsyncStorage.getItem(LAST_FEED_VISIT_KEY).then(async (rawVal) => {
        let raw = rawVal;
        if (!raw) {
          raw = await AsyncStorage.getItem(LEGACY_LAST_FEED_VISIT_KEY).catch(() => null);
        }
        let hasBaseline = await AsyncStorage.getItem('claimr_feed_baseline_v3');
        if (!hasBaseline) {
          hasBaseline = await AsyncStorage.getItem('lootquest_feed_baseline_v3').catch(() => null);
        }
        if (!hasBaseline || !raw) {
          const now = Date.now();
          await AsyncStorage.setItem('claimr_feed_baseline_v3', 'true');
          await AsyncStorage.setItem(LAST_FEED_VISIT_KEY, String(now));
          activeVisitTimeRef.current = now;
          newIdsSetRef.current.clear();
          setNewDealIdsState({});
          return;
        }

        const visitTs = parseInt(raw, 10);
        activeVisitTimeRef.current = visitTs;

        // Compute initial set of new deals
        const activeDealsList = dealsStore.getActiveDeals();
        const newSet = new Set<string>();
        const newMap: Record<string, boolean> = {};

        for (const d of activeDealsList) {
          const isDead = isDealExpiredOrDead(d);
          const isOld =
            (typeof d.publishedAt === 'number' && d.publishedAt < Date.now() - 3 * 86400000) ||
            (typeof d.createdAt === 'number' && d.createdAt < Date.now() - 3 * 86400000);
          if (
            (d.firstSeenAt || 0) > visitTs &&
            !dealsStore.isClaimed(d.id) &&
            !isDead &&
            !isOld
          ) {
            newSet.add(d.id);
            newMap[d.id] = true;
          }
        }
        newIdsSetRef.current = newSet;
        setNewDealIdsState(newMap);
      });
    } else {
      // Feed lost focus: write now, reset new state
      if (activeVisitTimeRef.current !== null) {
        AsyncStorage.setItem(LAST_FEED_VISIT_KEY, String(Date.now())).catch(() => {});
        activeVisitTimeRef.current = null;
        newIdsSetRef.current.clear();
        setNewDealIdsState({});
      }
    }
  }, [isActive]);

  // AppState change: write lastFeedVisitAt when app backgrounds while Feed is active
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState.match(/inactive|background/) && isActiveRef.current) {
        AsyncStorage.setItem(LAST_FEED_VISIT_KEY, String(Date.now())).catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  // Subscribe to dealsStore (skips re-renders when hidden)
  useEffect(() => {
    dealsStore.init().then(() => {
      setLoading(false);
    });

    const unsubscribe = dealsStore.subscribe(() => {
      if (!isActiveRef.current) {
        pendingUpdateRef.current = true;
        return;
      }
      setStoreVersion((v) => v + 1);
      setLoading(false);
      setSyncState(dealsStore.getSyncState());

      // If deals arrived while on Feed, add any new ones to newIdsSetRef (never leaves "new" during visit)
      if (activeVisitTimeRef.current !== null) {
        const currentActive = dealsStore.getActiveDeals();
        let changed = false;
        const newMap = { ...newDealIdsState };
        for (const d of currentActive) {
          const isDead = isDealExpiredOrDead(d);
          const isOld =
            (typeof d.publishedAt === 'number' && d.publishedAt < Date.now() - 3 * 86400000) ||
            (typeof d.createdAt === 'number' && d.createdAt < Date.now() - 3 * 86400000);
          if (
            (d.firstSeenAt || 0) > activeVisitTimeRef.current &&
            !dealsStore.isClaimed(d.id) &&
            !isDead &&
            !isOld &&
            !newIdsSetRef.current.has(d.id)
          ) {
            newIdsSetRef.current.add(d.id);
            newMap[d.id] = true;
            changed = true;
          }
        }
        if (changed) {
          setNewDealIdsState(newMap);
        }
      }
    });

    return () => unsubscribe();
  }, [newDealIdsState]);

  // Catch up when Feed tab becomes active
  useEffect(() => {
    if (isActive && pendingUpdateRef.current) {
      pendingUpdateRef.current = false;
      setStoreVersion((v) => v + 1);
      setLoading(false);
      setSyncState(dealsStore.getSyncState());
    }
  }, [isActive]);

  // Restore persisted filters & auto-migrate from legacy v4 shape
  useEffect(() => {
    (async () => {
      try {
        let v5Raw = await AsyncStorage.getItem(FEED_FILTERS_KEY_V5);
        if (!v5Raw) {
          v5Raw = await AsyncStorage.getItem(LEGACY_FEED_FILTERS_KEY_V5);
        }
        if (v5Raw) {
          const saved = JSON.parse(v5Raw);
          if (Array.isArray(saved.stores) && saved.stores.length > 0) {
            setSelectedStores(saved.stores);
          }
          if (Array.isArray(saved.types) && saved.types.length > 0) {
            setSelectedTypes(saved.types);
          }
          if (Array.isArray(saved.claimMethods) && saved.claimMethods.length > 0) {
            setSelectedClaimMethods(saved.claimMethods);
          }
          if (saved.sortId) {
            const idx = SORTS.findIndex((s) => s.id === saved.sortId);
            if (idx !== -1) setSortIndex(idx);
          }
          return;
        }

        // Migrate from legacy v4 single-value shape
        let v4Raw = await AsyncStorage.getItem(FEED_FILTERS_KEY_V4);
        if (!v4Raw) {
          v4Raw = await AsyncStorage.getItem(LEGACY_FEED_FILTERS_KEY_V4);
        }
        if (v4Raw) {
          const saved = JSON.parse(v4Raw);
          const migratedStores = saved.store && saved.store !== 'all' ? [saved.store] : ['all'];
          const migratedTypes = saved.type && saved.type !== 'all' ? [saved.type] : ['all'];
          const migratedClaimMethods =
            saved.claimMethod && saved.claimMethod !== 'any' ? [saved.claimMethod] : ['any'];
          const migratedSortId = saved.sortId || SORTS[saved.sortIndex || 0]?.id || 'new';
          const idx = SORTS.findIndex((s) => s.id === migratedSortId);

          setSelectedStores(migratedStores);
          setSelectedTypes(migratedTypes);
          setSelectedClaimMethods(migratedClaimMethods);
          if (idx !== -1) setSortIndex(idx);

          await AsyncStorage.setItem(
            FEED_FILTERS_KEY_V5,
            JSON.stringify({
              stores: migratedStores,
              types: migratedTypes,
              claimMethods: migratedClaimMethods,
              sortId: migratedSortId,
            })
          );
        }
      } catch {}
    })();
  }, []);

  // Handle external initialCategory update (e.g. from Home's stat tiles)
  useEffect(() => {
    if (initialCategory) {
      if (initialCategory === 'game' || initialCategory === 'dlc' || initialCategory === 'beta') {
        setSelectedTypes([initialCategory]);
      } else if (initialCategory === 'oneclick' || initialCategory === 'one_click') {
        setSelectedClaimMethods(['one_click']);
      } else if (initialCategory === 'tasks') {
        setSelectedClaimMethods(['tasks']);
      }
    }
  }, [initialCategory]);

  // Persist selected filters (search text is never saved)
  useEffect(() => {
    AsyncStorage.setItem(
      FEED_FILTERS_KEY_V5,
      JSON.stringify({
        stores: selectedStores,
        types: selectedTypes,
        claimMethods: selectedClaimMethods,
        sortId: SORTS[sortIndex]?.id || 'new',
      })
    ).catch(() => {});
  }, [selectedStores, selectedTypes, selectedClaimMethods, sortIndex]);

  // Pull-to-refresh
  const handleSync = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) {
        hapticFeedback.light();
        clearSessionFailedUrls();
        setRefreshing(true);
        setSyncState('syncing');
        setEntranceTrigger(true);
        setTimeout(() => setEntranceTrigger(false), 1200);
      }

      try {
        await dealsStore.sync(isManualRefresh);
      } catch (e) {
        console.error('[FeedScreen] Sync failed:', e);
        if (onConnectionError) onConnectionError();
      } finally {
        setRefreshing(false);
        if (isManualRefresh) {
          setSyncState('synced_just_now');
          hapticFeedback.success();
          setTimeout(() => {
            setSyncState('idle');
          }, 2200);
        }
      }
    },
    [onConnectionError]
  );

  const currentSort = SORTS[sortIndex] || SORTS[0];

  // Store Multi-Select Toggle
  const toggleStore = useCallback((storeId: string) => {
    hapticFeedback.selection();
    setSelectedStores((prev) => {
      const activeList = prev.filter((s) => s !== 'all');
      if (activeList.includes(storeId)) {
        const next = activeList.filter((s) => s !== storeId);
        return next.length === 0 ? ['all'] : next;
      } else {
        return [...activeList, storeId];
      }
    });
  }, []);

  // Type Multi-Select Toggle
  const toggleType = useCallback((typeId: string) => {
    hapticFeedback.selection();
    setSelectedTypes((prev) => {
      const activeList = prev.filter((t) => t !== 'all');
      if (activeList.includes(typeId)) {
        const next = activeList.filter((t) => t !== typeId);
        return next.length === 0 ? ['all'] : next;
      } else {
        return [...activeList, typeId];
      }
    });
  }, []);

  // Claim Method Multi-Select Toggle
  const toggleClaimMethod = useCallback((methodId: string) => {
    hapticFeedback.selection();
    setSelectedClaimMethods((prev) => {
      const activeList = prev.filter((m) => m !== 'any');
      if (activeList.includes(methodId)) {
        const next = activeList.filter((m) => m !== methodId);
        return next.length === 0 ? ['any'] : next;
      } else {
        return [...activeList, methodId];
      }
    });
  }, []);

  // One-tap clear all filters
  const handleClearFilters = useCallback(() => {
    hapticFeedback.light();
    setSelectedStores(['all']);
    setSelectedTypes(['all']);
    setSelectedClaimMethods(['any']);
    setSortIndex(0);
    setSearch('');
    setIsSearching(false);
  }, []);

  // Active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedStores.length > 0 && !selectedStores.includes('all')) {
      count += selectedStores.length;
    }
    if (selectedTypes.length > 0 && !selectedTypes.includes('all')) {
      count += selectedTypes.length;
    }
    if (selectedClaimMethods.length > 0 && !selectedClaimMethods.includes('any')) {
      count += selectedClaimMethods.length;
    }
    if (sortIndex !== 0) count++;
    if (search.trim().length > 0) count++;
    return count;
  }, [selectedStores, selectedTypes, selectedClaimMethods, sortIndex, search]);

  const isAnyFilterActive = activeFilterCount > 0;

  // Central Feed Filters & Selectors
  const currentFilters: FeedFilters = useMemo(
    () => ({
      stores: selectedStores,
      types: selectedTypes,
      claimMethods: selectedClaimMethods,
      sortId: currentSort.id as 'new' | 'end' | 'val' | 'claims',
      search,
    }),
    [selectedStores, selectedTypes, selectedClaimMethods, currentSort.id, search]
  );

  const activeDeals = dealsStore.getActiveDeals();
  const liveCount = activeDeals.length;
  const filteredDeals = useMemo(() => dealsStore.getFeedResults(currentFilters), [currentFilters, activeDeals]);
  const filterCounts = useMemo(() => dealsStore.getFilterCounts(currentFilters), [currentFilters, activeDeals]);

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

  // Stores available in active deals
  const primeNotice = dealsStore.getPrimeNotice();
  const availableStores = useMemo(() => {
    return STORE_OPTIONS.filter((s) => {
      if (s.id === 'all') return false;
      if (s.id === 'prime') return !!primeNotice;
      return activeDeals.some((d) => dealMatchesStore(d, s.id));
    });
  }, [activeDeals, primeNotice]);

  const showPrimeCardInFeed = useMemo(() => {
    if (!primeNotice) return false;
    if (selectedStores.includes('prime')) return true;
    if (selectedStores.includes('all')) {
      if (search.trim().length === 0) return true;
      const s = search.toLowerCase();
      if ('prime gaming'.includes(s) || 'amazon'.includes(s)) return true;
      return primeNotice.gameNames.some((g) => g.toLowerCase().includes(s));
    }
    return false;
  }, [primeNotice, selectedStores, search]);

  // ─── Header text ────────────────────────────────────────────────────────────
  const headerCountText = useMemo(() => {
    if (isAnyFilterActive) {
      return `${filteredDeals.length} of ${liveCount}`;
    }
    return `${liveCount} free games`;
  }, [isAnyFilterActive, filteredDeals.length, liveCount]);

  useEffect(() => {
    if (!reduceMotion) {
      Animated.sequence([
        Animated.timing(countFadeAnim, { toValue: 0.2, duration: 50, useNativeDriver: true }),
        Animated.timing(countFadeAnim, { toValue: 1, duration: 50, useNativeDriver: true }),
      ]).start();
    }
  }, [headerCountText, reduceMotion, countFadeAnim]);

  // Prefetch images for visible items ahead of time (Req 3)
  useEffect(() => {
    if (!isActive || !filteredDeals || filteredDeals.length === 0) return;
    const topVisible = filteredDeals.slice(0, 10);
    topVisible.forEach((deal) => {
      const uri = deal.resolvedPoster || deal.resolvedImage || deal.image;
      if (uri && typeof uri === 'string' && uri.startsWith('http')) {
        ExpoImage.prefetch(uri).catch(() => {});
      }
    });
  }, [isActive, filteredDeals]);

  // ─── Build Row Items Array & Precomputed Layouts (Prompt 4 Items 1, 2) ──────
  const claimedMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const d of filteredDeals) {
      map[d.id] = dealsStore.isClaimed(d.id);
    }
    return map;
  }, [filteredDeals]);

  const { rowData, rowLayouts } = useMemo(() => {
    const items: FeedRowItem[] = [];

    // Helper: chunk a list of deals into rows of size numCols
    const chunkDealsIntoRows = (deals: Deal[], prefix: string) => {
      const listToChunk: (Deal | null)[] = [...deals];

      for (let i = 0; i < listToChunk.length; i += numCols) {
        const slice = listToChunk.slice(i, i + numCols);
        while (slice.length < numCols) {
          slice.push(null);
        }
        items.push({
          type: 'row',
          id: `${prefix}-row-${i}`,
          cards: slice,
        });
      }
    };

    // Prompt 4 Item 1:
    // The "New since your last visit" block exists ONLY when sort is Newest and at least one matching deal is new.
    // It shows at most 12 deals (the rest go to Earlier).
    // Under any other sort there are no dividers and no New block at all.
    const isNewestSort = currentSort.id === 'new';
    const newDeals = isNewestSort ? filteredDeals.filter((d) => !!newDealIdsState[d.id]) : [];
    const hasNewBlock = isNewestSort && newDeals.length > 0;

    if (hasNewBlock) {
      const displayedNew = newDeals.slice(0, 12);
      const remainingNew = newDeals.slice(12);
      const earlierDeals = [
        ...remainingNew,
        ...filteredDeals.filter((d) => !newDealIdsState[d.id]),
      ];

      // Divider 1: New since your last visit
      items.push({
        type: 'divider',
        id: 'div-new',
        title: 'New since your last visit',
        count: displayedNew.length,
      });

      // Full-width card or horizontal row for New deals (no awkward half-width card)
      items.push({
        type: 'horizontal_rail',
        id: 'div-new-rail',
        deals: displayedNew,
      });

      // Divider 2: Earlier
      items.push({
        type: 'divider',
        id: 'div-earlier',
        title: 'Earlier',
        count: earlierDeals.length,
      });

      // Rows for Earlier deals
      chunkDealsIntoRows(earlierDeals, 'earlier');
    } else {
      // Any other sort, or no new deals: no dividers
      chunkDealsIntoRows(filteredDeals, 'all');
    }

    // Precompute exact offsets for getItemLayout
    const layouts: { length: number; offset: number }[] = [];
    let currentOffset = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const length = item.type === 'divider' ? 44 : cardH + rowGap;
      layouts.push({ length, offset: currentOffset });
      currentOffset += length;
    }

    return { rowData: items, rowLayouts: layouts };
  }, [
    filteredDeals,
    currentSort.id,
    newDealIdsState,
    numCols,
    primeNotice,
    showPrimeCardInFeed,
    cardH,
    rowGap,
  ]);

  const getItemLayout = useCallback(
    (_: any, index: number) => {
      const layout = rowLayouts[index] || {
        length: cardH + rowGap,
        offset: index * (cardH + rowGap),
      };
      return {
        length: layout.length,
        offset: layout.offset,
        index,
      };
    },
    [rowLayouts, cardH, rowGap]
  );

  const keyExtractor = useCallback((item: FeedRowItem) => item.id, []);

  // ─── Sticky Slim Bar Scroll Animation (Prompt 4 Item 3) ─────────────────────
  const barTranslateY = useRef(new Animated.Value(0)).current;
  const lastScrollY = useRef(0);
  const barHiddenRef = useRef(false);
  const isKeyboardOpenRef = useRef(false);

  const setKeyboardOpenState = useCallback((isOpen: boolean) => {
    isKeyboardOpenRef.current = isOpen;
    if (isOpen) {
      barHiddenRef.current = false;
      barTranslateY.setValue(0);
    }
  }, [barTranslateY]);

  // Smooth keyboard-controller animated tracking to eliminate keyboard jump/layout flicker
  useKeyboardHandler(
    {
      onStart: (e) => {
        'worklet';
        if (e.height > 0) {
          runOnJS(setKeyboardOpenState)(true);
        }
      },
      onEnd: (e) => {
        'worklet';
        runOnJS(setKeyboardOpenState)(e.height > 0);
      },
    },
    [setKeyboardOpenState]
  );

  // Web fallback where native keyboard-controller events do not fire
  useEffect(() => {
    if (Platform.OS === 'web') {
      const showSub = Keyboard.addListener('keyboardDidShow', () => {
        setKeyboardOpenState(true);
      });
      const hideSub = Keyboard.addListener('keyboardDidHide', () => {
        setKeyboardOpenState(false);
      });
      return () => {
        showSub.remove();
        hideSub.remove();
      };
    }
  }, [setKeyboardOpenState]);

  const [pullDistance, setPullDistance] = useState(0);
  const flashListRef = useRef<any>(null);
  const hasTriggeredHapticRef = useRef(false);
  const touchStartY = useRef(0);
  const isPullingRef = useRef(false);

  const handleTouchStart = useCallback((e: any) => {
    if (Platform.OS !== 'web') return;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    touchStartY.current = clientY;
    isPullingRef.current = false;
  }, []);

  const handleTouchMove = useCallback((e: any) => {
    if (Platform.OS !== 'web') return;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const deltaY = clientY - touchStartY.current;

    const scrollEl = (flashListRef.current as any)?.getScrollableNode?.() || (flashListRef.current as any);
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
  }, [flashListRef]);

  const handleTouchEnd = useCallback(() => {
    if (Platform.OS !== 'web') return;
    if (isPullingRef.current) {
      if (pullDistance >= 55) {
        hapticFeedback.light();
        handleSync(true);
      }
      setPullDistance(0);
      isPullingRef.current = false;
      hasTriggeredHapticRef.current = false;
    }
  }, [pullDistance, handleSync]);

  const handleScroll = useCallback(
    (e: any) => {
      const y = e?.nativeEvent?.contentOffset?.y ?? 0;
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

      const diff = y - lastScrollY.current;

      if (!isKeyboardOpenRef.current) {
        if (diff > 24 && y > 80 && !barHiddenRef.current) {
          barHiddenRef.current = true;
          // Spring slide-up: faster than timing, natural deceleration at top
          Animated.spring(barTranslateY, {
            toValue: -52,
            stiffness: 400,
            damping: 38,
            mass: 0.9,
            overshootClamping: true,
            useNativeDriver: true,
          }).start();
        } else if ((diff < -12 || y < 80) && barHiddenRef.current) {
          barHiddenRef.current = false;
          // Spring slide-down: overshoots slightly for a satisfying 'snap back'
          Animated.spring(barTranslateY, {
            toValue: 0,
            stiffness: 380,
            damping: 30,
            mass: 0.9,
            overshootClamping: false,
            useNativeDriver: true,
          }).start();
        }
      }
      lastScrollY.current = y;
    },
    [barTranslateY, pullDistance]
  );

  // ─── Prefetch Next 6 Rows of Images (Prompt 4 Item 5) ───────────────────────
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (!viewableItems || viewableItems.length === 0) return;
    const maxIdx = Math.max(...viewableItems.map((v: any) => v.index ?? 0));
    const nextLimit = Math.min(rowData.length, maxIdx + 7);

    for (let i = maxIdx + 1; i < nextLimit; i++) {
      const item = rowData[i];
      if (item && item.type === 'row') {
        for (const card of item.cards) {
          if (card) {
            const url = card.resolvedImage || card.image || card.resolvedPoster;
            if (url && typeof url === 'string' && url.startsWith('http')) {
              ExpoImage.prefetch(url).catch(() => {});
            }
          }
        }
      }
    }
  }).current;

  // Filter Sheet Animations
  const openSheet = useCallback(() => {
    setSheetOpen(true);
    if (reduceMotion) {
      sheetAnim.setValue(0);
      backdropAnim.setValue(1);
    } else {
      sheetAnim.setValue(Dimensions.get('window').height);
      backdropAnim.setValue(0);
      // Spring open: sheet drops into place with natural deceleration (feels weighted)
      Animated.parallel([
        Animated.spring(sheetAnim, {
          toValue: 0,
          stiffness: 260,
          damping: 30,
          mass: 1.1,
          overshootClamping: false,
          restDisplacementThreshold: 0.5,
          restSpeedThreshold: 0.5,
          useNativeDriver: true,
        }),
        Animated.spring(backdropAnim, {
          toValue: 1,
          stiffness: 280,
          damping: 32,
          mass: 1,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [reduceMotion, sheetAnim, backdropAnim]);

  const closeSheet = useCallback(() => {
    if (reduceMotion) {
      setSheetOpen(false);
    } else {
      // Spring exit: overshootClamping ensures it exits screen cleanly without bouncing back
      Animated.parallel([
        Animated.spring(sheetAnim, {
          toValue: Dimensions.get('window').height,
          stiffness: 340,
          damping: 38,
          mass: 1,
          overshootClamping: true,
          restDisplacementThreshold: 1,
          restSpeedThreshold: 1,
          useNativeDriver: true,
        }),
        Animated.spring(backdropAnim, {
          toValue: 0,
          stiffness: 340,
          damping: 38,
          mass: 1,
          overshootClamping: true,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setSheetOpen(false);
      });
    }
  }, [reduceMotion, sheetAnim, backdropAnim]);

  useEffect(() => {
    if (!sheetOpen) return;
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeSheet();
      return true;
    });
    return () => backSub.remove();
  }, [sheetOpen, closeSheet]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) => {
        return gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx);
      },
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) {
          sheetAnim.setValue(gesture.dy);
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 60 || gesture.vy > 0.35) {
          closeSheet();
        } else {
          // Spring snap-back on partial drag release (anchored to bottom boundary with overshootClamping: true)
          Animated.spring(sheetAnim, {
            toValue: 0,
            stiffness: 380,
            damping: 36,
            mass: 1,
            overshootClamping: true,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  // Skeleton Loader with 400ms min display
  const { showSkeleton, contentFadeAnim } = useSkeletonDisplay(
    activeDeals.length === 0,
    400
  );

  if (showSkeleton) {
    return <FeedSkeleton />;
  }

  const handleContainerLayout = useCallback((e: any) => {
    const w = e?.nativeEvent?.layout?.width;
    if (w && w > 50 && Math.abs(w - containerW) > 2) {
      setContainerW(w);
    }
  }, [containerW]);

  return (
    <Animated.View
      style={[styles.container, { opacity: contentFadeAnim }]}
      onLayout={handleContainerLayout}
    >
      {/* Laser sync hairline */}
      <AnimatedSyncHairline active={syncState === 'syncing' || refreshing} />

      {/* Main Shelf FlashList (ONE recycled list of ROW items) */}
      <Animated.View style={{ flex: 1, opacity: listFadeAnim }}>
        <FlashList
          ref={flashListRef}
          key={`feed-shelf-${numCols}`}
          data={rowData}
          keyExtractor={keyExtractor}
          getItemType={(item: FeedRowItem) => item.type}
          onScroll={handleScroll}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          // 100ms throttle: the bar hide/show only needs direction, not pixel-accurate
          // position per frame. Reduces JS bridge crossings from ~60/s to ~10/s.
          scrollEventThrottle={16}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 10 }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.listContent, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => handleSync(true)}
              tintColor={Platform.OS === 'ios' ? '#EDEDEB' : undefined}
              colors={Platform.OS === 'android' ? ['#EDEDEB'] : undefined}
              progressBackgroundColor={Platform.OS === 'android' ? '#161618' : undefined}
            />
          }
          ListHeaderComponent={
            <View style={styles.headerContainer}>
              {/* Minimalist Monospace Pull-to-Refresh Ticker */}
              <MonospacePullTicker
                pullDistance={pullDistance}
                isSyncing={refreshing}
                isSyncedJustNow={syncState === 'synced_just_now'}
              />

              {/* Native Update Banner (Only triggers when a newer native binary build e.g. >= 1.3.0 is out, never on OTA) */}
              {nativeUpdate?.isUpdateAvailable && !nativeUpdateDismissed && (
                <View style={styles.nativeUpdateBanner}>
                  <View style={styles.nativeUpdateHeader}>
                    <View style={styles.nativeUpdateBadge}>
                      <Text style={styles.nativeUpdateBadgeText}>UPDATE</Text>
                    </View>
                    <Text style={styles.nativeUpdateTitle}>v{nativeUpdate.version} Available</Text>
                  </View>
                  <Text style={styles.nativeUpdateSub}>
                    A new native build is ready with latest performance upgrades and fixes.
                  </Text>
                  <View style={styles.nativeUpdateActionRow}>
                    <Pressable
                      onPress={() => {
                        if (nativeUpdate.downloadUrl) {
                          Linking.openURL(nativeUpdate.downloadUrl);
                        }
                      }}
                      style={styles.nativeUpdateDownloadBtn}
                    >
                      <Text style={styles.nativeUpdateDownloadBtnText}>Download v{nativeUpdate.version}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setNativeUpdateDismissed(true);
                        updateCheckerService.dismissVersion(nativeUpdate.version);
                      }}
                      style={styles.nativeUpdateDismissBtn}
                    >
                      <Text style={styles.nativeUpdateDismissBtnText}>Later</Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {/* Row 1: "Feed" serif 32px left and "Filter · N" mono text button right */}
              <View style={styles.headerRow1}>
                <Text style={styles.headerFeedTitle}>Feed</Text>
                <Pressable
                  onPress={openSheet}
                  style={styles.headerFilterBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`Filter${activeFilterCount > 0 ? `, ${activeFilterCount} active` : ''}`}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text
                    style={[
                      styles.headerFilterBtnText,
                      isAnyFilterActive && styles.headerFilterBtnTextActive,
                    ]}
                  >
                    {activeFilterCount > 0 ? `FILTER · ${activeFilterCount}` : 'FILTER'}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.headerSubRow}>
                <Text style={styles.headerUpdatedText}>{updatedText}</Text>
              </View>

              {isOffline && (
                <View style={styles.offlineBanner}>
                  <Ionicons name="cloud-offline-outline" size={13} color="#A1A1A6" />
                  <Text style={styles.offlineBannerText}>Offline · Showing cached deals</Text>
                </View>
              )}

              {/* Row 2: count mono muted left and sort as tappable text "Newest ▾" right */}
              <View style={styles.headerRow2}>
                <Animated.Text
                  style={[styles.headerCountText, { opacity: countFadeAnim }]}
                  numberOfLines={1}
                >
                  {headerCountText}
                </Animated.Text>
                <Pressable
                  onPress={() => setSortModalOpen(true)}
                  style={styles.headerSortBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`Sort by ${currentSort.label}`}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={styles.headerSortBtnText}>{currentSort.label} ▾</Text>
                </Pressable>
              </View>

              {/* Row 3: Search bar & store icons below the sort button */}
              <View style={styles.headerRow3}>
                {isSearching ? (
                  <View style={styles.searchBarInner}>
                    <Ionicons name="search" size={16} color="#86868B" style={{ marginRight: 8 }} />
                    <TextInput
                      style={styles.searchBarInput}
                      placeholder="Search games, DLC..."
                      placeholderTextColor="#636366"
                      value={search}
                      onChangeText={setSearch}
                      autoFocus={true}
                      autoCorrect={false}
                      autoCapitalize="none"
                      returnKeyType="search"
                    />
                    <Pressable
                      onPress={() => {
                        setSearch('');
                        setIsSearching(false);
                      }}
                      hitSlop={8}
                      style={styles.searchCancelBtn}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel search"
                    >
                      <Text style={styles.searchCancelText}>Cancel</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.storeStripRow}>
                    <Pressable
                      onPress={() => setIsSearching(true)}
                      style={styles.searchIconButton}
                      accessibilityRole="button"
                      accessibilityLabel="Search"
                    >
                      <Ionicons name="search" size={18} color="#EDEDEB" />
                    </Pressable>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.storeStripScroll}
                      keyboardShouldPersistTaps="handled"
                    >
                      {availableStores.map((store) => {
                        const isSelected = selectedStores.includes(store.id);
                        return (
                          <StoreStripItem
                            key={store.id}
                            storeId={store.id}
                            label={store.label}
                            count={filterCounts.stores[store.id] ?? 0}
                            isSelected={isSelected}
                            onPress={() => toggleStore(store.id)}
                            reduceMotion={reduceMotion}
                          />
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </View>
            </View>
          }
          renderItem={({ item, index }) => (
            <MemoizedShelfRow
              item={item}
              rowIndex={index}
              cardW={cardW}
              cardH={cardH}
              artH={artH}
              infoH={infoH}
              onDealSelect={onDealSelect}
              reduceMotion={reduceMotion}
              isNewMap={newDealIdsState}
              claimedMap={claimedMap}
              isInitialEntrance={entranceTrigger}
            />
          )}
          ListEmptyComponent={
            rowData.length > 0 ? null : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>Nothing matches</Text>
                {isAnyFilterActive && (
                  <Pressable onPress={handleClearFilters} style={styles.emptyClearBtn}>
                    <Text style={styles.emptyClearBtnText}>Clear filters</Text>
                  </Pressable>
                )}
              </View>
            )
          }
        />
      </Animated.View>

      {/* 4. Small Sort Popover Modal */}
      <ContainedModal
        visible={sortModalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSortModalOpen(false)}
        statusBarTranslucent={true}
      >
        <Pressable style={styles.sortBackdrop} onPress={() => setSortModalOpen(false)}>
          <View style={styles.sortPopoverWrapper}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View style={[styles.sortPopover, { top: insets.top + 70 }]}>
                <Text style={styles.sortPopoverHeading}>SORT BY</Text>
                {SORTS.map((s, idx) => {
                  const isActiveSort = sortIndex === idx;
                  return (
                    <Pressable
                      key={s.id}
                      onPress={() => {
                        setSortIndex(idx);
                        setSortModalOpen(false);
                      }}
                      style={styles.sortOptionRow}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isActiveSort }}
                    >
                      <Text
                        style={[
                          styles.sortOptionText,
                          isActiveSort && styles.sortOptionTextActive,
                        ]}
                      >
                        {s.label}
                      </Text>
                      {isActiveSort && (
                        <Ionicons name="checkmark" size={16} color="#EDEDEB" />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </Pressable>
          </View>
        </Pressable>
      </ContainedModal>

      {/* 5. Filter Sheet (Bottom sheet, opaque #000, 1px top hairline, 220ms ease-out) */}
      <ContainedModal
        visible={sheetOpen}
        transparent={true}
        animationType="none"
        onRequestClose={closeSheet}
        statusBarTranslucent={true}
      >
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center' }]} pointerEvents="box-none">
          {/* Backdrop */}
          <Animated.View
            style={[
              styles.sheetBackdrop,
              {
                opacity: backdropAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 0.72],
                }),
              },
            ]}
          >
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={closeSheet}
              accessibilityRole="button"
              accessibilityLabel="Close filter sheet"
            />
          </Animated.View>

          {/* Sheet Container */}
          <Animated.View
            style={[
              styles.sheetContainer,
              {
                transform: [{ translateY: sheetAnim }],
                maxHeight: Dimensions.get('window').height * 0.88,
              },
            ]}
          >
            {/* Drag Handle & Header */}
            <View {...panResponder.panHandlers} style={styles.sheetHeader}>
              <View style={styles.sheetDragBar} />
              <View style={styles.sheetTitleRow}>
                <Text style={styles.sheetTitle}>Filters</Text>
                <Pressable
                  onPress={closeSheet}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={styles.sheetCloseBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Close filter sheet"
                >
                  <Ionicons name="close" size={18} color="#86868B" />
                </Pressable>
              </View>
            </View>

            {/* Scrollable Filter Content */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.sheetScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              {/* TYPE: Three equal text segments (Game, DLC, Beta) */}
              <View style={styles.sheetSection}>
                <Text style={styles.sheetSectionLabel}>TYPE</Text>
                <View style={styles.segmentRow}>
                  {TYPE_OPTIONS.map((opt) => {
                    const isSelected = selectedTypes.includes(opt.id);
                    return (
                      <Pressable
                        key={opt.id}
                        onPress={() => toggleType(opt.id)}
                        style={styles.segmentTarget}
                        accessibilityRole="button"
                        accessibilityLabel={`Type: ${opt.label}`}
                        accessibilityState={{ selected: isSelected }}
                      >
                        <Text
                          style={[
                            styles.segmentText,
                            isSelected && styles.segmentTextSelected,
                          ]}
                        >
                          {opt.label}
                        </Text>
                        {isSelected && <View style={styles.segmentUnderline} />}
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* CLAIM METHOD: Two equal text segments (One-click, Tasks required) */}
              <View style={styles.sheetSection}>
                <Text style={styles.sheetSectionLabel}>CLAIM METHOD</Text>
                <View style={styles.segmentRow}>
                  {CLAIM_METHOD_OPTIONS.map((opt) => {
                    const isSelected = selectedClaimMethods.includes(opt.id);
                    return (
                      <Pressable
                        key={opt.id}
                        onPress={() => toggleClaimMethod(opt.id)}
                        style={styles.segmentTarget}
                        accessibilityRole="button"
                        accessibilityLabel={`Claim method: ${opt.label}`}
                        accessibilityState={{ selected: isSelected }}
                      >
                        <Text
                          style={[
                            styles.segmentText,
                            isSelected && styles.segmentTextSelected,
                          ]}
                        >
                          {opt.label}
                        </Text>
                        {isSelected && <View style={styles.segmentUnderline} />}
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* STORES: Ruled rows with store icon, name, count (selected only), square checkbox */}
              <View style={styles.sheetSection}>
                <Text style={styles.sheetSectionLabel}>STORES</Text>
                <View style={styles.ruledList}>
                  {availableStores.map((store) => {
                    const isSelected = selectedStores.includes(store.id);
                    const count = filterCounts.stores[store.id] ?? 0;
                    return (
                      <Pressable
                        key={store.id}
                        onPress={() => toggleStore(store.id)}
                        style={styles.storeRuledRow}
                        accessibilityRole="checkbox"
                        accessibilityLabel={store.label}
                        accessibilityState={{ checked: isSelected }}
                      >
                        <View style={styles.storeRuledLeft}>
                          <StoreIcon
                            store={store.id}
                            size={20}
                            color={isSelected ? '#EDEDEB' : '#86868B'}
                          />
                          <Text
                            style={[
                              styles.storeRuledName,
                              isSelected && styles.storeRuledNameSelected,
                            ]}
                          >
                            {store.label}
                          </Text>
                        </View>

                        <View style={styles.storeRuledRight}>
                          {/* Count appears ONLY on SELECTED rows */}
                          {isSelected && (
                            <Text style={styles.storeRuledCount}>{count}</Text>
                          )}
                          {/* Square checkbox (1px border, white check when selected) */}
                          <View
                            style={[
                              styles.squareCheckbox,
                              isSelected && styles.squareCheckboxSelected,
                            ]}
                          >
                            {isSelected && (
                              <Ionicons name="checkmark" size={13} color="#EDEDEB" />
                            )}
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </ScrollView>

            {/* STICKY BOTTOM BAR: "Show N games" button and "Clear all" link */}
            <View
              style={[
                styles.sheetBottomBar,
                { paddingBottom: Math.max(insets.bottom, 16) + 12 },
              ]}
            >
              <Pressable
                onPress={closeSheet}
                style={styles.sheetApplyBtn}
                accessibilityRole="button"
                accessibilityLabel={`Show ${filteredDeals.length} games`}
              >
                <Text style={styles.sheetApplyBtnText}>
                  Show {filteredDeals.length} {filteredDeals.length === 1 ? 'game' : 'games'}
                </Text>
              </Pressable>

              <Pressable
                onPress={handleClearFilters}
                style={styles.sheetClearAllBtn}
                hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
                accessibilityRole="button"
                accessibilityLabel="Clear all filters"
              >
                <Text style={styles.sheetClearAllText}>Clear all</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </ContainedModal>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    position: 'relative',
    overflow: 'hidden',
  },

  // ─── Sticky Slim Bar ────────────────────────────────────────────────────────
  stickyBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 52,
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
    zIndex: 50,
  },
  storeStripRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchIconButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  storeStripScroll: {
    paddingLeft: 4,
    paddingRight: 24,
    alignItems: 'center',
  },
  storeStripTarget: {
    paddingHorizontal: 10,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    marginRight: 6,
  },
  storeStripContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  storeStripCount: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: '#8E8E93',
    fontVariant: ['tabular-nums'],
  },
  storeStripCountSelected: {
    color: '#EDEDEB',
  },
  storeUnderline: {
    position: 'absolute',
    bottom: 2,
    left: 8,
    right: 8,
    height: 2,
    backgroundColor: '#EDEDEB',
    borderRadius: 1,
  },
  searchBarInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  searchBarInput: {
    flex: 1,
    height: 38,
    color: '#EDEDEB',
    fontFamily: FONTS.regular,
    fontSize: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#3A3A3D',
    paddingVertical: 0,
  },
  searchCancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginLeft: 8,
  },
  searchCancelText: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: '#86868B',
    fontWeight: '600',
  },

  // ─── Header Component ───────────────────────────────────────────────────────
  headerContainer: {
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  headerSubRow: {
    marginTop: 2,
    marginBottom: 4,
  },
  headerUpdatedText: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    color: '#A1A1A6',
    letterSpacing: 0.2,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  offlineBannerText: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: '#A1A1A6',
  },
  headerRow3: {
    height: 48,
    marginTop: 6,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  headerRow1: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 6,
  },
  headerFeedTitle: {
    fontFamily: FONTS.display,
    fontSize: 24,
    lineHeight: 28,
    color: '#EDEDEB',
    letterSpacing: -0.6,
  },
  headerFilterBtn: {
    minHeight: 48,
    minWidth: 48,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingLeft: 12,
  },
  headerFilterBtnText: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    fontWeight: '700',
    color: '#86868B',
    letterSpacing: 0.2,
    
  },
  headerFilterBtnTextActive: {
    color: '#EDEDEB',
  },
  headerRow2: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
  },
  headerCountText: {
    fontFamily: FONTS.mono,
    fontSize: 11.5,
    color: '#86868B',
    letterSpacing: 0.2,
    
  },
  headerSortBtn: {
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  headerSortBtnText: {
    fontFamily: FONTS.mono,
    fontSize: 11.5,
    color: '#EDEDEB',
    letterSpacing: 0.5,
  },

  // ─── Shelf List & Rows ──────────────────────────────────────────────────────
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 0,
  },
  shelfRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },

  // ─── Dividers ──────────────────────────────────────────────────────────────
  dividerRow: {
    height: 44,
    justifyContent: 'center',
  },
  dividerTitle: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    color: '#86868B',
    letterSpacing: 0.2,
    
    fontWeight: '700',
  },
  dividerRule: {
    height: 1,
    backgroundColor: '#1C1C1E',
    marginTop: 6,
  },

  // ─── Two-Up Card Styles ────────────────────────────────────────────────────
  cardContainer: {
    overflow: 'hidden',
  },
  cardPressable: {
    overflow: 'hidden',
  },
  artSurface: {
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    backgroundColor: '#111317',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  gatedArtSurface: {
    ...(StyleSheet.absoluteFill as any),
    backgroundColor: '#18181A',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  gated18Badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#D32F2F',
    borderRadius: 4,
    marginBottom: 6,
  },
  gated18BadgeText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  gatedArtTitle: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: '#EDEDEB',
    textAlign: 'center',
    marginBottom: 2,
  },
  gatedArtSub: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: '#86868B',
    textAlign: 'center',
  },

  infoBlock: {
    paddingTop: 6,
  },
  cardRow1: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 16,
  },
  newTagText: {
    fontFamily: FONTS.mono,
    fontSize: 9.5,
    fontWeight: '800',
    color: '#EDEDEB',
    letterSpacing: 0.6,
  },
  dlcTag: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    backgroundColor: 'rgba(168, 85, 247, 0.16)',
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: 'rgba(168, 85, 247, 0.35)',
  },
  betaTag: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(251, 146, 60, 0.35)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(251, 146, 60, 0.12)',
  },
  tasksTag: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  tagText: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    color: '#EDEDEB',
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  cardMetaText: {
    fontFamily: FONTS.bold,
    fontSize: 10,
    color: '#8E8E93',
    letterSpacing: 0.6,
    
    flexShrink: 1,
  },
  cardRatingBright: {
    fontFamily: FONTS.bold,
    fontSize: 10,
    color: '#EDEDEB',
    letterSpacing: 0.4,
  },
  cardMetaDot: {
    color: '#636366',
    fontSize: 10,
  },
  storeShortName: {
    flexShrink: 1,
    fontFamily: FONTS.mono,
    fontSize: 10.5,
    color: '#86868B',
    letterSpacing: 0.4,
  },
  cardTitle: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    lineHeight: 19,
    color: '#EDEDEB',
    letterSpacing: -0.3,
    marginTop: 3,
  },
  cardRow3: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 18,
    marginTop: 5,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  struckPrice: {
    fontFamily: FONTS.monoRegular,
    fontSize: 11,
    color: '#86868B',
    textDecorationLine: 'line-through',
    marginRight: 4,
  },
  freePrice: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    fontWeight: '700',
    color: '#EDEDEB',
    letterSpacing: 0.5,
  },
  claimedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  claimedPlainText: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    color: '#8E8E93',
  },
  claimedPill: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.badgeClaimedBg,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.badgeClaimedBorder,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
  },
  claimedText: {
    fontFamily: FONTS.mono,
    fontSize: 9.5,
    color: COLORS.badgeClaimedText,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  timeLeftText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: '#86868B',
    letterSpacing: 0.4,
  },
  timeLeftUrgent: {
    color: COLORS.badgeUrgentText,
    fontWeight: '700',
  },
  infinityTimeText: {
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '700',
    color: '#86868B',
  },

  // ─── Empty State ────────────────────────────────────────────────────────────
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyTitle: {
    fontFamily: FONTS.extraBold,
    fontSize: 22,
    color: '#EDEDEB',
    marginBottom: 12,
    letterSpacing: -0.4,
  },
  emptyClearBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EDEDEB',
  },
  emptyClearBtnText: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    fontWeight: '700',
    color: '#EDEDEB',
    letterSpacing: 0.2,
    
  },

  // ─── Small Sort Popover Modal ───────────────────────────────────────────────
  sortBackdrop: {
    ...(StyleSheet.absoluteFill as any),
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    zIndex: 200,
  },
  sortPopoverWrapper: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    alignItems: 'flex-end',
    paddingRight: 20,
  },
  sortPopover: {
    width: 170,
    backgroundColor: '#141416',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    paddingVertical: 8,
    elevation: 8,
  },
  sortPopoverHeading: {
    fontFamily: FONTS.mono,
    fontSize: 9.5,
    fontWeight: '700',
    color: '#636366',
    letterSpacing: 0.2,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  sortOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sortOptionText: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: '#86868B',
  },
  sortOptionTextActive: {
    color: '#EDEDEB',
    fontWeight: '600',
  },

  // ─── Filter Sheet ───────────────────────────────────────────────────────────
  sheetBackdrop: {
    ...(StyleSheet.absoluteFill as any),
    backgroundColor: '#000000',
    zIndex: 100,
  },
  sheetContainer: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: '#000000',
    borderTopWidth: 1,
    borderTopColor: '#1C1C1E',
    borderLeftWidth: Platform.OS === 'web' ? 1 : 0,
    borderRightWidth: Platform.OS === 'web' ? 1 : 0,
    borderLeftColor: '#1C1C1E',
    borderRightColor: '#1C1C1E',
    borderTopLeftRadius: Platform.OS === 'web' ? 20 : 0,
    borderTopRightRadius: Platform.OS === 'web' ? 20 : 0,
    overflow: 'hidden',
    zIndex: 101,
  },
  sheetHeader: {
    paddingTop: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  sheetDragBar: {
    width: 36,
    height: 4,
    backgroundColor: '#2C2C2E',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 10,
  },
  sheetTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  sheetTitle: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    fontWeight: '700',
    color: '#86868B',
    letterSpacing: 0.2,
    
  },
  sheetCloseBtn: {
    padding: 4,
  },
  sheetCloseText: {
    fontFamily: FONTS.mono,
    fontSize: 14,
    color: '#86868B',
  },
  sheetScrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  sheetSection: {
    marginTop: 18,
  },
  sheetSectionLabel: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    fontWeight: '700',
    color: '#86868B',
    letterSpacing: 0.2,
    
    marginBottom: 10,
  },
  segmentRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  segmentTarget: {
    flex: 1,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  segmentText: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: '#86868B',
  },
  segmentTextSelected: {
    color: '#EDEDEB',
    fontWeight: '600',
  },
  segmentUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 12,
    right: 12,
    height: 1,
    backgroundColor: '#EDEDEB',
  },
  ruledList: {
    borderTopWidth: 1,
    borderTopColor: '#1C1C1E',
  },
  storeRuledRow: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  storeRuledLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  storeRuledName: {
    fontFamily: FONTS.regular,
    fontSize: 15,
    color: '#86868B',
  },
  storeRuledNameSelected: {
    color: '#EDEDEB',
    fontWeight: '600',
  },
  storeRuledRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  storeRuledCount: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: '#86868B',
  },
  squareCheckbox: {
    width: 18,
    height: 18,
    borderWidth: 1,
    borderColor: '#3A3A3D',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  squareCheckboxSelected: {
    borderColor: '#EDEDEB',
  },
  sheetBottomBar: {
    paddingHorizontal: 20,
    paddingTop: 14,
    backgroundColor: '#000000',
    borderTopWidth: 1,
    borderTopColor: '#1C1C1E',
  },
  sheetApplyBtn: {
    height: 48,
    backgroundColor: '#EDEDEB',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetApplyBtnText: {
    fontFamily: FONTS.mono,
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: 0.5,
  },
  sheetClearAllBtn: {
    marginTop: 10,
    alignSelf: 'center',
    paddingVertical: 4,
  },
  sheetClearAllText: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: '#86868B',
    letterSpacing: 0.5,
  },
  nativeUpdateBanner: {
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
  },
  nativeUpdateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  nativeUpdateBadge: {
    backgroundColor: '#EDEDEB',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  nativeUpdateBadgeText: {
    fontFamily: FONTS.mono,
    fontWeight: '700',
    fontSize: 10,
    color: '#000000',
    letterSpacing: 0.2,
  },
  nativeUpdateTitle: {
    fontFamily: FONTS.mono,
    fontWeight: '700',
    fontSize: 14,
    color: '#EDEDEB',
  },
  nativeUpdateSub: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: '#8E8E93',
    lineHeight: 16,
    marginBottom: 12,
  },
  nativeUpdateActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nativeUpdateDownloadBtn: {
    backgroundColor: '#EDEDEB',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
    marginRight: 10,
  },
  nativeUpdateDownloadBtnText: {
    fontFamily: FONTS.mono,
    fontWeight: '700',
    fontSize: 12,
    color: '#000000',
  },
  nativeUpdateDismissBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  nativeUpdateDismissBtnText: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: '#8E8E93',
  },
});

export default React.memo(FeedScreen);
