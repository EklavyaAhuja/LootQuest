import AsyncStorage from '@react-native-async-storage/async-storage';
import appJson from '../../app.json';
import { getAppSettings } from './storageService';

const ANALYTICS_URL = 'https://lootquest-backend.onrender.com';

const INSTALL_ID_KEY = 'lootquest_install_id';
const LAST_PING_KEY = 'lootquest_last_ping';
const PING_TIMEOUT_MS = 5000;

export { ANALYTICS_URL };

function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function getInstallId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(INSTALL_ID_KEY);
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

    const today = new Date().toDateString();
    const lastPing = await AsyncStorage.getItem(LAST_PING_KEY);
    if (lastPing === today) return;

    const id = await getInstallId();
    const version = appJson.expo.version;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);

    try {
      const response = await fetch(`${ANALYTICS_URL}/ping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, v: version }),
        signal: controller.signal,
      });
      if (response.ok) {
        await AsyncStorage.setItem(LAST_PING_KEY, today);
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    // Silent by design: no UI, no retry loop, no startup impact.
  }
}
