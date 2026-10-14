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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Deal } from '../models/Deal';
import { dealsStore, FeedFilters } from '../services/dealsStore';
import { isDealClaimed, clearSessionFailedUrls } from '../utils/dealUtils';
import { COLORS, FONTS, RADIUS } from '../theme/theme';
import { BannerCard } from '../components/UnifiedCards';
import StoreIcon from '../components/StoreIcon';
import { FeedSkeleton, useSkeletonDisplay } from '../components/LootSkeleton';
import AnimatedSyncHairline from '../components/AnimatedSyncHairline';
import { Ionicons } from '@expo/vector-icons';

interface FeedScreenProps {
  onDealSelect: (deal: Deal) => void;
  claimedDeals?: Deal[];
  initialCategory?: string;
  onNewAlerts?: (count: number) => void;
  onConnectionError?: () => void;
}

const STORE_CHIPS = [
  { id: 'all', label: 'All stores' },
  { id: 'steam', label: 'Steam' },
  { id: 'epic', label: 'Epic' },
  { id: 'gog', label: 'GOG' },
  { id: 'itch', label: 'itch.io' },
  { id: 'playstation', label: 'PlayStation' },
  { id: 'xbox', label: 'Xbox' },
  { id: 'mobile', label: 'Mobile' },
];

const TYPE_TABS = [
  { id: 'all', label: 'All' },
  { id: 'game', label: 'Game' },
  { id: 'dlc', label: 'DLC' },
  { id: 'beta', label: 'Beta' },
  { id: '18plus', label: '18+ / Mature' },
];

const CLAIM_METHOD_TABS = [
  { id: 'any', label: 'Any' },
  { id: 'one_click', label: 'One-click' },
  { id: 'tasks', label: 'Tasks required' },
];

const SORTS = [
  { id: 'new', label: 'Newest' },
  { id: 'end', label: 'Ending soon' },
  { id: 'val', label: 'Highest value' },
  { id: 'claims', label: 'Most claimed' },
];

const FEED_FILTERS_KEY_V5 = 'lootquest_feed_filters_v5';
const FEED_FILTERS_KEY_V4 = 'lootquest_feed_filters_v4';

