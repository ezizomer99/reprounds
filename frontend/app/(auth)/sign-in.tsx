import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { statusCodes } from '@react-native-google-signin/google-signin';
import { useState, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RepRoundsLockup } from '../../src/components/RepRoundsLockup';
import { useSignIn } from '../../src/hooks/useAuth';
import { F, R, ThemeColors } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeContext';

export default function SignInScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { T, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { signInWithGoogle, signInAsGuest } = useSignIn();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLoading = googleLoading || guestLoading;

  async function handleGoogle() {
    setGoogleLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
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
        setError(`Sign-in failed: ${e.message ?? 'unknown error'}`);
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleGuest() {
    setGuestLoading(true);
    setError(null);
    try {
      await signInAsGuest();
      router.replace('/(app)');
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(`Could not continue as guest: ${e.message ?? 'unknown error'}`);
    } finally {
      setGuestLoading(false);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.lockup}>
        <RepRoundsLockup size="lg" onDark={isDark} />
        <Text style={styles.tagline}>Strength · Rounds · One Log</Text>
      </View>

      <View style={styles.bottom}>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.googleBtn, isLoading && styles.btnDisabled]}
          onPress={handleGoogle}
          disabled={isLoading}
          activeOpacity={0.75}
        >
          {googleLoading ? (
            <ActivityIndicator color={T.text} />
          ) : (
            <Text style={styles.googleBtnText}>Continue with Google</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.guestBtn, isLoading && styles.btnDisabled]}
          onPress={handleGuest}
          disabled={isLoading}
          activeOpacity={0.75}
        >
          {guestLoading ? (
            <ActivityIndicator color={T.textDim} />
          ) : (
            <Text style={styles.guestBtnText}>Continue as Guest</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.guestDisclaimer}>
          Guest data is saved to this device only. Sign in with Google to protect your history across devices.
        </Text>
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
      gap: 20,
    },
    tagline: {
      fontFamily: F.mono,
      fontSize: 11,
      color: '#A29B90',
      letterSpacing: 2.4,
      textTransform: 'uppercase',
    },
    bottom: {
      width: '100%',
      gap: 10,
    },
    error: {
      fontFamily: F.ui,
      fontSize: 14,
      color: T.danger,
      textAlign: 'center',
    },
    btnDisabled: { opacity: 0.5 },
    googleBtn: {
      height: 54,
      backgroundColor: T.surface,
      borderWidth: 1,
      borderColor: T.borderStrong,
      borderRadius: R.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    googleBtnText: {
      fontFamily: F.uiSemi,
      fontSize: 16,
      color: T.text,
      letterSpacing: -0.2,
    },
    guestBtn: {
      height: 46,
      borderRadius: R.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    guestBtnText: {
      fontFamily: F.uiMed,
      fontSize: 15,
      color: T.textDim,
    },
    guestDisclaimer: {
      fontFamily: F.uiMed,
      fontSize: 11,
      color: T.muted,
      textAlign: 'center',
      lineHeight: 16,
      paddingHorizontal: 8,
    },
  });
}
