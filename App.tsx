import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, SafeAreaView, Platform, Modal, Pressable, Linking } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, FONTS } from './src/theme/theme';
import FeedScreen from './src/screens/FeedScreen';
import VaultScreen from './src/screens/VaultScreen';
import AlertsScreen from './src/screens/AlertsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import DetailScreen from './src/screens/DetailScreen';
import { getClaimedPosts } from './src/services/storageService';
import { postToBasicDeal } from './src/services/DealClassifier';
import { Deal } from './src/models/Deal';
import BouncyPressable from './src/components/BouncyPressable';
import {
  requestNotificationPermissions,
  registerBackgroundFetch,
  seedInitialSeenPosts,
  registerFCMToken,
} from './src/services/notificationService';
import { expiredFeedService } from './src/services/ExpiredFeedService';
import { Home, Inbox, Bell, User, Settings, Gamepad2, WifiOff, Sparkles, AlertTriangle } from 'lucide-react-native';
import HourglassLoader from './src/components/HourglassLoader';
import * as Updates from 'expo-updates';
import analytics from '@react-native-firebase/analytics';
import appJson from './app.json';

// Helper to compare two semantic version strings
function isVersionOlder(current: string, required: string): boolean {
  const currentParts = current.split('.').map(Number);
  const requiredParts = required.split('.').map(Number);

  for (let i = 0; i < Math.max(currentParts.length, requiredParts.length); i++) {
    const currentVal = currentParts[i] || 0;
    const requiredVal = requiredParts[i] || 0;
    if (currentVal < requiredVal) return true;
    if (currentVal > requiredVal) return false;
  }
  return false;
}

