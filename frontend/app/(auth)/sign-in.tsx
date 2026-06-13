import { StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { useState } from 'react';
import { apiPost } from '../../src/lib/api';
import { setSessionToken } from '../../src/lib/auth';
import type { User } from '@app/shared';

interface AuthResponse {
  sessionToken: string;
  user: User;
}

export default function SignInScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setLoading(true);
    setError(null);

    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      await GoogleSignin.signIn();
      const { idToken } = await GoogleSignin.getTokens();
      if (!idToken) throw new Error('No ID token returned from Google');

      const data = await apiPost<AuthResponse>('/auth/google', { idToken });
      await setSessionToken(data.sessionToken);

      router.replace('/(app)');
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e.code === statusCodes.SIGN_IN_CANCELLED) {
        setError(null);
      } else if (e.code === statusCodes.IN_PROGRESS) {
        setError('Sign-in already in progress.');
      } else if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        setError('Google Play Services not available.');
      } else {
        console.error('[SignIn] error code:', e.code, 'message:', e.message);
        setError(`Sign-in failed: ${e.message ?? 'unknown error'}`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Glima</Text>
      <Text style={styles.subtitle}>Track your training</Text>

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        style={styles.button}
        onPress={handleSignIn}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign in with Google</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 40,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 48,
  },
  error: {
    color: '#c00',
    marginBottom: 16,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#1a73e8',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
    minWidth: 220,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
