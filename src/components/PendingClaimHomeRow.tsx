import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Modal,
  FlatList,
  Platform,
  AppState,
  AppStateStatus,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ContainedModal } from './ContainedModal';
import { COLORS, FONTS, RADIUS } from '../theme/theme';
import {
  PendingClaimSnapshot,
  getValidPendingClaims,
  removePendingClaim,
  claimPendingDeal,
  isPendingRowDismissed,
  dismissPendingRowForSession,
  subscribePendingClaims,
  isDeal18PlusHidden,
} from '../services/pendingClaimService';
import { cleanDisplayTitle } from '../utils/dealUtils';
import { useSafeAreaInsets } from '../utils/useSafeAreaInsets';

interface PendingClaimHomeRowProps {
  onClaimed?: () => void;
}

export default function PendingClaimHomeRow({ onClaimed }: PendingClaimHomeRowProps) {
  const insets = useSafeAreaInsets();
  const [claims, setClaims] = useState<PendingClaimSnapshot[]>([]);
  const [isDismissed, setIsDismissed] = useState(() => isPendingRowDismissed());
  const [sheetVisible, setSheetVisible] = useState(false);

  const loadClaims = useCallback(async () => {
    try {
      const all = await getValidPendingClaims();
      // Filter out 18+ hidden deals (Item 5)
      const visible = all.filter((c) => !isDeal18PlusHidden(c));
      setClaims(visible);
      setIsDismissed(isPendingRowDismissed());
    } catch (e) {
      console.warn('Failed to refresh pending claims:', e);
    }
  }, []);

  useEffect(() => {
    // Load on mount (app start)
    loadClaims();

    // Foreground listener
    const appStateSub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        loadClaims();
      }
    });

    // Web visibilitychange listener
    let onVisibilityChange: (() => void) | null = null;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      onVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          loadClaims();
        }
      };
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    // Subscribe to pending claim service updates
    const unsub = subscribePendingClaims((updated) => {
      const visible = updated.filter((c) => !isDeal18PlusHidden(c));
      setClaims(visible);
      setIsDismissed(isPendingRowDismissed());
    });

    return () => {
      appStateSub.remove();
      if (onVisibilityChange && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      unsub();
    };
  }, [loadClaims]);

  // If dismissed for this session or no valid visible claims, hide row
  if (isDismissed || claims.length === 0) {
    return null;
  }

  const newest = claims[0];
  const extraCount = claims.length - 1;

  const handleYes = async (item: PendingClaimSnapshot) => {
    await claimPendingDeal(item);
    onClaimed?.();
  };

  const handleNo = async (item: PendingClaimSnapshot) => {
    await removePendingClaim(item.id);
  };

  const handleDismiss = () => {
    dismissPendingRowForSession();
    setIsDismissed(true);
  };

  return (
    <>
      {/* Spacious, premium card banner at top of Home */}
      <View style={styles.cardWrapper}>
        <View style={styles.cardHeader}>
          <View style={styles.promptBadgeRow}>
            <Ionicons name="gift-outline" size={14} color="#EDEDEB" style={{ marginRight: 6 }} />
            <Text style={styles.cardPromptLabel}>DID YOU CLAIM THIS?</Text>
            {extraCount > 0 && (
              <Pressable
                onPress={() => setSheetVisible(true)}
                hitSlop={8}
                style={styles.morePressable}
                accessibilityRole="button"
                accessibilityLabel={`${extraCount} more pending claims`}
              >
                <Text style={styles.moreText}>+{extraCount} more</Text>
              </Pressable>
            )}
          </View>

          {/* Dismiss button (clean 48x48 touch target area) */}
          <Pressable
            onPress={handleDismiss}
            style={({ pressed }) => [styles.dismissButton, pressed && styles.dismissButtonPressed]}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel="Dismiss reminder until next app start"
          >
            <Ionicons name="close" size={18} color="#86868B" />
          </Pressable>
        </View>

        {/* Game Title */}
        <Text style={styles.gameTitleText} numberOfLines={2}>
          {cleanDisplayTitle(newest.title)}
        </Text>

        {/* Buttons Row with clear separation and generous touch targets */}
        <View style={styles.cardActionsRow}>
          <Pressable
            onPress={() => handleNo(newest)}
            style={({ pressed }) => [styles.actionButtonNo, pressed && styles.actionButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel={`No, did not claim ${newest.title}`}
          >
            <Text style={styles.noText}>No, not yet</Text>
          </Pressable>

          <Pressable
            onPress={() => handleYes(newest)}
            style={({ pressed }) => [styles.actionButtonYes, pressed && styles.actionButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel={`Yes, claim ${newest.title}`}
          >
            <Ionicons name="checkmark" size={16} color="#000000" style={{ marginRight: 6 }} />
            <Text style={styles.yesText}>Yes, add to Vault</Text>
          </Pressable>
        </View>
      </View>

      {/* Sheet for multiple pending claims */}
      {extraCount > 0 && (
        <ContainedModal
          visible={sheetVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setSheetVisible(false)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setSheetVisible(false)}>
            <Pressable
              style={[
                styles.sheetContent,
                { paddingBottom: Math.max(insets.bottom, 28) },
              ]}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetTitle}>Pending Claims</Text>
                  <Text style={styles.sheetSubtitle}>Did you claim these games?</Text>
                </View>
                <Pressable
                  onPress={() => setSheetVisible(false)}
                  style={styles.sheetCloseBtn}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Close pending claims sheet"
                >
                  <Ionicons name="close" size={20} color={COLORS.muted} />
                </Pressable>
              </View>

              <FlatList
                data={claims}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                style={styles.sheetList}
                renderItem={({ item }) => (
                  <View style={styles.sheetItemRow}>
                    <View style={styles.sheetItemInfo}>
                      <Text style={styles.sheetItemTitle} numberOfLines={2}>
                        {cleanDisplayTitle(item.title)}
                      </Text>
                      {Boolean(item.store) && (
                        <Text style={styles.sheetItemStore}>{item.store}</Text>
                      )}
                    </View>

                    <View style={styles.sheetItemActions}>
                      <Pressable
                        onPress={() => handleNo(item)}
                        style={({ pressed }) => [
                          styles.sheetItemBtn,
                          styles.sheetItemNoBtn,
                          pressed && styles.actionButtonPressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`No, did not claim ${item.title}`}
                      >
                        <Text style={styles.noText}>No</Text>
                      </Pressable>

                      <Pressable
                        onPress={() => handleYes(item)}
                        style={({ pressed }) => [
                          styles.sheetItemBtn,
                          styles.sheetItemYesBtn,
                          pressed && styles.actionButtonPressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Yes, claim ${item.title}`}
                      >
                        <Text style={styles.yesText}>Yes</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              />
            </Pressable>
          </Pressable>
        </ContainedModal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    backgroundColor: '#121214',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 6,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    minHeight: 120,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  promptBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  cardPromptLabel: {
    color: '#86868B',
    fontSize: 11,
    fontFamily: FONTS.mono,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  morePressable: {
    marginLeft: 8,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  moreText: {
    color: '#EDEDEB',
    fontSize: 11,
    fontFamily: FONTS.regular,
  },
  dismissButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  dismissButtonPressed: {
    opacity: 0.6,
  },
  gameTitleText: {
    color: '#EDEDEB',
    fontSize: 15,
    fontFamily: FONTS.medium,
    lineHeight: 21,
    marginBottom: 14,
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionButtonNo: {
    flex: 1,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonYes: {
    flex: 1.3,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#EDEDEB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonPressed: {
    opacity: 0.7,
  },
  yesText: {
    color: '#000000',
    fontSize: 13,
    fontFamily: FONTS.bold,
  },
  noText: {
    color: '#86868B',
    fontSize: 13,
    fontFamily: FONTS.medium,
  },

  // Sheet styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheetContent: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: '#121214',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderColor: '#1C1C1E',
    paddingHorizontal: 18,
    paddingTop: 8,
    maxHeight: '75%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#2C2C2E',
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sheetTitle: {
    color: '#EDEDEB',
    fontSize: 18,
    fontFamily: FONTS.bold,
  },
  sheetSubtitle: {
    color: '#86868B',
    fontSize: 13,
    fontFamily: FONTS.regular,
    marginTop: 2,
  },
  sheetCloseBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetList: {
    marginBottom: 8,
  },
  sheetItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1C1C1E',
  },
  sheetItemInfo: {
    flex: 1,
    marginRight: 14,
  },
  sheetItemTitle: {
    color: '#EDEDEB',
    fontSize: 14,
    fontFamily: FONTS.medium,
  },
  sheetItemStore: {
    color: '#86868B',
    fontSize: 11,
    fontFamily: FONTS.monoRegular || FONTS.regular,
    marginTop: 3,
    textTransform: 'uppercase',
  },
  sheetItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sheetItemBtn: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  sheetItemNoBtn: {
    backgroundColor: 'transparent',
    borderColor: '#2C2C2E',
  },
  sheetItemYesBtn: {
    backgroundColor: 'rgba(237, 237, 235, 0.12)',
    borderColor: '#3A3A3D',
  },
});
