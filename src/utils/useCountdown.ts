import { useState, useEffect, useRef } from 'react';
import { Animated, AccessibilityInfo } from 'react-native';
import { parseDateToMs } from './dealUtils';
import { COLORS } from '../theme/theme';

export interface CountdownState {
  d: string;
  h: string;
  m: string;
  s: string;
  progress: number;
  isInfinite: boolean;
  isExpired: boolean;
  urgency: 'normal' | 'under12h' | 'under1h';
  numeralColor: string;
  hairlineColor: string;
  showEndingNow: boolean;
  secondsOpacity: Animated.Value;
}

export function useCountdown(
  endDate?: string | null,
  startDate?: string | null
): CountdownState {
  const [isReduceMotion, setIsReduceMotion] = useState(false);
  const secondsOpacity = useRef(new Animated.Value(1)).current;
  const pulseAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  const [state, setState] = useState<{
    d: string;
    h: string;
    m: string;
    s: string;
    progress: number;
    isInfinite: boolean;
    isExpired: boolean;
    urgency: 'normal' | 'under12h' | 'under1h';
    numeralColor: string;
    hairlineColor: string;
    showEndingNow: boolean;
  }>({
    d: '00',
    h: '00',
    m: '00',
    s: '00',
    progress: 100,
    isInfinite: false,
    isExpired: false,
    urgency: 'normal',
    numeralColor: COLORS.text,
    hairlineColor: COLORS.text,
    showEndingNow: false,
  });

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      setIsReduceMotion(enabled);
    });
    const sub = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      (enabled) => setIsReduceMotion(enabled)
    );
    return () => {
      sub?.remove?.();
    };
  }, []);

  useEffect(() => {
    const calculate = () => {
      if (
        !endDate ||
        endDate.toUpperCase() === 'N/A' ||
        endDate === 'No expiry' ||
        endDate.toUpperCase() === 'PERMANENT' ||
        endDate.trim() === ''
      ) {
        setState({
          d: '00',
          h: '00',
          m: '00',
          s: '00',
          progress: 100,
          isInfinite: true,
          isExpired: false,
          urgency: 'normal',
          numeralColor: COLORS.text,
          hairlineColor: COLORS.border,
          showEndingNow: false,
        });
        return;
      }

      const endMs = parseDateToMs(endDate);
      if (isNaN(endMs) || endMs <= 0) {
        setState({
          d: '00',
          h: '00',
          m: '00',
          s: '00',
          progress: 100,
          isInfinite: true,
          isExpired: false,
          urgency: 'normal',
          numeralColor: COLORS.text,
          hairlineColor: COLORS.border,
          showEndingNow: false,
        });
        return;
      }

      const startMs = startDate ? parseDateToMs(startDate) : endMs - 7 * 86400000;
      const now = Date.now();
      const diffMs = endMs - now;

      if (diffMs <= 0) {
        setState({
          d: '00',
          h: '00',
          m: '00',
          s: '00',
          progress: 0,
          isInfinite: false,
          isExpired: true,
          urgency: 'under1h',
          numeralColor: COLORS.textMuted,
          hairlineColor: COLORS.border,
          showEndingNow: false,
        });
        return;
      }

      const totalSec = Math.floor(diffMs / 1000);
      const d = Math.floor(totalSec / 86400);
      const h = Math.floor((totalSec % 86400) / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;

      const totalSpan = Math.max(1, endMs - startMs);
      const progress = Math.min(100, Math.max(0, (diffMs / totalSpan) * 100));

      // Urgency tiers:
      // Over 12h: white numerals + white hairline
      // Under 12h: lime numerals + lime hairline
      // Under 1h: lime numerals, seconds digit pulses (opacity 1 -> 0.35, 1s), hairline turns urgent #FF9D7A, "ENDING NOW" label in urgent color
      let urgency: 'normal' | 'under12h' | 'under1h' = 'normal';
      let numeralColor = COLORS.text;
      let hairlineColor = COLORS.text;
      let showEndingNow = false;

      if (totalSec < 3600) {
        // Under 1 hour
        urgency = 'under1h';
        numeralColor = COLORS.accent;
        hairlineColor = COLORS.warning; // #FF9D7A
        showEndingNow = true;
      } else if (totalSec < 43200) {
        // Under 12 hours
        urgency = 'under12h';
        numeralColor = COLORS.accent;
        hairlineColor = COLORS.accent;
        showEndingNow = false;
      } else {
        // Over 12 hours
        urgency = 'normal';
        numeralColor = COLORS.text;
        hairlineColor = COLORS.text;
        showEndingNow = false;
      }

      setState({
        d: String(d).padStart(2, '0'),
        h: String(h).padStart(2, '0'),
        m: String(m).padStart(2, '0'),
        s: String(s).padStart(2, '0'),
        progress,
        isInfinite: false,
        isExpired: false,
        urgency,
        numeralColor,
        hairlineColor,
        showEndingNow,
      });
    };

    calculate();
    const interval = setInterval(calculate, 1000);
    return () => clearInterval(interval);
  }, [endDate, startDate]);

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
