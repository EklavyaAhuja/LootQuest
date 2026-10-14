import { Platform, View } from 'react-native';
import React from 'react';

/**
 * Detect if we're running inside Expo Go (where native modules are unavailable).
 */
export const isExpoGo =
  Platform.OS !== 'web' && !!((globalThis as any)?.expo?.modules?.ExpoGo);

// ---------- expo-updates ----------
let _useUpdates: any = () => ({ currentlyRunning: null, isUpdateAvailable: false, isUpdatePending: false });
let _reloadAsync: any = async () => {};

try {
  if (Platform.OS !== 'web') {
    const Updates = require('expo-updates');
    if (Updates && typeof Updates.useUpdates === 'function') {
      _useUpdates = Updates.useUpdates;
    }
    if (Updates && typeof Updates.reloadAsync === 'function') {
      _reloadAsync = Updates.reloadAsync;
    }
  }
} catch {
  // Web / fallback stub
}

export const useUpdates = _useUpdates;
export const reloadAsync = _reloadAsync;

// ---------- expo-web-browser ----------
let _WebBrowser: any = null;
try {
  _WebBrowser = require('expo-web-browser');
} catch {
  const { Linking } = require('react-native');
  _WebBrowser = {
    openBrowserAsync: async (url: string) => {
      await Linking.openURL(url);
      return { type: 'cancel' as const };
    },
  };
}
export const WebBrowser = _WebBrowser;

// ---------- expo-notifications ----------
// In Expo Go (SDK 53+), expo-notifications remote push was removed and
// throws during module init. We suppress that console.warn during the
// require so it doesn't pollute the console, then use a no-op stub.
let _Notifications: any = null;

const _origWarn = console.warn;
const _origError = console.error;
console.warn = (...args: any[]) => {
  const msg = String(args[0] || '');
  if (msg.includes('expo-notifications') && msg.includes('Expo Go')) return;
  _origWarn.apply(console, args);
};
console.error = (...args: any[]) => {
  const msg = String(args[0] || '');
  if (msg.includes('expo-notifications') && msg.includes('Expo Go')) return;
  _origError.apply(console, args);
};
try {
  _Notifications = require('expo-notifications');
} catch {
  // Will use stub below
} finally {
  console.warn = _origWarn;
  console.error = _origError;
}

if (!_Notifications) {
  _Notifications = {
    setNotificationHandler: () => {},
    getPermissionsAsync: async () => ({ status: 'undetermined' as const }),
    requestPermissionsAsync: async () => ({ status: 'undetermined' as const }),
    scheduleNotificationAsync: async () => {},
    addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
    setNotificationChannelAsync: async () => {},
    AndroidImportance: { HIGH: 4 },
    AndroidNotificationPriority: { HIGH: 1 },
  };
}
export const Notifications = _Notifications;

// ---------- @react-native-firebase/analytics ----------
let _analytics: any = null;
try {
  if (Platform.OS !== 'web') {
    _analytics = require('@react-native-firebase/analytics').default;
  }
} catch {
  // Expo Go / Web fallback
}
if (!_analytics) {
  _analytics = () => ({
    logAppOpen: async () => {},
    logEvent: async () => {},
    setUserProperty: async () => {},
    setCurrentScreen: async () => {},
  });
}
export const analytics = _analytics;

// ---------- react-native-svg ----------
const StubSvg = (props: any) => React.createElement(View, props);
const stub = () => null;

let _Svg: any = StubSvg;
let _SvgComponents: Record<string, any> = {
  Circle: stub,
  Line: stub,
  Path: stub,
  Defs: stub,
  LinearGradient: stub,
  Stop: stub,
  Filter: stub,
  FeGaussianBlur: stub,
};

try {
  const svgModule = require('react-native-svg');
  _Svg = svgModule.default || svgModule;
  _SvgComponents = {
    Circle: svgModule.Circle,
    Line: svgModule.Line,
    Path: svgModule.Path,
    Defs: svgModule.Defs,
    LinearGradient: svgModule.LinearGradient,
    Stop: svgModule.Stop,
    Filter: svgModule.Filter,
    FeGaussianBlur: svgModule.FeGaussianBlur,
  };
} catch {
  // Expo Go fallback: SVGs won't render, but the app won't crash
}

export const Svg = _Svg;
export const SvgCircle = _SvgComponents.Circle;
export const SvgLine = _SvgComponents.Line;
export const SvgPath = _SvgComponents.Path;
export const SvgDefs = _SvgComponents.Defs;
export const SvgLinearGradient = _SvgComponents.LinearGradient;
export const SvgStop = _SvgComponents.Stop;
export const SvgFilter = _SvgComponents.Filter;
export const SvgFeGaussianBlur = _SvgComponents.FeGaussianBlur;
