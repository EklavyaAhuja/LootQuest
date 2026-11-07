module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Reanimated 4 / react-native-worklets: must be the LAST plugin.
      // The reanimated/plugin shim re-exports worklets/plugin; using worklets/plugin
      // directly avoids potential double-instrumentation on RN 0.86 New Architecture.
      'react-native-worklets/plugin',
    ],
  };
};
