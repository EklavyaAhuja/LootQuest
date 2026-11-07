import React, { useRef, useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Image,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';

interface ZoomableImageProps {
  uri: string;
  thumbnailUri?: string;
  width: number;
  height: number;
  onSingleTap?: () => void;
  onDoubleTap?: () => void;
  onSwipeDown?: () => void;
  onZoomChange?: (isZoomed: boolean) => void;
}

export default function ZoomableImage({
  uri,
  thumbnailUri,
  width,
  height,
  onSingleTap,
  onSwipeDown,
  onZoomChange,
}: ZoomableImageProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  // Track raw values for calculations
  const currentScale = useRef(1);
  const currentTranslateX = useRef(0);
  const currentTranslateY = useRef(0);

  // Pinch distance tracker
  const initialDistance = useRef<number | null>(null);
  const initialScaleOnPinch = useRef(1);

  // Double tap tracker
  const lastTapRef = useRef<number>(0);
  const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Image load state
  const [isFullLoaded, setIsFullLoaded] = useState(false);

  useEffect(() => {
    setIsFullLoaded(false);
  }, [uri]);

  const notifyZoom = (isZoomed: boolean) => {
    if (onZoomChange) onZoomChange(isZoomed);
  };

  const resetZoom = (animated = true) => {
    currentScale.current = 1;
    currentTranslateX.current = 0;
    currentTranslateY.current = 0;
    notifyZoom(false);

    if (animated) {
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 7 }),
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 7 }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 7 }),
      ]).start();
    } else {
      scale.setValue(1);
      translateX.setValue(0);
      translateY.setValue(0);
    }
  };

  const zoomTo = (targetScale: number, animated = true) => {
    currentScale.current = targetScale;
    currentTranslateX.current = 0;
    currentTranslateY.current = 0;
    notifyZoom(targetScale > 1.08);

    if (animated) {
      Animated.parallel([
        Animated.spring(scale, { toValue: targetScale, useNativeDriver: true, friction: 7 }),
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 7 }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 7 }),
      ]).start();
    } else {
      scale.setValue(targetScale);
      translateX.setValue(0);
      translateY.setValue(0);
    }
  };

  const getDistance = (touches: any[]) => {
    const [t1, t2] = touches;
    const dx = t1.pageX - t2.pageX;
    const dy = t1.pageY - t2.pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) => {
        // Capture on start if 2 or more touches (pinch-to-zoom)
        return evt.nativeEvent.touches.length >= 2;
      },
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // If 2 touches (pinch), always capture gesture
        if (evt.nativeEvent.touches.length >= 2) return true;

        // If zoomed in (> 1.08x), capture 1-finger pan to explore image
        if (currentScale.current > 1.08) {
          return Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4;
        }

        // When not zoomed, capture downward swipe to close
        if (gestureState.dy > 15 && Math.abs(gestureState.dx) < Math.abs(gestureState.dy)) {
          return true;
        }

        return false;
      },

      onPanResponderGrant: (evt) => {
        if (evt.nativeEvent.touches.length >= 2) {
          initialDistance.current = getDistance(evt.nativeEvent.touches);
          initialScaleOnPinch.current = currentScale.current;
        }
      },

      onPanResponderMove: (evt, gestureState) => {
        const touches = evt.nativeEvent.touches;

        // Continuous 2-finger pinch zoom (smoothly bounds between 0.75 and 4.2)
        if (touches.length >= 2) {
          const dist = getDistance(touches);
          if (initialDistance.current && initialDistance.current > 0) {
            const factor = dist / initialDistance.current;
            let nextScale = initialScaleOnPinch.current * factor;
            nextScale = Math.max(0.75, Math.min(nextScale, 4.2));
            currentScale.current = nextScale;
            scale.setValue(nextScale);
            notifyZoom(nextScale > 1.08);
          }
        } else if (touches.length === 1) {
          if (currentScale.current > 1.08) {
            // Pan while zoomed (clamped strictly so image cannot leave screen bounds)
            const maxTranslateX = (width * (currentScale.current - 1)) / 2;
            const maxTranslateY = (height * (currentScale.current - 1)) / 2;

            let nextX = currentTranslateX.current + gestureState.dx;
            let nextY = currentTranslateY.current + gestureState.dy;

            nextX = Math.max(-maxTranslateX, Math.min(nextX, maxTranslateX));
            nextY = Math.max(-maxTranslateY, Math.min(nextY, maxTranslateY));

            translateX.setValue(nextX);
            translateY.setValue(nextY);
          } else if (gestureState.dy > 0) {
            // Slight downward pull visual feedback when unzoomed
            translateY.setValue(Math.min(gestureState.dy * 0.7, 180));
          }
        }
      },

      onPanResponderRelease: (evt, gestureState) => {
        // Detect Downward Swipe to Close (when not zoomed)
        if (currentScale.current <= 1.08 && gestureState.dy > 80 && Math.abs(gestureState.dx) < 70) {
          if (onSwipeDown) {
            onSwipeDown();
            return;
          }
        }

        // Detect Taps (single or double tap)
        const isClick = Math.abs(gestureState.dx) < 6 && Math.abs(gestureState.dy) < 6;
        if (isClick && evt.nativeEvent.touches.length === 0) {
          const now = Date.now();
          if (now - lastTapRef.current < 280) {
            // Double Tap detected: toggle 2.5x and 1x
            if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
            lastTapRef.current = 0;
            if (currentScale.current > 1.2) {
              resetZoom(true);
            } else {
              zoomTo(2.5, true);
            }
            return;
          } else {
            lastTapRef.current = now;
            if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
            tapTimeoutRef.current = setTimeout(() => {
              lastTapRef.current = 0;
              if (currentScale.current > 1.1) {
                resetZoom(true);
              } else if (onSingleTap) {
                onSingleTap();
              }
            }, 300);
            return;
          }
        }

        // Commit pan offsets
        currentTranslateX.current = (translateX as any)._value || 0;
        currentTranslateY.current = (translateY as any)._value || 0;
        initialDistance.current = null;

        // Spring back to 1x if released below 1x or near 1x
        if (currentScale.current <= 1.08) {
          resetZoom(true);
        } else if (currentScale.current > 4.0) {
          currentScale.current = 4.0;
          Animated.spring(scale, { toValue: 4.0, useNativeDriver: true, friction: 7 }).start();
        } else {
          // Re-clamp translation after pinch ends
          const maxTranslateX = (width * (currentScale.current - 1)) / 2;
          const maxTranslateY = (height * (currentScale.current - 1)) / 2;
          const clampedX = Math.max(-maxTranslateX, Math.min(currentTranslateX.current, maxTranslateX));
          const clampedY = Math.max(-maxTranslateY, Math.min(currentTranslateY.current, maxTranslateY));
          currentTranslateX.current = clampedX;
          currentTranslateY.current = clampedY;
          Animated.parallel([
            Animated.spring(translateX, { toValue: clampedX, useNativeDriver: true, friction: 7 }),
            Animated.spring(translateY, { toValue: clampedY, useNativeDriver: true, friction: 7 }),
          ]).start();
        }
      },

      onPanResponderTerminate: () => {
        initialDistance.current = null;
        if (currentScale.current <= 1.08) {
          resetZoom(true);
        }
      },
    })
  ).current;

  return (
    <View style={[styles.container, { width, height }]} {...panResponder.panHandlers}>
      {/* Thumbnail placeholder loaded instantly */}
      {thumbnailUri && !isFullLoaded && (
        <Image
          source={{ uri: thumbnailUri }}
          style={[styles.thumbnail, { width, height }]}
          resizeMode="contain"
          blurRadius={1}
        />
      )}
      <Animated.Image
        source={{ uri }}
        onLoad={() => setIsFullLoaded(true)}
        style={[
          styles.image,
          {
            width,
            height,
            transform: [
              { scale },
              { translateX },
              { translateY },
            ],
          },
        ]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: '#000000',
    position: 'relative',
  },
  thumbnail: {
    position: 'absolute',
    maxWidth: '100%',
    maxHeight: '100%',
  },
  image: {
    maxWidth: '100%',
    maxHeight: '100%',
  },
});
