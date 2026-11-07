import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  useWindowDimensions,
  Platform,
  LayoutChangeEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withTiming,
  Easing,
  runOnJS,
  cancelAnimation,
  SharedValue,
} from 'react-native-reanimated';
import Svg, { Path, Circle } from 'react-native-svg';
import * as Font from 'expo-font';
import { checkIsReduceMotionEnabled, subscribeToReduceMotion } from '../utils/motion';
import { hapticFeedback } from '../utils/haptics';

interface OpeningAnimationProps {
  onFinish: () => void;
}

const NAME = 'Claimr';
const LETTERS = NAME.split('');
const N = 6; // Number of cycling icons before landing on letter
const TOTAL_SEC = 1.48; // Total deterministic timeline duration in seconds (smooth, deliberate pacing)
const DURATION_MS = 1480; // Total deterministic timeline duration in ms
const P_FIRST = 0.08 / TOTAL_SEC; // ~0.054: reels start spinning
const STOP0_SEC = 0.52; // 520ms first reel landing
const GAP_SEC = 0.10; // 100ms between subsequent reel landings
const BLEED = 24; // Horizontal bleed allowance for icons to overlap neighboring reels

// Unbounded Bold advance width ratios (extracted directly from font hmtx table)
const ADV_RATIOS = [0.934, 0.317, 0.826, 0.317, 1.208, 0.553];
const TRACKING = -0.02;

// 5 White Outline Loot Icons (matching HTML reference SVG paths)
function LootIcon({ type, size }: { type: number; size: number }) {
  const S = {
    fill: 'none',
    stroke: '#FFFFFF',
    strokeWidth: 5,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" style={{ opacity: 0.85 }}>
      {type === 0 && (
        <>
          <Circle cx={32} cy={32} r={22} {...S} />
          <Circle cx={32} cy={32} r={11} {...S} />
        </>
      )}
      {type === 1 && (
        <Path d="M32 8 52 26 32 56 12 26Z M12 26h40" {...S} />
      )}
      {type === 2 && (
        <Path d="M32 8l7 16 17 2-13 12 4 17-15-9-15 9 4-17L8 26l17-2Z" {...S} />
      )}
      {type === 3 && (
        <Path d="M32 54C10 38 8 24 16 16c7-6 13-3 16 3 3-6 9-9 16-3 8 8 6 22-16 38Z" {...S} />
      )}
      {type === 4 && (
        <>
          <Path d="M14 22h36a8 8 0 0 1 8 8l-3 16a6 6 0 0 1-10 3l-5-5H24l-5 5a6 6 0 0 1-10-3L6 30a8 8 0 0 1 8-8Z M20 30v8 M16 34h8" {...S} />
          <Circle cx={42} cy={32} r={1.5} {...S} />
          <Circle cx={48} cy={37} r={1.5} {...S} />
        </>
      )}
    </Svg>
  );
}

// 30 Outlined Coins with stable deterministic specifications
interface CoinSpec {
  id: number;
  sz: number;
  leftRatio: number;
  delaySec: number;
  durSec: number;
  rotation: number;
}

const DETERMINISTIC_COIN_SPECS: CoinSpec[] = (() => {
  const list: CoinSpec[] = [];
  let seed = 42;
  const pseudoRandom = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let i = 0; i < 30; i++) {
    list.push({
      id: i,
      sz: 10 + pseudoRandom() * 12,
      leftRatio: pseudoRandom(),
      delaySec: pseudoRandom() * 0.32,
      durSec: 0.85 + pseudoRandom() * 0.65,
      rotation: 180 + pseudoRandom() * 360,
    });
  }
  return list;
})();

