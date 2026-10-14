import React, { useRef, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Animated,
  StyleProp,
  ViewStyle,
} from 'react-native';
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

export const PosterCard = React.memo(function PosterCard({
  deal,
  onPress,
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
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      friction: 6,
      tension: 140,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 5,
      tension: 100,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  // Ensure animation always resets to 1 if unmounted or gesture is interrupted
  useEffect(() => {
    return () => {
      scaleAnim.setValue(1);
    };
  }, [scaleAnim]);

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
  };

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
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onTouchEnd={handlePressOut}
        onTouchCancel={handlePressOut}
        style={styles.posterContainer}
      >
        {/* Artwork Container (NO text/store tags on thumbnail, clean cover) */}
        <View style={[styles.posterArt, artAspectRatio ? { aspectRatio: artAspectRatio } : null]}>
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

          {/* Rating Badge (top-left): only when real rating exists and not gated */}
          {!isGated && showRating && ratingPercent ? (
            <View style={styles.posterRatingBadge}>
              <Text style={styles.posterRatingText}>★ {ratingPercent}% Steam</Text>
            </View>
          ) : null}

          {/* Vault Delete Button (in case of misclick) - radius 6 */}
          {isVault && onDelete ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                onDelete(deal);
              }}
              style={styles.posterVaultDeleteBtn}
              hitSlop={8}
            >
              <Text style={styles.posterVaultDeleteText}>✕</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Clean Title */}
        <Text numberOfLines={1} style={styles.posterTitle}>
          {cleanedTitle}
        </Text>

        {/* Line 1: Type tag + Store icon + Store name (single location, not duplicated on art) */}
        <View style={styles.posterMetaRow}>
          <TypeBadge type={deal.type} size="sm" />
          <StoreIcon store={hostInfo.isTaskHost ? hostInfo.host : deal.platform} size={11} color="#EDEDEB" />
          <Text numberOfLines={1} style={styles.posterStoreName}>
            {displayStore}
          </Text>
        </View>

        {/* Line 2: <Price /> or Claimed ✓ */}
        <View style={styles.posterPriceRow}>
          {isClaimed && !isVault ? (
            <Text style={styles.posterClaimedText}>Claimed ✓</Text>
          ) : (
            <Price worth={deal.worth || deal.originalPrice} isEstimated={deal.isEstimated} size="sm" />
          )}
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
});

// ─── Unified Landscape Card (Top Rated Rail) ──────────────────────────────────
export interface LandscapeCardProps {
  deal: Deal;
  onPress: (deal: Deal) => void;
  width?: number;
  style?: StyleProp<ViewStyle>;
  imageErrors?: Record<string, boolean>;
  onImageError?: (id: string) => void;
}

export const LandscapeCard = React.memo(function LandscapeCard({
  deal,
  onPress,
  width = 270,
  style,
  imageErrors,
  onImageError,
}: LandscapeCardProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      friction: 6,
      tension: 140,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 5,
      tension: 100,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  useEffect(() => {
    return () => {
      scaleAnim.setValue(1);
    };
  }, [scaleAnim]);

  const [show18Modal, setShow18Modal] = React.useState(false);
  const isGated = deal.is18Plus && !dealsStore.is18PlusRevealed(deal.id);

  const handleCardPress = () => {
    if (isGated) {
      setShow18Modal(true);
      return;
    }
    onPress(deal);
  };

  const hostInfo = getGiveawayHostName(deal);
  const displayStore = hostInfo.isTaskHost ? hostInfo.host : storeShortName(deal.platform);
  const cleanedTitle = isGated ? '18+ game' : cleanDisplayTitle(deal.title);

  const hasRealRating =
    typeof deal.steamRatingPercent === 'number' &&
    deal.steamRatingPercent > 0 &&
    (deal.steamReviewCount ? deal.steamReviewCount >= 10 : true);
  const ratingPercent = hasRealRating ? deal.steamRatingPercent : null;

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
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onTouchEnd={handlePressOut}
        onTouchCancel={handlePressOut}
        style={styles.landscapeContainer}
      >
        {/* 16:9 Artwork with Cover (No blurred bars, no contain strip) */}
        <View style={styles.landscapeArt}>
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

          {/* Rating Badge (top-left on dark scrim) */}
          {!isGated && ratingPercent ? (
            <View style={styles.landscapeRatingBadge}>
              <Text style={styles.landscapeRatingText}>★ {ratingPercent}% Steam</Text>
            </View>
          ) : null}
        </View>

        {/* Info below art */}
        {/* Line 1: type tag + store icon + store name on one line */}
        <View style={styles.landscapeMetaRow}>
          <TypeBadge type={deal.type} size="sm" />
          <StoreIcon store={hostInfo.isTaskHost ? hostInfo.host : deal.platform} size={11} color="#EDEDEB" />
          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.landscapeStoreName}>
            {displayStore}
          </Text>
        </View>

        {/* Line 2: title (1 line, tail ellipsis) */}
        <Text numberOfLines={1} ellipsizeMode="tail" style={styles.landscapeTitle}>
          {cleanedTitle}
        </Text>

        {/* Line 3: then the Price */}
        <View style={styles.landscapePriceRow}>
          <Price worth={deal.worth || deal.originalPrice} isEstimated={deal.isEstimated} size="sm" />
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
});

