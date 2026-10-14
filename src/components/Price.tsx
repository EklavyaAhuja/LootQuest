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
    return { priceText: '$5.00', estimated: true };
  }
  const clean = worth.trim();
  const hasDollar = clean.startsWith('$');
  const num = parseFloat(clean.replace('$', ''));
  if (isNaN(num) || num <= 0) {
    return { priceText: '$5.00', estimated: true };
  }
  return { priceText: hasDollar ? clean : `$${clean}`, estimated: false };
}

export function Price({ worth, isEstimated: propIsEstimated, size = 'md', style }: PriceProps) {
  const { priceText, estimated } = formatRetailPrice(worth);
  const isEstimated = propIsEstimated ?? estimated;

  const fontSizes = {
    sm: { retail: 11, free: 11 },
    md: { retail: 13, free: 13 },
    lg: { retail: 16, free: 16 },
  }[size];

  return (
    <View style={[styles.container, style]}>
      <Text
        style={[
          styles.retail,
          { fontSize: fontSizes.retail },
        ]}
        numberOfLines={1}
      >
        {priceText}
      </Text>
      <Text style={[styles.arrow, { fontSize: fontSizes.retail }]}> → </Text>
      <Text style={[styles.free, { fontSize: fontSizes.free }]} numberOfLines={1}>
        FREE
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  retail: {
    fontFamily: FONTS.monoRegular,
    color: '#86868B',
    textDecorationLine: 'line-through',
  },
  arrow: {
    fontFamily: FONTS.monoRegular,
    color: '#86868B',
  },
  free: {
    fontFamily: FONTS.mono,
    fontWeight: '700',
    color: '#EDEDEB',
    letterSpacing: 0.5,
  },
});

export default Price;
