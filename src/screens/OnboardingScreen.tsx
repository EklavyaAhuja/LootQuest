import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from '../components/LinearGradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, FONTS, RADIUS } from '../theme/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAX_NAME_LENGTH = 20;
const STORAGE_KEY = 'lootquest_user_name';

export async function getSavedName(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function saveName(name: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, name);
  } catch {}
}

interface OnboardingScreenProps {
  onComplete: (name: string) => void;
}

export default function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const [name, setName] = useState('');
  const [step, setStep] = useState<'welcome' | 'input'>('welcome');
  const [isConfirming, setIsConfirming] = useState(false);

  const [isInputFocused, setIsInputFocused] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const checkmarkScale = useRef(new Animated.Value(0)).current;

  const useNative = Platform.OS !== 'web';

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: useNative,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        tension: 40,
        delay: 200,
        useNativeDriver: useNative,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 30,
        delay: 400,
        useNativeDriver: useNative,
      }),
    ]).start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: useNative,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: useNative,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [useNative]);

  const handleGetStarted = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: useNative,
    }).start(() => {
      setStep('input');
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: useNative,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          friction: 8,
          tension: 40,
          useNativeDriver: useNative,
        }),
      ]).start();
    });
  };

  const handleConfirm = async () => {
    if (name.trim().length === 0 || isConfirming) return;
    setIsConfirming(true);

    Animated.spring(checkmarkScale, {
      toValue: 1,
      friction: 5,
      tension: 30,
      useNativeDriver: useNative,
    }).start();

    await saveName(name.trim());

    setTimeout(() => {
      onComplete(name.trim());
    }, 800);
  };

  if (step === 'welcome') {
    return (
      <View style={[styles.container, { backgroundColor: COLORS.bg }]}>
        <Animated.View
          style={[
            styles.welcomeContent,
            {
              opacity: fadeAnim,
              transform: [
                { translateY: slideAnim },
                { scale: scaleAnim },
              ],
            },
          ]}
        >
          <Animated.View style={[styles.iconCircle, { transform: [{ scale: pulseAnim }] }]}>
            <LinearGradient
              colors={[COLORS.auroraIndigo, COLORS.auroraViolet]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconCircleFill}
            >
              <Ionicons name="sparkles" size={48} color="#FFFFFF" />
            </LinearGradient>
          </Animated.View>

          <Text style={styles.welcomeTitle}>Welcome to{'\n'}LootQuest</Text>
          <Text style={styles.welcomeSubtitle}>
            Your personal free game tracker.{'\n'}Never miss a giveaway again.
          </Text>

          <TouchableOpacity style={styles.getStartedBtn} onPress={handleGetStarted} activeOpacity={0.8}>
            <Text style={styles.getStartedText}>Get Started</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        </Animated.View>

        <View style={styles.dotsContainer}>
          <View style={[styles.dot, styles.dotActive]} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: COLORS.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Animated.View
        style={[
          styles.inputContent,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
        <Animated.View style={[styles.iconCircle, { transform: [{ scale: pulseAnim }] }]}>
          <LinearGradient
            colors={[COLORS.auroraIndigo, COLORS.auroraViolet]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconCircleFill}
          >
            <Ionicons name="person" size={48} color="#FFFFFF" />
          </LinearGradient>
        </Animated.View>

        <Text style={styles.inputTitle}>
          Now that we're gonna see each other{'\n'}a lot more often...
        </Text>
        <Text style={styles.inputQuestion}>What should we call you?</Text>

        <View style={[styles.inputWrapper, isInputFocused && styles.inputWrapperFocused]}>
          <TextInput
            style={styles.textInput}
            placeholder="Your name"
            placeholderTextColor={COLORS.textMuted}
            value={name}
            onChangeText={(text) => setName(text.slice(0, MAX_NAME_LENGTH))}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleConfirm}
          />
          <Text style={styles.charCount}>{name.length}/{MAX_NAME_LENGTH}</Text>
        </View>

        <TouchableOpacity
          style={[styles.confirmBtn, name.trim().length === 0 && styles.confirmBtnDisabled]}
          onPress={handleConfirm}
          disabled={name.trim().length === 0 || isConfirming}
          activeOpacity={0.8}
        >
          <Animated.View style={{ transform: [{ scale: checkmarkScale.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 1.2],
          }) }] }}>
            <Ionicons
              name={isConfirming ? 'checkmark-circle' : 'arrow-forward'}
              size={isConfirming ? 24 : 20}
              color="#fff"
            />
          </Animated.View>
          <Text style={styles.confirmText}>
            {isConfirming ? `Let's go, ${name}!` : name.trim().length > 0 ? `Continue as ${name}` : 'Enter your name'}
          </Text>
        </TouchableOpacity>
      </Animated.View>

      <View style={styles.dotsContainer}>
        <View style={styles.dot} />
        <View style={[styles.dot, styles.dotActive]} />
        <View style={styles.dot} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  welcomeContent: {
    alignItems: 'center',
    maxWidth: 340,
  },
  inputContent: {
    alignItems: 'center',
    maxWidth: 340,
    width: '100%',
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  iconCircleFill: {
    width: '100%',
    height: '100%',
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeTitle: {
    fontSize: 28,
    fontFamily: FONTS.extraBold,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  welcomeSubtitle: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 40,
  },
  inputTitle: {
    fontSize: 16,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 24,
  },
  inputQuestion: {
    fontSize: 24,
    fontFamily: FONTS.extraBold,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 32,
    letterSpacing: -0.5,
  },
  inputWrapper: {
    width: '100%',
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 20,
    paddingVertical: 4,
    marginBottom: 24,
  },
  inputWrapperFocused: {
    borderColor: COLORS.primary,
  },
  textInput: {
    fontSize: 16,
    fontFamily: FONTS.regular,
    color: COLORS.text,
    paddingVertical: 16,
    width: '100%',
  },
  charCount: {
    fontSize: 11,
    fontFamily: FONTS.mono,
    color: COLORS.textMuted,
    textAlign: 'right',
    marginBottom: 4,
  },
  getStartedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: RADIUS.pill,
    gap: 8,
  },
  getStartedText: {
    fontSize: 14,
    fontFamily: FONTS.bold,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: RADIUS.pill,
    gap: 8,
  },
  confirmBtnDisabled: {
    backgroundColor: COLORS.border,
  },
  confirmText: {
    fontSize: 14,
    fontFamily: FONTS.bold,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 8,
    position: 'absolute',
    bottom: 60,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.border,
  },
  dotActive: {
    width: 24,
    backgroundColor: COLORS.primary,
  },
});
