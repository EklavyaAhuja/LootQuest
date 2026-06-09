import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Image,
  Animated,
  Easing,
  Platform,
  ActivityIndicator,
  LayoutAnimation,
  UIManager,
  Pressable,
} from 'react-native';
import { Deal } from '../models/Deal';
import { getCachedDeal, saveCachedDeal } from '../services/DealCache';
import { fetchBotComment } from '../services/redditService';
import { parseBotComment, getExpiryStatus, parseExpiryFromPostBody, checkIsFullyFree } from '../services/FGFBotParser';
import { expiredFeedService } from '../services/ExpiredFeedService';
import { tasksFeedService } from '../services/TasksFeedService';
import { enrichEpicDeal } from '../services/EpicGamesEnricher';
import { addClaimedPost, getClaimedPosts } from '../services/storageService';
import { fetchImageFromUrl } from '../utils/imageResolver';
import { COLORS, FONTS } from '../theme/theme';
import BouncyPressable from '../components/BouncyPressable';
import * as WebBrowser from 'expo-web-browser';
import Svg, { Path } from 'react-native-svg';
import {
  ArrowLeft,
  Terminal,
  Loader2,
  Calendar,
  Settings,
  Layers,
  Tag,
  Check,
} from 'lucide-react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface DetailScreenProps {
  deal: Deal;
  onClose: () => void;
}

const COVER_IMAGES = [
  'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=600&q=80',
];

