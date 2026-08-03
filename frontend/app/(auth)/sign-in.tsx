import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { NAME_MAX_LENGTH } from '@app/shared';
import { statusCodes } from '@react-native-google-signin/google-signin';
import { useState, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RepRoundsLockup } from '../../src/components/RepRoundsLockup';
import { useSignIn } from '../../src/hooks/useAuth';
import { F, R, ThemeColors } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeContext';

type EmailMode = 'signIn' | 'register';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export default function SignInScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { T, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { signInWithGoogle, signInAsGuest, registerWithEmail, signInWithEmail } = useSignIn();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Email/password form state
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailMode, setEmailMode] = useState<EmailMode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);

  const isLoading = googleLoading || guestLoading || emailLoading;

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
        const status = (e as { status?: number }).status;
        setError(`Sign-in failed${status ? ` (${status})` : ''}: ${e.message ?? 'unknown error'}`);
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
      const e = err as { message?: string; status?: number };
      setError(`Guest sign-in failed${e.status ? ` (${e.status})` : ''}: ${e.message ?? 'unknown error'}`);
    } finally {
      setGuestLoading(false);
    }
  }

  function validateEmailForm(): string | null {
    if (!EMAIL_RE.test(email.trim())) return 'Enter a valid email address';
    if (password.length < MIN_PASSWORD_LENGTH) {
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    }
    return null;
  }

  async function handleEmailSubmit() {
    setError(null);
    const validation = validateEmailForm();
    if (validation) {
      setFieldError(validation);
      return;
    }
    setFieldError(null);
    setEmailLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      if (emailMode === 'register') {
        await registerWithEmail(cleanEmail, password, name);
      } else {
        await signInWithEmail(cleanEmail, password);
      }
      router.replace('/(app)');
    } catch (err: unknown) {
      const e = err as { message?: string; status?: number };
      setFieldError(e.message ?? 'Something went wrong. Please try again.');
    } finally {
      setEmailLoading(false);
    }
  }

  function toggleEmailMode() {
    setEmailMode((m) => (m === 'signIn' ? 'register' : 'signIn'));
    setFieldError(null);
  }

  const submitLabel = emailMode === 'signIn' ? 'Sign in' : 'Create account';

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
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

          {showEmailForm ? (
            <View style={styles.emailForm}>
              {emailMode === 'register' ? (
                <TextInput
                  style={styles.input}
                  placeholder="Name (optional)"
                  placeholderTextColor={T.muted}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  maxLength={NAME_MAX_LENGTH}
                  editable={!isLoading}
                  returnKeyType="next"
                />
              ) : null}

              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={T.muted}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                editable={!isLoading}
                returnKeyType="next"
              />

              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={T.muted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete={emailMode === 'register' ? 'new-password' : 'current-password'}
                textContentType={emailMode === 'register' ? 'newPassword' : 'password'}
                editable={!isLoading}
                returnKeyType="go"
                onSubmitEditing={handleEmailSubmit}
              />

              {fieldError ? <Text style={styles.error}>{fieldError}</Text> : null}

              <TouchableOpacity
                style={[styles.emailSubmitBtn, isLoading && styles.btnDisabled]}
                onPress={handleEmailSubmit}
                disabled={isLoading}
                activeOpacity={0.85}
              >
                {emailLoading ? (
                  <ActivityIndicator color={T.onPrimary} />
                ) : (
                  <Text style={styles.emailSubmitText}>{submitLabel}</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={toggleEmailMode} disabled={isLoading} activeOpacity={0.7}>
                <Text style={styles.toggleText}>
                  {emailMode === 'signIn'
                    ? "Don't have an account? Create one"
                    : 'Already have an account? Sign in'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.emailToggleBtn, isLoading && styles.btnDisabled]}
              onPress={() => {
                setShowEmailForm(true);
                setError(null);
              }}
              disabled={isLoading}
              activeOpacity={0.75}
            >
              <Text style={styles.emailToggleText}>Continue with email</Text>
            </TouchableOpacity>
          )}

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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    flex: {
      flex: 1,
      backgroundColor: T.bg,
    },
    container: {
      flexGrow: 1,
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
      minHeight: 220,
    },
    tagline: {
      fontFamily: F.mono,
      fontSize: 11,
      color: '#9DA29B',
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
    emailToggleBtn: {
      height: 46,
      borderRadius: R.sm,
      borderWidth: 1,
      borderColor: T.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emailToggleText: {
      fontFamily: F.uiMed,
      fontSize: 15,
      color: T.textDim,
    },
    emailForm: {
      width: '100%',
      gap: 10,
      paddingTop: 2,
    },
    input: {
      height: 50,
      backgroundColor: T.surface,
      borderWidth: 1,
      borderColor: T.border,
      borderRadius: R.sm,
      paddingHorizontal: 14,
      fontFamily: F.ui,
      fontSize: 15,
      color: T.text,
    },
    emailSubmitBtn: {
      height: 50,
      backgroundColor: T.primary,
      borderRadius: R.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emailSubmitText: {
      fontFamily: F.uiSemi,
      fontSize: 16,
      color: T.onPrimary,
      letterSpacing: -0.2,
    },
    toggleText: {
      fontFamily: F.uiMed,
      fontSize: 13,
      color: T.textDim,
      textAlign: 'center',
      paddingVertical: 4,
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
