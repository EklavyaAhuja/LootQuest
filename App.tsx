import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, SafeAreaView, Platform, Modal, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  Quicksand_500Medium,
  Quicksand_600SemiBold,
  Quicksand_700Bold,
} from '@expo-google-fonts/quicksand';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import {
  SpaceMono_400Regular,
  SpaceMono_700Bold,
} from '@expo-google-fonts/space-mono';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, FONTS } from './src/theme/theme';
import FeedScreen from './src/screens/FeedScreen';
import VaultScreen from './src/screens/VaultScreen';
import AlertsScreen from './src/screens/AlertsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import DetailScreen from './src/screens/DetailScreen';
import { getClaimedPosts } from './src/services/storageService';
import { Deal } from './src/models/Deal';
import BouncyPressable from './src/components/BouncyPressable';
import {
  requestNotificationPermissions,
  registerBackgroundFetch,
  seedInitialSeenPosts,
} from './src/services/notificationService';
import { expiredFeedService } from './src/services/ExpiredFeedService';
import { Home, Inbox, Bell, User, Settings, Gamepad2, WifiOff } from 'lucide-react-native';

export default function App() {
  const [fontsLoaded] = useFonts({
    Quicksand_500Medium,
    Quicksand_600SemiBold,
    Quicksand_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
    SpaceMono_400Regular,
    SpaceMono_700Bold,
  });

  const [activeTab, setActiveTab] = useState<'feed' | 'vault' | 'alerts' | 'settings'>('feed');
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [claimedPostIds, setClaimedPostIds] = useState<string[]>([]);
  const [unreadAlertsCount, setUnreadAlertsCount] = useState<number>(0);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [retrying, setRetrying] = useState<boolean>(false);

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

  const loadClaimedPosts = async () => {
    try {
      const claimed = await getClaimedPosts();
      setClaimedPostIds(claimed.map(p => p.id));
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

      // Initialize expired posts service first
      await expiredFeedService.initialize();
      
      const granted = await requestNotificationPermissions();
      if (granted) {
        console.log('Notifications permissions granted.');
        await seedInitialSeenPosts();
        await registerBackgroundFetch();
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
        <Text style={styles.loadingText}>BOOTING LOOTQUEST CORE...</Text>
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

      {/* Main Content Screens Switcher */}
      <View style={styles.content}>
        {activeTab === 'feed' && (
          <FeedScreen 
            onDealSelect={setSelectedDeal} 
            claimedPostIds={claimedPostIds} 
            onNewAlerts={(count) => {
              setUnreadAlertsCount((prev) => prev + count);
            }}
            onConnectionError={() => setIsOffline(true)}
          />
        )}
        {activeTab === 'vault' && <VaultScreen />}
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
          <View style={[
            styles.tabIconWrapper,
            activeTab === 'feed' && styles.tabIconWrapperActive
          ]}>
            <Home size={24} color={activeTab === 'feed' ? COLORS.bg : '#888'} />
          </View>
        </Pressable>

        {/* Vault */}
        <Pressable
          onPress={() => handleTabChange('vault')}
          style={styles.tabBtn}
        >
          <View style={[
            styles.tabIconWrapper,
            activeTab === 'vault' && styles.tabIconWrapperActive
          ]}>
            <Inbox size={24} color={activeTab === 'vault' ? COLORS.bg : '#888'} />
          </View>
        </Pressable>

        {/* Alerts */}
        <Pressable
          onPress={() => handleTabChange('alerts')}
          style={styles.tabBtn}
        >
          <View style={styles.alertTabContainer}>
            <View style={[
              styles.tabIconWrapper,
              activeTab === 'alerts' && styles.tabIconWrapperActive
            ]}>
              <Bell size={24} color={activeTab === 'alerts' ? COLORS.bg : '#888'} />
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
          <View style={[
            styles.tabIconWrapper,
            activeTab === 'settings' && styles.tabIconWrapperActive
          ]}>
            <User size={24} color={activeTab === 'settings' ? COLORS.bg : '#888'} />
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
    borderColor: '#334155',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 64,
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
    fontFamily: FONTS.bold,
    fontSize: 24,
    color: COLORS.primary,
    letterSpacing: 1,
    textAlign: 'center',
  },
  content: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 16,
    height: 80,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    alignItems: 'center',
    justifyContent: 'space-around',
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 8,
  },
  tabBtn: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },
  tabIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabIconWrapperActive: {
    backgroundColor: COLORS.accent,
    borderRadius: 24,
    overflow: 'hidden',
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
});