export default function DetailScreen({ deal, onClose }: DetailScreenProps) {
  const [localDeal, setLocalDeal] = useState<Deal>(deal);
  const [enriching, setEnriching] = useState(false);
  const [nsfwApproved, setNsfwApproved] = useState(false);
  const [imageError, setImageError] = useState(false);
  
  // Interactive CTA state: 'idle' | 'claiming' | 'claimed'
  const [claimState, setClaimState] = useState<'idle' | 'claiming' | 'claimed'>('idle');

  // Animated width for progress bar
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Expandable text states
  const [isAboutExpanded, setIsAboutExpanded] = useState(false);

  const [expandedStats, setExpandedStats] = useState<Record<string, boolean>>({});

  const toggleStat = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedStats(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleAboutExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsAboutExpanded(!isAboutExpanded);
  };

  // Retrieve cover image
  const getGameCover = (id: string) => {
    let sum = 0;
    for (let i = 0; i < id.length; i++) {
      sum += id.charCodeAt(i);
    }
    return COVER_IMAGES[sum % COVER_IMAGES.length];
  };

  useEffect(() => {
    setImageError(false);
    let active = true;
    
    const loadAndEnrich = async () => {
      // Set baseline deal immediately
      setLocalDeal(deal);
      
      try {
        // 1. Check claimed status
        const claimed = await getClaimedPosts();
        if (active) {
          const isClaimed = claimed.some(p => p.id === deal.id);
          setClaimState(isClaimed ? 'claimed' : 'idle');
        }

        // 2. Check cache first
        const cached = await getCachedDeal(deal.id);
        if (cached) {
          if (active) {
            const isExpiredFromFlair = expiredFeedService.isExpired(deal.id);
            const isTaskFromFlair = tasksFeedService.isTask(deal.id);
            setLocalDeal({
              ...deal,
              ...cached,
              expiryStatus: isExpiredFromFlair ? 'EXPIRED' : cached.expiryStatus,
              claimMethod: isTaskFromFlair ? 'tasks' : (cached.claimMethod || deal.claimMethod)
            });
          }
          return;
        }

        // 3. Fallback: if details missing, enrich in background
        if (!deal.developer || !deal.expiresAt) {
          if (active) setEnriching(true);

          // Check if it's an Epic Games deal
          const isEpic = (deal.platform || '').toLowerCase().includes('epic') || (deal.url || '').toLowerCase().includes('epicgames.com');
          let epicData: any = null;
          if (isEpic) {
            epicData = await enrichEpicDeal(deal.title);
          }

          const botResult = await fetchBotComment(deal.id, deal.title);
          
          if (botResult) {
            const { body: botComment } = botResult;
            const parsed = parseBotComment(botComment);
            
            const isExpiredFromFlair = expiredFeedService.isExpired(deal.id);
            const isTaskFromFlair = tasksFeedService.isTask(deal.id);
            let expiresAt: string | undefined = undefined;
            if (parsed.isFullyFree === true) {
              expiresAt = parsed.expiresAt || parseExpiryFromPostBody(deal.description) || undefined;
            } else if (parsed.isFullyFree === false) {
              expiresAt = undefined;
            } else {
              const isFree = checkIsFullyFree(deal.title, deal.description);
              if (isFree) {
                expiresAt = parseExpiryFromPostBody(deal.description) || undefined;
              }
            }

            const finalExpiresAt = epicData?.expiresAt || expiresAt;

            let resolvedImage = epicData?.image || deal.image;
            if (!resolvedImage && parsed.storeUrl) {
              resolvedImage = await fetchImageFromUrl(parsed.storeUrl, deal.title);
            }
            if (!resolvedImage) {
              resolvedImage = await fetchImageFromUrl(deal.url, deal.title);
            }

            const enriched: Deal = {
              ...deal,
              originalPrice: parsed.originalPrice || undefined,
              currentPrice: parsed.price || undefined,
              expiresAt: finalExpiresAt,
              expiryStatus: isExpiredFromFlair ? 'EXPIRED' : (finalExpiresAt ? getExpiryStatus(finalExpiresAt) : 'UNKNOWN'),
              claimMethod: isTaskFromFlair ? 'tasks' : deal.claimMethod,
              developer: epicData?.developer || parsed.developer || undefined,
              releaseDate: parsed.releaseDate || undefined,
              genres: parsed.genres.length > 0 ? parsed.genres : undefined,
              achievements: parsed.achievements !== null ? parsed.achievements : undefined,
              tradingCards: parsed.tradingCards !== null ? parsed.tradingCards : undefined,
              reviewScore: parsed.reviewScore || undefined,
              steamDbRating: parsed.steamDbRating || undefined,
              aboutGame: epicData?.description || parsed.aboutGame || undefined,
              instructions: parsed.instructions || undefined,
              parserConfidence: parsed.parserConfidence,
              image: resolvedImage,
              url: epicData?.url || deal.url,
            };

            await saveCachedDeal(deal.id, enriched, botComment);
            if (active) setLocalDeal(enriched);
          } else {
            // No bot comment found: fallback to post body and flair status
            const isExpiredFromFlair = expiredFeedService.isExpired(deal.id);
            const isTaskFromFlair = tasksFeedService.isTask(deal.id);
            const isFree = checkIsFullyFree(deal.title, deal.description);
            const postBodyExpiry = isFree ? (parseExpiryFromPostBody(deal.description) || undefined) : undefined;
            
            const finalExpiresAt = epicData?.expiresAt || postBodyExpiry;

            let resolvedImage = epicData?.image || deal.image;
            if (!resolvedImage) {
              resolvedImage = await fetchImageFromUrl(deal.url, deal.title);
            }

            const enriched: Deal = {
              ...deal,
              expiresAt: finalExpiresAt,
              expiryStatus: isExpiredFromFlair ? 'EXPIRED' : (finalExpiresAt ? getExpiryStatus(finalExpiresAt) : 'UNKNOWN'),
              claimMethod: isTaskFromFlair ? 'tasks' : deal.claimMethod,
              developer: epicData?.developer || undefined,
              aboutGame: epicData?.description || undefined,
              image: resolvedImage,
              url: epicData?.url || deal.url,
            };
            await saveCachedDeal(deal.id, enriched, '');
            if (active) setLocalDeal(enriched);
          }
        }
      } catch (e) {
        console.error('[DetailScreen] Enrichment error:', e);
      } finally {
        if (active) setEnriching(false);
      }
    };

    loadAndEnrich();

    // Animate progress bar to 84% on load
    Animated.timing(progressAnim, {
      toValue: 0.84,
      duration: 1000,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();

    return () => {
      active = false;
    };
  }, [deal]);

  const handleClaim = async () => {
    if (claimState !== 'idle') return;

    setClaimState('claiming');
    
    try {
      WebBrowser.openBrowserAsync(localDeal.url);
    } catch (e) {
      console.error(e);
    }

    // Save game to claimed posts collection in local storage (mock cast)
    await addClaimedPost(localDeal as any);

    setTimeout(() => {
      setClaimState('claimed');
    }, 1500);
  };

  const handleOpenReddit = async () => {
    const redditUrl = localDeal.redditUrl || `https://www.reddit.com/comments/${localDeal.id}`;
    try {
      await WebBrowser.openBrowserAsync(redditUrl);
    } catch (e) {
      console.error('Failed to open Reddit URL:', e);
    }
  };

  const getOfferDisplayType = (type: Deal['type']) => {
    switch (type) {
      case 'full_game': return 'Whole Game';
      case 'dlc': return 'DLC';
      case 'beta': return 'Beta Access';
      case 'item': return 'In-Game Content';
      default: return 'Whole Game';
    }
  };

  const formatExpiryDate = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return '';
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const month = months[d.getUTCMonth()];
      const day = d.getUTCDate();
      const year = d.getUTCFullYear();
      
      const pad = (n: number) => n.toString().padStart(2, '0');
      const hours = pad(d.getUTCHours());
      const minutes = pad(d.getUTCMinutes());
      
      return `${month} ${day}, ${year} at ${hours}:${minutes} UTC`;
    } catch {
      return '';
    }
  };

  const isExpired = localDeal.expiryStatus === 'EXPIRED';

  const isNsfwGame = deal.isNsfw || localDeal.isNsfw;

  if (isNsfwGame && !nsfwApproved) {
    return (
      <View style={styles.nsfwGateContainer}>
        {/* Top App Bar */}
        <View style={styles.header}>
          <View style={styles.statusBarSpacer} />
          <View style={styles.headerContent}>
            <Pressable onPress={onClose} style={styles.backButton}>
              <ArrowLeft size={22} color={COLORS.primary} />
            </Pressable>

            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerText}>LOOTQUEST</Text>
            </View>

            <View style={{ width: 44 }} />
          </View>
        </View>

        <View style={styles.nsfwGateContent}>
          <View style={styles.nsfwGateBadge}>
            <Text style={styles.nsfwGateBadgeText}>18+ RESTRICTED</Text>
          </View>
          
          <Text style={styles.nsfwGateTitle}>NSFW CONTENT DETECTED</Text>
          <Text style={styles.nsfwGateDescription}>
            This game is NSFW. Do you want to see the game?
          </Text>

          <View style={styles.nsfwGateButtonRow}>
            <BouncyPressable
              onPress={() => setNsfwApproved(true)}
              backgroundColor="#ef4444"
              borderRadius={12}
              shadowOffsetSize={0}
              style={styles.nsfwGateBtn}
              contentStyle={styles.nsfwGateBtnContent}
            >
              <Text style={styles.nsfwGateBtnText}>YES, PROCEED</Text>
            </BouncyPressable>

            <BouncyPressable
              onPress={onClose}
              backgroundColor="#1e293b"
              borderRadius={12}
              shadowOffsetSize={0}
              style={styles.nsfwGateBtn}
              contentStyle={[styles.nsfwGateBtnContent, { borderWidth: 1, borderColor: '#334155' }]}
            >
              <Text style={[styles.nsfwGateBtnText, { color: '#ffffff' }]}>NO, GO BACK</Text>
            </BouncyPressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top App Bar */}
      <View style={styles.header}>
        <View style={styles.statusBarSpacer} />
        <View style={styles.headerContent}>
          <Pressable onPress={onClose} style={styles.backButton}>
            <ArrowLeft size={22} color={COLORS.primary} />
          </Pressable>

          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerText}>LOOTQUEST</Text>
          </View>

          <Pressable onPress={onClose} style={styles.settingsButton}>
            <Settings size={22} color={COLORS.text} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 1. Hero Image with Overlay Category & Title */}
        <View style={styles.heroSection}>
          <Image 
            source={{ uri: (!imageError && localDeal.image && localDeal.image !== 'placeholder') ? localDeal.image : getGameCover(localDeal.id) }} 
            style={styles.heroImage as any} 
            onError={() => setImageError(true)}
          />
          <View style={styles.heroOverlay} />
          
          <View style={styles.heroDetailsOverlay}>
            {localDeal.genres && localDeal.genres.length > 0 ? (
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {localDeal.genres.slice(0, 2).map((genre, idx) => (
                  <View key={idx} style={styles.genreBadge}>
                    <Text style={styles.genreBadgeText}>
                      {genre.toUpperCase()}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            <View style={styles.titleRow}>
              <Text style={styles.heroTitleText}>
                {localDeal.title}
              </Text>
              <Pressable
                onPress={handleOpenReddit}
                style={styles.redditIconBtn}
                accessibilityLabel="Open Reddit post"
              >
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="#FF4500">
                  <Path d="M24 11.5c0-1.65-1.35-3-3-3-.96 0-1.86.48-2.42 1.24-1.64-1-3.85-1.64-6.29-1.72l1.22-3.86 3.93.84c.02.93.79 1.68 1.73 1.68 1 0 1.8-.8 1.8-1.8s-.8-1.8-1.8-1.8c-.87 0-1.58.62-1.75 1.44l-4.3-.92c-.22-.05-.44.08-.51.3L11.02 8.16C8.54 8.24 6.3 8.88 4.63 9.9 4.07 9.14 3.17 8.66 2.2 8.66c-1.65 0-3 1.35-3 3 0 1.05.54 1.98 1.37 2.51-.07.44-.1.88-.1 1.33 0 4.69 5.37 8.5 12 8.5s12-3.81 12-8.5c0-.45-.03-.89-.1-1.33.83-.53 1.37-1.46 1.37-2.51zm-17.5 3c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm11.23 4.25c-.9 1-2.5 1.04-3.23 1.04s-2.33-.04-3.23-1.04c-.18-.2-.15-.5.05-.68.2-.18.5-.15.68.05.65.73 1.82.78 2.5.78s1.85-.05 2.5-.78c.18-.2.48-.23.68-.05.2.18.23.48.05.68zm-2.23-4.25c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
                </Svg>
              </Pressable>
            </View>
          </View>
        </View>

        {/* 2. Status Card */}
        <View style={[styles.statusCard, isExpired && styles.statusCardExpired]}>
          <View style={{ flex: 1, flexDirection: 'column' }}>
            <Text style={[styles.statusLabelText, isExpired && { color: '#ff8888' }]}>
              {isExpired ? '✗ Status: Expired' : '✓ Status: Not Expired'}
            </Text>
            {localDeal.expiresAt ? (
              <Text style={styles.statusExpiryText}>
                {isExpired ? 'Expired: ' : 'Expires: '}{formatExpiryDate(localDeal.expiresAt)}
              </Text>
            ) : (
              <Text style={styles.statusExpiryText}>
                No expiry date specified
              </Text>
            )}
          </View>
          <View style={[styles.liveBadge, isExpired && styles.liveBadgeExpired]}>
            <Text style={styles.liveBadgeText}>
              {isExpired ? 'EXPIRED' : 'LIVE'}
            </Text>
          </View>
        </View>

        {/* 3. Stats Grid (2x2) */}
        <View style={styles.statsGrid}>
          <View style={styles.statsRow}>
            {/* Card 1: Difficulty */}
            <Pressable onPress={() => toggleStat('difficulty')} style={styles.statCard}>
              <Layers size={18} color={COLORS.secondary} />
              <View style={styles.statInfo}>
                <Text style={styles.statLabel}>DIFFICULTY</Text>
                <Text numberOfLines={expandedStats['difficulty'] ? undefined : 1} style={styles.statValue}>
                  {localDeal.claimMethod === 'one_click' ? 'One click claim' : 'Tasks Required'}
                </Text>
              </View>
            </Pressable>

            {/* Card 2: Platform */}
            <Pressable onPress={() => toggleStat('platform')} style={styles.statCard}>
              <Terminal size={18} color={COLORS.secondary} />
              <View style={styles.statInfo}>
                <Text style={styles.statLabel}>PLATFORM</Text>
                <Text numberOfLines={expandedStats['platform'] ? undefined : 1} style={styles.statValue}>
                  {localDeal.platform}
                </Text>
              </View>
            </Pressable>
          </View>

          <View style={styles.statsRow}>
            {/* Card 3: Offer Type */}
            <Pressable onPress={() => toggleStat('offer')} style={styles.statCard}>
              <Tag size={18} color={COLORS.secondary} />
              <View style={styles.statInfo}>
                <Text style={styles.statLabel}>OFFER TYPE</Text>
                <Text numberOfLines={expandedStats['offer'] ? undefined : 1} style={styles.statValue}>
                  {localDeal.type === 'full_game' ? 'Full Game' : getOfferDisplayType(localDeal.type)}
                </Text>
              </View>
            </Pressable>

            {/* Card 4: Released */}
            <Pressable onPress={() => toggleStat('released')} style={styles.statCard}>
              <Calendar size={18} color={COLORS.secondary} />
              <View style={styles.statInfo}>
                <Text style={styles.statLabel}>RELEASED</Text>
                <Text numberOfLines={expandedStats['released'] ? undefined : 1} style={styles.statValue}>
                  {localDeal.releaseDate || 'Jan 2018'}
                </Text>
              </View>
            </Pressable>
          </View>
        </View>

        {/* 4. Description section */}
        <Pressable onPress={toggleAboutExpanded} style={styles.descriptionSection}>
          <Text style={styles.descriptionHeader}>
            {localDeal.title ? `The ${localDeal.title.replace(/:.*/, '')} Quest` : 'The Quest'}
          </Text>
          <Text numberOfLines={isAboutExpanded ? undefined : 4} style={styles.descriptionText}>
            {localDeal.aboutGame || localDeal.description || 'No description available.'}
          </Text>
        </Pressable>

        {enriching && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={COLORS.accent} />
            <Text style={styles.enrichingText}>Checking comments for extra loot details...</Text>
          </View>
        )}
      </ScrollView>

      {/* Floating Action CTA */}
      <View style={styles.floatingCtaContainer}>
        {claimState === 'idle' && (
          <BouncyPressable
            onPress={handleClaim}
            backgroundColor="#39ff14"
            borderRadius={12}
            shadowOffsetSize={0}
            style={styles.claimBtnMain}
            contentStyle={styles.claimBtnMainContent}
          >
            <Check size={22} color="#0b101e" />
            <Text style={styles.claimBtnMainText}>CLAIM LOOT</Text>
          </BouncyPressable>
        )}

        {claimState === 'claiming' && (
          <View style={[styles.staticCtaState, styles.claimingState]}>
            <Loader2 size={22} color="#0b101e" style={styles.spinIcon} />
            <Text style={styles.staticCtaText}>CLAIMING...</Text>
          </View>
        )}

        {claimState === 'claimed' && (
          <View style={[styles.staticCtaState, styles.claimedState]}>
            <Check size={22} color="#0b101e" />
            <Text style={styles.staticCtaText}>CLAIMED!</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    borderBottomWidth: 1,
    borderColor: '#334155',
    backgroundColor: COLORS.bg,
    zIndex: 50,
  },
  statusBarSpacer: {
    height: Platform.OS === 'ios' ? 36 : 12,
  },
  headerContent: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerText: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    color: COLORS.primary,
    letterSpacing: 1,
    textAlign: 'center',
  },
  scrollContent: {
    paddingBottom: 130,
  },
  heroSection: {
    height: 300,
    width: '100%',
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11, 16, 30, 0.55)',
  },
  heroDetailsOverlay: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
  },
  genreBadge: {
    borderWidth: 1,
    borderColor: '#39ff14',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.65)',
    marginBottom: 8,
  },
  genreBadgeText: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: '#39ff14',
    letterSpacing: 0.5,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroTitleText: {
    fontFamily: FONTS.bold,
    fontSize: 26,
    color: '#ffffff',
    textShadowColor: '#000000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
    flex: 1,
  },
  redditIconBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 8,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  statusCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#39ff14',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 16,
    backgroundColor: 'rgba(57, 255, 20, 0.05)',
  },
  statusCardExpired: {
    borderColor: '#ff8888',
    backgroundColor: 'rgba(255, 136, 136, 0.05)',
  },
  statusLabelText: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: '#39ff14',
  },
  statusExpiryText: {
    fontFamily: FONTS.monoRegular,
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 6,
  },
  liveBadge: {
    backgroundColor: '#39ff14',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  liveBadgeExpired: {
    backgroundColor: '#ff8888',
  },
  liveBadgeText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: '#0b101e',
  },
  statsGrid: {
    gap: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statInfo: {
    flex: 1,
  },
  statLabel: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: '#64748b',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  statValue: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: COLORS.text,
  },
  descriptionSection: {
    paddingHorizontal: 16,
    marginVertical: 16,
  },
  descriptionHeader: {
    fontFamily: FONTS.bold,
    fontSize: 19,
    color: COLORS.text,
    marginBottom: 8,
  },
  descriptionText: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: '#94a3b8',
    lineHeight: 23,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    marginHorizontal: 16,
  },
  enrichingText: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.secondary,
  },
  floatingCtaContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.bg,
    borderTopWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
  },
  claimBtnMain: {
    width: '100%',
    height: 56,
    justifyContent: 'center',
  },
  claimBtnMainContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 56,
  },
  claimBtnMainText: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: '#0b101e',
    letterSpacing: 1,
  },
  staticCtaState: {
    width: '100%',
    height: 56,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  claimingState: {
    backgroundColor: '#334155',
  },
  claimedState: {
    backgroundColor: '#39ff14',
  },
  staticCtaText: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: '#0b101e',
    letterSpacing: 1,
  },
  nsfwGateContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  nsfwGateContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 16,
  },
  nsfwGateBadge: {
    borderWidth: 1.5,
    borderColor: '#ef4444',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    marginBottom: 8,
  },
  nsfwGateBadgeText: {
    fontFamily: FONTS.mono,
    fontSize: 14,
    color: '#ff8888',
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  nsfwGateTitle: {
    fontFamily: FONTS.bold,
    fontSize: 24,
    color: '#ffffff',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  nsfwGateDescription: {
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 16,
  },
  nsfwGateButtonRow: {
    width: '100%',
    gap: 12,
  },
  nsfwGateBtn: {
    width: '100%',
    height: 50,
  },
  nsfwGateBtnContent: {
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  nsfwGateBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: '#0b101e',
    letterSpacing: 0.5,
  },
  spinIcon: {},
});