function CoinItem({
  spec,
  stageHeight,
  stageWidth,
  progress,
}: {
  spec: CoinSpec;
  stageHeight: number;
  stageWidth: number;
  progress: SharedValue<number>;
}) {
  const coinStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const pStart = (1.02 + spec.delaySec * 0.30) / TOTAL_SEC;
    const pEnd = pStart + (spec.durSec * 0.35) / TOTAL_SEC;
    if (p < pStart) {
      return { opacity: 0, transform: [{ translateY: -40 }, { rotate: '0deg' }] };
    }
    const cp = Math.min(1, (p - pStart) / (pEnd - pStart));
    const drop = Math.pow(cp, 1.7);
    const translateY = -40 + drop * (stageHeight + 100);
    const rotate = cp * spec.rotation;
    return {
      opacity: p >= pStart && p < 0.98 ? 1 : 0,
      transform: [
        { translateY },
        { rotate: `${rotate}deg` },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.coin,
        {
          width: spec.sz,
          height: spec.sz,
          borderRadius: spec.sz / 2,
          left: spec.leftRatio * (stageWidth - spec.sz),
        },
        coinStyle,
      ]}
    >
      <View
        style={[
          styles.coinInner,
          {
            borderRadius: spec.sz / 4,
          },
        ]}
      />
    </Animated.View>
  );
}

