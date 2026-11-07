import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Animated,
  Easing,
  AccessibilityInfo,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GameArtwork from './GameArtwork';
import StoreIcon, { storeShortName } from './StoreIcon';
import TypeBadge from './TypeBadge';
import Price from './Price';
import { Deal } from '../models/Deal';
import { COLORS, FONTS, RADIUS } from '../theme/theme';
import {
  getTimeLeft,
  getGiveawayHostName,
  cleanDisplayTitle,
  parseDateToMs,
} from '../utils/dealUtils';
import { dealsStore } from '../services/dealsStore';
import Gate18PlusModal from './Gate18PlusModal';
import { checkIsReduceMotionEnabled, subscribeToReduceMotion } from '../utils/motion';
import { copyToClipboard } from '../utils/clipboard';
import { hapticFeedback } from '../utils/haptics';

export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    checkIsReduceMotionEnabled().then(setReduceMotion);
    return subscribeToReduceMotion(setReduceMotion);
  }, []);
  return reduceMotion;
}

export function useCardPressScale(reduceMotion = false) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    if (reduceMotion) return;
    Animated.timing(scaleAnim, {
      toValue: 0.97,
      duration: 100,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [reduceMotion, scaleAnim]);

  const handlePressOut = useCallback(() => {
    if (reduceMotion) return;
    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: 140,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [reduceMotion, scaleAnim]);

  useEffect(() => {
    return () => {
      scaleAnim.setValue(1);
    };
  }, [scaleAnim]);

  return {
    scaleAnim,
    handlePressIn,
    handlePressOut,
    onPressIn: handlePressIn,
    onPressOut: handlePressOut,
  };
}

// ─── Format Time Display for Banner ──────────────────────────────────────────
export function formatBannerTime(timeStr?: string): { main: string; sub: string } {
  if (!timeStr) return { main: '∞', sub: 'PERMANENT' };
  const upper = timeStr.toUpperCase().trim();
  if (
    upper.includes('NO EXP') ||
    upper.includes('N/A') ||
    upper.includes('UNKNOWN') ||
    upper.includes('PERMANENT') ||
    upper === 'LIVE'
  ) {
    return { main: '∞', sub: 'NO EXPIRY' };
  }
  if (upper.includes('ENDED') || upper.includes('EXPIRED')) {
    return { main: 'ENDED', sub: 'EXPIRED' };
  }
  return { main: timeStr, sub: 'LEFT' };
}

function isUnder12Hours(deal: Deal): boolean {
  const rawEnd = deal.endDate || deal.expiresAt;
  if (!rawEnd) return false;
  const upper = String(rawEnd).toUpperCase().trim();
  if (upper === 'N/A' || upper.includes('PERMANENT') || upper.includes('NO EXP')) return false;
  const endMs = parseDateToMs(rawEnd);
  const diffHours = (endMs - Date.now()) / (1000 * 60 * 60);
  return diffHours > 0 && diffHours < 12;
}

// ─── Unified Poster Card (.poster) ───────────────────────────────────────────
interface PosterCardProps {
  deal: Deal;
  onPress: (deal: Deal) => void;
  onLongPress?: (deal: Deal) => void;
  isClaimed?: boolean;
  showRating?: boolean;
  width?: number | 'auto' | '100%';
  artAspectRatio?: number;
  style?: StyleProp<ViewStyle>;
  imageErrors?: Record<string, boolean>;
  onImageError?: (id: string) => void;
  isVault?: boolean;
  onDelete?: (deal: Deal) => void;
}

function PosterCardComponent({
  deal,
  onPress,
  onLongPress,
  isClaimed,
  showRating = true,
  width = 146,
  artAspectRatio,
  style,
  imageErrors,
  onImageError,
  isVault = false,
  onDelete,
}: PosterCardProps) {
  const reduceMotion = useReduceMotion();
  const { scaleAnim, handlePressIn, handlePressOut } = useCardPressScale(reduceMotion);

  // Real Steam review data only (>= 25 reviews for Top rated / >= 10 reviews)
  const hasRealRating =
    typeof deal.steamRatingPercent === 'number' &&
    deal.steamRatingPercent > 0 &&
    (deal.steamReviewCount ? deal.steamReviewCount >= 10 : true);
  const ratingPercent = hasRealRating ? deal.steamRatingPercent : null;

  const [show18Modal, setShow18Modal] = React.useState(false);
  const isGated = deal.is18Plus && !dealsStore.is18PlusRevealed(deal.id);

  const handleCardPress = () => {
    if (isGated) {
      setShow18Modal(true);
      return;
    }
    onPress(deal);
    hapticFeedback.light();
  };

  const handleCardLongPress = useCallback(async () => {
    if (onLongPress) {
      onLongPress(deal);
      return;
    }
    const targetUrl = deal.giveawayUrl || deal.url || deal.storeUrl || '';
    if (targetUrl) {
      await copyToClipboard(targetUrl);
      hapticFeedback.light();
    }
  }, [deal, onLongPress]);

  const hostInfo = getGiveawayHostName(deal);
  const displayStore = hostInfo.isTaskHost ? hostInfo.host : storeShortName(deal.platform);
  const cleanedTitle = isGated ? '18+ game' : cleanDisplayTitle(deal.title);

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          alignSelf: 'stretch',
          overflow: 'hidden',
          transform: [{ scale: scaleAnim }],
        },
        style,
      ]}
    >
      <Pressable
        onPress={handleCardPress}
        onLongPress={handleCardLongPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        unstable_pressDelay={0}
        style={styles.posterContainer}
      >
        {/* Artwork Container (NO text/store tags on thumbnail, clean cover) */}
        <View style={[styles.posterArt, artAspectRatio ? { aspectRatio: artAspectRatio } : null, isClaimed && { opacity: 0.65 }]}>
          {isGated ? (
            <View style={styles.gatedPosterSurface}>
              <View style={styles.gated18Badge}>
                <Text style={styles.gated18BadgeText}>18+</Text>
              </View>
              <Text style={styles.gatedPosterTitle}>18+ game</Text>
              <Text style={styles.gatedPosterSub}>Tap to view</Text>
            </View>
          ) : (
            <GameArtwork
              deal={deal}
              uri={
                artAspectRatio && artAspectRatio > 1
                  ? deal.resolvedImage || deal.image || deal.resolvedPoster
                  : deal.resolvedPoster || deal.resolvedImage || deal.image
              }
              format={artAspectRatio && artAspectRatio > 1 ? 'wide' : 'portrait'}
              title={deal.title}
              platform={deal.platform}
              isNsfw={deal.isNsfw}
              style={StyleSheet.absoluteFill}
              onError={() => onImageError?.(deal.id)}
            />
          )}
        </View>

        {/* Clean Title */}
        <Text numberOfLines={1} style={styles.posterTitle}>
          {cleanedTitle}
        </Text>

        {/* Line 1: Store on top */}
        <View style={styles.posterMetaRow}>
          <StoreIcon store={hostInfo.isTaskHost ? hostInfo.host : deal.platform} size={11} color="#EDEDEB" />
          <Text numberOfLines={1} style={styles.posterStoreName}>
            {displayStore}
          </Text>
          {deal.type && deal.type !== 'full_game' ? (
            <TypeBadge type={deal.type} size="sm" />
          ) : null}
        </View>

        {/* Line 2: Price on left, Rating on right */}
        <View style={styles.posterBottomRow}>
          {isClaimed && !isVault ? (
            <View style={styles.claimedRow}>
              <Ionicons name="checkmark" size={11} color="#8E8E93" />
              <Text style={styles.claimedPlainText}>Claimed</Text>
            </View>
          ) : (
            <Price worth={deal.worth || deal.originalPrice} isEstimated={deal.isEstimated} size="sm" />
          )}
          {ratingPercent ? (
            <View style={styles.cardRatingContainer}>
              <Ionicons name="star" size={10} color="#EDEDEB" style={styles.cardRatingStar} />
              <Text style={styles.cardRatingRight}>{ratingPercent}%</Text>
            </View>
          ) : null}
        </View>
      </Pressable>

      <Gate18PlusModal
        visible={show18Modal}
        dealId={deal.id}
        onClose={() => setShow18Modal(false)}
        onRevealed={() => onPress(deal)}
      />
    </Animated.View>
  );
}

