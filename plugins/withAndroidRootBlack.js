let withAndroidStyles;
try {
  withAndroidStyles = require('expo/config-plugins').withAndroidStyles;
} catch {
  withAndroidStyles = require('@expo/config-plugins').withAndroidStyles;
}

module.exports = function withAndroidRootBlack(config) {
  return withAndroidStyles(config, (config) => {
    const styles = config.modResults;
    if (styles && styles.resources && styles.resources.style) {
      const appTheme = styles.resources.style.find(
        (s) => s.$ && (s.$.name === 'AppTheme' || s.$.name === 'Theme.App.SplashScreen')
      );
      if (appTheme && Array.isArray(appTheme.item)) {
        const setItem = (name, value) => {
          const item = appTheme.item.find((i) => i.$ && i.$.name === name);
          if (item) {
            item._ = value;
          } else {
            appTheme.item.push({ $: { name }, _: value });
          }
        };

        setItem('android:windowBackground', '@android:color/black');
        setItem('android:colorBackground', '@android:color/black');
        setItem('android:statusBarColor', '@android:color/transparent');
        setItem('android:navigationBarColor', '@android:color/black');
        setItem('android:windowLightStatusBar', 'false');
        setItem('android:windowLightNavigationBar', 'false');
        setItem('android:enforceNavigationBarContrast', 'false');
      }
    }
    return config;
  });
};
