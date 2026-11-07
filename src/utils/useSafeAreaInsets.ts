import { Platform, StatusBar, View, ViewProps } from 'react-native';
import React from 'react';

export interface EdgeInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Native-module safe check:
 * If the released binary does not contain the native module for react-native-safe-area-context,
 * attempting to use its native provider throws an Invariant Violation.
 * We safely detect if RNCSafeAreaContext is present. If absent, we use the robust JS stopgap.
 */
let _hasNativeSafeArea = false;
try {
  const { requireOptionalNativeModule } = require('expo-modules-core');
  if (typeof requireOptionalNativeModule === 'function') {
    _hasNativeSafeArea = Boolean(requireOptionalNativeModule('RNCSafeAreaContext'));
  }
} catch {
  _hasNativeSafeArea = false;
}

export function useSafeAreaInsets(): EdgeInsets {
  if (_hasNativeSafeArea) {
    try {
      const { useSafeAreaInsets: nativeHook } = require('react-native-safe-area-context');
      return nativeHook();
    } catch {}
  }

  // Robust JS Stopgap (Item 5: bottom insets at least 28dp on mobile)
  const top = Platform.select({
    ios: 44,
    android: Math.max(StatusBar.currentHeight ?? 0, 36),
    default: 0,
  });

  const bottom = Platform.select({
    ios: 34,
    android: 28,
    default: 0,
  });

  return {
    top,
    bottom,
    left: 0,
    right: 0,
  };
}

let NativeSafeAreaProvider: any = null;
try {
  const pkg = require('react-native-safe-area-context');
  NativeSafeAreaProvider = pkg.SafeAreaProvider;
} catch {}

export const SafeAreaProvider = ({ children, style, ...props }: any) => {
  if (NativeSafeAreaProvider) {
    return React.createElement(NativeSafeAreaProvider, { style: [{ flex: 1 }, style], ...props }, children);
  }
  return React.createElement(View, { style: [{ flex: 1 }, style] }, children);
};

