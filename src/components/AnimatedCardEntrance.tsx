import React, { useRef, useEffect } from 'react';
import { Animated, StyleProp, ViewStyle, Easing } from 'react-native';

interface AnimatedCardEntranceProps {
  index: number;
  reduceMotion?: boolean;
  enabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * List entrance animation (Part 2 Item b):
 * First-launch only (or pull-to-refresh), initial cards rise 16 px and fade in
 * with 60 ms stagger across the first 8 cards (420 ms total per card, bezier(0.22, 1, 0.36, 1)).
 * Cards beyond the fold render normally without animation to save battery and frames.
 * Respects reduceMotion (replaces with 100 ms fade, no move).
 */
export default function AnimatedCardEntrance({
  index,
  reduceMotion = false,
  enabled = true,
  style,
  children,
}: AnimatedCardEntranceProps) {
  const shouldAnimate = enabled && index < 8;
  const anim = useRef(new Animated.Value(shouldAnimate ? 0 : 1)).current;

  useEffect(() => {
    if (!shouldAnimate) return;

    if (reduceMotion) {
      Animated.timing(anim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }).start();
      return;
    }

    const delay = index * 40;
    const timer = setTimeout(() => {
      Animated.timing(anim, {
        toValue: 1,
        duration: 120,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }, delay);

    return () => clearTimeout(timer);
  }, [shouldAnimate, reduceMotion, index, anim]);

  if (!shouldAnimate) {
    return <>{children}</>;
  }

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 0],
  });

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: anim,
          transform: [{ translateY: reduceMotion ? 0 : translateY }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
