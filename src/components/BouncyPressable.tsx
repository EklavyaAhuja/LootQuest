import React, { useRef } from 'react';
import { Pressable, StyleSheet, View, Animated, ViewStyle, StyleProp } from 'react-native';
import { COLORS } from '../theme/theme';

interface BouncyPressableProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  shadowColor?: string;
  shadowOffsetSize?: number;
  backgroundColor?: string;
  disabled?: boolean;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
}

export default function BouncyPressable({
  children,
  onPress,
  style,
  contentStyle,
  shadowColor = COLORS.shadow,
  shadowOffsetSize = 5,
  backgroundColor = COLORS.white,
  disabled = false,
  borderRadius = 16,
  borderWidth = 3,
  borderColor = COLORS.border,
}: BouncyPressableProps) {
  const animatedValue = useRef(new Animated.Value(0)).current;

  const handlePressIn = () => {
    if (disabled) return;
    Animated.timing(animatedValue, {
      toValue: 1,
      duration: 60,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    if (disabled) return;
    Animated.timing(animatedValue, {
      toValue: 0,
      duration: 100,
      useNativeDriver: true,
    }).start();
  };

  // Translate the card down-right to cover the shadow
  const translateX = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, shadowOffsetSize],
  });

  const translateY = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, shadowOffsetSize],
  });

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={style}
    >
      <View style={styles.wrapper}>
        {/* 1. The Shadow Box in the Back */}
        <View
          style={[
            styles.shadow,
            {
              backgroundColor: shadowColor,
              borderRadius: borderRadius,
              borderWidth: borderWidth,
              borderColor: borderColor,
              // Offset size matches the animation translation
              top: shadowOffsetSize,
              left: shadowOffsetSize,
              right: -shadowOffsetSize,
              bottom: -shadowOffsetSize,
            },
          ]}
        />

        {/* 2. The Animated Card Content in the Front */}
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: backgroundColor,
              borderRadius: borderRadius,
              borderWidth: borderWidth,
              borderColor: borderColor,
              transform: [{ translateX }, { translateY }],
            },
            contentStyle,
          ]}
        >
          {children}
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  shadow: {
    position: 'absolute',
  },
  card: {
    // Normal container layout
    overflow: 'hidden',
  },
});
