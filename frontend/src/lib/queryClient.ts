import { MutationCache, QueryCache, QueryClient, onlineManager } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { NativeModules } from 'react-native';
import { clearSessionToken } from './auth';

// Lives outside app/_layout.tsx so sign-out can reach the persister. A route
// file shouldn't be carrying incidental exports, and without access to the
// persister `queryClient.clear()` alone leaves the previous user's snapshot on
// disk to rehydrate on the next launch.

// Offline persistence relies on the native AsyncStorage + NetInfo modules,
// which only exist after an EAS build that includes them. Statically importing
// them throws at module evaluation on an older dev client, so detect the native
// modules first and require them lazily — falling back to an in-memory client.
const offlineReady = Boolean(NativeModules.RNCAsyncStorage && NativeModules.RNCNetInfo);

function statusOf(error: unknown): number | undefined {
  return (error as { status?: number } | null | undefined)?.status;
}

/** A client error won't succeed on retry; a timeout or 5xx might. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  const status = statusOf(error);
  if (status !== undefined && status >= 400 && status < 500) return false;
  return failureCount < 2;
}

// A 401 means the session JWT is gone or expired. Previously only /auth/me
// reacted to that, so a 401 on any other endpoint left the user editing into a
// dead session with a stale token still in SecureStore. Handled here instead,
// once, for every query and mutation in the app.
//
// The latch matters: clearing the cache while the auth guard still has a live
// `useCurrentUser` observer makes React Query refetch immediately, which 401s
// again and clears again. Gating the query on this flag breaks that loop and
// lets the guard settle on "no user" and redirect.
let sessionExpired = false;

/** True once a 401 has retired the session; blocks further authed queries. */
export function isSessionExpired(): boolean {
  return sessionExpired;
}

/** Called after a successful sign-in so authed queries can run again. */
export function markSessionActive(): void {
  sessionExpired = false;
}

function onUnauthorized(): void {
  // A tab switch can fire several queries that all 401 together; act once.
  if (sessionExpired) return;
  sessionExpired = true;
  void (async () => {
    try {
      await clearSessionToken();
      await clearPersistedCache();
    } catch {
      /* best effort — the guard redirects off the missing user either way */
    }
  })();
}

function handleError(error: unknown): void {
  if (statusOf(error) === 401) onUnauthorized();
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleError }),
  mutationCache: new MutationCache({ onError: handleError }),
  defaultOptions: {
    queries: {
      // Workout data doesn't change second-to-second; serve cached data across
      // remounts/tab switches instead of refetching every time.
      staleTime: 60_000,
      // Long enough to survive an offline app restart (must exceed persist maxAge).
      gcTime: 24 * 60 * 60_000,
      refetchOnReconnect: true,
      retry: shouldRetry,
    },
    mutations: {
      // Queue writes made offline and fire them when connectivity returns.
      networkMode: 'offlineFirst',
      // Same predicate as queries: a 400 from a validation failure was
      // previously retried three times before the error ever reached the UI.
      retry: shouldRetry,
    },
  },
});

export let asyncPersister: ReturnType<typeof createAsyncStoragePersister> | null = null;

if (offlineReady) {
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
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

/**
 * Drop both the in-memory cache and the persisted snapshot. Called on sign-out
 * and account deletion: `clear()` alone races the persister's 1s throttled
 * write, so killing the app inside that window used to leave the previous
 * user's sessions on disk to rehydrate under the next account.
 */
export async function clearPersistedCache(): Promise<void> {
  queryClient.clear();
  await asyncPersister?.removeClient();
}
