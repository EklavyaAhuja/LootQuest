import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Image,
  Pressable,
} from 'react-native';
import { fetchFreeGameFindings } from '../services/redditService';
import { Deal } from '../models/Deal';
import { postToBasicDeal } from '../services/DealClassifier';
import { dealEnrichmentService } from '../services/DealEnrichmentService';
import { expiredFeedService } from '../services/ExpiredFeedService';
import { tasksFeedService } from '../services/TasksFeedService';
import { getAppSettings, getSeenPosts, addSeenPosts } from '../services/storageService';
import { sendFreeGameNotification, addAlertLog } from '../services/notificationService';
import { COLORS, FONTS, getPlatformColor } from '../theme/theme';
import BouncyPressable from '../components/BouncyPressable';
import { Search, RotateCcw } from 'lucide-react-native';

interface FeedScreenProps {
  onDealSelect: (deal: Deal) => void;
  claimedPostIds?: string[];
  onNewAlerts?: (count: number) => void;
  onConnectionError?: () => void;
}

const PLATFORMS_FILTER = ['All', 'Steam', 'Epic Games', 'GOG', 'itch.io', 'Playstation', 'Xbox'];

const COVER_IMAGES = [
  'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=600&q=80',
];

export default function FeedScreen({ onDealSelect, claimedPostIds = [], onNewAlerts, onConnectionError }: FeedScreenProps) {
  const [posts, setPosts] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  const handleImageError = (id: string) => {
    setImageErrors(prev => ({ ...prev, [id]: true }));
  };
  
  // Filters
  const [search, setSearch] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState('All');

  const loadPosts = async (type: 'hot' | 'new' = 'new', isRefreshing = false) => {
    if (isRefreshing) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      // 1. Fetch expired posts Set in background/foreground (highest priority source)
      await expiredFeedService.getExpiredPostIds(isRefreshing);
      // Fetch tasks posts Set in background/foreground
      await tasksFeedService.getTasksPostIds(isRefreshing);

      // 2. Fetch standard feed
      const data = await fetchFreeGameFindings(type, 40);
      const basicDeals = data.map(postToBasicDeal);
      setPosts(basicDeals);

      // Check for new posts (for alerts & push notifications)
      const seenIds = await getSeenPosts();
      const settings = await getAppSettings();

      if (seenIds.length > 0) {
        const newPosts = data.filter((post) => {
          if (seenIds.includes(post.id)) return false;

          // Filter by platform
          if (settings.notificationPlatforms.length > 0) {
            const matchesPlatform = settings.notificationPlatforms.some((plat) =>
              post.platform.toLowerCase().includes(plat.toLowerCase())
            );
            if (!matchesPlatform) return false;
          }

          // Filter by type
          if (settings.notificationTypes.length > 0) {
            const matchesType = settings.notificationTypes.some((t) =>
              post.type.toLowerCase().includes(t.toLowerCase())
            );
            if (!matchesType) return false;
          }

          return true;
        });

        if (newPosts.length > 0) {
          // Send local push notification for each new post (if notifications are enabled)
          if (settings.notificationsEnabled) {
            for (const post of [...newPosts].reverse()) {
              await sendFreeGameNotification(post);
            }
          }

          // Log alert logs
          for (const post of [...newPosts].reverse()) {
            await addAlertLog(post);
          }

          if (onNewAlerts) {
            onNewAlerts(newPosts.length);
          }
        }
      }

      // Mark all fetched posts as seen
      const allFetchedIds = data.map(p => p.id);
      await addSeenPosts(allFetchedIds);

      // Start asynchronous enrichment in background
      dealEnrichmentService.reset();
      dealEnrichmentService.enrichDeals(basicDeals, (updatedDeal) => {
        setPosts((prevPosts) =>
          prevPosts.map((p) => (p.id === updatedDeal.id ? updatedDeal : p))
        );
      });
    } catch (e) {
      console.error(e);
      if (onConnectionError) {
        onConnectionError();
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadPosts();
  }, []);

  const handleRefresh = () => {
    loadPosts('new', true);
  };


  // Helper to map Deal type back to display label
  const getDisplayType = (type: Deal['type']) => {
    switch (type) {
      case 'full_game': return 'GAME';
      case 'dlc': return 'DLC';
      case 'beta': return 'BETA';
      case 'item': return 'ITEM';
      default: return 'GAME';
    }
  };

  // Filter Logic
  const filteredPosts = posts.filter((post) => {
    // If a game has no platform, don't show it
    if (!post.platform || post.platform.trim() === '' || post.platform.toLowerCase() === 'unknown') {
      return false;
    }

    const matchesSearch =
      post.title.toLowerCase().includes(search.toLowerCase()) ||
      post.platform.toLowerCase().includes(search.toLowerCase());

    let matchesPlatform = true;
    if (selectedPlatform !== 'All') {
      matchesPlatform = post.platform.toLowerCase().includes(selectedPlatform.toLowerCase());
    }

    return matchesSearch && matchesPlatform;
  });

  const getGameCover = (id: string) => {
    let sum = 0;
    for (let i = 0; i < id.length; i++) {
      sum += id.charCodeAt(i);
    }
    return COVER_IMAGES[sum % COVER_IMAGES.length];
  };

  // Sort posts by creation date descending (newest first)
  const sortedPosts = [...filteredPosts].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  // Extract first 3 non-expired posts as Latest Loot
  const featuredPosts = sortedPosts.filter((post) => post.expiryStatus !== 'EXPIRED').slice(0, 3);
  const featuredIds = new Set(featuredPosts.map((post) => post.id));
  const remainingPosts = sortedPosts.filter((post) => !featuredIds.has(post.id));

  // Render Horizontal Featured Carousel
  const renderFeaturedSection = () => {
    if (featuredPosts.length === 0) return null;
    return (
      <View style={styles.featuredSection}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleWithIcon}>
            <Text style={styles.sectionTitle}>LATEST LOOT</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuredCarousel}>
          {featuredPosts.map((post) => {
            const isClaimed = claimedPostIds.includes(post.id);
            const isExpired = post.expiryStatus === 'EXPIRED';
            return (
              <Pressable 
                key={'feat_' + post.id} 
                onPress={() => onDealSelect(post)}
                style={[
                  styles.featuredCard,
                  isExpired && styles.expiredFeaturedCard
                ]}
              >
                {/* Cover Image */}
                <Image 
                  source={{ uri: (!imageErrors[post.id] && post.image && post.image !== 'placeholder') ? post.image : getGameCover(post.id) }} 
                  style={styles.featuredImage} 
                  blurRadius={post.isNsfw ? 15 : 0}
                  onError={() => handleImageError(post.id)}
                />
                
                {/* Overlay Gradient Background */}
                <View style={styles.featuredImageOverlay} />

                {/* NSFW Overlay */}
                {post.isNsfw && (
                  <View style={styles.nsfwFeaturedOverlay}>
                    <View style={styles.nsfwBadge}>
                      <Text style={styles.nsfwBadgeText}>NSFW</Text>
                    </View>
                  </View>
                )}

                {/* Top Badges */}
                <View style={styles.featuredTopBadges}>
                  <View style={styles.featuredFreeKeepBadge}>
                    <Text style={styles.featuredFreeKeepText}>FREE TO KEEP</Text>
                  </View>
                  <View style={styles.featuredPlatformBadge}>
                    <Text style={styles.featuredPlatformBadgeText}>{post.platform.toUpperCase()}</Text>
                  </View>
                  {post.claimMethod === 'tasks' && (
                    <View style={styles.featuredTasksBadge}>
                      <Text style={styles.featuredTasksText}>TASKS</Text>
                    </View>
                  )}
                </View>

                {/* Bottom Details Row */}
                <View style={styles.featuredBottomRow}>
                  <Text numberOfLines={2} style={styles.featuredTitleText}>
                    {post.title}
                  </Text>
                  <View style={[
                    styles.claimNowBtn,
                    isExpired && { backgroundColor: '#ef4444' },
                    isClaimed && { backgroundColor: COLORS.secondary }
                  ]}>
                    <Text style={styles.claimNowBtnText}>
                      {isExpired ? 'EXPIRED' : (isClaimed ? 'CLAIMED' : 'CLAIM NOW')}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search Bar Block */}
      <View style={styles.searchSection}>
        <View style={styles.searchContainer}>
          <Search size={18} color={COLORS.text} style={styles.searchIcon} />
          <TextInput
            placeholder="Search loot drops..."
            placeholderTextColor="#64748b"
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* Refresh Button */}
        <BouncyPressable
          onPress={handleRefresh}
          backgroundColor={COLORS.primary}
          borderRadius={24}
          shadowOffsetSize={0}
          style={styles.refreshBtn}
          contentStyle={styles.refreshBtnContent}
        >
          <RotateCcw size={18} color={COLORS.bg} />
        </BouncyPressable>
      </View>

      {/* Horizontal Filter Area */}
      <View style={styles.filtersSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScrollView}>
          <View style={styles.filterGroup}>
            {PLATFORMS_FILTER.map((plat) => {
              const isSelected = selectedPlatform === plat;
              return (
                <BouncyPressable
                  key={plat}
                  onPress={() => setSelectedPlatform(plat)}
                  backgroundColor={isSelected ? COLORS.primary : COLORS.white}
                  borderRadius={12}
                  shadowOffsetSize={0}
                  contentStyle={styles.filterPillContent}
                >
                  <Text style={[styles.filterPillText, isSelected && styles.filterPillTextSelected]}>
                    {plat.toUpperCase()}
                  </Text>
                </BouncyPressable>
              );
            })}
          </View>
        </ScrollView>
      </View>

      {/* Main List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Fetching games from Reddit...</Text>
        </View>
      ) : filteredPosts.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.noResultsTitle}>No Freebies Found!</Text>
          <Text style={styles.noResultsSub}>Try changing your filters or searching something else.</Text>
        </View>
      ) : (
        <FlatList
          data={remainingPosts}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={() => (
            <View>
              {renderFeaturedSection()}
              {/* Fresh Findings Header */}
              {remainingPosts.length > 0 && (
                <View style={styles.freshFindingsHeader}>
                  <View>
                    <Text style={styles.incomingLabel}>INCOMING DATA...</Text>
                    <Text style={styles.freshFindingsTitle}>Fresh Findings</Text>
                  </View>
                  <View style={styles.liveIndicator}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveText}>LIVE</Text>
                  </View>
                </View>
              )}
            </View>
          )}
          renderItem={({ item }) => {
            const isClaimed = claimedPostIds.includes(item.id);
            const isExpired = item.expiryStatus === 'EXPIRED';
            return (
              <View style={[styles.freshItemCard, isExpired && styles.expiredItemCard]}>
                {/* Cover Thumbnail */}
                <View style={[styles.thumbWrapper, { borderColor: getPlatformColor(item.platform) }]}>
                  <Image 
                    source={{ uri: (!imageErrors[item.id] && item.image && item.image !== 'placeholder') ? item.image : getGameCover(item.id) }} 
                    style={styles.thumbImage} 
                    blurRadius={item.isNsfw ? 15 : 0}
                    onError={() => handleImageError(item.id)}
                  />
                  {item.isNsfw && (
                    <View style={styles.nsfwThumbOverlay}>
                      <Text style={styles.nsfwThumbText}>NSFW</Text>
                    </View>
                  )}
                </View>

                {/* Details */}
                <View style={styles.freshItemDetailsContainer}>
                  {/* Badge Row */}
                  <View style={[styles.typeBadgeRow, { flexDirection: 'row', gap: 6 }]}>
                    <View style={[
                      styles.typeBadge,
                      item.type === 'full_game' && styles.typeBadgeGame,
                      item.type === 'item' && styles.typeBadgeItem,
                      item.type === 'dlc' && styles.typeBadgeDlc,
                    ]}>
                      <Text style={[
                        styles.typeBadgeText,
                        item.type === 'full_game' && styles.typeBadgeTextGame,
                        item.type === 'item' && styles.typeBadgeTextItem,
                        item.type === 'dlc' && styles.typeBadgeTextDlc,
                      ]}>
                        {getDisplayType(item.type)}
                      </Text>
                    </View>
                    {item.claimMethod === 'tasks' && (
                      <View style={styles.tasksInlineBadge}>
                        <Text style={styles.tasksInlineBadgeText}>TASKS REQUIRED</Text>
                      </View>
                    )}
                    {item.isNsfw && (
                      <View style={styles.nsfwInlineBadge}>
                        <Text style={styles.nsfwInlineBadgeText}>NSFW</Text>
                      </View>
                    )}
                  </View>

                  {/* Title */}
                  <Text numberOfLines={1} style={styles.freshItemTitle}>
                    {item.title}
                  </Text>

                  {/* Platform */}
                  <Text numberOfLines={1} style={styles.freshItemPlatform}>
                    {item.platform}
                  </Text>
                </View>

                {/* Snipe Button */}
                <BouncyPressable
                  onPress={() => onDealSelect(item)}
                  backgroundColor="transparent"
                  borderRadius={8}
                  shadowOffsetSize={0}
                  style={styles.snipeButtonWrapper}
                  contentStyle={[
                    styles.snipeBtn,
                    { borderColor: isExpired ? '#ff8888' : '#39ff14', borderWidth: 1 }
                  ]}
                >
                  <Text style={[
                    styles.snipeBtnText,
                    { color: isExpired ? '#ff8888' : '#39ff14' }
                  ]}>
                    {isExpired ? 'EXPIRED' : (isClaimed ? 'CLAIMED' : 'SNIPE')}
                  </Text>
                </BouncyPressable>
              </View>
            );
          }}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[COLORS.primary]}
              tintColor={COLORS.primary}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  searchSection: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 12,
    alignItems: 'center',
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 16,
    paddingHorizontal: 12,
    height: 48,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: COLORS.text,
  },
  refreshBtn: {
    width: 48,
    height: 48,
  },
  refreshBtnContent: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 24,
  },
  filtersSection: {
    paddingBottom: 8,
  },
  filterScrollView: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  filterGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterPillContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterPillText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.text,
  },
  filterPillTextSelected: {
    fontFamily: FONTS.bold,
    color: COLORS.border,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: COLORS.text,
    marginTop: 12,
  },
  noResultsTitle: {
    fontFamily: FONTS.bold,
    fontSize: 20,
    color: COLORS.text,
    marginBottom: 8,
  },
  noResultsSub: {
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: COLORS.text,
    textAlign: 'center',
    opacity: 0.7,
  },
  listContent: {
    paddingBottom: 40,
    paddingHorizontal: 16,
  },
  featuredSection: {
    marginVertical: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: COLORS.text,
    letterSpacing: 1,
  },
  latestPillsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  latestPillGreen: {
    borderWidth: 1,
    borderColor: '#39ff14',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(57, 255, 20, 0.05)',
  },
  latestPillGray: {
    borderWidth: 1,
    borderColor: '#64748b',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(100, 116, 139, 0.05)',
  },
  latestPillText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: '#39ff14',
  },
  latestPillTextGray: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: '#64748b',
  },
  featuredCarousel: {
    gap: 16,
    paddingBottom: 8,
  },
  featuredCard: {
    width: 280,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 24,
    overflow: 'hidden',
    height: 180,
    position: 'relative',
  },
  featuredImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    resizeMode: 'cover',
  },
  featuredImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11, 16, 30, 0.55)',
  },
  featuredTopBadges: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    gap: 8,
  },
  featuredFreeKeepBadge: {
    borderWidth: 1,
    borderColor: '#39ff14',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  featuredFreeKeepText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: '#39ff14',
  },
  featuredPlatformBadge: {
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  featuredPlatformBadgeText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: '#dee2f6',
  },
  featuredBottomRow: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  featuredTitleText: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: '#ffffff',
    flex: 1,
    marginRight: 8,
  },
  claimNowBtn: {
    backgroundColor: '#39ff14',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  claimNowBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: '#0b101e',
    letterSpacing: 0.5,
  },
  freshFindingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 16,
  },
  incomingLabel: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: COLORS.secondary,
    letterSpacing: 1,
  },
  freshFindingsTitle: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    color: COLORS.text,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surfaceHighest,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.warning,
  },
  liveText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.text,
  },
  freshItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
  },
  thumbWrapper: {
    width: 64,
    height: 64,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  freshItemDetailsContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  typeBadgeRow: {
    marginBottom: 4,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  typeBadgeGame: {
    borderColor: '#39ff14',
    backgroundColor: 'rgba(57, 255, 20, 0.05)',
  },
  typeBadgeItem: {
    borderColor: '#00e3fd',
    backgroundColor: 'rgba(0, 227, 253, 0.05)',
  },
  typeBadgeDlc: {
    borderColor: '#f6d1ff',
    backgroundColor: 'rgba(246, 209, 255, 0.05)',
  },
  typeBadgeText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
  },
  typeBadgeTextGame: {
    color: '#39ff14',
  },
  typeBadgeTextItem: {
    color: '#00e3fd',
  },
  typeBadgeTextDlc: {
    color: '#f6d1ff',
  },
  freshItemTitle: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 2,
  },
  freshItemPlatform: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: '#64748b',
  },
  snipeButtonWrapper: {
    justifyContent: 'center',
  },
  snipeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  snipeBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
  },

  expiredItemCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  expiredFeaturedCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  expiredBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#ff8888',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  expiredBadgeText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    color: '#ff8888',
  },
  nsfwFeaturedOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 10,
  },
  nsfwBadge: {
    borderWidth: 1.5,
    borderColor: '#ef4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  nsfwBadgeText: {
    fontFamily: FONTS.mono,
    fontSize: 14,
    color: '#ff8888',
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  nsfwThumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  nsfwThumbText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: '#ff8888',
    fontWeight: 'bold',
  },
  nsfwInlineBadge: {
    borderColor: '#ff8888',
    backgroundColor: 'rgba(255, 136, 136, 0.05)',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  nsfwInlineBadgeText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: '#ff8888',
    fontWeight: 'bold',
  },
  featuredTasksBadge: {
    borderWidth: 1,
    borderColor: COLORS.warning,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  featuredTasksText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: COLORS.warning,
  },
  tasksInlineBadge: {
    borderColor: COLORS.warning,
    backgroundColor: 'rgba(255, 214, 0, 0.08)',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tasksInlineBadgeText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: COLORS.warning,
    fontWeight: 'bold',
  },
});
