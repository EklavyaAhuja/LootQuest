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
} from 'react-native';
import { COLORS, FONTS } from '../theme/theme';
import BouncyPressable from '../components/BouncyPressable';
import {
  getAppSettings,
  saveAppSettings,
  AppSettings,
} from '../services/storageService';
import {
  registerBackgroundFetch,
  unregisterBackgroundFetch,
} from '../services/notificationService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Bell,
  Sparkles,
} from 'lucide-react-native';

const ALL_PLATFORMS = ['Steam', 'Epic Games', 'GOG', 'itch.io', 'Playstation', 'Xbox'];
const ALL_TYPES = ['Game', 'DLC', 'Beta'];

export default function SettingsScreen() {
  const [settings, setSettings] = useState<AppSettings | null>(null);

  // Custom feedback states
  const [suggestion, setSuggestion] = useState('');
  const [feedback, setFeedback] = useState('');



  useEffect(() => {
    const loadData = async () => {
      const savedSettings = await getAppSettings();
      setSettings(savedSettings);
    };
    loadData();
  }, []);



  const handleToggleNotifications = async (val: boolean) => {
    if (!settings) return;
    const updated = { ...settings, notificationsEnabled: val };
    setSettings(updated);
    await saveAppSettings(updated);
    
    if (val) {
      await registerBackgroundFetch();
    } else {
      await unregisterBackgroundFetch();
    }
  };

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
    const suggestionText = suggestion.trim();
    const feedbackText = feedback.trim();

    if (!suggestionText && !feedbackText) {
      Alert.alert('Empty Transmission', 'Please enter a suggestion or feedback before sending.');
      return;
    }

    const webhookUrl = process.env.EXPO_PUBLIC_DISCORD_WEBHOOK_URL;
    if (!webhookUrl || webhookUrl === 'your_discord_webhook_url_here') {
      Alert.alert(
        'Webhook Offline 📡',
        'Feedback transmission channel is not configured on this build yet. Thank you for testing!'
      );
      setSuggestion('');
      setFeedback('');
      return;
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          embeds: [
            {
              title: '📡 New Transmission: LootQuest Feedback',
              color: 3788564, // Decimal color for neon green (#39FF14)
              fields: [
                {
                  name: '💡 Suggestion',
                  value: suggestionText || '*None provided*',
                },
                {
                  name: '💬 General Feedback',
                  value: feedbackText || '*None provided*',
                },
                {
                  name: '📱 Client Info',
                  value: `${Platform.OS.toUpperCase()} (OS Version: ${Platform.Version})`,
                },
              ],
              timestamp: new Date().toISOString(),
            },
          ],
        }),
      });

      if (response.ok) {
        Alert.alert(
          'Transmission Received! 📡',
          'Your feedback and suggestion have been logged directly with the creator. Thank you for your input!'
        );
        setSuggestion('');
        setFeedback('');
      } else {
        throw new Error(`Response status: ${response.status}`);
      }
    } catch (e) {
      console.error('Error sending feedback to Discord:', e);
      Alert.alert(
        'Transmission Failed ❌',
        'Could not complete transmission. Please check your network connection and try again.'
      );
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
      {/* Personalized Greeting Card */}
      <View style={styles.greetingCard}>
        <Sparkles size={22} color={COLORS.primary} style={styles.sparklesIcon} />
        <Text style={styles.greetingTitle}>ABOUT LOOTQUEST</Text>
        <Text style={styles.greetingText}>
          Thank you for checking out LootQuest.{"\n\n"}
          This app started as a small side project after I got tired of constantly checking different sites and Reddit threads for free games, only to discover I had missed a giveaway by a few hours.{"\n\n"}
          What began as a simple experiment slowly turned into something much bigger: a tool designed to make discovering, tracking, and claiming free games easier.{"\n\n"}
          LootQuest is built and maintained independently, and every feature, improvement, and bug fix comes from a genuine desire to create something useful for fellow gamers.{"\n\n"}
          If this app helped you discover even one great game you would have otherwise missed, then it has already achieved its purpose.{"\n\n"}
          Thank you for being part of the journey.{"\n\n"}
          Happy hunting,{"\n\n"}
          <Text style={styles.signatureText}>The LootQuest Creator</Text>
        </Text>
      </View>

      {/* Suggestion & Feedback Section */}
      <View style={styles.feedbackFormCard}>
        <Text style={styles.formHeader}>TRANSMIT FEEDBACK</Text>

        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Suggestion:</Text>
          <TextInput
            placeholder="e.g. Add search by tags, notification history filters..."
            placeholderTextColor="#64748b"
            style={styles.textInput}
            value={suggestion}
            onChangeText={setSuggestion}
            multiline
            numberOfLines={3}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Feedback:</Text>
          <TextInput
            placeholder="Tell us what you like or how we can improve..."
            placeholderTextColor="#64748b"
            style={styles.textInput}
            value={feedback}
            onChangeText={setFeedback}
            multiline
            numberOfLines={3}
          />
        </View>

        <BouncyPressable
          onPress={handleSubmitFeedback}
          backgroundColor={COLORS.primary}
          borderRadius={12}
          shadowOffsetSize={3}
          style={styles.submitBtn}
          contentStyle={styles.submitBtnContent}
        >
          <Text style={styles.submitBtnText}>SEND TRANSMISSION</Text>
        </BouncyPressable>
      </View>

      <Text style={styles.sectionHeading}>SYSTEM PREFERENCES</Text>

      <View style={styles.settingsList}>
        {/* Notifications Preference Card */}
        <View style={styles.preferencesWrapper}>
          <View style={styles.staticCardContainer}>
            <View style={styles.drawerCardContent}>
              <View style={styles.drawerCardLeft}>
                <View style={styles.bellIconCircle}>
                  <Bell size={18} color="#00e3fd" />
                </View>
                <View style={styles.drawerCardText}>
                  <Text style={styles.drawerCardTitle}>Notification Preferences</Text>
                  <Text style={styles.drawerCardSub}>Loot alerts & system pings</Text>
                </View>
              </View>
            </View>

            <View style={styles.notificationsDrawerContent}>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Enable Notifications</Text>
                <Switch
                  value={settings.notificationsEnabled}
                  onValueChange={handleToggleNotifications}
                  trackColor={{ false: '#d0c8be', true: COLORS.success }}
                  thumbColor={COLORS.white}
                />
              </View>

              {settings.notificationsEnabled && (
                <View style={styles.subSettings}>
                  <Text style={styles.subLabel}>Target Platforms:</Text>
                  <View style={styles.buttonGrid}>
                    {ALL_PLATFORMS.map(p => {
                      const isSelected = settings.notificationPlatforms.includes(p);
                      return (
                        <BouncyPressable
                          key={p}
                          onPress={() => handlePlatformToggle(p)}
                          backgroundColor={isSelected ? COLORS.primary : '#1e293b'}
                          borderRadius={10}
                          shadowOffsetSize={0}
                          style={styles.gridBtn}
                          contentStyle={[styles.gridBtnContent, !isSelected && { borderWidth: 1, borderColor: '#334155' }]}
                        >
                          <Text style={[styles.gridText, isSelected && { color: COLORS.border, fontFamily: FONTS.bold }]}>
                            {p}
                          </Text>
                        </BouncyPressable>
                      );
                    })}
                  </View>

                  <Text style={styles.subLabel}>Content Types:</Text>
                  <View style={styles.buttonGrid}>
                    {ALL_TYPES.map(t => {
                      const isSelected = settings.notificationTypes.includes(t);
                      return (
                        <BouncyPressable
                          key={t}
                          onPress={() => handleTypeToggle(t)}
                          backgroundColor={isSelected ? COLORS.secondary : '#1e293b'}
                          borderRadius={10}
                          shadowOffsetSize={0}
                          style={styles.gridBtn}
                          contentStyle={[styles.gridBtnContent, !isSelected && { borderWidth: 1, borderColor: '#334155' }]}
                        >
                          <Text style={[styles.gridText, isSelected && { color: COLORS.border, fontFamily: FONTS.bold }]}>
                            {t}
                          </Text>
                        </BouncyPressable>
                      );
                    })}
                  </View>

                  <Text style={styles.subLabel}>Scan Frequency:</Text>
                  <View style={styles.intervalGrid}>
                    {[15, 30, 60].map(mins => {
                      const isSelected = settings.backgroundIntervalMinutes === mins;
                      return (
                        <BouncyPressable
                          key={mins}
                          onPress={() => handleIntervalChange(mins)}
                          backgroundColor={isSelected ? COLORS.success : '#1e293b'}
                          borderRadius={10}
                          shadowOffsetSize={0}
                          style={styles.intervalBtn}
                          contentStyle={[styles.intervalBtnContent, !isSelected && { borderWidth: 1, borderColor: '#334155' }]}
                        >
                          <Text style={[styles.gridText, isSelected && { color: COLORS.white, fontFamily: FONTS.bold }]}>
                            Every {mins}m
                          </Text>
                        </BouncyPressable>
                      );
                    })}
                  </View>


                </View>
              )}
            </View>
          </View>
        </View>
      </View>

      {/* Version Footer */}
      <View style={styles.versionFooter}>
        <Text style={styles.versionAppName}>LootQuest</Text>
        <Text style={styles.versionText}>v1.0.0</Text>
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
    paddingBottom: 40,
    gap: 16,
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
  greetingCard: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 24,
    padding: 20,
  },
  greetingTitle: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: COLORS.primary,
    marginBottom: 12,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  greetingText: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.text,
    textAlign: 'left',
    lineHeight: 21,
  },
  sparklesIcon: {
    marginBottom: 8,
    alignSelf: 'center',
  },
  signatureText: {
    fontFamily: FONTS.bold,
    color: COLORS.primary,
  },
  feedbackFormCard: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 24,
    padding: 20,
    gap: 16,
  },
  formHeader: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: '#64748b',
    letterSpacing: 1,
    marginBottom: 4,
  },
  formGroup: {
    gap: 6,
  },
  formLabel: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.text,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: COLORS.bg,
    color: COLORS.text,
    fontFamily: FONTS.medium,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  submitBtn: {
    width: '100%',
    height: 48,
    marginTop: 8,
  },
  submitBtnContent: {
    justifyContent: 'center',
    alignItems: 'center',
    height: 48,
    borderRadius: 12,
  },
  submitBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: COLORS.bg,
    letterSpacing: 0.5,
  },
  sectionHeading: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: '#64748b',
    letterSpacing: 1,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  settingsList: {
    gap: 12,
  },
  preferencesWrapper: {
    width: '100%',
  },
  staticCardContainer: {
    width: '100%',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 16,
    overflow: 'hidden',
  },
  drawerCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderColor: '#334155',
  },
  drawerCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bellIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 227, 253, 0.05)',
    borderWidth: 1,
    borderColor: '#00e3fd',
    justifyContent: 'center',
    alignItems: 'center',
  },
  drawerCardText: {
    justifyContent: 'center',
  },
  drawerCardTitle: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 2,
  },
  drawerCardSub: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: '#64748b',
  },
  notificationsDrawerContent: {
    backgroundColor: COLORS.white,
    padding: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderColor: '#334155',
    marginBottom: 12,
  },
  toggleLabel: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: COLORS.text,
  },
  subSettings: {
    gap: 12,
  },
  subLabel: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.text,
    marginTop: 4,
  },
  buttonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gridBtn: {
    minWidth: 80,
  },
  gridBtnContent: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
  },
  gridText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.text,
  },
  intervalGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  intervalBtn: {
    flex: 1,
  },
  intervalBtnContent: {
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  versionFooter: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 4,
  },
  versionAppName: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: COLORS.primary,
    letterSpacing: 2,
  },
  versionText: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: '#475569',
    letterSpacing: 1,
  },

});

