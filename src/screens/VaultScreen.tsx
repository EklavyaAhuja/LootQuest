import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Image,
  Alert,
} from 'react-native';
import { COLORS, FONTS } from '../theme/theme';
import BouncyPressable from '../components/BouncyPressable';
import { getClaimedPosts, getTrackedPosts, removeClaimedPost } from '../services/storageService';
import { RedditPost } from '../services/redditService';
import { Gamepad2, Trash2, ExternalLink } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dealEnrichmentService } from '../services/DealEnrichmentService';
import { postToBasicDeal } from '../services/DealClassifier';

// Fallback cover images for claimed posts
const COVER_IMAGES = [
  'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=600&q=80',
];

export default function VaultScreen() {
  const [claimedGames, setClaimedGames] = useState<RedditPost[]>([]);
  const [trackedGames, setTrackedGames] = useState<RedditPost[]>([]);
  const [filter, setFilter] = useState<'all' | 'claimed' | 'tracking'>('all');
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  const handleImageError = (postId: string) => {
    setImageErrors(prev => ({ ...prev, [postId]: true }));
  };
  


  const loadData = async () => {
    const claimed = await getClaimedPosts();
    const tracked = await getTrackedPosts();
    setClaimedGames(claimed);
    setTrackedGames(tracked);

    const claimedDeals = claimed.map(postToBasicDeal);
    const trackedDeals = tracked.map(postToBasicDeal);

    dealEnrichmentService.reset();
    dealEnrichmentService.enrichDeals([...claimedDeals, ...trackedDeals], (updatedDeal) => {
      setClaimedGames((prev) =>
        prev.map((p) =>
          p.id === updatedDeal.id
            ? ({ ...p, coverImage: updatedDeal.image, cleanTitle: updatedDeal.title } as any)
            : p
        )
      );
      setTrackedGames((prev) =>
        prev.map((p) =>
          p.id === updatedDeal.id
            ? ({ ...p, coverImage: updatedDeal.image, cleanTitle: updatedDeal.title } as any)
            : p
        )
      );
    });
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDeleteClaim = async (postId: string) => {
    Alert.alert('Discard Loot?', 'Do you want to remove this item from your vault?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          await removeClaimedPost(postId);
          try {
            const currentTracked = await getTrackedPosts();
            const updatedTracked = currentTracked.filter(p => p.id !== postId);
            await AsyncStorage.setItem('fgf_tracked_posts', JSON.stringify(updatedTracked));
          } catch (e) {
            console.error('Error removing tracked post:', e);
          }
          loadData();
        },
      },
    ]);
  };

  const handleLaunchGame = async (url: string) => {
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch (e) {
      console.error(e);
    }
  };


  // Combine lists based on active filter
  const displayedItems = (() => {
    const list: { post: RedditPost; status: 'CLAIMED' | 'TRACKING' }[] = [];
    if (filter === 'all' || filter === 'claimed') {
      claimedGames.forEach((p) => list.push({ post: p, status: 'CLAIMED' }));
    }
    if (filter === 'all' || filter === 'tracking') {
      trackedGames.forEach((p) => list.push({ post: p, status: 'TRACKING' }));
    }
    return list;
  })();

  const getGameCover = (id: string) => {
    // Generate deterministic cover index based on post ID
    let sum = 0;
    for (let i = 0; i < id.length; i++) {
      sum += id.charCodeAt(i);
    }
    return COVER_IMAGES[sum % COVER_IMAGES.length];
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Filter Chips */}
        <View style={styles.filterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
            {[
              { key: 'all', title: 'All Loot' },
              { key: 'claimed', title: 'Claimed' },
              { key: 'tracking', title: 'Tracking' },
            ].map((item) => {
              const isActive = filter === item.key;
              return (
                <BouncyPressable
                  key={item.key}
                  onPress={() => setFilter(item.key as any)}
                  backgroundColor={isActive ? COLORS.primary : '#1e293b'}
                  borderRadius={20}
                  shadowOffsetSize={0}
                  style={styles.filterChipWrapper}
                  contentStyle={[styles.filterChip, !isActive && { borderWidth: 1, borderColor: '#334155' }]}
                >
                  <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                    {item.title}
                  </Text>
                </BouncyPressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Grid of Cards */}
        {displayedItems.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Gamepad2 size={48} color={COLORS.lightBg} />
            <Text style={styles.emptyTitle}>VAULT EMPTY</Text>
            <Text style={styles.emptySub}>
              Start claiming freebies from the feed.
            </Text>
          </View>
        ) : (
          <View style={styles.gridContainer}>
            {displayedItems.map(({ post, status }) => {
              // Dynamic check for NSFW in case older saved item doesn't have the flag
              const isItemNsfw = post.isNsfw || 
                                 /nsfw/i.test(post.title || '') ||
                                 /18\+/i.test(post.title || '') ||
                                 /mazakon/i.test(post.title || '') ||
                                 /tengoku/i.test(post.title || '') ||
                                 (post.url && post.url.toLowerCase().includes('dlsite')) ||
                                 post.platform.toLowerCase().includes('dlsite');

              return (
                <View key={post.id} style={styles.vaultCard}>
                  {/* Image Cover */}
                  <View style={styles.imageWrapper}>
                    <Image 
                      source={{ 
                        uri: (() => {
                          const resolvedUri = post.coverImage || (post as any).image;
                          return (!imageErrors[post.id] && resolvedUri && resolvedUri !== 'placeholder')
                            ? resolvedUri
                            : getGameCover(post.id);
                        })()
                      }} 
                      style={styles.cardImage} 
                      blurRadius={isItemNsfw ? 15 : 0}
                      onError={() => handleImageError(post.id)}
                    />
                    {isItemNsfw && (
                      <View style={styles.nsfwVaultOverlay}>
                        <View style={styles.nsfwBadge}>
                          <Text style={styles.nsfwBadgeText}>NSFW</Text>
                        </View>
                      </View>
                    )}
                  </View>

                  {/* Card Info */}
                  <View style={styles.cardInfo}>
                    <View style={styles.cardHeaderInfoRow}>
                      <View style={styles.cardTextDetails}>
                        <Text numberOfLines={1} style={styles.gameTitle}>
                          {post.cleanTitle || post.title}
                        </Text>
                        <View style={styles.platformIconRow}>
                          <Gamepad2 size={12} color="#64748b" style={{ marginRight: 4 }} />
                          <Text style={styles.platformLabel}>
                            {post.platform.toUpperCase()} • {status === 'CLAIMED' ? 'STANDARD' : 'WISH-LISTED'}
                          </Text>
                        </View>
                      </View>

                      {/* Action Buttons */}
                      <View style={styles.cardActions}>
                        <BouncyPressable
                          onPress={() => handleLaunchGame(post.url)}
                          backgroundColor="#1e293b"
                          borderRadius={8}
                          shadowOffsetSize={0}
                          style={styles.actionBtnWrapper}
                          contentStyle={[styles.actionBtn, { borderWidth: 1, borderColor: '#334155' }]}
                        >
                          <ExternalLink size={12} color="#dee2f6" />
                        </BouncyPressable>

                        <BouncyPressable
                          onPress={() => handleDeleteClaim(post.id)}
                          backgroundColor="#ef4444"
                          borderRadius={8}
                          shadowOffsetSize={0}
                          style={styles.actionBtnWrapper}
                          contentStyle={styles.actionBtn}
                        >
                          <Trash2 size={12} color="#ffffff" />
                        </BouncyPressable>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>


    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },

  filterRow: {
    marginBottom: 20,
  },
  chipScroll: {
    gap: 8,
    paddingBottom: 6,
  },
  filterChipWrapper: {
    justifyContent: 'center',
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  filterChipText: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: '#64748b',
  },
  filterChipTextActive: {
    color: '#0b101e',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: FONTS.bold,
    fontSize: 20,
    color: COLORS.text,
  },
  emptySub: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    maxWidth: 240,
  },
  gridContainer: {
    gap: 16,
  },
  vaultCard: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 20,
    overflow: 'hidden',
  },
  imageWrapper: {
    position: 'relative',
    height: 150,
  },
  cardImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  statusBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: '#0b101e',
  },
  cardInfo: {
    padding: 16,
  },
  cardHeaderInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTextDetails: {
    flex: 1,
    marginRight: 12,
  },
  gameTitle: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: COLORS.text,
    marginBottom: 4,
  },
  platformIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  platformLabel: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: '#64748b',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 6,
  },
  actionBtnWrapper: {
    justifyContent: 'center',
  },
  actionBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  clearExpiredBtnWrapper: {
    marginTop: 12,
    width: '100%',
  },
  clearExpiredBtn: {
    height: 48,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearExpiredBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: '#64748b',
    letterSpacing: 0.5,
  },

  nsfwVaultOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 10,
  },
  nsfwBadge: {
    borderWidth: 1.5,
    borderColor: '#ef4444',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  nsfwBadgeText: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: '#ff8888',
    fontWeight: 'bold',
    letterSpacing: 1,
  },
});
