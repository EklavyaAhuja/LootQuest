import { Platform, StatusBar } from 'react-native';

export interface EdgeInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Returns safe area insets using React Native's built-in platform metrics.
 * Avoids external npm dependencies while providing accurate top/bottom insets.
 */
export function useSafeAreaInsets(): EdgeInsets {
  const top = Platform.select({
    ios: 44,
    android: Math.max(StatusBar.currentHeight ?? 0, 36),
    default: 0,
  });

  const bottom = Platform.select({
    ios: 34,
    android: 48,
    default: 0,
  });

  return {
    top,
    bottom,
    left: 0,
    right: 0,
  };
}
