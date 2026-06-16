import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { useState, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiPost } from '../../src/lib/api';
import { setSessionToken } from '../../src/lib/auth';
import { GlimaMark } from '../../src/components/GlimaMark';
import { F, R, ThemeColors } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeContext';
import type { User } from '@app/shared';

interface AuthResponse {
  sessionToken: string;
  user: User;
}

export default function SignInScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
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
    <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.lockup}>
        <GlimaMark size={72} color={T.text} />
        <View style={styles.rule} />
        <Text style={styles.wordmark}>GLIMA</Text>
        <Text style={styles.tagline}>Martial Arts & Workout Tracker</Text>
      </View>

      <View style={styles.bottom}>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.googleBtn, loading && styles.googleBtnDisabled]}
          onPress={handleSignIn}
          disabled={loading}
          activeOpacity={0.75}
        >
          {loading ? (
            <ActivityIndicator color={T.text} />
          ) : (
            <Text style={styles.googleBtnText}>Continue with Google</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: T.bg,
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 32,
    },
    lockup: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
    },
    rule: {
      width: 32,
      height: 1,
      backgroundColor: T.text,
      opacity: 0.18,
    },
    wordmark: {
      fontFamily: F.wordmark,
      fontSize: 52,
      color: T.text,
      letterSpacing: 12,
      paddingLeft: 12,
    },
    tagline: {
      fontFamily: F.uiMed,
      fontSize: 12,
      color: T.textDim,
      letterSpacing: 3,
      textTransform: 'uppercase',
      paddingLeft: 3,
    },
    bottom: {
      width: '100%',
      gap: 12,
    },
    error: {
      fontFamily: F.ui,
      fontSize: 14,
      color: T.danger,
      textAlign: 'center',
    },
    googleBtn: {
      height: 54,
      backgroundColor: T.surface,
      borderWidth: 1,
      borderColor: T.borderStrong,
      borderRadius: R.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    googleBtnDisabled: {
      opacity: 0.5,
    },
    googleBtnText: {
      fontFamily: F.uiSemi,
      fontSize: 16,
      color: T.text,
      letterSpacing: -0.2,
    },
  });
}