function arePosterPropsEqual(prev: PosterCardProps, next: PosterCardProps) {
  return (
    prev.deal.id === next.deal.id &&
    prev.deal.title === next.deal.title &&
    prev.deal.image === next.deal.image &&
    prev.deal.resolvedPoster === next.deal.resolvedPoster &&
    prev.deal.resolvedImage === next.deal.resolvedImage &&
    prev.deal.steamRatingPercent === next.deal.steamRatingPercent &&
    prev.deal.steamReviewCount === next.deal.steamReviewCount &&
    prev.deal.reviewScore === next.deal.reviewScore &&
    prev.deal.is18Plus === next.deal.is18Plus &&
    prev.isClaimed === next.isClaimed &&
    prev.showRating === next.showRating &&
    prev.width === next.width &&
    prev.artAspectRatio === next.artAspectRatio &&
    prev.isVault === next.isVault &&
    prev.onPress === next.onPress &&
    prev.onLongPress === next.onLongPress &&
    prev.onDelete === next.onDelete
  );
}

export const PosterCard = React.memo(PosterCardComponent, arePosterPropsEqual);

// ─── Unified Landscape Card (Top Rated Rail) ──────────────────────────────────
export interface LandscapeCardProps {
  deal: Deal;
  onPress: (deal: Deal) => void;
  onLongPress?: (deal: Deal) => void;
  width?: number;
  style?: StyleProp<ViewStyle>;
  imageErrors?: Record<string, boolean>;
  onImageError?: (id: string) => void;
}

