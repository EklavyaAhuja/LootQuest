import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, Text, View, ScrollView, Image, Animated, Easing } from 'react-native';
import { COLORS, FONTS } from '../theme/theme';
import BouncyPressable from '../components/BouncyPressable';
import { User, Clock } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import Svg, { Circle, Line, Path, Defs, LinearGradient, Stop, Filter, FeGaussianBlur } from 'react-native-svg';

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
  coverImage?: string;
}

const COVER_IMAGES = [
  'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=600&q=80',
];

const RadarAnimation = () => {
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Continuous 360-degree rotation loop (3 seconds duration, constant angular velocity)
    const rotateAnimation = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    rotateAnimation.start();
    return () => rotateAnimation.stop();
  }, []);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Interpolation helper for blip dots to simulate phosphor decay and scale up on sweep crossing
  const getDotStyle = (p: number, x: number, y: number) => {
    const peak = p;
    const prePeak = (p - 0.02 + 1) % 1;
    const postDecay = (p + 0.30) % 1; // 30% cycle fade decay

    const keyframes = [
      { t: prePeak, opacity: 0.15, scale: 1.0 },
      { t: peak, opacity: 1.0, scale: 2.2 },
      { t: postDecay, opacity: 0.15, scale: 1.0 }
    ];

    keyframes.sort((a, b) => a.t - b.t);

    const interpolateValues = (t: number) => {
      // Find interval
      for (let i = 0; i < keyframes.length; i++) {
        const k1 = keyframes[i];
        const k2 = keyframes[(i + 1) % keyframes.length];

        if (k2.t > k1.t) {
          if (t >= k1.t && t <= k2.t) {
            const ratio = (t - k1.t) / (k2.t - k1.t);
            return {
              opacity: k1.opacity + ratio * (k2.opacity - k1.opacity),
              scale: k1.scale + ratio * (k2.scale - k1.scale),
            };
          }
        } else {
          if (t >= k1.t || t <= k2.t) {
            const dist = (k2.t - k1.t + 1) % 1;
            const progress = (t - k1.t + 1) % 1;
            const ratio = progress / dist;
            return {
              opacity: k1.opacity + ratio * (k2.opacity - k1.opacity),
              scale: k1.scale + ratio * (k2.scale - k1.scale),
            };
          }
        }
      }
      return { opacity: 0.15, scale: 1.0 };
    };

    const valAt0 = interpolateValues(0);

    const inputs: number[] = [0];
    const opacities: number[] = [valAt0.opacity];
    const scales: number[] = [valAt0.scale];

    keyframes.forEach(k => {
      if (k.t > 0.001 && k.t < 0.999) {
        inputs.push(k.t);
        opacities.push(k.opacity);
        scales.push(k.scale);
      }
    });

    inputs.push(1);
    opacities.push(valAt0.opacity);
    scales.push(valAt0.scale);

    const dotOpacity = rotateAnim.interpolate({
      inputRange: inputs,
      outputRange: opacities,
    });

    const dotScale = rotateAnim.interpolate({
      inputRange: inputs,
      outputRange: scales,
    });

    return {
      opacity: dotOpacity,
      transform: [
        { translateX: x - 2 },
        { translateY: y - 2 },
        { scale: dotScale }
      ],
    };
  };

  // Fixed stationary dot configurations (X, Y in 100x100 space, p is clockwise fraction from 12 o'clock)
  const dot1Style = getDotStyle(0.1476, 70, 35);
  const dot2Style = getDotStyle(0.8750, 30, 30);
  const dot3Style = getDotStyle(0.6640, 25, 65);
  const dot4Style = getDotStyle(0.3436, 80, 70);
  const dot5Style = getDotStyle(0.4760, 55, 83);

  return (
    <View style={styles.radarWrapper}>
      {/* 1. Static Background Rings */}
      <Svg width={100} height={100} style={StyleSheet.absoluteFill}>
        {/* Outer Ring */}
        <Circle cx={50} cy={50} r={44} stroke="rgba(46, 139, 87, 0.25)" strokeWidth={1} fill="transparent" />
        {/* Middle Dashed Ring */}
        <Circle cx={50} cy={50} r={32} stroke="rgba(46, 139, 87, 0.2)" strokeWidth={1} strokeDasharray="3, 3" fill="transparent" />
      </Svg>

      {/* 2. Center Circle Overlay (sits under rotating sweep, but above rings) */}
      <Svg width={100} height={100} style={StyleSheet.absoluteFill}>
        {/* Dark solid circle with stroke */}
        <Circle cx={50} cy={50} r={18} fill={COLORS.surfaceCharcoal} stroke="rgba(46, 139, 87, 0.45)" strokeWidth={1} />
        {/* Inner dashed ring */}
        <Circle cx={50} cy={50} r={10} stroke="rgba(46, 139, 87, 0.3)" strokeWidth={1} strokeDasharray="2, 2" fill="transparent" />
      </Svg>

      {/* 3. Rotating Sweep (rendered on top of center circle overlay and rings) */}
      <Animated.View style={[styles.radarSweep, { transform: [{ rotate }] }]}>
        <Svg width={100} height={100}>
          <Defs>
            {/* Blur filter to make the seagreen light spread out and glow */}
            <Filter id="radarGlow" x="-20%" y="-20%" width="140%" height="140%">
              <FeGaussianBlur stdDeviation="3" />
            </Filter>
            {/* Symmetrical linear gradient centered around the dashed line */}
            <LinearGradient id="sweepGrad" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%" stopColor="rgba(46, 139, 87, 0.0)" />
              <Stop offset="50%" stopColor="rgba(46, 139, 87, 0.85)" />
              <Stop offset="100%" stopColor="rgba(46, 139, 87, 0.0)" />
            </LinearGradient>
          </Defs>
          {/* Blurred seagreen 90-degree sector centered around the dashed line */}
          <Path d="M 50 50 L 18.9 18.9 A 44 44 0 0 1 81.1 18.9 Z" fill="url(#sweepGrad)" filter="url(#radarGlow)" />
          {/* Sharp cyan glow along the leading edge */}
          <Line x1={50} y1={50} x2={50} y2={6} stroke="#5de6ff" strokeWidth={1.2} opacity={0.6} />
          {/* Sharp dashed sweep line (white) directly at the leading edge */}
          <Line x1={50} y1={50} x2={50} y2={6} stroke="#ffffff" strokeWidth={1.5} strokeDasharray="3, 3" />
        </Svg>
      </Animated.View>

      {/* 4. Target Blip Dots */}
      <Animated.View style={[styles.dot, dot1Style]} />
      <Animated.View style={[styles.dot, dot2Style]} />
      <Animated.View style={[styles.dot, dot3Style]} />
      <Animated.View style={[styles.dot, dot4Style]} />
      <Animated.View style={[styles.dot, dot5Style]} />
    </View>
  );
};