export const TopRatedCard = LandscapeCard;

// ─── Unified Banner Card (.banner & .fi) ──────────────────────────────────────
interface BannerCardProps {
  deal: Deal;
  onPress: (deal: Deal) => void;
  onClaim?: (deal: Deal) => void;
  isClaimed?: boolean;
  style?: StyleProp<ViewStyle>;
  showFooter?: boolean;
  imageErrors?: Record<string, boolean>;
  onImageError?: (id: string) => void;
}

export const BannerCard = React.memo(function BannerCard({
  deal,
  onPress,
  onClaim,
  isClaimed,
  style,
  showFooter = false,
  imageErrors,
  onImageError,
}: BannerCardProps) {
  const isClaimedState = isClaimed !== undefined ? isClaimed : dealsStore.isClaimed(deal.id);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      friction: 6,
      tension: 140,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 5,
      tension: 100,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  // Ensure scale animation always resets to 1 if unmounted or interrupted
  useEffect(() => {
    return () => {
      scaleAnim.setValue(1);
    };
  }, [scaleAnim]);

  const [show18Modal, setShow18Modal] = React.useState(false);
  const isGated = deal.is18Plus && !dealsStore.is18PlusRevealed(deal.id);

  const handleCardPress = () => {
    if (isGated) {
      setShow18Modal(true);
      return;
    }
    onPress(deal);
  };

  const rawTime = deal.timeLeft || getTimeLeft(deal.expiresAt || deal.endDate);
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
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onTouchEnd={handlePressOut}
        onTouchCancel={handlePressOut}
        style={styles.bannerContainer}
      >
        {/* 16:9 Artwork on Top - No text or buttons on top of art */}
        <View style={styles.bannerArt}>
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

          {/* Optional small corner time badge on a dark scrim */}
          {!isGated && urgent && (
            <View style={styles.bannerUrgentScrimBadge}>
              <Text style={styles.bannerUrgentScrimText}>ENDING SOON</Text>
            </View>
          )}

          {/* Steam Rating Badge (top-left on dark scrim) */}
          {!isGated && ratingPercent ? (
            <View style={styles.bannerRatingBadge}>
              <Text style={styles.bannerRatingText}>★ {ratingPercent}% Steam</Text>
            </View>
          ) : null}
        </View>

        {/* Solid #000 Info Strip Below Art */}
        <View style={styles.bannerInfoStrip}>
          {/* Row 1: type tag + store icon + store name + rating pill */}
          <View style={styles.bannerMetaRow}>
            <TypeBadge type={deal.type} size="sm" />
            <StoreIcon store={hostInfo.isTaskHost ? hostInfo.host : deal.platform} size={12} color="#EDEDEB" />
            <Text numberOfLines={1} style={styles.bannerStoreText}>
              {displayStore}
            </Text>
            {!isGated && ratingPercent ? (
              <View style={styles.bannerMetaRatingPill}>
                <Text style={styles.bannerMetaRatingText}>★ {ratingPercent}%</Text>
              </View>
            ) : null}
          </View>

          {/* Row 2: title (max 2 lines) */}
          <Text numberOfLines={2} style={styles.bannerTitle}>
            {cleanedTitle}
          </Text>

          {/* Row 3: <Price /> and time left on one row, and the claim button in that strip */}
          <View style={styles.bannerActionRow}>
            <View style={styles.bannerPriceAndTime}>
              <Price
                worth={deal.worth || deal.originalPrice}
                isEstimated={deal.isEstimated}
                size="sm"
              />
              <Text style={styles.bannerDotSeparator}>·</Text>
              {timeInfo.main === '∞' ? (
                <View style={styles.bannerInfinityRow}>
                  <Text style={styles.bannerInfinitySymbol}>∞</Text>
                  <Text style={styles.bannerInfinitySub}>NO EXPIRY</Text>
                </View>
              ) : (
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

            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                if (isGated) {
                  setShow18Modal(true);
                  return;
                }
                onClaim ? onClaim(deal) : onPress(deal);
              }}
              style={[
                styles.stripBtn,
                isClaimedState ? styles.stripBtnClaimed : styles.stripBtnClaim,
              ]}
            >
              <Text
                style={[
                  styles.stripBtnText,
                  isClaimedState ? styles.stripBtnTextClaimed : styles.stripBtnTextClaim,
                ]}
              >
                {isGated ? 'Tap to view' : isClaimedState ? 'Claimed ✓' : (hostInfo.isTaskHost ? 'Enter' : 'Claim')}
              </Text>
            </Pressable>
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
            <Text style={styles.feedCardFooterRating}>
              ★ {ratingPercent}% Steam
            </Text>
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
});

