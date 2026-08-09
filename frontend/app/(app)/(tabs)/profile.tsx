import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { statusCodes } from '@react-native-google-signin/google-signin';
import { useCurrentUser, useSignIn } from '../../../src/hooks/useAuth';
import { useTrainingTotals } from '../../../src/hooks/useStats';
import { useTodayISO } from '../../../src/hooks/useTodayISO';
import { InlineError } from '../../../src/components/InlineError';
import { useUnit } from '../../../src/units/UnitContext';
import { kgToUnit } from '../../../src/units/units';
import { parseLocalDate } from '../../../src/lib/calendar';
import { ScreenHeader, StatTile, Touchable } from '../../../src/components/ui';
import { F, R, D, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { withAlpha } from '../../../src/lib/color';

interface NavRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  last?: boolean;
  iconColor?: string;
  iconBg?: string;
}

function NavRow({ icon, label, onPress, last, iconColor, iconBg }: NavRowProps) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  return (
    <>
      <Touchable
        style={styles.navRow}
        onPress={onPress}
        feedback="row"
        accessibilityLabel={label}
      >
        {/* Decorative — the row already announces its label, and without this
            a screen reader reads the icon glyph name alongside it. */}
        <View
          style={[styles.navRowIcon, iconBg ? { backgroundColor: iconBg } : undefined]}
          importantForAccessibility="no"
        >
          <Ionicons name={icon} size={18} color={iconColor ?? T.textDim} />
        </View>
        <Text style={styles.navRowLabel}>{label}</Text>
        <Ionicons name="chevron-forward" size={16} color={T.muted} />
      </Touchable>
      {!last && <View style={styles.rowDivider} />}
    </>
  );
}

/** One figure in the profile summary grid. */
/**
 * One cell of the lifetime-totals grid. A bare StatTile — no fill, half width —
 * rather than a fourth hand-rolled copy of "number over label".
 */
function SummaryCell({ value, label }: { value: string; label: string }) {
  return (
    <StatTile
      value={value}
      label={label}
      emphasis="md"
      filled={false}
      style={summaryCellStyle}
    />
  );
}

const summaryCellStyle = { flexBasis: '50%', flexGrow: 0, paddingVertical: 0, alignItems: 'flex-start' } as const;

