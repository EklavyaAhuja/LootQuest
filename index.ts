import { registerRootComponent } from 'expo';
// expo-insights activates automatically on import for EAS Insights analytics
import 'expo-insights';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
