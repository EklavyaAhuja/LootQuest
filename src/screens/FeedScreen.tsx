import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Image,
  Pressable,
  Modal,
  Platform,
} from 'react-native';
import { fetchMergedGameFeed } from '../services/redditService';
import { Deal } from '../models/Deal';
import { expiredFeedService } from '../services/ExpiredFeedService';
import { tasksFeedService } from '../services/TasksFeedService';
import { addSeenPosts, getClaimedPosts, getTrackedPosts } from '../services/storageService';
import { COLORS, FONTS, getPlatformColor } from '../theme/theme';
import BouncyPressable from '../components/BouncyPressable';
import { Search, RotateCcw, SlidersHorizontal, ArrowUpDown, X, Check, Monitor, Gamepad, Smartphone, Globe } from 'lucide-react-native';
import { filterDeals, mergeAndDeduplicateDeals } from '../services/filterUtils';
import { dealEnrichmentService } from '../services/DealEnrichmentService';
import { isDealExpired, getTimeLeft, isDealClaimed } from '../utils/dealUtils';
import HourglassLoader from '../components/HourglassLoader';
import StoreIcon from '../components/StoreIcon';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isRedditRateLimited, clearRedditRateLimit } from '../services/redditFetch';
import { getCachedDeal, removeCachedDeal } from '../services/DealCache';

interface FeedScreenProps {
  onDealSelect: (deal: Deal) => void;
  claimedDeals?: Deal[];
  onNewAlerts?: (count: number) => void;
  onConnectionError?: () => void;
}

const PLATFORMS_FILTER = ['All', 'Steam', 'Epic Games', 'GOG', 'itch.io', 'Playstation', 'Xbox', 'Mobile', 'Stove', 'Alienware Arena'];
const CATEGORIES_FILTER = ['All', 'Game', 'DLC', 'Beta', 'Mobile Game'];
const CLAIM_METHODS_FILTER = ['All', 'One-Click', 'Tasks Required'];

const COVER_IMAGES = [
  'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=600&q=80',
];

const getDisplayType = (type: Deal['type']) => {
  switch (type) {
    case 'full_game': return 'GAME';
    case 'dlc': return 'DLC';
    case 'beta': return 'BETA';
    case 'item': return 'ITEM';
    case 'mobile_game': return 'MOBILE';
    case 'loot': return 'LOOT';
    default: return 'GAME';
  }
};

const getPlatformIcon = (platform: string) => {
  return <StoreIcon platform={platform} size={12} color={COLORS.textMuted} style={{ marginRight: 4 }} />;
};

// Memoized Card Component for performance
interface DealCardProps {
  item: Deal;
  isClaimed: boolean;
  onPress: (deal: Deal) => void;
  getGameCover: (id: string) => string;
  hasImageError: boolean;
  handleImageError: (id: string) => void;
}

const DealCard = React.memo(({
  item,
  isClaimed,
  onPress,
  getGameCover,
  hasImageError,
  handleImageError,
}: DealCardProps) => {
  const isExpired = item.isExpired || item.expiryStatus === 'EXPIRED';
  const displayType = getDisplayType(item.type);
  const timeLeft = item.timeLeft || 'LIVE NOW';

  // Calculate progress percent (mocked for visual flair since we don't have start date always)
  const timeLeftUpper = timeLeft.toUpperCase();
  const isEndingSoon = (timeLeftUpper.includes('H') || timeLeftUpper.includes('M') || timeLeftUpper.includes('MIN') || timeLeftUpper.includes('AGO')) && !timeLeftUpper.includes('D') && !timeLeftUpper.includes('NO EXPIRY');
  const progressPercent = isExpired ? 100 : (isEndingSoon ? 85 : 30);

  return (
    <View style={[styles.questCard, isExpired && styles.expiredItemCard]}>
      {/* Cover Image sitting on top */}
      <View style={styles.cardImageContainer}>
        <Image 
          source={{ uri: (!hasImageError && item.image && item.image !== 'placeholder') ? item.image : getGameCover(item.id) }} 
          style={styles.cardImage} 
          blurRadius={item.isNsfw ? 15 : 0}
          onError={() => handleImageError(item.id)}
        />
        <View style={styles.cardImageGradient} />
        {item.isNsfw && (
          <View style={styles.nsfwThumbOverlay}>
            <Text style={styles.nsfwThumbText}>NSFW</Text>
          </View>
        )}
      </View>

      {/* Content Section overlapping image */}
      <View style={styles.cardContent}>
        {/* Title */}
        <Text style={[styles.questTitle, isExpired && styles.expiredTitle]}>
          {item.title}
        </Text>

        {/* Status Block */}
        <View style={styles.statusBlock}>
          <View style={styles.statusRow}>
            <View style={styles.timerWrapper}>
              <Text style={[
                styles.timerIconText, 
                { color: isExpired ? COLORS.warning : (isEndingSoon ? COLORS.warning : COLORS.success) }
              ]}>🕒</Text>
              <Text style={[
                styles.timerText, 
                { color: isExpired ? COLORS.warning : (isEndingSoon ? COLORS.warning : COLORS.success) }
              ]}>
                {isExpired ? 'EXPIRED' : timeLeft.toUpperCase()}
              </Text>
            </View>
            <Text style={[
              styles.statusLabel,
              { color: isExpired ? COLORS.warning : (isEndingSoon ? COLORS.warning : COLORS.success) }
            ]}>
              {isExpired ? 'ENDED' : (isEndingSoon ? 'Ending Soon' : 'LIVE')}
            </Text>
          </View>
          
          {/* Expiry Progress Bar */}
          <View style={styles.progressBarBg}>
            <View style={[
              styles.progressBarFill, 
              { 
                width: `${progressPercent}%`,
                backgroundColor: isExpired ? COLORS.warning : (isEndingSoon ? COLORS.warning : COLORS.success) 
              }
            ]} />
          </View>
        </View>

        {/* Badges Row */}
        <View style={styles.badgesRow}>
          <View style={styles.badgeItem}>
            {getPlatformIcon(item.platform)}
            <Text style={styles.badgeItemText}>{item.platform.toUpperCase()}</Text>
          </View>
          <View style={styles.badgeItem}>
            <Text style={styles.badgeItemText}>{displayType}</Text>
          </View>
          {item.claimMethod === 'tasks' && (
            <View style={styles.badgeItemTasks}>
              <Text style={styles.badgeItemTasksText}>TASKS</Text>
            </View>
          )}
        </View>

        {/* Bottom row: Claimed count & Claim button */}
        <View style={styles.cardFooter}>
          <Text style={styles.claimedCountText}>
            👥 {item.claimedUsers ? item.claimedUsers.toLocaleString() : '--'} claimed
          </Text>

          <BouncyPressable
            onPress={() => onPress(item)}
            backgroundColor={isExpired ? '#444' : (isClaimed ? COLORS.success : COLORS.primary)}
            borderRadius={20}
            shadowOffsetSize={0}
            style={styles.claimButton}
            contentStyle={styles.claimButtonContent}
          >
            <Text style={[
              styles.claimButtonText,
              { color: isExpired ? '#aaa' : (isClaimed ? '#131313' : '#490080') }
            ]}>
              {isExpired ? 'EXPIRED' : (isClaimed ? 'CLAIMED' : 'CLAIM')}
            </Text>
          </BouncyPressable>
        </View>
      </View>
    </View>
  );
});

