import React from 'react';
import { StyleSheet, View, Text, Modal, Pressable } from 'react-native';
import { COLORS, FONTS, RADIUS } from '../theme/theme';
import { dealsStore } from '../services/dealsStore';

interface Gate18PlusModalProps {
  visible: boolean;
  dealId?: string;
  onClose: () => void;
  onRevealed?: () => void;
}

export default function Gate18PlusModal({
  visible,
  dealId,
  onClose,
  onRevealed,
}: Gate18PlusModalProps) {
  if (!visible) return null;

  const handleShowOnce = () => {
    if (dealId) {
      dealsStore.reveal18PlusDeal(dealId);
    }
    onClose();
    onRevealed?.();
  };

  const handleAlwaysShow = async () => {
    await dealsStore.setAlwaysShow18Plus(true);
    onClose();
    onRevealed?.();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.dialog} onPress={(e) => e.stopPropagation()}>
          <View style={styles.tagRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>18+ MATURE CONTENT</Text>
            </View>
          </View>

          <Text style={styles.title}>Content & Age Warning</Text>
          <Text style={styles.subtext}>
            This title is rated 18+ / Mature and may contain graphic violence, suggestive themes, mature language, or adult content. Do you want to view this game?
          </Text>

          <View style={styles.actions}>
            {/* Show */}
            <Pressable onPress={handleShowOnce} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>Yes, Show Game</Text>
            </Pressable>

            {/* Always show 18+ games */}
            <Pressable onPress={handleAlwaysShow} style={styles.secondaryBtn}>
              <Text style={styles.secondaryBtnText}>Always show 18+ content</Text>
            </Pressable>

            {/* Not now / Go back */}
            <Pressable onPress={onClose} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>No, Go Back</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#0F0F10',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#262629',
    padding: 22,
    alignItems: 'center',
  },
  tagRow: {
    marginBottom: 12,
  },
  badge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.xs,
    borderWidth: 0.5,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  badgeText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: '#F87171',
    letterSpacing: 0.5,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 17,
    color: '#EDEDEB',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  subtext: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    lineHeight: 18,
    color: '#86868B',
    textAlign: 'center',
    marginBottom: 20,
  },
  actions: {
    width: '100%',
    gap: 8,
  },
  primaryBtn: {
    width: '100%',
    backgroundColor: '#EDEDEB',
    paddingVertical: 12,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: '#000000',
  },
  secondaryBtn: {
    width: '100%',
    backgroundColor: 'transparent',
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: '#333336',
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: '#EDEDEB',
  },
  cancelBtn: {
    width: '100%',
    paddingVertical: 8,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: '#86868B',
  },
});
