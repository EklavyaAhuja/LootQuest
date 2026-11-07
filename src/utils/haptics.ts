import * as Haptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

export const hapticFeedback = {
  light: () => {
    try {
      if (Platform.OS === 'web') return;
      if (Haptics && typeof Haptics.impactAsync === 'function' && Haptics.ImpactFeedbackStyle?.Light) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
          if (Platform.OS === 'android') Vibration.vibrate(10);
        });
        return;
      }
      if (Platform.OS === 'android') Vibration.vibrate(10);
    } catch {}
  },
  medium: () => {
    try {
      if (Platform.OS === 'web') return;
      if (Haptics && typeof Haptics.impactAsync === 'function' && Haptics.ImpactFeedbackStyle?.Medium) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {
          if (Platform.OS === 'android') Vibration.vibrate(20);
        });
        return;
      }
      if (Platform.OS === 'android') Vibration.vibrate(20);
    } catch {}
  },
  heavy: () => {
    try {
      if (Platform.OS === 'web') return;
      if (Haptics && typeof Haptics.impactAsync === 'function' && Haptics.ImpactFeedbackStyle?.Heavy) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {
          if (Platform.OS === 'android') Vibration.vibrate(40);
        });
        return;
      }
      if (Platform.OS === 'android') Vibration.vibrate(40);
    } catch {}
  },
  selection: () => {
    try {
      if (Platform.OS === 'web') return;
      if (Haptics && typeof Haptics.selectionAsync === 'function') {
        Haptics.selectionAsync().catch(() => {
          if (Platform.OS === 'android') Vibration.vibrate(8);
        });
        return;
      }
      if (Platform.OS === 'android') Vibration.vibrate(8);
    } catch {}
  },
  success: () => {
    try {
      if (Platform.OS === 'web') return;
      if (Haptics && typeof Haptics.notificationAsync === 'function' && Haptics.NotificationFeedbackType?.Success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {
          if (Platform.OS === 'android') Vibration.vibrate([0, 15, 60, 25]);
        });
        return;
      }
      if (Platform.OS === 'android') Vibration.vibrate([0, 15, 60, 25]);
    } catch {}
  },
  warning: () => {
    try {
      if (Platform.OS === 'web') return;
      if (Haptics && typeof Haptics.notificationAsync === 'function' && Haptics.NotificationFeedbackType?.Warning) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {
          if (Platform.OS === 'android') Vibration.vibrate([0, 20, 50, 35]);
        });
        return;
      }
      if (Platform.OS === 'android') Vibration.vibrate([0, 20, 50, 35]);
    } catch {}
  },
};

