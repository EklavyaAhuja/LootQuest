import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  Pressable,
  Linking,
  Platform,
  AppState,
} from 'react-native';
import { COLORS, FONTS, RADIUS } from '../theme/theme';
import { getAppSettings, saveAppSettings, AppSettings, DEFAULT_NOTIFICATION_PLATFORMS, DEFAULT_NOTIFICATION_TYPES } from '../services/storageService';
import {
  registerBackgroundFetch,
  requestNotificationPermissions,
  registerWebPushSubscription,
  getNotificationPermissionStatus,
} from '../services/notificationService';
import { getSavedName, saveName } from './OnboardingScreen';
import StoreIcon from '../components/StoreIcon';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dealsStore } from '../services/dealsStore';
import { updateCheckerService, UpdateInfo, getCurrentNativeVersion } from '../services/updateCheckerService';
import { copyToClipboard } from '../utils/clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hapticFeedback } from '../utils/haptics';
import { Ionicons } from '@expo/vector-icons';
import appJson from '../../app.json';

interface SettingsScreenProps {
  userName?: string;
  onUpdateUserName?: (name: string) => void;
}

const ALL_PLATFORMS = [
  'Steam',
  'Epic Games',
  'GOG',
  'itch.io',
  'Ubisoft',
  'Stove',
  'Alienware Arena',
  'Prime Gaming',
  'Playstation',
  'Xbox',
  'Others',
];

const CATEGORIES = [
  { key: 'Game', label: 'Game' },
  { key: 'DLC', label: 'DLC' },
  { key: 'Beta', label: 'Beta' },
];

// ─── Custom Prototype Switch: on = white track with black knob ───────────────
function openUrlSafely(url: string | undefined | null) {
  if (!url) return;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
  }
  Linking.openURL(url).catch((err) => {
    console.warn('[SettingsScreen] openUrlSafely error:', err);
  });
}

function PrototypeSwitch({
  value,
  onToggle,
}: {
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        hapticFeedback.light();
        onToggle();
      }}
      style={[styles.switchTrack, value && styles.switchTrackOn]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
    >
      <View style={[styles.switchThumb, value && styles.switchThumbOn]} />
    </Pressable>
  );
}

