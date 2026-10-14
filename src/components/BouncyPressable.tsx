import React, { useRef } from 'react';
import { Pressable, StyleSheet, View, Animated, ViewStyle, StyleProp } from 'react-native';
import { COLORS, RADIUS, SHADOWS } from '../theme/theme';

interface BouncyPressableProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  backgroundColor?: string;
  disabled?: boolean;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
}

const BouncyPressable = React.memo(function BouncyPressable({
  children,
  onPress,
  style,
  contentStyle,
  backgroundColor = COLORS.bgCard,
  disabled = false,
  borderRadius = RADIUS.md,
  borderWidth = 1,
  borderColor = COLORS.border,
}: BouncyPressableProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (disabled) return;
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      friction: 6,
      tension: 100,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    if (disabled) return;
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 5,
      tension: 90,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={style}
    >
      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor,
            borderRadius,
            borderWidth,
            borderColor,
            transform: [{ scale: scaleAnim }],
            ...SHADOWS.card,
          },
          contentStyle,
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
});

export default BouncyPressable;

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
