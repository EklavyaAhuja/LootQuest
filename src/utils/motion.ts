import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Crash-safe utility to check reduce motion preference across platforms and engine versions.
 */
export function checkIsReduceMotionEnabled(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.matchMedia) {
        return Promise.resolve(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      }
      return Promise.resolve(false);
    }
    // On iOS and Web, reduceMotion accurately reflects user intent.
    // On Android, AccessibilityInfo.isReduceMotionEnabled() frequently false-positives
    // when any 3rd-party accessibility service (password manager, autofill) is running,
    // which inadvertently turns off all 60fps native UI-thread animations.
    if (Platform.OS === 'ios' && AccessibilityInfo && typeof AccessibilityInfo.isReduceMotionEnabled === 'function') {
      return AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
    }
  } catch {}
  return Promise.resolve(false);
}

/**
 * Crash-safe listener for reduce motion preference changes.
 */
export function subscribeToReduceMotion(onChange: (enabled: boolean) => void): () => void {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.matchMedia) {
        const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
        const handler = (e: MediaQueryListEvent) => onChange(e.matches);
        mql.addEventListener?.('change', handler);
        return () => mql.removeEventListener?.('change', handler);
      }
      return () => {};
    }
    if (Platform.OS === 'ios' && AccessibilityInfo && typeof AccessibilityInfo.addEventListener === 'function') {
      const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', onChange);
      return () => {
        try {
          if (sub && typeof sub.remove === 'function') {
            sub.remove();
          } else if (typeof (AccessibilityInfo as any).removeEventListener === 'function') {
            (AccessibilityInfo as any).removeEventListener('reduceMotionChanged', onChange);
          }
        } catch {}
      };
    }
  } catch {}
  return () => {};
}
