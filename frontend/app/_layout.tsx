import '../global.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

GoogleSignin.configure({
  webClientId: '255150095703-33en546bo9f3h3hsi0mqhgb70ipn5d6f.apps.googleusercontent.com',
  iosClientId: process.env.EXPO_PUBLIC_IOS_CLIENT_ID,
});

const queryClient = new QueryClient();

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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AppShell />
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
