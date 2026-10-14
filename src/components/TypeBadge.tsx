import React from 'react';
import { StyleSheet, Text, View, StyleProp, ViewStyle } from 'react-native';
import { FONTS, COLORS } from '../theme/theme';
import { Deal } from '../models/Deal';

interface TypeBadgeProps {
  type?: Deal['type'] | string;
  style?: StyleProp<ViewStyle>;
  size?: 'sm' | 'md';
}

export default function TypeBadge({ type = 'full_game', style, size = 'sm' }: TypeBadgeProps) {
  const t = (type || 'full_game').toLowerCase();

  let label = 'GAME';
  let isDashed = false;

  if (t === 'dlc') {
    label = 'DLC';
  } else if (t === 'beta') {
    label = 'BETA';
    isDashed = true;
  } else {
    label = 'GAME';
  }

  const isSmall = size === 'sm';

  return (
    <View
      style={[
        styles.badge,
        isDashed && styles.dashedBadge,
        isSmall ? styles.badgeSm : styles.badgeMd,
        style,
      ]}
    >
      <Text style={[styles.text, isSmall ? styles.textSm : styles.textMd]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashedBadge: {
    borderStyle: 'dashed',
  },
  badgeSm: {
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  badgeMd: {
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  text: {
    fontFamily: FONTS.mono,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  textSm: {
    fontSize: 9,
    lineHeight: 11,
  },
  textMd: {
    fontSize: 10,
    lineHeight: 13,
  },
});
