import { Platform } from 'react-native';

export const copyToClipboard = async (text: string): Promise<boolean> => {
  if (!text) return false;

  try {
    const ExpoClipboard = require('expo-clipboard');
    if (ExpoClipboard && typeof ExpoClipboard.setStringAsync === 'function') {
      await ExpoClipboard.setStringAsync(text);
      return true;
    }
    if (ExpoClipboard && typeof ExpoClipboard.setString === 'function') {
      ExpoClipboard.setString(text);
      return true;
    }
  } catch (e) {
    // Graceful fallback if expo-clipboard native binding is not loaded in current binary
  }

  // Web fallback
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
  }

  return false;
};
