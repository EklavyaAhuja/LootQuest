import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { COLORS, FONTS } from '../theme/theme';
import BouncyPressable from '../components/BouncyPressable';
import { User, Clock } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';

interface AlertItem {
  id: string;
  title: string;
  description: string;
  timestamp: number;
  platform: string;
  isLive?: boolean;
  claimedCount?: string;
  actionType?: 'claim' | 'details';
  actionUrl?: string;
  isExpired?: boolean;
}

export default function AlertsScreen() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  // Load alert logs and reset the unread alerts count
  useEffect(() => {
    const loadAlertsAndReset = async () => {
      try {
        const raw = await AsyncStorage.getItem('fgf_notification_logs_v2');
        if (raw) {
          const parsed = JSON.parse(raw);
          const filtered = parsed.filter((alert: any) => 
            alert.id !== 'alert_1' && 
            alert.id !== 'alert_2' && 
            alert.id !== 'alert_3' &&
            !/neon nexus/i.test(alert.title) &&
            !/void runner x/i.test(alert.title) &&
            !/synthwave/i.test(alert.title)
          );
          setAlerts(filtered);
          if (filtered.length !== parsed.length) {
            await AsyncStorage.setItem('fgf_notification_logs_v2', JSON.stringify(filtered));
          }
        } else {
          setAlerts([]);
        }
        await AsyncStorage.setItem('fgf_unread_alerts_count', '0');
      } catch (e) {
        console.error('Error loading alerts or resetting unread count:', e);
      }
    };
    loadAlertsAndReset();
  }, []);

  const clearAlerts = async () => {
    try {
      await AsyncStorage.removeItem('fgf_notification_logs_v2');
      setAlerts([]);
    } catch (e) {
      console.error(e);
    }
  };

  const getRelativeTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Alerts Status Banner */}
        <View style={styles.statusBanner}>
          <View style={styles.bannerHeader}>
            <Text style={styles.bannerTitle}>SCANNER STATUS</Text>
            <View style={styles.uptimeBadge}>
              <Text style={styles.uptimeText}>UPTIME 99.9%</Text>
            </View>
          </View>
          
          <View style={styles.bannerStatusRow}>
            <View style={styles.statusDot} />
            <Text style={styles.bannerStatusText}>System Active</Text>
          </View>

          <Text style={styles.bannerInfo}>
            Continuously monitoring 14 platforms for limited-time game giveaways and beta access.
          </Text>
        </View>

        {/* Header with Clear Button */}
        <View style={styles.sectionHeaderContainer}>
          <Text style={styles.sectionTitle}>Recent Alerts</Text>
          {alerts.length > 0 && (
            <BouncyPressable
              onPress={clearAlerts}
              backgroundColor="transparent"
              borderRadius={8}
              shadowOffsetSize={0}
              style={styles.clearLogsBtnWrapper}
              contentStyle={styles.clearLogsBtn}
            >
              <Text style={styles.clearLogsBtnText}>CLEAR LOGS</Text>
            </BouncyPressable>
          )}
        </View>

        {/* List of Alerts */}
        {alerts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>ALL CAUGHT UP!</Text>
            <Text style={styles.emptySub}>
              New freebie findings will register here in the background.
            </Text>
          </View>
        ) : (
          <View style={styles.alertList}>
            {alerts.map((alert) => {
              const isEpic = alert.platform.toLowerCase().includes('epic');
              const isSteam = alert.platform.toLowerCase().includes('steam');
              const isGog = alert.platform.toLowerCase().includes('gog');
              const relativeTime = getRelativeTime(alert.timestamp);

              return (
                <View key={alert.id} style={[styles.alertCard, alert.isExpired && styles.alertCardExpired]}>
                  {/* Top Row: Badges & Timestamp */}
                  <View style={styles.alertHeaderRow}>
                    <View style={styles.alertBadges}>
                      <View style={[
                        styles.platformBadge,
                        isSteam && styles.platformBadgeSteam,
                        isEpic && styles.platformBadgeEpic,
                        isGog && styles.platformBadgeGog
                      ]}>
                        <Text style={styles.platformBadgeText}>{alert.platform.toUpperCase()}</Text>
                      </View>
                      
                      {alert.isLive && (
                        <View style={styles.liveNowBadge}>
                          <Text style={styles.liveNowText}>LIVE NOW</Text>
                        </View>
                      )}
                    </View>
                    
                    <Text style={styles.relativeTimeText}>{relativeTime}</Text>
                  </View>

                  {/* Title */}
                  <Text style={[styles.alertTitle, alert.isExpired && styles.alertTitleExpired]}>
                    {alert.title}
                  </Text>

                  {/* Description */}
                  <Text style={[styles.alertDesc, alert.isExpired && styles.alertDescExpired]}>
                    {alert.description}
                  </Text>

                  {/* Bottom Row */}
                  {!alert.isExpired && (
                    <View style={styles.alertBottomRow}>
                      <View style={styles.alertMetricRow}>
                        {alert.actionType === 'claim' ? (
                          <User size={12} color="#64748b" />
                        ) : (
                          <Clock size={12} color="#64748b" />
                        )}
                        <Text style={styles.alertMetricText}>{alert.claimedCount}</Text>
                      </View>

                      <BouncyPressable
                        onPress={() => alert.actionUrl && WebBrowser.openBrowserAsync(alert.actionUrl)}
                        backgroundColor={alert.actionType === 'claim' ? '#39ff14' : '#1e293b'}
                        borderRadius={8}
                        shadowOffsetSize={0}
                        style={styles.alertActionBtnWrapper}
                        contentStyle={[
                          styles.alertActionBtn,
                          alert.actionType === 'details' && { borderWidth: 1, borderColor: '#334155' }
                        ]}
                      >
                        <Text style={[
                          styles.alertActionBtnText,
                          { color: alert.actionType === 'claim' ? '#0b101e' : '#dee2f6' }
                        ]}>
                          {alert.actionType === 'claim' ? 'Claim Loot' : 'View Details'}
                        </Text>
                      </BouncyPressable>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  statusBanner: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 24,
    padding: 16,
    marginBottom: 24,
  },
  bannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  bannerTitle: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: '#64748b',
    letterSpacing: 1,
  },
  uptimeBadge: {
    backgroundColor: 'rgba(57, 255, 20, 0.05)',
    borderWidth: 1,
    borderColor: '#39ff14',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  uptimeText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    color: '#39ff14',
    fontWeight: 'bold',
  },
  bannerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#39ff14',
  },
  bannerStatusText: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: COLORS.text,
  },
  bannerInfo: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
  },
  sectionHeaderContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: COLORS.text,
    letterSpacing: 1,
  },
  clearLogsBtnWrapper: {
    justifyContent: 'center',
  },
  clearLogsBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
  },
  clearLogsBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: '#94a3b8',
    letterSpacing: 0.5,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: FONTS.bold,
    fontSize: 20,
    color: COLORS.text,
  },
  emptySub: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    maxWidth: 240,
  },
  alertList: {
    gap: 12,
  },
  alertCard: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 20,
    padding: 16,
  },
  alertCardExpired: {
    opacity: 0.6,
  },
  alertHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  alertBadges: {
    flexDirection: 'row',
    gap: 6,
  },
  platformBadge: {
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#475569',
  },
  platformBadgeSteam: {
    backgroundColor: 'rgba(27, 58, 87, 0.15)',
    borderColor: '#1b3a57',
  },
  platformBadgeEpic: {
    backgroundColor: 'rgba(27, 77, 62, 0.15)',
    borderColor: '#1b4d3e',
  },
  platformBadgeGog: {
    backgroundColor: 'rgba(77, 42, 51, 0.15)',
    borderColor: '#4d2a33',
  },
  platformBadgeText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: '#dee2f6',
  },
  liveNowBadge: {
    backgroundColor: 'rgba(57, 255, 20, 0.1)',
    borderWidth: 1,
    borderColor: '#39ff14',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  liveNowText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: '#39ff14',
  },
  relativeTimeText: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: '#64748b',
  },
  alertTitle: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: '#39ff14',
    lineHeight: 22,
    marginBottom: 6,
  },
  alertTitleExpired: {
    color: '#94a3b8',
  },
  alertDesc: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: '#dee2f6',
    lineHeight: 21,
    marginBottom: 12,
  },
  alertDescExpired: {
    color: '#64748b',
    fontStyle: 'italic',
  },
  alertBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  alertMetricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  alertMetricText: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: '#64748b',
  },
  alertActionBtnWrapper: {
    justifyContent: 'center',
  },
  alertActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  alertActionBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
  },
});
