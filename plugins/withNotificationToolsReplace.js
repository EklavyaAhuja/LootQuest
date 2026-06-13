const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withNotificationToolsReplace(config) {
  return withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults;
    
    // Ensure the tools namespace is added to the manifest tag
    if (!androidManifest.manifest.$['xmlns:tools']) {
      androidManifest.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    const application = androidManifest.manifest.application[0];

    // Check if meta-data exists and find default_notification_color
    if (application && application['meta-data']) {
      const colorMetadata = application['meta-data'].find(
        (item) => item.$['android:name'] === 'com.google.firebase.messaging.default_notification_color'
      );
      if (colorMetadata) {
        colorMetadata.$['tools:replace'] = 'android:resource';
      }

      // Also handle default_notification_channel_id if present
      const channelMetadata = application['meta-data'].find(
        (item) => item.$['android:name'] === 'com.google.firebase.messaging.default_notification_channel_id'
      );
      if (channelMetadata) {
        channelMetadata.$['tools:replace'] = 'android:value';
      }
    }

    return config;
  });
};
