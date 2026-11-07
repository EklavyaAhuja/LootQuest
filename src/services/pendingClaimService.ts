import AsyncStorage from '@react-native-async-storage/async-storage';
import { Deal } from '../models/Deal';
import { dealsStore } from './dealsStore';
import { cleanDisplayTitle } from '../utils/dealUtils';

export const PENDING_CLAIM_KEY = '@claimr_pending_claim';
export const LEGACY_PENDING_CLAIM_KEY = '@lootquest_pending_claim';
export const PENDING_CLAIM_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (was 24 hours)

export interface PendingClaimSnapshot {
  id: string;
  title: string;
  imageUrl?: string;
  store: string;
  retailValue?: string;
  isEstimated?: boolean;
  giveawayUrl?: string;
  storeUrl?: string;
  openedAt: number;
  is18Plus?: boolean;
}

// ─── Module-level Session Dismiss State ──────────────────────────────────────
// Resets to false on app cold start / JS restart
let isDismissedForSession = false;

export function isPendingRowDismissed(): boolean {
  return isDismissedForSession;
}

export function dismissPendingRowForSession(): void {
  isDismissedForSession = true;
  notifyListeners();
}

export function resetDismissForSession(): void {
  isDismissedForSession = false;
  notifyListeners();
}

// ─── Event Listeners ─────────────────────────────────────────────────────────
type PendingListener = (claims: PendingClaimSnapshot[]) => void;
const listeners = new Set<PendingListener>();

export function subscribePendingClaims(listener: PendingListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners(claims?: PendingClaimSnapshot[]) {
  if (claims) {
    listeners.forEach((l) => {
      try {
        l(claims);
      } catch (err) {
        console.warn('Pending claim listener error:', err);
      }
    });
  } else {
    getValidPendingClaims().then((c) => {
      listeners.forEach((l) => {
        try {
          l(c);
        } catch (err) {
          console.warn('Pending claim listener error:', err);
        }
      });
    });
  }
}

// ─── 18+ Visibility Helper ──────────────────────────────────────────────────
export function isDeal18PlusHidden(item: { id: string; is18Plus?: boolean }): boolean {
  if (!item.is18Plus) return false;
  return !dealsStore.is18PlusRevealed(item.id) && !dealsStore.getAlwaysShow18Plus();
}

// ─── Conversion to Deal for Vault Ingestion ─────────────────────────────────
export function pendingSnapshotToDeal(snapshot: PendingClaimSnapshot): Deal {
  return {
    id: snapshot.id,
    title: snapshot.title,
    image: snapshot.imageUrl || '',
    resolvedImage: snapshot.imageUrl,
    resolvedPoster: snapshot.imageUrl,
    platform: snapshot.store || 'PC',
    worth: snapshot.retailValue,
    originalPrice: snapshot.retailValue,
    isEstimated: snapshot.isEstimated,
    giveawayUrl: snapshot.giveawayUrl || '',
    storeUrl: snapshot.storeUrl || '',
    url: snapshot.giveawayUrl || snapshot.storeUrl || '',
    type: 'full_game',
    claimMethod: 'one_click',
    is18Plus: Boolean(snapshot.is18Plus),
  } as unknown as Deal;
}

// ─── Core CRUD Operations ────────────────────────────────────────────────────
/**
 * Loads pending claims from AsyncStorage, migrating legacy format,
 * expiring entries older than 7 days, and filtering out already claimed items.
 */
export async function getValidPendingClaims(): Promise<PendingClaimSnapshot[]> {
  try {
    let raw = await AsyncStorage.getItem(PENDING_CLAIM_KEY);
    if (!raw) {
      raw = await AsyncStorage.getItem(LEGACY_PENDING_CLAIM_KEY);
    }
    if (!raw) return [];

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      await AsyncStorage.removeItem(PENDING_CLAIM_KEY);
      return [];
    }

    const now = Date.now();
    const rawList: any[] = Array.isArray(parsed) ? parsed : [parsed];
    const validSnapshots: PendingClaimSnapshot[] = [];
    const seenIds = new Set<string>();

    for (const item of rawList) {
      if (!item || typeof item !== 'object') continue;

      let snapshot: PendingClaimSnapshot | null = null;

      // New format with full snapshot
      if (typeof item.id === 'string' && typeof item.title === 'string') {
        snapshot = {
          id: item.id,
          title: item.title,
          imageUrl: item.imageUrl || '',
          store: item.store || '',
          retailValue: item.retailValue,
          isEstimated: Boolean(item.isEstimated),
          giveawayUrl: item.giveawayUrl || '',
          storeUrl: item.storeUrl || '',
          openedAt: typeof item.openedAt === 'number' ? item.openedAt : now,
          is18Plus: Boolean(item.is18Plus),
        };
      } else if (typeof item.dealId === 'string') {
        // Legacy format: { dealId, openedAt }
        // Attempt to resolve deal from store
        const dealId = item.dealId;
        const deal =
          dealsStore.getActiveDeals().find((d) => d.id === dealId) ||
          dealsStore.getVaultItems('All').find((d) => d.id === dealId);

        if (deal) {
          snapshot = {
            id: deal.id,
            title: deal.title,
            imageUrl: deal.resolvedImage || deal.image || deal.resolvedPoster || '',
            store: (deal as any).store || deal.platform || '',
            retailValue: deal.worth || deal.originalPrice || undefined,
            isEstimated: deal.isEstimated,
            giveawayUrl: deal.giveawayUrl || deal.url || '',
            storeUrl: deal.storeUrl || deal.steamUrl || '',
            openedAt: typeof item.openedAt === 'number' ? item.openedAt : now,
            is18Plus: Boolean(deal.is18Plus),
          };
        } else {
          // If it cannot be resolved, drop the entry silently
          snapshot = null;
        }
      }

      if (!snapshot) continue;

      // Expire entries older than 7 days
      if (now - snapshot.openedAt >= PENDING_CLAIM_EXPIRY_MS) {
        continue;
      }

      // Drop if already claimed
      if (dealsStore.isClaimed(snapshot.id)) {
        continue;
      }

      // One entry per deal id
      if (seenIds.has(snapshot.id)) {
        continue;
      }
      seenIds.add(snapshot.id);
      validSnapshots.push(snapshot);
    }

    // Newest first
    validSnapshots.sort((a, b) => b.openedAt - a.openedAt);

    // Save back if migration or pruning changed content
    const serialized = JSON.stringify(validSnapshots);
    if (serialized !== raw) {
      await AsyncStorage.setItem(PENDING_CLAIM_KEY, serialized);
    }

    return validSnapshots;
  } catch (e) {
    console.warn('Failed to get valid pending claims:', e);
    return [];
  }
}

