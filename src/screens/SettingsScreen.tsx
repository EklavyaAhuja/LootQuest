import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  Pressable,
  Linking,
} from 'react-native';
import { COLORS, FONTS, RADIUS } from '../theme/theme';
import { getAppSettings, saveAppSettings, AppSettings } from '../services/storageService';
import { registerBackgroundFetch } from '../services/notificationService';
import { getSavedName, saveName } from './OnboardingScreen';
import StoreIcon from '../components/StoreIcon';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dealsStore } from '../services/dealsStore';

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
];

const CATEGORIES = [
  { key: 'Game', label: 'Game' },
  { key: 'DLC', label: 'DLC' },
  { key: 'Beta', label: 'Beta' },
];

// ─── Custom Prototype Switch: on = white track with black knob ───────────────
function PrototypeSwitch({
  value,
  onToggle,
}: {
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={[styles.switchTrack, value && styles.switchTrackOn]}
    >
      <View style={[styles.switchThumb, value && styles.switchThumbOn]} />
    </Pressable>
  );
}

export default function SettingsScreen({
  userName,
  onUpdateUserName,
}: SettingsScreenProps = {}) {
  const [settings, setSettings] = useState<AppSettings>({
    notificationsEnabled: true,
    notificationPlatforms: ['Steam', 'Epic Games', 'GOG', 'itch.io', 'Playstation', 'Xbox'],
    notificationTypes: ['Game', 'DLC', 'Beta'],
    backgroundIntervalMinutes: 30,
    theme: 'cartoon-classic',
    anonymousUsageCount: true,
  });
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackSending, setFeedbackSending] = useState(false);

  // 18+ Content Preferences (Item 6)
  const [alwaysShow18Plus, setAlwaysShow18Plus] = useState(() => dealsStore.getAlwaysShow18Plus());

  useEffect(() => {
    setAlwaysShow18Plus(dealsStore.getAlwaysShow18Plus());
    const unsub = dealsStore.subscribe(() => {
      setAlwaysShow18Plus(dealsStore.getAlwaysShow18Plus());
    });
    return () => unsub();
  }, []);

  const handleToggleAlwaysShow18Plus = () => {
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

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const loaded = await getAppSettings();
    setSettings(loaded);
  };

  const updateSettings = useCallback(
    async (updates: Partial<AppSettings>) => {
      const newSettings = { ...settings, ...updates };
      setSettings(newSettings);
      await saveAppSettings(newSettings);
      if (
        updates.notificationsEnabled !== undefined ||
        updates.backgroundIntervalMinutes !== undefined
      ) {
        await registerBackgroundFetch();
      }
    },
    [settings]
  );

  const togglePlatform = (platform: string) => {
    const list = settings.notificationPlatforms || [];
    const next = list.includes(platform)
      ? list.filter((p) => p !== platform)
      : [...list, platform];
    updateSettings({ notificationPlatforms: next });
  };

  const toggleCategory = (catKey: string) => {
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

    // 2. Dispatch directly to Discord Channel Webhook (if configured)
    if (DISCORD_FEEDBACK_WEBHOOK_URL) {
      try {
        await fetch(DISCORD_FEEDBACK_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'LootQuest Feedback Bot',
            avatar_url: 'https://cdn-icons-png.flaticon.com/512/808/808682.png',
            embeds: [
              {
                title: '💬 New In-App Feedback',
                description: trimmed,
                color: 0xededeb,
                fields: [
                  { name: 'User', value: senderName, inline: true },
                  { name: 'Timestamp', value: new Date().toLocaleString(), inline: true },
                ],
                footer: { text: 'LootQuest Mobile v1.3.0' },
              },
            ],
          }),
        });
      } catch (discordErr: any) {
        console.warn('[Feedback] Discord direct webhook error:', discordErr?.message);
      }
    }

    // 3. Transmit to backend for logging and admin panel
    try {
      await fetch('https://lootquest-backend.onrender.com/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feedbackEntry),
      });
    } catch (err: any) {
      console.warn('[Feedback] Backend dispatch error:', err?.message);
    } finally {
      setFeedbackSending(false);
      setFeedbackSubmitted(true);
      setFeedbackText('');
      setTimeout(() => setFeedbackSubmitted(false), 3500);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Title */}
      <Text style={styles.heading}>Settings.</Text>

      {/* Section: Profile / Your name */}
      <Text style={styles.sectionHeading}>PROFILE</Text>
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
          placeholder="Enter your name"
          placeholderTextColor={COLORS.textMuted}
          maxLength={20}
          style={styles.nameInput}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={handleSaveName}
        />
        {editingName.trim() !== currentName && editingName.trim().length > 0 && (
          <Pressable onPress={handleSaveName} style={styles.saveNameBtn}>
            <Text style={styles.saveNameBtnText}>{nameSaved ? 'Saved!' : 'Save'}</Text>
          </Pressable>
        )}
      </View>

      {/* Section: Notifications */}
      {/* Round 4 Item 5: Exact rewrite */}
      <Text style={styles.sectionHeading}>NOTIFICATIONS</Text>
      <View style={[styles.setRow, { borderTopWidth: 1, borderTopColor: COLORS.border }]}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={styles.setTitle}>Push notifications</Text>
          {/* Round 4 Item 5: Exact rewrite */}
          <Text style={styles.setSub}>Tell me when a new game goes free</Text>
        </View>
        <PrototypeSwitch
          value={settings.notificationsEnabled}
          onToggle={() =>
            updateSettings({ notificationsEnabled: !settings.notificationsEnabled })
          }
        />
      </View>

      {/* Section: Stores to watch (.tgs) */}
      {/* Round 4 Item 5: Exact rewrite */}
      <Text style={styles.sectionHeading}>STORES TO WATCH</Text>
      <View style={styles.tgsGrid}>
        {ALL_PLATFORMS.map((store, i) => {
          const isOn = (settings.notificationPlatforms || []).includes(store);
          const isOdd = i % 2 === 0;
          return (
            <Pressable
              key={store}
              onPress={() => togglePlatform(store)}
              style={[
                styles.tgItem,
                isOdd ? styles.tgItemOdd : styles.tgItemEven,
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 }}>
                <StoreIcon store={store} size={14} color={isOn ? '#EDEDEB' : '#86868B'} />
                <Text numberOfLines={1} style={[styles.tgText, isOn && styles.tgTextOn]}>{store}</Text>
              </View>
              <View style={[styles.tgDot, isOn && styles.tgDotOn]} />
            </Pressable>
          );
        })}
      </View>

      {/* Section: Game types */}
      {/* Round 4 Item 5: Exact rewrite */}
      <Text style={styles.sectionHeading}>GAME TYPES</Text>
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
      <Text style={styles.sectionHeading}>CONTENT</Text>
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
      <Text style={styles.sectionHeading}>PRIVACY</Text>
      <View style={[styles.setRow, { borderTopWidth: 1, borderTopColor: COLORS.border }]}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={styles.setTitle}>Anonymous usage count</Text>
          <Text style={styles.setSub}>Sends a random ID and the app version once a day. Nothing else.</Text>
        </View>
        <PrototypeSwitch
          value={settings.anonymousUsageCount}
          onToggle={() =>
            updateSettings({ anonymousUsageCount: !settings.anonymousUsageCount })
          }
        />
      </View>

      {/* Section: Community */}
      <Text style={styles.sectionHeading}>COMMUNITY</Text>
      <Pressable
        onPress={() => Linking.openURL('https://discord.gg/pXxnhKWdGH')}
        style={[styles.setRow, { borderTopWidth: 1, borderTopColor: COLORS.border }]}
      >
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={styles.setTitle}>Join our Discord</Text>
          {/* Round 4 Item 5: Exact rewrite */}
          <Text style={styles.setSub}>Chat with other LootQuest users and hear about drops early</Text>
        </View>
        <Text style={styles.arrowIcon}>↗</Text>
      </Pressable>

      <Pressable
        onPress={() => Linking.openURL('https://ko-fi.com')}
        style={styles.setRow}
      >
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={styles.setTitle}>Support on Ko-fi</Text>
          <Text style={styles.setSub}>Help cover server and notification costs</Text>
        </View>
        <Text style={styles.arrowIcon}>↗</Text>
      </Pressable>

      {/* Section: Feedback and suggestions */}
      <Text style={styles.sectionHeading}>FEEDBACK AND SUGGESTIONS</Text>
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
            {feedbackSending ? 'Submitting...' : feedbackSubmitted ? '✓ Thank you!' : 'Submit'}
          </Text>
        </Pressable>
      </View>

      {/* Version Footer */}
      <View style={styles.versionFooter}>
        <Text style={styles.versionFooterText}>v1.3.0</Text>
      </View>
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
    paddingTop: 26,
    paddingBottom: 120,
  },
  heading: {
    fontFamily: FONTS.serif,
    fontSize: 56,
    lineHeight: 56,
    color: '#EDEDEB',
    letterSpacing: -1.6,
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
    borderBottomColor: '#1C1C1E',
    borderRadius: 0,
    paddingVertical: 12,
    paddingHorizontal: 0,
    color: '#EDEDEB',
    fontFamily: FONTS.regular,
    fontSize: 16,
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
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginTop: 34,
    marginBottom: 14,
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
    color: '#86868B',
  },
  tgTextOn: {
    color: '#EDEDEB',
  },
  tgDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#4D4D52',
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
});
