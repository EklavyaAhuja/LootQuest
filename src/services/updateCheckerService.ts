import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

export interface UpdateInfo {
  version: string;
  name: string;
  body: string;
  downloadUrl: string;
  releaseUrl: string;
  publishedAt: string;
  isUpdateAvailable: boolean;
  currentVersion: string;
}

const STORAGE_KEYS = {
  CACHE: 'claimr_native_update_cache_v1',
  LEGACY_CACHE: 'lootquest_native_update_cache_v1',
  DISMISSED_VERSION: 'claimr_dismissed_native_version_v1',
  LEGACY_DISMISSED_VERSION: 'lootquest_dismissed_native_version_v1',
};

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache to respect GitHub API limits

/**
 * Returns the currently running native application build version.
 * Native builds have fixed binary versions (e.g. 1.2.0).
 * OTA JS updates do not modify the native build version.
 */
export function getCurrentNativeVersion(): string {
  const raw =
    Constants.expoConfig?.version ||
    (Constants as any).nativeAppVersion ||
    '1.2.0';
  return String(raw).replace(/^v/i, '').trim();
}

/**
 * Compare two semver strings: returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal.
 */
export function compareSemver(v1: string, v2: string): number {
  const clean1 = (v1 || '').replace(/^v/i, '').trim();
  const clean2 = (v2 || '').replace(/^v/i, '').trim();

  const p1 = clean1.split('.').map((n) => parseInt(n, 10) || 0);
  const p2 = clean2.split('.').map((n) => parseInt(n, 10) || 0);

  const maxLen = Math.max(p1.length, p2.length);
  for (let i = 0; i < maxLen; i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

class UpdateCheckerService {
  private latestUpdateInfo: UpdateInfo | null = null;
  private isChecking = false;
  private listeners = new Set<(info: UpdateInfo | null) => void>();

  public getLatestUpdateInfo(): UpdateInfo | null {
    return this.latestUpdateInfo;
  }

  public subscribe(listener: (info: UpdateInfo | null) => void): () => void {
    this.listeners.add(listener);
    // Immediately emit current value if available
    listener(this.latestUpdateInfo);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.latestUpdateInfo);
      } catch (err) {
        console.warn('[UpdateCheckerService] Listener error:', err);
      }
    }
  }

  /**
   * Check if a specific version was dismissed by the user.
   */
  public async isVersionDismissed(version: string): Promise<boolean> {
    try {
      const dismissed = await AsyncStorage.getItem(STORAGE_KEYS.DISMISSED_VERSION);
      return dismissed === version;
    } catch {
      return false;
    }
  }

  /**
   * Mark a version as dismissed so it doesn't repeatedly show modals.
   */
  public async dismissVersion(version: string): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.DISMISSED_VERSION, version);
    } catch (err) {
      console.warn('[UpdateCheckerService] Failed to save dismissed version:', err);
    }
  }

  /**
   * Check for a new native build update from GitHub releases.
   * Compares the latest release version against the current native binary version (e.g. 1.2.0).
   * It only signals an update when a newer native version (e.g. >= 1.3.0) exists.
   */
  public async checkForUpdate(force = false): Promise<UpdateInfo | null> {
    if (this.isChecking) {
      return this.latestUpdateInfo;
    }

    const currentNativeVersion = getCurrentNativeVersion();

    // 1. Try cache if not forced
    if (!force) {
      try {
        const cachedRaw = await AsyncStorage.getItem(STORAGE_KEYS.CACHE);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
            const isUpdateAvailable = compareSemver(cached.info.version, currentNativeVersion) > 0;
            const info: UpdateInfo = {
              ...cached.info,
              isUpdateAvailable,
              currentVersion: currentNativeVersion,
            };
            this.latestUpdateInfo = info;
            this.notify();
            return info;
          }
        }
      } catch (err) {
        console.warn('[UpdateCheckerService] Cache read error:', err);
      }
    }

    this.isChecking = true;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);

      const res = await fetch('https://api.github.com/repos/EklavyaAhuja/claimr/releases', {
        signal: controller.signal,
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Claimr-App',
        },
      });

      clearTimeout(timer);

      if (!res.ok) {
        console.warn(`[UpdateCheckerService] GitHub releases request failed: ${res.status}`);
        return this.latestUpdateInfo;
      }

      const releases = await res.json();
      if (!Array.isArray(releases) || releases.length === 0) {
        return this.latestUpdateInfo;
      }

      // Filter non-draft releases and sort by semver descending
      const validReleases = releases
        .filter((r: any) => !r.draft && r.tag_name)
        .sort((a: any, b: any) => compareSemver(b.tag_name, a.tag_name));

      const latest = validReleases[0];
      if (!latest) {
        return this.latestUpdateInfo;
      }

      const latestVersion = String(latest.tag_name).replace(/^v/i, '').trim();
      const isUpdateAvailable = compareSemver(latestVersion, currentNativeVersion) > 0;

      // Extract APK asset if available
      const apkAsset = Array.isArray(latest.assets)
        ? latest.assets.find(
            (a: any) => typeof a.name === 'string' && a.name.toLowerCase().endsWith('.apk')
          )
        : null;

      const downloadUrl =
        apkAsset?.browser_download_url ||
        latest.html_url ||
        'https://github.com/EklavyaAhuja/claimr/releases';

      const updateInfo: UpdateInfo = {
        version: latestVersion,
        name: latest.name || `Claimr v${latestVersion}`,
        body: latest.body || '',
        downloadUrl,
        releaseUrl: latest.html_url || 'https://github.com/EklavyaAhuja/claimr/releases',
        publishedAt: latest.published_at || latest.created_at || '',
        isUpdateAvailable,
        currentVersion: currentNativeVersion,
      };

      this.latestUpdateInfo = updateInfo;

      // Save cache
      try {
        await AsyncStorage.setItem(
          STORAGE_KEYS.CACHE,
          JSON.stringify({
            cachedAt: Date.now(),
            info: updateInfo,
          })
        );
      } catch {}

      this.notify();
      return updateInfo;
    } catch (err) {
      console.warn('[UpdateCheckerService] Update check failed:', err);
      return this.latestUpdateInfo;
    } finally {
      this.isChecking = false;
    }
  }
}

export const updateCheckerService = new UpdateCheckerService();
