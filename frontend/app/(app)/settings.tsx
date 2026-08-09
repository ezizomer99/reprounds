import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  useCurrentUser,
  useSignOut,
  useDeleteAccount,
  useChangePassword,
  useUpdateProfile,
} from '../../src/hooks/useAuth';
import { NAME_MAX_LENGTH } from '@app/shared';
import { Touchable } from '../../src/components/ui';
import { F, R, D, ThemeColors } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeContext';
import { useUnit } from '../../src/units/UnitContext';
import { useEffortMetric, type EffortMetric } from '../../src/units/EffortContext';
import { useNotificationsEnabled } from '../../src/notifications/NotificationsContext';
import { withAlpha } from '../../src/lib/color';
import type { WeightUnit } from '../../src/units/units';

type ThemeMode = 'dark' | 'light' | 'system';

const MODES: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const UNITS: { value: WeightUnit; label: string }[] = [
  { value: 'kg', label: 'Kilograms' },
  { value: 'lbs', label: 'Pounds' },
];

// Two ways of recording the same thing (RIR ≈ 10 − RPE), so the set row shows
// one intensity cell and this picks which.
const EFFORT_METRICS: { value: EffortMetric; label: string }[] = [
  { value: 'rpe', label: 'RPE' },
  { value: 'rir', label: 'RIR' },
];

