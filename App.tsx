import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { StyleSheet, Text, View, SafeAreaView, Platform, Modal, Pressable, Linking, Animated, Easing, FlatList, BackHandler, useWindowDimensions, AccessibilityInfo, PanResponder, StatusBar as RNStatusBar } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useFonts } from 'expo-font';
import { NavigationBar } from 'expo-navigation-bar';
import { Notifications, analytics } from './src/utils/expoGoCompat';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, FONTS, RADIUS, SHADOWS } from './src/theme/theme';
import HomeScreen, { setDetailScreenActive } from './src/screens/HomeScreen';
import FeedScreen from './src/screens/FeedScreen';
import VaultScreen from './src/screens/VaultScreen';
import AlertsScreen from './src/screens/AlertsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import DetailScreen from './src/screens/DetailScreen';
import OnboardingScreen, { getSavedName } from './src/screens/OnboardingScreen';
import { dealsStore } from './src/services/dealsStore';
import { Deal } from './src/models/Deal';
import Reanimated, { SlideInRight, SlideOutRight, Easing as ReanimatedEasing } from 'react-native-reanimated';

import BouncyPressable from './src/components/BouncyPressable';
import {
  requestNotificationPermissions,
  registerBackgroundFetch,
  seedInitialSeenPosts,
  registerFCMToken,
  addAlertLogFromNotification,
  syncPendingPwaAlerts,
  startWebDealPoller,
  registerWebPushSubscription,
  getNotificationPermissionStatus,
} from './src/services/notificationService';
import { expiredFeedService } from './src/services/ExpiredFeedService';
import { sendDailyPing } from './src/services/usageAnalytics';
import { Ionicons } from '@expo/vector-icons';
import { WifiOff } from 'lucide-react-native';
import { HomeSkeleton } from './src/components/LootSkeleton';
import WebLandingWrapper from './src/components/WebLandingWrapper';
import DesktopWebApp from './src/components/DesktopWebApp';
import ClaimrLandingPage from './src/components/ClaimrLandingPage';
import { useSafeAreaInsets } from './src/utils/useSafeAreaInsets';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import PendingClaimFloatingToast from './src/components/PendingClaimFloatingToast';
import OpeningAnimation from './src/components/OpeningAnimation';
import ErrorBoundary from './src/components/ErrorBoundary';
import * as Updates from 'expo-updates';
import appJson from './app.json';
import { checkIsReduceMotionEnabled, subscribeToReduceMotion } from './src/utils/motion';
import { hapticFeedback } from './src/utils/haptics';

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

const TAB_ICONS = {
  home: { active: 'home', inactive: 'home-outline' },
  feed: { active: 'flash', inactive: 'flash-outline' },
  vault: { active: 'cube', inactive: 'cube-outline' },
  alerts: { active: 'radio', inactive: 'radio-outline' },
  settings: { active: 'options', inactive: 'options-outline' },
} as const;

interface TabBarItemProps {
  id: 'home' | 'feed' | 'vault' | 'alerts' | 'settings';
  label: string;
  isActive: boolean;
  scaleAnim: Animated.Value;
  badgeCount?: number;
  onPress: (tab: 'home' | 'feed' | 'vault' | 'alerts' | 'settings') => void;
}