export default function App() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular: require('@expo-google-fonts/plus-jakarta-sans/400Regular/PlusJakartaSans_400Regular.ttf'),
    PlusJakartaSans_500Medium: require('@expo-google-fonts/plus-jakarta-sans/500Medium/PlusJakartaSans_500Medium.ttf'),
    PlusJakartaSans_600SemiBold: require('@expo-google-fonts/plus-jakarta-sans/600SemiBold/PlusJakartaSans_600SemiBold.ttf'),
    PlusJakartaSans_700Bold: require('@expo-google-fonts/plus-jakarta-sans/700Bold/PlusJakartaSans_700Bold.ttf'),
    PlusJakartaSans_800ExtraBold: require('@expo-google-fonts/plus-jakarta-sans/800ExtraBold/PlusJakartaSans_800ExtraBold.ttf'),
    SpaceMono_400Regular: require('@expo-google-fonts/space-mono/400Regular/SpaceMono_400Regular.ttf'),
    SpaceMono_700Bold: require('@expo-google-fonts/space-mono/700Bold/SpaceMono_700Bold.ttf'),
  });

  const { currentlyRunning, isUpdateAvailable, isUpdatePending } = Updates.useUpdates();

  const handleReloadApp = async () => {
    try {
      await Updates.reloadAsync();
    } catch (e) {
      console.error('Failed to reload update:', e);
    }
  };

  const [activeTab, setActiveTab] = useState<'feed' | 'vault' | 'alerts' | 'settings'>('feed');
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [claimedDeals, setClaimedDeals] = useState<Deal[]>([]);
  const [unreadAlertsCount, setUnreadAlertsCount] = useState<number>(0);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [retrying, setRetrying] = useState<boolean>(false);

  // Force Update state
  const [showForceUpdateModal, setShowForceUpdateModal] = useState<boolean>(false);
  const [minRequiredVersion, setMinRequiredVersion] = useState<string>('1.2.0');
  const [downloadUrl, setDownloadUrl] = useState<string>('https://github.com/EklavyaAhuja/LootQuest/releases/latest');

  const checkConnection = async () => {
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

  const checkForceUpdate = async () => {
    console.log('[ForceUpdate] Running version check against remote JSON...');
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(
        `https://raw.githubusercontent.com/EklavyaAhuja/LootQuest/main/version.json?t=${Date.now()}`,
        {
          signal: controller.signal,
          headers: { 'Cache-Control': 'no-cache' }
        }
      );
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        const currentVersion = appJson.expo.version;
        const minRequired = data.minRequiredVersion;
        
        if (minRequired && isVersionOlder(currentVersion, minRequired)) {
          console.log(`[ForceUpdate] Current version ${currentVersion} is older than min required ${minRequired}. Blocking app.`);
          if (data.downloadUrl) {
            setDownloadUrl(data.downloadUrl);
          }
          setMinRequiredVersion(minRequired);
          setShowForceUpdateModal(true);
        } else {
          console.log(`[ForceUpdate] Version check passed: current ${currentVersion}, required ${minRequired}`);
        }
      } else {
        console.warn(`[ForceUpdate] Failed to fetch version.json. Status: ${response.status}. Failing open.`);
      }
    } catch (error) {
      console.warn('[ForceUpdate] Error fetching remote version config (failing open):', error);
    }
  };

  const handleDownloadUpdate = async () => {
    try {
      await Linking.openURL(downloadUrl);
    } catch (e) {
      console.error('Failed to open download URL:', e);
    }
  };

  const loadClaimedPosts = async () => {
    try {
      const claimed = await getClaimedPosts();
      setClaimedDeals(claimed.map(postToBasicDeal));
    } catch (e) {
      console.error('Error loading claimed posts:', e);
    }
  };

  useEffect(() => {
    loadClaimedPosts();
  }, [activeTab, selectedDeal]);

  // Initialize App Configuration (Permissions, Background Task)
  useEffect(() => {
    const initApp = async () => {
      // Check network connection first
      await checkConnection();

      // Check for force update (fails open if offline/timeout)
      await checkForceUpdate();

      // Log App Open event in Firebase Analytics
      try {
        await analytics().logAppOpen();
        console.log('[Analytics] App open logged successfully');
      } catch (analyticsError) {
        console.warn('[Analytics] Error logging app open:', analyticsError);
      }

      // Initialize expired posts service first
      await expiredFeedService.initialize();
      
      const granted = await requestNotificationPermissions();
      if (granted) {
        console.log('Notifications permissions granted.');
        await seedInitialSeenPosts();
        await registerBackgroundFetch();
        await registerFCMToken();
      }

      // Load initial unread count
      try {
        const rawCount = await AsyncStorage.getItem('fgf_unread_alerts_count');
        if (rawCount) {
          setUnreadAlertsCount(Number(rawCount));
        }
      } catch (e) {
        console.error('Error loading unread count:', e);
      }
    };
    initApp();

    // Handle notification clicks (Deep link to detail view)
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data && data.postId) {
        const title = response.notification.request.content.title || '';
        const body = response.notification.request.content.body || '';
        
        let platform = 'Steam';
        if (title.includes('Steam')) platform = 'Steam';
        else if (title.includes('Epic')) platform = 'Epic Games';
        else if (title.includes('GOG')) platform = 'GOG';
        
        const notificationDeal: Deal = {
          id: String(data.postId),
          title: body || title || 'New Free Game!',
          platform: platform,
          type: 'full_game',
          claimMethod: (data.isTask as boolean) ? 'tasks' : 'one_click',
          url: (data.url as string) || 'https://store.steampowered.com',
          author: 'Freebie Radar',
          redditUrl: (data.permalink as string) || undefined,
        };

        setSelectedDeal(notificationDeal);
        handleTabChange('feed');
      }
    });

    return () => subscription.remove();
  }, []);

  const handleTabChange = async (tab: 'feed' | 'vault' | 'alerts' | 'settings') => {
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

  if (!fontsLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <HourglassLoader />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" backgroundColor={COLORS.bg} />
      
      {/* Top App Bar Header matching Stitch */}
      <View style={styles.header}>
        <Pressable onPress={() => handleTabChange('feed')}>
          <Gamepad2 size={26} color={COLORS.primary} />
        </Pressable>
        
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerText}>LOOTQUEST</Text>
        </View>

        <Pressable onPress={() => handleTabChange('settings')}>
          <Settings size={26} color={COLORS.text} />
        </Pressable>
      </View>

      {/* Update Banner */}
      {isUpdatePending && (
        <View style={styles.updateBanner}>
          <View style={styles.updateBannerLeft}>
            <Sparkles size={20} color={COLORS.primary} />
            <Text style={styles.updateBannerText}>New update is ready!</Text>
          </View>
          <BouncyPressable
            onPress={handleReloadApp}
            backgroundColor={COLORS.primary}
            borderRadius={8}
            shadowOffsetSize={0}
            style={styles.updateBtn}
            contentStyle={styles.updateBtnContent}
          >
            <Text style={styles.updateBtnText}>RESTART</Text>
          </BouncyPressable>
        </View>
      )}

      {/* Main Content Screens Switcher */}
      <View style={styles.content}>
        {activeTab === 'feed' && (
          <FeedScreen 
            onDealSelect={setSelectedDeal} 
            claimedDeals={claimedDeals} 
            onNewAlerts={(count) => {
              setUnreadAlertsCount((prev) => prev + count);
            }}
            onConnectionError={() => setIsOffline(true)}
          />
        )}
        {activeTab === 'vault' && <VaultScreen onDealSelect={setSelectedDeal} />}
        {activeTab === 'alerts' && <AlertsScreen />}
        {activeTab === 'settings' && <SettingsScreen />}
      </View>

      {/* Bottom Tab Bar Navigation matching Stitch */}
      <View style={styles.tabBar}>
        {/* Home Feed */}
        <Pressable
          onPress={() => handleTabChange('feed')}
          style={styles.tabBtn}
        >
          <View style={activeTab === 'feed' ? styles.tabIconWrapperActive : styles.tabIconWrapper}>
            <Home size={22} color={activeTab === 'feed' ? COLORS.primary : COLORS.textMuted} />
            <Text style={[styles.tabLabel, { color: activeTab === 'feed' ? COLORS.primary : COLORS.textMuted }]}>Home</Text>
          </View>
        </Pressable>

        {/* Vault */}
        <Pressable
          onPress={() => handleTabChange('vault')}
          style={styles.tabBtn}
        >
          <View style={activeTab === 'vault' ? styles.tabIconWrapperActive : styles.tabIconWrapper}>
            <Inbox size={22} color={activeTab === 'vault' ? COLORS.primary : COLORS.textMuted} />
            <Text style={[styles.tabLabel, { color: activeTab === 'vault' ? COLORS.primary : COLORS.textMuted }]}>Vault</Text>
          </View>
        </Pressable>

        {/* Alerts */}
        <Pressable
          onPress={() => handleTabChange('alerts')}
          style={styles.tabBtn}
        >
          <View style={styles.alertTabContainer}>
            <View style={activeTab === 'alerts' ? styles.tabIconWrapperActive : styles.tabIconWrapper}>
              <Bell size={22} color={activeTab === 'alerts' ? COLORS.primary : COLORS.textMuted} />
              <Text style={[styles.tabLabel, { color: activeTab === 'alerts' ? COLORS.primary : COLORS.textMuted }]}>Alerts</Text>
            </View>
            {/* Badge */}
            {unreadAlertsCount > 0 && (
              <View style={styles.alertBadge}>
                <Text style={styles.alertBadgeText}>{unreadAlertsCount}</Text>
              </View>
            )}
          </View>
        </Pressable>

        {/* Me / Profile */}
        <Pressable
          onPress={() => handleTabChange('settings')}
          style={styles.tabBtn}
        >
          <View style={activeTab === 'settings' ? styles.tabIconWrapperActive : styles.tabIconWrapper}>
            <User size={22} color={activeTab === 'settings' ? COLORS.primary : COLORS.textMuted} />
            <Text style={[styles.tabLabel, { color: activeTab === 'settings' ? COLORS.primary : COLORS.textMuted }]}>Settings</Text>
          </View>
        </Pressable>
      </View>

      {/* Detail Modal */}
      <Modal
        visible={selectedDeal !== null}
        animationType="slide"
        onRequestClose={() => setSelectedDeal(null)}
        statusBarTranslucent={true}
      >
        {selectedDeal && (
          <View style={styles.modalSafeArea}>
            <DetailScreen deal={selectedDeal} onClose={() => setSelectedDeal(null)} />
          </View>
        )}
      </Modal>

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
              backgroundColor="#39ff14"
              borderRadius={12}
              shadowOffsetSize={0}
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

      {/* Force Update Overlay UI */}
      {showForceUpdateModal && (
        <View style={styles.forceUpdateOverlay}>
          <View style={styles.forceUpdateCard}>
            <View style={styles.warningIconWrapper}>
              <AlertTriangle size={40} color={COLORS.warning} />
            </View>
            <Text style={styles.forceUpdateTitle}>UPDATE REQUIRED</Text>
            <Text style={styles.forceUpdateDescription}>
              {isUpdatePending 
                ? 'An over-the-air update is ready to install. Please restart the app to apply it.'
                : `A mandatory update (v${minRequiredVersion} or newer) is required to continue using LootQuest. Please download and install the latest version.`
              }
            </Text>
            
            {isUpdatePending && (
              <BouncyPressable
                onPress={handleReloadApp}
                backgroundColor={COLORS.success}
                borderRadius={12}
                shadowOffsetSize={0}
                style={[styles.downloadBtn, { marginBottom: 12 }]}
                contentStyle={styles.downloadBtnContent}
              >
                <Text style={[styles.downloadBtnText, { color: '#0b101e' }]}>
                  RESTART & APPLY
                </Text>
              </BouncyPressable>
            )}

            <BouncyPressable
              onPress={handleDownloadUpdate}
              backgroundColor={COLORS.primary}
              borderRadius={12}
              shadowOffsetSize={0}
              style={styles.downloadBtn}
              contentStyle={styles.downloadBtnContent}
            >
              <Text style={styles.downloadBtnText}>
                UPDATE NOW
              </Text>
            </BouncyPressable>
          </View>
        </View>
      )}
    </SafeAreaView>
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
    backgroundColor: COLORS.bg,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 64,
    shadowColor: '#a855f7',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.15,
    shadowRadius: 40,
    elevation: 8,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
  },
  headerIconBtnContent: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    alignItems: 'center',
    flex: 1,
  },
  headerText: {
    fontFamily: FONTS.extraBold,
    fontSize: 28,
    color: COLORS.primary,
    letterSpacing: -1,
    textAlign: 'center',
  },
  content: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceLowest,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    height: Platform.OS === 'android' ? 104 : 80,
    paddingBottom: Platform.OS === 'android' ? 24 : 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    alignItems: 'center',
    justifyContent: 'space-around',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 8,
  },
  tabBtn: {
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },
  tabIconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  tabIconWrapperActive: {
    backgroundColor: 'rgba(183, 109, 255, 0.2)',
    borderRadius: 24,
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 11,
    fontFamily: FONTS.headlineMedium,
    marginTop: 2,
    fontWeight: '600',
  },
  alertTabContainer: {
    position: 'relative',
  },
  alertBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: COLORS.warning,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  alertBadgeText: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: COLORS.border,
  },
  modalSafeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  offlineOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11, 16, 30, 0.94)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: 9999,
  },
  offlineCard: {
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: '#334155',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  wifiOffIconWrapper: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1.5,
    borderColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  offlineTitle: {
    fontFamily: FONTS.bold,
    fontSize: 20,
    color: COLORS.text,
    textAlign: 'center',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  offlineDescription: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  retryBtn: {
    width: '100%',
    height: 48,
  },
  retryBtnContent: {
    justifyContent: 'center',
    alignItems: 'center',
    height: 48,
    borderRadius: 12,
  },
  retryBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: '#0b101e',
    letterSpacing: 0.5,
  },
  updateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surfaceLow,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  updateBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  updateBannerText: {
    fontFamily: FONTS.headlineMedium,
    fontSize: 14,
    color: COLORS.text,
    marginLeft: 8,
  },
  updateBtn: {
    height: 36,
    paddingHorizontal: 16,
  },
  updateBtnContent: {
    justifyContent: 'center',
    alignItems: 'center',
    height: 36,
    borderRadius: 8,
  },
  updateBtnText: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: '#0b101e',
  },
  forceUpdateOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11, 16, 30, 0.94)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: 99999,
  },
  forceUpdateCard: {
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  warningIconWrapper: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255, 36, 73, 0.1)',
    borderWidth: 1.5,
    borderColor: COLORS.warning,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  forceUpdateTitle: {
    fontFamily: FONTS.bold,
    fontSize: 20,
    color: COLORS.text,
    textAlign: 'center',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  forceUpdateDescription: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  downloadBtn: {
    width: '100%',
    height: 48,
  },
  downloadBtnContent: {
    justifyContent: 'center',
    alignItems: 'center',
    height: 48,
    borderRadius: 12,
  },
  downloadBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: '#0b101e',
    letterSpacing: 0.5,
  },
});