export default function SettingsScreen() {
  const { T, mode, setMode } = useTheme();
  const { unit, setUnit } = useUnit();
  const { metric, setMetric } = useEffortMetric();
  const { notificationsEnabled, setNotificationsEnabled } = useNotificationsEnabled();
  const styles = useMemo(() => makeStyles(T), [T]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const { signOut } = useSignOut();
  const { deleteAccount } = useDeleteAccount();
  const [deleting, setDeleting] = useState(false);
  const [showChangePw, setShowChangePw] = useState(false);
  const [showEditName, setShowEditName] = useState(false);

  const isGuest = user?.isGuest ?? false;
  const displayName = isGuest
    ? 'Guest Account'
    : (user?.name ?? user?.email ?? 'Member');
  const displaySub = isGuest ? 'No data synced' : (user?.email ?? 'Member');

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
          } catch {
            // Unguarded, a SecureStore failure here became an unhandled
            // rejection and the redirect below still ran — leaving the user on
            // the sign-in screen with a live token still on disk.
            Alert.alert(
              'Sign out failed',
              "Couldn't clear your session on this device. Please try again.",
            );
            return;
          }
          router.replace('/(auth)/sign-in' as never);
        },
      },
    ]);
  }

  function handleSendFeedback() {
    const subject = encodeURIComponent('RepRounds Feedback');
    const body = encodeURIComponent("Hi,\n\nI'd like to share the following feedback or feature request:\n\n");
    void Linking.openURL(`mailto:oemerdigital@gmail.com?subject=${subject}&body=${body}`);
  }

  function handleDeleteAccount() {
    Alert.alert(
      'Delete account',
      'This permanently deletes your account and all your workouts, sessions, body weight, and training data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              'Are you absolutely sure?',
              'All of your data will be permanently erased. This action is irreversible.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete account',
                  style: 'destructive',
                  onPress: async () => {
                    setDeleting(true);
                    try {
                      await deleteAccount();
                      queryClient.clear();
                      router.replace('/(auth)/sign-in' as never);
                    } catch (err) {
                      // Was a fixed string, so a 401, a 500 and a dropped
                      // connection all read the same and none of them said
                      // whether anything had been deleted.
                      Alert.alert(
                        'Delete failed',
                        (err as Error).message ||
                          'Could not delete your account. Please try again.',
                      );
                    } finally {
                      setDeleting(false);
                    }
                  },
                },
              ],
            ),
        },
      ],
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Touchable
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={T.text} />
        </Touchable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Account */}
        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.card}>
          <View style={styles.avatarRow}>
            <View style={styles.avatarCircle}>
              <Ionicons
                name={isGuest ? 'person-outline' : 'person'}
                size={22}
                color={T.textDim}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.accountName} numberOfLines={1}>{displayName}</Text>
              {!isGuest && (
                <Text style={styles.accountSub} numberOfLines={1}>{displaySub}</Text>
              )}
              {isGuest && (
                <Text style={styles.accountSub}>{displaySub}</Text>
              )}
            </View>
          </View>
          {/* A guest has no account to edit yet; everyone else can rename. */}
          {!isGuest && (
            <Touchable
              style={styles.accountActionRow}
              onPress={() => setShowEditName(true)}
              accessibilityLabel="Edit display name"
              feedback="row"
            >
              <Ionicons name="person-outline" size={17} color={T.textDim} />
              <Text style={styles.rowLabel}>Display name</Text>
              <Ionicons name="chevron-forward" size={16} color={T.muted} style={{ marginLeft: 'auto' }} />
            </Touchable>
          )}
          {/* Offered to any non-guest, not just accounts that already have a
              password: a Google user otherwise had no credential fallback if
              they lost access to that Google account. */}
          {!isGuest && (
            <Touchable
              style={styles.accountActionRow}
              onPress={() => setShowChangePw(true)}
              accessibilityLabel={user?.hasPassword ? 'Change password' : 'Set a password'}
              feedback="row"
            >
              <Ionicons name="key-outline" size={17} color={T.textDim} />
              <Text style={styles.rowLabel}>
                {user?.hasPassword ? 'Change password' : 'Set a password'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={T.muted} style={{ marginLeft: 'auto' }} />
            </Touchable>
          )}
        </View>

        {/* Appearance */}
        <Text style={styles.sectionLabel}>Appearance</Text>
        <View style={styles.card}>
          <Text style={styles.rowLabel}>Theme</Text>
          <View style={styles.segmentRow}>
            {MODES.map(({ value, label }) => {
              const active = mode === value;
              return (
                <Touchable
                  key={value}
                  style={[styles.segment, active && styles.segmentActive]}
                  onPress={() => setMode(value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={label}
                  feedback="card"
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {label}
                  </Text>
                </Touchable>
              );
            })}
          </View>
        </View>

        {/* Units */}
        <Text style={styles.sectionLabel}>Units</Text>
        <View style={styles.card}>
          <Text style={styles.rowLabel}>Weight</Text>
          <View style={styles.segmentRow}>
            {UNITS.map(({ value, label }) => {
              const active = unit === value;
              return (
                <Touchable
                  key={value}
                  style={[styles.segment, active && styles.segmentActive]}
                  onPress={() => setUnit(value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={label}
                  feedback="card"
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {label}
                  </Text>
                </Touchable>
              );
            })}
          </View>
        </View>

        {/* Logging */}
        <Text style={styles.sectionLabel}>Logging</Text>
        <View style={styles.card}>
          <Text style={styles.rowLabel}>Set intensity</Text>
          <View style={styles.segmentRow}>
            {EFFORT_METRICS.map(({ value, label }) => {
              const active = metric === value;
              return (
                <Touchable
                  key={value}
                  style={[styles.segment, active && styles.segmentActive]}
                  onPress={() => setMetric(value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={label}
                  feedback="card"
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {label}
                  </Text>
                </Touchable>
              );
            })}
          </View>
          <Text style={styles.rowHint}>
            {metric === 'rir'
              ? 'Reps in reserve — how many you had left in the tank.'
              : 'Rate of perceived exertion, 1–10.'}
          </Text>
        </View>

        {/* Notifications */}
        <Text style={styles.sectionLabel}>Notifications</Text>
        <View style={styles.card}>
          <View style={styles.switchRow}>
            <Text style={styles.rowLabel}>Push Notifications</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={(v) => void setNotificationsEnabled(v)}
              trackColor={{ false: T.surface2, true: T.primary }}
              thumbColor={T.onPrimary}
            />
          </View>
        </View>

        {/* Help & Feedback */}
        <Text style={styles.sectionLabel}>Help & Feedback</Text>
        <View style={styles.card}>
          <Touchable style={styles.feedbackRow} onPress={handleSendFeedback} feedback="row" hasTextChild>
            <Ionicons name="mail-outline" size={18} color={T.textDim} />
            <Text style={styles.feedbackLabel}>Send feedback</Text>
            <Ionicons name="chevron-forward" size={16} color={T.textDim} style={{ marginLeft: 'auto' }} />
          </Touchable>
        </View>

        {/* Destructive actions */}
        {/* Both destructive and both previously unlabelled — and the delete
            button's busy state swaps its text for a bare spinner, which
            announces nothing at all without an explicit label. */}
        <Touchable
          style={styles.signOutBtn}
          onPress={handleSignOut}
          accessibilityLabel={isGuest ? 'Exit guest mode' : 'Sign out'}
          feedback="row"
        >
          <Ionicons name="log-out-outline" size={16} color={T.danger} />
          <Text style={styles.signOutText}>{isGuest ? 'Exit Guest Mode' : 'Sign Out'}</Text>
        </Touchable>

        <Touchable
          style={styles.deleteBtn}
          onPress={handleDeleteAccount}
          disabled={deleting}
          accessibilityLabel={deleting ? 'Deleting your account' : 'Delete account'}
          accessibilityState={{ busy: deleting, disabled: deleting }}
          feedback="row"
        >
          {deleting ? (
            <ActivityIndicator size="small" color={T.danger} />
          ) : (
            <Text style={styles.deleteText}>Delete account</Text>
          )}
        </Touchable>
      </ScrollView>

      {showChangePw && (
        <ChangePasswordModal
          hasPassword={!!user?.hasPassword}
          onClose={() => setShowChangePw(false)}
        />
      )}
      {showEditName && (
        <EditNameModal
          initialName={user?.name ?? ''}
          onClose={() => setShowEditName(false)}
        />
      )}
    </View>
  );
}

function ChangePasswordModal({
  hasPassword,
  onClose,
}: {
  /** False when this is a first password on a Google account. */
  hasPassword: boolean;
  onClose: () => void;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const changePassword = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  // Typed passwords used to survive a dismiss, so reopening the sheet showed
  // them still sitting in the fields.
  function handleClose() {
    setCurrent('');
    setNext('');
    setConfirm('');
    onClose();
  }

  async function handleSave() {
    // The current field wasn't checked at all, so an empty one was posted and
    // came back a 401 reading "Current password is incorrect" — which is true
    // but unhelpful when the field was simply blank. Skipped entirely when
    // there is no existing password to prove.
    if (hasPassword && !current) {
      Alert.alert('Current password required', 'Enter your current password to change it.');
      return;
    }
    if (next.length < 8) {
      Alert.alert('Password too short', 'Your new password must be at least 8 characters.');
      return;
    }
    if (next !== confirm) {
      Alert.alert('Passwords do not match', 'The new password and confirmation must match.');
      return;
    }
    if (hasPassword && next === current) {
      Alert.alert('Choose a different password', 'Your new password must differ from the current one.');
      return;
    }
    try {
      await changePassword.mutateAsync({
        // Omitted entirely when setting a first password — the server doesn't
        // ask for one it can't verify.
        ...(hasPassword ? { currentPassword: current } : {}),
        newPassword: next,
      });
      Alert.alert(
        hasPassword ? 'Password changed' : 'Password set',
        hasPassword
          ? 'Your password has been updated.'
          : 'You can now sign in with your email and password as well as with Google.',
      );
      handleClose();
    } catch (err) {
      const msg = (err as Error & { body?: { error?: string } })?.body?.error
        ?? (err as Error).message
        ?? 'Could not change your password.';
      Alert.alert('Change failed', msg);
    }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={handleClose}>
      <Pressable style={styles.pwBackdrop} onPress={handleClose} />
      <View style={styles.pwSheet}>
        <View style={styles.pwHandle} />
        <Text style={styles.pwTitle}>{hasPassword ? 'Change password' : 'Set a password'}</Text>
        {!hasPassword && (
          <Text style={styles.pwHint}>
            Adds email and password sign-in to this account. You can still sign in with Google.
          </Text>
        )}

        {hasPassword && (
          <TextInput
            style={styles.pwInput}
            value={current}
            onChangeText={setCurrent}
            placeholder="Current password"
            placeholderTextColor={T.muted}
            secureTextEntry
            autoCapitalize="none"
            accessibilityLabel="Current password"
          />
        )}
        <TextInput
          style={styles.pwInput}
          value={next}
          onChangeText={setNext}
          placeholder="New password (min 8 chars)"
          placeholderTextColor={T.muted}
          secureTextEntry
          autoCapitalize="none"
          accessibilityLabel="New password"
        />
        <TextInput
          style={styles.pwInput}
          value={confirm}
          onChangeText={setConfirm}
          placeholder="Confirm new password"
          placeholderTextColor={T.muted}
          secureTextEntry
          autoCapitalize="none"
          accessibilityLabel="Confirm new password"
        />

        <Touchable
          style={[styles.pwSaveBtn, changePassword.isPending && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={changePassword.isPending}
          accessibilityLabel={hasPassword ? 'Save new password' : 'Set password'}
        >
          {changePassword.isPending ? (
            <ActivityIndicator size="small" color={T.onPrimary} />
          ) : (
            <Text style={styles.pwSaveText}>
              {hasPassword ? 'Update password' : 'Set password'}
            </Text>
          )}
        </Touchable>
      </View>
    </Modal>
  );
}

/**
 * The display name came from Google or the registration form and could never be
 * changed — there was no UI and no route behind it.
 */
function EditNameModal({ initialName, onClose }: { initialName: string; onClose: () => void }) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const updateProfile = useUpdateProfile();
  const [name, setName] = useState(initialName);

  const trimmed = name.trim();
  const unchanged = trimmed === initialName.trim();

  async function handleSave() {
    if (trimmed.length > NAME_MAX_LENGTH) {
      Alert.alert('Name too long', `Keep it to ${NAME_MAX_LENGTH} characters or fewer.`);
      return;
    }
    try {
      // Empty clears it, and the greeting falls back to the email's local part.
      await updateProfile.mutateAsync({ name: trimmed || null });
      onClose();
    } catch (err) {
      Alert.alert('Error', (err as Error).message || 'Could not update your name.');
    }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.pwBackdrop} onPress={onClose} />
      <View style={styles.pwSheet}>
        <View style={styles.pwHandle} />
        <Text style={styles.pwTitle}>Display name</Text>
        <Text style={styles.pwHint}>Used to greet you. Leave it empty to go back to the default.</Text>

        <TextInput
          style={styles.pwInput}
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor={T.muted}
          maxLength={NAME_MAX_LENGTH}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={handleSave}
          accessibilityLabel="Display name"
          autoFocus
        />

        <Touchable
          style={[styles.pwSaveBtn, (updateProfile.isPending || unchanged) && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={updateProfile.isPending || unchanged}
          accessibilityLabel="Save display name"
        >
          {updateProfile.isPending ? (
            <ActivityIndicator size="small" color={T.onPrimary} />
          ) : (
            <Text style={styles.pwSaveText}>Save</Text>
          )}
        </Touchable>
      </View>
    </Modal>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: T.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 12, paddingVertical: 10,
      borderBottomWidth: 2, borderBottomColor: T.text,
    },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: {
      flex: 1, fontFamily: F.uiSemi, fontSize: 19, color: T.text,
      letterSpacing: -0.2, textAlign: 'center',
    },
    body: { padding: D.pad, gap: D.stack },
    sectionLabel: {
      fontFamily: F.uiBold, fontSize: 11, color: T.textDim,
      textTransform: 'uppercase', letterSpacing: 1.2,
    },
    card: {
      // eslint-disable-next-line no-restricted-syntax -- Applied to six blocks here; converting them is its own change.
      borderTopWidth: 1, borderTopColor: T.borderStrong,
      paddingTop: 14, gap: 14,
    },
    rowLabel: { fontFamily: F.uiSemi, fontSize: 15, color: T.text },
    rowHint: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim, marginTop: 8 },
    segmentRow: {
      flexDirection: 'row',
      backgroundColor: T.surface2,
      borderRadius: R.sm,
      padding: 3,
      gap: 3,
    },
    segment: {
      flex: 1, paddingVertical: 8, alignItems: 'center',
      borderRadius: R.sm - 2,
    },
    segmentActive: { backgroundColor: T.primary },
    segmentText: { fontFamily: F.uiMed, fontSize: 14, color: T.textDim },
    segmentTextActive: { fontFamily: F.uiBold, color: T.onPrimary },
    // Account section
    avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    avatarCircle: {
      width: 44, height: 44, borderRadius: 22,
      backgroundColor: T.surface2,
      alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    },
    accountName: { fontFamily: F.uiSemi, fontSize: 16, color: T.text },
    accountSub: { fontFamily: F.uiMed, fontSize: 13, color: T.textDim, marginTop: 2 },
    accountActionRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingTop: 14, marginTop: 14,
      borderTopWidth: 1, borderTopColor: T.border,
    },
    // Notifications
    switchRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    // Help & Feedback
    feedbackRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
    },
    feedbackLabel: { fontFamily: F.uiMed, fontSize: 15, color: T.text },
    // Destructive actions
    signOutBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      paddingVertical: 14, borderRadius: R.card, borderWidth: 1,
      borderColor: withAlpha(T.danger, 0.3), marginTop: 8,
    },
    signOutText: { fontFamily: F.uiMed, fontSize: 15, color: T.danger },
    deleteBtn: {
      alignItems: 'center', justifyContent: 'center',
      paddingVertical: 12, marginTop: 2,
    },
    deleteText: { fontFamily: F.uiMed, fontSize: 13, color: T.muted },
    // Change-password modal
    pwBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
    pwSheet: {
      position: 'absolute', left: 0, right: 0, bottom: 0,
      backgroundColor: T.bg,
      borderTopLeftRadius: R.card, borderTopRightRadius: R.card,
      padding: D.pad, paddingBottom: 40, gap: 12,
    },
    pwHandle: {
      alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
      backgroundColor: T.border, marginBottom: 6,
    },
    pwTitle: { fontFamily: F.uiBold, fontSize: 18, color: T.text, marginBottom: 4 },
    pwHint: { fontFamily: F.uiMed, fontSize: 13, color: T.textDim, marginBottom: 8, lineHeight: 18 },
    pwInput: {
      fontFamily: F.uiMed, fontSize: 15, color: T.text,
      borderWidth: 1, borderColor: T.border, borderRadius: R.sm,
      paddingHorizontal: 14, paddingVertical: 12,
    },
    pwSaveBtn: {
      backgroundColor: T.primary, borderRadius: R.card,
      paddingVertical: 14, alignItems: 'center', marginTop: 4,
    },
    pwSaveText: { fontFamily: F.uiBold, fontSize: 15, color: T.onPrimary },
  });
}
