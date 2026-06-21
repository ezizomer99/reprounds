import { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'RepRounds',
  slug: 'reprounds',
  owner: 'omerdigital',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'reprounds',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.reprounds.app',
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#0d0f14',
    },
    package: 'com.reprounds.app',
    versionCode: 1,
    permissions: ['com.android.vending.BILLING'],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-notifications',
    '@react-native-google-signin/google-signin',
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId: '5fcf4e98-ac49-4e12-b47b-73fb59f868a9',
    },
  },
};

export default config;
