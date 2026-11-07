import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  FlatList,
  Animated,
  AccessibilityInfo,
  Platform,
  Alert,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, RADIUS } from '../theme/theme';
import { dealsStore } from '../services/dealsStore';
import { calculateVaultValue, cleanDisplayTitle } from '../utils/dealUtils';
import { Deal } from '../models/Deal';
import { checkIsReduceMotionEnabled, subscribeToReduceMotion } from '../utils/motion';
import { PosterCard } from '../components/UnifiedCards';
import StoreIcon from '../components/StoreIcon';
import { VaultSkeleton, useSkeletonDisplay } from '../components/LootSkeleton';
import { hapticFeedback } from '../utils/haptics';

interface VaultScreenProps {
  onDealSelect?: (deal: Deal) => void;
  isActive?: boolean;
  claimedDeals?: Deal[];
  onRemoveClaimed?: (dealId: string) => void;
}

const VAULT_CHIPS = [
  { id: 'All', label: 'All' },
  { id: 'PC', label: 'PC' },
  { id: 'Steam', label: 'Steam', store: 'Steam' },
  { id: 'Epic Games', label: 'Epic', store: 'Epic Games' },
  { id: 'Console', label: 'Console' },
];

function VaultScreen({
  onDealSelect,
  isActive,
  onRemoveClaimed,
}: VaultScreenProps) {
  const insets = useSafeAreaInsets();
  const [, setStoreVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [isReduceMotion, setIsReduceMotion] = useState(false);

  // Undo Toast State
  const [lastRemovedDeal, setLastRemovedDeal] = useState<Deal | null>(null);
  const [undoToastVisible, setUndoToastVisible] = useState(false);
  const undoTimeoutRef = useRef<any>(null);

  // Subscribe to central dealsStore (Item 1 & 2)
  useEffect(() => {
    dealsStore.init().then(() => {
      setLoading(false);
    });

    const unsubscribe = dealsStore.subscribe(() => {
      setStoreVersion((v) => v + 1);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const vaultItems = dealsStore.getVaultItems(selectedFilter);
  const allVaultItems = dealsStore.getVaultItems('All');
  const stats = dealsStore.getStats();

  // Animated money saved counter (900ms ease-out cubic)
  const targetSaved = stats.vaultValueSaved;
  const [displaySaved, setDisplaySaved] = useState(0);
  const currentSavedRef = useRef(0);

  useEffect(() => {
    checkIsReduceMotionEnabled().then(setIsReduceMotion);
    return subscribeToReduceMotion(setIsReduceMotion);
  }, []);

  useEffect(() => {
    const startVal = currentSavedRef.current;
    if (Math.abs(targetSaved - startVal) < 0.01) return;

    if (isReduceMotion) {
      setDisplaySaved(targetSaved);
      currentSavedRef.current = targetSaved;
      return;
    }

    const startTime = Date.now();
    const duration = 900; // 900ms ease-out cubic

    const step = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / duration);
      const factor = 1 - Math.pow(1 - progress, 3);
      const current = startVal + (targetSaved - startVal) * factor;
      setDisplaySaved(current);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        currentSavedRef.current = targetSaved;
        setDisplaySaved(targetSaved);
      }
    };

    requestAnimationFrame(step);
  }, [targetSaved, isReduceMotion]);

  const handleImageError = useCallback((id: string) => {}, []);

  // Delete with 4-second Undo toast via Central dealsStore
  const handleDeleteDeal = useCallback(
    async (deal: Deal) => {
      try {
        hapticFeedback.light();
        await dealsStore.unclaimDeal(deal.id, deal.title);
        onRemoveClaimed?.(deal.id);

        setLastRemovedDeal(deal);
        setUndoToastVisible(true);

        if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
        undoTimeoutRef.current = setTimeout(() => {
          setUndoToastVisible(false);
          setLastRemovedDeal(null);
        }, 4000);
      } catch (e) {
        hapticFeedback.warning();
        console.error('Error deleting deal from vault:', e);
      }
    },
    [onRemoveClaimed]
  );

  const handleUndoDelete = useCallback(async () => {
    if (!lastRemovedDeal) return;
    try {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
      await dealsStore.claimDeal(lastRemovedDeal);
      hapticFeedback.success();
      setUndoToastVisible(false);
      setLastRemovedDeal(null);
    } catch (e) {
      hapticFeedback.warning();
      console.error('Error undoing delete in vault:', e);
    }
  }, [lastRemovedDeal]);

  // "Avg per game" = total saved / number of claimed games that have a real price
  const avgPerGame = useMemo(() => {
    const realPriceGames = allVaultItems.filter((d) => {
      if (!d.worth || d.isEstimated) return false;
      const num = parseFloat(d.worth.replace(/[^0-9.]/g, ''));
      return !isNaN(num) && num > 0;
    });
    if (realPriceGames.length === 0) return '0.00';
    return (displaySaved / realPriceGames.length).toFixed(2);
  }, [allVaultItems, displaySaved]);

  // Key extractor and item renderer callbacks (must be declared before any conditional return)
  const keyExtractor = useCallback((item: Deal) => item.id, []);

  const renderVaultItem = useCallback(
    ({ item, index }: { item: Deal; index: number }) => (
      <View style={[styles.gridItem, index % 2 === 0 ? { paddingRight: 6 } : { paddingLeft: 6 }]}>
        <PosterCard
          deal={item}
          onPress={(deal) => onDealSelect?.(deal)}
          onLongPress={(deal) => {
            hapticFeedback.light();
            Alert.alert(
              'Remove from Vault',
              `Remove "${cleanDisplayTitle(deal.title)}" from your Vault?`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Remove',
                  style: 'destructive',
                  onPress: () => handleDeleteDeal(deal),
                },
              ]
            );
          }}
          isClaimed={true}
          isVault={true}
          showRating={true}
          artAspectRatio={16 / 9}
          width="100%"
          onImageError={handleImageError}
        />
      </View>
    ),
    [onDealSelect, handleDeleteDeal, handleImageError]
  );

  // Skeleton Loader with 400ms min display (Item 4)
  const { showSkeleton, contentFadeAnim } = useSkeletonDisplay(loading && allVaultItems.length === 0, 400);

  if (showSkeleton) {
    return <VaultSkeleton />;
  }

  const renderHeader = () => (
    <View style={styles.header}>
      {/* Top Label with Dot */}
      <View style={styles.topLabelRow}>
        <View style={styles.dot} />
        <Text style={styles.topLabel}>MONEY SAVED</Text>
      </View>

      {/* Giant Number (.big) with Animated count-up */}
      <Text style={styles.bigNumber}>${displaySaved.toFixed(2)}</Text>
      <Text style={styles.subtitle}>What you've claimed, and what it would have cost.</Text>

      {/* 3-Column Stats Grid (.stats) */}
      <View style={styles.statsGrid}>
        <View style={styles.statCol}>
          <Text style={styles.statLabel}>CLAIMED</Text>
          <Text style={styles.statValue}>{stats.totalClaimedVault}</Text>
        </View>
        <View style={[styles.statCol, styles.statColDivided]}>
          <Text style={styles.statLabel}>SAVED</Text>
          <Text style={[styles.statValue, { color: '#EDEDEB' }]}>
            ${displaySaved.toFixed(2)}
          </Text>
        </View>
        <View style={[styles.statCol, styles.statColDivided]}>
          <Text style={styles.statLabel}>AVG PER GAME</Text>
          <Text style={styles.statValue}>${avgPerGame}</Text>
        </View>
      </View>

      {/* Plain text filter tabs with a 1px underline on active */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsScroll}
      >
        {VAULT_CHIPS.map((chip) => {
          const isChipActive = selectedFilter === chip.id;
          return (
            <Pressable
              key={chip.id}
              onPress={() => {
                hapticFeedback.selection();
                setSelectedFilter(chip.id);
              }}
              style={[styles.plainTab, isChipActive && styles.plainTabActive]}
            >
              {chip.store && (
                <StoreIcon
                  store={chip.store}
                  size={12}
                  color={isChipActive ? '#EDEDEB' : '#86868B'}
                />
              )}
              <Text style={[styles.plainTabText, isChipActive && styles.plainTabTextActive]}>
                {chip.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <Animated.View style={[styles.container, { opacity: contentFadeAnim }]}>
      <FlashList
        data={vaultItems}
        keyExtractor={keyExtractor}
        getItemType={(item: Deal) => item.type || 'full_game'}
        numColumns={2}
        contentContainerStyle={[styles.listContent, { paddingTop: insets.top + 6 }]}
        ListHeaderComponent={renderHeader()}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        renderItem={renderVaultItem}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="cube-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Vault is empty</Text>
            <Text style={styles.emptySub}>
              Claim giveaways from the Home or Feed tabs to add them to your lifetime vault.
            </Text>
          </View>
        }
      />

      {/* Removed · Undo toast */}
      {undoToastVisible && (
        <View style={styles.undoToast}>
          <Text style={styles.undoToastText}>Removed</Text>
          <Text style={styles.undoToastDivider}>·</Text>
          <Pressable onPress={handleUndoDelete} hitSlop={8}>
            <Text style={styles.undoToastAction}>Undo</Text>
          </Pressable>
        </View>
      )}
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
    paddingBottom: 120,
  },
  header: {
    marginBottom: 8,
  },
  topLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EDEDEB',
  },
  topLabel: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    fontWeight: '700',
    color: '#86868B',
    letterSpacing: 0.2,
    
  },
  bigNumber: {
    fontFamily: FONTS.display,
    fontSize: 48,
    lineHeight: 52,
    color: '#EDEDEB',
    letterSpacing: -1.5,
    marginTop: 4,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: FONTS.regular,
    fontSize: 14.5,
    color: '#86868B',
    marginBottom: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    backgroundColor: '#111317',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: RADIUS.lg,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  statCol: {
    flex: 1,
  },
  statColDivided: {
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255, 255, 255, 0.08)',
    paddingLeft: 16,
  },
  statLabel: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: '#86868B',
    letterSpacing: 0.2,
    
  },
  statValue: {
    fontFamily: FONTS.mono,
    fontSize: 16,
    fontWeight: '700',
    color: '#EDEDEB',
    marginTop: 4,
  },
  chipsScroll: {
    gap: 16,
    marginBottom: 16,
    paddingRight: 20,
  },
  plainTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  plainTabActive: {
    borderBottomColor: '#EDEDEB',
  },
  plainTabText: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    lineHeight: 16,
    color: '#86868B',
  },
  plainTabTextActive: {
    color: '#EDEDEB',
    fontWeight: '600',
  },
  columnWrapper: {
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  gridItem: {
    flex: 1,
    marginBottom: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyTitle: {
    fontFamily: FONTS.extraBold,
    fontSize: 22,
    color: '#EDEDEB',
    marginTop: 16,
    marginBottom: 8,
    letterSpacing: -0.4,
  },
  emptySub: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: '#86868B',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 32,
  },
  undoToast: {
    position: 'absolute',
    bottom: 96,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: RADIUS.pill,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
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
});

export default React.memo(VaultScreen);