/**
 * Saves a pending claim snapshot for a deal.
 * One entry per deal id (reopening refreshes openedAt).
 * Already claimed games never create a pending entry.
 */
export async function savePendingClaim(deal: Deal, giveawayUrl?: string): Promise<void> {
  if (!deal || !deal.id) return;
  // Opening a giveaway for a game that is already claimed never creates a pending entry
  if (dealsStore.isClaimed(deal.id)) return;

  try {
    const currentList = await getValidPendingClaims();
    const filtered = currentList.filter((item) => item.id !== deal.id);

    const snapshot: PendingClaimSnapshot = {
      id: deal.id,
      title: deal.title,
      imageUrl: deal.resolvedImage || deal.image || deal.resolvedPoster || '',
      store: (deal as any).store || deal.platform || '',
      retailValue: deal.worth || deal.originalPrice || undefined,
      isEstimated: deal.isEstimated,
      giveawayUrl: giveawayUrl || deal.giveawayUrl || deal.url || '',
      storeUrl: deal.storeUrl || deal.steamUrl || '',
      openedAt: Date.now(),
      is18Plus: Boolean(deal.is18Plus),
    };

    const updated = [snapshot, ...filtered];
    await AsyncStorage.setItem(PENDING_CLAIM_KEY, JSON.stringify(updated));
    notifyListeners(updated);
  } catch (e) {
    console.warn('Failed to save pending claim:', e);
  }
}

/**
 * Removes a pending claim for a specific deal id.
 */
export async function removePendingClaim(dealId: string): Promise<void> {
  try {
    const currentList = await getValidPendingClaims();
    const updated = currentList.filter((item) => item.id !== dealId);
    await AsyncStorage.setItem(PENDING_CLAIM_KEY, JSON.stringify(updated));
    notifyListeners(updated);
  } catch (e) {
    console.warn('Failed to remove pending claim:', e);
  }
}

/**
 * Checks if a specific deal id has a valid pending claim.
 */
export async function hasValidPendingClaim(dealId: string): Promise<boolean> {
  const currentList = await getValidPendingClaims();
  return currentList.some((item) => item.id === dealId);
}

/**
 * Claims a pending deal using its snapshot.
 * Adds to Vault, updates totals and counts, and prevents duplicates.
 */
export async function claimPendingDeal(snapshot: PendingClaimSnapshot): Promise<void> {
  try {
    // Remove from pending first
    await removePendingClaim(snapshot.id);

    // Guard duplicate
    if (dealsStore.isClaimed(snapshot.id)) return;

    // Use live deal if still in feed for rich metadata, else reconstructed snapshot
    const liveDeal = dealsStore.getActiveDeals().find((d) => d.id === snapshot.id);
    const dealToClaim = liveDeal || pendingSnapshotToDeal(snapshot);

    await dealsStore.claimDeal(dealToClaim);
  } catch (e) {
    console.warn('Failed to claim pending deal:', e);
  }
}
