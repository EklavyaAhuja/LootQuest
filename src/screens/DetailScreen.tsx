import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Share,
  Platform,
  StatusBar,
  Animated,
  Vibration,
  AccessibilityInfo,
  Image,
  Modal,
  Dimensions,
  SafeAreaView,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, RADIUS } from '../theme/theme';
import { Deal } from '../models/Deal';
import { dealsStore } from '../services/dealsStore';
import { extractSteamAppId, parseDateToMs, getGiveawayHostName } from '../utils/dealUtils';
import * as WebBrowser from 'expo-web-browser';
import GameArtwork from '../components/GameArtwork';
import CountdownClock from '../components/CountdownClock';
import StoreIcon, { storeShortName } from '../components/StoreIcon';
import TypeBadge from '../components/TypeBadge';
import Price from '../components/Price';
import { useSafeAreaInsets } from '../utils/useSafeAreaInsets';
import { LinearGradient } from '../components/LinearGradient';
import Gate18PlusModal from '../components/Gate18PlusModal';

interface DetailScreenProps {
  deal: Deal;
  onClose: () => void;
  onClaimed?: (deal: Deal) => void;
}

export default function DetailScreen({ deal, onClose, onClaimed }: DetailScreenProps) {
  const [storeVersion, setStoreVersion] = useState(0);
  const [isClaimed, setIsClaimed] = useState(() => dealsStore.isClaimed(deal.id));
  const [descExpanded, setDescExpanded] = useState(false);
  const [isReduceMotion, setIsReduceMotion] = useState(false);
  const [show18Warning, setShow18Warning] = useState(
    () => deal.is18Plus && !dealsStore.is18PlusRevealed(deal.id) && !dealsStore.getAlwaysShow18Plus()
  );

  // Screenshots Gallery State (Steam & Epic)
  const [screenshots, setScreenshots] = useState<Array<{ id: number; path_thumbnail: string; path_full: string }>>([]);
  const [selectedScreenshotIndex, setSelectedScreenshotIndex] = useState<number | null>(null);

  // Animations for Claim Moment
  const popScale = useRef(new Animated.Value(1)).current;
  const floatY = useRef(new Animated.Value(14)).current;
  const floatOpacity = useRef(new Animated.Value(0)).current;
  const borderFlashAnim = useRef(new Animated.Value(0)).current;
  const holdProgress = useRef(new Animated.Value(0)).current;

  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const holdStartedRef = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setIsReduceMotion);
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setIsReduceMotion);
    return () => sub?.remove?.();
  }, []);

  // Subscribe to dealsStore for live updates to this deal
  useEffect(() => {
    setIsClaimed(dealsStore.isClaimed(deal.id));
    const unsub = dealsStore.subscribe(() => {
      setIsClaimed(dealsStore.isClaimed(deal.id));
      setStoreVersion((v) => v + 1);
    });
    return () => unsub();
  }, [deal.id]);

  // Read latest live version of deal from central store
  const currentDeal = useMemo(() => {
    const fromActive = dealsStore.getActiveDeals().find((d) => d.id === deal.id);
    if (fromActive) return fromActive;
    const fromVault = dealsStore.getVaultItems('All').find((d) => d.id === deal.id);
    if (fromVault) return fromVault;
    return deal;
  }, [deal, storeVersion]);

  // Real giveaway link vs Store link
  const giveawayTargetUrl = currentDeal.giveawayUrl || currentDeal.url;

  // Trusted Steam app ID: read strictly from a Steam URL on the deal
  const trustedSteamAppId = useMemo(() => {
    const urls = [currentDeal.storeUrl, currentDeal.steamUrl, currentDeal.giveawayUrl, currentDeal.url]
      .filter(Boolean)
      .join(' ');
    return extractSteamAppId(urls);
  }, [currentDeal]);

  const steamStoreUrl =
    currentDeal.storeUrl && currentDeal.storeUrl.includes('steam')
      ? currentDeal.storeUrl
      : currentDeal.steamUrl || (trustedSteamAppId ? `https://store.steampowered.com/app/${trustedSteamAppId}` : null);

  // Fetch Screenshots on page open (Steam & Epic Games supported, guarded against hidden 18+)
  useEffect(() => {
    const is18PlusHidden = currentDeal.is18Plus && !dealsStore.is18PlusRevealed(currentDeal.id);
    if (is18PlusHidden) {
      setScreenshots([]);
      return;
    }

    let active = true;
    dealsStore.getScreenshotsForDeal(currentDeal).then((data) => {
      if (active && Array.isArray(data)) {
        setScreenshots(data);
      }
    });

    return () => {
      active = false;
    };
  }, [
    currentDeal.id,
    currentDeal.is18Plus,
    currentDeal.platform,
    currentDeal.title,
    currentDeal.steamUrl,
    currentDeal.storeUrl,
    currentDeal.giveawayUrl,
    currentDeal.url,
  ]);

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Free on ${currentDeal.platform}: ${currentDeal.title}! Claim it here: ${giveawayTargetUrl}`,
        url: giveawayTargetUrl,
        title: currentDeal.title,
      });
    } catch {}
  };

  const handleOpenSteam = async () => {
    if (!steamStoreUrl) return;
    try {
      await WebBrowser.openBrowserAsync(steamStoreUrl);
    } catch (e) {
      console.warn('Failed to open Steam store URL:', e);
    }
  };

  const triggerClaimMoment = async () => {
    if (Platform.OS === 'android') {
      try {
        Vibration.vibrate(20);
      } catch {}
    }

    setIsClaimed(true);

    try {
      await dealsStore.claimDeal(currentDeal);
      if (onClaimed) onClaimed(currentDeal);
    } catch (e) {
      console.error('Claim error:', e);
    }

    if (!isReduceMotion) {
      Animated.sequence([
        Animated.timing(popScale, {
          toValue: 1.04,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(popScale, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();

      floatY.setValue(14);
      floatOpacity.setValue(1);
      Animated.parallel([
        Animated.timing(floatY, {
          toValue: -22,
          duration: 1100,
          useNativeDriver: true,
        }),
        Animated.timing(floatOpacity, {
          toValue: 0,
          duration: 1100,
          useNativeDriver: true,
        }),
      ]).start();

      Animated.sequence([
        Animated.timing(borderFlashAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: false,
        }),
        Animated.timing(borderFlashAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: false,
        }),
      ]).start();
    }

    setTimeout(() => {
      if (giveawayTargetUrl) {
        WebBrowser.openBrowserAsync(giveawayTargetUrl).catch(() => {});
      }
    }, 450);
  };

  const handlePressIn = () => {
    if (isClaimed) return;
    holdStartedRef.current = true;
    Animated.timing(holdProgress, {
      toValue: 1,
      duration: 650,
      useNativeDriver: false,
    }).start();

    holdTimerRef.current = setTimeout(() => {
      if (holdStartedRef.current) {
        triggerClaimMoment();
      }
    }, 650);
  };

  const handlePressOut = () => {
    if (isClaimed) return;
    holdStartedRef.current = false;
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    Animated.timing(holdProgress, {
      toValue: 0,
      duration: 150,
      useNativeDriver: false,
    }).start();
  };

  const handleDirectPress = () => {
    if (isClaimed) {
      if (giveawayTargetUrl) {
        WebBrowser.openBrowserAsync(giveawayTargetUrl).catch(() => {});
      }
    } else {
      triggerClaimMoment();
    }
  };

  const borderColor = borderFlashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#1C1C1E', '#EDEDEB'],
  });

  const rawWorth = currentDeal.worth || currentDeal.originalPrice;
  const cleanWorthLabel = rawWorth ? (rawWorth.startsWith('+') ? rawWorth : `+${rawWorth}`) : '+FREE';

  const rawDesc = currentDeal.aboutGame || currentDeal.description || '';
  const descriptionText =
    rawDesc.trim() ||
    `${currentDeal.title} is currently available for free claim on ${currentDeal.platform}. Add it to your collection before the promotion concludes.`;
  const isDescLong = descriptionText.length > 180;

  const hostInfo = getGiveawayHostName(currentDeal);
  const insets = useSafeAreaInsets();

  // Ruled Metadata Rows - ONLY Developer, Publisher (if different), Release date, Genres, Steam rating
  const metaRows: Array<{ label: string; value: string }> = [];

  if (currentDeal.developer && currentDeal.developer !== 'N/A' && currentDeal.developer.trim().length > 0) {
    metaRows.push({ label: 'DEVELOPER', value: currentDeal.developer.trim() });
  }
  if (
    currentDeal.publisher &&
    currentDeal.publisher !== 'N/A' &&
    currentDeal.publisher.trim().length > 0 &&
    currentDeal.publisher.trim().toLowerCase() !== currentDeal.developer?.trim().toLowerCase()
  ) {
    metaRows.push({ label: 'PUBLISHER', value: currentDeal.publisher.trim() });
  }
  if (currentDeal.releaseDate && currentDeal.releaseDate !== 'N/A' && currentDeal.releaseDate.trim().length > 0) {
    metaRows.push({ label: 'RELEASE DATE', value: currentDeal.releaseDate.trim() });
  }
  if (currentDeal.genres && currentDeal.genres.length > 0) {
    metaRows.push({ label: 'GENRES', value: currentDeal.genres.join(', ') });
  }
  if (typeof currentDeal.steamRatingPercent === 'number') {
    const reviewNote = currentDeal.steamReviewCount ? ` (${currentDeal.steamReviewCount.toLocaleString()} reviews)` : '';
    metaRows.push({ label: 'STEAM RATING', value: `${currentDeal.steamRatingPercent}% positive${reviewNote}` });
  }

  const screenWidth = Dimensions.get('window').width;

  return (
    <Animated.View style={[styles.container, { borderColor }]}>
      <StatusBar barStyle="light-content" />

      {/* Top Status Bar Spacer: Keeps status bar clock/battery on solid black and prevents thumbnail overlap */}
      <View style={{ height: insets.top, backgroundColor: '#000000', width: '100%', zIndex: 40 }} />

      {/* Floating Header Bar (Top set to insets.top + 12) */}
      <View style={[styles.headerBar, { top: insets.top + 12 }]}>
        <Pressable onPress={onClose} hitSlop={12} style={styles.touchTarget48}>
          <Ionicons name="arrow-back" size={24} color="#EDEDEB" />
        </Pressable>

        <View style={styles.headerRightActions}>
          {steamStoreUrl && (
            <Pressable onPress={handleOpenSteam} hitSlop={12} style={[styles.touchTarget48, styles.steamHeaderBtn]}>
              <StoreIcon store="steam" size={24} color="#EDEDEB" />
            </Pressable>
          )}

          <Pressable onPress={handleShare} hitSlop={12} style={styles.touchTarget48}>
            <Ionicons name="share-outline" size={24} color="#EDEDEB" />
          </Pressable>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scrollContent, { paddingBottom: 130 + insets.bottom }]}>
        {/* 16/10 Aspect Ratio Artwork */}
        <View style={styles.artworkContainer}>
          <GameArtwork
            deal={currentDeal}
            uri={currentDeal.resolvedImage || currentDeal.image}
            title={currentDeal.title}
            platform={currentDeal.platform}
            isNsfw={currentDeal.isNsfw}
            isHero={true}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              styles.heroTopFade,
              { height: 50 },
            ]}
            pointerEvents="none"
          >
            <LinearGradient
              colors={['rgba(0, 0, 0, 0.6)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </View>
        </View>

        {/* Tagline: TypeBadge + Claim Method + StoreIcon + Store Name + Steam Rating */}
        <View style={styles.taglineRow}>
          <TypeBadge type={currentDeal.type} size="md" />
          <Text style={styles.claimMethodPlain}>
            {currentDeal.claimMethod === 'tasks' ? 'TASKS REQUIRED' : 'ONE-CLICK'}
          </Text>
          <StoreIcon store={hostInfo.isTaskHost ? hostInfo.host : currentDeal.platform} size={14} color="#FFFFFF" />
          <Text style={styles.taglineText}>
            {(hostInfo.isTaskHost ? hostInfo.host : storeShortName(currentDeal.platform)).toUpperCase()}
          </Text>
          {typeof currentDeal.steamRatingPercent === 'number' && (
            <View style={styles.steamRatingBadge}>
              <Text style={styles.steamRatingBadgeText}>★ {currentDeal.steamRatingPercent}% STEAM</Text>
            </View>
          )}
        </View>

        {/* Main Title */}
        <Text style={styles.title}>{currentDeal.title}</Text>

        {/* Tabular Countdown Clock */}
        <View style={styles.clockWrap}>
          <CountdownClock
            endDate={currentDeal.endDate || currentDeal.expiresAt}
            startDate={currentDeal.createdAt ? new Date(currentDeal.createdAt).toISOString() : undefined}
            size="md"
          />
        </View>

        {/* Price Component */}
        <Price
          worth={currentDeal.worth || currentDeal.originalPrice}
          isEstimated={currentDeal.isEstimated}
          size="lg"
          style={styles.priceRow}
        />

        {/* Screenshot Gallery Strip (Steam & Epic Games) */}
        {screenshots.length > 0 && (
          <View style={styles.screenshotStripSection}>
            <Text style={styles.sectionLabel}>SCREENSHOTS</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.screenshotStripScroll}
            >
              {screenshots.map((s, index) => (
                <Pressable
                  key={s.id || index}
                  onPress={() => setSelectedScreenshotIndex(index)}
                  style={styles.screenshotThumbContainer}
                  accessibilityRole="imagebutton"
                  accessibilityLabel={`View screenshot ${index + 1}`}
                >
                  <Image
                    source={{ uri: s.path_thumbnail }}
                    style={styles.screenshotThumbImage}
                    resizeMode="cover"
                  />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* About / Description with Read More Toggle */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionLabel}>ABOUT THE GAME</Text>
          <Text numberOfLines={descExpanded || !isDescLong ? undefined : 3} style={styles.descriptionText}>
            {descriptionText}
          </Text>
          {isDescLong && (
            <Pressable onPress={() => setDescExpanded(!descExpanded)} hitSlop={8} style={styles.readMoreBtn}>
              <Text style={styles.readMoreText}>{descExpanded ? 'Read less ↑' : 'Read more ↓'}</Text>
            </Pressable>
          )}
        </View>

        {/* Claim Instructions if available */}
        {currentDeal.instructions && currentDeal.instructions.trim().length > 0 && (
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionLabel}>HOW TO CLAIM</Text>
            <Text style={styles.instructionsText}>{currentDeal.instructions.trim()}</Text>
          </View>
        )}

        {/* Ruled Metadata Rows (Hidden completely if no metadata available) */}
        {metaRows.length > 0 && (
          <View style={styles.ruledSection}>
            <Text style={[styles.sectionLabel, { marginBottom: 10 }]}>METADATA</Text>
            {metaRows.map((row, idx) => (
              <View key={idx} style={styles.ruledRow}>
                <Text style={styles.ruledLabel}>{row.label}</Text>
                <Text numberOfLines={2} style={styles.ruledValue}>
                  {row.value}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Floating Bottom CTA */}
      <View style={[styles.ctaContainer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.floatLabelContainer,
            {
              opacity: floatOpacity,
              transform: [{ translateY: floatY }],
            },
          ]}
        >
          <Text style={styles.floatLabelText}>{cleanWorthLabel}</Text>
        </Animated.View>

        <Animated.View style={{ transform: [{ scale: popScale }], width: '100%' }}>
          <Pressable
            onPress={handleDirectPress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            style={[styles.ctaBtn, isClaimed && styles.ctaBtnClaimed]}
          >
            {!isClaimed && (
              <Animated.View
                style={[
                  styles.ctaHoldFill,
                  {
                    width: holdProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            )}
            <Text style={[styles.ctaBtnText, isClaimed && styles.ctaBtnTextClaimed]}>
              {isClaimed
                ? 'Claimed ✓'
                : hostInfo.isTaskHost
                ? `Enter on ${hostInfo.host}`
                : `Claim on ${currentDeal.platform}`}
            </Text>
          </Pressable>
        </Animated.View>
      </View>

      {/* Full-screen Screenshot Modal Viewer */}
      <Modal
        visible={selectedScreenshotIndex !== null}
        transparent={true}
        statusBarTranslucent={true}
        animationType="fade"
        onRequestClose={() => setSelectedScreenshotIndex(null)}
      >
        <View style={styles.modalRootContainer}>
          <StatusBar backgroundColor="#000000" barStyle="light-content" translucent={true} />
          <View style={[styles.modalHeaderBar, { paddingTop: insets.top + 8 }]}>
            <Pressable
              onPress={() => setSelectedScreenshotIndex(null)}
              hitSlop={12}
              style={styles.modalCloseBtn48}
              accessibilityRole="button"
              accessibilityLabel="Close screenshot gallery"
            >
              <Ionicons name="close" size={28} color="#EDEDEB" />
            </Pressable>
            <Text style={styles.modalCounter}>
              {selectedScreenshotIndex !== null ? selectedScreenshotIndex + 1 : 1} / {screenshots.length}
            </Text>
            <View style={{ width: 48 }} />
          </View>

          <View style={styles.modalGalleryContainer}>
            <FlatList
              data={screenshots}
              keyExtractor={(item, idx) => String(item.id || idx)}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={selectedScreenshotIndex ?? 0}
              getItemLayout={(_, index) => ({
                length: screenWidth,
                offset: screenWidth * index,
                index,
              })}
              onMomentumScrollEnd={(e) => {
                const nextIdx = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
                setSelectedScreenshotIndex(nextIdx);
              }}
              renderItem={({ item }) => (
                <View style={[styles.modalImageWrapper, { width: screenWidth }]}>
                  <Image
                    source={{ uri: item.path_full }}
                    style={styles.modalFullImage}
                    resizeMode="contain"
                  />
                </View>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* 18+ Mature Content Gate Modal */}
      <Gate18PlusModal
        visible={!!show18Warning}
        dealId={currentDeal.id}
        onClose={() => {
          setShow18Warning(false);
          if (!dealsStore.is18PlusRevealed(currentDeal.id) && !dealsStore.getAlwaysShow18Plus()) {
            onClose();
          }
        }}
        onRevealed={() => {
          setShow18Warning(false);
          dealsStore.getScreenshotsForDeal(currentDeal).then((data) => {
            if (Array.isArray(data)) setScreenshots(data);
          });
        }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  steamRatingBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    marginLeft: 4,
  },
  steamRatingBadgeText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    fontWeight: '700',
    color: '#EDEDEB',
    letterSpacing: 0.5,
  },
  container: {
    flex: 1,
    backgroundColor: '#000000',
    borderWidth: 1,
  },
  headerBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : (StatusBar.currentHeight ? StatusBar.currentHeight + 14 : 44),
    left: 16,
    right: 16,
    zIndex: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  touchTarget48: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  steamHeaderBtn: {},
  scrollContent: {
    paddingBottom: 130,
  },
  artworkContainer: {
    width: '100%',
    aspectRatio: 16 / 10,
    backgroundColor: '#0C0C0E',
  },
  heroTopFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
  },
  taglineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    marginTop: 20,
    gap: 8,
  },
  claimMethodPlain: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: '#86868B',
    marginHorizontal: 4,
  },
  taglineText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    color: '#EDEDEB',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  title: {
    fontFamily: FONTS.serif,
    fontSize: 34,
    lineHeight: 38,
    color: '#EDEDEB',
    letterSpacing: -0.5,
    paddingHorizontal: 20,
    marginTop: 12,
  },
  clockWrap: {
    paddingHorizontal: 20,
    marginTop: 16,
  },
  priceRow: {
    paddingHorizontal: 20,
    marginTop: 12,
  },
  screenshotStripSection: {
    marginTop: 24,
  },
  screenshotStripScroll: {
    paddingHorizontal: 20,
    gap: 10,
    marginTop: 10,
  },
  screenshotThumbContainer: {
    width: 128,
    height: 72,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  screenshotThumbImage: {
    width: '100%',
    height: '100%',
  },
  sectionWrap: {
    paddingHorizontal: 20,
    marginTop: 28,
  },
  sectionLabel: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    fontWeight: '700',
    color: '#86868B',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  descriptionText: {
    fontFamily: FONTS.regular,
    fontSize: 14.5,
    lineHeight: 22,
    color: '#EDEDEB',
    marginTop: 8,
  },
  readMoreBtn: {
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  readMoreText: {
    fontFamily: FONTS.mono,
    fontSize: 11.5,
    color: COLORS.accent,
    fontWeight: '600',
  },
  instructionsText: {
    fontFamily: FONTS.regular,
    fontSize: 13.5,
    lineHeight: 20,
    color: '#86868B',
    marginTop: 8,
  },
  ruledSection: {
    paddingHorizontal: 20,
    marginTop: 32,
  },
  ruledRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  ruledLabel: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    color: '#86868B',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    flex: 1,
  },
  ruledValue: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: '#EDEDEB',
    textAlign: 'right',
    flex: 1.5,
  },
  ctaContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    paddingTop: 14,
    backgroundColor: '#000000',
    borderTopWidth: 1,
    borderTopColor: '#1C1C1E',
    alignItems: 'center',
  },
  floatLabelContainer: {
    position: 'absolute',
    top: -24,
    alignSelf: 'center',
    zIndex: 20,
  },
  floatLabelText: {
    fontFamily: FONTS.serif,
    fontSize: 28,
    color: COLORS.accent,
    letterSpacing: -0.5,
  },
  ctaBtn: {
    width: '100%',
    height: 50,
    borderRadius: 8,
    backgroundColor: '#EDEDEB',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  ctaBtnClaimed: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#3A3A3D',
  },
  ctaHoldFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#EDEDEB',
    opacity: 0.25,
  },
  ctaBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: '#000000',
    letterSpacing: 0.3,
    zIndex: 2,
  },
  ctaBtnTextClaimed: {
    color: '#86868B',
  },
  modalRootContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  modalHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#000000',
    zIndex: 10,
  },
  modalCloseBtn48: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  modalCounter: {
    fontFamily: FONTS.mono,
    fontSize: 13,
    color: '#EDEDEB',
    letterSpacing: 1,
  },
  modalGalleryContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 40,
    backgroundColor: '#000000',
  },
  modalImageWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  modalFullImage: {
    width: '100%',
    height: '100%',
  },
});