export default function FeedScreen({
  onDealSelect,
  claimedDeals = [],
  initialCategory,
  onConnectionError,
}: FeedScreenProps) {
  const [, setStoreVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'synced_just_now'>('idle');
  const [search, setSearch] = useState(''); // Do NOT persist search text (Item 3 & 13)

  // Multi-select state (Item 3)
  const [selectedStores, setSelectedStores] = useState<string[]>(['all']);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['all']);
  const [selectedClaimMethods, setSelectedClaimMethods] = useState<string[]>(['any']);
  const [sortIndex, setSortIndex] = useState<number>(0);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  // Sync spin animation
  const syncSpinAnim = useRef(new Animated.Value(0)).current;

  // Subscribe to central dealsStore (Item 1)
  useEffect(() => {
    dealsStore.init().then(() => {
      setLoading(false);
    });

    const unsubscribe = dealsStore.subscribe(() => {
      setStoreVersion((v) => v + 1);
      setLoading(false);
      setSyncState(dealsStore.getSyncState());
    });

    return () => unsubscribe();
  }, []);

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

  const handleImageError = useCallback((id: string) => {
    setImageErrors((prev) => ({ ...prev, [id]: true }));
  }, []);

  // Restore persisted filters & auto-migrate from single-value v4 shape (Item 3)
  useEffect(() => {
    (async () => {
      try {
        const v5Raw = await AsyncStorage.getItem(FEED_FILTERS_KEY_V5);
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
        const v4Raw = await AsyncStorage.getItem(FEED_FILTERS_KEY_V4);
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

          // Save migrated shape
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

  // Handle external initialCategory update (e.g. from Home's "To claim" stat tile)
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

  // Persist selected multi-select filters (do NOT persist search text) (Item 3)
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

  // Sync / refresh deals feed through Central Store
  const handleSync = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) {
        try {
          Vibration.vibrate(10);
        } catch (_) {}
        clearSessionFailedUrls();
        setRefreshing(true);
        setSyncState('syncing');
      }

      try {
        await dealsStore.sync(isManualRefresh);
      } catch (e) {
        console.error('[FeedScreen] Sync failed:', e);
        if (onConnectionError) onConnectionError();
      } finally {
        setLoading(false);
        setRefreshing(false);
        if (isManualRefresh) {
          setSyncState('synced_just_now');
          try {
            Vibration.vibrate(15);
          } catch (_) {}
          setTimeout(() => {
            setSyncState('idle');
          }, 2200);
        }
      }
    },
    [onConnectionError]
  );

  const cycleSort = () => {
    setSortIndex((prev) => (prev + 1) % SORTS.length);
  };

  const currentSort = SORTS[sortIndex];

  // Multi-select toggle handlers:
  // Inside group = OR. Tapping 'all'/'any' resets group. Tapping option toggles it.
  const toggleStore = (storeId: string) => {
    if (storeId === 'all') {
      setSelectedStores(['all']);
      return;
    }
    setSelectedStores((prev) => {
      const withoutAll = prev.filter((s) => s !== 'all');
      if (withoutAll.includes(storeId)) {
        const remaining = withoutAll.filter((s) => s !== storeId);
        return remaining.length === 0 ? ['all'] : remaining;
      } else {
        return [...withoutAll, storeId];
      }
    });
  };

  const toggleType = (typeId: string) => {
    if (typeId === 'all') {
      setSelectedTypes(['all']);
      return;
    }
    setSelectedTypes((prev) => {
      const withoutAll = prev.filter((t) => t !== 'all');
      if (withoutAll.includes(typeId)) {
        const remaining = withoutAll.filter((t) => t !== typeId);
        return remaining.length === 0 ? ['all'] : remaining;
      } else {
        return [...withoutAll, typeId];
      }
    });
  };

  const toggleClaimMethod = (methodId: string) => {
    if (methodId === 'any') {
      setSelectedClaimMethods(['any']);
      return;
    }
    setSelectedClaimMethods((prev) => {
      const withoutAny = prev.filter((m) => m !== 'any');
      if (withoutAny.includes(methodId)) {
        const remaining = withoutAny.filter((m) => m !== methodId);
        return remaining.length === 0 ? ['any'] : remaining;
      } else {
        return [...withoutAny, methodId];
      }
    });
  };

  // Active filter count calculation (Item 3)
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
    return count;
  }, [selectedStores, selectedTypes, selectedClaimMethods, sortIndex]);

  // One-tap clear filters (Item 3)
  const handleClearFilters = () => {
    setSelectedStores(['all']);
    setSelectedTypes(['all']);
    setSelectedClaimMethods(['any']);
    setSortIndex(0);
  };

  // Central Feed Filters & Selectors (Items 1, 2, 3)
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

  // Skeleton Loader with 400ms min display (Item 4)
  // Stay on skeleton until the first store sync completes (not just until
  // cached deals hydrate), so the page never flashes half-loaded content.
  const { showSkeleton, contentFadeAnim } = useSkeletonDisplay(
    (loading && activeDeals.length === 0) || (syncState === 'syncing' && !dealsStore.hasCompletedSync()),
    400
  );

  if (showSkeleton) {
    return <FeedSkeleton />;
  }

  const renderHeader = () => (
    <View style={styles.header}>
      {/* Top Title & Sync status */}
      <View style={styles.topRow}>
        <Text style={styles.heading}>The Radar.</Text>
        <Pressable
          onPress={() => handleSync(true)}
          hitSlop={12}
          disabled={syncState === 'syncing' || refreshing}
          style={({ pressed }) => [
            styles.syncPill,
            (syncState === 'syncing' || refreshing) && styles.syncPillSyncing,
            syncState === 'synced_just_now' && styles.syncPillSynced,
            pressed && styles.syncPillPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Sync active feed"
        >
          {syncState === 'syncing' || refreshing ? (
            <View style={styles.syncingRow}>
              <Animated.View style={{ transform: [{ rotate: syncSpinInterpolate }] }}>
                <Ionicons name="sync" size={12} color={COLORS.accent} />
              </Animated.View>
              <Text style={styles.syncingText}>Syncing...</Text>
            </View>
          ) : syncState === 'synced_just_now' ? (
            <View style={styles.syncingRow}>
              <Ionicons name="checkmark-circle" size={12} color={COLORS.accent} />
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
      <Text style={styles.subheading}>New free games, as they go live.</Text>

      {/* Search Input (.srch) */}
      <View style={styles.srchWrapper}>
        <TextInput
          style={styles.srch}
          placeholder="Search games, DLC, stores..."
          placeholderTextColor={COLORS.textMuted}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable
            onPress={() => setSearch('')}
            hitSlop={12}
            style={styles.srchClearBtn}
            accessibilityLabel="Clear search"
          >
            <Text style={styles.srchClearText}>✕</Text>
          </Pressable>
        )}
      </View>

      {/* Store Radar Chips with Active Filter Count & Clear */}
      <View style={styles.storeHeaderRow}>
        <Text style={styles.storeRadarLabel}>STORES TO WATCH</Text>
        {activeFilterCount > 0 && (
          <Pressable onPress={handleClearFilters} hitSlop={8} style={styles.clearFiltersBtn}>
            <Text style={styles.clearFiltersText}>Clear filters ({activeFilterCount})</Text>
          </Pressable>
        )}
      </View>

      {/* Multi-Select Stores with Dynamic Counts (Item 3) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsScroll}
      >
        {STORE_CHIPS.map((chip) => {
          const isSelected = selectedStores.includes(chip.id);
          const count = filterCounts.stores[chip.id] ?? 0;

          return (
            <Pressable
              key={chip.id}
              onPress={() => toggleStore(chip.id)}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              style={({ pressed }) => [
                styles.plainTab,
                isSelected && styles.plainTabActive,
                pressed && styles.tabPressed,
              ]}
            >
              {chip.id !== 'all' && (
                <StoreIcon
                  store={chip.id}
                  size={12}
                  color={isSelected ? '#000000' : '#86868B'}
                />
              )}
              <Text
                style={[
                  styles.plainTabText,
                  isSelected && styles.plainTabTextActive,
                ]}
              >
                {chip.label}
              </Text>
              {isSelected && (
                <Text style={styles.chipCountTextActive}>
                  ({count})
                </Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Multi-Select Type Tabs with Dynamic Counts (Item 3) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsx}
      >
        {TYPE_TABS.map((tab) => {
          const isSelected = selectedTypes.includes(tab.id);
          const count = filterCounts.types[tab.id] ?? 0;

          return (
            <Pressable
              key={tab.id}
              onPress={() => toggleType(tab.id)}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              style={({ pressed }) => [
                styles.tabxItem,
                isSelected && styles.tabxItemActive,
                pressed && styles.tabPressed,
              ]}
            >
              <Text
                style={[
                  styles.tabxText,
                  isSelected && styles.tabxTextActive,
                ]}
              >
                {tab.label}
              </Text>
              {isSelected && (
                <Text style={styles.tabxCountTextActive}>
                  ({count})
                </Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Multi-Select Claim Method Tabs with Dynamic Counts (Item 3) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.tabsx, { marginTop: 8 }]}
      >
        {CLAIM_METHOD_TABS.map((tab) => {
          const isSelected = selectedClaimMethods.includes(tab.id);
          const count = filterCounts.claimMethods[tab.id] ?? 0;

          return (
            <Pressable
              key={tab.id}
              onPress={() => toggleClaimMethod(tab.id)}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              style={({ pressed }) => [
                styles.tabxItem,
                isSelected && styles.tabxItemActive,
                pressed && styles.tabPressed,
              ]}
            >
              <Text
                style={[
                  styles.tabxText,
                  isSelected && styles.tabxTextActive,
                ]}
              >
                {tab.label}
              </Text>
              {isSelected && (
                <Text style={styles.tabxCountTextActive}>
                  ({count})
                </Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Live "Showing X of Y" Counter & Sort Row (Item 3) */}
      <View style={styles.sortRow}>
        <Text style={styles.showingCounterText}>
          Showing {filteredDeals.length} of {liveCount}
        </Text>
        <Pressable onPress={cycleSort} hitSlop={10}>
          <Text style={styles.sortLabel}>
            SORT: <Text style={styles.sortValue}>{currentSort.label.toUpperCase()} ▾</Text>
          </Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <Animated.View style={[styles.container, { opacity: contentFadeAnim }]}>
      {/* Animated laser sweep hairline when syncing or refreshing */}
      <AnimatedSyncHairline active={syncState === 'syncing' || refreshing} />

      <FlatList
        data={filteredDeals}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader()}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => handleSync(true)}
            tintColor={COLORS.accent}
            colors={[COLORS.accent]}
            progressBackgroundColor="#0C0C0C"
          />
        }
        renderItem={({ item }) => (
          <BannerCard
            deal={item}
            onPress={onDealSelect}
            onClaim={onDealSelect}
            isClaimed={dealsStore.isClaimed(item.id)}
            showFooter={true}
            imageErrors={imageErrors}
            onImageError={handleImageError}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No giveaways found</Text>
            <Text style={styles.emptySub}>Try adjusting your store or category filters</Text>
            {activeFilterCount > 0 && (
              <Pressable onPress={handleClearFilters} style={styles.emptyResetBtn}>
                <Text style={styles.emptyResetBtnText}>Reset all filters</Text>
              </Pressable>
            )}
          </View>
        }
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 26,
    paddingBottom: 120,
  },
  header: {
    marginBottom: 8,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  heading: {
    fontFamily: FONTS.serif,
    fontSize: 56,
    lineHeight: 60,
    color: '#EDEDEB',
    letterSpacing: -1.5,
  },
  syncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(237, 237, 235, 0.04)',
    borderWidth: 1,
    borderColor: '#242426',
  },
  syncPillPressed: {
    opacity: 0.7,
  },
  syncPillSyncing: {
    backgroundColor: 'rgba(237, 237, 235, 0.08)',
    borderColor: '#3A3A3D',
  },
  syncPillSynced: {
    backgroundColor: 'rgba(237, 237, 235, 0.1)',
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
  subheading: {
    fontFamily: FONTS.regular,
    fontSize: 15,
    color: '#86868B',
    marginTop: 8,
  },
  srchWrapper: {
    position: 'relative',
    justifyContent: 'center',
    marginTop: 20,
  },
  srch: {
    width: '100%',
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
    color: '#EDEDEB',
    fontFamily: FONTS.regular,
    fontSize: 16,
    paddingVertical: 14,
    paddingRight: 32,
  },
  srchClearBtn: {
    position: 'absolute',
    right: 0,
    top: 14,
    padding: 4,
  },
  srchClearText: {
    color: '#86868B',
    fontSize: 13,
    fontFamily: FONTS.mono,
  },
  storeHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 22,
  },
  storeRadarLabel: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    fontWeight: '600',
    color: '#86868B',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  clearFiltersBtn: {
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  clearFiltersText: {
    fontFamily: FONTS.mono,
    fontSize: 10.5,
    fontWeight: '700',
    color: '#EDEDEB',
    letterSpacing: 0.6,
  },
  chipsScroll: {
    gap: 8,
    marginTop: 12,
    paddingRight: 20,
  },
  plainTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#141416',
    borderWidth: 1,
    borderColor: '#26262B',
  },
  plainTabActive: {
    backgroundColor: '#EDEDEB',
    borderColor: '#EDEDEB',
  },
  plainTabText: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: '#9E9EA4',
  },
  plainTabTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  chipCountText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    color: '#636366',
  },
  chipCountTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  dimmedChip: {
    opacity: 0.35,
  },
  dimmedChipText: {
    color: '#555557',
  },
  tabsx: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    marginBottom: 4,
  },
  tabxItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#141416',
    borderWidth: 1,
    borderColor: '#26262B',
  },
  tabxItemActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderColor: '#EDEDEB',
  },
  tabxText: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: '#9E9EA4',
  },
  tabxTextActive: {
    color: '#EDEDEB',
    fontWeight: '700',
  },
  tabxCountText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    color: '#636366',
  },
  tabxCountTextActive: {
    color: '#EDEDEB',
    fontWeight: '700',
  },
  tabPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },
  sortRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 20,
  },
  showingCounterText: {
    fontFamily: FONTS.mono,
    fontSize: 11.5,
    fontWeight: '600',
    color: '#86868B',
    letterSpacing: 0.5,
  },
  sortLabel: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    color: '#86868B',
    letterSpacing: 1,
  },
  sortValue: {
    color: COLORS.accent,
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontFamily: FONTS.serif,
    fontSize: 28,
    color: '#EDEDEB',
    marginBottom: 8,
  },
  emptySub: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: '#86868B',
    textAlign: 'center',
  },
  emptyResetBtn: {
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  emptyResetBtnText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.accent,
  },
});
