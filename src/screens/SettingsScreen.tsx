import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  ScrollView,
  Switch,
  Alert,
  Platform,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { COLORS, FONTS, getPlatformColor } from '../theme/theme';
import appJson from '../../app.json';
const appVersion = appJson.expo.version;
import {
  getAppSettings,
  saveAppSettings,
  AppSettings,
} from '../services/storageService';
import {
  registerBackgroundFetch,
  unregisterBackgroundFetch,
} from '../services/notificationService';
import {
  Bell,
  Clock,
  SlidersHorizontal,
  MessageCircle,
  Check,
  Gamepad2,
} from 'lucide-react-native';
import StoreIcon from '../components/StoreIcon';

const ALL_PLATFORMS = ['Steam', 'Epic Games', 'GOG', 'itch.io', 'Playstation', 'Xbox'];
const ALL_TYPES = [
  { key: 'Game', label: 'Full Games' },
  { key: 'DLC', label: 'DLCs' },
  { key: 'Beta', label: 'Betas' },
];
const INTERVALS = [
  { mins: 15, label: 'Every 15 Minutes' },
  { mins: 30, label: 'Every 30 Minutes' },
  { mins: 60, label: 'Every 1 Hour' },
];

export default function SettingsScreen() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    const loadData = async () => {
      const savedSettings = await getAppSettings();
      setSettings(savedSettings);
    };
    loadData();
  }, []);

  const handlePlatformToggle = async (plat: string) => {
    if (!settings) return;
    let plats = [...settings.notificationPlatforms];
    if (plats.includes(plat)) {
      plats = plats.filter(p => p !== plat);
    } else {
      plats.push(plat);
    }
    const updated = { ...settings, notificationPlatforms: plats };
    setSettings(updated);
    await saveAppSettings(updated);
    if (settings.notificationsEnabled) {
      await registerBackgroundFetch();
    }
  };

  const handleTypeToggle = async (type: string) => {
    if (!settings) return;
    let types = [...settings.notificationTypes];
    if (types.includes(type)) {
      types = types.filter(t => t !== type);
    } else {
      types.push(type);
    }
    const updated = { ...settings, notificationTypes: types };
    setSettings(updated);
    await saveAppSettings(updated);
    if (settings.notificationsEnabled) {
      await registerBackgroundFetch();
    }
  };

  const handleIntervalChange = async (mins: number) => {
    if (!settings) return;
    const updated = { ...settings, backgroundIntervalMinutes: mins };
    setSettings(updated);
    await saveAppSettings(updated);
    if (settings.notificationsEnabled) {
      await registerBackgroundFetch();
    }
  };

  const handleSubmitFeedback = async () => {
    const text = feedback.trim();
    if (!text) {
      Alert.alert('Empty', 'Please enter some feedback before sending.');
      return;
    }
    const webhookUrl = process.env.EXPO_PUBLIC_DISCORD_WEBHOOK_URL;
    if (!webhookUrl || webhookUrl === 'your_discord_webhook_url_here') {
      Alert.alert('Thanks!', 'Feedback channel is not yet configured on this build. Thank you for testing!');
      setFeedback('');
      return;
    }
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: '📡 New Feedback: LootQuest',
            color: 3788564,
            fields: [
              { name: '💬 Feedback', value: text },
              { name: '📱 Client', value: `${Platform.OS.toUpperCase()} (v${Platform.Version})` },
              { name: '📦 App Version', value: appVersion },
            ],
            timestamp: new Date().toISOString(),
          }],
        }),
      });
      if (response.ok) {
        Alert.alert('Received! 📡', 'Your feedback has been logged. Thank you!');
        setFeedback('');
      } else {
        throw new Error(`Status: ${response.status}`);
      }
    } catch (e) {
      Alert.alert('Failed ❌', 'Could not send feedback. Check your connection.');
    }
  };

  const handleJoinDiscord = async () => {
    const url = 'https://discord.gg/pXxnhKWdGH';
    try {
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert('Error', 'Failed to open Discord link.');
    }
  };

  const handleOpenGamerPower = async () => {
    const url = 'https://www.gamerpower.com';
    try {
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert('Error', 'Failed to open GamerPower link.');
    }
  };

  if (!settings) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>

      {/* ── Alerts Card ── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.headerIconCircle, { borderColor: COLORS.primary }]}>
            <Bell size={15} color={COLORS.primary} />
          </View>
          <Text style={styles.cardTitle}>Alerts</Text>
        </View>

        {ALL_PLATFORMS.map((p, idx) => {
          const isEnabled = settings.notificationPlatforms.includes(p);
          const bgColor = getPlatformColor(p);
          const isLast = idx === ALL_PLATFORMS.length - 1;
          return (
            <View key={p} style={[styles.listRow, !isLast && styles.listRowBorder]}>
              <View style={[styles.platformIconBg, { backgroundColor: bgColor }]}>
                <StoreIcon platform={p} size={14} color="#fff" />
              </View>
              <Text style={styles.listRowLabel}>{p}</Text>
              <Switch
                value={isEnabled}
                onValueChange={() => handlePlatformToggle(p)}
                trackColor={{ false: 'rgba(255,255,255,0.08)', true: COLORS.primary }}
                thumbColor={
                  Platform.OS === 'android'
                    ? isEnabled ? COLORS.bg : '#888'
                    : undefined
                }
              />
            </View>
          );
        })}
      </View>

      {/* ── Scan Frequency Card ── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.headerIconCircle, { borderColor: COLORS.secondary }]}>
            <Clock size={15} color={COLORS.secondary} />
          </View>
          <Text style={styles.cardTitle}>Scan Frequency</Text>
        </View>

        {INTERVALS.map(({ mins, label }, idx) => {
          const isSelected = settings.backgroundIntervalMinutes === mins;
          const isLast = idx === INTERVALS.length - 1;
          return (
            <TouchableOpacity
              key={mins}
              style={[styles.listRow, !isLast && styles.listRowBorder]}
              onPress={() => handleIntervalChange(mins)}
              activeOpacity={0.7}
            >
              {/* Custom radio circle */}
              <View style={[styles.radioOuter, isSelected && styles.radioOuterActive]}>
                {isSelected && <View style={styles.radioInner} />}
              </View>
              <Text style={[styles.listRowLabel, isSelected && styles.listRowLabelActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Content Filters Card ── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.headerIconCircle, { borderColor: COLORS.success }]}>
            <SlidersHorizontal size={15} color={COLORS.success} />
          </View>
          <Text style={styles.cardTitle}>Content Filters</Text>
        </View>

        <Text style={styles.filterSublabel}>CONTENT TYPE</Text>

        {ALL_TYPES.map(({ key, label }, idx) => {
          const isChecked = settings.notificationTypes.includes(key);
          const isLast = idx === ALL_TYPES.length - 1;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.listRow, !isLast && styles.listRowBorder]}
              onPress={() => handleTypeToggle(key)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
                {isChecked && <Check size={10} color={COLORS.bg} />}
              </View>
              <Text style={[styles.listRowLabel, isChecked && styles.listRowLabelActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Send Feedback Card ── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.headerIconCircle, { borderColor: '#a855f7' }]}>
            <MessageCircle size={15} color="#a855f7" />
          </View>
          <Text style={styles.cardTitle}>Send Feedback</Text>
        </View>

        <TextInput
          style={styles.feedbackInput}
          placeholder={"Got an idea to improve LootQuest?\nFound a bug? Let us know!"}
          placeholderTextColor={COLORS.textMuted}
          value={feedback}
          onChangeText={setFeedback}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        <TouchableOpacity
          style={styles.submitBtn}
          onPress={handleSubmitFeedback}
          activeOpacity={0.85}
        >
          <Text style={styles.submitText}>Submit Feedback</Text>
        </TouchableOpacity>
      </View>

      {/* ── Community Card ── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.headerIconCircle, { borderColor: COLORS.secondary }]}>
            <MessageCircle size={15} color={COLORS.secondary} />
          </View>
          <Text style={styles.cardTitle}>Community</Text>
        </View>
        <TouchableOpacity
          style={styles.discordBtn}
          onPress={handleJoinDiscord}
          activeOpacity={0.85}
        >
          <Text style={styles.discordText}>Join Discord Server</Text>
        </TouchableOpacity>
      </View>

      {/* ── Developer's Note Card ── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.headerIconCircle, { borderColor: COLORS.secondary }]}>
            <Gamepad2 size={15} color={COLORS.secondary} />
          </View>
          <Text style={styles.cardTitle}>Developer's Note</Text>
        </View>
        <View style={styles.devNoteContent}>
          <Text style={styles.devNoteParagraph}>
            LootQuest started as a tool I built for myself because I kept missing free giveaways.
          </Text>
          <Text style={styles.devNoteParagraph}>
            Over time, I kept adding things I wished existed, and somehow it turned into a full app.
          </Text>
          <Text style={styles.devNoteParagraph}>
            It's still very much a personal project, so if you run into bugs, have suggestions, or think something could be better, I'd love to hear it.
          </Text>
          <Text style={styles.devNoteParagraph}>
            Thanks for checking it out.
          </Text>
          <View style={styles.signatureContainer}>
            <Text style={styles.signatureLabel}>
              Made with ❤️ by <Text style={styles.highlightedNameTextOnly}>Eklavya Ahuja</Text>
            </Text>
          </View>
        </View>
      </View>

      {/* ── Version Footer ── */}
      <View style={styles.versionFooter}>
        <Text style={styles.versionAppName}>LOOTQUEST</Text>
        <Text style={styles.versionText}>{`Version ${appVersion} (Beta)`}</Text>
        <Text style={styles.attributionText} onPress={handleOpenGamerPower}>
          Data provided by <Text style={styles.hyperlink}>GamerPower.com</Text>
        </Text>
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
    padding: 16,
    paddingBottom: 48,
    gap: 12,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.bg,
  },
  loadingText: {
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: COLORS.text,
  },

  // Card shell
  card: {
    backgroundColor: COLORS.surfaceCharcoal,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },

  // Card header row
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 13,
    paddingBottom: 11,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  cardTitle: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: COLORS.text,
  },

  // Generic list row (used for Alerts, Frequency, Filters)
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 12,
  },
  listRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  listRowLabel: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.textMuted,
  },
  listRowLabelActive: {
    color: COLORS.text,
    fontFamily: FONTS.bold,
  },

  // Platform icon background square
  platformIconBg: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Radio button (Scan Frequency)
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: COLORS.textMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioOuterActive: {
    borderColor: COLORS.primary,
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },

  // Checkbox (Content Filters)
  filterSublabel: {
    fontFamily: FONTS.bold,
    fontSize: 10,
    color: COLORS.textMuted,
    letterSpacing: 1.2,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.textMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },

  // Feedback card
  feedbackInput: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    color: COLORS.text,
    fontFamily: FONTS.medium,
    fontSize: 13,
    minHeight: 80,
  },
  submitBtn: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    paddingVertical: 13,
    alignItems: 'center',
  },
  submitText: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: COLORS.bg,
    letterSpacing: 0.2,
  },

  // Footer
  versionFooter: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 4,
  },
  versionAppName: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.textMuted,
    letterSpacing: 2,
  },
  versionText: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    color: COLORS.textMuted,
    letterSpacing: 0.4,
  },
  devNoteContent: {
    padding: 16,
    gap: 12,
  },
  devNoteParagraph: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 18,
  },
  signatureContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  signatureLabel: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.textMuted,
  },
  highlightedNameTextOnly: {
    fontFamily: FONTS.bold,
    color: '#39ff14', // Neon green highlight
  },
  discordBtn: {
    marginHorizontal: 16,
    marginVertical: 14,
    borderRadius: 24,
    backgroundColor: '#5865F2', // Discord Purple-Blue
    paddingVertical: 13,
    alignItems: 'center',
    shadowColor: '#5865F2',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  discordText: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: '#ffffff',
    letterSpacing: 0.2,
  },
  attributionText: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 6,
    textAlign: 'center',
  },
  hyperlink: {
    color: COLORS.primary,
    textDecorationLine: 'underline',
  },
});
