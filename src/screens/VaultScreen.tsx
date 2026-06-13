import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Image,
  Alert,
  Pressable,
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
import { Deal } from '../models/Deal';
import StoreIcon from '../components/StoreIcon';

// Helper to extract Steam App ID from URL
function extractSteamAppId(url?: string): string | null {
  if (!url) return null;
  const match = url.match(/\/app\/(\d+)/i);
  return match ? match[1] : null;
}

// Helper to parse price string to number
function parsePriceToNumber(priceStr?: string | null): number {
  if (!priceStr) return 0;
  let normalized = priceStr.trim();
  // Handle European comma decimal versus US comma thousands separator
  if (normalized.includes(',') && !normalized.includes('.')) {
    normalized = normalized.replace(',', '.');
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(/,/g, '');
  }
  const match = normalized.match(/\d+(?:\.\d+)?/);
  if (match) {
    const price = parseFloat(match[0]);
    return isNaN(price) ? 0 : price;
  }
  return 0;
}

// Fetch original price directly from Steam store API without discount (force USD using &cc=us)
async function fetchSteamOriginalPrice(appId: string): Promise<string | null> {
  try {
    const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&filters=price_overview&cc=us`;
    console.log(`[VaultScreen] Fetching Steam price for App ID: ${appId}`);
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    const appData = data[appId];
    if (appData && appData.success && appData.data?.price_overview) {
      const priceOverview = appData.data.price_overview;
      // Get formatted initial price (original price before discount)
      if (priceOverview.initial_formatted) {
        return priceOverview.initial_formatted;
      }
      // Fallback: use initial (in cents)
      if (typeof priceOverview.initial === 'number') {
        return `$${(priceOverview.initial / 100).toFixed(2)}`;
      }
    }
  } catch (e) {
    console.warn(`[VaultScreen] Failed to fetch Steam price for App ID ${appId}:`, e);
  }
  return null;
}

// Fallback cover images for claimed posts
const COVER_IMAGES = [
  'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=600&q=80',
];

interface VaultScreenProps {
  onDealSelect?: (deal: Deal) => void;
}

export default function VaultScreen({ onDealSelect }: VaultScreenProps) {
  const [claimedGames, setClaimedGames] = useState<Deal[]>([]);
  const [trackedGames, setTrackedGames] = useState<Deal[]>([]);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  const handleImageError = (postId: string) => {
    setImageErrors(prev => ({ ...prev, [postId]: true }));
  };
  


  const loadData = async () => {
    const claimed = await getClaimedPosts();
    const tracked = await getTrackedPosts();

    const claimedDeals = claimed.map(postToBasicDeal);
    const trackedDeals = tracked.map(postToBasicDeal);

    setClaimedGames(claimedDeals);
    setTrackedGames(trackedDeals);

    // Background fetch for any Steam games missing prices
    const fetchMissingSteamPrices = async (deals: Deal[], setter: React.Dispatch<React.SetStateAction<Deal[]>>) => {
      for (const deal of deals) {
        if (!deal.originalPrice && !deal.worth) {
          const appId = extractSteamAppId(deal.url);
          if (appId) {
            const price = await fetchSteamOriginalPrice(appId);
            if (price) {
              setter((prev) =>
                prev.map((d) =>
                  d.id === deal.id
                    ? { ...d, originalPrice: price, worth: price }
                    : d
                )
              );
            }
          }
        }
      }
    };

    fetchMissingSteamPrices(claimedDeals, setClaimedGames);
    fetchMissingSteamPrices(trackedDeals, setTrackedGames);

    dealEnrichmentService.reset();
    dealEnrichmentService.enrichDeals([...claimedDeals, ...trackedDeals], async (updatedDeal) => {
      let finalDeal = updatedDeal;
      if (!finalDeal.originalPrice && !finalDeal.worth) {
        const appId = extractSteamAppId(finalDeal.url);
        if (appId) {
          const price = await fetchSteamOriginalPrice(appId);
          if (price) {
            finalDeal = { ...finalDeal, originalPrice: price, worth: price };
          }
        }
      }

      setClaimedGames((prev) =>
        prev.map((d) => (d.id === finalDeal.id ? finalDeal : d))
      );
      setTrackedGames((prev) =>
        prev.map((d) => (d.id === finalDeal.id ? finalDeal : d))
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


  // Combine claimed and tracked lists
  const displayedItems = (() => {
    const list: { deal: Deal; status: 'CLAIMED' | 'TRACKING' }[] = [];
    claimedGames.forEach((d) => list.push({ deal: d, status: 'CLAIMED' }));
    trackedGames.forEach((d) => list.push({ deal: d, status: 'TRACKING' }));
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

  const totalClaimedValue = claimedGames.reduce((sum, deal) => {
    const priceStr = deal.originalPrice || deal.worth;
    return sum + parsePriceToNumber(priceStr);
  }, 0);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Stats Header */}
        <View style={styles.statsContainer}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>CLAIMED LOOT</Text>
            <Text style={styles.statValueClaimed}>{claimedGames.length}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>TOTAL VALUE</Text>
            <Text style={styles.statValuePrice}>${totalClaimedValue.toFixed(2)}</Text>
          </View>
        </View>



        {/* Grid of Cards */}
        {displayedItems.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Gamepad2 size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>VAULT EMPTY</Text>
            <Text style={styles.emptySub}>
              Start claiming freebies from the feed.
            </Text>
          </View>
        ) : (
          <View style={styles.gridContainer}>
            {displayedItems.map(({ deal, status }) => {
              // Dynamic check for NSFW in case older saved item doesn't have the flag
              const isItemNsfw = deal.isNsfw || 
                                 /nsfw/i.test(deal.title || '') ||
                                 /18\+/i.test(deal.title || '') ||
                                 /mazakon/i.test(deal.title || '') ||
                                 /tengoku/i.test(deal.title || '') ||
                                 (deal.url && deal.url.toLowerCase().includes('dlsite')) ||
                                 deal.platform.toLowerCase().includes('dlsite');

              return (
                <View 
                  key={deal.id} 
                  style={[
                    styles.vaultCard,
                    status === 'TRACKING' ? styles.cardTracking : styles.cardClaimed
                  ]}
                >
                  {/* Image Cover (clickable to open details) */}
                  <Pressable onPress={() => onDealSelect?.(deal)}>
                    <View style={styles.imageWrapper}>
                      <Image 
                        source={{ 
                          uri: (() => {
                            const resolvedUri = deal.image;
                            return (!imageErrors[deal.id] && resolvedUri && resolvedUri !== 'placeholder')
                              ? resolvedUri
                              : getGameCover(deal.id);
                          })()
                        }} 
                        style={styles.cardImage} 
                        blurRadius={isItemNsfw ? 15 : 0}
                        onError={() => handleImageError(deal.id)}
                      />
                      {isItemNsfw && (
                        <View style={styles.nsfwVaultOverlay}>
                          <View style={styles.nsfwBadge}>
                            <Text style={styles.nsfwBadgeText}>NSFW</Text>
                          </View>
                        </View>
                      )}
                    </View>
                  </Pressable>

                  {/* Card Info */}
                  <View style={styles.cardInfo}>
                    <View style={styles.cardHeaderInfoRow}>
                      <Pressable style={styles.cardTextDetails} onPress={() => onDealSelect?.(deal)}>
                        <Text numberOfLines={1} style={styles.gameTitle}>
                          {deal.title}
                        </Text>
                        <View style={styles.platformIconRow}>
                          <StoreIcon platform={deal.platform} size={12} color={COLORS.textMuted} style={{ marginRight: 4 }} />
                          <Text style={styles.platformLabel}>
                            {deal.platform.toUpperCase()} • {status === 'CLAIMED' ? 'STANDARD' : 'WISH-LISTED'}
                          </Text>
                        </View>
                      </Pressable>

                      {/* Action Buttons */}
                      <View style={styles.cardActions}>
                        <BouncyPressable
                           onPress={() => handleLaunchGame(deal.url)}
                           backgroundColor={COLORS.surfaceCharcoal}
                           borderRadius={8}
                           shadowOffsetSize={0}
                           style={styles.actionBtnWrapper}
                           contentStyle={[styles.actionBtn, { borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)' }]}
                        >
                          <ExternalLink size={14} color={COLORS.secondary} />
                        </BouncyPressable>

                        <BouncyPressable
                          onPress={() => handleDeleteClaim(deal.id)}
                          backgroundColor={COLORS.warning}
                          borderRadius={8}
                          shadowOffsetSize={0}
                          style={styles.actionBtnWrapper}
                          contentStyle={styles.actionBtn}
                        >
                          <Trash2 size={14} color="#ffffff" />
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
    padding: 20,
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
    color: COLORS.textMuted,
  },
  filterChipTextActive: {
    color: COLORS.bg,
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
    backgroundColor: COLORS.surfaceCharcoal,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 4,
  },
  cardTracking: {
    borderLeftWidth: 4,
    borderLeftColor: COLORS.secondary, // Cyan
  },
  cardClaimed: {
    borderLeftWidth: 4,
    borderLeftColor: COLORS.success, // Green
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
    color: '#ffffff',
    marginBottom: 4,
  },
  platformIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  platformLabel: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.textMuted,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
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
  nsfwVaultOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 10,
  },
  nsfwBadge: {
    borderWidth: 1.5,
    borderColor: COLORS.warning,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 36, 73, 0.15)',
  },
  nsfwBadgeText: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: COLORS.warning,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceCharcoal,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 16,
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'space-around',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 4,
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
  },
  statLabel: {
    fontFamily: FONTS.bold,
    fontSize: 10,
    color: COLORS.textMuted,
    marginBottom: 4,
    letterSpacing: 1,
  },
  statValueClaimed: {
    fontFamily: FONTS.bold,
    fontSize: 24,
    color: COLORS.primary,
  },
  statValuePrice: {
    fontFamily: FONTS.bold,
    fontSize: 24,
    color: COLORS.secondary,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
});
