import React from 'react';
import { StyleSheet, Text, View, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { FONTS } from '../theme/theme';
import { Deal } from '../models/Deal';

interface TypeBadgeProps {
  type?: Deal['type'] | string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  size?: 'sm' | 'md';
}

export default function TypeBadge({ type = 'full_game', style, textStyle, size = 'md' }: TypeBadgeProps) {
  const t = (type || 'full_game').toLowerCase();

  let label = 'GAME';
  if (t === 'dlc') {
    label = 'DLC';
  } else if (t === 'beta') {
    label = 'BETA';
  } else if (t === 'loot' || t === 'item') {
    label = 'LOOT';
  } else if (t === 'mobile_game') {
    label = 'MOBILE';
  } else {
    label = 'GAME';
  }

  const isSmall = size === 'sm';

  return (
    <View style={[styles.container, isSmall && styles.containerSm, style]}>
      <Text style={[styles.text, isSmall && styles.textSm, textStyle]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3A3A3D',
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  containerSm: {
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 5,
  },
  text: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    fontWeight: '700',
    color: '#EDEDEB',
    letterSpacing: 0.5,
  },
  textSm: {
    fontSize: 9,
    letterSpacing: 0.4,
  },
});
