import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Animated,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { COLORS, FONTS } from '../theme/theme';
import { timeAgo } from '../utils/time';
import StoreIcon, { storeShortName } from '../components/StoreIcon';
import { Deal } from '../models/Deal';
import { AlertsSkeleton, useSkeletonDisplay } from '../components/LootSkeleton';
import { dealsStore } from '../services/dealsStore';
import { hapticFeedback } from '../utils/haptics';
import { syncPendingPwaAlerts } from '../services/notificationService';

const ALERTS_STORAGE_KEY = 'fgf_notification_logs_v2';
const ALERT_CHIPS = ['All', 'Live now', 'Steam', 'Epic Games'];

export function stripEmojis(str: string): string {
  if (!str) return '';
  return str
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F191}-\u{1F251}\u{1F004}\u{1F0CF}\u{1F170}-\u{1F171}\u{1F17E}-\u{1F17F}\u{1F18E}\u{3030}\u{2B50}\u{2B55}\u{2934}-\u{2935}\u{2B05}-\u{2B07}\u{2B1B}-\u{2B1C}\u{3297}\u{3299}\u{FE0F}]/gu, '')
    .replace(/^[🆓🎁🎮📢🔥⚡✨👀\s]+/u, '')
    .replace(/[🆓🎁🎮📢🔥⚡✨👀]+/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface AlertLog {
  id: string;
  title: string;
  description: string;
  timestamp: number;
  platform: string;
  isLive: boolean;
  actionUrl?: string;
  isAnnouncement?: boolean;
}

interface AlertsScreenProps {
  isActive?: boolean;
  onDealSelect?: (deal: Deal) => void;
}

function AlertsScreen({ isActive, onDealSelect }: AlertsScreenProps) {
  const insets = useSafeAreaInsets();
  const [alerts, setAlerts] = useState<AlertLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [feedDeals, setFeedDeals] = useState<Deal[]>([]);

  useEffect(() => {
    loadAlerts(true);
    const cachedDeals = dealsStore.getActiveDeals();
    if (cachedDeals.length > 0) {
      setFeedDeals(cachedDeals);
    } else {
      AsyncStorage.getItem('fgf_merged_feed_cache_v3').then((raw) => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) setFeedDeals(parsed);
          } catch {}
        }
      });
    }

    const unsub = dealsStore.subscribe(() => {
      setFeedDeals(dealsStore.getActiveDeals());
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (isActive) {
      loadAlerts(false);
    }
  }, [isActive]);

  const loadAlerts = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      if (Platform.OS === 'web') {
        await syncPendingPwaAlerts();
      }
      const raw = await AsyncStorage.getItem(ALERTS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const sanitized = parsed
            .filter(
              (a: AlertLog) =>
                !a.title?.toLowerCase().includes('fireside feelings') &&
                !a.title?.toLowerCase().includes('fishermurs') &&
                !a.title?.toLowerCase().includes('slavistan')
            )
            .map((a: AlertLog) => ({
              ...a,
              title: stripEmojis(a.title),
              description: stripEmojis(a.description),
            }));
          if (sanitized.length > 0) {
            setAlerts(sanitized);
            return;
          }
        }
      }

      // If no stored alerts yet, populate from active deals
      const live = dealsStore.getActiveDeals().slice(0, 5);
      if (live.length > 0) {
        const initial = live.map((d) => ({
          id: d.id,
          title: stripEmojis(d.title),
          description: `Free ${d.type || 'game'} on ${d.platform}! Claim it now.`,
          timestamp: d.createdAt || Date.now(),
          platform: d.platform,
          isLive: !d.isExpired && d.expiryStatus !== 'EXPIRED',
          actionUrl: d.giveawayUrl || d.url,
          isAnnouncement: false,
        }));
        setAlerts(initial);
        AsyncStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(initial)).catch(() => {});
      }
    } catch {} finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    setAlerts([]);
    try {
      await AsyncStorage.removeItem(ALERTS_STORAGE_KEY);
    } catch {}
  };

  const handleAlertPress = (alert: AlertLog) => {
    const match = feedDeals.find(
      (d) =>
        d.id === alert.id ||
        d.title.toLowerCase().trim() === alert.title.toLowerCase().trim()
    ) || dealsStore.getDealById(alert.id);

    if (match) {
      onDealSelect?.(match);
    } else {
      const fallbackDeal: Deal = {
        id: alert.id || `alert_${alert.timestamp}`,
        title: alert.title,
        description: alert.description,
        platform: alert.platform || 'PC',
        type: 'full_game',
        claimMethod: 'one_click',
        url: alert.actionUrl || '',
        giveawayUrl: alert.actionUrl || '',
        createdAt: alert.timestamp,
      };
      onDealSelect?.(fallbackDeal);
    }
  };

  // Determine if an alert's deal is still active
  const isAlertActive = useCallback(
    (alert: AlertLog): boolean => {
      if (alert.isLive === false) return false;
      if (feedDeals.length > 0) {
        const match = feedDeals.find(
          (d) =>
            d.id === alert.id ||
            d.title.toLowerCase().trim() === alert.title.toLowerCase().trim()
        );
        if (match) {
          return !match.isExpired && match.expiryStatus !== 'EXPIRED';
        }
      }
      const ageMs = Date.now() - alert.timestamp;
      if (ageMs > 7 * 86400000) return false;
      return alert.isLive ?? true;
    },
    [feedDeals]
  );

  // Active alerts count for header
  const liveCount = useMemo(() => {
    return alerts.filter((a) => isAlertActive(a)).length;
  }, [alerts, isAlertActive]);

  // Deduplicate repeated entries by normalized title
  const deduplicatedAlerts = useMemo(() => {
    const seen = new Set<string>();
    return alerts.filter((a) => {
      const key = (a.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [alerts]);

  const [showEarlier, setShowEarlier] = useState(false);

  // Active (Live) drop alerts
  const activeAlerts = useMemo(() => {
    let list = deduplicatedAlerts.filter((a) => isAlertActive(a));
    if (selectedFilter !== 'All' && selectedFilter !== 'Live now') {
      const f = selectedFilter.toLowerCase();
      list = list.filter((a) => (a.platform || '').toLowerCase().includes(f));
    }
    return list.sort((a, b) => b.timestamp - a.timestamp);
  }, [deduplicatedAlerts, isAlertActive, selectedFilter]);

  // Ended alerts (collapsed in "Earlier" section by default)
  const earlierAlerts = useMemo(() => {
    if (selectedFilter === 'Live now') return [];
    let list = deduplicatedAlerts.filter((a) => !isAlertActive(a));
    if (selectedFilter !== 'All') {
      const f = selectedFilter.toLowerCase();
      list = list.filter((a) => (a.platform || '').toLowerCase().includes(f));
    }
    return list.sort((a, b) => b.timestamp - a.timestamp);
  }, [deduplicatedAlerts, isAlertActive, selectedFilter]);

  // Clean description: savings amount or nothing (no repeated boilerplate)
  const getAlertDescription = useCallback(
    (alert: AlertLog): string => {
      const match =
        feedDeals.find(
          (d) =>
            d.id === alert.id ||
            d.title.toLowerCase().trim() === alert.title.toLowerCase().trim()
        ) || dealsStore.getDealById(alert.id);

      if (match && match.worth && !match.isEstimated && match.worth !== '$0' && match.worth !== 'N/A') {
        const clean = match.worth.startsWith('$') ? match.worth : `$${match.worth}`;
        return `Save ${clean}`;
      }
      return '';
    },
    [feedDeals]
  );

  const { showSkeleton, contentFadeAnim } = useSkeletonDisplay(loading, 400);

  if (showSkeleton) {
    return <AlertsSkeleton />;
  }

  const renderAlertCard = (item: AlertLog, isActiveDeal: boolean) => {
    const savingsText = getAlertDescription(item);
    return (
      <Pressable key={item.id} style={styles.logItem} onPress={() => handleAlertPress(item)}>
        {/* Timeline Dot Marker (no accent glows) */}
        <View style={[styles.timelineDot, !isActiveDeal && styles.timelineDotEnded]} />

        {/* Meta */}
        {item.isAnnouncement || item.platform?.toLowerCase() === 'announcement' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Text style={[styles.logMeta, { color: '#F59E0B', fontWeight: '700' }]}>
              Announcement · {timeAgo(item.timestamp)}
            </Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <StoreIcon
              store={item.platform}
              size={12}
              color={isActiveDeal ? '#86868B' : '#4D4D52'}
            />
            <Text style={[styles.logMeta, !isActiveDeal && styles.logMetaEnded]}>
              {storeShortName(item.platform)} · {isActiveDeal ? 'Live' : 'Ended'} · {timeAgo(item.timestamp)}
            </Text>
          </View>
        )}

        {/* Title */}
        <Text style={[styles.logTitle, !isActiveDeal && styles.logTitleEnded]}>
          {stripEmojis(item.title)}
        </Text>

        {/* Description: savings amount or nothing */}
        {savingsText ? (
          <Text style={[styles.logDescription, !isActiveDeal && styles.logDescriptionEnded]}>
            {savingsText}
          </Text>
        ) : null}

        {/* Action: hidden if deal ended or announcement with no link */}
        {isActiveDeal && !item.isAnnouncement && item.platform?.toLowerCase() !== 'announcement' ? (
          <Pressable onPress={() => handleAlertPress(item)} hitSlop={8}>
            <Text style={styles.goBtnText}>View →</Text>
          </Pressable>
        ) : null}
      </Pressable>
    );
  };

  return (
    <Animated.View style={[{ flex: 1, backgroundColor: COLORS.bg, opacity: contentFadeAnim }]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 6 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header Row (.top) - Title on single line */}
        <View style={styles.topRow}>
          <Text style={styles.heading}>Drop Radar.</Text>
          <Pressable onPress={handleClear} hitSlop={12} style={{ marginTop: 8 }}>
            <Text style={styles.clearBtnText}>Clear</Text>
          </Pressable>
        </View>

        <Text style={styles.subtitle}>New free games, as they go live.</Text>

        {/* Radar Monitor Status Banner */}
        <View style={styles.statusBanner}>
          <View style={styles.statusLeft}>
            <View style={styles.radarActiveRow}>
              <View style={styles.dot} />
              <Text style={styles.radarActiveLabel}>Watching for new drops</Text>
            </View>
            <Text style={styles.radarActiveSub}>
              {liveCount} live right now
            </Text>
          </View>
          <Text style={styles.radarCountNumber}>{liveCount}</Text>
        </View>

        {/* Plain text filter tabs with 1px underline on active, horizontally scrollable */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsScroll}
        >
          {ALERT_CHIPS.map((chip) => {
            const isActive = selectedFilter === chip;
            return (
              <Pressable
                key={chip}
                onPress={() => {
                  hapticFeedback.selection();
                  setSelectedFilter(chip);
                }}
                style={[styles.plainTab, isActive && styles.plainTabActive]}
              >
                {(chip === 'Steam' || chip === 'Epic Games') && (
                  <StoreIcon
                    store={chip}
                    size={12}
                    color={isActive ? '#EDEDEB' : '#86868B'}
                  />
                )}
                <Text style={[styles.plainTabText, isActive && styles.plainTabTextActive]}>
                  {chip}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Log Timeline (.log) */}
        <View style={styles.log}>
          {activeAlerts.map((item) => renderAlertCard(item, true))}

          {activeAlerts.length === 0 && earlierAlerts.length === 0 && (
            <View style={{ paddingTop: 20 }}>
              <Text style={{ fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textSecondary }}>
                No drop alerts matching this filter.
              </Text>
            </View>
          )}

          {/* Collapsed Earlier Section for Ended Items */}
          {earlierAlerts.length > 0 && (
            <View style={styles.earlierSection}>
              <Pressable
                onPress={() => {
                  hapticFeedback.light();
                  setShowEarlier(!showEarlier);
                }}
                style={styles.earlierToggleBtn}
                accessibilityRole="button"
                accessibilityLabel="Toggle earlier drop alerts"
              >
                <Text style={styles.earlierToggleText}>
                  Earlier ({earlierAlerts.length}) {showEarlier ? '▲' : '▼'}
                </Text>
              </Pressable>

              {showEarlier && (
                <View style={styles.earlierList}>
                  {earlierAlerts.map((item) => renderAlertCard(item, false))}
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heading: {
    fontFamily: FONTS.display,
    fontSize: 26,
    lineHeight: 30,
    color: '#EDEDEB',
    letterSpacing: -0.8,
  },
  clearBtnText: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: '#86868B',
  },
  subtitle: {
    fontFamily: FONTS.regular,
    fontSize: 15,
    color: '#86868B',
    marginTop: 8,
  },
  statusBanner: {
    marginTop: 26,
    paddingVertical: 18,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#1C1C1E',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusLeft: {
    flex: 1,
  },
  radarActiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EDEDEB',
  },
  radarActiveLabel: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    fontWeight: '700',
    color: '#86868B',
    letterSpacing: 0.2,
  },
  radarActiveSub: {
    fontFamily: FONTS.regular,
    fontSize: 15,
    color: '#EDEDEB',
    marginTop: 8,
  },
  radarCountNumber: {
    fontFamily: FONTS.mono,
    fontSize: 32,
    color: '#EDEDEB',
    lineHeight: 34,
  },
  chipsScroll: {
    gap: 16,
    marginTop: 20,
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
  log: {
    marginTop: 28,
    marginLeft: 6,
    borderLeftWidth: 1,
    borderLeftColor: '#1C1C1E',
    paddingLeft: 24,
  },
  logItem: {
    position: 'relative',
    paddingBottom: 32,
  },
  timelineDot: {
    position: 'absolute',
    left: -28,
    top: 4,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#EDEDEB',
  },
  timelineDotEnded: {
    backgroundColor: '#4D4D52',
  },
  logMeta: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    fontWeight: '600',
    color: '#86868B',
    letterSpacing: 0.2,
  },
  logMetaEnded: {
    color: '#4D4D52',
  },
  logTitle: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    lineHeight: 20,
    color: '#EDEDEB',
    letterSpacing: -0.3,
    marginTop: 8,
    marginBottom: 6,
  },
  logTitleEnded: {
    color: '#86868B',
  },
  logDescription: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    lineHeight: 21,
    color: '#86868B',
  },
  logDescriptionEnded: {
    color: '#4D4D52',
  },
  goBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: '#EDEDEB',
    marginTop: 12,
  },
  earlierSection: {
    marginTop: 8,
    paddingTop: 8,
  },
  earlierToggleBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#111317',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignSelf: 'flex-start',
    marginBottom: 20,
  },
  earlierToggleText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    fontWeight: '700',
    color: '#86868B',
    letterSpacing: 0.2,
  },
  earlierList: {
    marginTop: 4,
  },
});

export default React.memo(AlertsScreen);
