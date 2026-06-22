import '../global.css';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { NativeModules } from 'react-native';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import {
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
} from '@expo-google-fonts/jetbrains-mono';
import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';
import { UnitProvider } from '../src/units/UnitContext';
import { SubscriptionProvider } from '../src/context/SubscriptionContext';
import { GOOGLE_WEB_CLIENT_ID } from '../src/lib/config';

GoogleSignin.configure({
  webClientId: GOOGLE_WEB_CLIENT_ID,
  iosClientId: process.env.EXPO_PUBLIC_IOS_CLIENT_ID,
});

// Offline persistence relies on the native AsyncStorage + NetInfo modules,
// which only exist after an EAS build that includes them. Statically importing
// them throws at module evaluation on an older dev client, so detect the native
// modules first and require them lazily — falling back to an in-memory client.
const offlineReady = Boolean(NativeModules.RNCAsyncStorage && NativeModules.RNCNetInfo);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Workout data doesn't change second-to-second; serve cached data across
      // remounts/tab switches instead of refetching every time.
      staleTime: 60_000,
      // Long enough to survive an offline app restart (must exceed persist maxAge).
      gcTime: 24 * 60 * 60_000,
      refetchOnReconnect: true,
      retry: (failureCount, error) => {
        // Don't retry client errors (auth/validation); they won't succeed on retry.
        const status = (error as { status?: number })?.status;
        if (status !== undefined && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      // Queue writes made offline and fire them when connectivity returns.
      networkMode: 'offlineFirst',
      retry: 2,
    },
  },
});

let asyncPersister: ReturnType<typeof createAsyncStoragePersister> | null = null;
if (offlineReady) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const NetInfo = require('@react-native-community/netinfo').default;
    // Drive React Query's online state from the device network status so
    // mutations pause while offline and resume on reconnect.
    onlineManager.setEventListener((setOnline) =>
      NetInfo.addEventListener((state: { isConnected: boolean | null }) =>
        setOnline(Boolean(state.isConnected)),
      ),
    );
    asyncPersister = createAsyncStoragePersister({ storage: AsyncStorage });
  } catch {
    asyncPersister = null;
  }
}

function AppShell() {
  const { isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Slot />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
    BricolageGrotesque_800ExtraBold,
  });

  if (!fontsLoaded) return null;

  const tree = (
    <ThemeProvider>
      <UnitProvider>
        <SubscriptionProvider>
          <AppShell />
        </SubscriptionProvider>
      </UnitProvider>
    </ThemeProvider>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {asyncPersister ? (
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister: asyncPersister, maxAge: 24 * 60 * 60_000 }}
          onSuccess={() => {
            // Replay any mutations that were paused while offline.
            void queryClient.resumePausedMutations();
          }}
        >
          {tree}
        </PersistQueryClientProvider>
      ) : (
        <QueryClientProvider client={queryClient}>{tree}</QueryClientProvider>
      )}
    </GestureHandlerRootView>
  );
}
