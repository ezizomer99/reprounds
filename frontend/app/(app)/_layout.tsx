import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useIsRestoring } from '@tanstack/react-query';
import { View, ActivityIndicator } from 'react-native';
import { useCurrentUser } from '../../src/hooks/useAuth';
import { InlineError } from '../../src/components/InlineError';
import { isSessionExpired } from '../../src/lib/queryClient';

export default function AppLayout() {
  const router = useRouter();
  // PersistQueryClientProvider renders children while the AsyncStorage snapshot
  // is still being read, and queries don't fetch during that window — so
  // `useCurrentUser` briefly reports "no user, not loading". Without this check
  // the guard kicked a perfectly signed-in user to sign-in before the cache had
  // even been read.
  const isRestoring = useIsRestoring();
  const { data: user, isLoading, isError, isPaused, refetch } = useCurrentUser();

  // Set by the central 401 handler in src/lib/queryClient.ts. A dead session is
  // the one error that *should* sign the user out; everything else shouldn't.
  const expired = isSessionExpired();
  const settled = !isRestoring && !isLoading;
  // Offline with nothing cached: the request is paused, not failed. Treat it
  // like a failure for display purposes — but never as a reason to sign out,
  // since the token may be perfectly valid.
  const unreachable = isError || isPaused;

  useEffect(() => {
    // Redirect only when we know there is no session: it expired, or the
    // request came back clean with nothing. A transient failure while a cached
    // user is in hand must NOT sign anyone out — that turned every offline
    // cold start into a forced sign-in.
    if (expired || (settled && !user && !unreachable)) {
      router.replace('/(auth)/sign-in');
    }
  }, [expired, settled, user, unreachable, router]);

  if (expired) {
    return null;
  }

  if (!settled) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // Couldn't reach the API and have nothing cached — offer a retry rather than
  // pretending the user is signed out.
  if (!user && unreachable) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <InlineError
          message="Couldn't reach RepRounds. Check your connection and try again."
          onRetry={() => void refetch()}
        />
      </View>
    );
  }

  if (!user) {
    return null;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
