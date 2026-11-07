import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FONTS } from '../theme/theme';
import { useCountdown } from '../utils/useCountdown';

interface CountdownClockProps {
  endDate?: string | null;
  startDate?: string | null;
  size?: 'sm' | 'md' | 'lg';
  alignCenter?: boolean;
}

export default function CountdownClock({
  endDate,
  startDate,
  size = 'md',
  alignCenter = false,
}: CountdownClockProps) {
  const isDetail = size === 'lg';
  const shouldCenter = Boolean(alignCenter);

  const {
    d,
    h,
    m,
    s,
    progress,
    isInfinite,
    isExpired,
    numeralColor,
    hairlineColor,
    showEndingNow,
  } = useCountdown(endDate, startDate, isDetail);

  if (isExpired) {
    return null; // Hide countdown when ended
  }

  if (isInfinite) {
    return (
      <View style={[styles.permanentWrap, shouldCenter && { alignItems: 'center' }]}>
        <Text style={[styles.permanentText, shouldCenter && { textAlign: 'center' }]}>
          No expiry · Permanent drop
        </Text>
      </View>
    );
  }

  const numFontSize = isDetail ? 25 : size === 'md' ? 15 : 13;
  const numLineHeight = isDetail ? 30 : size === 'md' ? 18 : 16;
  const unitFontSize = isDetail ? 11 : size === 'md' ? 9 : 8;
  const numFontFamily = isDetail ? FONTS.semiBold : FONTS.medium;
  const gridGap = isDetail ? 16 : 10;
  const colGap = isDetail ? 3 : 1.5;

  const showDays = Number(d) > 0;
  const showSeconds = isDetail;

  return (
    <View style={styles.container}>
      {/* Small uppercase "ENDING NOW" label in urgent color on non-detail views */}
      {showEndingNow && !isDetail && (
        <View style={[styles.endingNowRow, shouldCenter && { alignItems: 'center' }]}>
          <Text style={styles.endingNowLabel}>ENDING NOW</Text>
        </View>
      )}

      <View style={[styles.grid, { gap: gridGap }, shouldCenter && { justifyContent: 'center' }]}>
        {showDays && (
          <View style={[styles.col, { gap: colGap }]}>
            <Text
              style={[
                styles.num,
                { fontSize: numFontSize, lineHeight: numLineHeight, color: numeralColor, fontFamily: numFontFamily },
                isDetail && { minWidth: 33 },
              ]}
            >
              {d}
            </Text>
            <Text style={[styles.unit, { fontSize: unitFontSize }]}>d</Text>
          </View>
        )}

        <View style={[styles.col, { gap: colGap }]}>
          <Text
            style={[
              styles.num,
              { fontSize: numFontSize, lineHeight: numLineHeight, color: numeralColor, fontFamily: numFontFamily },
              isDetail && { minWidth: 33 },
            ]}
          >
            {h}
          </Text>
          <Text style={[styles.unit, { fontSize: unitFontSize }]}>h</Text>
        </View>

        <View style={[styles.col, { gap: colGap }]}>
          <Text
            style={[
              styles.num,
              { fontSize: numFontSize, lineHeight: numLineHeight, color: numeralColor, fontFamily: numFontFamily },
              isDetail && { minWidth: 33 },
            ]}
          >
            {m}
          </Text>
          <Text style={[styles.unit, { fontSize: unitFontSize }]}>m</Text>
        </View>

        {showSeconds && (
          <View style={[styles.col, { gap: colGap }]}>
            <Text
              style={[
                styles.num,
                {
                  fontSize: numFontSize,
                  lineHeight: numLineHeight,
                  color: numeralColor,
                  fontFamily: numFontFamily,
                },
                isDetail && { minWidth: 33 },
              ]}
            >
              {s}
            </Text>
            <Text style={[styles.unit, { fontSize: unitFontSize }]}>s</Text>
          </View>
        )}
      </View>

      {/* Progress line below: thicker, clearly brighter than background, balanced spacing */}
      <View
        style={[
          styles.bar,
          isDetail && {
            height: 2.5,
            marginTop: 12,
            marginBottom: 12,
            backgroundColor: 'rgba(255, 255, 255, 0.16)',
          },
        ]}
      >
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
    marginVertical: 4,
  },
  permanentWrap: {
    paddingVertical: 4,
  },
  permanentText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: '#8E8E93',
    letterSpacing: 0.2,
  },
  endingNowRow: {
    marginBottom: 4,
  },
  endingNowLabel: {
    fontFamily: FONTS.bold,
    fontSize: 10,
    color: '#FF8A5B', // urgent orange
    letterSpacing: 0.2,
  },
  grid: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  col: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  num: {
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  unit: {
    fontFamily: FONTS.regular,
    letterSpacing: 0.2,
    textTransform: 'lowercase',
    color: '#8E8E93',
    marginLeft: 1.5,
  },
  bar: {
    height: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 1,
    marginTop: 8,
    position: 'relative',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 1,
  },
});