function LandscapeCardComponent({
  deal,
  onPress,
  onLongPress,
  width = 270,
  style,
  imageErrors,
  onImageError,
}: LandscapeCardProps) {
  const reduceMotion = useReduceMotion();
  const { scaleAnim, handlePressIn, handlePressOut } = useCardPressScale(reduceMotion);

  const [show18Modal, setShow18Modal] = React.useState(false);
  const isGated = deal.is18Plus && !dealsStore.is18PlusRevealed(deal.id);

  const handleCardPress = () => {
    if (isGated) {
      setShow18Modal(true);
      return;
    }
    onPress(deal);
    hapticFeedback.light();
  };

  const handleCardLongPress = useCallback(async () => {
    if (onLongPress) {
      onLongPress(deal);
      return;
    }
    const targetUrl = deal.giveawayUrl || deal.url || deal.storeUrl || '';
    if (targetUrl) {
      await copyToClipboard(targetUrl);
      hapticFeedback.light();
    }
  }, [deal, onLongPress]);

  const hostInfo = getGiveawayHostName(deal);
  const displayStore = hostInfo.isTaskHost ? hostInfo.host : storeShortName(deal.platform);
  const cleanedTitle = isGated ? '18+ game' : cleanDisplayTitle(deal.title);

  const hasRealRating =
    typeof deal.steamRatingPercent === 'number' &&
    deal.steamRatingPercent > 0 &&
    (deal.steamReviewCount ? deal.steamReviewCount >= 10 : true);
  const ratingPercent = hasRealRating ? deal.steamRatingPercent : null;

  const isClaimedState = dealsStore.isClaimed(deal.id);

  return (
    <Animated.View
      style={[
        {
          width,
          alignSelf: 'stretch',
          overflow: 'hidden',
          transform: [{ scale: scaleAnim }],
        },
        style,
      ]}
    >
      <Pressable
        onPress={handleCardPress}
        onLongPress={handleCardLongPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        unstable_pressDelay={0}
        style={styles.landscapeContainer}
      >
        {/* 16:9 Artwork with Cover (No blurred bars, no contain strip) */}
        <View style={[styles.landscapeArt, isClaimedState && { opacity: 0.65 }]}>
          {isGated ? (
            <View style={styles.gatedBannerSurface}>
              <View style={styles.gated18Badge}>
                <Text style={styles.gated18BadgeText}>18+</Text>
              </View>
              <Text style={styles.gatedBannerTitle}>18+ game</Text>
              <Text style={styles.gatedBannerSub}>Tap to view</Text>
            </View>
          ) : (
            <GameArtwork
              deal={deal}
              uri={deal.resolvedImage || deal.image}
              format="wide"
              title={deal.title}
              platform={deal.platform}
              isNsfw={deal.isNsfw}
              style={StyleSheet.absoluteFill}
              onError={() => onImageError?.(deal.id)}
            />
          )}
        </View>

        {/* Info below art */}
        {/* Title (1 line, tail ellipsis) */}
        <Text numberOfLines={1} ellipsizeMode="tail" style={styles.landscapeTitle}>
          {cleanedTitle}
        </Text>

        {/* Line 1: Store on top */}
        <View style={styles.landscapeMetaRow}>
          <StoreIcon store={hostInfo.isTaskHost ? hostInfo.host : deal.platform} size={11} color="#EDEDEB" />
          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.landscapeStoreName}>
            {displayStore}
          </Text>
          {deal.type && deal.type !== 'full_game' ? (
            <TypeBadge type={deal.type} size="sm" />
          ) : null}
        </View>

        {/* Line 2: Price on left, Rating on right */}
        <View style={styles.landscapeBottomRow}>
          {isClaimedState ? (
            <View style={styles.claimedRow}>
              <Ionicons name="checkmark" size={11} color="#8E8E93" />
              <Text style={styles.claimedPlainText}>Claimed</Text>
            </View>
          ) : (
            <Price worth={deal.worth || deal.originalPrice} isEstimated={deal.isEstimated} size="sm" />
          )}
          {ratingPercent ? (
            <View style={styles.cardRatingContainer}>
              <Ionicons name="star" size={10} color="#EDEDEB" style={styles.cardRatingStar} />
              <Text style={styles.cardRatingRight}>{ratingPercent}%</Text>
            </View>
          ) : null}
        </View>
      </Pressable>

      <Gate18PlusModal
        visible={show18Modal}
        dealId={deal.id}
        onClose={() => setShow18Modal(false)}
        onRevealed={() => onPress(deal)}
      />
    </Animated.View>
  );
}