export default function AlertsScreen() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  const handleImageError = (id: string) => {
    setImageErrors(prev => ({ ...prev, [id]: true }));
  };

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

  const getGameCover = useCallback((id: string) => {
    let sum = 0;
    for (let i = 0; i < id.length; i++) {
      sum += id.charCodeAt(i);
    }
    return COVER_IMAGES[sum % COVER_IMAGES.length];
  }, []);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Alerts Status Banner */}
        <View style={styles.statusBanner}>
          <View style={styles.bannerRow}>
            {/* Left Content Column */}
            <View style={styles.bannerTextCol}>
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
                Searching for free loot
              </Text>
            </View>

            {/* Right Radar Column */}
            <View style={styles.radarCol}>
              <RadarAnimation />
            </View>
          </View>
        </View>

        {/* Header with Clear Button */}
        <View style={styles.sectionHeaderContainer}>
          <Text style={styles.sectionTitle}>Recent Alerts</Text>
          {alerts.length > 0 && (
            <BouncyPressable
              onPress={clearAlerts}
              backgroundColor="transparent"
              borderRadius={20}
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
              const isAnnouncement = alert.platform.toLowerCase().includes('announcement');
              const relativeTime = getRelativeTime(alert.timestamp);
              const coverUri = alert.coverImage || getGameCover(alert.id);
              const progressPercent = alert.isExpired ? 100 : 30;

              return (
                <View key={alert.id} style={[styles.alertCard, alert.isExpired && styles.alertCardExpired]}>
                  {/* Cover Image sitting on top */}
                  <View style={styles.cardImageContainer}>
                    {(!imageErrors[alert.id] && coverUri) ? (
                      <Image
                        source={{ uri: coverUri }}
                        style={styles.cardImage}
                        onError={() => handleImageError(alert.id)}
                      />
                    ) : (
                      <View style={styles.cardImagePlaceholder}>
                        <Text style={styles.placeholderIcon}>🎮</Text>
                      </View>
                    )}
                    <View style={styles.cardImageGradient} />
                  </View>

                  {/* Content Section overlapping image */}
                  <View style={styles.cardContent}>
                    {/* Top Row: Badges & Timestamp */}
                    <View style={styles.alertHeaderRow}>
                      <View style={styles.alertBadges}>
                        <View style={[
                          styles.platformBadge,
                          isSteam && styles.platformBadgeSteam,
                          isEpic && styles.platformBadgeEpic,
                          isGog && styles.platformBadgeGog,
                          isAnnouncement && styles.platformBadgeAnnouncement
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

                    {/* Status Block */}
                    <View style={styles.statusBlock}>
                      <View style={styles.statusRow}>
                        <View style={styles.timerWrapper}>
                          <Text style={[
                            styles.timerIconText,
                            { color: alert.isExpired ? COLORS.warning : COLORS.success }
                          ]}>🕒</Text>
                          <Text style={[
                            styles.timerText,
                            { color: alert.isExpired ? COLORS.warning : COLORS.success }
                          ]}>
                            {alert.isExpired ? 'EXPIRED' : 'ACTIVE'}
                          </Text>
                        </View>
                        <Text style={[
                          styles.statusLabel,
                          { color: alert.isExpired ? COLORS.warning : COLORS.success }
                        ]}>
                          {alert.isExpired ? 'ENDED' : 'LIVE'}
                        </Text>
                      </View>

                      {/* Expiry Progress Bar */}
                      <View style={styles.progressBarBg}>
                        <View style={[
                          styles.progressBarFill,
                          {
                            width: `${progressPercent}%`,
                            backgroundColor: alert.isExpired ? COLORS.warning : COLORS.success
                          }
                        ]} />
                      </View>
                    </View>

                    {/* Description */}
                    <Text style={[styles.alertDesc, alert.isExpired && styles.alertDescExpired]}>
                      {alert.description}
                    </Text>

                    {/* Bottom Row */}
                    {!alert.isExpired && (
                      <View style={styles.alertBottomRow}>
                        <View style={styles.alertMetricRow}>
                          {alert.actionType === 'claim' ? (
                            <User size={14} color="#858585" />
                          ) : (
                            <Clock size={14} color="#858585" />
                          )}
                          <Text style={styles.alertMetricText}>{alert.claimedCount || 'Active'}</Text>
                        </View>

                        <BouncyPressable
                          onPress={() => alert.actionUrl && WebBrowser.openBrowserAsync(alert.actionUrl)}
                          backgroundColor={alert.actionType === 'claim' ? COLORS.primary : COLORS.surfaceHigh}
                          borderRadius={20}
                          shadowOffsetSize={0}
                          style={styles.alertActionBtnWrapper}
                          contentStyle={[
                            styles.alertActionBtn,
                            alert.actionType === 'details' && { borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }
                          ]}
                        >
                          <Text style={[
                            styles.alertActionBtnText,
                            { color: alert.actionType === 'claim' ? '#131313' : COLORS.text }
                          ]}>
                            {alert.actionType === 'claim' ? 'Claim Loot' : 'View Details'}
                          </Text>
                        </BouncyPressable>
                      </View>
                    )}
                  </View>
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
    backgroundColor: COLORS.surfaceCharcoal,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.success,
    borderRadius: 16,
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
    color: COLORS.textMuted,
    letterSpacing: 1,
  },
  uptimeBadge: {
    backgroundColor: 'rgba(78, 224, 130, 0.1)',
    borderWidth: 1,
    borderColor: COLORS.success,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  uptimeText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    color: COLORS.success,
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
    backgroundColor: COLORS.success,
  },
  bannerStatusText: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: COLORS.text,
  },
  bannerInfo: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.textMuted,
    lineHeight: 20,
  },
  sectionHeaderContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontFamily: FONTS.extraBold,
    fontSize: 22,
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  clearLogsBtnWrapper: {
    justifyContent: 'center',
  },
  clearLogsBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
  },
  clearLogsBtnText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: FONTS.extraBold,
    fontSize: 22,
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  emptySub: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: COLORS.textMuted,
    textAlign: 'center',
    maxWidth: 240,
    lineHeight: 22,
  },
  alertList: {
    gap: 16,
  },
  alertCard: {
    backgroundColor: COLORS.surfaceCharcoal,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 4,
  },
  alertCardExpired: {
    backgroundColor: 'rgba(255, 36, 73, 0.03)',
    borderColor: 'rgba(255, 36, 73, 0.15)',
    opacity: 0.7,
  },
  cardImageContainer: {
    height: 120,
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
    backgroundColor: 'rgba(19, 19, 19, 0.6)',
  },
  cardContent: {
    padding: 16,
    paddingTop: 8,
    marginTop: -32,
    backgroundColor: 'transparent',
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
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: COLORS.surfaceHigh,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  platformBadgeSteam: {
    backgroundColor: 'rgba(27, 58, 87, 0.25)',
    borderColor: '#1b3a57',
  },
  platformBadgeEpic: {
    backgroundColor: 'rgba(27, 77, 62, 0.25)',
    borderColor: '#1b4d3e',
  },
  platformBadgeGog: {
    backgroundColor: 'rgba(77, 42, 51, 0.25)',
    borderColor: '#4d2a33',
  },
  platformBadgeAnnouncement: {
    backgroundColor: 'rgba(168, 85, 247, 0.25)',
    borderColor: '#a855f7',
  },
  platformBadgeText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: COLORS.text,
  },
  liveNowBadge: {
    backgroundColor: 'rgba(78, 224, 130, 0.1)',
    borderWidth: 1,
    borderColor: COLORS.success,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  liveNowText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: COLORS.success,
  },
  relativeTimeText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    color: COLORS.textMuted,
  },
  alertTitle: {
    fontFamily: FONTS.bold,
    fontSize: 20,
    color: '#ffffff',
    lineHeight: 24,
    marginBottom: 8,
  },
  alertTitleExpired: {
    color: COLORS.textMuted,
    textDecorationLine: 'line-through',
  },
  statusBlock: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
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
    fontSize: 14,
  },
  timerText: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    fontWeight: 'bold',
  },
  statusLabel: {
    fontFamily: FONTS.bold,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  progressBarBg: {
    height: 4,
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  alertDesc: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.onSurfaceVariant,
    lineHeight: 20,
    marginBottom: 12,
  },
  alertDescExpired: {
    color: COLORS.textMuted,
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
    fontSize: 11,
    color: COLORS.textMuted,
  },
  alertActionBtnWrapper: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  alertActionBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertActionBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    letterSpacing: 0.5,
  },
  cardImagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1e1b29',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderIcon: {
    fontSize: 32,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  bannerTextCol: {
    flex: 1,
  },
  radarCol: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarWrapper: {
    width: 100,
    height: 100,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 50,
    overflow: 'hidden',
  },
  radarSweep: {
    width: 100,
    height: 100,
    position: 'absolute',
    top: 0,
    left: 0,
  },
  dot: {
    width: 4,
    height: 4,
    position: 'absolute',
    borderRadius: 2,
    backgroundColor: '#ffffff',
    shadowColor: '#00ffb2',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 3,
    elevation: 2,
    top: 0,
    left: 0,
  },
});

