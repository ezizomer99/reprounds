import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { statusCodes } from '@react-native-google-signin/google-signin';
import { useCurrentUser, useSignIn, useSignOut } from '../../../src/hooks/useAuth';
import { useSessions } from '../../../src/hooks/useSession';
import { F, R, D, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { withAlpha } from '../../../src/lib/color';

interface NavRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  last?: boolean;
}

function NavRow({ icon, label, onPress, last }: NavRowProps) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  return (
    <>
      <TouchableOpacity style={styles.navRow} onPress={onPress} activeOpacity={0.7}>
        <View style={styles.navRowIcon}>
          <Ionicons name={icon} size={18} color={T.textDim} />
        </View>
        <Text style={styles.navRowLabel}>{label}</Text>
        <Ionicons name="chevron-forward" size={16} color={T.muted} />
      </TouchableOpacity>
      {!last && <View style={styles.rowDivider} />}
    </>
  );
}

export default function ProfileTab() {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const { data: sessions } = useSessions('completed');
  const { signInWithGoogle } = useSignIn();
  const { signOut } = useSignOut();
  const [googleLinking, setGoogleLinking] = useState(false);

  const isGuest = user?.isGuest ?? false;
  const completedCount = sessions?.length ?? 0;
  const displayName = user?.name ?? user?.email ?? 'Athlete';
  const firstName = isGuest ? 'Guest' : displayName.split(' ')[0];

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

  async function handleLinkGoogle() {
    setGoogleLinking(true);
    try {
      await signInWithGoogle();
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e.code === statusCodes.SIGN_IN_CANCELLED) return;
      Alert.alert('Sign-in failed', e.message ?? 'Please try again.');
    } finally {
      setGoogleLinking(false);
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity
          style={styles.gearBtn}
          onPress={() => router.push('/settings' as never)}
          activeOpacity={0.7}
        >
          <Ionicons name="settings-outline" size={20} color={T.textDim} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* User card */}
        <View style={styles.userCard}>
          <View style={styles.avatarCircle}>
            <Ionicons name={isGuest ? 'person-outline' : 'person'} size={28} color={T.textDim} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>Hi, {firstName}!</Text>
            <Text style={styles.userSub}>{isGuest ? 'Guest' : 'Member'}</Text>
          </View>
        </View>

        {/* Guest banner */}
        {isGuest && (
          <View style={styles.guestBanner}>
            <View style={styles.guestBannerTop}>
              <Ionicons name="cloud-outline" size={18} color={T.primary} />
              <Text style={styles.guestBannerTitle}>Save Your Data</Text>
            </View>
            <Text style={styles.guestBannerBody}>
              Sign in with Google to protect your workout history and access it from any device.
            </Text>
            <TouchableOpacity
              style={[styles.guestBannerBtn, googleLinking && { opacity: 0.6 }]}
              onPress={handleLinkGoogle}
              disabled={googleLinking}
              activeOpacity={0.8}
            >
              {googleLinking ? (
                <ActivityIndicator color={T.onPrimary} size="small" />
              ) : (
                <Text style={styles.guestBannerBtnText}>Sign in with Google</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Workouts card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <Ionicons name="pulse-outline" size={16} color={T.primary} />
              <Text style={styles.cardTitle}>Workouts</Text>
            </View>
            <TouchableOpacity
              onPress={() => router.push('/history' as never)}
              activeOpacity={0.7}
            >
              <Ionicons name="time-outline" size={18} color={T.textDim} />
            </TouchableOpacity>
          </View>
          <View style={styles.workoutStatRow}>
            <View style={styles.workoutStatIcon}>
              <Ionicons name="ribbon-outline" size={18} color={T.textDim} />
            </View>
            <Text style={styles.workoutStatNum}>{completedCount}</Text>
            <Text style={styles.workoutStatLabel}>Workouts Completed</Text>
          </View>
        </View>

        {/* Training links */}
        <View style={styles.sectionLabel}>
          <Text style={styles.eyebrow}>Training</Text>
        </View>
        <View style={styles.listCard}>
          <NavRow
            icon="calendar-outline"
            label="Calendar"
            onPress={() => router.push('/calendar' as never)}
          />
          <NavRow
            icon="layers-outline"
            label="Routines"
            onPress={() => router.push('/routines' as never)}
          />
          <NavRow
            icon="flash-outline"
            label="Disciplines"
            onPress={() => router.push('/library/disciplines' as never)}
            last
          />
        </View>

        {/* App settings */}
        <View style={styles.sectionLabel}>
          <Text style={styles.eyebrow}>App</Text>
        </View>
        <View style={styles.listCard}>
          <NavRow
            icon="color-palette-outline"
            label="Appearance"
            onPress={() => router.push('/settings' as never)}
            last
          />
        </View>

        {/* Sign out */}
        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={handleSignOut}
          activeOpacity={0.7}
        >
          <Ionicons name="log-out-outline" size={16} color={T.danger} />
          <Text style={styles.signOutText}>{isGuest ? 'Exit Guest Mode' : 'Sign Out'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: T.bg },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: D.pad,
      paddingTop: 14,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: T.border,
    },
    headerTitle: { fontFamily: F.uiBold, fontSize: 22, color: T.text, letterSpacing: -0.3 },
    gearBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

    scroll: { flex: 1 },
    body: { padding: D.pad, gap: D.stack },

    // User card
    userCard: {
      backgroundColor: T.surface,
      borderWidth: 1,
      borderColor: T.border,
      borderRadius: R.card,
      padding: D.cardPad,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    avatarCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: T.surface2,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    userName: { fontFamily: F.uiBold, fontSize: 18, color: T.text, marginBottom: 3 },
    userSub: { fontFamily: F.uiMed, fontSize: 13, color: T.textDim },

    // Guest banner
    guestBanner: {
      backgroundColor: withAlpha(T.primary, 0.08),
      borderWidth: 1,
      borderColor: withAlpha(T.primary, 0.25),
      borderRadius: R.card,
      padding: D.cardPad,
      gap: 10,
    },
    guestBannerTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    guestBannerTitle: { fontFamily: F.uiBold, fontSize: 15, color: T.text },
    guestBannerBody: { fontFamily: F.uiMed, fontSize: 13, color: T.textDim, lineHeight: 19 },
    guestBannerBtn: {
      backgroundColor: T.primary,
      borderRadius: R.sm,
      paddingVertical: 11,
      alignItems: 'center',
      marginTop: 2,
    },
    guestBannerBtnText: { fontFamily: F.uiBold, fontSize: 14, color: T.onPrimary },

    // Card
    card: {
      backgroundColor: T.surface,
      borderWidth: 1,
      borderColor: T.border,
      borderRadius: R.card,
      padding: D.cardPad,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    cardTitle: { fontFamily: F.uiSemi, fontSize: 15, color: T.text },

    workoutStatRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    workoutStatIcon: {
      width: 32,
      height: 32,
      borderRadius: R.sm,
      backgroundColor: T.surface2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    workoutStatNum: { fontFamily: F.monoBold, fontSize: 17, color: T.text },
    workoutStatLabel: { fontFamily: F.uiMed, fontSize: 14, color: T.textDim },

    // Section label
    sectionLabel: { marginBottom: -4 },
    eyebrow: {
      fontFamily: F.uiBold,
      fontSize: 11,
      color: T.textDim,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },

    // List card
    listCard: {
      backgroundColor: T.surface,
      borderWidth: 1,
      borderColor: T.border,
      borderRadius: R.card,
      overflow: 'hidden',
    },
    navRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: D.cardPad,
      paddingVertical: 15,
    },
    navRowIcon: {
      width: 30,
      height: 30,
      borderRadius: R.sm,
      backgroundColor: T.surface2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navRowLabel: { flex: 1, fontFamily: F.uiMed, fontSize: 15, color: T.text },
    rowDivider: { height: 1, backgroundColor: T.border, marginLeft: D.cardPad + 30 + 12 },

    // Sign out
    signOutBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: R.card,
      borderWidth: 1,
      borderColor: withAlpha(T.danger, 0.3),
      marginTop: 8,
    },
    signOutText: { fontFamily: F.uiMed, fontSize: 15, color: T.danger },
  });
}
