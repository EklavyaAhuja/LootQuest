import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Animated, Easing } from 'react-native';

export default function HourglassLoader() {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const startAnimation = () => {
      anim.setValue(0);
      Animated.loop(
        Animated.timing(anim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    };

    startAnimation();
  }, [anim]);

  // Rotation: 0 to 180 degrees between 80% and 100% of the timeline (0.8 to 1.0)
  const rotate = anim.interpolate({
    inputRange: [0, 0.8, 1],
    outputRange: ['0deg', '0deg', '180deg'],
  });

  // Top sand translation: empties downwards (translates from 0 to 30)
  const topSandTranslateY = anim.interpolate({
    inputRange: [0, 0.8, 1],
    outputRange: [0, 30, 30],
  });

  // Bottom sand translation: fills upwards (translates from 30 to 0)
  const bottomSandTranslateY = anim.interpolate({
    inputRange: [0, 0.8, 1],
    outputRange: [30, 0, 0],
  });

  // Stream opacity: visible during flow (0.0 to 0.8), hidden during rotation (0.8 to 1.0)
  const streamOpacity = anim.interpolate({
    inputRange: [0, 0.05, 0.75, 0.8, 1],
    outputRange: [0, 1, 1, 0, 0],
  });

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.hourglass, { transform: [{ rotate }] }]}>
        {/* Top Flat Frame */}
        <View style={styles.flatFrame} />

        {/* Top Bulb */}
        <View style={styles.topBulb}>
          <Animated.View
            style={[
              styles.sand,
              { transform: [{ translateY: topSandTranslateY }] },
            ]}
          />
        </View>

        {/* Middle Stream Connector */}
        <View style={styles.middleConnector}>
          <Animated.View style={[styles.stream, { opacity: streamOpacity }]} />
        </View>

        {/* Bottom Bulb */}
        <View style={styles.bottomBulb}>
          <Animated.View
            style={[
              styles.sand,
              { transform: [{ translateY: bottomSandTranslateY }] },
            ]}
          />
        </View>

        {/* Bottom Flat Frame */}
        <View style={styles.flatFrame} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
  },
  hourglass: {
    width: 44,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flatFrame: {
    width: 38,
    height: 4,
    backgroundColor: '#673b14',
    borderRadius: 2,
  },
  topBulb: {
    width: 32,
    height: 30,
    borderWidth: 2,
    borderColor: '#673b14',
    borderTopWidth: 0,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  bottomBulb: {
    width: 32,
    height: 30,
    borderWidth: 2,
    borderColor: '#673b14',
    borderBottomWidth: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  sand: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f8b13b',
  },
  middleConnector: {
    width: 8,
    height: 12,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stream: {
    width: 2,
    height: '100%',
    backgroundColor: '#f8b13b',
  },
});