function SettingsScreen({
  userName,
  onUpdateUserName,
}: SettingsScreenProps = {}) {
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<AppSettings>({
    notificationsEnabled: true,
    notificationPlatforms: [...DEFAULT_NOTIFICATION_PLATFORMS],
    notificationTypes: [...DEFAULT_NOTIFICATION_TYPES],
    backgroundIntervalMinutes: 30,
    theme: 'cartoon-classic',
    anonymousUsageCount: true,
  });
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackSending, setFeedbackSending] = useState(false);

  // 18+ Content Preferences (Item 6)
  const [alwaysShow18Plus, setAlwaysShow18Plus] = useState(() => dealsStore.getAlwaysShow18Plus());
  const [introAnimation, setIntroAnimation] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('claimr_intro_animation_enabled').then(async (val) => {
      if (val === null) {
        val = await AsyncStorage.getItem('lootquest_intro_animation_enabled').catch(() => null);
      }
      if (val !== null) {
        setIntroAnimation(val === 'true');
      }
    });
  }, []);

  const handleToggleIntroAnimation = async () => {
    hapticFeedback.light();
    const nextVal = !introAnimation;
    setIntroAnimation(nextVal);
    await AsyncStorage.setItem('claimr_intro_animation_enabled', String(nextVal));
    updateSettings({ introAnimation: nextVal });
  };

  useEffect(() => {
    setAlwaysShow18Plus(dealsStore.getAlwaysShow18Plus());
    const unsub = dealsStore.subscribe(() => {
      setAlwaysShow18Plus(dealsStore.getAlwaysShow18Plus());
    });
    return () => unsub();
  }, []);

  // Web PWA Install & Update states
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null);
  const [swUpdateAvailable, setSwUpdateAvailable] = useState<boolean>(false);
  const [versionCopied, setVersionCopied] = useState<boolean>(false);
  const [isIosSafari, setIsIosSafari] = useState<boolean>(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };

    const handleUpdate = () => {
      setSwUpdateAvailable(true);
    };

    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const isStandalone = (window.navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    if (isIos && !isStandalone) {
      setIsIosSafari(true);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('lq-sw-update-available', handleUpdate);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('lq-sw-update-available', handleUpdate);
    };
  }, []);

  const handleToggleAlwaysShow18Plus = () => {
    hapticFeedback.light();
    const nextVal = !alwaysShow18Plus;
    setAlwaysShow18Plus(nextVal);
    dealsStore.setAlwaysShow18Plus(nextVal);
  };

  // Profile Name Edit State
  const [currentName, setCurrentName] = useState(userName || 'Hunter');
  const [editingName, setEditingName] = useState(userName || 'Hunter');
  const [nameSaved, setNameSaved] = useState(false);

  useEffect(() => {
    if (userName) {
      setCurrentName(userName);
      setEditingName(userName);
    } else {
      getSavedName().then((n) => {
        if (n) {
          setCurrentName(n);
          setEditingName(n);
        }
      });
    }
  }, [userName]);

  const handleSaveName = async () => {
    const trimmed = editingName.trim();
    if (!trimmed) return;
    await saveName(trimmed);
    setCurrentName(trimmed);
    onUpdateUserName?.(trimmed);
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 2000);
  };

  // Native update checker state
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(() => updateCheckerService.getLatestUpdateInfo());
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [checkStatusMessage, setCheckStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    return updateCheckerService.subscribe((info) => {
      setUpdateInfo(info);
    });
  }, []);

  const handleCheckForUpdates = async () => {
    setIsCheckingUpdate(true);
    setCheckStatusMessage(null);
    try {
      const res = await updateCheckerService.checkForUpdate(true);
      if (res && res.isUpdateAvailable) {
        setCheckStatusMessage(`v${res.version} is available!`);
      } else {
        setCheckStatusMessage('Up to date');
      }
    } catch {
      setCheckStatusMessage('Check failed');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  // Live Device Notification Permission State
  const [devicePermission, setDevicePermission] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');

  const checkLivePermission = useCallback(async () => {
    try {
      const status = await getNotificationPermissionStatus();
      setDevicePermission(status);
    } catch {
      setDevicePermission('undetermined');
    }
  }, []);

  useEffect(() => {
    checkLivePermission();
    // Re-check when app returns from background or window regains focus
    const sub = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        checkLivePermission();
      }
    });

    let onWinFocus: (() => void) | null = null;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      onWinFocus = () => checkLivePermission();
      window.addEventListener('focus', onWinFocus);
    }

    return () => {
      sub.remove();
      if (Platform.OS === 'web' && typeof window !== 'undefined' && onWinFocus) {
        window.removeEventListener('focus', onWinFocus);
      }
    };
  }, [checkLivePermission]);

  const handleRequestOrOpenSettings = async () => {
    hapticFeedback.medium();
    if (devicePermission === 'denied') {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
          window.alert('Notifications are blocked by your browser site settings. Click the lock/tune icon in your browser address bar and change Notifications to "Allow", then reload the page.');
        }
      } else {
        try {
          if (Platform.OS === 'android') {
            Linking.openSettings().catch(() => {});
          }
        } catch {}
      }
      return;
    }

    const granted = await requestNotificationPermissions();
    if (granted) {
      setDevicePermission('granted');
      if (Platform.OS === 'web') {
        registerWebPushSubscription().catch(() => {});
      }
      updateSettings({ notificationsEnabled: true });
    } else {
      checkLivePermission();
    }
  };

  const loadSettings = async () => {
    const loaded = await getAppSettings();
    setSettings(loaded);
    let storedIntro = await AsyncStorage.getItem('claimr_intro_animation_enabled');
    if (storedIntro === null) {
      storedIntro = await AsyncStorage.getItem('lootquest_intro_animation_enabled').catch(() => null);
    }
    if (storedIntro !== null) {
      setIntroAnimation(storedIntro === 'true');
    } else if (loaded.introAnimation !== undefined) {
      setIntroAnimation(loaded.introAnimation);
    }
  };

  const updateSettings = useCallback(
    async (updates: Partial<AppSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...updates };
        saveAppSettings(next).catch((err) => console.warn('[Settings] Failed to save:', err));
        return next;
      });

      if (updates.notificationsEnabled && !settings.notificationsEnabled) {
        const granted = await requestNotificationPermissions();
        if (granted && Platform.OS === 'web') {
          registerWebPushSubscription().catch(() => {});
        }
      }

      if (
        updates.notificationsEnabled !== undefined ||
        updates.backgroundIntervalMinutes !== undefined
      ) {
        await registerBackgroundFetch();
      }
    },
    [settings.notificationsEnabled]
  );

  const togglePlatform = (platform: string) => {
    hapticFeedback.light();
    const list = settings.notificationPlatforms || [];
    const next = list.includes(platform)
      ? list.filter((p) => p !== platform)
      : [...list, platform];
    updateSettings({ notificationPlatforms: next });
  };

  const toggleCategory = (catKey: string) => {
    hapticFeedback.light();
    const list = settings.notificationTypes || [];
    const next = list.includes(catKey)
      ? list.filter((c) => c !== catKey)
      : [...list, catKey];
    updateSettings({ notificationTypes: next });
  };

  const DISCORD_FEEDBACK_WEBHOOK_URL =
    process.env.EXPO_PUBLIC_DISCORD_WEBHOOK_URL || '';

  const handleFeedbackSubmit = async () => {
    const trimmed = feedbackText.trim();
    if (!trimmed || feedbackSending) return;

    setFeedbackSending(true);

    const senderName = currentName || userName || 'Hunter';
    const feedbackEntry = {
      user: senderName,
      text: trimmed,
      timestamp: Date.now(),
    };

    // 1. Always persist locally in AsyncStorage
    try {
      const existingRaw = await AsyncStorage.getItem('fgf_user_feedback');
      const existing = existingRaw ? JSON.parse(existingRaw) : [];
      existing.unshift(feedbackEntry);
      await AsyncStorage.setItem('fgf_user_feedback', JSON.stringify(existing.slice(0, 50)));
    } catch (e) {
      console.warn('[Feedback] Local save error:', e);
    }

    // 2. Transmit to backend (which records it in the database and forwards to Discord)
    let backendSuccess = false;
    try {
      const res = await fetch('https://lootquest-backend.onrender.com/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feedbackEntry),
      });
      backendSuccess = res.ok;
    } catch (err: any) {
      console.warn('[Feedback] Backend dispatch error:', err?.message);
    }

    // 3. Fallback: Only dispatch directly from app if backend was unreachable
    if (!backendSuccess && DISCORD_FEEDBACK_WEBHOOK_URL) {
      try {
        await fetch(DISCORD_FEEDBACK_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'Claimr Feedback Bot',
            avatar_url: 'https://cdn-icons-png.flaticon.com/512/808/808682.png',
            embeds: [
              {
                title: '💬 New In-App Feedback (Direct)',
                description: trimmed,
                color: 0xededeb,
                fields: [
                  { name: 'User', value: senderName, inline: true },
                  { name: 'Timestamp', value: new Date().toLocaleString(), inline: true },
                ],
                footer: { text: 'Claimr Mobile v1.3.0' },
              },
            ],
          }),
        });
      } catch (discordErr: any) {
        console.warn('[Feedback] Discord direct fallback webhook error:', discordErr?.message);
      }
    }

    setFeedbackSending(false);
    setFeedbackSubmitted(true);
    setFeedbackText('');
    setTimeout(() => setFeedbackSubmitted(false), 3500);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 6 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Title */}
      <Text style={styles.heading}>Settings.</Text>

      {/* Section: Profile / Your name */}
      <Text style={styles.sectionHeading}>Profile</Text>
      <View style={[styles.setRow, { borderTopWidth: 1, borderTopColor: COLORS.border }]}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          {/* Round 4 Item 5: Exact rewrite */}
          <Text style={styles.setTitle}>Your name</Text>
          <Text style={styles.setSub}>Shown in the greeting on Home.</Text>
        </View>
      </View>
      {/* Round 3 Item 12: Restyle boxed input to underline-only */}
      <View style={styles.nameInputContainer}>
        <TextInput
          value={editingName}
          onChangeText={setEditingName}
          onBlur={handleSaveName}
          placeholder="Enter your name"
          placeholderTextColor={COLORS.textMuted}
          maxLength={20}
          style={styles.nameInput}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={handleSaveName}
        />
        {editingName.trim() !== currentName && editingName.trim().length > 0 ? (
          <Pressable onPress={handleSaveName} style={styles.saveNameBtn}>
            <Text style={styles.saveNameBtnText}>{nameSaved ? 'Saved' : 'Save'}</Text>
          </Pressable>
        ) : (
          <Text style={styles.editHintLabel}>Edit</Text>
        )}
      </View>

      {/* Section: Notifications */}
      <Text style={styles.sectionHeading}>Notifications</Text>
      {(() => {
        const isNotifActive = devicePermission === 'granted' && settings.notificationsEnabled;
        return (
          <View style={[styles.setRow, { borderTopWidth: 1, borderTopColor: COLORS.border }]}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.setTitle}>Push notifications</Text>
              {isNotifActive ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                  <Ionicons name="checkmark-circle" size={13} color="#34C759" style={{ marginRight: 5 }} />
                  <Text style={[styles.setSub, { color: '#34C759', marginTop: 0 }]}>
                    Notifications enabled
                  </Text>
                </View>
              ) : (
                <Text style={styles.setSub}>Tell me when a new game goes free</Text>
              )}
            </View>
            {isNotifActive ? (
              <PrototypeSwitch
                value={true}
                onToggle={() =>
                  updateSettings({ notificationsEnabled: false })
                }
              />
            ) : (
              <Pressable
                onPress={async () => {
                  if (devicePermission === 'granted') {
                    updateSettings({ notificationsEnabled: true });
                  } else {
                    await handleRequestOrOpenSettings();
                  }
                }}
                style={styles.minimalEnableBtn}
                accessibilityRole="button"
                accessibilityLabel="Enable notifications"
              >
                <Text style={styles.minimalEnableBtnText}>Enable</Text>
              </Pressable>
            )}
          </View>
        );
      })()}

      {/* Section: Stores to watch (.tgs) */}
      {/* Round 4 Item 5: Exact rewrite */}
      <Text style={styles.sectionHeading}>Stores to watch</Text>
      <View style={styles.tgsGrid}>
        {ALL_PLATFORMS.map((store, i) => {
          const isOn = (settings.notificationPlatforms || []).includes(store);
          const isOdd = i % 2 === 0;
          const isLastSolo = i === ALL_PLATFORMS.length - 1 && ALL_PLATFORMS.length % 2 !== 0;
          return (
            <Pressable
              key={store}
              onPress={() => togglePlatform(store)}
              style={[
                styles.tgItem,
                isOdd ? styles.tgItemOdd : styles.tgItemEven,
                isLastSolo && { width: '100%', borderLeftWidth: 0, paddingRight: 14 },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 }}>
                <StoreIcon store={store} size={14} color={isOn ? '#EDEDEB' : '#48484A'} />
                <Text numberOfLines={1} style={[styles.tgText, isOn && styles.tgTextOn]}>{store}</Text>
              </View>
              <View style={[styles.tgDot, isOn && styles.tgDotOn]} />
            </Pressable>
          );
        })}
      </View>

      {/* Section: Game types */}
      {/* Round 4 Item 5: Exact rewrite */}
      <Text style={styles.sectionHeading}>Game types</Text>
      <View style={styles.tgsGrid}>
        {CATEGORIES.map((cat, i) => {
          const isOn = (settings.notificationTypes || []).includes(cat.key);
          const isOdd = i % 2 === 0;
          return (
            <Pressable
              key={cat.key}
              onPress={() => toggleCategory(cat.key)}
              style={[
                styles.tgItem,
                isOdd ? styles.tgItemOdd : styles.tgItemEven,
              ]}
            >
              <Text style={[styles.tgText, isOn && styles.tgTextOn]}>{cat.label}</Text>
              <View style={[styles.tgDot, isOn && styles.tgDotOn]} />
            </Pressable>
          );
        })}
      </View>

      {/* Section: Content Preferences (Item 6) */}
      <Text style={styles.sectionHeading}>Content</Text>
      <View style={[styles.setRow, { borderTopWidth: 1, borderTopColor: COLORS.border }]}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={styles.setTitle}>Always show 18+ games</Text>
          <Text style={styles.setSub}>Show mature drops without asking each time</Text>
        </View>
        <PrototypeSwitch
          value={alwaysShow18Plus}
          onToggle={handleToggleAlwaysShow18Plus}
        />
      </View>

      {/* Section: Privacy */}
      <Text style={styles.sectionHeading}>Privacy</Text>
      <View style={[styles.setRow, { borderTopWidth: 1, borderTopColor: COLORS.border }]}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={styles.setTitle}>Anonymous usage count</Text>
          <Text style={styles.setSub}>Sends a random ID and the Claimr version once a day. Nothing else.</Text>
        </View>
        <PrototypeSwitch
          value={settings.anonymousUsageCount}
          onToggle={() =>
            updateSettings({ anonymousUsageCount: !settings.anonymousUsageCount })
          }
        />
      </View>

      {/* Section: Web App (PWA install & updates) */}
      {Platform.OS === 'web' && (deferredInstallPrompt || isIosSafari || swUpdateAvailable) && (
        <>
          <Text style={styles.sectionHeading}>Web app</Text>
          {(deferredInstallPrompt || isIosSafari) && (
            <Pressable
              onPress={() => {
                if (deferredInstallPrompt) {
                  deferredInstallPrompt.prompt();
                  deferredInstallPrompt.userChoice.then(() => setDeferredInstallPrompt(null));
                }
              }}
              style={[styles.setRow, { borderTopWidth: 1, borderTopColor: COLORS.border }]}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.setTitle}>Install Claimr</Text>
                <Text style={styles.setSub}>
                  {isIosSafari
                    ? 'Tap Share ⎋ then "Add to Home Screen"'
                    : 'Add Claimr to your home screen or shelf'}
                </Text>
              </View>
              {deferredInstallPrompt && (
                <View style={styles.btn}>
                  <Text style={styles.btnText}>Install</Text>
                </View>
              )}
            </Pressable>
          )}

          {swUpdateAvailable && (
            <Pressable
              onPress={() => {
                if (typeof window !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
                  navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
                }
                if (typeof window !== 'undefined') {
                  window.location.reload();
                }
              }}
              style={styles.setRow}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.setTitle}>Update available</Text>
                <Text style={styles.setSub}>Tap to refresh and apply the newest version</Text>
              </View>
              <View style={styles.btn}>
                <Text style={styles.btnText}>Refresh</Text>
              </View>
            </Pressable>
          )}
        </>
      )}

      {/* Section: Feedback and suggestions */}
      <Text style={styles.sectionHeading}>Feedback and suggestions</Text>
      <TextInput
        value={feedbackText}
        onChangeText={setFeedbackText}
        placeholder="Got suggestions or found an issue? Tell us here..."
        placeholderTextColor={COLORS.textMuted}
        style={styles.ta}
        multiline
      />
      <View style={styles.feedbackActionRow}>
        <Pressable
          onPress={handleFeedbackSubmit}
          disabled={feedbackSending}
          style={[styles.btn, feedbackSending && { opacity: 0.6 }]}
        >
          <Text style={styles.btnText}>
            {feedbackSending ? 'Submitting...' : feedbackSubmitted ? 'Feedback sent' : 'Submit'}
          </Text>
        </Pressable>
      </View>

      {/* Section: About (Item 2b) */}
      <Text style={styles.sectionHeading}>About</Text>
      <View style={[styles.setRow, { borderTopWidth: 1, borderTopColor: COLORS.border }]}>
        <Pressable
          onPress={async () => {
            await copyToClipboard(`Claimr v${getCurrentNativeVersion()} (Expo SDK 57)`);
            hapticFeedback.light();
            setVersionCopied(true);
            setTimeout(() => setVersionCopied(false), 2000);
          }}
          style={{ flex: 1, paddingRight: 12 }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Copy version info"
        >
          <Text style={styles.aboutWordmark}>Claimr</Text>
          <Text style={styles.aboutVersion}>
            v{getCurrentNativeVersion()} {versionCopied ? '· Copied' : ''}
          </Text>
        </Pressable>
        {updateInfo?.isUpdateAvailable ? (
          <Pressable
            onPress={() => openUrlSafely(updateInfo.downloadUrl)}
            style={[styles.btn, { backgroundColor: '#EDEDEB', paddingHorizontal: 12 }]}
          >
            <Text style={[styles.btnText, { color: '#000000', fontFamily: FONTS.mono }]}>Download v{updateInfo.version}</Text>
          </Pressable>
        ) : null}
      </View>

      {Platform.OS !== 'web' && (
        <Pressable
          onPress={updateInfo?.isUpdateAvailable ? () => openUrlSafely(updateInfo.downloadUrl) : handleCheckForUpdates}
          disabled={isCheckingUpdate}
          style={styles.setRow}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.setTitle}>
              {updateInfo?.isUpdateAvailable
                ? `Update available (v${updateInfo.version})`
                : 'Check for updates'}
            </Text>
            <Text style={[styles.setSub, updateInfo?.isUpdateAvailable && { color: '#EDEDEB' }]}>
              {isCheckingUpdate
                ? 'Checking GitHub for updates...'
                : checkStatusMessage
                ? checkStatusMessage
                : updateInfo?.isUpdateAvailable
                ? 'A newer native build is ready — tap to download'
                : 'Verify native version against latest release'}
            </Text>
          </View>
          <Text style={styles.arrowIcon}>
            {updateInfo?.isUpdateAvailable ? '↓' : isCheckingUpdate ? '⋯' : '↻'}
          </Text>
        </Pressable>
      )}

      <Pressable
        onPress={() => openUrlSafely(updateInfo?.releaseUrl || 'https://github.com/EklavyaAhuja/claimr/releases')}
        style={styles.setRow}
      >
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={styles.setTitle}>What's new</Text>
          <Text style={styles.setSub}>Release notes and latest improvements</Text>
        </View>
        <Text style={styles.arrowIcon}>↗</Text>
      </Pressable>

      <Pressable
        onPress={() => openUrlSafely('https://discord.gg/gMATmybhk5')}
        style={styles.setRow}
      >
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={styles.setTitle}>Join our Discord</Text>
          <Text style={styles.setSub}>Chat with other Claimr users and hear about drops early</Text>
        </View>
        <Text style={styles.arrowIcon}>↗</Text>
      </Pressable>

      <Pressable
        onPress={() => openUrlSafely('https://ko-fi.com/eklavyaahuja')}
        style={styles.setRow}
      >
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={styles.setTitle}>Support on Ko-fi</Text>
          <Text style={styles.setSub}>Help cover server and notification costs</Text>
        </View>
        <Text style={styles.arrowIcon}>↗</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  heading: {
    fontFamily: FONTS.display,
    fontSize: 26,
    lineHeight: 30,
    color: '#EDEDEB',
    letterSpacing: -0.8,
  },
  // Underline-only input for name
  nameInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
    marginBottom: 20,
  },
  nameInput: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: 0,
    paddingVertical: 12,
    paddingHorizontal: 0,
    color: '#EDEDEB',
    fontFamily: FONTS.regular,
    fontSize: 16,
  },
  editHintLabel: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    fontWeight: '700',
    color: '#636366',
    letterSpacing: 1.2,
    paddingHorizontal: 8,
  },
  saveNameBtn: {
    backgroundColor: '#EDEDEB',
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  saveNameBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: '#000000',
    letterSpacing: 0.5,
  },
  versionFooter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    marginTop: 12,
  },
  versionFooterText: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    fontWeight: '500',
    color: '#555558',
    letterSpacing: 1.2,
  },
  sectionHeading: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    fontWeight: '700',
    color: '#86868B',
    letterSpacing: 0.2,
    marginTop: 32,
    marginBottom: 12,
  },
  setRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  setTitle: {
    fontFamily: FONTS.regular,
    fontSize: 16,
    color: '#EDEDEB',
  },
  setSub: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: '#86868B',
    marginTop: 3,
  },
  arrowIcon: {
    fontFamily: FONTS.regular,
    fontSize: 18,
    color: '#86868B',
  },
  // Toggles: on = white track with black knob
  switchTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#1C1C1E',
    padding: 3,
    justifyContent: 'center',
  },
  switchTrackOn: {
    backgroundColor: '#EDEDEB',
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#86868B',
  },
  switchThumbOn: {
    alignSelf: 'flex-end',
    backgroundColor: '#000000',
  },
  tgsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderTopColor: '#1C1C1E',
  },
  tgItem: {
    width: '50%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 17,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  tgItemOdd: {
    paddingRight: 14,
  },
  tgItemEven: {
    paddingLeft: 14,
    borderLeftWidth: 1,
    borderLeftColor: '#1C1C1E',
  },
  tgText: {
    fontFamily: FONTS.regular,
    fontSize: 14.5,
    color: '#636366',
  },
  tgTextOn: {
    color: '#EDEDEB',
    fontWeight: '500',
  },
  tgDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#3A3A3C',
    backgroundColor: 'transparent',
  },
  tgDotOn: {
    backgroundColor: '#EDEDEB',
    borderColor: '#EDEDEB',
  },
  ta: {
    width: '100%',
    height: 84,
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
    color: '#EDEDEB',
    fontFamily: FONTS.regular,
    fontSize: 15,
    paddingVertical: 12,
    marginTop: 6,
    textAlignVertical: 'top',
  },
  feedbackActionRow: {
    marginTop: 16,
    alignItems: 'flex-start',
  },
  btn: {
    backgroundColor: '#EDEDEB',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  btnText: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: '#000000',
  },
  aboutWordmark: {
    fontFamily: FONTS.display,
    fontSize: 22,
    color: '#EDEDEB',
    letterSpacing: -0.6,
  },
  aboutVersion: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: '#86868B',
    marginTop: 4,
  },
  minimalEnableBtn: {
    backgroundColor: '#EDEDEB',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  minimalEnableBtnText: {
    fontFamily: FONTS.semiBold,
    fontSize: 12.5,
    color: '#0A0A0C',
  },
});

export default React.memo(SettingsScreen);
