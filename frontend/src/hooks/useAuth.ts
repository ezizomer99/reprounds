import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import type { User } from '@app/shared';
import { apiGet, apiPost, apiPatch, apiDelete } from '../lib/api';
import { clearPersistedCache, isSessionExpired, markSessionActive } from '../lib/queryClient';
import {
  clearSessionToken,
  setSessionToken,
  getDeviceId,
  getOrCreateDeviceId,
  getGuestUserId,
  setGuestUserId,
  clearGuestData,
} from '../lib/auth';
import { cancelScheduledByKind } from '../lib/notifications';
import { clearActiveRest } from '../lib/restTimerStore';
import { clearCachedEntitlement } from '../lib/entitlementCache';

interface MeResponse {
  user: User;
}

interface AuthResponse {
  sessionToken: string;
  user: User;
}

export function useCurrentUser() {
  // 401 handling lives in the shared QueryCache onError (src/lib/queryClient.ts)
  // so it applies to every endpoint, not just this one. Retry is left to the
  // global predicate too, which already refuses to retry 4xx — the old
  // `retry: false` meant one flaky network blip signed the user out.
  //
  // `enabled` stops this from re-firing (and re-401ing) after the session has
  // been retired; the guard then settles on "no user" and redirects.
  return useQuery<User, Error>({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const data = await apiGet<MeResponse>('/auth/me');
      return data.user;
    },
    enabled: !isSessionExpired(),
  });
}

export type SignInError =
  | { kind: 'cancelled' }
  | { kind: 'in_progress' }
  | { kind: 'play_services' }
  | { kind: 'network'; message: string };

// The server migrates guest data only on proof of possession: it wants the
// guest session's JWT, not a bare user id. Re-mint a fresh guest token from
// the stored deviceId so an expired guest session can't strand the data.
async function getGuestToken(): Promise<string | null> {
  const guestUserId = await getGuestUserId();
  if (!guestUserId) return null;
  const deviceId = await getDeviceId();
  if (!deviceId) return null;
  const data = await apiPost<AuthResponse>('/auth/guest', { deviceId });
  return data.sessionToken;
}

export function useSignIn() {
  const queryClient = useQueryClient();

  /**
   * Adopt a new session's data.
   *
   * Every sign-in path set the token and overwrote `['auth', 'me']` but left
   * every other cached query untouched. Query keys carry no user id, so after a
   * guest merged into an account that already had history, the cache still held
   * only the guest's rows — the merged sessions, routines and stats didn't
   * appear until each query happened to go stale.
   *
   * `invalidateQueries` rather than `clear()`: clearing drops the mutation
   * cache too, and mutations queued offline are replayed by
   * `resumePausedMutations()` on reconnect.
   */
  function adoptSession(user: User) {
    queryClient.setQueryData<User>(['auth', 'me'], user);
    void queryClient.invalidateQueries();
  }

  async function signInWithGoogle(): Promise<void> {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    await GoogleSignin.signIn();
    const { idToken } = await GoogleSignin.getTokens();
    if (!idToken) throw new Error('No ID token returned from Google');

    const guestToken = await getGuestToken();
    const data = await apiPost<AuthResponse>('/auth/google', { idToken, guestToken });
    await setSessionToken(data.sessionToken);
    await clearGuestData();
    markSessionActive();
    adoptSession(data.user);
  }

  async function signInAsGuest(): Promise<void> {
    const deviceId = await getOrCreateDeviceId();
    const data = await apiPost<AuthResponse>('/auth/guest', { deviceId });
    await setSessionToken(data.sessionToken);
    await setGuestUserId(data.user.id);
    markSessionActive();
    adoptSession(data.user);
  }

  async function registerWithEmail(email: string, password: string, name?: string): Promise<void> {
    const guestToken = await getGuestToken();
    const data = await apiPost<AuthResponse>('/auth/register', {
      email,
      password,
      name: name && name.trim() ? name.trim() : null,
      guestToken,
    });
    await setSessionToken(data.sessionToken);
    await clearGuestData();
    markSessionActive();
    adoptSession(data.user);
  }

  async function signInWithEmail(email: string, password: string): Promise<void> {
    const guestToken = await getGuestToken();
    const data = await apiPost<AuthResponse>('/auth/login', { email, password, guestToken });
    await setSessionToken(data.sessionToken);
    await clearGuestData();
    markSessionActive();
    adoptSession(data.user);
  }

  return { signInWithGoogle, signInAsGuest, registerWithEmail, signInWithEmail };
}

/**
 * Local state that outlives a signed-in session unless it is torn down
 * explicitly: the in-memory rest countdown and the OS notification armed
 * alongside it.
 *
 * The rest timer is deliberately built to survive leaving the session screen —
 * the notification is scheduled against the wall clock so it fires with the app
 * backgrounded or killed. Signing out never cancelled it, so the phone went on
 * to ding "Rest complete" for an account no longer signed in.
 */
async function clearLocalTimers(): Promise<void> {
  clearActiveRest();
  await cancelScheduledByKind('rest');
}

export function useSignOut() {
  // Note: deliberately does NOT call clearGuestData(). This same function backs
  // the "Exit Guest Mode" button in settings, and dropping the deviceId would
  // mint a brand-new guest user on the next sign-in — permanently orphaning
  // that guest's entire training history.
  async function signOut(): Promise<void> {
    await clearSessionToken();
    await clearLocalTimers();
    // The remembered Pro answer is per-account. Detaching the RevenueCat
    // customer normally overwrites it, but that call is best-effort and
    // swallows its errors — so a sign-out while offline would leave this
    // account's entitlement cached for whoever signs in next.
    await clearCachedEntitlement();
    try { await GoogleSignin.signOut(); } catch { /* ignore if not signed in via Google */ }
    await clearPersistedCache();
  }

  return { signOut };
}

export function useDeleteAccount() {
  // Permanently deletes the account server-side, then clears all local session
  // state — mirrors signOut so the device is left in a clean signed-out state.
  async function deleteAccount(): Promise<void> {
    await apiDelete('/auth/me');
    await clearSessionToken();
    await clearGuestData();
    await clearLocalTimers();
    await clearCachedEntitlement();
    try { await GoogleSignin.signOut(); } catch { /* ignore if not signed in via Google */ }
    await clearPersistedCache();
  }

  return { deleteAccount };
}

/**
 * Sets a password as well as changes one. `currentPassword` is omitted when the
 * account doesn't have one yet — a Google account gaining a credential
 * fallback, where the session itself is the proof.
 */
export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { currentPassword?: string; newPassword: string }>({
    mutationFn: (body) => apiPatch<void>('/auth/password', body),
    // `hasPassword` flips on the first set, and it's what decides whether the
    // settings row says "Change password" or "Set a password".
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });
}

/** Update the profile fields the user owns. Currently just the display name. */
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation<User, Error, { name: string | null }>({
    mutationFn: async (body) => {
      const data = await apiPatch<MeResponse>('/auth/me', body);
      return data.user;
    },
    onSuccess: (user) => {
      queryClient.setQueryData<User>(['auth', 'me'], user);
    },
  });
}