function areLandscapePropsEqual(prev: LandscapeCardProps, next: LandscapeCardProps) {
  return (
    prev.deal.id === next.deal.id &&
    prev.deal.title === next.deal.title &&
    prev.deal.image === next.deal.image &&
    prev.deal.resolvedImage === next.deal.resolvedImage &&
    prev.deal.platform === next.deal.platform &&
    prev.deal.steamRatingPercent === next.deal.steamRatingPercent &&
    prev.deal.steamReviewCount === next.deal.steamReviewCount &&
    prev.deal.reviewScore === next.deal.reviewScore &&
    prev.deal.is18Plus === next.deal.is18Plus &&
    prev.width === next.width &&
    prev.onPress === next.onPress &&
    prev.onLongPress === next.onLongPress
  );
}

export const LandscapeCard = React.memo(LandscapeCardComponent, areLandscapePropsEqual);
export const TopRatedCard = LandscapeCard;

// ─── Unified Banner Card (.banner & .fi) ──────────────────────────────────────
interface BannerCardProps {
  deal: Deal;
  onPress: (deal: Deal) => void;
  onLongPress?: (deal: Deal) => void;
  onClaim?: (deal: Deal) => void;
  isClaimed?: boolean;
  style?: StyleProp<ViewStyle>;
  showFooter?: boolean;
  imageErrors?: Record<string, boolean>;
  onImageError?: (id: string) => void;
}

