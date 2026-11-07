const { withGradleProperties, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function setGradleProperty(modResults, key, value) {
  const existing = modResults.find(
    (item) => item.type === 'property' && item.key === key
  );
  if (existing) {
    existing.value = value;
  } else {
    modResults.push({
      type: 'property',
      key: key,
      value: value,
    });
  }
}

module.exports = function withOptimizedApk(config) {
  // 1. Configure gradle.properties for arm64-only, R8 minification, resource shrinking, and native lib compression
  config = withGradleProperties(config, (config) => {
    // Only build arm64-v8a binary slice
    setGradleProperty(config.modResults, 'reactNativeArchitectures', 'arm64-v8a');

    // Enable R8 code minification & dead code elimination in release builds
    setGradleProperty(config.modResults, 'android.enableMinifyInReleaseBuilds', 'true');

    // Enable resource shrinking to strip unused drawables and layouts
    setGradleProperty(config.modResults, 'android.enableShrinkResourcesInReleaseBuilds', 'true');

    // Compress native .so libraries inside the APK (shrinks 22MB .so down to ~9MB)
    setGradleProperty(config.modResults, 'expo.useLegacyPackaging', 'true');

    // Enable PNG crunching for maximum image compression
    setGradleProperty(config.modResults, 'android.enablePngCrunchInReleaseBuilds', 'true');

    return config;
  });

  // 2. Ensure proguard-rules.pro preserves critical reflection classes (Firebase, Reanimated, FlashList)
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const proguardPath = path.join(config.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      if (fs.existsSync(proguardPath)) {
        let content = fs.readFileSync(proguardPath, 'utf8');
        const customRules = `
# Claimr Proguard Optimization Rules
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**
-keep class com.shopify.reactnative.flash_list.** { *; }
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**
`;
        if (!content.includes('Claimr Proguard Optimization Rules')) {
          content += '\n' + customRules + '\n';
          fs.writeFileSync(proguardPath, content, 'utf8');
        }
      }
      return config;
    },
  ]);

  return config;
};
