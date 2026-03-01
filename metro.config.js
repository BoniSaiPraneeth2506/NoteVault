const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// In Expo Go (development), expo-screen-capture's native module is not bundled.
// Alias it to a no-op shim so Metro can bundle without errors.
// EAS builds set NODE_ENV=production (see eas.json), so they get the real module.
if (process.env.NODE_ENV !== 'production') {
  config.resolver.extraNodeModules = {
    ...config.resolver.extraNodeModules,
    'expo-screen-capture': path.resolve(__dirname, 'src/utils/screenCaptureShim.js'),
  };
}

module.exports = config;