const TabBarItem = React.memo(function TabBarItem({
  id,
  label,
  isActive,
  scaleAnim,
  badgeCount,
  onPress,
}: TabBarItemProps) {
  const handlePress = useCallback(() => {
    onPress(id);
  }, [id, onPress]);

  const activeColor = '#EDEDEB';
  const inactiveColor = '#86868B';
  const color = isActive ? activeColor : inactiveColor;
  const iconName = (isActive ? TAB_ICONS[id].active : TAB_ICONS[id].inactive) as keyof typeof Ionicons.glyphMap;

  return (
    <Pressable
      onPress={handlePress}
      unstable_pressDelay={0}
      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
      style={styles.tabBtn}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={label}
    >
      <View style={styles.alertTabContainer}>
        <Animated.View style={styles.tabIconWrapper}>
          <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <Ionicons name={iconName} size={18} color={color} />
          </Animated.View>
          <Text style={[styles.tabLabel, { color }]}>{label}</Text>
        </Animated.View>
        {id === 'alerts' && !!badgeCount && badgeCount > 0 && (
          <View style={styles.alertBadge}>
            <Text style={styles.alertBadgeText}>{badgeCount}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
});

export function MainApp() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular: require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
    Inter_500Medium: require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'),
    Inter_700Bold: require('@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf'),
    Inter_800ExtraBold: require('@expo-google-fonts/inter/800ExtraBold/Inter_800ExtraBold.ttf'),
    JetBrainsMono_400Regular: require('@expo-google-fonts/jetbrains-mono/400Regular/JetBrainsMono_400Regular.ttf'),
    JetBrainsMono_700Bold: require('@expo-google-fonts/jetbrains-mono/700Bold/JetBrainsMono_700Bold.ttf'),
    InstrumentSerif_400Regular: require('@expo-google-fonts/instrument-serif/400Regular/InstrumentSerif_400Regular.ttf'),
    'Unbounded-Bold': require('./assets/fonts/Unbounded-Bold.ttf'),
    PlusJakartaSans_500Medium: require('@expo-google-fonts/plus-jakarta-sans/500Medium/PlusJakartaSans_500Medium.ttf'),
    PlusJakartaSans_600SemiBold: require('@expo-google-fonts/plus-jakarta-sans/600SemiBold/PlusJakartaSans_600SemiBold.ttf'),
    PlusJakartaSans_700Bold: require('@expo-google-fonts/plus-jakarta-sans/700Bold/PlusJakartaSans_700Bold.ttf'),
    PlusJakartaSans_800ExtraBold: require('@expo-google-fonts/plus-jakarta-sans/800ExtraBold/PlusJakartaSans_800ExtraBold.ttf'),
  });

  const getInitialTab = (): 'home' | 'feed' | 'vault' | 'alerts' | 'settings' => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '').toLowerCase();
      if (['home', 'feed', 'vault', 'alerts', 'settings'].includes(hash)) {
        return hash as any;
      }
      try {
        const saved = localStorage.getItem('claimr_active_tab');
        if (saved && ['home', 'feed', 'vault', 'alerts', 'settings'].includes(saved)) {
          return saved as any;
        }
      } catch {}
    }
    return 'home';
  };

  const [activeTab, setActiveTab] = useState<'home' | 'feed' | 'vault' | 'alerts' | 'settings'>(getInitialTab);
  const [visitedTabs, setVisitedTabs] = useState<Record<string, boolean>>(() => {
    const init = getInitialTab();
    return {
      home: true,
      feed: true,
      vault: init === 'vault',
      alerts: init === 'alerts',
      settings: init === 'settings',
    };
  });

  // Pre-warm remaining tabs in background after initial render so switching is 100% instant
  useEffect(() => {
    const timer = setTimeout(() => {
      setVisitedTabs({ home: true, feed: true, vault: true, alerts: true, settings: true });
    }, 250);
    return () => clearTimeout(timer);
  }, []);
  const [claimedDeals, setClaimedDeals] = useState<Deal[]>([]);
  const [unreadAlertsCount, setUnreadAlertsCount] = useState<number>(0);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [retrying, setRetrying] = useState<boolean>(false);
  const [userName, setUserName] = useState<string>('Hunter');
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);
  const [onboardingReady, setOnboardingReady] = useState<boolean>(false);
  const [feedInitialCategory, setFeedInitialCategory] = useState<string | undefined>(undefined);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [preferMobileView, setPreferMobileView] = useState(false);

  const isPWAStandalone = Platform.OS === 'web' && typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );

  const [showMobileLanding, setShowMobileLanding] = useState<boolean>(() => {
    if (Platform.OS !== 'web') return false;
    // When installed as PWA on mobile or desktop, NEVER show landing page - directly show actual app!
    if (isPWAStandalone) return false;

    if (typeof window !== 'undefined') {
      const hash = (window.location.hash || '').replace(/^#\/?/, '').toLowerCase();
      const root = hash.split('/')[0];
      // If direct deep link to app tab or deal, skip landing page
      if (['app', 'home', 'feed', 'vault', 'alerts', 'settings', 'game', 'prime'].includes(root)) {
        return false;
      }
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.has('dealId') || searchParams.has('deal') || searchParams.has('id')) {
        return false;
      }
    }
    // Default for mobile web browser is to show landing page first!
    return true;
  });

  // Scroll-to-top ref for HomeScreen
  const homeScrollRef = useRef<any>(null);

  // Fallback for fonts so startup never stalls indefinitely
  const [fontSafetyReady, setFontSafetyReady] = useState(Platform.OS === 'web');
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const timer = setTimeout(() => setFontSafetyReady(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  // Split-flap Opening Animation (Cold start only)
  const [showIntroAnimation, setShowIntroAnimation] = useState(false);
  const isNotificationLaunchRef = useRef(false);

  // Safety watchdog: ensure showIntroAnimation never blocks user indefinitely (1.8s max)
  useEffect(() => {
    if (showIntroAnimation) {
      const timer = setTimeout(() => {
        setShowIntroAnimation(false);
      }, 1800);
      return () => clearTimeout(timer);
    }
  }, [showIntroAnimation]);

  useEffect(() => {
    // Website never plays loading / cold-start intro animation
    if (Platform.OS === 'web') {
      setShowIntroAnimation(false);
      return;
    }

    if (isNotificationLaunchRef.current) {
      setShowIntroAnimation(false);
      return;
    }

    AsyncStorage.getItem('claimr_intro_animation_enabled')
      .then(async (val) => {
        if (val === null) {
          val = await AsyncStorage.getItem('lootquest_intro_animation_enabled').catch(() => null);
        }
        const isEnabled = val === null || val === 'true';
        if (isEnabled && !isNotificationLaunchRef.current) {
          setShowIntroAnimation(true);
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            try { sessionStorage.setItem('claimr_intro_played', 'true'); } catch {}
          }
        } else {
          setShowIntroAnimation(false);
        }
      })
      .catch(() => {
        setShowIntroAnimation(false);
      });
  }, []);

  // Request notification permissions immediately on app launch (PWA & Android)
  useEffect(() => {
    let isMounted = true;
    async function promptNotificationsEarly() {
      try {
        const granted = await requestNotificationPermissions();
        if (!isMounted) return;
        if (granted) {
          if (Platform.OS === 'web') {
            registerWebPushSubscription().catch(() => {});
          } else {
            registerFCMToken().catch(() => {});
          }
        }
      } catch (err) {
        console.warn('[App] Early notification prompt error:', err);
      }
    }
    promptNotificationsEarly();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'android') {
      RNStatusBar.setBackgroundColor('transparent', true);
      RNStatusBar.setBarStyle('light-content', true);
      RNStatusBar.setTranslucent(true);
      try {
        const nb = require('expo-navigation-bar');
        if (nb && typeof nb.setBackgroundColorAsync === 'function') {
          nb.setBackgroundColorAsync('#000000').catch(() => {});
          nb.setButtonStyleAsync('light').catch(() => {});
          nb.setBorderColorAsync('#000000').catch(() => {});
        }
      } catch {}
    }
  }, []);
  
  // Animated tab values
  const tabAnimations = useRef({
    home: new Animated.Value(1),
    feed: new Animated.Value(1),
    vault: new Animated.Value(1),
    alerts: new Animated.Value(1),
    settings: new Animated.Value(1),
  }).current;

  // 180ms tab switching cross-fade (Part 2 Item 5)
  const tabFadeAnim = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  // Native stack navigation state
  const [activeDetailDeal, setActiveDetailDeal] = useState<Deal | null>(null);

  useEffect(() => {
    checkIsReduceMotionEnabled().then(setReduceMotion);
    return subscribeToReduceMotion(setReduceMotion);
  }, []);

  const handleOpenDeal = useCallback((deal: Deal) => {
    setDetailScreenActive(true);
    setActiveDetailDeal(deal);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const targetHash = `#game/${deal.id}`;
      if (window.location.hash !== targetHash) {
        window.history.pushState({ modal: 'deal', id: deal.id }, '', targetHash);
      }
    }
  }, []);

  const handleCloseDeal = useCallback(() => {
    setDetailScreenActive(false);
    setActiveDetailDeal(null);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.location.hash.startsWith('#game/')) {
        window.history.back();
      }
    }
  }, []);

  // Check for saved name on mount with strict timeout fallback
  useEffect(() => {
    let mounted = true;
    const safety = setTimeout(() => {
      if (mounted) setOnboardingReady(true);
    }, 600);

    getSavedName()
      .then((name) => {
        if (mounted && name) {
          setUserName(name);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setOnboardingReady(true);
        clearTimeout(safety);
      });

    return () => {
      mounted = false;
      clearTimeout(safety);
    };
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
    if (showIntroAnimation) return;
    const initApp = async () => {
      // Run network connectivity check and silent update check concurrently
      checkConnection();
      checkForUpdatesSilently();

      // Anonymous usage ping: only count when on native Android, installed PWA, or inside the live app (never for landing page visitors)
      if (Platform.OS !== 'web' || isPWAStandalone || !showMobileLanding) {
        sendDailyPing();
      }

      // Firebase Analytics: disable collection once per launch (guarded if missing)
      try {
        analytics().setAnalyticsCollectionEnabled?.(false);
      } catch {}

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

      if (Platform.OS === 'web') {
        registerWebPushSubscription().catch(() => {});
        startWebDealPoller(() => setUnreadAlertsCount((prev) => prev + 1));
        syncPendingPwaAlerts().then(() => {
          AsyncStorage.getItem('fgf_unread_alerts_count').then((cnt) => {
            if (cnt) setUnreadAlertsCount(parseInt(cnt, 10) || 0);
          });
        });
      }

      // Clear app badge count on app launch
      Notifications.setBadgeCountAsync?.(0).catch(() => {});
    };
    initApp();

    // 1. Log incoming notification when received in foreground
    const receivedSubscription = typeof Notifications?.addNotificationReceivedListener === 'function'
      ? Notifications.addNotificationReceivedListener((notification: any) => {
          if (notification?.request?.content) {
            addAlertLogFromNotification(notification.request.content);
            setUnreadAlertsCount((prev) => prev + 1);
          }
        })
      : null;

    // Helper: Handle notification response (cold-start, background tap, foreground tap)
    const handleNotificationResponse = (response: any) => {
      // Clear app badge when user taps a notification
      Notifications.setBadgeCountAsync?.(0).catch(() => {});

      const content = response?.notification?.request?.content;
      if (content) {
        addAlertLogFromNotification(content);
      }

      const data = content?.data as any;
      if (data && data.postId) {
        const title = content?.title || '';
        const body = content?.body || '';
        
        const titleToSearch = (title + ' ' + body + ' ' + (data.redditTitle || '')).toLowerCase();
        const urlStr = String(data.url || '').toLowerCase();

        let platform = data.platform || 'Steam';
        if (!data.platform) {
          if (titleToSearch.includes('steam')) platform = 'Steam';
          else if (titleToSearch.includes('epic')) platform = 'Epic Games';
          else if (titleToSearch.includes('gog')) platform = 'GOG';
          else if (titleToSearch.includes('itch')) platform = 'Itch.io';
          else if (titleToSearch.includes('prime') || titleToSearch.includes('amazon')) platform = 'Prime Gaming';
        }

        let dealTitle = 'New Free Game!';
        if (data.gameTitle) {
          dealTitle = data.gameTitle;
        } else if (data.redditTitle) {
          dealTitle = data.redditTitle.replace(/^\[[^\]]+\]\s*/, '').replace(/\([^)]+\)\s*/, '').trim();
        } else if (title.includes('on') && title.includes('!')) {
          dealTitle = body;
        } else if (title.startsWith('🆓 ')) {
          dealTitle = title.replace('🆓 ', '').trim();
        } else if (body.startsWith('[') && body.includes(']')) {
          dealTitle = body.replace(/^\[[^\]]+\]\s*/, '').replace(/\([^)]+\)\s*/, '').trim();
        } else {
          dealTitle = body || title || 'New Free Game!';
        }
        
        // 1. Check if dealsStore already has the full deal with rich metadata
        const existing = dealsStore.getDealById(String(data.postId));
        if (existing) {
          handleOpenDeal(existing);
          return;
        }

        // 2. Unknown id that is a Prime post: route to Prime Gaming notice
        const isPrimePostNotification =
          platform.toLowerCase().includes('prime') ||
          platform.toLowerCase().includes('amazon') ||
          titleToSearch.includes('prime') ||
          titleToSearch.includes('amazon') ||
          urlStr.includes('gaming.amazon') ||
          urlStr.includes('primegaming') ||
          urlStr.includes('luna.amazon');

        if (isPrimePostNotification) {
          handleOpenDeal(dealsStore.getPrimeNoticeDeal());
          return;
        }

        // 3. Fallback: construct minimal deal from notification and trigger immediate sync
        const notificationDeal: Deal = {
          id: String(data.postId || data.dealId),
          title: dealTitle,
          platform: platform,
          type: 'full_game',
          claimMethod: (data.isTask as boolean) ? 'tasks' : 'one_click',
          url: (data.url as string) || 'https://store.steampowered.com',
          giveawayUrl: (data.url as string) || undefined,
          author: 'Freebie Radar',
          image: data.image || undefined,
          resolvedImage: data.image || undefined,
          resolvedPoster: data.image || undefined,
          redditUrl: (data.permalink as string) || undefined,
          isFromNotification: true,
        };

        handleOpenDeal(notificationDeal);
        dealsStore.upsertDeal(notificationDeal);

        // Trigger on-demand sync so full metadata enriches dynamically
        dealsStore.sync(true).then(() => {
          const enriched = dealsStore.getDealById(String(data.postId || data.dealId));
          if (enriched) {
            handleOpenDeal(enriched);
          }
        }).catch((err) => {
          console.log('[App] Background sync after notification notice:', err);
        });
      }
    };

    // 2. Handle cold start notification response
    Notifications.getLastNotificationResponseAsync?.().then((response: any) => {
      if (response?.notification?.request?.content) {
        isNotificationLaunchRef.current = true;
        setShowIntroAnimation(false);
        handleNotificationResponse(response);
      }
    }).catch(() => {});

    // 3. Handle notification clicks while app is open or in background
    const responseSubscription = typeof Notifications?.addNotificationResponseReceivedListener === 'function'
      ? Notifications.addNotificationResponseReceivedListener(handleNotificationResponse)
      : null;

    let swMessageCleanup: (() => void) | null = null;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const handleSwMessage = (e: MessageEvent) => {
        if (e.data && e.data.type === 'CLAIMR_PUSH_RECEIVED' && e.data.data) {
          addAlertLogFromNotification({
            data: e.data.data,
            title: e.data.data.displayTitle || e.data.data.title || e.data.data.gameTitle || 'Free Game',
            body: e.data.data.displayBody || e.data.data.body || e.data.data.gameTitle || 'Free Game',
          }).then(() => {
            AsyncStorage.getItem('fgf_unread_alerts_count').then((cnt) => {
              if (cnt) setUnreadAlertsCount(parseInt(cnt, 10) || 0);
            });
          });
        }
        if (e.data && e.data.type === 'CLAIMR_NOTIFICATION_CLICK' && e.data.data) {
          handleNotificationResponse({
            notification: {
              request: {
                content: {
                  data: e.data.data,
                  title: e.data.data.displayTitle || e.data.data.title || e.data.data.gameTitle || 'Free Game',
                  body: e.data.data.displayBody || e.data.data.body || e.data.data.gameTitle || 'Free Game',
                },
              },
            },
          });
        }
      };
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
      swMessageCleanup = () => {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      };
    }

    // Web PWA Deep Link (?dealId=...)
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const urlDealId = searchParams.get('dealId');
        if (urlDealId) {
          const cleanUrl = window.location.pathname + window.location.hash;
          window.history.replaceState({}, '', cleanUrl);

          const titleParam = searchParams.get('title') || 'Free Game';
          const dealUrlParam = searchParams.get('url') || '';
          const platformParam = searchParams.get('platform') || 'Steam';
          const isTaskParam = searchParams.get('isTask') === '1';
          const imageParam = searchParams.get('image') || undefined;

          // Ensure clicked notification deep link is registered in Alerts
          addAlertLogFromNotification({
            data: {
              postId: urlDealId,
              title: titleParam,
              body: titleParam,
              url: dealUrlParam,
              platform: platformParam,
              isTask: isTaskParam,
              image: imageParam,
              gameTitle: titleParam,
            },
            title: titleParam,
            body: titleParam,
          });

          const cached = dealsStore.getDealById(urlDealId);
          if (cached) {
            handleOpenDeal(cached);
          } else {
            const fallbackDeal: Deal = {
              id: urlDealId,
              title: titleParam,
              platform: platformParam,
              type: 'full_game',
              claimMethod: isTaskParam ? 'tasks' : 'one_click',
              url: dealUrlParam || 'https://store.steampowered.com',
              giveawayUrl: dealUrlParam || undefined,
              author: 'Freebie Radar',
              image: imageParam,
              resolvedImage: imageParam,
              resolvedPoster: imageParam,
              isFromNotification: true,
            };
            handleOpenDeal(fallbackDeal);
            dealsStore.upsertDeal(fallbackDeal);

            dealsStore.sync(false).then(() => {
              const foundDeal = dealsStore.getDealById(urlDealId);
              if (foundDeal) {
                handleOpenDeal(foundDeal);
              }
            });
          }
        }

        const rawHash = window.location.hash.replace('#', '');
        if (rawHash.startsWith('game/')) {
          const hashDealId = rawHash.slice(5);
          const cached = dealsStore.getDealById(hashDealId);
          if (cached) {
            handleOpenDeal(cached);
          } else {
            dealsStore.sync(false).then(() => {
              const foundDeal = dealsStore.getDealById(hashDealId);
              if (foundDeal) {
                handleOpenDeal(foundDeal);
              }
            });
          }
        }
      } catch {}
    }

    return () => {
      receivedSubscription?.remove?.();
      responseSubscription?.remove?.();
      if (swMessageCleanup) {
        swMessageCleanup();
      }
    };
  }, [showIntroAnimation]);


  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const handleTabChange = useCallback((tab: 'home' | 'feed' | 'vault' | 'alerts' | 'settings') => {
    // If tapping the already-active tab -> scroll to top if Home
    if (tab === activeTabRef.current) {
      if (tab === 'home') {
        homeScrollRef.current?.scrollTo?.({ y: 0, animated: true });
      }
      return;
    }

    hapticFeedback.selection();

    // Graceful 120ms cubic ease-out pulse on icon
    const animValue = tabAnimations[tab];
    animValue.setValue(0.88);
    Animated.timing(animValue, {
      toValue: 1,
      duration: 120,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        localStorage.setItem('claimr_active_tab', tab);
        if (window.location.hash.replace('#', '').toLowerCase() !== tab) {
          window.history.replaceState(window.history.state, '', `#${tab}`);
        }
      } catch {}
    }

    setActiveTab(tab);
    setVisitedTabs((prev) => (prev[tab] ? prev : { ...prev, [tab]: true }));

    if (tab === 'alerts') {
      setUnreadAlertsCount(0);
      AsyncStorage.setItem('fgf_unread_alerts_count', '0').catch(() => {});
    }
  }, [tabAnimations]);

  const handleNavigateToFeed = useCallback((params?: { filterUnclaimed?: boolean }) => {
    if (params?.filterUnclaimed) {
      setFeedInitialCategory('unclaimed');
    }
    handleTabChange('feed');
  }, [handleTabChange]);

  // Unified Back Handler: hardware back button (Android) & popstate swipe/back gesture (Web / PWA)
  useEffect(() => {
    const onHardwareBack = () => {
      if (activeDetailDeal) {
        setDetailScreenActive(false);
        setActiveDetailDeal(null);
        return true;
      }
      if (activeTab !== 'home') {
        handleTabChange('home');
        return true;
      }
      return false;
    };
    const backSub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);

    const onPopState = (event: PopStateEvent) => {
      if (activeDetailDeal) {
        setDetailScreenActive(false);
        setActiveDetailDeal(null);
        return;
      }
      const rawHash = window.location.hash.replace('#', '');
      const hash = rawHash.toLowerCase();

      if (rawHash === 'landing') {
        setShowMobileLanding(true);
        return;
      }

      if (['app', 'home', 'feed', 'vault', 'alerts', 'settings'].includes(hash) || rawHash.startsWith('game/') || rawHash.startsWith('prime')) {
        setShowMobileLanding(false);
      }

      if (hash && ['home', 'feed', 'vault', 'alerts', 'settings'].includes(hash)) {
        handleTabChange(hash as any);
      } else if (rawHash.startsWith('game/')) {
        const dealId = rawHash.slice(5);
        const cached = dealsStore.getDealById(dealId);
        if (cached) {
          setDetailScreenActive(true);
          setActiveDetailDeal(cached);
        } else {
          dealsStore.sync(false).then(() => {
            const found = dealsStore.getDealById(dealId);
            if (found) {
              setDetailScreenActive(true);
              setActiveDetailDeal(found);
            }
          });
        }
      } else if (rawHash.startsWith('prime')) {
        setDetailScreenActive(true);
        setActiveDetailDeal(dealsStore.getPrimeNoticeDeal());
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('popstate', onPopState);
    }

    return () => {
      backSub.remove();
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.removeEventListener('popstate', onPopState);
      }
    };
  }, [activeDetailDeal, activeTab, handleTabChange]);

  const handleRemoveClaimed = useCallback((dealId: string) => {
    dealsStore.unclaimDeal(dealId);
  }, []);

  const handleUpdateUserName = useCallback((name: string) => {
    setUserName(name);
  }, []);

  const isTouchPhone = Platform.OS === 'web' && typeof window !== 'undefined' && (
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches && width < 900) ||
    /Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  );
  const isDesktop = Platform.OS === 'web' && width >= 900 && !isTouchPhone && !preferMobileView && !isPWAStandalone;

  if (isDesktop) {
    return <DesktopWebApp onSwitchToMobile={() => setPreferMobileView(true)} />;
  }

  // Mobile Web Browser (not standalone PWA): Show landing page first with "Launch App" button
  if (Platform.OS === 'web' && !isPWAStandalone && showMobileLanding) {
    const activeDeals = dealsStore.getActiveDeals();
    const totalSavings = activeDeals.reduce((sum, d) => sum + (d.originalPrice || 0), 0);
    return (
      <ClaimrLandingPage
        onLaunchApp={() => {
          setShowMobileLanding(false);
          sendDailyPing();
          dealsStore.sync(true).catch(() => {});
          if (typeof window !== 'undefined') {
            window.location.hash = 'app';
          }
        }}
        onNavigate={(tab) => {
          setShowMobileLanding(false);
          sendDailyPing();
          handleTabChange(tab as any);
          if (typeof window !== 'undefined') {
            window.location.hash = tab;
          }
        }}
        activeDealsCount={activeDeals.length}
        totalSavingsValue={totalSavings}
      />
    );
  }

  const isAppReady = (fontsLoaded || fontSafetyReady) && onboardingReady;

  return (
    <WebLandingWrapper onSwitchToDesktop={() => setPreferMobileView(false)}>
      <View style={styles.safeArea}>
        <StatusBar style="light" />
        {Platform.OS === 'android' && <NavigationBar style="dark" />}

        {/* Main app is rendered and pre-warmed in background for instant home display */}
        <View style={{ flex: 1 }}>
        {!isAppReady ? (
          <View style={styles.loadingContainer}>
            <HomeSkeleton />
          </View>
        ) : showOnboarding ? (
          <OnboardingScreen onComplete={handleOnboardingComplete} />
        ) : (
          <>
            {/* Full Tabs Wrapper */}
            <View style={styles.tabsWrapper}>
              {/* Main Content — instant zero-layout visibility switching, pre-warmed & memoized */}
              <View style={styles.content}>
                <View
                  style={[
                    styles.screenContainer,
                    activeTab === 'home' ? styles.screenActive : styles.screenInactive,
                  ]}
                  pointerEvents={activeTab === 'home' ? 'auto' : 'none'}
                >
                  <HomeScreen
                    onDealSelect={handleOpenDeal}
                    claimedDeals={claimedDeals}
                    userName={userName || 'Hunter'}
                    scrollRef={homeScrollRef}
                    onNavigateToFeed={handleNavigateToFeed}
                  />
                </View>
                <View
                  style={[
                    styles.screenContainer,
                    activeTab === 'feed' ? styles.screenActive : styles.screenInactive,
                  ]}
                  pointerEvents={activeTab === 'feed' ? 'auto' : 'none'}
                >
                  <FeedScreen
                    onDealSelect={handleOpenDeal}
                    claimedDeals={claimedDeals}
                    initialCategory={feedInitialCategory}
                  />
                </View>
                {visitedTabs.vault && (
                  <View
                    style={[
                      styles.screenContainer,
                      activeTab === 'vault' ? styles.screenActive : styles.screenInactive,
                    ]}
                    pointerEvents={activeTab === 'vault' ? 'auto' : 'none'}
                  >
                    <VaultScreen 
                      onDealSelect={handleOpenDeal}
                      claimedDeals={claimedDeals}
                      onRemoveClaimed={handleRemoveClaimed}
                    />
                  </View>
                )}
                {visitedTabs.alerts && (
                  <View
                    style={[
                      styles.screenContainer,
                      activeTab === 'alerts' ? styles.screenActive : styles.screenInactive,
                    ]}
                    pointerEvents={activeTab === 'alerts' ? 'auto' : 'none'}
                  >
                    <AlertsScreen 
                      onDealSelect={handleOpenDeal}
                      isActive={activeTab === 'alerts'}
                    />
                  </View>
                )}
                {visitedTabs.settings && (
                  <View
                    style={[
                      styles.screenContainer,
                      activeTab === 'settings' ? styles.screenActive : styles.screenInactive,
                    ]}
                    pointerEvents={activeTab === 'settings' ? 'auto' : 'none'}
                  >
                    <SettingsScreen
                      userName={userName}
                      onUpdateUserName={handleUpdateUserName}
                    />
                  </View>
                )}
              </View>

              {/* Full-width Opaque #000 Hallmark Tab Bar with 1px hairline */}
              <View
                style={styles.tabBarContainer}
                pointerEvents={activeDetailDeal ? 'none' : 'auto'}
              >
                <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 12), height: 48 + Math.max(insets.bottom, 12) }]}>
                  <TabBarItem
                    id="home"
                    label="Home"
                    isActive={activeTab === 'home'}
                    scaleAnim={tabAnimations.home}
                    onPress={handleTabChange}
                  />
                  <TabBarItem
                    id="feed"
                    label="Feed"
                    isActive={activeTab === 'feed'}
                    scaleAnim={tabAnimations.feed}
                    onPress={handleTabChange}
                  />
                  <TabBarItem
                    id="vault"
                    label="Vault"
                    isActive={activeTab === 'vault'}
                    scaleAnim={tabAnimations.vault}
                    onPress={handleTabChange}
                  />
                  <TabBarItem
                    id="alerts"
                    label="Alerts"
                    isActive={activeTab === 'alerts'}
                    scaleAnim={tabAnimations.alerts}
                    badgeCount={unreadAlertsCount}
                    onPress={handleTabChange}
                  />
                  <TabBarItem
                    id="settings"
                    label="Settings"
                    isActive={activeTab === 'settings'}
                    scaleAnim={tabAnimations.settings}
                    onPress={handleTabChange}
                  />
                </View>
              </View>
            </View>

            {/* Floating "Did you claim it?" Notice Toast */}
            <PendingClaimFloatingToast onOpenDeal={handleOpenDeal} isDetailOpen={!!activeDetailDeal} />

            {/* Native UI-thread Sliding Detail Screen with true Ease-In and Ease-Out */}
            {activeDetailDeal && (
              <Reanimated.View
                entering={SlideInRight.duration(200).easing(ReanimatedEasing.inOut(ReanimatedEasing.cubic))}
                exiting={SlideOutRight.duration(160).easing(ReanimatedEasing.inOut(ReanimatedEasing.cubic))}
                style={styles.detailScreenRoot}
              >
                <DetailScreen
                  key={activeDetailDeal.id}
                  deal={activeDetailDeal}
                  onClose={handleCloseDeal}
                  onClaimed={(claimedDeal) => {
                    dealsStore.claimDeal(claimedDeal);
                  }}
                />
              </Reanimated.View>
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
                Internet is required to run Claimr. Please check your network connection and try again.
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
          </>
        )}
        </View>

        {/* Cinematic Claimr Startup Animation (full-screen top layer above everything) */}
        {showIntroAnimation && (
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                zIndex: 999999,
                elevation: 999999,
                backgroundColor: '#000000',
              },
            ]}
          >
            <OpeningAnimation
              onFinish={() => setShowIntroAnimation(false)}
            />
          </View>
        )}
      </View>
    </WebLandingWrapper>
  );
}