const styles = StyleSheet.create({
  // ─── Poster Styles ──────────────────────────────────────────────────────────
  posterContainer: {
    cursor: 'pointer' as any,
    width: '100%',
  },
  posterArt: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#0C0C0C',
    borderWidth: 1,
    borderColor: COLORS.border,
    position: 'relative',
  },
  posterRatingBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#1C1C1E',
    zIndex: 3,
  },
  posterRatingText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    fontWeight: '600',
    color: '#EDEDEB',
  },
  posterTitle: {
    fontFamily: FONTS.serif,
    fontSize: 20,
    lineHeight: 22,
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
  posterPriceRow: {
    marginTop: 4,
  },
  posterClaimedText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    fontWeight: '700',
    color: '#EDEDEB',
    letterSpacing: 0.5,
  },
  posterStoreName: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    fontWeight: '600',
    color: '#86868B',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
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

  // ─── Banner Styles (16:9 Art on Top, Solid #000 Info Strip Below) ───────────
  bannerContainer: {
    width: '100%',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    backgroundColor: '#000000',
  },
  bannerArt: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#0C0C0C',
    position: 'relative',
    overflow: 'hidden',
  },
  bannerUrgentScrimBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FF8A5B',
  },
  bannerUrgentScrimText: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    fontWeight: '800',
    color: '#FF8A5B',
    letterSpacing: 0.8,
  },
  bannerRatingBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#1C1C1E',
    zIndex: 3,
  },
  bannerRatingText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    fontWeight: '700',
    color: '#EDEDEB',
  },
  bannerMetaRatingPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    marginLeft: 'auto',
  },
  bannerMetaRatingText: {
    fontFamily: FONTS.mono,
    fontSize: 9.5,
    fontWeight: '700',
    color: '#EDEDEB',
  },
  bannerInfoStrip: {
    backgroundColor: '#000000',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
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
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  bannerTitle: {
    fontFamily: FONTS.serif,
    fontSize: 24,
    lineHeight: 27,
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
    color: '#FF8A5B',
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
    borderRadius: 7,
    paddingVertical: 7,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripBtnClaim: {
    backgroundColor: '#EDEDEB',
  },
  stripBtnClaimed: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#3A3A3D',
  },
  stripBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    letterSpacing: 0.4,
  },
  stripBtnTextClaim: {
    color: '#000000',
  },
  stripBtnTextClaimed: {
    color: '#86868B',
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
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#121214',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderWidth: 1,
    borderColor: '#262629',
  },
  gatedBannerSurface: {
    ...StyleSheet.absoluteFillObject,
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
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
  },
  landscapeRatingBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#1C1C1E',
    zIndex: 3,
  },
  landscapeRatingText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    fontWeight: '600',
    color: '#EDEDEB',
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
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  landscapeTitle: {
    fontFamily: FONTS.serif,
    fontSize: 17,
    lineHeight: 21,
    color: COLORS.text,
    marginTop: 4,
    marginBottom: 2,
    letterSpacing: -0.3,
  },
  landscapePriceRow: {
    marginTop: 2,
  },
});
