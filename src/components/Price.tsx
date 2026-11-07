import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { COLORS, FONTS } from '../theme/theme';

export interface PriceProps {
  worth?: string;
  isEstimated?: boolean;
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
}

export function formatRetailPrice(worth?: string): { priceText: string; estimated: boolean } {
  if (!worth || worth === 'N/A' || worth.trim() === '' || worth === '$0' || worth === '0') {
    return { priceText: '', estimated: false };
  }
  const clean = worth.trim();
  const hasDollar = clean.startsWith('$');
  const num = parseFloat(clean.replace('$', ''));
  if (isNaN(num) || num <= 0) {
    return { priceText: '', estimated: false };
  }
  return { priceText: hasDollar ? clean : `$${clean}`, estimated: false };
}

export function Price({ worth, isEstimated: propIsEstimated, size = 'md', style }: PriceProps) {
  const { priceText, estimated } = formatRetailPrice(worth);
  const isEstimated = propIsEstimated ?? estimated;

  const hasKnownRetail = !isEstimated && Boolean(priceText) && priceText !== '$0';

  if (size === 'lg') {
    // Detail Page Hero Value block: struck-through retail price next to large FREE (white & gray only)
    return (
      <View style={[styles.detailContainer, style]}>
        <View style={styles.detailPriceRow}>
          {hasKnownRetail && (
            <Text style={styles.detailStruckPrice}>
              {priceText}
            </Text>
          )}
          <Text style={styles.detailFreeText}>FREE</Text>
        </View>
      </View>
    );
  }

  const fontSizes = {
    sm: 11,
    md: 13,
    lg: 16,
  }[size];

  if (!hasKnownRetail) {
    return (
      <View style={[styles.container, style]}>
        <Text style={[styles.freeOnlyText, { fontSize: fontSizes }]}>FREE</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <Text style={[styles.saveText, { fontSize: fontSizes }]} numberOfLines={1}>
        Save {priceText}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  saveText: {
    fontFamily: FONTS.bold,
    color: '#EDEDEB',
    letterSpacing: 0.2,
    fontVariant: ['tabular-nums'],
  },
  freeOnlyText: {
    fontFamily: FONTS.extraBold,
    color: '#EDEDEB',
    letterSpacing: 0.5,
  },
  detailContainer: {
    marginTop: 0,
    marginBottom: 0,
  },
  detailPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  detailStruckPrice: {
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: '#8E8E93',
    textDecorationLine: 'line-through',
    fontVariant: ['tabular-nums'],
  },
  detailFreeText: {
    fontFamily: FONTS.extraBold,
    fontSize: 24,
    color: '#EDEDEB',
    letterSpacing: -0.3,
  },
});

export default Price;
