import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { useCurrentUser } from '../../../src/hooks/useAuth';
import { useSessions } from '../../../src/hooks/useSession';
import { clearSessionToken } from '../../../src/lib/auth';
import { T, F, R, D } from '../../../src/theme/colors';
import { withAlpha } from '../../../src/lib/color';

interface NavRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  last?: boolean;
}

function NavRow({ icon, label, onPress, last }: NavRowProps) {
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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const { data: sessions } = useSessions('completed');

  const completedCount = sessions?.length ?? 0;
  const displayName = user?.name ?? user?.email ?? 'Athlete';
  const firstName = displayName.split(' ')[0];

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await clearSessionToken();
          await GoogleSignin.signOut();
          queryClient.clear();
          router.replace('/(auth)/sign-in' as never);
        },
      },
    ]);
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity style={styles.gearBtn} onPress={handleSignOut} activeOpacity={0.7}>
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
            <Ionicons name="person" size={28} color={T.textDim} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>Hi, {firstName}!</Text>
            <Text style={styles.userSub}>Member</Text>
          </View>
        </View>

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

        {/* Sign out */}
        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={handleSignOut}
          activeOpacity={0.7}
        >
          <Ionicons name="log-out-outline" size={16} color={T.danger} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
