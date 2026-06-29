import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import type { User } from '@app/shared';
import { apiGet, apiPost, apiDelete } from '../lib/api';
import {
  clearSessionToken,
  setSessionToken,
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
  return useQuery<User, Error>({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      try {
        const data = await apiGet<MeResponse>('/auth/me');
        return data.user;
      } catch (err) {
        const status = (err as Error & { status?: number }).status;
        if (status === 401) {
          await clearSessionToken();
        }
        throw err;
      }
    },
    retry: false,
  });
}

export type SignInError =
  | { kind: 'cancelled' }
  | { kind: 'in_progress' }
  | { kind: 'play_services' }
  | { kind: 'network'; message: string };

export function useSignIn() {
  const queryClient = useQueryClient();

  async function signInWithGoogle(): Promise<void> {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    await GoogleSignin.signIn();
    const { idToken } = await GoogleSignin.getTokens();
    if (!idToken) throw new Error('No ID token returned from Google');

    const guestUserId = await getGuestUserId();
    const data = await apiPost<AuthResponse>('/auth/google', { idToken, guestUserId });
    await setSessionToken(data.sessionToken);
    await clearGuestData();
    queryClient.setQueryData<User>(['auth', 'me'], data.user);
  }

  async function signInAsGuest(): Promise<void> {
    const deviceId = await getOrCreateDeviceId();
    const data = await apiPost<AuthResponse>('/auth/guest', { deviceId });
    await setSessionToken(data.sessionToken);
    await setGuestUserId(data.user.id);
    queryClient.setQueryData<User>(['auth', 'me'], data.user);
  }

  return { signInWithGoogle, signInAsGuest };
}

export function useSignOut() {
  const queryClient = useQueryClient();

  async function signOut(): Promise<void> {
    await clearSessionToken();
    try { await GoogleSignin.signOut(); } catch { /* ignore if not signed in via Google */ }
    queryClient.clear();
  }

  return { signOut };
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();

  // Permanently deletes the account server-side, then clears all local session
  // state — mirrors signOut so the device is left in a clean signed-out state.
  async function deleteAccount(): Promise<void> {
    await apiDelete('/auth/me');
    await clearSessionToken();
    await clearGuestData();
    try { await GoogleSignin.signOut(); } catch { /* ignore if not signed in via Google */ }
    queryClient.clear();
  }

  return { deleteAccount };
}
