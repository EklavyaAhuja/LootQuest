import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import appJson from '../../app.json';
import { getAppSettings } from './storageService';

const ANALYTICS_URL = 'https://lootquest-backend.onrender.com';

const INSTALL_ID_KEY = 'claimr_install_id';
const LEGACY_INSTALL_ID_KEY = 'lootquest_install_id';
const LAST_PING_KEY = 'claimr_last_ping';
const LEGACY_LAST_PING_KEY = 'lootquest_last_ping';
const PING_TIMEOUT_MS = 5000;

export { ANALYTICS_URL };

export type ClientPlatform = 'android' | 'pwa' | 'web';

export function detectClientPlatform(): ClientPlatform {
  if (Platform.OS === 'android') {
    return 'android';
  }
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;
      if (isStandalone) {
        return 'pwa';
      }
    }
    return 'web';
  }
  return 'web';
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function getInstallId(): Promise<string> {
  try {
    let existing = await AsyncStorage.getItem(INSTALL_ID_KEY);
    if (!existing) {
      existing = await AsyncStorage.getItem(LEGACY_INSTALL_ID_KEY);
    }
    if (existing) return existing;
    const fresh = generateUuid();
    await AsyncStorage.setItem(INSTALL_ID_KEY, fresh);
    return fresh;
  } catch {
    return generateUuid();
  }
}

export async function sendDailyPing(): Promise<void> {
  try {
    const settings = await getAppSettings();
    if (!settings.anonymousUsageCount) return;

    // Throttle to at most once per 10 minutes per device session to avoid network spam,
    // while ensuring real-time side-by-side verification and accurate DAU tracking on backend.
    const lastPingRaw = await AsyncStorage.getItem(LAST_PING_KEY);
    const lastPingMs = lastPingRaw && !isNaN(Number(lastPingRaw)) ? Number(lastPingRaw) : 0;
    if (lastPingMs > 0 && Date.now() - lastPingMs < 10 * 60 * 1000) {
      return;
    }

    const id = await getInstallId();
    const version = appJson.expo.version;
    const platform = detectClientPlatform();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);

    try {
      const response = await fetch(`${ANALYTICS_URL}/ping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          v: version,
          platform,
          p: platform,
        }),
        signal: controller.signal,
      });
      if (response.ok) {
        await AsyncStorage.setItem(LAST_PING_KEY, Date.now().toString());
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    // Silent by design: no UI, no retry loop, no startup impact.
  }
}
