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
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCurrentUser, useSignOut, useDeleteAccount, useChangePassword } from '../../src/hooks/useAuth';
import { F, R, D, ThemeColors } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeContext';
import { useUnit } from '../../src/units/UnitContext';
import { useRestTimerDefault } from '../../src/restTimer/RestTimerContext';
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

const REST_OPTS = [
  { value: 30, label: '30s' },
  { value: 60, label: '1 min' },
  { value: 90, label: '90s' },
  { value: 120, label: '2 min' },
  { value: 180, label: '3 min' },
] as const;

const REST_PRESET_VALUES = REST_OPTS.map((o) => o.value);

export default function SettingsScreen() {
  const { T, mode, setMode } = useTheme();
  const { unit, setUnit } = useUnit();
  const { restTimerDefault, setRestTimerDefault } = useRestTimerDefault();
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
  const [customRest, setCustomRest] = useState(() =>
    REST_PRESET_VALUES.includes(restTimerDefault as 30 | 60 | 90 | 120 | 180)
      ? ''
      : String(restTimerDefault),
  );

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
          await signOut();
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
                    } catch {
                      Alert.alert('Delete failed', 'Could not delete your account. Please try again.');
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
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={T.text} />
        </TouchableOpacity>
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
          {user?.hasPassword && (
            <TouchableOpacity
              style={styles.accountActionRow}
              onPress={() => setShowChangePw(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Change password"
            >
              <Ionicons name="key-outline" size={17} color={T.textDim} />
              <Text style={styles.rowLabel}>Change password</Text>
              <Ionicons name="chevron-forward" size={16} color={T.muted} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
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
                <TouchableOpacity
                  key={value}
                  style={[styles.segment, active && styles.segmentActive]}
                  onPress={() => setMode(value)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
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
                <TouchableOpacity
                  key={value}
                  style={[styles.segment, active && styles.segmentActive]}
                  onPress={() => setUnit(value)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Workout Defaults */}
        <Text style={styles.sectionLabel}>Workout Defaults</Text>
        <View style={styles.card}>
          <Text style={styles.rowLabel}>Rest Timer</Text>
          <View style={styles.segmentRowWrap}>
            {REST_OPTS.map(({ value, label }) => {
              const active = restTimerDefault === value && customRest === '';
              return (
                <TouchableOpacity
                  key={value}
                  style={[styles.segmentWrap, active && styles.segmentActive]}
                  onPress={() => { setRestTimerDefault(value); setCustomRest(''); }}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.customRestRow}>
            <Text style={styles.customRestLabel}>Custom (sec)</Text>
            <TextInput
              style={[styles.customRestInput, customRest !== '' && styles.customRestInputActive]}
              value={customRest}
              onChangeText={setCustomRest}
              onBlur={() => {
                const n = parseInt(customRest, 10);
                if (Number.isInteger(n) && n > 0 && n <= 600) {
                  setRestTimerDefault(n);
                  setCustomRest(String(n));
                } else {
                  setCustomRest('');
                }
              }}
              onSubmitEditing={() => {
                const n = parseInt(customRest, 10);
                if (Number.isInteger(n) && n > 0 && n <= 600) {
                  setRestTimerDefault(n);
                  setCustomRest(String(n));
                } else {
                  setCustomRest('');
                }
              }}
              keyboardType="number-pad"
              maxLength={3}
              placeholder="e.g. 45"
              placeholderTextColor={T.muted}
              returnKeyType="done"
            />
          </View>
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
          <TouchableOpacity style={styles.feedbackRow} onPress={handleSendFeedback} activeOpacity={0.7}>
            <Ionicons name="mail-outline" size={18} color={T.textDim} />
            <Text style={styles.feedbackLabel}>Send feedback</Text>
            <Ionicons name="chevron-forward" size={16} color={T.textDim} style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>
        </View>

        {/* Destructive actions */}
        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={handleSignOut}
          activeOpacity={0.7}
        >
          <Ionicons name="log-out-outline" size={16} color={T.danger} />
          <Text style={styles.signOutText}>{isGuest ? 'Exit Guest Mode' : 'Sign Out'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={handleDeleteAccount}
          disabled={deleting}
          activeOpacity={0.7}
        >
          {deleting ? (
            <ActivityIndicator size="small" color={T.danger} />
          ) : (
            <Text style={styles.deleteText}>Delete account</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
    </View>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const changePassword = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  async function handleSave() {
    if (next.length < 8) {
      Alert.alert('Password too short', 'Your new password must be at least 8 characters.');
      return;
    }
    if (next !== confirm) {
      Alert.alert('Passwords do not match', 'The new password and confirmation must match.');
      return;
    }
    try {
      await changePassword.mutateAsync({ currentPassword: current, newPassword: next });
      Alert.alert('Password changed', 'Your password has been updated.');
      onClose();
    } catch (err) {
      const msg = (err as Error & { body?: { error?: string } })?.body?.error
        ?? (err as Error).message
        ?? 'Could not change your password.';
      Alert.alert('Change failed', msg);
    }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.pwBackdrop} onPress={onClose} />
      <View style={styles.pwSheet}>
        <View style={styles.pwHandle} />
        <Text style={styles.pwTitle}>Change password</Text>

        <TextInput
          style={styles.pwInput}
          value={current}
          onChangeText={setCurrent}
          placeholder="Current password"
          placeholderTextColor={T.muted}
          secureTextEntry
          autoCapitalize="none"
        />
        <TextInput
          style={styles.pwInput}
          value={next}
          onChangeText={setNext}
          placeholder="New password (min 8 chars)"
          placeholderTextColor={T.muted}
          secureTextEntry
          autoCapitalize="none"
        />
        <TextInput
          style={styles.pwInput}
          value={confirm}
          onChangeText={setConfirm}
          placeholder="Confirm new password"
          placeholderTextColor={T.muted}
          secureTextEntry
          autoCapitalize="none"
        />

        <TouchableOpacity
          style={[styles.pwSaveBtn, changePassword.isPending && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={changePassword.isPending}
          accessibilityRole="button"
          accessibilityLabel="Save new password"
        >
          {changePassword.isPending ? (
            <ActivityIndicator size="small" color={T.onPrimary} />
          ) : (
            <Text style={styles.pwSaveText}>Update password</Text>
          )}
        </TouchableOpacity>
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
      borderBottomWidth: 1, borderBottomColor: T.border,
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
      backgroundColor: T.surface, borderRadius: R.card,
      borderWidth: 1, borderColor: T.border,
      padding: D.cardPad, gap: 14,
    },
    rowLabel: { fontFamily: F.uiSemi, fontSize: 15, color: T.text },
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
    segmentRowWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      backgroundColor: T.surface2,
      borderRadius: R.sm,
      padding: 3,
      gap: 3,
    },
    segmentWrap: {
      flexGrow: 1,
      minWidth: '18%',
      paddingVertical: 8,
      alignItems: 'center',
      borderRadius: R.sm - 2,
    },
    segmentActive: { backgroundColor: T.primary },
    segmentText: { fontFamily: F.uiMed, fontSize: 14, color: T.textDim },
    segmentTextActive: { fontFamily: F.uiBold, color: T.onPrimary },
    // Custom rest timer
    customRestRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    customRestLabel: { fontFamily: F.uiMed, fontSize: 14, color: T.textDim },
    customRestInput: {
      fontFamily: F.mono, fontSize: 15, color: T.text,
      borderWidth: 1, borderColor: T.border, borderRadius: R.sm,
      paddingHorizontal: 12, paddingVertical: 7,
      minWidth: 72, textAlign: 'center',
    },
    customRestInputActive: { borderColor: T.primary, color: T.primary },
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
