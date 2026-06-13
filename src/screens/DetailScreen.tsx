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
import { enrichSteamDeal } from '../services/SteamGamesEnricher';
import { addClaimedPost, getClaimedPosts } from '../services/storageService';
import { dealEnrichmentService } from '../services/DealEnrichmentService';
import { fetchImageFromUrl } from '../utils/imageResolver';
import { COLORS, FONTS } from '../theme/theme';
import BouncyPressable from '../components/BouncyPressable';
import * as WebBrowser from 'expo-web-browser';
import { isDealClaimed, getTimeLeft } from '../utils/dealUtils';
import Svg, { Path } from 'react-native-svg';
import StoreIcon from '../components/StoreIcon';
import {
  ArrowLeft,
  Terminal,
  Loader2,
  Calendar,
  Settings,
  Layers,
  Tag,
  Check,
  Clock,
  User,
  Plus,
  Monitor,
  Gamepad,
  Smartphone,
  Globe,
} from 'lucide-react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface DetailScreenProps {
  deal: Deal;
  onClose: () => void;
}

const parseInstructionsIntoSteps = (text: string) => {
  if (!text) return [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  return lines.map((line, idx) => {
    const cleanLine = line.replace(/^\d+[\.\)\s-]+\s*/, '');
    return {
      number: idx + 1,
      text: cleanLine,
    };
  });
};

const COVER_IMAGES = [
  'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=600&q=80',
];

const getPlatformIcon = (platform: string) => {
  return <StoreIcon platform={platform} size={14} color="#ffffff" style={{ marginRight: 6 }} />;
};

