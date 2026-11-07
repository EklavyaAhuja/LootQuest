import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Animated, Easing, Dimensions, Platform } from 'react-native';
import { COLORS } from '../theme/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface AnimatedSyncHairlineProps {
  active: boolean;
}

export default function AnimatedSyncHairline({ active }: AnimatedSyncHairlineProps) {
  const sweepAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [visible, setVisible] = useState(active);

  useEffect(() => {
    let sweepLoop: Animated.CompositeAnimation | null = null;
    let pulseLoop: Animated.CompositeAnimation | null = null;

    if (active) {
      setVisible(true);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();

      sweepAnim.setValue(0);
      sweepLoop = Animated.loop(
        Animated.timing(sweepAnim, {
          toValue: 1,
          duration: 1100,
          easing: Easing.bezier(0.4, 0, 0.2, 1),
          useNativeDriver: true,
        })
      );
      sweepLoop.start();

      pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.9,
            duration: 550,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.3,
            duration: 550,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoop.start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }).start(() => {
        sweepAnim.setValue(0);
        setVisible(false);
      });
    }

    return () => {
      sweepLoop?.stop();
      pulseLoop?.stop();
    };
  }, [active, fadeAnim, sweepAnim, pulseAnim]);

  if (!visible) return null;

  const beamWidth = SCREEN_WIDTH * 0.45;
  const translateX = sweepAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-beamWidth, SCREEN_WIDTH + beamWidth * 0.2],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.container, { opacity: fadeAnim }]}
    >
      {/* Subtle ambient radar background track */}
      <Animated.View style={[styles.trackGlow, { opacity: pulseAnim }]} />
      {/* Fast glowing laser sweep */}
      <Animated.View
        style={[
          styles.sweepBeam,
          {
            width: beamWidth,
            transform: [{ translateX }],
          },
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    zIndex: 9999,
    overflow: 'hidden',
  },
  trackGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: 'rgba(216, 255, 158, 0.25)',
  },
  sweepBeam: {
    height: 3,
    backgroundColor: COLORS.accent,
    borderRadius: 2,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.95,
    shadowRadius: 6,
    elevation: 8,
  },
});
