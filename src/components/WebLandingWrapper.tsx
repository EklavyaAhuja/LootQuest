import React from 'react';
import { View, StyleSheet, Platform, useWindowDimensions } from 'react-native';

interface WebLandingWrapperProps {
  children: React.ReactNode;
  onSwitchToDesktop?: () => void;
}

export default function WebLandingWrapper({ children, onSwitchToDesktop }: WebLandingWrapperProps) {
  const { width } = useWindowDimensions();

  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }

  const isPWAStandalone = typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );

  const isTouchPhone = typeof window !== 'undefined' && (
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches && width < 900) ||
    /Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  );

  // On real phones, PWA standalone, or mobile viewports (< 600px), fill 100% of the screen like native app
  if (width < 600 || isTouchPhone || isPWAStandalone) {
    return (
      <View style={styles.mobileContainer}>
        {children}
      </View>
    );
  }

  return (
    <div style={desktopBackdropStyle}>
      {/* Top Header Row above the Mobile Frame */}
      <div style={topBarStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '7px',
              background: '#EDEDEB',
              color: '#0A0A0C',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              font: "800 13px 'Unbounded', sans-serif",
            }}
          >
            C
          </div>
          <span style={{ font: "700 14px 'Plus Jakarta Sans', sans-serif", color: '#EDEDEB', letterSpacing: '-0.3px' }}>
            Claimr
          </span>
          <span
            style={{
              font: "600 11px 'JetBrains Mono', monospace",
              color: '#86868B',
              background: 'rgba(255, 255, 255, 0.06)',
              padding: '3px 8px',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            Mobile Preview
          </span>
        </div>

        {onSwitchToDesktop && (
          <button
            onClick={onSwitchToDesktop}
            style={backToDesktopBtnStyle}
            title="Switch back to wide desktop dashboard"
          >
            <span style={{ fontSize: '14px' }}>&larr;</span>
            <span>Back to Desktop Dashboard</span>
          </button>
        )}
      </div>

      {/* Clean Mobile Device Frame (No fake overlays, zero content obstruction) */}
      <div style={phoneChassisStyle}>
        <div style={phoneInnerScreenStyle}>
          {children}
        </div>
      </div>
    </div>
  );
}

const desktopBackdropStyle: React.CSSProperties = {
  width: '100vw',
  minHeight: '100vh',
  backgroundColor: '#07080B',
  backgroundImage: 'radial-gradient(ellipse at 50% 15%, #141724 0%, #06070A 70%)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '16px 20px 24px',
  boxSizing: 'border-box',
  overflowY: 'auto',
};

const topBarStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '430px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '14px',
};

const backToDesktopBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  background: 'rgba(255, 255, 255, 0.08)',
  color: '#EDEDEB',
  border: '1px solid rgba(255, 255, 255, 0.14)',
  borderRadius: '20px',
  padding: '7px 14px',
  font: "600 12.5px 'Plus Jakarta Sans', sans-serif",
  cursor: 'pointer',
  backdropFilter: 'blur(10px)',
  transition: 'background 0.15s ease, border-color 0.15s ease, transform 0.1s ease',
};

const phoneChassisStyle: React.CSSProperties = {
  width: '400px',
  maxWidth: '94vw',
  height: 'min(844px, calc(100vh - 80px))',
  borderRadius: '40px',
  border: '10px solid #1A1C24',
  outline: '1px solid rgba(255, 255, 255, 0.08)',
  boxShadow: '0 30px 80px -10px rgba(0, 0, 0, 0.95), 0 0 0 1px rgba(255, 255, 255, 0.05), inset 0 0 0 2px #0B0D12',
  position: 'relative',
  overflow: 'hidden',
  backgroundColor: '#000000',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
};

const phoneInnerScreenStyle: React.CSSProperties = {
  flex: 1,
  width: '100%',
  height: '100%',
  backgroundColor: '#000000',
  overflow: 'hidden',
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
};

const styles = StyleSheet.create({
  mobileContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
    alignSelf: 'center',
    maxWidth: 600,
  },
});
