import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Slot } from 'expo-router';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

GoogleSignin.configure({
  webClientId: '255150095703-33en546bo9f3h3hsi0mqhgb70ipn5d6f.apps.googleusercontent.com',
  iosClientId: process.env.EXPO_PUBLIC_IOS_CLIENT_ID,
});

const queryClient = new QueryClient();

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <Slot />
    </QueryClientProvider>
  );
}
