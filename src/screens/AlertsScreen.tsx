import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { COLORS, FONTS } from '../theme/theme';
import { timeAgo } from '../utils/time';
import StoreIcon, { storeShortName } from '../components/StoreIcon';
import { Deal } from '../models/Deal';
import { AlertsSkeleton, useSkeletonDisplay } from '../components/LootSkeleton';
import { dealsStore } from '../services/dealsStore';

const ALERTS_STORAGE_KEY = 'fgf_notification_logs_v2';
const ALERT_CHIPS = ['All', 'Live now', 'Steam', 'Epic Games'];

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

export default function AlertsScreen() {
  const [alerts, setAlerts] = useState<AlertLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [feedDeals, setFeedDeals] = useState<Deal[]>([]);

  useEffect(() => {
    loadAlerts();
    AsyncStorage.getItem('fgf_merged_feed_cache').then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setFeedDeals(parsed);
        } catch {}
      }
    });

    const unsub = dealsStore.subscribe(() => {
      setFeedDeals(dealsStore.getActiveDeals());
    });
    return () => unsub();
  }, []);

  const loadAlerts = async () => {
    setLoading(true);
    try {
      const raw = await AsyncStorage.getItem(ALERTS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const sanitized = parsed.filter(
            (a: AlertLog) =>
              !a.title?.toLowerCase().includes('fireside feelings') &&
              !a.title?.toLowerCase().includes('fishermurs') &&
              !a.title?.toLowerCase().includes('slavistan')
          );
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
          title: d.title,
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

  const handleOpenAction = async (url?: string) => {
    if (!url) return;
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {}
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

  // Round 3 Item 9: Move ended alerts below active ones
  const sortedAlerts = useMemo(() => {
    const activeList = alerts.filter((a) => isAlertActive(a));
    const endedList = alerts.filter((a) => !isAlertActive(a));
    activeList.sort((a, b) => b.timestamp - a.timestamp);
    endedList.sort((a, b) => b.timestamp - a.timestamp);
    return [...activeList, ...endedList];
  }, [alerts, isAlertActive]);

  const filteredAlerts = useMemo(() => {
    let list = sortedAlerts;
    if (selectedFilter === 'Live now') {
      list = list.filter((a) => isAlertActive(a));
    } else if (selectedFilter !== 'All') {
      const f = selectedFilter.toLowerCase();
      list = list.filter((a) => (a.platform || '').toLowerCase().includes(f));
    }
    return list;
  }, [sortedAlerts, selectedFilter, isAlertActive]);

  const { showSkeleton, contentFadeAnim } = useSkeletonDisplay(loading, 400);

  if (showSkeleton) {
    return <AlertsSkeleton />;
  }

  return (
    <Animated.View style={[{ flex: 1, backgroundColor: COLORS.bg, opacity: contentFadeAnim }]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header Row (.top) */}
        <View style={styles.topRow}>
          <Text style={styles.heading}>Drop{'\n'}Radar.</Text>
          <Pressable onPress={handleClear} hitSlop={12} style={{ marginTop: 8 }}>
            <Text style={styles.clearBtnText}>Clear</Text>
          </Pressable>
        </View>

        {/* Round 4 Item 5: Exact rewrite */}
        <Text style={styles.subtitle}>New free games, as they go live.</Text>

        {/* Radar Monitor Status Banner */}
        <View style={styles.statusBanner}>
          <View style={styles.statusLeft}>
            <View style={styles.radarActiveRow}>
              <View style={styles.dot} />
              {/* Round 4 Item 5: Exact rewrite */}
              <Text style={styles.radarActiveLabel}>WATCHING FOR NEW DROPS</Text>
            </View>
            {/* Round 4 Item 5: Exact rewrite - counts only active deals */}
            <Text style={styles.radarActiveSub}>
              {liveCount} live right now
            </Text>
          </View>
          {/* Big count only counts active deals */}
          <Text style={styles.radarCountNumber}>{liveCount}</Text>
        </View>

        {/* Round 3 Item 5: Plain text filter tabs with 1px underline on active, horizontally scrollable */}
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
                onPress={() => setSelectedFilter(chip)}
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
          {filteredAlerts.map((item) => {
            const isActiveDeal = isAlertActive(item);
            return (
              <View key={item.id} style={styles.logItem}>
                {/* Timeline Dot Marker (no accent glows) */}
                <View
                  style={[
                    styles.timelineDot,
                    !isActiveDeal && styles.timelineDotEnded,
                  ]}
                />

                {/* Meta */}
                {item.isAnnouncement || item.platform?.toLowerCase() === 'announcement' ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Text style={[styles.logMeta, { color: '#F59E0B', fontWeight: '700' }]}>
                      ANNOUNCEMENT · {timeAgo(item.timestamp)}
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
                      {storeShortName(item.platform).toUpperCase()} · {isActiveDeal ? 'LIVE' : 'Ended'} · {timeAgo(item.timestamp)}
                    </Text>
                  </View>
                )}

                {/* Title (h3) */}
                <Text style={[styles.logTitle, !isActiveDeal && styles.logTitleEnded]}>
                  {item.title}
                </Text>

                {/* Description (p) */}
                <Text style={[styles.logDescription, !isActiveDeal && styles.logDescriptionEnded]}>
                  {item.description}
                </Text>

                {/* Action (.go): hidden if deal has ended, or if it is an announcement with no claim link */}
                {isActiveDeal && !item.isAnnouncement && item.platform?.toLowerCase() !== 'announcement' && item.actionUrl ? (
                  <Pressable onPress={() => handleOpenAction(item.actionUrl)} hitSlop={8}>
                    <Text style={styles.goBtnText}>Get →</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}

          {filteredAlerts.length === 0 && (
            <View style={{ paddingTop: 20 }}>
              <Text style={{ fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textSecondary }}>
                No drop alerts matching this filter.
              </Text>
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
    paddingTop: 26,
    paddingBottom: 120,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heading: {
    fontFamily: FONTS.serif,
    fontSize: 56,
    lineHeight: 56,
    color: '#EDEDEB',
    letterSpacing: -1.6,
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
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  radarActiveSub: {
    fontFamily: FONTS.regular,
    fontSize: 15,
    color: '#EDEDEB',
    marginTop: 8,
  },
  radarCountNumber: {
    fontFamily: FONTS.serif,
    fontSize: 44,
    color: '#EDEDEB',
    lineHeight: 44,
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
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  logMetaEnded: {
    color: '#4D4D52',
  },
  logTitle: {
    fontFamily: FONTS.serif,
    fontSize: 28,
    lineHeight: 30,
    color: '#EDEDEB',
    letterSpacing: -0.5,
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
});
