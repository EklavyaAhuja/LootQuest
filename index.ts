import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then((reg) => {
        reg.update(); // Immediately check and fetch latest sw.js
        console.log('[PWA] Service Worker active with scope:', reg.scope);
      }).catch((err) => {
        console.warn('[PWA] Service Worker registration failed:', err);
      });
    });
  }

  // Inject PWA Manifest, Apple Web App meta tags, and touch icons dynamically if missing
  if (typeof document !== 'undefined') {
    // Inject Tailwind CSS CDN if not present
    if (!document.querySelector('script[src*="tailwindcss"]')) {
      const twScript = document.createElement('script');
      twScript.src = 'https://cdn.tailwindcss.com';
      document.head.appendChild(twScript);

      const twConfig = document.createElement('script');
      twConfig.innerHTML = `
        tailwind = window.tailwind || {};
        tailwind.config = {
          theme: {
            extend: {
              fontFamily: {
                sans: ['"Space Mono"', 'monospace'],
                serif: ['"Space Mono"', 'monospace'],
                mono: ['"Space Mono"', 'monospace'],
              }
            }
          }
        };
      `;
      document.head.appendChild(twConfig);
    }

    if (!document.querySelector('link[rel="manifest"]')) {
      const manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      manifestLink.href = '/manifest.json';
      document.head.appendChild(manifestLink);
    }
    
    // Apple Touch Icon
    if (!document.querySelector('link[rel="apple-touch-icon"]')) {
      const appleTouchIcon = document.createElement('link');
      appleTouchIcon.rel = 'apple-touch-icon';
      appleTouchIcon.href = '/Icon_Latest.png';
      document.head.appendChild(appleTouchIcon);
    }

    // Mobile Web App Capable (Standard & Apple)
    if (!document.querySelector('meta[name="mobile-web-app-capable"]')) {
      const metaMobileCapable = document.createElement('meta');
      metaMobileCapable.name = 'mobile-web-app-capable';
      metaMobileCapable.content = 'yes';
      document.head.appendChild(metaMobileCapable);
    }

    if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
      const metaCapable = document.createElement('meta');
      metaCapable.name = 'apple-mobile-web-app-capable';
      metaCapable.content = 'yes';
      document.head.appendChild(metaCapable);
    }

    // Apple Status Bar Style
    if (!document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')) {
      const metaStatus = document.createElement('meta');
      metaStatus.name = 'apple-mobile-web-app-status-bar-style';
      metaStatus.content = 'black-translucent';
      document.head.appendChild(metaStatus);
    }

    // Apple Web App Title
    if (!document.querySelector('meta[name="apple-mobile-web-app-title"]')) {
      const metaTitle = document.createElement('meta');
      metaTitle.name = 'apple-mobile-web-app-title';
      metaTitle.content = 'LootQuest';
      document.head.appendChild(metaTitle);
    }

    // Theme Color
    if (!document.querySelector('meta[name="theme-color"]')) {
      const metaTheme = document.createElement('meta');
      metaTheme.name = 'theme-color';
      metaTheme.content = '#0B0E14';
      document.head.appendChild(metaTheme);
    }
  }
}

try {
  // expo-insights activates automatically on import for EAS Insights analytics
  require('expo-insights');
} catch {
  // Not available in Expo Go
}

try {
  require('./src/services/notificationService');
} catch {
  // Notification service may fail in Expo Go due to missing native modules
}

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

