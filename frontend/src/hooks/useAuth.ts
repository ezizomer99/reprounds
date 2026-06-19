import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import type { User } from '@app/shared';
import { apiGet, apiPost } from '../lib/api';
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
    queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
  }

  async function signInAsGuest(): Promise<void> {
    const deviceId = await getOrCreateDeviceId();
    const data = await apiPost<AuthResponse>('/auth/guest', { deviceId });
    await setSessionToken(data.sessionToken);
    await setGuestUserId(data.user.id);
    queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
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