function BannerCardComponent({
  deal,
  onPress,
  onLongPress,
  onClaim,
  isClaimed,
  style,
  showFooter = false,
  imageErrors,
  onImageError,
}: BannerCardProps) {
  const isClaimedState = isClaimed !== undefined ? isClaimed : dealsStore.isClaimed(deal.id);
  const reduceMotion = useReduceMotion();
  const { scaleAnim, handlePressIn, handlePressOut } = useCardPressScale(reduceMotion);

  const [show18Modal, setShow18Modal] = React.useState(false);
  const isGated = deal.is18Plus && !dealsStore.is18PlusRevealed(deal.id);

  const handleCardPress = () => {
    if (isGated) {
      setShow18Modal(true);
      return;
    }
    onPress(deal);
    hapticFeedback.light();
  };

  const handleCardLongPress = useCallback(async () => {
    if (onLongPress) {
      onLongPress(deal);
      return;
    }
    const targetUrl = deal.giveawayUrl || deal.url || deal.storeUrl || '';
    if (targetUrl) {
      await copyToClipboard(targetUrl);
      hapticFeedback.light();
    }
  }, [deal, onLongPress]);

  const effectiveEndDate = deal.expiresAt || deal.endDate;
  const rawTime = effectiveEndDate
    ? getTimeLeft(effectiveEndDate, deal.platform)
    : (deal.timeLeft && !deal.timeLeft.includes('7d 1h') ? deal.timeLeft : 'No expiry');
  const timeInfo = formatBannerTime(rawTime);
  const urgent = isUnder12Hours(deal);

  const hasRealRating =
    typeof deal.steamRatingPercent === 'number' &&
    deal.steamRatingPercent > 0 &&
    (deal.steamReviewCount ? deal.steamReviewCount >= 10 : true);
  const ratingPercent = hasRealRating ? deal.steamRatingPercent : null;

  const claimedCount = typeof deal.claimedUsers === 'number' && deal.claimedUsers > 0 ? deal.claimedUsers : null;

  const hostInfo = getGiveawayHostName(deal);
  const displayStore = hostInfo.isTaskHost ? hostInfo.host : storeShortName(deal.platform);
  const cleanedTitle = isGated ? '18+ game' : cleanDisplayTitle(deal.title);

  return (
    <Animated.View
      style={[
        {
          width: '100%',
          alignSelf: 'stretch',
          marginBottom: 16,
          transform: [{ scale: scaleAnim }],
        },
        style,
      ]}
    >
      <Pressable
        onPress={handleCardPress}
        onLongPress={handleCardLongPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        unstable_pressDelay={0}
        style={styles.bannerContainer}
      >
        {/* 16:9 Artwork on Top - No text or buttons on top of art */}
        <View style={[styles.bannerArt, isClaimedState && { opacity: 0.65 }]}>
          {isGated ? (
            <View style={styles.gatedBannerSurface}>
              <View style={styles.gated18Badge}>
                <Text style={styles.gated18BadgeText}>18+</Text>
              </View>
              <Text style={styles.gatedBannerTitle}>18+ game</Text>
              <Text style={styles.gatedBannerSub}>Tap to view</Text>
            </View>
          ) : (
            <GameArtwork
              deal={deal}
              uri={deal.resolvedImage || deal.image}
              format="wide"
              title={deal.title}
              platform={deal.platform}
              isNsfw={deal.isNsfw}
              style={StyleSheet.absoluteFill}
              onError={() => onImageError?.(deal.id)}
            />
          )}
        </View>

        {/* Solid #000 Info Strip Below Art */}
        <View style={styles.bannerInfoStrip}>
          {/* Row 1: title (max 2 lines) */}
          <Text numberOfLines={2} style={styles.bannerTitle}>
            {cleanedTitle}
          </Text>

          {/* Row 2: Store on top */}
          <View style={styles.bannerMetaRow}>
            <StoreIcon store={hostInfo.isTaskHost ? hostInfo.host : deal.platform} size={12} color="#EDEDEB" />
            <Text numberOfLines={1} style={styles.bannerStoreText}>
              {displayStore}
            </Text>
            {deal.type && deal.type !== 'full_game' ? (
              <TypeBadge type={deal.type} size="sm" />
            ) : null}
            {ratingPercent ? (
              <View style={styles.cardRatingContainer}>
                <Ionicons name="star" size={10} color="#EDEDEB" style={styles.cardRatingStar} />
                <Text style={styles.cardRatingRight}>
                  {ratingPercent}%{deal.reviewScore ? ` ${deal.reviewScore}` : ''}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Row 3: <Price /> and time left on one row, and the claim button in that strip */}
          <View style={styles.bannerActionRow}>
            <View style={styles.bannerPriceAndTime}>
              <Price
                worth={deal.worth || deal.originalPrice}
                isEstimated={deal.isEstimated}
                size="sm"
              />
              {timeInfo.main !== '∞' && (
                <Text
                  style={[
                    styles.bannerTimeNum,
                    urgent && styles.bannerTimeNumUrgent,
                  ]}
                  numberOfLines={1}
                >
                  {timeInfo.main} {timeInfo.sub !== 'LEFT' && timeInfo.sub !== 'PERMANENT' && timeInfo.sub !== 'NO EXPIRY' ? timeInfo.sub : ''}
                </Text>
              )}
            </View>

            {isClaimedState ? (
              <View style={styles.claimedRow}>
                <Ionicons name="checkmark" size={12} color="#8E8E93" />
                <Text style={styles.claimedPlainText}>Claimed</Text>
              </View>
            ) : (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation?.();
                  if (isGated) {
                    setShow18Modal(true);
                    return;
                  }
                  if (onClaim) {
                    onClaim(deal);
                    return;
                  }
                  const directUrl = deal.giveawayUrl || deal.url || deal.storeUrl;
                  if (directUrl && Platform.OS === 'web') {
                    Linking.openURL(directUrl).catch(() => {});
                  } else {
                    onPress(deal);
                  }
                }}
                style={styles.stripBtn}
              >
                <Text style={styles.stripBtnText}>
                  {isGated ? 'Tap to view' : Platform.OS === 'web' ? 'Claim ↗' : 'View'}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </Pressable>

      {/* Feed Card Footer */}
      {showFooter && (
        <View style={styles.feedCardFooter}>
          <Text style={styles.feedCardFooterMeta}>
            {claimedCount ? `${claimedCount.toLocaleString()} claimed · ` : ''}
            {deal.claimMethod === 'tasks' ? 'Tasks required' : 'One-click'}
          </Text>
          {!isGated && ratingPercent ? (
            <View style={styles.cardRatingContainer}>
              <Ionicons name="star" size={10} color="#EDEDEB" style={styles.cardRatingStar} />
              <Text style={styles.feedCardFooterRating}>
                {ratingPercent}% Steam
              </Text>
            </View>
          ) : null}
        </View>
      )}

      <Gate18PlusModal
        visible={show18Modal}
        dealId={deal.id}
        onClose={() => setShow18Modal(false)}
        onRevealed={() => onPress(deal)}
      />
    </Animated.View>
  );
}

function areBannerPropsEqual(prev: BannerCardProps, next: BannerCardProps) {
  return (
    prev.deal.id === next.deal.id &&
    prev.deal.title === next.deal.title &&
    prev.deal.image === next.deal.image &&
    prev.deal.resolvedImage === next.deal.resolvedImage &&
    prev.deal.platform === next.deal.platform &&
    prev.deal.type === next.deal.type &&
    prev.deal.timeLeft === next.deal.timeLeft &&
    prev.deal.endDate === next.deal.endDate &&
    prev.deal.expiresAt === next.deal.expiresAt &&
    prev.deal.worth === next.deal.worth &&
    prev.deal.steamRatingPercent === next.deal.steamRatingPercent &&
    prev.deal.steamReviewCount === next.deal.steamReviewCount &&
    prev.deal.is18Plus === next.deal.is18Plus &&
    prev.deal.claimedUsers === next.deal.claimedUsers &&
    prev.isClaimed === next.isClaimed &&
    prev.showFooter === next.showFooter &&
    prev.onPress === next.onPress &&
    prev.onLongPress === next.onLongPress &&
    prev.onClaim === next.onClaim
  );
}

export const BannerCard = React.memo(BannerCardComponent, areBannerPropsEqual);

const styles = StyleSheet.create({
  // ─── Poster Styles ──────────────────────────────────────────────────────────
  posterContainer: {
    cursor: 'pointer' as any,
    width: '100%',
  },
  posterArt: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    backgroundColor: '#0C0C0C',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    position: 'relative',
  },
  posterRatingBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    zIndex: 3,
  },
  posterRatingText: {
    fontFamily: FONTS.bold,
    fontSize: 10,
    color: '#EDEDEB',
    textShadowColor: 'rgba(0, 0, 0, 0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  posterTitle: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    lineHeight: 19,
    color: COLORS.text,
    marginTop: 8,
    marginBottom: 3,
    letterSpacing: -0.3,
  },
  posterMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  plainRatingText: {
    fontFamily: FONTS.bold,
    fontSize: 10,
    color: '#EDEDEB',
    letterSpacing: 0.3,
  },
  metaDot: {
    color: '#636366',
    fontSize: 10,
  },
  posterPriceRow: {
    marginTop: 4,
  },
  posterBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  landscapeBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  cardRatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
  },
  cardRatingStar: {
    marginRight: 3,
  },
  cardRatingRight: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    fontWeight: '700',
    color: '#EDEDEB',
    letterSpacing: 0.2,
  },
  claimedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  claimedPlainText: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    color: '#8E8E93',
  },
  posterClaimedPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  posterClaimedText: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    color: '#8E8E93',
  },
  posterStoreName: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    fontWeight: '600',
    color: '#86868B',
    letterSpacing: 0.2,
  },
  posterVaultDeleteBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderWidth: 1,
    borderColor: '#3A3A3D',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  posterVaultDeleteText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    fontWeight: '700',
    color: '#EDEDEB',
    lineHeight: 13,
  },

  // ─── Banner Styles (16:9 Art on Top, Elevated Dark Info Strip Below) ────────
  bannerContainer: {
    width: '100%',
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: '#111317',
  },
  bannerArt: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#0C0C0C',
    position: 'relative',
    overflow: 'hidden',
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
  },
  bannerUrgentScrimBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: COLORS.badgeUrgentBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.badgeUrgentBorder,
    zIndex: 3,
  },
  bannerUrgentScrimText: {
    fontFamily: FONTS.mono,
    fontSize: 9.5,
    fontWeight: '700',
    color: COLORS.badgeUrgentText,
    letterSpacing: 0.4,
  },
  bannerRatingBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 3,
  },
  bannerRatingText: {
    fontFamily: FONTS.bold,
    fontSize: 10,
    color: '#EDEDEB',
    textShadowColor: 'rgba(0, 0, 0, 0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  bannerMetaRatingPill: {
    marginLeft: 'auto',
  },
  bannerMetaRatingText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    fontWeight: '600',
    color: '#86868B',
  },
  bannerInfoStrip: {
    backgroundColor: '#111317',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 8,
  },
  bannerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bannerStoreText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    fontWeight: '600',
    color: '#86868B',
    letterSpacing: 0.2,
  },
  bannerTitle: {
    fontFamily: FONTS.extraBold,
    fontSize: 20,
    lineHeight: 25,
    color: '#EDEDEB',
    letterSpacing: -0.4,
  },
  bannerActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  bannerPriceAndTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  bannerDotSeparator: {
    color: '#4D4D52',
    fontSize: 14,
    fontWeight: '700',
  },
  bannerTimeNum: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    fontWeight: '600',
    color: '#86868B',
    letterSpacing: 0.3,
  },
  bannerTimeNumUrgent: {
    color: COLORS.badgeUrgentText,
    fontWeight: '700',
  },
  bannerInfinityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  bannerInfinitySymbol: {
    fontSize: 26,
    lineHeight: 28,
    fontWeight: '800',
    color: '#EDEDEB',
    letterSpacing: -0.5,
  },
  bannerInfinitySub: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    fontWeight: '600',
    color: '#86868B',
    letterSpacing: 0.5,
  },
  stripBtn: {
    borderRadius: RADIUS.button,
    paddingVertical: 8,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripBtnClaim: {
    backgroundColor: '#FFFFFF',
  },
  stripBtnClaimed: {
    backgroundColor: COLORS.badgeClaimedBg,
    borderWidth: 1,
    borderColor: COLORS.badgeClaimedBorder,
  },
  stripBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    letterSpacing: 0.3,
  },
  stripBtnTextClaim: {
    color: '#0A0A0C',
  },
  stripBtnTextClaimed: {
    color: COLORS.badgeClaimedText,
  },

  feedCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  feedCardFooterMeta: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    fontWeight: '500',
    color: '#86868B',
    letterSpacing: 0.5,
  },
  feedCardFooterRating: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    fontWeight: '500',
    color: '#EDEDEB',
  },
  gatedPosterSurface: {
    ...(StyleSheet.absoluteFill as any),
    backgroundColor: '#121214',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderWidth: 1,
    borderColor: '#262629',
  },
  gatedBannerSurface: {
    ...(StyleSheet.absoluteFill as any),
    backgroundColor: '#121214',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderWidth: 1,
    borderColor: '#262629',
  },
  gated18Badge: {
    backgroundColor: 'rgba(239, 68, 68, 0.16)',
    borderWidth: 0.5,
    borderColor: 'rgba(239, 68, 68, 0.45)',
    borderRadius: RADIUS.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 6,
  },
  gated18BadgeText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: '#F87171',
    letterSpacing: 0.5,
  },
  gatedPosterTitle: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: '#EDEDEB',
    textAlign: 'center',
    marginBottom: 3,
  },
  gatedPosterSub: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: '#86868B',
    textAlign: 'center',
  },
  gatedBannerTitle: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: '#EDEDEB',
    textAlign: 'center',
    marginBottom: 3,
  },
  gatedBannerSub: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: '#86868B',
    textAlign: 'center',
  },

  // ─── Landscape Card Styles (Top Rated Rail) ─────────────────────────────────
  landscapeContainer: {
    width: '100%',
    overflow: 'hidden',
  },
  landscapeArt: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: '#111317',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  landscapeRatingBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 3,
  },
  landscapeRatingText: {
    fontFamily: FONTS.bold,
    fontSize: 9.5,
    color: '#EDEDEB',
    textShadowColor: 'rgba(0, 0, 0, 0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  landscapeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  landscapeStoreName: {
    flex: 1,
    fontFamily: FONTS.mono,
    fontSize: 10,
    fontWeight: '600',
    color: '#86868B',
    letterSpacing: 0.2,
  },
  landscapeTitle: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    lineHeight: 19,
    color: COLORS.text,
    marginTop: 5,
    marginBottom: 2,
    letterSpacing: -0.3,
  },
  landscapePriceRow: {
    marginTop: 2,
  },
});
