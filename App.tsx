import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, Text, View, SafeAreaView, Platform, Modal, Pressable, Linking, Animated, Easing, FlatList, BackHandler } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Notifications, analytics } from './src/utils/expoGoCompat';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, FONTS, RADIUS, SHADOWS } from './src/theme/theme';
import HomeScreen from './src/screens/HomeScreen';
import FeedScreen from './src/screens/FeedScreen';
import VaultScreen from './src/screens/VaultScreen';
import AlertsScreen from './src/screens/AlertsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import DetailScreen from './src/screens/DetailScreen';
import OnboardingScreen, { getSavedName } from './src/screens/OnboardingScreen';
import { dealsStore } from './src/services/dealsStore';
import { Deal } from './src/models/Deal';
import BouncyPressable from './src/components/BouncyPressable';
import {
  requestNotificationPermissions,
  registerBackgroundFetch,
  seedInitialSeenPosts,
  registerFCMToken,
  addAlertLogFromNotification,
} from './src/services/notificationService';
import { expiredFeedService } from './src/services/ExpiredFeedService';
import { sendDailyPing } from './src/services/usageAnalytics';
import { Ionicons } from '@expo/vector-icons';
import { WifiOff } from 'lucide-react-native';
import { HomeSkeleton } from './src/components/LootSkeleton';
import WebLandingWrapper from './src/components/WebLandingWrapper';
import { useSafeAreaInsets } from './src/utils/useSafeAreaInsets';
import * as Updates from 'expo-updates';
// analytics imported via expoGoCompat (guarded for Expo Go compatibility)
import appJson from './app.json';

