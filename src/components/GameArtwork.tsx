import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  StyleProp,
  ViewStyle,
  ImageStyle,
  ImageResizeMode,
  Platform,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import StoreIcon from './StoreIcon';
import { FONTS, COLORS, RADIUS } from '../theme/theme';
import { Deal } from '../models/Deal';
import { checkIsReduceMotionEnabled, subscribeToReduceMotion } from '../utils/motion';
import {
  getArtSourceChain,
  isValidArtworkUrl,
  normalizeImageUrl,
  markSessionFailedUrl,
  isSessionFailedUrl,
  cleanDisplayTitle,
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
  const candidateList = React.useMemo(() => {
    const list: string[] = [];
    const added = new Set<string>();

    const isPortraitUrl = (u?: string | null) => {
      if (!u) return false;
      const l = u.toLowerCase();
      return l.includes('library_600x900') || l.includes('tall') || l.includes('600x900') || l.includes('portrait');
    };

    const add = (u?: string | null) => {
      const norm = normalizeImageUrl(u);
      if (norm && !added.has(norm)) {
        if (format === 'wide' && isPortraitUrl(norm)) {
          return; // strictly exclude portrait URLs for wide cards to avoid cropping text
        }
        added.add(norm);
        list.push(norm);
      }
    };

    if (format === 'portrait') {
      if (deal?.resolvedPoster) add(deal.resolvedPoster);
      if (uri && isValidArtworkUrl(uri)) add(uri);
      if (deal) {
        const chain = getArtSourceChain(deal, format);
        for (const c of chain) add(c);
        if (deal.image) add(deal.image);
        if ((deal as any).thumbnail) add((deal as any).thumbnail);
        if ((deal as any).coverImage) add((deal as any).coverImage);
      }
    } else {
      // STRICTLY WIDE / LANDSCAPE
      if (deal?.resolvedImage && !isPortraitUrl(deal.resolvedImage)) add(deal.resolvedImage);
      if (uri && isValidArtworkUrl(uri) && !isPortraitUrl(uri)) add(uri);
      if (deal) {
        const chain = getArtSourceChain(deal, format);
        for (const c of chain) {
          if (!isPortraitUrl(c)) add(c);
        }
        if (deal.image && !isPortraitUrl(deal.image)) add(deal.image);
        if ((deal as any).thumbnail && !isPortraitUrl((deal as any).thumbnail)) add((deal as any).thumbnail);
        if ((deal as any).coverImage && !isPortraitUrl((deal as any).coverImage)) add((deal as any).coverImage);
      }
    }

    return list;
  }, [deal, uri, format]);

  const [candidateIndex, setCandidateIndex] = useState(0);
  const [hasFailed, setHasFailed] = useState(false);
  const [isReduceMotion, setIsReduceMotion] = useState(false);

  useEffect(() => {
    checkIsReduceMotionEnabled().then(setIsReduceMotion);
    return subscribeToReduceMotion(setIsReduceMotion);
  }, []);

  useEffect(() => {
    setCandidateIndex(0);
    setHasFailed(false);
  }, [candidateList]);

  const targetImage = candidateList[candidateIndex] || null;

  const displayTitle = title || deal?.title || '';
  const displayPlatform = platform || deal?.platform || 'PC';

  const handleImageError = useCallback(() => {
    if (candidateIndex < candidateList.length - 1) {
      setCandidateIndex((prev) => prev + 1);
    } else {
      setHasFailed(true);
      onError?.();
    }
  }, [candidateIndex, candidateList.length, onError]);

  const is18PlusApproved =
    deal ? dealsStore.is18PlusRevealed(deal.id) || dealsStore.getAlwaysShow18Plus() : false;
  const effectiveBlur = isNsfw && !is18PlusApproved ? 18 : blurRadius;

  const showImage = !hasFailed && !!targetImage;
  const recyclingKey = deal?.id ? String(deal.id) : (targetImage || undefined);

  return (
    <View style={[styles.container, style]}>
      {!showImage ? (
        // Clean fallback tile: monochrome store icon plus title
        <View style={styles.fallbackSurface}>
          <StoreIcon store={displayPlatform} size={isHero ? 28 : 20} color="#A1A1A6" />
          {displayTitle ? (
            <Text numberOfLines={2} style={styles.fallbackSerifTitle}>
              {cleanDisplayTitle(displayTitle)}
            </Text>
          ) : null}
        </View>
      ) : (
        // Clean full cover art anchored to top center so game logos are never cropped
        <View style={StyleSheet.absoluteFill}>
          <ExpoImage
            recyclingKey={recyclingKey}
            source={{ uri: targetImage }}
            style={[styles.fullImage, imageStyle as any]}
            contentFit={resizeMode === 'contain' ? 'contain' : 'cover'}
            contentPosition="top"
            placeholder={Platform.OS === 'web' ? undefined : "L00000fQfQfQfQfQfQfQfQfQfQfQ"}
            placeholderContentFit="cover"
            transition={isReduceMotion ? undefined : { duration: 140, effect: 'cross-dissolve' }}
            cachePolicy="memory-disk"
            priority={isHero ? 'high' : 'normal'}
            blurRadius={effectiveBlur}
            onError={handleImageError}
          />
        </View>
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
    ...(StyleSheet.absoluteFill as any),
    backgroundColor: '#0F0F10',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  fallbackSerifTitle: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    lineHeight: 18,
    color: '#A1A1A6',
    textAlign: 'center',
    letterSpacing: -0.2,
    marginTop: 6,
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
