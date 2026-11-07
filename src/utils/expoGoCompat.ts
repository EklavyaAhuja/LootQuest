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
const stubNotificationSubscription = { remove: () => {} };

const NotificationStub: Record<string, any> = {
  setNotificationHandler: () => {},
  getPermissionsAsync: async () => ({ status: 'undetermined' as const }),
  requestPermissionsAsync: async () => ({ status: 'undetermined' as const }),
  scheduleNotificationAsync: async () => '',
  addNotificationReceivedListener: () => stubNotificationSubscription,
  addNotificationResponseReceivedListener: () => stubNotificationSubscription,
  getLastNotificationResponseAsync: async () => null,
  setNotificationChannelAsync: async () => {},
  dismissAllNotificationsAsync: async () => {},
  cancelAllScheduledNotificationsAsync: async () => {},
  setBadgeCountAsync: async () => true,
  getBadgeCountAsync: async () => 0,
  AndroidImportance: { HIGH: 4, DEFAULT: 3, LOW: 2, MIN: 1 },
  AndroidNotificationPriority: { HIGH: 1, DEFAULT: 0, LOW: -1, MIN: -2 },
};

let _rawNotifications: any = null;
try {
  _rawNotifications = require('expo-notifications');
} catch {}

export const Notifications: any = new Proxy(NotificationStub, {
  get(target: any, prop: string) {
    if (_rawNotifications && typeof _rawNotifications[prop] === 'function') {
      return (...args: any[]) => {
        try {
          return _rawNotifications[prop](...args);
        } catch {
          return typeof target[prop] === 'function' ? target[prop](...args) : undefined;
        }
      };
    }
    if (prop in target) {
      return target[prop];
    }
    if (_rawNotifications && prop in _rawNotifications) {
      return _rawNotifications[prop];
    }
    return () => stubNotificationSubscription;
  },
});

// ---------- analytics (guarded Firebase analytics) ----------
import { NativeModules } from 'react-native';

export const analytics = () => ({
  setAnalyticsCollectionEnabled: async (enabled: boolean) => {
    try {
      if (NativeModules.RNFBAnalyticsModule?.setAnalyticsCollectionEnabled) {
        await NativeModules.RNFBAnalyticsModule.setAnalyticsCollectionEnabled(enabled);
      }
    } catch {}
  },
  logEvent: async () => {},
  setUserProperty: async () => {},
  setCurrentScreen: async () => {},
});

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
