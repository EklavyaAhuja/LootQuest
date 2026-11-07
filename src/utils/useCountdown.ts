import { useState, useEffect, useRef, useMemo } from 'react';
import { Animated, AccessibilityInfo } from 'react-native';
import { parseDateToMs } from './dealUtils';
import { COLORS } from '../theme/theme';
import { checkIsReduceMotionEnabled, subscribeToReduceMotion } from './motion';
import { useAppClockSeconds, useAppClockMinutes } from '../services/appClock';

export interface CountdownState {
  d: string;
  h: string;
  m: string;
  s: string;
  hasDays: boolean;
  progress: number;
  isInfinite: boolean;
  isExpired: boolean;
  urgency: 'normal' | 'under12h' | 'under1h';
  numeralColor: string;
  hairlineColor: string;
  showEndingNow: boolean;
  secondsOpacity: Animated.Value;
}

interface CountdownInternalState {
  d: string;
  h: string;
  m: string;
  s: string;
  hasDays: boolean;
  progress: number;
  isInfinite: boolean;
  isExpired: boolean;
  urgency: 'normal' | 'under12h' | 'under1h';
  numeralColor: string;
  hairlineColor: string;
  showEndingNow: boolean;
}

export function computeCountdownState(
  endDate?: string | null,
  startDate?: string | null,
  nowMs?: number
): CountdownInternalState {
  if (
    !endDate ||
    endDate.toUpperCase() === 'N/A' ||
    endDate === 'No expiry' ||
    endDate.toUpperCase() === 'PERMANENT' ||
    endDate.trim() === ''
  ) {
    return {
      d: '0',
      h: '00',
      m: '00',
      s: '00',
      hasDays: false,
      progress: 100,
      isInfinite: true,
      isExpired: false,
      urgency: 'normal',
      numeralColor: COLORS.text,
      hairlineColor: COLORS.border,
      showEndingNow: false,
    };
  }

  const endMs = parseDateToMs(endDate);
  if (isNaN(endMs) || endMs <= 0) {
    return {
      d: '0',
      h: '00',
      m: '00',
      s: '00',
      hasDays: false,
      progress: 100,
      isInfinite: true,
      isExpired: false,
      urgency: 'normal',
      numeralColor: COLORS.text,
      hairlineColor: COLORS.border,
      showEndingNow: false,
    };
  }

  const startMs = startDate ? parseDateToMs(startDate) : endMs - 7 * 86400000;
  const now = typeof nowMs === 'number' ? nowMs : Date.now();
  const diffMs = endMs - now;

  if (diffMs <= 0) {
    return {
      d: '0',
      h: '00',
      m: '00',
      s: '00',
      hasDays: false,
      progress: 0,
      isInfinite: false,
      isExpired: true,
      urgency: 'under1h',
      numeralColor: COLORS.textMuted,
      hairlineColor: COLORS.border,
      showEndingNow: false,
    };
  }

  const totalSec = Math.floor(diffMs / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  const totalSpan = Math.max(1, endMs - startMs);
  const progress = Math.min(100, Math.max(0, (diffMs / totalSpan) * 100));

  let urgency: 'normal' | 'under12h' | 'under1h' = 'normal';
  let numeralColor = COLORS.text;
  let hairlineColor = COLORS.text;
  let showEndingNow = false;

  if (totalSec < 3600) {
    urgency = 'under1h';
    numeralColor = '#FF8A5B';
    hairlineColor = '#FF8A5B';
    showEndingNow = true;
  } else if (totalSec < 86400) {
    urgency = 'under12h';
    numeralColor = '#FF8A5B'; // Orange when under 24 hours remain
    hairlineColor = '#FF8A5B';
    showEndingNow = false;
  } else {
    urgency = 'normal';
    numeralColor = COLORS.text;
    hairlineColor = 'rgba(237, 237, 235, 0.7)';
    showEndingNow = false;
  }

  const hasDays = d > 0;

  return {
    d: String(d).padStart(2, '0'),
    h: String(h).padStart(2, '0'),
    m: String(m).padStart(2, '0'),
    s: String(s).padStart(2, '0'),
    hasDays,
    progress,
    isInfinite: false,
    isExpired: false,
    urgency,
    numeralColor,
    hairlineColor,
    showEndingNow,
  };
}

export function useCountdown(
  endDate?: string | null,
  startDate?: string | null,
  includeSeconds = true
): CountdownState {
  const [isReduceMotion, setIsReduceMotion] = useState(false);
  const secondsOpacity = useRef(new Animated.Value(1)).current;
  const pulseAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  // Subscribe to shared clock tier (1s for seconds, 30s for minutes/hours)
  const clockNowSeconds = useAppClockSeconds();
  const clockNowMinutes = useAppClockMinutes();
  const now = includeSeconds ? clockNowSeconds : clockNowMinutes;

  const state = useMemo(() => {
    return computeCountdownState(endDate, startDate, now);
  }, [endDate, startDate, now]);

  useEffect(() => {
    checkIsReduceMotionEnabled().then((enabled) => {
      setIsReduceMotion(enabled);
    });
    return subscribeToReduceMotion((enabled) => setIsReduceMotion(enabled));
  }, []);

  // Pulse animation for under 1 hour (seconds digit pulse)
  useEffect(() => {
    if (state.urgency === 'under1h' && !state.isExpired && !state.isInfinite && !isReduceMotion) {
      if (!pulseAnimRef.current) {
        pulseAnimRef.current = Animated.loop(
          Animated.sequence([
            Animated.timing(secondsOpacity, {
              toValue: 0.35,
              duration: 500,
              useNativeDriver: true,
            }),
            Animated.timing(secondsOpacity, {
              toValue: 1,
              duration: 500,
              useNativeDriver: true,
            }),
          ])
        );
        pulseAnimRef.current.start();
      }
    } else {
      if (pulseAnimRef.current) {
        pulseAnimRef.current.stop();
        pulseAnimRef.current = null;
      }
      secondsOpacity.setValue(1);
    }

    return () => {
      if (pulseAnimRef.current) {
        pulseAnimRef.current.stop();
        pulseAnimRef.current = null;
      }
    };
  }, [state.urgency, state.isExpired, state.isInfinite, isReduceMotion, secondsOpacity]);

  return {
    ...state,
    secondsOpacity,
  };
}
