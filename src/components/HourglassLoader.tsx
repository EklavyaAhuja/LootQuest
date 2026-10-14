import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Animated, Easing } from 'react-native';
import { LinearGradient } from './LinearGradient';
import { COLORS } from '../theme/theme';

export default function HourglassLoader() {
  const spin = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const spinLoop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 2400,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    const breatheLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1.06,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    spinLoop.start();
    glowLoop.start();
    breatheLoop.start();
    return () => {
      spinLoop.stop();
      glowLoop.stop();
      breatheLoop.stop();
    };
  }, [spin, glow, breathe]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const opacity = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.25, 0.6],
  });

  return (
    <View style={styles.container}>
      {/* Halo */}
      <Animated.View
        style={[
          styles.halo,
          {
            opacity,
            transform: [{ scale: breathe }],
          },
        ]}
      />
      {/* Orbiting ring */}
      <Animated.View style={[styles.ring, { transform: [{ rotate }] }]}>
        <View style={styles.ringDot} />
      </Animated.View>
      {/* Core orb */}
      <Animated.View style={[styles.orbWrap, { transform: [{ scale: breathe }] }]}>
        <LinearGradient
          colors={[COLORS.auroraIndigo, COLORS.auroraViolet, COLORS.auroraBlue]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.orb}
        >
          <LinearGradient
            colors={[COLORS.auroraTeal, 'transparent']}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.orbSheen}
          />
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 120,
    height: 120,
  },
  halo: {
    position: 'absolute',
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: COLORS.auroraIndigo,
  },
  ring: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    borderColor: 'rgba(162, 155, 254, 0.4)',
    borderTopColor: COLORS.auroraTeal,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  ringDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: -4,
    backgroundColor: COLORS.auroraTeal,
  },
  orbWrap: {
    width: 64,
    height: 64,
  },
  orb: {
    flex: 1,
    borderRadius: 32,
    overflow: 'hidden',
  },
  orbSheen: {
    ...StyleSheet.absoluteFillObject,
  },
});
