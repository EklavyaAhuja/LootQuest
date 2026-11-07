import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Animated, Easing } from 'react-native';
import { FONTS } from '../theme/theme';

interface MonospacePullTickerProps {
  /** Vertical pull distance in pixels (0 to ~80) */
  pullDistance: number;
  /** Whether deals are currently syncing */
  isSyncing: boolean;
  /** Whether sync completed in the last couple seconds */
  isSyncedJustNow?: boolean;
}

const TOTAL_SEGMENTS = 8;
const PULL_THRESHOLD = 65;

export default function MonospacePullTicker({
  pullDistance,
  isSyncing,
  isSyncedJustNow = false,
}: MonospacePullTickerProps) {
  const [scanStep, setScanStep] = useState(0);
  const scanDirectionRef = useRef(1);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Scanner animation loop while syncing
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isSyncing) {
      timer = setInterval(() => {
        setScanStep((prev) => {
          let next = prev + scanDirectionRef.current;
          if (next >= TOTAL_SEGMENTS - 2) {
            scanDirectionRef.current = -1;
            next = TOTAL_SEGMENTS - 2;
          } else if (next <= 0) {
            scanDirectionRef.current = 1;
            next = 0;
          }
          return next;
        });
      }, 90);
    } else {
      setScanStep(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isSyncing]);

  // Fade / visibility animation
  const isVisible = pullDistance > 10 || isSyncing || isSyncedJustNow;
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: isVisible ? 1 : 0,
      duration: isVisible ? 120 : 200,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [isVisible, fadeAnim]);

  // Generate the bracket segments
  let displayText = '';
  if (isSyncedJustNow && !isSyncing) {
    displayText = 'ALL DEALS FRESH';
  } else if (isSyncing) {
    const chars = Array(TOTAL_SEGMENTS).fill('·');
    chars[scanStep] = '■';
    if (scanStep + 1 < TOTAL_SEGMENTS) chars[scanStep + 1] = '■';
    displayText = `SYNCING  [ ${chars.join(' ')} ]`;
  } else {
    const progress = Math.min(1, Math.max(0, pullDistance / PULL_THRESHOLD));
    const filledCount = Math.floor(progress * TOTAL_SEGMENTS);
    const chars = Array(TOTAL_SEGMENTS)
      .fill('·')
      .map((dot, i) => (i < filledCount ? '■' : dot));
    const prefix = progress >= 1 ? 'RELEASE' : 'PULL';
    displayText = `${prefix}  [ ${chars.join(' ')} ]`;
  }

  if (!isVisible) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [
            {
              translateY: fadeAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-6, 0],
              }),
            },
          ],
        },
      ]}
      pointerEvents="none"
    >
      <View style={styles.tickerPill}>
        <View
          style={[
            styles.dot,
            isSyncing && styles.dotSyncing,
            isSyncedJustNow && styles.dotSuccess,
          ]}
        />
        <Text style={styles.tickerText}>{displayText}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    zIndex: 999,
  },
  tickerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0A0A0C',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    gap: 8,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#86868B',
  },
  dotSyncing: {
    backgroundColor: '#EDEDEB',
  },
  dotSuccess: {
    backgroundColor: '#34C759',
  },
  tickerText: {
    fontFamily: FONTS.mono,
    fontSize: 10.5,
    color: '#EDEDEB',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});
