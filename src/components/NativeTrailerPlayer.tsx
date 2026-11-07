import React, { useEffect } from 'react';
import { View, StyleSheet, Modal, Pressable, Text, Platform, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';
import { FONTS } from '../theme/theme';
import * as WebBrowser from 'expo-web-browser';

interface NativeTrailerPlayerProps {
  visible: boolean;
  videoUrl: string;
  onClose: () => void;
}

// Dynamically check if expo-video native module is linked in binary
let ExpoVideoModule: any = null;
try {
  ExpoVideoModule = require('expo-video');
} catch {
  ExpoVideoModule = null;
}

function InAppPlayer({ videoUrl, onClose }: { videoUrl: string; onClose: () => void }) {
  const { useVideoPlayer, VideoView } = ExpoVideoModule;
  const player = useVideoPlayer(
    videoUrl,
    (p: any) => {
      p.loop = true;
      p.play();
    },
    {
      seekBackwardIncrement: 5,
      seekForwardIncrement: 5,
    }
  );

  useEffect(() => {
    let isMounted = true;
    async function lockLandscape() {
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } catch (e) {
        console.warn('Failed to lock orientation to landscape:', e);
      }
    }
    lockLandscape();

    return () => {
      isMounted = false;
      try {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      } catch (e) {
        console.warn('Failed to restore orientation to portrait:', e);
      }
    };
  }, []);

  useEffect(() => {
    if (player) {
      player.play();
    }
    return () => {
      try {
        if (player) player.pause();
      } catch {}
    };
  }, [player]);

  const handleClose = async () => {
    try {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    } catch {}
    onClose();
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden={false} barStyle="light-content" translucent={true} backgroundColor="transparent" />
      <View style={styles.header} pointerEvents="box-none">
        <Text style={styles.title}>OFFICIAL TRAILER</Text>
        <Pressable
          onPress={handleClose}
          style={styles.closeBtn}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close trailer"
        >
          <Ionicons name="close" size={24} color="#EDEDEB" />
        </Pressable>
      </View>
      <View style={styles.videoWrapper}>
        <VideoView
          style={styles.video}
          player={player}
          nativeControls={true}
          allowsFullscreen={true}
          allowsPictureInPicture={true}
          contentFit="contain"
        />
      </View>
    </View>
  );
}

export default function NativeTrailerPlayer({ visible, videoUrl, onClose }: NativeTrailerPlayerProps) {
  if (!visible || !videoUrl) return null;

  const handleClose = async () => {
    try {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    } catch {}
    onClose();
  };

  // If expo-video is available in the compiled native binary, use full native hardware player
  if (ExpoVideoModule && typeof ExpoVideoModule.useVideoPlayer === 'function' && ExpoVideoModule.VideoView) {
    return (
      <Modal
        visible={visible}
        animationType="fade"
        transparent={false}
        statusBarTranslucent={true}
        onRequestClose={handleClose}
      >
        <InAppPlayer videoUrl={videoUrl} onClose={handleClose} />
      </Modal>
    );
  }

  // Fallback for web or environments where native module is not yet compiled
  return null;
}

export async function openTrailerWithFallback(videoUrl: string, onOpenNativeModal?: () => void) {
  if (!videoUrl) return;

  if (ExpoVideoModule && typeof ExpoVideoModule.useVideoPlayer === 'function' && ExpoVideoModule.VideoView && onOpenNativeModal) {
    onOpenNativeModal();
    return;
  }

  try {
    await WebBrowser.openBrowserAsync(videoUrl, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      toolbarColor: '#000000',
      secondaryToolbarColor: '#000000',
    });
  } catch (err) {
    console.warn('[TrailerPlayer] WebBrowser fallback failed:', err);
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    position: 'absolute',
    top: 16,
    left: 24,
    right: 24,
    zIndex: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: 'rgba(237, 237, 235, 0.75)',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoWrapper: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
});