let VercelAnalytics: React.ComponentType | null = null;
if (Platform.OS === 'web') {
  try {
    const { Analytics } = require('@vercel/analytics/react');
    VercelAnalytics = Analytics;
  } catch {}
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000000' }}>
      <KeyboardProvider>
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <ErrorBoundary>
            <MainApp />
            {VercelAnalytics && <VercelAnalytics />}
          </ErrorBoundary>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingTop: 0,
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
    position: 'relative',
  },
  tabsWrapper: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#000000',
  },

  screenContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  screenActive: {
    opacity: 1,
    zIndex: 1,
  },
  screenInactive: {
    opacity: 0,
    zIndex: 0,
  },
  tabBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    backgroundColor: '#000000',
    elevation: 1000,
    zIndex: 1000,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#000000',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    paddingHorizontal: 12,
    paddingTop: 8,
    alignItems: 'center',
    justifyContent: 'space-around',
    elevation: 1000,
  },
  tabBtn: {
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 0,
  },
  tabIconWrapper: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    position: 'relative',
  },

  tabLabel: {
    fontSize: 10,
    fontFamily: FONTS.medium,
    fontWeight: '500',
    marginTop: 2,
    letterSpacing: 0.2,
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
  stackRoot: {
    flex: 1,
    backgroundColor: '#000000',
  },
  detailScreenRoot: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#000000',
    zIndex: 9999,
    elevation: 9999,
  },
});
