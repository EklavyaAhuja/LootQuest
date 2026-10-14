import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View, StyleSheet, Dimensions } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ConfettiPiece {
  x: Animated.Value;
  y: Animated.Value;
  rotate: Animated.Value;
  opacity: Animated.Value;
  color: string;
  size: number;
  delay: number;
}

const COLORS = ['#6C5CE7', '#00D2A0', '#A29BFE', '#FF6B6B', '#3B82F6', '#8B5CF6'];

export default function Confetti({ onComplete }: { onComplete?: () => void }) {
  const pieces = useRef<ConfettiPiece[]>(
    Array.from({ length: 24 }, (_, i) => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      rotate: new Animated.Value(0),
      opacity: new Animated.Value(1),
      color: COLORS[i % COLORS.length],
      size: 6 + Math.random() * 8,
      delay: Math.random() * 200,
    }))
  ).current;

  useEffect(() => {
    const animations = pieces.map((piece) => {
      const angle = (Math.random() - 0.5) * 120;
      const distance = 60 + Math.random() * 100;
      const duration = 600 + Math.random() * 400;

      return Animated.parallel([
        Animated.timing(piece.x, {
          toValue: Math.cos(angle * Math.PI / 180) * distance,
          duration,
          delay: piece.delay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(piece.y, {
          toValue: Math.sin(angle * Math.PI / 180) * distance - 80,
          duration,
          delay: piece.delay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(piece.rotate, {
          toValue: Math.random() * 720 - 360,
          duration,
          delay: piece.delay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(piece.opacity, {
          toValue: 0,
          duration: duration * 0.6,
          delay: piece.delay + duration * 0.4,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]);
    });

    Animated.parallel(animations).start(() => {
      onComplete?.();
    });
  }, []);

  return (
    <View style={styles.container} pointerEvents="none">
      {pieces.map((piece, i) => (
        <Animated.View
          key={i}
          style={[
            styles.piece,
            {
              width: piece.size,
              height: piece.size * 0.6,
              backgroundColor: piece.color,
              borderRadius: 2,
              opacity: piece.opacity,
              transform: [
                { translateX: piece.x },
                { translateY: piece.y },
                { rotate: piece.rotate.interpolate({
                  inputRange: [0, 360],
                  outputRange: ['0deg', '360deg'],
                })},
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: '40%',
    left: SCREEN_WIDTH / 2 - 20,
    width: 40,
    height: 40,
    zIndex: 9999,
  },
  piece: {
    position: 'absolute',
  },
});