export default function FeedScreen({ onDealSelect, claimedDeals = [], onNewAlerts, onConnectionError }: FeedScreenProps) {
  const [posts, setPosts] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  
  // Pagination & Merging states
  const [after, setAfter] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [gpFailed, setGpFailed] = useState(false);

  // Modals Visibility
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);
  const [isSortModalVisible, setIsSortModalVisible] = useState(false);

  // Filters State
  const [search, setSearch] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['All']);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['All']);
  const [selectedClaimMethod, setSelectedClaimMethod] = useState('All');
  const [showExpired, setShowExpired] = useState(false);
  const [selectedClaimStatus, setSelectedClaimStatus] = useState<'All' | 'Claimed' | 'Unclaimed'>('All');

  // Sorting State
  const [sortByField, setSortByField] = useState<'start_date' | 'claims' | 'price' | 'release' | 'end_date'>('start_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const handleImageError = useCallback((id: string) => {
    setImageErrors(prev => ({ ...prev, [id]: true }));
  }, []);

  const getGameCover = useCallback((id: string) => {
    let sum = 0;
    for (let i = 0; i < id.length; i++) {
      sum += id.charCodeAt(i);
    }
    return COVER_IMAGES[sum % COVER_IMAGES.length];
  }, []);

  const startBackgroundSyncQueue = async (deals: Deal[], isRefreshing: boolean) => {
    console.log('[BackgroundSync] Initializing background sync queue...');
    
    // 1. Single gate check
    const isRateLimited = await isRedditRateLimited();
    if (isRateLimited) {
      console.log('[BackgroundSync] Reddit is rate-limited. Skipping background sync queue silently.');
      return;
    }

    try {
      // Step 2 & 3 — Sequential execution
      console.log('[BackgroundSync] Starting Expired feed sync...');
      await expiredFeedService.getExpiredPostIds(isRefreshing);
      
      if (await isRedditRateLimited()) {
        console.log('[BackgroundSync] Reddit became rate-limited after Expired sync. Aborting.');
        return;
      }
      
      console.log('[BackgroundSync] Staggering (waiting 2.5s)...');
      await new Promise(resolve => setTimeout(resolve, 2500));

      console.log('[BackgroundSync] Starting Tasks feed sync...');
      await tasksFeedService.getTasksPostIds(isRefreshing);

      if (await isRedditRateLimited()) {
        console.log('[BackgroundSync] Reddit became rate-limited after Tasks sync. Aborting.');
        return;
      }

      console.log('[BackgroundSync] Staggering (waiting 2.5s)...');
      await new Promise(resolve => setTimeout(resolve, 2500));

      // Build comments prefetch batch
      // Current merged feed (up to 25 Reddit posts, newest-first)
      const redditPosts = deals.filter(d => !d.id.startsWith('gp_')).slice(0, 25);
      
      // Find up to 5 posts that are not yet cached
      const unCachedRedditPosts: Deal[] = [];
      for (const deal of redditPosts) {
        const cached = await getCachedDeal(deal.id);
        if (!cached) {
          unCachedRedditPosts.push(deal);
          if (unCachedRedditPosts.length >= 5) {
            break;
          }
        }
      }

      console.log(`[BackgroundSync] Found ${unCachedRedditPosts.length} uncached Reddit posts to prefetch.`);

      for (let i = 0; i < unCachedRedditPosts.length; i++) {
        const deal = unCachedRedditPosts[i];
        console.log(`[BackgroundSync] Prefetching comments for post ${deal.id} (${i + 1}/${unCachedRedditPosts.length})...`);
        
        await dealEnrichmentService.enrichAndCache(deal);

        if (await isRedditRateLimited()) {
          console.log('[BackgroundSync] Reddit became rate-limited during comments prefetch. Aborting.');
          return;
        }

        // Delay after each comment fetch except the last one
        if (i < unCachedRedditPosts.length - 1) {
          console.log('[BackgroundSync] Staggering (waiting 2.5s)...');
          await new Promise(resolve => setTimeout(resolve, 2500));
        }
      }

      // Step 4 — Cache eviction (comment metadata only)
      console.log('[BackgroundSync] Running cache eviction check...');
      const allKeys = await AsyncStorage.getAllKeys();
      const dealCacheKeys = allKeys.filter(k => k.startsWith('fgf_deal_cache_'));
      const cachedRedditPostIds = dealCacheKeys
        .map(k => k.replace('fgf_deal_cache_', ''))
        .filter(id => !id.startsWith('gp_')); // strictly exclude GamerPower

      // Protect claimed and tracked posts from cache eviction
      const claimed = await getClaimedPosts();
      const tracked = await getTrackedPosts();
      const protectedIds = new Set([
        ...claimed.map(p => p.id),
        ...tracked.map(p => p.id)
      ]);

      const latestRedditIds = new Set(redditPosts.map(d => d.id));
      let evictedCount = 0;

      for (const cachedId of cachedRedditPostIds) {
        if (!latestRedditIds.has(cachedId) && !protectedIds.has(cachedId)) {
          console.log(`[BackgroundSync] Evicting dropped Reddit post ${cachedId} from cache.`);
          await removeCachedDeal(cachedId);
          evictedCount++;
        }
      }
      console.log(`[BackgroundSync] Cache eviction complete. Evicted ${evictedCount} posts.`);
      console.log('[BackgroundSync] Background sync queue completed successfully.');
    } catch (error) {
      console.warn('[BackgroundSync] Error in background sync queue:', error);
    }
  };

  const loadPosts = async (type: 'hot' | 'new' = 'new', isRefreshing = false) => {
    let hasCached = false;
    if (!isRefreshing) {
      try {
        const cachedRaw = await AsyncStorage.getItem('fgf_merged_feed_cache');
        if (cachedRaw) {
          const cachedDeals = JSON.parse(cachedRaw);
          if (Array.isArray(cachedDeals) && cachedDeals.length > 0) {
            setPosts(cachedDeals);
            setLoading(false);
            hasCached = true;
            console.log('[FeedScreen] Loaded merged feed from cache instantly.');
          }
        }
      } catch (err) {
        console.warn('[FeedScreen] Failed to load merged feed cache:', err);
      }
    }

    if (isRefreshing) {
      setRefreshing(true);
      try {
        await clearRedditRateLimit();
      } catch (err) {
        console.warn('[FeedScreen] Failed to clear rate limit on refresh:', err);
      }
    } else if (!hasCached) {
      setLoading(true);
    }
    try {
      // Fetch page 1 (after is undefined) - force network revalidation
      const result = await fetchMergedGameFeed(type, 30, undefined, true);
      setPosts(result.deals);
      setAfter(result.after || null);
      setHasMore(!!result.after);
      setGpFailed(!!result.gpFailed);

      // Cache the fresh deals
      if (result.deals && result.deals.length > 0) {
        await AsyncStorage.setItem('fgf_merged_feed_cache', JSON.stringify(result.deals));
      }

      // Mark all fetched deals as seen (used only to avoid re-logging in future)
      const allFetchedIds = result.deals.map(p => p.id);
      await addSeenPosts(allFetchedIds);

      // Start enrichment (for local cache & Epic Games)
      dealEnrichmentService.reset();
      dealEnrichmentService.enrichDeals(result.deals, (updatedDeal) => {
        setPosts((prevPosts) => {
          const updated = prevPosts.map((p) => {
            if (p.id !== updatedDeal.id) return p;
            return {
              ...p,
              ...updatedDeal,
              // Prefer live in-state values for mutable counters — the
              // enrichment payload comes from DealCache (24h TTL) which
              // may have stale numbers.
              claimedUsers: p.claimedUsers ?? updatedDeal.claimedUsers,
              worth:        p.worth        ?? updatedDeal.worth,
              endDate:      p.endDate      !== undefined ? p.endDate      : updatedDeal.endDate,
              isExpired:    p.isExpired    !== undefined ? p.isExpired    : updatedDeal.isExpired,
            };
          });
          AsyncStorage.setItem('fgf_merged_feed_cache', JSON.stringify(updated)).catch(() => {});
          return updated;
        });
      });

      // If Reddit was fetched live, trigger the staggered background sync queue
      if (result.redditFetchedLive) {
        startBackgroundSyncQueue(result.deals, isRefreshing).catch(err => {
          console.error('[FeedScreen] Background sync queue failed:', err);
        });
      }
    } catch (e) {
      console.error(e);
      if (onConnectionError) {
        onConnectionError();
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadMorePosts = async () => {
    if (loading || loadingMore || !hasMore || !after) {
      return;
    }

    setLoadingMore(true);
    try {
      console.log(`[FeedScreen] Loading more posts with cursor: ${after}`);
      const result = await fetchMergedGameFeed('new', 30, after);
      
      setPosts((prev) => {
        return mergeAndDeduplicateDeals(prev, result.deals);
      });
      
      setAfter(result.after || null);
      setHasMore(!!result.after);

      // Mark all new fetched posts as seen
      const allFetchedIds = result.deals.map(p => p.id);
      await addSeenPosts(allFetchedIds);

      // Enrich new deals in background
      dealEnrichmentService.enrichDeals(result.deals, (updatedDeal) => {
        setPosts((prevPosts) => {
          const updated = prevPosts.map((p) => (p.id === updatedDeal.id ? updatedDeal : p));
          AsyncStorage.setItem('fgf_merged_feed_cache', JSON.stringify(updated)).catch(() => {});
          return updated;
        });
      });
    } catch (error) {
      console.warn('[FeedScreen] Load more error:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadPosts();
    const unsubscribe = dealEnrichmentService.subscribe((updatedDeal) => {
      setPosts((prevPosts) => {
        const updated = prevPosts.map((p) => {
          if (p.id !== updatedDeal.id) return p;
          return {
            ...p,
            ...updatedDeal,
            claimedUsers: p.claimedUsers ?? updatedDeal.claimedUsers,
            worth:        p.worth        ?? updatedDeal.worth,
            endDate:      p.endDate      !== undefined ? p.endDate      : updatedDeal.endDate,
            isExpired:    p.isExpired    !== undefined ? p.isExpired    : updatedDeal.isExpired,
          };
        });
        AsyncStorage.setItem('fgf_merged_feed_cache', JSON.stringify(updated)).catch(() => {});
        return updated;
      });
    });
    return () => unsubscribe();
  }, []);

  // Dynamic countdown updater (refreshes remaining time every minute)
  useEffect(() => {
    const interval = setInterval(() => {
      setPosts((prevPosts) =>
        prevPosts.map((deal) => {
          const expired = isDealExpired(deal);
          return {
            ...deal,
            isExpired: expired,
            timeLeft: getTimeLeft(deal.expiresAt || deal.endDate),
            expiryStatus: expired ? 'EXPIRED' : deal.expiryStatus,
          };
        })
      );
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setAfter(null);
    setHasMore(true);
    setGpFailed(false);
    loadPosts('new', true);
  };

  // Platform selection handler (supports multi-select)
  const handlePlatformSelect = (plat: string) => {
    if (plat === 'All') {
      setSelectedPlatforms(['All']);
    } else {
      let current = [...selectedPlatforms].filter(p => p !== 'All');
      if (current.includes(plat)) {
        current = current.filter(p => p !== plat);
      } else {
        current.push(plat);
      }
      if (current.length === 0) {
        setSelectedPlatforms(['All']);
      } else {
        setSelectedPlatforms(current);
      }
    }
  };

  // Category selection handler (supports multi-select)
  const handleCategorySelect = (cat: string) => {
    if (cat === 'All') {
      setSelectedCategories(['All']);
    } else {
      let current = [...selectedCategories].filter(c => c !== 'All');
      if (current.includes(cat)) {
        current = current.filter(c => c !== cat);
      } else {
        current.push(cat);
      }
      if (current.length === 0) {
        setSelectedCategories(['All']);
      } else {
        setSelectedCategories(current);
      }
    }
  };

  // Helper to calculate active filters count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (!selectedCategories.includes('All')) count += selectedCategories.length;
    if (!selectedPlatforms.includes('All')) count += selectedPlatforms.length;
    if (selectedClaimMethod !== 'All') count++;
    if (showExpired) count++;
    if (selectedClaimStatus !== 'All') count++;
    return count;
  }, [selectedCategories, selectedPlatforms, selectedClaimMethod, showExpired, selectedClaimStatus]);

  // Sort helper function
  const sortDeals = (deals: Deal[], field: string, direction: 'asc' | 'desc'): Deal[] => {
    const sorted = [...deals];
    
    const parsePrice = (p?: string) => {
      if (!p) return null;
      const clean = p.replace(/[^0-9.]/g, '');
      const num = parseFloat(clean);
      return isNaN(num) ? null : num;
    };
    
    const parseDate = (d?: string | null) => {
      if (!d) return null;
      const t = Date.parse(d);
      return isNaN(t) ? null : t;
    };

    sorted.sort((a, b) => {
      // Custom price sort with Reddit games (no worth) sent to the end
      if (field === 'price') {
        const valA = parsePrice(a.worth || a.originalPrice);
        const valB = parsePrice(b.worth || b.originalPrice);
        const hasA = valA !== null;
        const hasB = valB !== null;

        if (!hasA && !hasB) return 0;
        if (!hasA) return 1;  // Put a (no worth) at the end
        if (!hasB) return -1; // Put b (no worth) at the end

        return direction === 'desc' ? valB! - valA! : valA! - valB!;
      }

      // Custom expiry sort with no expiry date sent to the end
      if (field === 'end_date') {
        const valA = parseDate(a.expiresAt || a.endDate);
        const valB = parseDate(b.expiresAt || b.endDate);
        const hasA = valA !== null;
        const hasB = valB !== null;

        if (!hasA && !hasB) return 0;
        if (!hasA) return 1;  // Put a (no expiry) at the end
        if (!hasB) return -1; // Put b (no expiry) at the end

        return direction === 'desc' ? valB! - valA! : valA! - valB!;
      }

      let valA = 0;
      let valB = 0;

      switch (field) {
        case 'claims':
          valA = a.claimedUsers || 0;
          valB = b.claimedUsers || 0;
          break;
        case 'release':
          valA = parseDate(a.releaseDate) || 0;
          valB = parseDate(b.releaseDate) || 0;
          break;
        case 'start_date':
        default:
          valA = a.createdAt || 0;
          valB = b.createdAt || 0;
          break;
      }

      if (valA !== valB) {
        return direction === 'desc' ? valB - valA : valA - valB;
      }

      // Priority sort fallback: GamerPower first
      if (a.source === 'gamerpower' && b.source !== 'gamerpower') return -1;
      if (b.source === 'gamerpower' && a.source !== 'gamerpower') return 1;
      return 0;
    });

    return sorted;
  };

  const getSortLabel = (field: string) => {
    switch (field) {
      case 'claims': return 'Claims';
      case 'price': return 'Value';
      case 'release': return 'Released';
      case 'end_date': return 'Expiry';
      case 'start_date':
      default:
        return 'Newest';
    }
  };

  // Efficient memoized filtered and sorted posts calculation
  const filteredAndSortedPosts = useMemo(() => {
    const baseFiltered = filterDeals(posts, {
      category: 'All', // Handle categories manually below for multi-select
      platform: 'All', // Handle platforms filter manually below for multi-select
      claimMethod: selectedClaimMethod,
      showExpired,
      search,
    });

    const matchesCats = selectedCategories.includes('All')
      ? baseFiltered
      : baseFiltered.filter((deal) => {
          return selectedCategories.some((selCat) => {
            if (selCat === 'Game') return deal.type === 'full_game';
            if (selCat === 'DLC') return deal.type === 'dlc' || deal.type === 'item' || deal.type === 'loot';
            if (selCat === 'Beta') return deal.type === 'beta';
            if (selCat === 'Mobile Game') return deal.type === 'mobile_game';
            return false;
          });
        });

    const matchesPlats = selectedPlatforms.includes('All')
      ? matchesCats
      : matchesCats.filter((deal) => {
          const dealPlats = [
            deal.platform.toLowerCase()
          ];

          return selectedPlatforms.some((selPlat) => {
            const filterPlat = selPlat.toLowerCase();
            if (filterPlat === 'mobile') {
              return dealPlats.some((p) =>
                ['mobile', 'android', 'ios', 'google play', 'app store'].some((kw) => p.includes(kw))
              );
            }
            if (filterPlat === 'itch.io') {
              return dealPlats.some((p) => p.includes('itch') && !p.includes('switch'));
            }
            return dealPlats.some((p) => p.includes(filterPlat));
          });
        });

    // Claimed Filter (3-way)
    const matchesClaimed = matchesPlats.filter((deal) => {
      const isClaimed = isDealClaimed(deal, claimedDeals || []);
      if (selectedClaimStatus === 'Claimed') return isClaimed;
      if (selectedClaimStatus === 'Unclaimed') return !isClaimed;
      return true;
    });

    // ALWAYS deduplicate AFTER filtering, BEFORE sorting
    const deduplicatedMatches = mergeAndDeduplicateDeals([], matchesClaimed);
    // Extra safety: run it again if needed
    const finalDeduplicated = mergeAndDeduplicateDeals([], deduplicatedMatches);

    return sortDeals(finalDeduplicated, sortByField, sortDirection);
  }, [posts, selectedCategories, selectedPlatforms, selectedClaimMethod, showExpired, search, sortByField, sortDirection, selectedClaimStatus, claimedDeals]);

  const featuredPosts = useMemo(() => {
    return filteredAndSortedPosts.filter((post) => !post.isExpired && post.expiryStatus !== 'EXPIRED').slice(0, 3);
  }, [filteredAndSortedPosts]);

  const featuredIds = useMemo(() => {
    return new Set(featuredPosts.map((post) => post.id));
  }, [featuredPosts]);

  const remainingPosts = useMemo(() => {
    return filteredAndSortedPosts.filter((post) => !featuredIds.has(post.id));
  }, [filteredAndSortedPosts, featuredIds]);

  const renderFeaturedSection = () => {
    if (featuredPosts.length === 0) return null;
    const activeCount = posts.filter(p => !p.isExpired && p.expiryStatus !== 'EXPIRED').length;
    return (
      <View style={styles.featuredSection}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Featured Loot</Text>
          <View style={styles.liveStatBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveStatText}>
              <Text style={styles.liveStatCount}>{activeCount}</Text>
              {' active giveaways'}
            </Text>
          </View>
        </View>

        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={styles.featuredCarousel}
          snapToInterval={316} // 300 (card width) + 16 (gap)
          decelerationRate="fast"
          snapToAlignment="start"
          nestedScrollEnabled={true}
        >
          {featuredPosts.map((post) => {
            const isClaimed = isDealClaimed(post, claimedDeals || []);
            const isExpired = post.isExpired || post.expiryStatus === 'EXPIRED';
            const timeLeft = post.timeLeft || '12:00:00';
            return (
              <Pressable 
                key={'feat_' + post.id} 
                onPress={() => onDealSelect(post)}
                style={styles.featuredCard}
              >
                <Image 
                  source={{ uri: (!imageErrors[post.id] && post.image && post.image !== 'placeholder') ? post.image : getGameCover(post.id) }} 
                  style={styles.featuredImage} 
                  blurRadius={post.isNsfw ? 15 : 0}
                  onError={() => handleImageError(post.id)}
                />
                <View style={styles.featuredImageOverlay} />

                {post.isNsfw && (
                  <View style={styles.nsfwFeaturedOverlay}>
                    <View style={styles.nsfwBadge}>
                      <Text style={styles.nsfwBadgeText}>NSFW</Text>
                    </View>
                  </View>
                )}

                {/* Timer Pill */}
                <View style={styles.featuredTimerPill}>
                  <Text style={styles.featuredTimerIconText}>🕒</Text>
                  <Text style={styles.featuredTimerText}>{timeLeft}</Text>
                </View>

                {/* Content Overlay */}
                <View style={styles.featuredContent}>
                  <View style={styles.featuredBadgesRow}>
                    <View style={styles.featuredPlatformBadge}>
                      {getPlatformIcon(post.platform)}
                      <Text style={styles.featuredPlatformBadgeText}>{post.platform.toUpperCase()}</Text>
                    </View>
                    <View style={styles.featuredLiveBadge}>
                      <Text style={styles.featuredLiveBadgeText}>LIVE</Text>
                    </View>
                  </View>

                  <Text numberOfLines={1} style={styles.featuredTitleText}>
                    {post.title}
                  </Text>

                  <View style={styles.featuredClaimButton}>
                    <Text style={styles.featuredClaimButtonText}>
                      {isExpired ? 'EXPIRED' : (isClaimed ? 'CLAIMED' : 'Claim Key')}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const renderFooter = () => {
    if (loadingMore) {
      return (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.footerLoaderText}>LOADIN' MORE LOOT...</Text>
        </View>
      );
    }
    if (!hasMore && remainingPosts.length > 0) {
      return (
        <View style={styles.footerEnd}>
          <Text style={styles.footerEndText}>- NO MORE LOOT DETECTED -</Text>
        </View>
      );
    }
    return null;
  };

  const renderItem = useCallback(({ item }: { item: Deal }) => {
    const isClaimed = isDealClaimed(item, claimedDeals || []);
    return (
      <DealCard
        item={item}
        isClaimed={isClaimed}
        onPress={onDealSelect}
        getGameCover={getGameCover}
        hasImageError={!!imageErrors[item.id]}
        handleImageError={handleImageError}
      />
    );
  }, [claimedDeals, onDealSelect, getGameCover, imageErrors, handleImageError]);

  return (
    <View style={styles.container}>
      {/* GamerPower Warning Banner */}
      {gpFailed && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningBannerText}>
            ⚠️ GamerPower offline. Showing Reddit backup listings.
          </Text>
        </View>
      )}

      {/* Search Bar Block */}
      <View style={styles.searchSection}>
        <View style={styles.searchContainer}>
          <Search size={18} color="#858585" style={styles.searchIcon} />
          <TextInput
            placeholder="Find loot, games, DLC..."
            placeholderTextColor="#858585"
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <Pressable
          onPress={handleRefresh}
          style={styles.refreshBtnStitch}
        >
          <RotateCcw size={18} color={COLORS.primary} />
        </Pressable>
      </View>

      {/* Controls row (Filters & Sort horizontal scroll) */}
      <View style={styles.quickFiltersWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickFiltersContainer}>
          <Pressable
            onPress={() => setIsFilterModalVisible(true)}
            style={styles.filterActionButton}
          >
            <SlidersHorizontal size={16} color={COLORS.secondary} />
            <Text style={styles.filterActionButtonText}>Filter</Text>
            {activeFiltersCount > 0 && (
              <View style={styles.badgeSmall}>
                <Text style={styles.badgeSmallText}>{activeFiltersCount}</Text>
              </View>
            )}
          </Pressable>

          <Pressable
            onPress={() => setIsSortModalVisible(true)}
            style={styles.sortActionButton}
          >
            <ArrowUpDown size={16} color={COLORS.textMuted} />
            <Text style={styles.sortActionButtonText}>Sort</Text>
          </Pressable>

          {/* Quick PC filter */}
          <Pressable
            onPress={() => {
              if (selectedPlatforms.includes('Steam')) {
                setSelectedPlatforms(['All']);
              } else {
                setSelectedPlatforms(['Steam']);
              }
            }}
            style={[
              styles.quickFilterChip,
              selectedPlatforms.includes('Steam') && styles.quickFilterChipActive
            ]}
          >
            <Text style={[
              styles.quickFilterChipText,
              selectedPlatforms.includes('Steam') && styles.quickFilterChipTextActive
            ]}>PC</Text>
          </Pressable>

          {/* Quick Console filter */}
          <Pressable
            onPress={() => {
              if (selectedPlatforms.includes('Playstation') || selectedPlatforms.includes('Xbox')) {
                setSelectedPlatforms(['All']);
              } else {
                setSelectedPlatforms(['Playstation', 'Xbox']);
              }
            }}
            style={[
              styles.quickFilterChip,
              (selectedPlatforms.includes('Playstation') || selectedPlatforms.includes('Xbox')) && styles.quickFilterChipActive
            ]}
          >
            <Text style={[
              styles.quickFilterChipText,
              (selectedPlatforms.includes('Playstation') || selectedPlatforms.includes('Xbox')) && styles.quickFilterChipTextActive
            ]}>Console</Text>
          </Pressable>
        </ScrollView>
      </View>

      {/* Filters Modal Dialog */}
      <Modal
        visible={isFilterModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsFilterModalVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setIsFilterModalVisible(false)}>
          <View style={styles.modalWrapper} onStartShouldSetResponder={() => true}>
            <View style={styles.modalContentCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>FILTER DROPS</Text>
                <Pressable onPress={() => setIsFilterModalVisible(false)}>
                  <X size={22} color={COLORS.text} />
                </Pressable>
              </View>

              <ScrollView
                contentContainerStyle={styles.modalScrollBody}
                style={styles.modalScrollView}
                showsVerticalScrollIndicator={false}
              >
                {/* Categories */}
                <View style={styles.filterCard}>
                  <View style={styles.filterCardHeader}>
                    <Text style={styles.filterCardTitle}>CATEGORY TYPE</Text>
                    <Text style={styles.filterCardHint}>multi-select</Text>
                  </View>
                  {CATEGORIES_FILTER.map((cat, idx) => {
                    const isSelected = selectedCategories.includes(cat);
                    const isLast = idx === CATEGORIES_FILTER.length - 1;
                    return (
                      <Pressable
                        key={cat}
                        onPress={() => handleCategorySelect(cat)}
                        style={[styles.filterRow, !isLast && styles.filterRowBorder]}
                      >
                        <View style={[styles.filterCheckbox, isSelected && styles.filterCheckboxActive]}>
                          {isSelected && <Check size={10} color={COLORS.bg} />}
                        </View>
                        <Text style={[styles.filterRowLabel, isSelected && styles.filterRowLabelActive]}>{cat}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Platforms */}
                <View style={styles.filterCard}>
                  <View style={styles.filterCardHeader}>
                    <Text style={styles.filterCardTitle}>PLATFORMS</Text>
                    <Text style={styles.filterCardHint}>multi-select</Text>
                  </View>
                  {PLATFORMS_FILTER.map((plat, idx) => {
                    const isSelected = selectedPlatforms.includes(plat);
                    const isLast = idx === PLATFORMS_FILTER.length - 1;
                    return (
                      <Pressable
                        key={plat}
                        onPress={() => handlePlatformSelect(plat)}
                        style={[styles.filterRow, !isLast && styles.filterRowBorder]}
                      >
                        <View style={[styles.filterCheckbox, isSelected && styles.filterCheckboxActive]}>
                          {isSelected && <Check size={10} color={COLORS.bg} />}
                        </View>
                        {plat !== 'All' && (
                          <View style={[styles.filterPlatformIconBg, { backgroundColor: getPlatformColor(plat) }]}>
                            <StoreIcon platform={plat} size={11} color="#fff" />
                          </View>
                        )}
                        <Text style={[styles.filterRowLabel, isSelected && styles.filterRowLabelActive]}>{plat}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Claim Difficulty */}
                <View style={styles.filterCard}>
                  <View style={styles.filterCardHeader}>
                    <Text style={styles.filterCardTitle}>CLAIM DIFFICULTY</Text>
                    <Text style={styles.filterCardHint}>single</Text>
                  </View>
                  {CLAIM_METHODS_FILTER.map((method, idx) => {
                    const isSelected = selectedClaimMethod === method;
                    const isLast = idx === CLAIM_METHODS_FILTER.length - 1;
                    return (
                      <Pressable
                        key={method}
                        onPress={() => setSelectedClaimMethod(method)}
                        style={[styles.filterRow, !isLast && styles.filterRowBorder]}
                      >
                        <View style={[styles.filterRadioOuter, isSelected && styles.filterRadioOuterActive]}>
                          {isSelected && <View style={styles.filterRadioInner} />}
                        </View>
                        <Text style={[styles.filterRowLabel, isSelected && styles.filterRowLabelActive]}>{method}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Claim Status */}
                <View style={styles.filterCard}>
                  <View style={styles.filterCardHeader}>
                    <Text style={styles.filterCardTitle}>CLAIM STATUS</Text>
                    <Text style={styles.filterCardHint}>single</Text>
                  </View>
                  {(['All', 'Claimed', 'Unclaimed'] as const).map((status, idx) => {
                    const isSelected = selectedClaimStatus === status;
                    const isLast = idx === 2;
                    return (
                      <Pressable
                        key={status}
                        onPress={() => setSelectedClaimStatus(status)}
                        style={[styles.filterRow, !isLast && styles.filterRowBorder]}
                      >
                        <View style={[styles.filterRadioOuter, isSelected && styles.filterRadioOuterActive]}>
                          {isSelected && <View style={styles.filterRadioInner} />}
                        </View>
                        <Text style={[styles.filterRowLabel, isSelected && styles.filterRowLabelActive]}>{status}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Expired toggle */}
                <View style={styles.filterCard}>
                  <Pressable
                    style={styles.filterRow}
                    onPress={() => setShowExpired(prev => !prev)}
                  >
                    <View style={[styles.filterCheckbox, showExpired && { backgroundColor: '#ef4444', borderColor: '#ef4444' }]}>
                      {showExpired && <Check size={10} color={COLORS.bg} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.filterRowLabel, showExpired && styles.filterRowLabelActive]}>Show Expired Loot</Text>
                      <Text style={styles.filterRowSub}>Include deals that have already ended</Text>
                    </View>
                  </Pressable>
                </View>
              </ScrollView>

              <View style={styles.modalActionsRow}>
                <BouncyPressable
                  onPress={() => {
                    setSelectedCategories(['All']);
                    setSelectedPlatforms(['All']);
                    setSelectedClaimMethod('All');
                    setShowExpired(false);
                    setSelectedClaimStatus('All');
                  }}
                  backgroundColor={COLORS.bg}
                  borderRadius={20}
                  borderWidth={1}
                  borderColor="#334155"
                  shadowOffsetSize={0}
                  style={styles.modalActionBtnHalf}
                  contentStyle={[styles.modalActionBtnContent, { borderWidth: 1, borderColor: '#334155' }]}
                >
                  <Text style={[styles.modalActionBtnText, { color: '#ffffff' }]}>RESET ALL</Text>
                </BouncyPressable>

                <BouncyPressable
                  onPress={() => setIsFilterModalVisible(false)}
                  backgroundColor={COLORS.primary}
                  borderRadius={20}
                  borderWidth={1}
                  borderColor="#334155"
                  shadowOffsetSize={0}
                  style={styles.modalActionBtnHalf}
                  contentStyle={styles.modalActionBtnContent}
                >
                  <Text style={styles.modalActionBtnText}>APPLY</Text>
                </BouncyPressable>
              </View>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Sort Modal Dialog */}
      <Modal
        visible={isSortModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsSortModalVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setIsSortModalVisible(false)}>
          <View style={styles.modalWrapper} onStartShouldSetResponder={() => true}>
            <View style={styles.modalContentCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>SORT DROPS</Text>
                <Pressable onPress={() => setIsSortModalVisible(false)}>
                  <X size={22} color={COLORS.text} />
                </Pressable>
              </View>

              <ScrollView contentContainerStyle={styles.modalScrollBody}>
                {/* Sort Fields */}
                <Text style={styles.modalSectionLabel}>SORT FIELD</Text>
                <View style={styles.sortOptionsList}>
                  {[
                    { id: 'start_date', label: 'Giveaway Start Date' },
                    { id: 'claims', label: 'Claim Count' },
                    { id: 'price', label: 'Original Price / Value' },
                    { id: 'release', label: 'Release Date' },
                    { id: 'end_date', label: 'End Date / Expiry' },
                  ].map((field) => {
                    const isSelected = sortByField === field.id;
                    return (
                      <Pressable
                        key={field.id}
                        onPress={() => setSortByField(field.id as any)}
                        style={[styles.sortOptionItem, isSelected && styles.sortOptionItemSelected]}
                      >
                        <Text style={[styles.sortOptionText, isSelected && styles.sortOptionTextSelected]}>
                          {field.label}
                        </Text>
                        {isSelected && <Check size={18} color={COLORS.primary} />}
                      </Pressable>
                    );
                  })}
                </View>

                {/* Sort Order direction */}
                <Text style={styles.modalSectionLabel}>SORT ORDER</Text>
                <View style={styles.chipsGrid}>
                  {[
                    { id: 'desc', label: 'Higher to Lower' },
                    { id: 'asc', label: 'Lower to Higher' },
                  ].map((dir) => {
                    const isSelected = sortDirection === dir.id;
                    return (
                      <Pressable
                        key={dir.id}
                        onPress={() => setSortDirection(dir.id as any)}
                        style={[styles.chipItem, isSelected && styles.chipItemSelected]}
                      >
                        <Text style={[styles.chipItemText, isSelected && styles.chipItemTextSelected]}>
                          {dir.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>

              <View style={styles.modalActionsRow}>
                <BouncyPressable
                  onPress={() => setIsSortModalVisible(false)}
                  backgroundColor={COLORS.primary}
                  borderRadius={20}
                  borderWidth={1}
                  borderColor="#334155"
                  shadowOffsetSize={0}
                  style={styles.modalActionBtnFull}
                  contentStyle={styles.modalActionBtnContent}
                >
                  <Text style={styles.modalActionBtnText}>APPLY SORT</Text>
                </BouncyPressable>
              </View>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Fresh Listings */}
      {loading ? (
        <View style={styles.center}>
          <HourglassLoader />
        </View>
      ) : filteredAndSortedPosts.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.noResultsTitle}>No Freebies Found!</Text>
          <Text style={styles.noResultsSub}>Try changing your filters or searching something else.</Text>
        </View>
      ) : (
        <FlatList
          data={remainingPosts}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={() => (
            <View>
              {renderFeaturedSection()}
              {remainingPosts.length > 0 && (
                <View style={styles.freshFindingsHeader}>
                  <Text style={styles.freshFindingsTitle}>Active Quests</Text>
                  <Pressable>
                    <Text style={styles.viewAllText}>View All</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          onEndReached={loadMorePosts}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
          maxToRenderPerBatch={10}
          windowSize={5}
          initialNumToRender={8}
          removeClippedSubviews={Platform.OS === 'android'}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[COLORS.primary]}
              tintColor={COLORS.primary}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  warningBanner: {
    backgroundColor: '#ffd600',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningBannerText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: '#0b101e',
    textAlign: 'center',
  },
  searchSection: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 12,
    alignItems: 'center',
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 48,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: COLORS.text,
  },
  refreshBtnStitch: {
    width: 48,
    height: 48,
    backgroundColor: COLORS.surfaceCharcoal,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickFiltersWrapper: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginBottom: 8,
  },
  quickFiltersContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingRight: 20,
  },
  filterActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 2,
    borderColor: COLORS.secondary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  filterActionButtonText: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.text,
  },
  badgeSmall: {
    backgroundColor: COLORS.secondary,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeSmallText: {
    fontFamily: FONTS.bold,
    fontSize: 10,
    color: COLORS.bg,
  },
  sortActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surfaceCharcoal,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sortActionButtonText: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.textMuted,
  },
  quickFilterChip: {
    backgroundColor: COLORS.surfaceCharcoal,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  quickFilterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  quickFilterChipText: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.textMuted,
  },
  quickFilterChipTextActive: {
    color: COLORS.bg,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(19, 19, 19, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalWrapper: {
    width: '100%',
    maxWidth: 340,
    maxHeight: '80%',
  },
  modalContentCard: {
    backgroundColor: COLORS.surfaceCharcoal,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    padding: 16,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    paddingBottom: 12,
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: FONTS.extraBold,
    fontSize: 20,
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  modalScrollBody: {
    gap: 10,
    paddingBottom: 4,
  },
  modalScrollView: {
    maxHeight: 380,
  },
  modalSectionLabel: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  chipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  chipItem: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipItemSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipItemText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.text,
  },
  chipItemTextSelected: {
    color: COLORS.bg,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  expiredToggleContent: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
  },
  expiredToggleText: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: COLORS.textMuted,
  },
  expiredToggleTextActive: {
    color: COLORS.bg,
  },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 20,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    paddingTop: 16,
  },
  modalActionBtnHalf: {
    flex: 1,
    height: 44,
  },
  modalActionBtnFull: {
    width: '100%',
    height: 44,
  },
  modalActionBtnContent: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalActionBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.bg,
    letterSpacing: 0.5,
  },
  sortOptionsList: {
    gap: 8,
    marginBottom: 8,
  },
  sortOptionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.bg,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  sortOptionItemSelected: {
    borderColor: COLORS.primary,
  },
  sortOptionText: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.text,
  },
  sortOptionTextSelected: {
    color: COLORS.primary,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: COLORS.text,
    marginTop: 12,
  },
  noResultsTitle: {
    fontFamily: FONTS.bold,
    fontSize: 20,
    color: COLORS.text,
    marginBottom: 8,
  },
  noResultsSub: {
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: COLORS.text,
    textAlign: 'center',
    opacity: 0.7,
  },
  listContent: {
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  featuredSection: {
    marginVertical: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: FONTS.bold,
    fontSize: 20,
    color: COLORS.text,
  },
  sectionSubtitle: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  // Live stat badge next to Featured Loot title
  liveStatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(221,183,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(221,183,255,0.2)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.success,
  },
  liveStatText: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: COLORS.textMuted,
  },
  liveStatCount: {
    fontFamily: FONTS.extraBold,
    fontSize: 13,
    color: COLORS.primary,
  },
  sectionTitleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'space-between',
  },
  // Filter modal card/row styles
  filterCard: {
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    marginBottom: 0,
  },
  filterCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  filterCardTitle: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: COLORS.textMuted,
    letterSpacing: 0.8,
  },
  filterCardHint: {
    fontFamily: FONTS.medium,
    fontSize: 10,
    color: 'rgba(255,255,255,0.25)',
    letterSpacing: 0.5,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 9,
  },
  filterRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  filterRowLabel: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: COLORS.textMuted,
  },
  filterRowLabelActive: {
    color: COLORS.text,
    fontFamily: FONTS.bold,
  },
  filterRowSub: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1,
    opacity: 0.7,
  },
  filterCheckbox: {
    width: 17,
    height: 17,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.textMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterCheckboxActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterRadioOuter: {
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: COLORS.textMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterRadioOuterActive: {
    borderColor: COLORS.primary,
  },
  filterRadioInner: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  filterPlatformIconBg: {
    width: 22,
    height: 22,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featuredCarousel: {
    gap: 16,
    paddingBottom: 8,
  },
  featuredCard: {
    width: 300,
    backgroundColor: COLORS.surfaceCharcoal,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    overflow: 'hidden',
    height: 285,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 30,
    elevation: 8,
  },
  featuredImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    resizeMode: 'cover',
  },
  featuredImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(19, 19, 19, 0.65)',
  },
  featuredTimerPill: {
    position: 'absolute',
    top: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  featuredTimerIconText: {
    fontSize: 14,
    color: COLORS.warning,
  },
  featuredTimerText: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: '#ffffff',
  },
  featuredContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    gap: 8,
  },
  featuredBadgesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  featuredPlatformBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceCharcoal,
    borderWidth: 1,
    borderColor: 'rgba(93, 230, 255, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  featuredPlatformBadgeText: {
    fontFamily: FONTS.bold,
    fontSize: 10,
    color: COLORS.secondary,
  },
  featuredLiveBadge: {
    backgroundColor: COLORS.surfaceCharcoal,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  featuredLiveBadgeText: {
    fontFamily: FONTS.bold,
    fontSize: 10,
    color: COLORS.text,
  },
  featuredTitleText: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    color: '#ffffff',
  },
  featuredClaimButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 4,
    marginTop: 8,
  },
  featuredClaimButtonText: {
    fontFamily: FONTS.extraBold,
    fontSize: 16,
    color: COLORS.bg,
  },
  freshFindingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 24,
    marginBottom: 16,
  },
  freshFindingsTitle: {
    fontFamily: FONTS.bold,
    fontSize: 20,
    color: COLORS.text,
  },
  viewAllText: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.secondary,
  },
  questCard: {
    backgroundColor: COLORS.surfaceCharcoal,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 4,
  },
  cardImageContainer: {
    height: 160,
    width: '100%',
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  cardImageGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(19, 19, 19, 0.55)',
  },
  cardContent: {
    padding: 16,
    paddingTop: 8,
    marginTop: -40,
    backgroundColor: 'transparent',
  },
  questTitle: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    color: '#ffffff',
    lineHeight: 28,
    marginBottom: 12,
  },
  expiredTitle: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  statusBlock: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  timerWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timerIconText: {
    fontSize: 16,
  },
  timerText: {
    fontFamily: FONTS.mono,
    fontSize: 14,
    fontWeight: 'bold',
  },
  statusLabel: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  badgeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeItemText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.textMuted,
  },
  badgeItemTasks: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: 'rgba(255, 36, 73, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeItemTasksText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.warning,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  claimedCountText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.textMuted,
  },
  claimButton: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  claimButtonContent: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  claimButtonText: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    letterSpacing: 0.5,
  },
  expiredItemCard: {
    backgroundColor: 'rgba(255, 36, 73, 0.05)',
    borderColor: 'rgba(255, 36, 73, 0.2)',
  },
  nsfwThumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(19, 19, 19, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  nsfwThumbText: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.warning,
    letterSpacing: 1,
  },
  nsfwFeaturedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  nsfwBadge: {
    borderWidth: 1.5,
    borderColor: COLORS.warning,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 36, 73, 0.15)',
  },
  nsfwBadgeText: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.warning,
    letterSpacing: 1,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  footerLoaderText: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: COLORS.primary,
  },
  footerEnd: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerEndText: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: COLORS.textMuted,
  },
});