const checkForUpdatesSilently = async () => {
  if (__DEV__ || Platform.OS === 'web') return;
  try {
    const update = await Updates.checkForUpdateAsync();
    if (update.isAvailable) {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    }
  } catch (error) {
    console.log('[Updates] Silent update check skipped or failed:', error);
  }
};

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular: require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
    Inter_500Medium: require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'),
    Inter_600SemiBold: require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf'),
    Inter_700Bold: require('@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf'),
    Inter_800ExtraBold: require('@expo-google-fonts/inter/800ExtraBold/Inter_800ExtraBold.ttf'),
    JetBrainsMono_400Regular: require('@expo-google-fonts/jetbrains-mono/400Regular/JetBrainsMono_400Regular.ttf'),
    JetBrainsMono_700Bold: require('@expo-google-fonts/jetbrains-mono/700Bold/JetBrainsMono_700Bold.ttf'),
    InstrumentSerif_400Regular: require('@expo-google-fonts/instrument-serif/400Regular/InstrumentSerif_400Regular.ttf'),
    InstrumentSerif_400Regular_Italic: require('@expo-google-fonts/instrument-serif/400Regular_Italic/InstrumentSerif_400Regular_Italic.ttf'),
  });

  const [activeTab, setActiveTab] = useState<'home' | 'feed' | 'vault' | 'alerts' | 'settings'>('home');
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [claimedDeals, setClaimedDeals] = useState<Deal[]>([]);
  const [unreadAlertsCount, setUnreadAlertsCount] = useState<number>(0);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [retrying, setRetrying] = useState<boolean>(false);
  const [userName, setUserName] = useState<string>('Hunter');
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);
  const [onboardingReady, setOnboardingReady] = useState<boolean>(false);
  const [feedInitialCategory, setFeedInitialCategory] = useState<string | undefined>(undefined);
  const insets = useSafeAreaInsets();
  
  // Scroll-to-top ref for HomeScreen
  const homeScrollRef = useRef<any>(null);
  
  // Animated tab values
  const tabAnimations = useRef({
    home: new Animated.Value(1),
    feed: new Animated.Value(1),
    vault: new Animated.Value(1),
    alerts: new Animated.Value(1),
    settings: new Animated.Value(1),
  }).current;

  // Check for saved name on mount
  useEffect(() => {
    getSavedName().then((name) => {
      if (name) {
        setUserName(name);
      }
      setOnboardingReady(true);
    });
  }, []);

  const handleOnboardingComplete = (name: string) => {
    setUserName(name || 'Hunter');
    setShowOnboarding(false);
  };

  const checkConnection = async () => {
    if (Platform.OS === 'web') {
      setIsOffline(typeof navigator !== 'undefined' ? !navigator.onLine : false);
      return;
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const response = await fetch('https://www.cloudflare.com/cdn-cgi/trace', {
        signal: controller.signal,
        headers: { 'Cache-Control': 'no-cache' }
      });
      clearTimeout(timeoutId);
      setIsOffline(!response.ok);
    } catch {
      setIsOffline(true);
    }
  };

  const handleRetryConnection = async () => {
    setRetrying(true);
    await checkConnection();
    setRetrying(false);
  };

  useEffect(() => {
    dealsStore.init().then(() => {
      setClaimedDeals(dealsStore.getVaultItems('All'));
    });
    const unsub = dealsStore.subscribe(() => {
      setClaimedDeals(dealsStore.getVaultItems('All'));
    });
    return () => unsub();
  }, []);

  // Initialize App Configuration (Permissions, Background Task)
  useEffect(() => {
    const initApp = async () => {
      // Run network connectivity check and silent update check concurrently
      checkConnection();
      checkForUpdatesSilently();

      // Anonymous usage ping (fire-and-forget, never blocks startup)
      sendDailyPing();

      // Log App Open event in Firebase Analytics asynchronously
      analytics().logAppOpen().catch((analyticsError: any) => {
        console.warn('[Analytics] Error logging app open:', analyticsError);
      });

      // Initialize background services and load unread count concurrently
      await Promise.allSettled([
        expiredFeedService.getExpiredPostIds(),
        AsyncStorage.getItem('fgf_unread_alerts_count').then((rawCount) => {
          if (rawCount) setUnreadAlertsCount(Number(rawCount));
        }),
      ]);

      const granted = await requestNotificationPermissions();
      if (granted) {
        console.log('Notifications permissions granted.');
        await seedInitialSeenPosts();
        await registerBackgroundFetch();
        await registerFCMToken();
      }
    };
    initApp();

    // 1. Log incoming notification when received in foreground
    const receivedSubscription = Notifications.addNotificationReceivedListener((notification: any) => {
      if (notification?.request?.content) {
        addAlertLogFromNotification(notification.request.content);
        setUnreadAlertsCount((prev) => prev + 1);
      }
    });

    // 2. Handle notification clicks (Deep link to detail view + log to Alerts)
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response: any) => {
      const content = response?.notification?.request?.content;
      if (content) {
        addAlertLogFromNotification(content);
      }

      const data = content?.data as any;
      if (data && data.postId) {
        const title = content?.title || '';
        const body = content?.body || '';
        
        let platform = data.platform || 'Steam';
        if (!data.platform) {
          const titleToSearch = (title + ' ' + body + ' ' + (data.redditTitle || '')).toLowerCase();
          if (titleToSearch.includes('steam')) platform = 'Steam';
          else if (titleToSearch.includes('epic')) platform = 'Epic Games';
          else if (titleToSearch.includes('gog')) platform = 'GOG';
          else if (titleToSearch.includes('itch')) platform = 'Itch.io';
        }

        let dealTitle = 'New Free Game!';
        if (data.gameTitle) {
          dealTitle = data.gameTitle;
        } else if (data.redditTitle) {
          dealTitle = data.redditTitle.replace(/^\[[^\]]+\]\s*/, '').replace(/\([^)]+\)\s*/, '').trim();
        } else if (title.includes('on') && title.includes('!')) {
          // Local notification format: title="🎁 Free Game on Steam!", body="Train Valley 2"
          dealTitle = body;
        } else if (title.startsWith('🆓 ')) {
          // Remote FCM notification: title="🆓 Train Valley 2"
          dealTitle = title.replace('🆓 ', '').trim();
        } else if (body.startsWith('[') && body.includes(']')) {
          // Old remote format: body="[Steam] (Game) Train Valley 2"
          dealTitle = body.replace(/^\[[^\]]+\]\s*/, '').replace(/\([^)]+\)\s*/, '').trim();
        } else {
          dealTitle = body || title || 'New Free Game!';
        }
        
        const notificationDeal: Deal = {
          id: String(data.postId),
          title: dealTitle,
          platform: platform,
          type: 'full_game',
          claimMethod: (data.isTask as boolean) ? 'tasks' : 'one_click',
          url: (data.url as string) || 'https://store.steampowered.com',
          author: 'Freebie Radar',
          redditUrl: (data.permalink as string) || undefined,
        };

        setSelectedDeal(notificationDeal);
        handleTabChange('home');
      }
    });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, []);

  // Handle hardware back press on Android to close deal detail overlay
  useEffect(() => {
    if (!selectedDeal) return;
    const backAction = () => {
      setSelectedDeal(null);
      return true;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [selectedDeal]);

  const handleTabChange = async (tab: 'home' | 'feed' | 'vault' | 'alerts' | 'settings') => {
    // Animate tab icon
    const animValue = tabAnimations[tab];
    Animated.sequence([
      Animated.spring(animValue, { toValue: 1.25, friction: 5, tension: 40, useNativeDriver: true }),
      Animated.spring(animValue, { toValue: 1, friction: 5, tension: 40, useNativeDriver: true }),
    ]).start();

    // Scroll to top if tapping the already-active tab
    if (tab === activeTab && tab === 'home') {
      homeScrollRef.current?.scrollToOffset({ offset: 0, animated: true });
    }

    setActiveTab(tab);
    if (tab === 'alerts') {
      setUnreadAlertsCount(0);
      try {
        await AsyncStorage.setItem('fgf_unread_alerts_count', '0');
      } catch (e) {
        console.error('Error resetting unread count:', e);
      }
    }
  };

  if (!fontsLoaded || !onboardingReady) {
    return (
      <View style={styles.loadingContainer}>
        <HomeSkeleton />
      </View>
    );
  }

  // Show onboarding flow only if requested
  if (showOnboarding) {
    return (
      <WebLandingWrapper>
        <SafeAreaView style={styles.safeArea}>
          <StatusBar style="light" />
          <OnboardingScreen onComplete={handleOnboardingComplete} />
        </SafeAreaView>
      </WebLandingWrapper>
    );
  }

  return (
    <WebLandingWrapper>
      <SafeAreaView style={styles.safeArea}>
        {/* Main Content — visibility toggling, never unmount */}
        <View style={styles.content}>
          <View style={[styles.screenContainer, { display: activeTab === 'home' ? 'flex' : 'none' }]}>
            <HomeScreen
              onDealSelect={setSelectedDeal}
              claimedDeals={claimedDeals}
              userName={userName || 'Hunter'}
              scrollRef={homeScrollRef}
              onNavigateToFeed={(params) => {
                if (params?.filterUnclaimed) {
                  setFeedInitialCategory('unclaimed');
                }
                handleTabChange('feed');
              }}
              isDetailOpen={!!selectedDeal}
            />
          </View>
          <View style={[styles.screenContainer, { display: activeTab === 'feed' ? 'flex' : 'none' }]}>
            <FeedScreen
              onDealSelect={setSelectedDeal}
              claimedDeals={claimedDeals}
              initialCategory={feedInitialCategory}
            />
          </View>
          <View style={[styles.screenContainer, { display: activeTab === 'vault' ? 'flex' : 'none' }]}>
            <VaultScreen 
              onDealSelect={setSelectedDeal}
              isActive={activeTab === 'vault'}
              claimedDeals={claimedDeals}
              onRemoveClaimed={(dealId) => {
                dealsStore.unclaimDeal(dealId);
              }}
            />
          </View>
          <View style={[styles.screenContainer, { display: activeTab === 'alerts' ? 'flex' : 'none' }]}>
            <AlertsScreen />
          </View>
          <View style={[styles.screenContainer, { display: activeTab === 'settings' ? 'flex' : 'none' }]}>
            <SettingsScreen
              userName={userName}
              onUpdateUserName={(name) => setUserName(name)}
            />
          </View>
        </View>

        {/* Full-width Opaque #000 Hallmark Tab Bar with 1px hairline */}
        {!selectedDeal && (
          <View style={styles.tabBarContainer}>
            <View style={[styles.tabBar, { paddingBottom: insets.bottom, height: 56 + insets.bottom }]}>
              {/* Home */}
              <Pressable onPress={() => handleTabChange('home')} style={styles.tabBtn}>
                <Animated.View style={styles.tabIconWrapper}>
                  <Animated.View style={{ transform: [{ scale: tabAnimations.home }] }}>
                    <Ionicons name="home-outline" size={18} color={activeTab === 'home' ? '#EDEDEB' : '#86868B'} />
                  </Animated.View>
                  <Text style={[styles.tabLabel, { color: activeTab === 'home' ? '#EDEDEB' : '#86868B' }]}>Home</Text>
                  {activeTab === 'home' && <View style={styles.activeTabDot} />}
                </Animated.View>
              </Pressable>

              {/* Feed */}
              <Pressable onPress={() => handleTabChange('feed')} style={styles.tabBtn}>
                <Animated.View style={styles.tabIconWrapper}>
                  <Animated.View style={{ transform: [{ scale: tabAnimations.feed }] }}>
                    <Ionicons name="flash-outline" size={18} color={activeTab === 'feed' ? '#EDEDEB' : '#86868B'} />
                  </Animated.View>
                  <Text style={[styles.tabLabel, { color: activeTab === 'feed' ? '#EDEDEB' : '#86868B' }]}>Feed</Text>
                  {activeTab === 'feed' && <View style={styles.activeTabDot} />}
                </Animated.View>
              </Pressable>

              {/* Vault */}
              <Pressable onPress={() => handleTabChange('vault')} style={styles.tabBtn}>
                <Animated.View style={styles.tabIconWrapper}>
                  <Animated.View style={{ transform: [{ scale: tabAnimations.vault }] }}>
                    <Ionicons name="cube-outline" size={18} color={activeTab === 'vault' ? '#EDEDEB' : '#86868B'} />
                  </Animated.View>
                  <Text style={[styles.tabLabel, { color: activeTab === 'vault' ? '#EDEDEB' : '#86868B' }]}>Vault</Text>
                  {activeTab === 'vault' && <View style={styles.activeTabDot} />}
                </Animated.View>
              </Pressable>

              {/* Alerts */}
              <Pressable onPress={() => handleTabChange('alerts')} style={styles.tabBtn}>
                <View style={styles.alertTabContainer}>
                  <Animated.View style={styles.tabIconWrapper}>
                    <Animated.View style={{ transform: [{ scale: tabAnimations.alerts }] }}>
                      <Ionicons name="radio-outline" size={18} color={activeTab === 'alerts' ? '#EDEDEB' : '#86868B'} />
                    </Animated.View>
                    <Text style={[styles.tabLabel, { color: activeTab === 'alerts' ? '#EDEDEB' : '#86868B' }]}>Alerts</Text>
                    {activeTab === 'alerts' && <View style={styles.activeTabDot} />}
                  </Animated.View>
                  {unreadAlertsCount > 0 && (
                    <View style={styles.alertBadge}><Text style={styles.alertBadgeText}>{unreadAlertsCount}</Text></View>
                  )}
                </View>
              </Pressable>

              {/* Settings */}
              <Pressable onPress={() => handleTabChange('settings')} style={styles.tabBtn}>
                <Animated.View style={styles.tabIconWrapper}>
                  <Animated.View style={{ transform: [{ scale: tabAnimations.settings }] }}>
                    <Ionicons name="options-outline" size={18} color={activeTab === 'settings' ? '#EDEDEB' : '#86868B'} />
                  </Animated.View>
                  <Text style={[styles.tabLabel, { color: activeTab === 'settings' ? '#EDEDEB' : '#86868B' }]}>Settings</Text>
                  {activeTab === 'settings' && <View style={styles.activeTabDot} />}
                </Animated.View>
              </Pressable>
            </View>
          </View>
        )}

        {/* Detail Screen Overlay (Confined strictly inside the mobile phone UI) */}
        {selectedDeal && (
          <View style={[StyleSheet.absoluteFill, styles.detailScreenOverlay]}>
            <DetailScreen 
              deal={selectedDeal} 
              onClose={() => setSelectedDeal(null)} 
              onClaimed={(claimedDeal) => {
                dealsStore.claimDeal(claimedDeal);
              }}
            />
          </View>
        )}

        {/* Offline Overlay UI */}
        {isOffline && (
          <View style={styles.offlineOverlay}>
            <View style={styles.offlineCard}>
              <View style={styles.wifiOffIconWrapper}>
                <WifiOff size={40} color="#ef4444" />
              </View>
              <Text style={styles.offlineTitle}>CONNECTION LOST</Text>
              <Text style={styles.offlineDescription}>
                Internet is required to run LootQuest. Please check your network connection and try again.
              </Text>
              <BouncyPressable
                onPress={handleRetryConnection}
                backgroundColor={COLORS.primary}
                borderRadius={4}
                style={styles.retryBtn}
                contentStyle={styles.retryBtnContent}
                disabled={retrying}
              >
                <Text style={styles.retryBtnText}>
                  {retrying ? 'CHECKING...' : 'RETRY CONNECTION'}
                </Text>
              </BouncyPressable>
            </View>
          </View>
        )}
      </SafeAreaView>
    </WebLandingWrapper>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingTop: Platform.OS === 'android' ? 36 : 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.bg,
  },
  loadingText: {
    fontFamily: FONTS.mono,
    fontSize: 16,
    color: COLORS.primary,
  },
  header: {
    backgroundColor: 'transparent',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 8 : 6,
    paddingBottom: 4,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    height: 44,
  },
  headerBrandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(12, 12, 12, 0.92)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: '#1C1C1E',
    ...SHADOWS.card,
  },
  brandGemIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(237, 237, 235, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    fontFamily: FONTS.extraBold,
    fontSize: 13,
    color: '#EDEDEB',
    letterSpacing: 2.2,
  },
  headerLiveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(237, 237, 235, 0.10)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
  },
  headerLiveDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#EDEDEB',
  },
  headerLiveText: {
    fontFamily: FONTS.mono,
    fontSize: 8.5,
    fontWeight: '800',
    color: '#EDEDEB',
    letterSpacing: 0.5,
  },
  content: {
    flex: 1,
  },
  screenContainer: {
    flex: 1,
  },
  tabBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    zIndex: 1000,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#000000',
    borderTopWidth: 1,
    borderTopColor: '#1C1C1E',
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    paddingHorizontal: 12,
    paddingTop: 8,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabBtn: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 2,
  },
  tabIconWrapper: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    position: 'relative',
  },
  activeTabDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#EDEDEB',
    marginTop: 2,
  },
  tabLabel: {
    fontSize: 10,
    fontFamily: FONTS.mono,
    fontWeight: '500',
    marginTop: 2,
    letterSpacing: 0.4,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  alertTabContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  alertBadge: {
    position: 'absolute',
    top: 2,
    right: 8,
    backgroundColor: COLORS.danger,
    borderRadius: RADIUS.pill,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    paddingHorizontal: 3,
  },
  alertBadgeText: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    color: '#fff',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  detailScreenOverlay: {
    zIndex: 9999,
    elevation: 9999,
    backgroundColor: '#000000',
  },
  modalSafeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  offlineOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: 9999,
  },
  offlineCard: {
    backgroundColor: COLORS.bgModal,
    borderRadius: RADIUS.xl,
    padding: 28,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.elevated,
  },
  wifiOffIconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.warningLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  offlineTitle: {
    fontFamily: FONTS.extraBold,
    fontSize: 18,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 1,
  },
  offlineDescription: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  retryBtn: {
    width: '100%',
    height: 48,
  },
  retryBtnContent: {
    justifyContent: 'center',
    alignItems: 'center',
    height: 48,
    borderRadius: RADIUS.md,
  },
  retryBtnText: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: '#fff',
    letterSpacing: 1,
  },
});
