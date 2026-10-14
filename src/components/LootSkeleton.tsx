import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Animated,
  StyleProp,
  ViewStyle,
  ScrollView,
  Dimensions,
  AccessibilityInfo,
} from 'react-native';
import { COLORS, RADIUS } from '../theme/theme';

interface ShimmerBoxProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export function ShimmerBox({
  width = '100%',
  height = 20,
  borderRadius = 8,
  style,
}: ShimmerBoxProps) {
  const anim = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduceMotion);
    return () => sub?.remove?.();
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 1200, // 1.2s loop
          useNativeDriver: false,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: false,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim, reduceMotion]);

  // Base #141416, shimmer sweep to #26262A
  const backgroundColor = anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['#141416', '#26262A', '#141416'],
  });

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height: height as any,
          borderRadius,
          backgroundColor: reduceMotion ? '#18181A' : backgroundColor,
        },
        style,
      ]}
    />
  );
}

/**
 * Custom hook to show skeleton for at least ~400ms so it never flashes,
 * and swaps to content with a short fade.
 */
export function useSkeletonDisplay(loading: boolean, minDuration = 400) {
  const [showSkeleton, setShowSkeleton] = useState(loading);
  const contentFadeAnim = useRef(new Animated.Value(0)).current;
  const mountTimeRef = useRef(Date.now());

  useEffect(() => {
    if (loading) {
      mountTimeRef.current = Date.now();
      setShowSkeleton(true);
      contentFadeAnim.setValue(0);
    } else {
      const elapsed = Date.now() - mountTimeRef.current;
      const remaining = Math.max(0, minDuration - elapsed);

      const timer = setTimeout(() => {
        setShowSkeleton(false);
        Animated.timing(contentFadeAnim, {
          toValue: 1,
          duration: 250, // Short fade to content
          useNativeDriver: true,
        }).start();
      }, remaining);

      return () => clearTimeout(timer);
    }
  }, [loading, minDuration, contentFadeAnim]);

  return { showSkeleton, contentFadeAnim };
}

// ─── Home Screen Skeleton Layout ──────────────────────────────────────────────
export function HomeSkeleton() {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scrollPadding}
      style={styles.screenBg}
    >
      {/* Top indicator & greeting */}
      <View style={styles.rowBetween}>
        <ShimmerBox width={120} height={18} borderRadius={RADIUS.pill} />
        <ShimmerBox width={50} height={18} borderRadius={RADIUS.xs} />
      </View>
      <ShimmerBox width={140} height={20} borderRadius={6} style={{ marginTop: 20 }} />
      <ShimmerBox width={220} height={36} borderRadius={8} style={{ marginTop: 8 }} />
      <ShimmerBox width={260} height={16} borderRadius={6} style={{ marginTop: 8 }} />

      {/* Stats HUD (3 columns) */}
      <View style={[styles.statsRow, { marginTop: 24 }]}>
        <View style={styles.statCol}>
          <ShimmerBox width={60} height={10} borderRadius={4} />
          <ShimmerBox width={70} height={24} borderRadius={6} style={{ marginTop: 6 }} />
        </View>
        <View style={[styles.statCol, styles.colDivided]}>
          <ShimmerBox width={60} height={10} borderRadius={4} />
          <ShimmerBox width={70} height={24} borderRadius={6} style={{ marginTop: 6 }} />
        </View>
        <View style={[styles.statCol, styles.colDivided]}>
          <ShimmerBox width={60} height={10} borderRadius={4} />
          <ShimmerBox width={70} height={24} borderRadius={6} style={{ marginTop: 6 }} />
        </View>
      </View>

      {/* Hero Block (16/10 aspect ratio, rounded 20) */}
      <View style={[styles.heroBlock, { marginTop: 24 }]}>
        <ShimmerBox width="100%" height={210} borderRadius={20} />
      </View>

      {/* Poster Row Header */}
      <ShimmerBox width={160} height={18} borderRadius={6} style={{ marginTop: 28, marginBottom: 14 }} />

      {/* Poster Row (horizontal) */}
      <View style={styles.posterRow}>
        {[1, 2, 3].map((key) => (
          <View key={key} style={styles.posterSkeleton}>
            <ShimmerBox width={146} height={195} borderRadius={14} />
            <ShimmerBox width={120} height={18} borderRadius={4} style={{ marginTop: 8 }} />
            <ShimmerBox width={80} height={12} borderRadius={4} style={{ marginTop: 4 }} />
          </View>
        ))}
      </View>

      {/* Banner Skeletons */}
      <ShimmerBox width={160} height={18} borderRadius={6} style={{ marginTop: 28, marginBottom: 14 }} />
      <ShimmerBox width="100%" height={148} borderRadius={16} style={{ marginBottom: 16 }} />
      <ShimmerBox width="100%" height={148} borderRadius={16} style={{ marginBottom: 16 }} />
    </ScrollView>
  );
}

