import React from 'react';
import { StyleSheet, Text, View, Animated } from 'react-native';
import { COLORS, FONTS } from '../theme/theme';
import { useCountdown } from '../utils/useCountdown';

interface CountdownClockProps {
  endDate?: string | null;
  startDate?: string | null;
  size?: 'sm' | 'md' | 'lg';
}

export default function CountdownClock({ endDate, startDate, size = 'md' }: CountdownClockProps) {
  const {
    d,
    h,
    m,
    s,
    progress,
    isInfinite,
    isExpired,
    urgency,
    numeralColor,
    hairlineColor,
    showEndingNow,
    secondsOpacity,
  } = useCountdown(endDate, startDate);

  const numFontSize = size === 'lg' ? 64 : size === 'md' ? 44 : 30;
  const numLineHeight = size === 'lg' ? 68 : size === 'md' ? 50 : 36;

  if (isInfinite) {
    return (
      <View style={styles.container}>
        <View style={styles.infinityContainer}>
          <Text style={[styles.infinitySymbol, { fontSize: numFontSize * 1.25 }]}>∞</Text>
          <View style={styles.infinityInfo}>
            <Text style={styles.infinityTitle}>PERMANENT DROP</Text>
            <Text style={styles.infinitySubtitle}>No Expiry · Keep Forever</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Small mono uppercase "ENDING NOW" label in urgent color above timer */}
      {showEndingNow && !isExpired && (
        <View style={styles.endingNowRow}>
          <Text style={styles.endingNowLabel}>ENDING NOW</Text>
        </View>
      )}

      <View style={styles.grid}>
        <View style={styles.col}>
          <Text
            style={[
              styles.num,
              { fontSize: numFontSize, lineHeight: numLineHeight, color: numeralColor },
            ]}
          >
            {d}
          </Text>
          <Text style={styles.unit}>days</Text>
        </View>
        <View style={styles.col}>
          <Text
            style={[
              styles.num,
              { fontSize: numFontSize, lineHeight: numLineHeight, color: numeralColor },
            ]}
          >
            {h}
          </Text>
          <Text style={styles.unit}>hrs</Text>
        </View>
        <View style={styles.col}>
          <Text
            style={[
              styles.num,
              { fontSize: numFontSize, lineHeight: numLineHeight, color: numeralColor },
            ]}
          >
            {m}
          </Text>
          <Text style={styles.unit}>min</Text>
        </View>
        <View style={styles.col}>
          {urgency === 'under1h' && !isExpired ? (
            <Animated.Text
              style={[
                styles.num,
                {
                  fontSize: numFontSize,
                  lineHeight: numLineHeight,
                  color: numeralColor,
                  opacity: secondsOpacity,
                },
              ]}
            >
              {s}
            </Animated.Text>
          ) : (
            <Text
              style={[
                styles.num,
                { fontSize: numFontSize, lineHeight: numLineHeight, color: numeralColor },
              ]}
            >
              {s}
            </Text>
          )}
          <Text style={styles.unit}>sec</Text>
        </View>
      </View>

      {/* Hairline progress bar */}
      <View style={styles.bar}>
        <View
          style={[
            styles.barFill,
            {
              width: `${progress}%`,
              backgroundColor: hairlineColor,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
  },
  endingNowRow: {
    marginBottom: 6,
  },
  endingNowLabel: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.warning, // #FF9D7A urgent color
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  grid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  col: {
    flex: 1,
  },
  num: {
    fontFamily: FONTS.serif,
    letterSpacing: -1.5,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    marginTop: 4,
    fontFamily: FONTS.mono,
    fontSize: 10.5,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: COLORS.textMuted,
  },
  bar: {
    height: 6,
    backgroundColor: '#1C1C1E',
    borderRadius: 3,
    marginTop: 14,
    position: 'relative',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  infinityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 2,
  },
  infinitySymbol: {
    fontFamily: FONTS.serif,
    color: COLORS.accent,
    lineHeight: 52,
    letterSpacing: -2,
    includeFontPadding: false,
  },
  infinityInfo: {
    justifyContent: 'center',
  },
  infinityTitle: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: 1.5,
  },
  infinitySubtitle: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
    letterSpacing: 0.2,
  },
});