export default function ProfileTab() {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const todayISO = useTodayISO();
  // Was `sessions.length` over GET /sessions, which caps at 200 — so the count
  // stopped at 200 for anyone with a longer history, and read a flat 0 whenever
  // the request failed, since only the *loading* case was handled. Both numbers
  // now come from an aggregate that counts in SQL.
  const {
    data: totals,
    isLoading: totalsLoading,
    isError: totalsError,
    isFetching: totalsFetching,
    refetch: refetchTotals,
  } = useTrainingTotals(todayISO);
  const { unit } = useUnit();
  const { signInWithGoogle } = useSignIn();
  const [googleLinking, setGoogleLinking] = useState(false);

  const isGuest = user?.isGuest ?? false;
  // '—' rather than a hard 0 for both unknown states: the old placeholder read
  // as "you have never trained".
  const completedCount =
    totals !== undefined ? String(totals.sessions) : totalsLoading || totalsError ? '—' : '0';
  // `name` can be an empty string, and falling through to `email` produced
  // "Hi, sam@example.com!" — so take the first word of a real name, else the
  // local part of an email, else a neutral fallback.
  const firstName = useMemo(() => {
    if (isGuest) return 'Guest';
    const named = user?.name?.trim().split(/\s+/)[0];
    if (named) return named;
    const local = user?.email?.split('@')[0]?.trim();
    return local || 'Athlete';
  }, [isGuest, user?.name, user?.email]);

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
    <View style={styles.screen}>
      <ScreenHeader
        title="Profile"
        right={
          <Touchable
            style={styles.gearBtn}
            onPress={() => router.push('/settings' as never)}
            feedback="row"
            haptic={false}
            accessibilityLabel="Settings"
          >
            <Ionicons name="settings-outline" size={20} color={T.textDim} />
          </Touchable>
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={totalsFetching}
            onRefresh={() => { void refetchTotals(); }}
            tintColor={T.primary}
            colors={[T.primary]}
          />
        }
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
            <Touchable
              style={[styles.guestBannerBtn, googleLinking && { opacity: 0.6 }]}
              onPress={handleLinkGoogle}
              disabled={googleLinking}
              feedback="card"
              accessibilityLabel="Sign in with Google to save your data"
              accessibilityState={{ busy: googleLinking, disabled: googleLinking }}
            >
              {googleLinking ? (
                <ActivityIndicator color={T.onPrimary} size="small" />
              ) : (
                <Text style={styles.guestBannerBtnText}>Sign in with Google</Text>
              )}
            </Touchable>
            {/* Registering and signing in with email both migrate guest data
                too (they send the same guestToken), but this banner offered
                Google alone — so a guest who didn't want a Google account had
                no way from here to save their history. */}
            <Touchable
              onPress={() => router.push('/(auth)/sign-in' as never)}
              disabled={googleLinking}
              feedback="row"
              accessibilityLabel="Use email instead to save your data"
            >
              <Text style={styles.guestBannerAlt}>Use email instead</Text>
            </Touchable>
          </View>
        )}

        {/* Workouts card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <Ionicons name="pulse-outline" size={16} color={T.primary} />
              <Text style={styles.cardTitle}>Workouts</Text>
            </View>
            <Touchable
              onPress={() => router.push('/history' as never)}
              feedback="row"
              accessibilityLabel="Workout history"
            >
              <Ionicons name="time-outline" size={18} color={T.textDim} />
            </Touchable>
          </View>
          {totalsError && !totals ? (
            <InlineError
              message="Couldn't load your training totals."
              onRetry={() => { void refetchTotals(); }}
            />
          ) : (
            <>
              <View
                style={styles.workoutStatRow}
                accessible
                accessibilityLabel={`${completedCount} workouts completed`}
              >
                <View style={styles.workoutStatIcon} importantForAccessibility="no">
                  <Ionicons name="ribbon-outline" size={18} color={T.textDim} />
                </View>
                <Text style={styles.workoutStatNum}>{completedCount}</Text>
                <Text style={styles.workoutStatLabel}>Workouts Completed</Text>
              </View>

              {/* The card rendered a single integer. The totals aggregate
                  already returns the rest for the same round-trip, so there's
                  no reason for it to stay that thin. */}
              <View style={styles.summaryGrid}>
                <SummaryCell
                  value={totals ? totals.gymSessions.toLocaleString() : '—'}
                  label="gym"
                />
                <SummaryCell
                  value={totals ? totals.matSessions.toLocaleString() : '—'}
                  label="mat"
                />
                <SummaryCell
                  value={
                    totals
                      ? Math.round(kgToUnit(totals.volumeKg, unit)).toLocaleString()
                      : '—'
                  }
                  label={`${unit} lifted`}
                />
                <SummaryCell
                  value={
                    totals?.firstSessionDate
                      ? parseLocalDate(totals.firstSessionDate).toLocaleDateString('en-US', {
                          month: 'short',
                          year: 'numeric',
                        })
                      : '—'
                  }
                  label="training since"
                />
              </View>
            </>
          )}
        </View>

        {/* Training links */}
        <View style={styles.sectionLabel}>
          <Text style={styles.eyebrow}>Training</Text>
        </View>
        <View style={styles.listCard}>
          <NavRow
            icon="layers-outline"
            label="Routines"
            onPress={() => router.push('/routines' as never)}
          />
          <NavRow
            icon="barbell-outline"
            label="Exercises"
            onPress={() => router.push('/exercises' as never)}
          />
          <NavRow
            icon="flash-outline"
            label="Disciplines"
            onPress={() => router.push('/library/disciplines' as never)}
          />
          <NavRow
            icon="body-outline"
            label="Positions & Submissions"
            onPress={() => router.push('/library/techniques' as never)}
          />
          <NavRow
            icon="scale-outline"
            label="Body weight"
            onPress={() => router.push('/weight' as never)}
            last
          />
        </View>

        {/* App settings */}
        <View style={styles.sectionLabel}>
          <Text style={styles.eyebrow}>App</Text>
        </View>
        <View style={styles.listCard}>
          <NavRow
            icon="star-outline"
            iconColor={T.gold}
            iconBg={withAlpha(T.gold, 0.12)}
            label="RepRounds Pro"
            onPress={() => router.push('/subscription' as never)}
          />
          <NavRow
            icon="settings-outline"
            label="Settings"
            onPress={() => router.push('/settings' as never)}
            last
          />
        </View>

      </ScrollView>
    </View>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: T.bg },

    gearBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

    scroll: { flex: 1 },
    body: { padding: D.pad, gap: D.stack },

    // User card
    userCard: {
      paddingVertical: 6,
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
    guestBannerAlt: {
      fontFamily: F.uiMed,
      fontSize: 13,
      color: T.primary,
      textAlign: 'center',
      paddingVertical: 6,
    },

    // Broadsheet: flat rule-separated section.
    card: {
      borderTopWidth: 1,
      borderTopColor: T.borderStrong,
      paddingTop: 14,
      paddingBottom: 4,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    cardTitle: { fontFamily: F.uiBold, fontSize: 12, color: T.textDim, textTransform: 'uppercase', letterSpacing: 1 },

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

    summaryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: 16,
      rowGap: 14,
    },
    summaryCell: { width: '50%', gap: 2 },
    summaryValue: { fontFamily: F.monoBold, fontSize: 16, color: T.text },
    summaryLabel: {
      fontFamily: F.uiMed,
      fontSize: 11,
      color: T.textDim,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },

    // Section label
    sectionLabel: { marginBottom: -4 },
    eyebrow: {
      fontFamily: F.uiBold,
      fontSize: 11,
      color: T.textDim,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },

    // Broadsheet: nav groups are flat rows under a rule, no card shell.
    listCard: {
      borderTopWidth: 1,
      borderTopColor: T.borderStrong,
    },
    navRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
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
    rowDivider: { height: 1, backgroundColor: T.border, marginLeft: 30 + 12 },

  });
}