// ─── Feed Screen Skeleton Layout ──────────────────────────────────────────────
export function FeedSkeleton() {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scrollPadding}
      style={styles.screenBg}
    >
      {/* Search Bar */}
      <ShimmerBox width="100%" height={44} borderRadius={12} style={{ marginBottom: 16 }} />

      {/* Store chips */}
      <View style={styles.chipRow}>
        {[80, 70, 65, 60, 95].map((w, i) => (
          <ShimmerBox key={i} width={w} height={32} borderRadius={RADIUS.pill} />
        ))}
      </View>

      {/* Category chips */}
      <View style={[styles.chipRow, { marginTop: 10, marginBottom: 20 }]}>
        {[55, 75, 65, 60, 85].map((w, i) => (
          <ShimmerBox key={i} width={w} height={28} borderRadius={RADIUS.xs} />
        ))}
      </View>

      {/* Banner Skeletons (enough to fill screen) */}
      {[1, 2, 3, 4].map((key) => (
        <View key={key} style={{ marginBottom: 18 }}>
          <ShimmerBox width="100%" height={148} borderRadius={16} />
          <View style={[styles.rowBetween, { marginTop: 8, paddingHorizontal: 4 }]}>
            <ShimmerBox width={120} height={12} borderRadius={4} />
            <ShimmerBox width={70} height={12} borderRadius={4} />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

// ─── Vault Screen Skeleton Layout ─────────────────────────────────────────────
export function VaultSkeleton() {
  const screenWidth = Dimensions.get('window').width;
  const colWidth = (screenWidth - 48) / 2;

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scrollPadding}
      style={styles.screenBg}
    >
      {/* Money Saved Header */}
      <ShimmerBox width={100} height={14} borderRadius={4} />
      <ShimmerBox width={180} height={48} borderRadius={8} style={{ marginTop: 8 }} />
      <ShimmerBox width={140} height={16} borderRadius={4} style={{ marginTop: 6, marginBottom: 20 }} />

      {/* Filter chips */}
      <View style={[styles.chipRow, { marginBottom: 20 }]}>
        {[60, 50, 70, 90].map((w, i) => (
          <ShimmerBox key={i} width={w} height={30} borderRadius={RADIUS.pill} />
        ))}
      </View>

      {/* 2-Column Grid */}
      <View style={styles.gridRow}>
        {[1, 2, 3, 4, 5, 6].map((key) => (
          <View key={key} style={{ width: colWidth, marginBottom: 16 }}>
            <ShimmerBox width="100%" height={colWidth * (4 / 3)} borderRadius={14} />
            <ShimmerBox width="85%" height={16} borderRadius={4} style={{ marginTop: 8 }} />
            <ShimmerBox width="50%" height={12} borderRadius={4} style={{ marginTop: 4 }} />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ─── Alerts Screen Skeleton Layout ────────────────────────────────────────────
export function AlertsSkeleton() {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scrollPadding}
      style={styles.screenBg}
    >
      {/* Header */}
      <View style={styles.rowBetween}>
        <ShimmerBox width={140} height={48} borderRadius={8} />
        <ShimmerBox width={50} height={20} borderRadius={4} />
      </View>

      {/* Filter chips */}
      <View style={[styles.chipRow, { marginTop: 20, marginBottom: 24 }]}>
        {[50, 80, 70, 95].map((w, i) => (
          <ShimmerBox key={i} width={w} height={30} borderRadius={RADIUS.pill} />
        ))}
      </View>

      {/* Alert list rows */}
      {[1, 2, 3, 4, 5, 6].map((key) => (
        <View key={key} style={styles.alertRowSkeleton}>
          <View style={styles.rowBetween}>
            <ShimmerBox width={100} height={12} borderRadius={4} />
            <ShimmerBox width={60} height={12} borderRadius={4} />
          </View>
          <ShimmerBox width="75%" height={18} borderRadius={4} style={{ marginTop: 8 }} />
          <ShimmerBox width="95%" height={14} borderRadius={4} style={{ marginTop: 6 }} />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screenBg: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scrollPadding: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 120,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  statCol: {
    flex: 1,
  },
  colDivided: {
    borderLeftWidth: 1,
    borderLeftColor: '#1C1C1E',
    paddingLeft: 12,
  },
  heroBlock: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: 20,
    overflow: 'hidden',
  },
  posterRow: {
    flexDirection: 'row',
    gap: 12,
  },
  posterSkeleton: {
    width: 146,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  gridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  alertRowSkeleton: {
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
});
