module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['./node_modules/react-native-gesture-handler/jestSetup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(@react-native|react-native|@react-native-community|@react-navigation|react-navigation|react-native-screens|react-native-safe-area-context|react-native-gesture-handler|react-native-bootsplash|react-native-keychain|@notifee|react-native-webview|@react-native-cookies|react-native-reanimated)/)',
  ],
};
