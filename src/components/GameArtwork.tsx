import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  Animated,
  StyleProp,
  ViewStyle,
  ImageStyle,
  ImageResizeMode,
  AccessibilityInfo,
} from 'react-native';
import StoreIcon from './StoreIcon';
import { FONTS, COLORS, RADIUS } from '../theme/theme';
import { Deal } from '../models/Deal';
import {
  getArtSourceChain,
  isValidArtworkUrl,
  normalizeImageUrl,
  markSessionFailedUrl,
  isSessionFailedUrl,
} from '../utils/dealUtils';
import { dealsStore } from '../services/dealsStore';

export interface GameArtworkProps {
  deal?: Deal | null;
  uri?: string | null;
  format?: 'portrait' | 'wide';
  title?: string;
  platform?: string;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  resizeMode?: ImageResizeMode;
  blurRadius?: number;
  isNsfw?: boolean;
  isHero?: boolean;
  showPlatformBadge?: boolean;
  showBottomGradient?: boolean;
  onError?: () => void;
}

export const GameArtwork: React.FC<GameArtworkProps> = ({
  deal,
  uri,
  format = 'wide',
  title = '',
  platform = 'PC',
  style,
  imageStyle,
  resizeMode = 'cover',
  blurRadius = 0,
  isNsfw = false,
  isHero = false,
  showPlatformBadge = false,
  showBottomGradient = false,
  onError,
}) => {
  const targetImage = React.useMemo(() => {
    if (format === 'portrait' && deal?.resolvedPoster) return deal.resolvedPoster;
    if (deal?.resolvedImage) return deal.resolvedImage;
    if (uri && isValidArtworkUrl(uri)) return normalizeImageUrl(uri);
    return null;
  }, [deal?.resolvedPoster, deal?.resolvedImage, uri, format]);

  const [hasFailed, setHasFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isWideImage, setIsWideImage] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [isReduceMotion, setIsReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setIsReduceMotion);
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setIsReduceMotion);
    return () => sub?.remove?.();
  }, []);

  useEffect(() => {
    setHasFailed(false);
    setImageLoaded(false);
    if (!targetImage) {
      setIsWideImage(false);
      return;
    }
    Image.getSize(
      targetImage,
      (w, h) => {
        setIsWideImage(w > h * 1.05);
      },
      () => {
        setIsWideImage(false);
      }
    );
  }, [targetImage]);

  const displayTitle = title || deal?.title || '';
  const displayPlatform = platform || deal?.platform || 'PC';

  const handleImageError = useCallback(() => {
    setHasFailed(true);
    setImageLoaded(false);
    onError?.();
  }, [onError]);

  const handleLoad = () => {
    setImageLoaded(true);
    if (!isReduceMotion) {
      fadeAnim.setValue(0.7);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();
    } else {
      fadeAnim.setValue(1);
    }
  };

  const is18PlusApproved =
    deal ? dealsStore.is18PlusRevealed(deal.id) || dealsStore.getAlwaysShow18Plus() : false;
  const effectiveBlur = isNsfw && !is18PlusApproved ? 18 : blurRadius;

  const showImage = !hasFailed && !!targetImage;

  return (
    <View style={[styles.container, style]}>
      {!showImage ? (
        // Flat #0F0F10 surface with game title in serif font, centered, muted
        <View style={styles.fallbackSurface}>
          {displayTitle ? (
            <Text numberOfLines={3} style={styles.fallbackSerifTitle}>
              {displayTitle}
            </Text>
          ) : (
            <StoreIcon store={displayPlatform} size={isHero ? 36 : 22} color={COLORS.textMuted} />
          )}
        </View>
      ) : (
        // Clean full cover art (never stretched, no blurred contain strips, consistent aspect)
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]}>
          <Image
            source={{ uri: targetImage }}
            style={[styles.fullImage, imageStyle]}
            resizeMode={resizeMode}
            blurRadius={effectiveBlur}
            onLoad={handleLoad}
            onError={handleImageError}
          />
        </Animated.View>
      )}

      {/* Optional Platform Corner Badge */}
      {showPlatformBadge && (
        <View style={styles.cornerStoreBadge}>
          <StoreIcon store={displayPlatform} size={11} color="#FFFFFF" />
        </View>
      )}
    </View>
  );
};

export default GameArtwork;

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#0C0C0C', // Flat #0C0C0C surface while loading
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  fallbackSurface: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0F0F10', // Flat #0F0F10 with game title in serif font
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  fallbackSerifTitle: {
    fontFamily: FONTS.serif,
    fontSize: 20,
    lineHeight: 24,
    color: COLORS.textMuted,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  cornerStoreBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderRadius: RADIUS.xs,
    padding: 4,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
});
