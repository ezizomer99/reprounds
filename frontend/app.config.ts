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
      backgroundColor: '#C8F031',
    },
    // Android 16 (targetSdkVersion 36) enforces edge-to-edge and removes the
    // opt-out, so the app draws behind the system bars regardless. Enable Expo's
    // integration so that's handled correctly (transparent bars + inset shims)
    // instead of the OS forcing it with no support. The app already consumes
    // safe-area insets throughout (SafeAreaProvider in app/_layout.tsx).
    edgeToEdgeEnabled: true,
    package: 'com.reprounds.app',
    // EAS builds ignore this (appVersionSource: remote); self-hosted Gradle
    // builds inject a strictly increasing code via ANDROID_VERSION_CODE.
    versionCode: Number(process.env.ANDROID_VERSION_CODE) || 1,
    permissions: ['com.android.vending.BILLING'],
  },
  plugins: [
    // Google Play requires the target API level to stay within one year of the
    // latest Android release. Expo SDK 53 (RN 0.79) defaults to compile/target
    // SDK 35 (Android 15); Android 16 (API 36) is the current floor, so override
    // it here. Bumping the SDK itself would be the "blessed" path but drags in
    // RN 0.81 — this keeps the change surgical. `expo prebuild` reads these.
    [
      'expo-build-properties',
      {
        android: {
          compileSdkVersion: 36,
          targetSdkVersion: 36,
          buildToolsVersion: '36.0.0',
        },
      },
    ],
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
