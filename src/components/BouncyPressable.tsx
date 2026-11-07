import React, { useRef } from 'react';
import { Pressable, StyleSheet, View, Animated, Easing, ViewStyle, StyleProp } from 'react-native';
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
    Animated.timing(scaleAnim, {
      toValue: 0.96,
      duration: 70, // 60-80ms in
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    if (disabled) return;
    Animated.spring(scaleAnim, {
      toValue: 1,
      stiffness: 500,
      damping: 30,
      mass: 0.8,
      overshootClamping: true, // overshoot clamped
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
