import { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Glima',
  slug: 'glima',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'glima',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.glima.app',
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#ffffff',
    },
    package: 'com.glima.app',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    '@react-native-google-signin/google-signin',
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId: 'b063c786-7b63-44a1-8b52-ea32fa9d563c',
    },
  },
};

export default config;