export default function DetailScreen({ deal, onClose }: DetailScreenProps) {
  const [localDeal, setLocalDeal] = useState<Deal>(deal);
  const [enriching, setEnriching] = useState(false);
  const [nsfwApproved, setNsfwApproved] = useState(false);
  const [imageError, setImageError] = useState(false);
  
  // Interactive CTA state: 'idle' | 'claiming' | 'claimed'
  const [claimState, setClaimState] = useState<'idle' | 'claiming' | 'claimed'>('idle');

  const [timeLeft, setTimeLeft] = useState<string>(deal.timeLeft || 'No expiry');
  const [isExpired, setIsExpired] = useState<boolean>(
    deal.isExpired || deal.expiryStatus === 'EXPIRED'
  );
  const [showExactExpiry, setShowExactExpiry] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const end = localDeal.expiresAt || localDeal.endDate;
      setTimeLeft(getTimeLeft(end));
    };
    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, [localDeal.expiresAt, localDeal.endDate]);

  useEffect(() => {
    const checkExpiry = () => {
      const end = localDeal.expiresAt || localDeal.endDate;
      if (end && end.toUpperCase() !== 'N/A') {
        const endTime = new Date(end).getTime();
        setIsExpired(endTime < Date.now());
      } else {
        setIsExpired(localDeal.isExpired || localDeal.expiryStatus === 'EXPIRED');
      }
    };
    checkExpiry();
    const interval = setInterval(checkExpiry, 10000);
    return () => clearInterval(interval);
  }, [localDeal.expiresAt, localDeal.endDate, localDeal.isExpired, localDeal.expiryStatus]);

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
          const isClaimed = isDealClaimed(deal, claimed as any);
          setClaimState(isClaimed ? 'claimed' : 'idle');
        }

        // 2. Check cache first
        const cached = await getCachedDeal(deal.id);
        const isEpic = (deal.platform || '').toLowerCase().includes('epic') || (deal.url || '').toLowerCase().includes('epicgames.com');
        const isGamerPower = (deal.platform || '').toLowerCase().includes('gamerpower') || deal.id.startsWith('gp_');
        const hasEnrichedDetails = cached && (cached.instructions || cached.aboutGame || isGamerPower || isEpic);

        if (hasEnrichedDetails) {
          if (active) {
            const isExpiredFromFlair = expiredFeedService.isExpired(deal.id);
            const isTaskFromFlair = tasksFeedService.isTask(deal.id);
            const cachedMerged = {
              ...deal,
              ...cached,
              platform: deal.platform,
              expiryStatus: isExpiredFromFlair ? 'EXPIRED' : cached.expiryStatus,
              claimMethod: isTaskFromFlair ? 'tasks' : (cached.claimMethod || deal.claimMethod)
            };
            cachedMerged.timeLeft = getTimeLeft(cachedMerged.expiresAt || cachedMerged.endDate);
            setLocalDeal(cachedMerged);
            dealEnrichmentService.notify(cachedMerged);
          }
          return;
        }

        // 3. Fallback: if details missing, enrich in background
        if (active) setEnriching(true);

        // Check if it's an Epic Games deal
        let epicData: any = null;
        if (isEpic) {
          epicData = await enrichEpicDeal(deal.title);
        }

        // Check if it's a Steam deal
        const isSteam = (deal.platform || '').toLowerCase().includes('steam') || (deal.url || '').toLowerCase().includes('steampowered.com');
        let steamData: any = null;
        if (isSteam) {
          steamData = await enrichSteamDeal(deal.url);
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

            const finalExpiresAt = epicData?.expiresAt || expiresAt || deal.expiresAt;

            let resolvedImage = steamData?.image || epicData?.image || deal.image;
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
              expiryStatus: isExpiredFromFlair ? 'EXPIRED' : (finalExpiresAt ? getExpiryStatus(finalExpiresAt) : (deal.expiryStatus || 'UNKNOWN')),
              claimMethod: isTaskFromFlair ? 'tasks' : deal.claimMethod,
              developer: steamData?.developer || epicData?.developer || parsed.developer || deal.developer,
              releaseDate: steamData?.releaseDate || parsed.releaseDate || deal.releaseDate || undefined,
              genres: steamData?.genres || (parsed.genres.length > 0 ? parsed.genres : (deal.genres || undefined)),
              achievements: parsed.achievements !== null ? parsed.achievements : (deal.achievements || undefined),
              tradingCards: parsed.tradingCards !== null ? parsed.tradingCards : (deal.tradingCards || undefined),
              reviewScore: parsed.reviewScore || deal.reviewScore || undefined,
              steamDbRating: parsed.steamDbRating || deal.steamDbRating || undefined,
              aboutGame: steamData?.description || epicData?.description || parsed.aboutGame || deal.aboutGame,
              instructions: parsed.instructions || undefined,
              parserConfidence: parsed.parserConfidence,
              image: resolvedImage,
              url: epicData?.url || parsed.storeUrl || deal.url,
              timeLeft: getTimeLeft(finalExpiresAt || deal.endDate),
            };

            await saveCachedDeal(deal.id, enriched, botComment);
            if (active) setLocalDeal(enriched);
            dealEnrichmentService.notify(enriched);
          } else {
            // No bot comment found: fallback to post body and flair status
            const isExpiredFromFlair = expiredFeedService.isExpired(deal.id);
            const isTaskFromFlair = tasksFeedService.isTask(deal.id);
            const isFree = checkIsFullyFree(deal.title, deal.description);
            const postBodyExpiry = isFree ? (parseExpiryFromPostBody(deal.description) || undefined) : undefined;
            
            const finalExpiresAt = epicData?.expiresAt || postBodyExpiry || deal.expiresAt;

            let resolvedImage = steamData?.image || epicData?.image || deal.image;
            if (!resolvedImage) {
              resolvedImage = await fetchImageFromUrl(deal.url, deal.title);
            }

            const enriched: Deal = {
              ...deal,
              expiresAt: finalExpiresAt,
              expiryStatus: isExpiredFromFlair ? 'EXPIRED' : (finalExpiresAt ? getExpiryStatus(finalExpiresAt) : (deal.expiryStatus || 'UNKNOWN')),
              claimMethod: isTaskFromFlair ? 'tasks' : deal.claimMethod,
              developer: steamData?.developer || epicData?.developer || deal.developer,
              aboutGame: steamData?.description || epicData?.description || deal.aboutGame,
              image: resolvedImage,
              genres: steamData?.genres || deal.genres,
              releaseDate: steamData?.releaseDate || deal.releaseDate,
              url: epicData?.url || deal.url,
              timeLeft: getTimeLeft(finalExpiresAt || deal.endDate),
            };
            await saveCachedDeal(deal.id, enriched, '');
            if (active) setLocalDeal(enriched);
            dealEnrichmentService.notify(enriched);
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
    if (claimState === 'claiming') return;

    if (claimState === 'claimed') {
      try {
        WebBrowser.openBrowserAsync(localDeal.url);
      } catch (e) {
        console.error(e);
      }
      return;
    }

    setClaimState('claiming');
    
    try {
      WebBrowser.openBrowserAsync(localDeal.url);
    } catch (e) {
      console.error(e);
    }

    // Save game to claimed posts collection in local storage if not already there
    const claimed = await getClaimedPosts();
    const alreadyClaimed = isDealClaimed(localDeal, claimed as any);
    if (!alreadyClaimed) {
      await addClaimedPost(localDeal as any);
    }

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
      case 'mobile_game': return 'Mobile Game';
      case 'loot': return 'In-Game Loot';
      default: return 'Whole Game';
    }
  };

  const getCompactExpiryDate = (isoString?: string | null) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return '';
      const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      const month = months[d.getUTCMonth()];
      const day = d.getUTCDate();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const hours = pad(d.getUTCHours());
      const minutes = pad(d.getUTCMinutes());
      return `${month} ${day}, ${hours}:${minutes} UTC`;
    } catch {
      return '';
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
      {/* Top App Bar (Absolute & Transparent) */}
      <View style={styles.header}>
        <View style={styles.statusBarSpacer} />
        <View style={styles.headerContent}>
          <Pressable onPress={onClose} style={styles.backButton}>
            <ArrowLeft size={22} color="#ffffff" />
          </Pressable>

          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerText}>LOOTQUEST</Text>
          </View>

          <Pressable onPress={onClose} style={styles.settingsButton}>
            <Settings size={22} color="#ffffff" />
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
            {/* Status Row */}
            <View style={styles.heroStatusRow}>
              <View style={styles.heroStatusPill}>
                <View style={[styles.heroStatusDot, isExpired && { backgroundColor: COLORS.warning }]} />
                <Text style={styles.heroStatusText}>
                  {isExpired ? 'EXPIRED' : 'LIVE NOW'}
                </Text>
              </View>
              {timeLeft && timeLeft !== 'No expiry' && !isExpired && (
                <Pressable
                  onPress={() => {
                    const end = localDeal.expiresAt || localDeal.endDate;
                    if (end && end.toUpperCase() !== 'N/A') {
                      setShowExactExpiry(!showExactExpiry);
                    }
                  }}
                  style={styles.heroTimerPill}
                >
                  <Clock size={14} color={COLORS.secondary} />
                  <Text style={styles.heroTimerText}>
                    {showExactExpiry
                      ? getCompactExpiryDate(localDeal.expiresAt || localDeal.endDate).toUpperCase()
                      : timeLeft.toUpperCase()
                    }
                  </Text>
                </Pressable>
              )}
            </View>

            {/* Badges Row */}
            <View style={styles.heroBadgesRow}>
              <View style={styles.heroBadge}>
                {getPlatformIcon(localDeal.platform)}
                <Text style={styles.heroBadgeText}>{localDeal.platform.toUpperCase()}</Text>
              </View>
              <View style={[styles.heroBadge, { borderColor: 'rgba(221, 183, 255, 0.3)' }]}>
                <Text style={[styles.heroBadgeText, { color: COLORS.primary }]}>
                  {getOfferDisplayType(localDeal.type).toUpperCase()}
                </Text>
              </View>
            </View>

            <Text style={styles.heroTitleText}>
              {localDeal.title}
            </Text>
            
            <Text style={styles.heroPublisherText}>
              {localDeal.developer || 'Unknown Publisher'}
            </Text>

            {/* Stats Row */}
            <View style={styles.heroStatsRow}>
              <View style={styles.heroStatCol}>
                <Text style={styles.heroStatLabel}>VALUE</Text>
                <Text style={[styles.heroStatValue, { color: COLORS.success }]}>
                  {localDeal.worth || 'FREE'}
                </Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStatCol}>
                <Text style={styles.heroStatLabel}>CLAIMED</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <User size={16} color={COLORS.textMuted} />
                  <Text style={styles.heroStatValue}>
                    {localDeal.claimedUsers ? localDeal.claimedUsers.toLocaleString() : '--'}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* 2. Bento Info Grid */}
        <View style={styles.infoGrid}>
          <View style={styles.infoCard}>
            <Layers size={20} color={COLORS.textMuted} />
            <Text style={styles.infoCardTitle}>DIFFICULTY</Text>
            <Text style={styles.infoCardValue}>
              {localDeal.claimMethod === 'one_click' ? 'One click' : (localDeal.claimMethod === 'tasks' ? 'Tasks' : 'Unknown')}
            </Text>
          </View>
          <View style={styles.infoCard}>
            <Calendar size={20} color={COLORS.textMuted} />
            <Text style={styles.infoCardTitle}>EXPIRY</Text>
            <Text style={styles.infoCardValue}>
              {localDeal.expiresAt ? formatExpiryDate(localDeal.expiresAt).replace(/ at.*/, '') : 'No Expiry'}
            </Text>
          </View>
        </View>

        {/* 3. Description Section */}
        <View style={styles.descriptionSection}>
          <Text style={styles.descriptionHeader}>About this Loot</Text>
          <Text style={styles.descriptionText}>
            {localDeal.aboutGame || localDeal.description || 'No description available for this loot quest.'}
          </Text>
        </View>

        {/* 4. Instructions Steps Timeline */}
        {localDeal.instructions ? (() => {
          const steps = parseInstructionsIntoSteps(localDeal.instructions);
          if (steps.length === 0) return null;
          return (
            <View style={styles.timelineSection}>
              <Text style={styles.descriptionHeader}>How to Claim</Text>
              <View style={styles.timelineWrapper}>
                <View style={styles.timelineVerticalLine} />
                <View style={styles.timelineList}>
                  {steps.map((step, index) => (
                    <View key={index} style={styles.timelineItem}>
                      <View style={styles.timelineStepCircle}>
                        <Text style={styles.timelineStepNumber}>{step.number}</Text>
                      </View>
                      <View style={styles.timelineContent}>
                        <Text style={styles.timelineStepText}>{step.text}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          );
        })() : null}

        {enriching && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={COLORS.accent} />
            <Text style={styles.enrichingText}>Getting data...</Text>
          </View>
        )}
      </ScrollView>

      {/* Floating Action CTA */}
      <View style={styles.floatingCtaContainer}>
        {claimState === 'idle' && (
          <BouncyPressable
            onPress={handleClaim}
            backgroundColor={COLORS.primary}
            borderRadius={28}
            shadowOffsetSize={0}
            style={styles.claimBtnMain}
            contentStyle={styles.claimBtnMainContent}
          >
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
          <BouncyPressable
            onPress={handleClaim}
            backgroundColor={COLORS.success}
            borderRadius={28}
            shadowOffsetSize={0}
            style={styles.claimBtnMain}
            contentStyle={styles.claimBtnMainContent}
          >
            <Text style={[styles.claimBtnMainText, { color: COLORS.surfaceCharcoal }]}>CLAIMED!</Text>
          </BouncyPressable>
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
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    zIndex: 50,
  },
  statusBarSpacer: {
    height: Platform.OS === 'ios' ? 44 : 20,
  },
  headerContent: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(19, 19, 19, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(19, 19, 19, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
    opacity: 0, // Keep title hidden to let hero title shine, but maintain layout
  },
  headerText: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    color: COLORS.primary,
    letterSpacing: 1,
    textAlign: 'center',
  },
  scrollContent: {
    paddingBottom: 140,
  },
  heroSection: {
    height: 480,
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
    backgroundColor: 'rgba(19, 19, 19, 0.55)',
  },
  heroDetailsOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingTop: 100,
    backgroundColor: 'transparent',
  },
  heroStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  heroStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(34, 34, 34, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  heroStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
  },
  heroStatusText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: '#ffffff',
  },
  heroTimerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  heroTimerText: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  heroBadgesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceCharcoal,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  heroBadgeText: {
    fontFamily: FONTS.bold,
    fontSize: 10,
    color: COLORS.text,
  },
  heroTitleText: {
    fontFamily: FONTS.bold,
    fontSize: 28,
    color: '#ffffff',
    lineHeight: 34,
    marginBottom: 4,
  },
  heroPublisherText: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.onSurfaceVariant,
    marginBottom: 16,
  },
  heroStatsRow: {
    flexDirection: 'row',
    gap: 24,
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 16,
  },
  heroStatCol: {
    flexDirection: 'column',
  },
  heroStatLabel: {
    fontFamily: FONTS.bold,
    fontSize: 10,
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  heroStatValue: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: '#ffffff',
  },
  heroStatDivider: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  infoGrid: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    marginTop: 16,
  },
  infoCard: {
    flex: 1,
    backgroundColor: COLORS.surfaceCharcoal,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'flex-start',
    gap: 4,
  },
  infoCardTitle: {
    fontFamily: FONTS.bold,
    fontSize: 10,
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
  infoCardValue: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: COLORS.secondary,
  },
  descriptionSection: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  descriptionHeader: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: COLORS.text,
    marginBottom: 8,
  },
  descriptionText: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: COLORS.onSurfaceVariant,
    lineHeight: 22,
  },
  timelineSection: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  timelineWrapper: {
    position: 'relative',
    marginTop: 16,
  },
  timelineVerticalLine: {
    position: 'absolute',
    left: 19,
    top: 20,
    bottom: 20,
    width: 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderStyle: 'dashed',
  },
  timelineList: {
    gap: 16,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  timelineStepCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceHigh,
    borderWidth: 2,
    borderColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  timelineStepNumber: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.primary,
  },
  timelineContent: {
    flex: 1,
  },
  timelineStepText: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.text,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
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
    borderColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
  },
  claimBtnMain: {
    width: '100%',
    height: 56,
  },
  claimBtnMainContent: {
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  claimBtnMainText: {
    fontFamily: FONTS.extraBold,
    fontSize: 16,
    color: COLORS.bg,
    letterSpacing: 0.5,
  },
  staticCtaState: {
    width: '100%',
    height: 56,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  claimingState: {
    backgroundColor: COLORS.surfaceHigh,
  },
  claimedState: {
    backgroundColor: COLORS.success,
  },
  staticCtaText: {
    fontFamily: FONTS.extraBold,
    fontSize: 16,
    color: COLORS.text,
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
    borderColor: COLORS.warning,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 36, 73, 0.1)',
    marginBottom: 8,
  },
  nsfwGateBadgeText: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.warning,
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
    color: COLORS.textMuted,
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
    borderRadius: 25,
  },
  nsfwGateBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: COLORS.bg,
    letterSpacing: 0.5,
  },
  spinIcon: {},
});
