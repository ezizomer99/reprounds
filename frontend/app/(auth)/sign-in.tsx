import { StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { useEffect, useState } from 'react';
import { apiPost } from '../../src/lib/api';
import { setSessionToken } from '../../src/lib/auth';
import type { User } from '@app/shared';

// TODO: Replace with your Web OAuth client ID from Google Cloud Console.
// This is the Web client ID (not the Android client ID). Both Android and iOS
// use the web client ID for server-side token verification.
// Run `wrangler secret put GOOGLE_CLIENT_ID` with the same value on the backend.
const GOOGLE_WEB_CLIENT_ID = '255150095703-uf0tlp372qn00goiltejejibuoqq06ul.apps.googleusercontent.com';

interface AuthResponse {
  sessionToken: string;
  user: User;
}

GoogleSignin.configure({
  webClientId: GOOGLE_WEB_CLIENT_ID,
});

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

      router.replace('/(app)/');
    } catch (err) {
      setError('Sign-in failed. Please try again.');
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
