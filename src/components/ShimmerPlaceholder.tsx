import React, { useEffect, useRef } from 'react';
import { Animated, Easing, ViewStyle, StyleProp } from 'react-native';
import { LinearGradient } from './LinearGradient';
import { COLORS } from '../theme/theme';

interface ShimmerPlaceholderProps {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  shimmerColors?: string[];
}

export default function ShimmerPlaceholder({
  width,
  height,
  borderRadius = 8,
  style,
  shimmerColors = ['#1C1C22', '#32323A', '#1C1C22'],
}: ShimmerPlaceholderProps) {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const shimmer = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    );
    shimmer.start();
    return () => shimmer.stop();
  }, [shimmerAnim]);

  const translateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-200, 200],
  });

  return (
    <Animated.View
      style={[
        {
          width: width as number | '100%',
          height,
          borderRadius,
          overflow: 'hidden',
          backgroundColor: '#1E1E24',
        },
        style,
      ]}
    >
      <Animated.View
        style={{
          flex: 1,
          borderRadius,
          overflow: 'hidden',
        }}
      >
        <LinearGradient
          colors={['#1E1E24', '#2C2C34', '#1E1E24']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1, borderRadius }}
        />
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            transform: [{ translateX }],
            opacity: 0.7,
          }}
        >
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.18)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

export function SkeletonHeroShimmer() {
  return (
    <ShimmerPlaceholder
      width="100%"
      height={280}
      borderRadius={16}
    />
  );
}

export function SkeletonCardShimmer({ index }: { index: number }) {
  return (
    <Animated.View
      style={{
        flexDirection: 'row',
        marginBottom: 12,
        backgroundColor: COLORS.bgCard,
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: COLORS.border,
      }}
    >
      <ShimmerPlaceholder width={90} height={90} borderRadius={0} />
      <Animated.View style={{ flex: 1, padding: 12, justifyContent: 'center', gap: 8 }}>
        <ShimmerPlaceholder width={80} height={14} borderRadius={4} />
        <ShimmerPlaceholder width="80%" height={16} borderRadius={4} />
        <ShimmerPlaceholder width="50%" height={12} borderRadius={4} />
      </Animated.View>
    </Animated.View>
  );
}

export function SkeletonChipsShimmer() {
  return (
    <Animated.View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginBottom: 20 }}>
      {[80, 90, 100, 80].map((w, i) => (
        <ShimmerPlaceholder key={i} width={w} height={36} borderRadius={999} />
      ))}
    </Animated.View>
  );
}
