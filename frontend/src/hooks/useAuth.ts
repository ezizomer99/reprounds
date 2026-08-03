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
    queryClient.setQueryData<User>(['auth', 'me'], data.user);
  }

  async function signInAsGuest(): Promise<void> {
    const deviceId = await getOrCreateDeviceId();
    const data = await apiPost<AuthResponse>('/auth/guest', { deviceId });
    await setSessionToken(data.sessionToken);
    await setGuestUserId(data.user.id);
    markSessionActive();
    queryClient.setQueryData<User>(['auth', 'me'], data.user);
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
    queryClient.setQueryData<User>(['auth', 'me'], data.user);
  }

  async function signInWithEmail(email: string, password: string): Promise<void> {
    const guestToken = await getGuestToken();
    const data = await apiPost<AuthResponse>('/auth/login', { email, password, guestToken });
    await setSessionToken(data.sessionToken);
    await clearGuestData();
    markSessionActive();
    queryClient.setQueryData<User>(['auth', 'me'], data.user);
  }

  return { signInWithGoogle, signInAsGuest, registerWithEmail, signInWithEmail };
}

export function useSignOut() {
  // Note: deliberately does NOT call clearGuestData(). This same function backs
  // the "Exit Guest Mode" button in settings, and dropping the deviceId would
  // mint a brand-new guest user on the next sign-in — permanently orphaning
  // that guest's entire training history.
  async function signOut(): Promise<void> {
    await clearSessionToken();
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
    try { await GoogleSignin.signOut(); } catch { /* ignore if not signed in via Google */ }
    await clearPersistedCache();
  }

  return { deleteAccount };
}

export function useChangePassword() {
  return useMutation<void, Error, { currentPassword: string; newPassword: string }>({
    mutationFn: (body) => apiPatch<void>('/auth/password', body),
  });
}
