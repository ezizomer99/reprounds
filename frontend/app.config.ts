import { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'RepRounds',
  slug: 'reprounds',
  owner: 'omerdigital',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'reprounds',
  userInterfaceStyle: 'automatic',
  icon: './assets/images/icon.png',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.reprounds.app',
    icon: './assets/images/icon.png',
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/images/icon-fg.png',
      backgroundColor: '#D8432A',
    },
    package: 'com.reprounds.app',
    // EAS builds ignore this (appVersionSource: remote); self-hosted Gradle
    // builds inject a strictly increasing code via ANDROID_VERSION_CODE.
    versionCode: Number(process.env.ANDROID_VERSION_CODE) || 1,
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
