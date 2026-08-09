import '../global.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
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
import { Archivo_800ExtraBold } from '@expo-google-fonts/archivo';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';
import { UnitProvider } from '../src/units/UnitContext';
import { EffortProvider } from '../src/units/EffortContext';
import { NotificationsProvider } from '../src/notifications/NotificationsContext';
import { SubscriptionProvider } from '../src/context/SubscriptionContext';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { GOOGLE_WEB_CLIENT_ID } from '../src/lib/config';
import { asyncPersister, queryClient } from '../src/lib/queryClient';

GoogleSignin.configure({
  webClientId: GOOGLE_WEB_CLIENT_ID,
  iosClientId: process.env.EXPO_PUBLIC_IOS_CLIENT_ID,
});

function AppShell() {
  const { isDark } = useTheme();
  // The global rest-timer default moved into the workout screen (per-exercise);
  // clear the orphaned stored value.
  useEffect(() => {
    SecureStore.deleteItemAsync('rest_timer_default').catch(() => {});
  }, []);
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Slot />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
    BricolageGrotesque_800ExtraBold,
    Archivo_800ExtraBold,
  });

  // Render with system fonts if a font fails to load. Gating purely on
  // `fontsLoaded` meant any font error was a permanently blank app.
  if (!fontsLoaded && !fontError) return null;

  const tree = (
    <ThemeProvider>
      <ErrorBoundary>
        <UnitProvider>
          <EffortProvider>
            <NotificationsProvider>
              <SubscriptionProvider>
                <AppShell />
              </SubscriptionProvider>
            </NotificationsProvider>
          </EffortProvider>
        </UnitProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <BottomSheetModalProvider>
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
        </BottomSheetModalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
