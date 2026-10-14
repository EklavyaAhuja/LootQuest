import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { LinearGradient } from './LinearGradient';
import { COLORS, RADIUS, SHADOWS } from '../theme/theme';

interface CartoonCardProps {
  children: React.ReactNode;
  platformColor?: string;
  statusGlow?: 'high' | 'urgent' | 'none';
  style?: StyleProp<ViewStyle>;
}

export default function CartoonCard({
  children,
  platformColor = COLORS.border,
  statusGlow = 'none',
  style,
}: CartoonCardProps) {
  const getGlow = () => {
    switch (statusGlow) {
      case 'high':
        return COLORS.primary;
      case 'urgent':
        return COLORS.warning;
      default:
        return 'transparent';
    }
  };

  const glowColor = getGlow();

  return (
    <View
      style={[
        styles.card,
        { borderColor: statusGlow !== 'none' ? glowColor : platformColor },
        statusGlow !== 'none' && {
          shadowColor: glowColor,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 10,
          elevation: 4,
        },
        style,
      ]}
    >
      <LinearGradient
        colors={[COLORS.bgCard, '#151923']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={styles.fill}
      >
        {children}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  fill: {
    flex: 1,
  },
});
