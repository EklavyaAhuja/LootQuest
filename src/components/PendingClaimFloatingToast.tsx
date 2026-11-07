import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Animated,
  Easing,
  Modal,
  FlatList,
  Vibration,
  Platform,
  AppState,
  AppStateStatus,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ContainedModal } from './ContainedModal';
import { hapticFeedback } from '../utils/haptics';
import { COLORS, FONTS, RADIUS } from '../theme/theme';
import {
  PendingClaimSnapshot,
  getValidPendingClaims,
  removePendingClaim,
  claimPendingDeal,
  subscribePendingClaims,
  isDeal18PlusHidden,
  pendingSnapshotToDeal,
} from '../services/pendingClaimService';
import { cleanDisplayTitle } from '../utils/dealUtils';
import { useSafeAreaInsets, SafeAreaProvider } from '../utils/useSafeAreaInsets';
import { dealsStore } from '../services/dealsStore';
import { Deal } from '../models/Deal';

interface PendingClaimFloatingToastProps {
  onOpenDeal: (deal: Deal) => void;
  isDetailOpen?: boolean;
}

function PendingClaimFloatingToast({ onOpenDeal, isDetailOpen }: PendingClaimFloatingToastProps) {
  const insets = useSafeAreaInsets();
  const [claims, setClaims] = useState<PendingClaimSnapshot[]>([]);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const translateY = useRef(new Animated.Value(-140)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const autoHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(() => {
    setIsVisible(true);
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: 220,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto-hides after 10 s if untouched
    if (autoHideTimer.current) clearTimeout(autoHideTimer.current);
    autoHideTimer.current = setTimeout(() => {
      hideToast();
    }, 10000);
  }, []);

  const hideToast = useCallback(() => {
    if (autoHideTimer.current) clearTimeout(autoHideTimer.current);
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -140,
        duration: 220,
        easing: Easing.bezier(0.32, 0.72, 0, 1),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsVisible(false);
    });
  }, []);

  const loadClaims = useCallback(async () => {
    try {
      const all = await getValidPendingClaims();
      const visible = all.filter((c) => !isDeal18PlusHidden(c));
      setClaims(visible);
      if (visible.length > 0 && !isDetailOpen) {
        showToast();
      } else {
        hideToast();
      }
    } catch (e) {
      console.warn('Failed to refresh pending claims:', e);
    }
  }, [isDetailOpen, showToast, hideToast]);

  useEffect(() => {
    loadClaims();

    const appStateSub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        loadClaims();
      }
    });

    const unsub = subscribePendingClaims((updated) => {
      const visible = updated.filter((c) => !isDeal18PlusHidden(c));
      setClaims(visible);
      if (visible.length > 0 && !isDetailOpen) {
        showToast();
      } else {
        hideToast();
      }
    });

    return () => {
      appStateSub.remove();
      unsub();
      if (autoHideTimer.current) clearTimeout(autoHideTimer.current);
    };
  }, [loadClaims, isDetailOpen, showToast, hideToast]);

  const handleYes = async (item: PendingClaimSnapshot) => {
    hapticFeedback.success();
    await claimPendingDeal(item);
    if (claims.length <= 1) {
      setSheetVisible(false);
      hideToast();
    }
  };

  const handleNo = async (item: PendingClaimSnapshot) => {
    await removePendingClaim(item.id);
    if (claims.length <= 1) {
      setSheetVisible(false);
      hideToast();
    }
  };

  const handleView = (item: PendingClaimSnapshot) => {
    const existing = dealsStore.getDealById(item.id) || pendingSnapshotToDeal(item);
    hideToast();
    setSheetVisible(false);
    onOpenDeal(existing);
  };

  if (!isVisible || claims.length === 0 || isDetailOpen) {
    return null;
  }

  const newest = claims[0];
  const isMulti = claims.length > 1;

  return (
    <>
      <Animated.View
        style={[
          styles.toastContainer,
          {
            top: insets.top + 8,
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >
        {isMulti ? (
          <Pressable
            onPress={() => setSheetVisible(true)}
            style={styles.multiContent}
            accessibilityRole="button"
            accessibilityLabel={`${claims.length} games waiting, tap to review`}
          >
            <View style={styles.multiRow}>
              <Text style={styles.multiTitle} numberOfLines={1}>
                {claims.length} games waiting · tap to review
              </Text>
              <Ionicons name="chevron-forward" size={18} color="#86868B" />
            </View>
          </Pressable>
        ) : (
          <View style={styles.singleContent}>
            {/* Row 1: Did you claim <title>? */}
            <Text style={styles.titleText} numberOfLines={2}>
              Did you claim {cleanDisplayTitle(newest.title)}?
            </Text>

            {/* Row 2: three actions: Yes, Not yet, View */}
            <View style={styles.actionsRow}>
              <Pressable
                onPress={() => handleYes(newest)}
                hitSlop={6}
                style={({ pressed }) => [styles.actionBtn, styles.actionBtnYes, pressed && styles.actionBtnPressed]}
                accessibilityRole="button"
                accessibilityLabel="Yes, add to vault"
              >
                <Text style={styles.actionYesText}>Yes, add</Text>
              </Pressable>

              <Pressable
                onPress={() => handleNo(newest)}
                hitSlop={6}
                style={({ pressed }) => [styles.actionBtn, styles.actionBtnNo, pressed && styles.actionBtnPressed]}
                accessibilityRole="button"
                accessibilityLabel="Not yet"
              >
                <Text style={styles.actionNoText}>Not yet</Text>
              </Pressable>

              <Pressable
                onPress={() => handleView(newest)}
                hitSlop={6}
                style={({ pressed }) => [styles.actionBtn, styles.actionBtnView, pressed && styles.actionBtnPressed]}
                accessibilityRole="button"
                accessibilityLabel="View deal"
              >
                <Text style={styles.actionViewText}>View</Text>
              </Pressable>
            </View>
          </View>
        )}
      </Animated.View>

      {/* Multi-item Review Bottom Sheet */}
      <ContainedModal
        visible={sheetVisible}
        transparent={true}
        statusBarTranslucent={true}
        navigationBarTranslucent={true}
        animationType="fade"
        onRequestClose={() => setSheetVisible(false)}
      >
        <SafeAreaProvider>
          <Pressable
            style={[
              styles.sheetOverlay,
              {
                paddingBottom: Math.max(insets.bottom, 56) + 24,
              },
            ]}
            onPress={() => setSheetVisible(false)}
          >
            <Pressable
              style={styles.sheetContent}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Pending Claims</Text>
                <Pressable onPress={() => setSheetVisible(false)} hitSlop={8}>
                  <Ionicons name="close" size={20} color="#86868B" />
                </Pressable>
              </View>

              <FlatList
                data={claims}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <View style={styles.sheetItemRow}>
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text style={styles.sheetItemTitle} numberOfLines={1}>
                        {cleanDisplayTitle(item.title)}
                      </Text>
                      <Text style={styles.sheetItemStore}>{item.store || 'Store'}</Text>
                    </View>

                    <View style={styles.sheetItemActions}>
                      <Pressable
                        onPress={() => handleYes(item)}
                        style={styles.sheetActionPill}
                        accessibilityRole="button"
                        accessibilityLabel="Yes"
                      >
                        <Text style={styles.sheetActionPillTextYes}>Yes</Text>
                      </Pressable>

                      <Pressable
                        onPress={() => handleNo(item)}
                        style={styles.sheetActionPill}
                        accessibilityRole="button"
                        accessibilityLabel="No"
                      >
                        <Text style={styles.sheetActionPillTextNo}>No</Text>
                      </Pressable>

                      <Pressable
                        onPress={() => handleView(item)}
                        style={styles.sheetActionPill}
                        accessibilityRole="button"
                        accessibilityLabel="View"
                      >
                        <Text style={styles.sheetActionPillTextView}>View</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              />
            </Pressable>
          </Pressable>
        </SafeAreaProvider>
      </ContainedModal>
    </>
  );
}

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    minHeight: 76,
    borderRadius: 14,
    backgroundColor: '#161618',
    borderWidth: 1,
    borderColor: '#2C2C2E',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    justifyContent: 'center',
    zIndex: 9990,
    elevation: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  singleContent: {
    width: '100%',
    justifyContent: 'center',
  },
  titleText: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: '#EDEDEB',
    marginBottom: 10,
    lineHeight: 20,
    letterSpacing: -0.3,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    minHeight: 32,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnYes: {
    backgroundColor: '#EDEDEB',
  },
  actionBtnNo: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  actionBtnView: {
    backgroundColor: 'transparent',
    paddingHorizontal: 8,
  },
  actionBtnPressed: {
    opacity: 0.6,
  },
  actionYesText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: '#000000',
  },
  actionNoText: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    fontWeight: '600',
    color: '#86868B',
  },
  actionViewText: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    fontWeight: '600',
    color: '#38BDF8',
  },
  multiContent: {
    flex: 1,
    justifyContent: 'center',
  },
  multiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  multiTitle: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: '#EDEDEB',
    letterSpacing: -0.3,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  sheetContent: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: '#121214',
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    maxHeight: 400,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 24,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3A3A3C',
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
    fontFamily: FONTS.extraBold,
    fontSize: 20,
    color: '#EDEDEB',
    letterSpacing: -0.4,
  },
  sheetItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  sheetItemTitle: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: '#EDEDEB',
    marginBottom: 2,
    letterSpacing: -0.3,
  },
  sheetItemStore: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    color: '#86868B',
    textTransform: 'uppercase',
  },
  sheetItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sheetActionPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  sheetActionPillTextYes: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    fontWeight: '700',
    color: '#EDEDEB',
  },
  sheetActionPillTextNo: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: '#86868B',
  },
  sheetActionPillTextView: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: '#38BDF8',
  },
});

export default React.memo(PendingClaimFloatingToast);