// Individual Slot Reel: strictly driven by progress.value on the UI thread
function SlotReel({
  letter,
  reelIndex,
  width,
  fs,
  fz,
  fontFamily,
  progress,
  reduceMotion,
}: {
  letter: string;
  reelIndex: number;
  width: number;
  fs: number;
  fz: number;
  fontFamily: string;
  progress: SharedValue<number>;
  reduceMotion: boolean;
}) {
  // Strip cell icons (N random icons + target letter + 1 extra icon)
  const cellIcons = useMemo(() => {
    const start = (reelIndex * 2) % 5;
    const icons: number[] = [];
    for (let k = 0; k < N; k++) {
      icons.push((start + k) % 5);
    }
    return icons;
  }, [reelIndex]);

  const stripStyle = useAnimatedStyle(() => {
    if (reduceMotion || fs <= 0) {
      return { transform: [{ translateY: -N * fs }] };
    }
    const p = progress.value;
    const pStop = (STOP0_SEC + reelIndex * GAP_SEC) / TOTAL_SEC;

    if (p <= P_FIRST) {
      return { transform: [{ translateY: 0 }] };
    }
    if (p >= pStop) {
      return { transform: [{ translateY: -N * fs }] };
    }
    const u = (p - P_FIRST) / (pStop - P_FIRST);
    // Inlined cubic-bezier(0.25, 0.75, 0.3, 1.08) solver directly inside the UI worklet
    let eased = u;
    if (u > 0 && u < 1) {
      const x1 = 0.25;
      const y1 = 0.75;
      const x2 = 0.3;
      const y2 = 1.08;
      let t = u;
      for (let iter = 0; iter < 5; iter++) {
        const currentX =
          3 * (1 - t) * (1 - t) * t * x1 +
          3 * (1 - t) * t * t * x2 +
          t * t * t;
        const currentSlope =
          3 * (1 - t) * (1 - t) * x1 +
          6 * (1 - t) * t * (x2 - x1) +
          3 * t * t * (1 - x2);
        if (Math.abs(currentSlope) < 1e-5) break;
        t -= (currentX - u) / currentSlope;
        t = Math.max(0, Math.min(1, t));
      }
      eased =
        3 * (1 - t) * (1 - t) * t * y1 +
        3 * (1 - t) * t * t * y2 +
        t * t * t;
    } else if (u >= 1) {
      eased = 1;
    } else {
      eased = 0;
    }

    return {
      transform: [{ translateY: -eased * N * fs }],
    };
  });

  const itemWidth = width + BLEED * 2;

  return (
    <View style={[styles.reelOuter, { width, height: fs }]}>
      {/* Clipped window: strictly clips top/bottom at fs while allowing BLEED on sides */}
      <View style={[styles.reelClippedWindow, { width: itemWidth, height: fs }]}>
        <Animated.View style={[styles.strip, stripStyle]}>
          {/* N loot icons */}
          {cellIcons.map((iconType, idx) => (
            <View key={`icon-${idx}`} style={[styles.cell, { width: itemWidth, height: fs }]}>
              <LootIcon type={iconType} size={fs * 0.46} />
            </View>
          ))}

          {/* Target letter at index N */}
          <View style={[styles.cell, { width: itemWidth, height: fs }]}>
            <Text
              style={[
                styles.letterText,
                {
                  fontSize: fz,
                  lineHeight: fs,
                  fontFamily,
                },
              ]}
            >
              {letter}
            </Text>
          </View>

          {/* 1 extra trailing icon */}
          <View style={[styles.cell, { width: itemWidth, height: fs }]}>
            <LootIcon type={0} size={fs * 0.46} />
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

export default function OpeningAnimation({
  onFinish,
}: OpeningAnimationProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState(false);
  const [fontLoaded, setFontLoaded] = useState(Platform.OS === 'web' || Font.isLoaded('Unbounded-Bold'));
  const [layoutReady, setLayoutReady] = useState(screenWidth > 0 && screenHeight > 0);
  const [measuredSize, setMeasuredSize] = useState({ width: screenWidth || 390, height: screenHeight || 844 });
  const hasStartedRef = useRef(false);
  const isFinishedRef = useRef(false);

  // The single source of truth for the entire opening sequence on the UI thread
  const progress = useSharedValue(0);

  // Layout measurement handler
  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setMeasuredSize({ width, height });
      setLayoutReady(true);
    }
  }, []);

  // Font loading with instant check and short fallback
  useEffect(() => {
    if (Font.isLoaded('Unbounded-Bold')) {
      setFontLoaded(true);
      return;
    }
    let mounted = true;
    const timeout = setTimeout(() => {
      if (mounted) setFontLoaded(true);
    }, 150);

    Font.loadAsync({
      'Unbounded-Bold': require('../../assets/fonts/Unbounded-Bold.ttf'),
    })
      .then(() => { if (mounted) setFontLoaded(true); })
      .catch(() => { if (mounted) setFontLoaded(true); })
      .finally(() => { clearTimeout(timeout); });

    return () => {
      mounted = false;
      clearTimeout(timeout);
    };
  }, []);

  // Motion preference
  useEffect(() => {
    checkIsReduceMotionEnabled().then(setReduceMotion);
    return subscribeToReduceMotion(setReduceMotion);
  }, []);

  // Geometry calculations
  const sumAdv = useMemo(() => {
    return (
      ADV_RATIOS.reduce((acc, r) => acc + r, 0) + TRACKING * ADV_RATIOS.length
    );
  }, []);

  const fz = useMemo(() => {
    const w = measuredSize.width > 0 ? measuredSize.width : screenWidth;
    return Math.min((w * 0.86) / sumAdv, 96);
  }, [measuredSize.width, screenWidth, sumAdv]);

  const fs = useMemo(() => (fz > 0 ? fz / 0.78 : 0), [fz]);

  const widths = useMemo(() => {
    if (fz <= 0) return [];
    return ADV_RATIOS.map((r) => (r + TRACKING) * fz);
  }, [fz]);

  const handleComplete = useCallback(() => {
    if (isFinishedRef.current) return;
    isFinishedRef.current = true;
    onFinish();
  }, [onFinish]);

  const handleSkip = useCallback(() => {
    if (isFinishedRef.current) return;
    cancelAnimation(progress);
    progress.value = withTiming(1, { duration: 60 }, () => {
      runOnJS(handleComplete)();
    });
  }, [progress, handleComplete]);

  const triggerFinalHaptic = useCallback(() => {
    hapticFeedback.heavy();
    setTimeout(() => hapticFeedback.heavy(), 45);
    setTimeout(() => hapticFeedback.medium(), 95);
  }, []);

  // UI-thread deterministic haptics & handoff listener
  useAnimatedReaction(
    () => progress.value,
    (curr, prev) => {
      if (prev === null || prev === undefined) return;
      if (prev < 0.02 && curr >= 0.02) {
        runOnJS(hapticFeedback.light)();
      }
      for (let i = 0; i < 6; i++) {
        const pLand = (STOP0_SEC + i * GAP_SEC) / TOTAL_SEC;
        if (prev < pLand && curr >= pLand) {
          if (i === 5) {
            runOnJS(triggerFinalHaptic)();
          } else {
            runOnJS(hapticFeedback.light)();
          }
        }
      }
      if (prev < 1.0 && curr >= 1.0) {
        runOnJS(handleComplete)();
      }
    }
  );

  // Start exactly once when layout is measured and font is loaded
  useEffect(() => {
    if (!layoutReady || !fontLoaded || fs <= 0) return;
    if (hasStartedRef.current || isFinishedRef.current) return;
    hasStartedRef.current = true;

    if (reduceMotion) {
      progress.value = 1;
      const t = setTimeout(() => handleComplete(), 150);
      return () => clearTimeout(t);
    }

    progress.value = withTiming(
      1,
      { duration: DURATION_MS, easing: Easing.linear },
      (finished) => {
        if (finished) {
          runOnJS(handleComplete)();
        }
      }
    );

    // Guaranteed JS thread timer so Web/PWA never stalls
    const finishTimer = setTimeout(() => {
      handleComplete();
    }, DURATION_MS + 60);

    return () => clearTimeout(finishTimer);
  }, [layoutReady, fontLoaded, fs, reduceMotion, progress, handleComplete]);

  // Safety net watchdog: jump to completion if past 1600ms
  useEffect(() => {
    const safety = setTimeout(() => {
      if (!isFinishedRef.current) {
        handleComplete();
      }
    }, 1600);
    return () => clearTimeout(safety);
  }, [handleComplete]);

  const stageAnimatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < 6; i++) {
      const pLand = (STOP0_SEC + i * GAP_SEC) / TOTAL_SEC;
      const isLast = i === 5;
      const pDur = (isLast ? 0.20 : 0.10) / TOTAL_SEC;
      const amp = isLast ? 8 : 2.5;
      if (p >= pLand && p < pLand + pDur) {
        const tau = (p - pLand) / pDur;
        const decay = (1 - tau) * (1 - tau);
        sx = amp * Math.sin(tau * Math.PI * 6) * decay;
        sy = (amp * 0.5) * Math.cos(tau * Math.PI * 6) * decay;
        break;
      }
    }
    const opacity = p >= 0.89 ? Math.max(0, 1 - (p - 0.89) / (1.0 - 0.89)) : 1;
    return {
      opacity,
      transform: [{ translateX: sx }, { translateY: sy }],
    };
  });

  const rigAnimatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const pPulse = 1.02 / TOTAL_SEC;
    const pDur = 0.22 / TOTAL_SEC;
    let scale = 1.0;
    if (p >= pPulse && p < pPulse + pDur) {
      const tau = (p - pPulse) / pDur;
      scale = 1.0 + 0.07 * Math.sin(tau * Math.PI);
    }
    return { transform: [{ scale }] };
  });

  const fontFamily = Font.isLoaded('Unbounded-Bold')
    ? 'Unbounded-Bold'
    : Platform.OS === 'web'
    ? 'Unbounded-Bold, Unbounded, sans-serif'
    : Platform.OS === 'ios'
    ? 'System'
    : 'sans-serif';

  return (
    <Pressable
      style={StyleSheet.absoluteFill}
      onPress={handleSkip}
      accessibilityRole="button"
      accessibilityLabel="Tap to skip intro animation"
    >
      <Animated.View onLayout={handleLayout} style={[styles.container, stageAnimatedStyle]}>
        {/* Falling Coins Layer: Pre-rendered once, coordinates driven by progress */}
        {DETERMINISTIC_COIN_SPECS.map((spec) => (
          <CoinItem
            key={`coin-${spec.id}`}
            spec={spec}
            stageHeight={measuredSize.height || screenHeight}
            stageWidth={measuredSize.width || screenWidth}
            progress={progress}
          />
        ))}

        {/* Center Stage & Reels Rig */}
        {layoutReady && fs > 0 && widths.length === LETTERS.length && (
          <Animated.View style={[styles.rig, { height: fs }, rigAnimatedStyle]}>
            {LETTERS.map((char, index) => (
              <SlotReel
                key={`reel-${char}-${index}`}
                letter={char}
                reelIndex={index}
                width={widths[index]}
                fs={fs}
                fz={fz}
                fontFamily={fontFamily}
                progress={progress}
                reduceMotion={reduceMotion}
              />
            ))}
          </Animated.View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999,
  },
  rig: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  reelOuter: {
    overflow: 'visible',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  reelClippedWindow: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  strip: {
    alignItems: 'center',
    width: '100%',
    justifyContent: 'flex-start',
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  letterText: {
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    includeFontPadding: false,
  },
  coin: {
    position: 'absolute',
    top: 0,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    pointerEvents: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  coinInner: {
    width: '50%',
    height: '50%',
    backgroundColor: '#FFFFFF',
    opacity: 0.8,
  },
});
