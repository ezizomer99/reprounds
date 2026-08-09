import {
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { RoutineWithItems, Session } from '@app/shared';
import { useCurrentUser } from '../../../src/hooks/useAuth';
import {
  MAX_SESSIONS_PAGE,
  useSessions,
  useSessionsInRange,
  useStartSession,
} from '../../../src/hooks/useSession';
import { useRoutines } from '../../../src/hooks/useRoutines';
import { useTodayISO } from '../../../src/hooks/useTodayISO';
import { parseLocalDate } from '../../../src/lib/calendar';
import { weekRangeOf } from '../../../src/lib/statsHelpers';
import { InlineError } from '../../../src/components/InlineError';
import { CutCornerView } from '../../../src/components/CutCornerView';
import { MyWeek } from '../../../src/components/MyWeek';
import { Skeleton } from '../../../src/components/Skeleton';
import { F, R, D, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { withAlpha } from '../../../src/lib/color';

function greeting(name: string | null): string {
  const hour = new Date().getHours();
  const time = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const first = name?.split(' ')[0] ?? 'Athlete';
  return `Good ${time}, ${first}`;
}

function todayLabel(todayISO: string): string {
  return parseLocalDate(todayISO).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

function RoutineCard({
  routine,
  onPress,
}: {
  routine: RoutineWithItems;
  onPress: () => void;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  return (
    <TouchableOpacity style={styles.routineCard} onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }} activeOpacity={0.7}>
      <View style={styles.routineIconBox}>
        <Ionicons name="layers-outline" size={20} color={T.primary} />
      </View>
      <Text style={styles.routineName} numberOfLines={1}>
        {routine.name}
      </Text>
      <Text style={styles.routineMeta}>
        {routine.items.length} exercise{routine.items.length !== 1 ? 's' : ''}
      </Text>
    </TouchableOpacity>
  );
}

/**
 * One planned session for today. Tapping the row opens it (to reschedule, skip
 * or look at what's in it); the Start button flips it live and drops straight
 * into the logger.
 */
function PlannedRow({
  session,
  routineName,
  starting,
  onStart,
  onOpen,
}: {
  session: Session;
  routineName: string | null;
  starting: boolean;
  onStart: () => void;
  onOpen: () => void;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const isMat = session.kinds?.includes('martial_arts') ?? false;
  return (
    <View style={styles.plannedRow}>
      <TouchableOpacity
        style={styles.plannedInfo}
        onPress={onOpen}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Open ${session.name ?? routineName ?? 'planned session'}`}
      >
        <View style={styles.plannedIconBox}>
          <Ionicons
            name={isMat ? 'flash' : 'barbell'}
            size={16}
            color={isMat ? T.grappling : T.textDim}
          />
        </View>
        <Text style={styles.plannedName} numberOfLines={1}>
          {session.name ?? routineName ?? 'Planned session'}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onStart(); }}
        disabled={starting}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Start this planned session"
      >
        <View style={[styles.plannedStartBtn, starting && { opacity: 0.5 }]}>
          <Text style={styles.plannedStartText}>Start</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

export default function WorkoutTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { data: user } = useCurrentUser();
  // Same arguments MyWeek passes, so this is the *same* React Query entry
  // rather than a second fetch of the same rows. It used to omit the limit,
  // which put it under a different cache key: the tab issued two overlapping
  // /sessions requests and threw the rows from this one away, keeping only
  // `isError`.
  const {
    isError: sessionsError,
    isFetching: sessionsFetching,
    refetch: refetchSessions,
  } = useSessions('completed', MAX_SESSIONS_PAGE);
  const {
    data: routines,
    isLoading: routinesLoading,
    isError: routinesError,
    isFetching: routinesFetching,
    refetch: refetchRoutines,
  } = useRoutines();
  const hasError = sessionsError || routinesError;

  // Refreshed at local midnight and on every foreground resume. Read straight
  // into the render, the date was whatever it had been when the tab first
  // mounted — an app resumed the next morning showed yesterday under a
  // "Good evening".
  const todayISO = useTodayISO();
  // `todayISO` isn't read by greeting() — it's the trigger. The greeting is a
  // function of the wall clock, which nothing else in this render depends on,
  // so this memo piggybacks on the hook's midnight/resume resync to recompute
  // "morning/afternoon/evening" at the only moments a user would notice.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const headerGreeting = useMemo(() => greeting(user?.name ?? null), [user?.name, todayISO]);

  // Same range MyWeek asks for, via the shared helper, so the two share one
  // cache entry instead of fetching this week twice.
  const weekRange = useMemo(() => weekRangeOf(todayISO), [todayISO]);
  const { data: weekSessions, refetch: refetchWeek } = useSessionsInRange(
    weekRange.from,
    weekRange.to,
  );
  const todaysPlanned = useMemo(
    () => (weekSessions?.sessions ?? []).filter((s) => s.status === 'planned' && s.date === todayISO),
    [weekSessions, todayISO],
  );

  const startSession = useStartSession();

  const routineNameOf = useCallback(
    (s: Session) => (s.routineId ? routines?.find((r) => r.id === s.routineId)?.name ?? null : null),
    [routines],
  );

  async function handleStartPlanned(sessionId: string) {
    try {
      await startSession.mutateAsync({ id: sessionId });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push({ pathname: '/sessions/[id]', params: { id: sessionId } } as never);
    } catch (err) {
      // Same 409 the New Session screen handles: only one session runs at a
      // time, and the useful thing to offer is a way back into the live one.
      const e = err as { status?: number; body?: { sessionId?: string } };
      if (e?.status === 409 && e?.body?.sessionId) {
        const sid = e.body.sessionId;
        Alert.alert('Active Session', 'You already have a session in progress.', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Resume',
            onPress: () =>
              router.push({ pathname: '/sessions/[id]', params: { id: sid } } as never),
          },
        ]);
        return;
      }
      Alert.alert('Error', (err as Error).message ?? 'Failed to start the session.');
    }
  }

  const refreshing = sessionsFetching || routinesFetching;
  const onRefresh = useCallback(() => {
    void refetchSessions();
    void refetchRoutines();
    void refetchWeek();
  }, [refetchSessions, refetchRoutines, refetchWeek]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.greeting}>{headerGreeting}</Text>
        <Text style={styles.todayLabel}>{todayLabel(todayISO)}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={T.primary}
            colors={[T.primary]}
          />
        }
      >
        {hasError && (
          <InlineError
            message="Couldn't refresh your recent workouts. Showing what we have."
            onRetry={() => {
              if (sessionsError) void refetchSessions();
              if (routinesError) void refetchRoutines();
            }}
          />
        )}

        {/* Today's plan — a session scheduled from the calendar showed up here
            only as a ring dot in MyWeek, so starting it meant navigating to the
            calendar and finding the day. */}
        {todaysPlanned.length > 0 && (
          <View style={styles.card}>
            <View style={styles.quickStartRow}>
              <View style={styles.quickIconBox}>
                <Ionicons name="calendar" size={18} color={T.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.quickTitle}>Today's plan</Text>
                <Text style={styles.quickSub}>
                  {todaysPlanned.length === 1
                    ? 'You scheduled this for today.'
                    : `You scheduled ${todaysPlanned.length} sessions for today.`}
                </Text>
              </View>
            </View>
            {todaysPlanned.map((s) => (
              <PlannedRow
                key={s.id}
                session={s}
                routineName={routineNameOf(s)}
                starting={startSession.isPending}
                onStart={() => handleStartPlanned(s.id)}
                onOpen={() =>
                  router.push({ pathname: '/sessions/[id]', params: { id: s.id } } as never)
                }
              />
            ))}
          </View>
        )}

        {/* Quick Start */}
        <View style={styles.card}>
          <View style={styles.quickStartRow}>
            <View style={styles.quickIconBox}>
              <Ionicons name="flash" size={18} color={T.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.quickTitle}>Quick start</Text>
              <Text style={styles.quickSub}>Start right away and add exercises as you go!</Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/sessions/new' as never)}
            activeOpacity={0.85}
          >
            <CutCornerView fill={T.primary} style={styles.startBtn}>
              <Ionicons name="add" size={20} color={T.onPrimary} />
              <Text style={styles.startBtnText}>Start New Workout</Text>
            </CutCornerView>
          </TouchableOpacity>
        </View>

        {/* My Week */}
        <MyWeek />

        {/* Routines */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Routines</Text>
          <TouchableOpacity
            onPress={() => router.push('/routines' as never)}
            activeOpacity={0.7}
          >
            <Text style={styles.viewAll}>View all</Text>
          </TouchableOpacity>
        </View>

        {routinesLoading ? (
          // Was falling through to the "No routines yet" empty state on a cold
          // load, telling users with routines that they had none.
          <View style={[styles.routinesList, { flexDirection: 'row', gap: 12 }]}>
            <Skeleton width={150} height={96} radius={R.sm} />
            <Skeleton width={150} height={96} radius={R.sm} />
          </View>
        ) : routines && routines.length > 0 ? (
          <FlatList
            data={routines}
            keyExtractor={(t) => t.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.routinesList}
            renderItem={({ item }) => (
              <RoutineCard
                routine={item}
                onPress={() =>
                  router.push({
                    pathname: '/routines/[id]',
                    params: { id: item.id },
                  } as never)
                }
              />
            )}
          />
        ) : (
          <View style={[styles.card, styles.emptyCard]}>
            <Text style={styles.emptyText}>No routines yet.</Text>
            <TouchableOpacity
              onPress={() => router.push('/routines' as never)}
              activeOpacity={0.7}
            >
              <Text style={styles.emptyLink}>Create your first routine →</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: T.bg },

    header: {
      paddingHorizontal: D.pad,
      paddingTop: 14,
      paddingBottom: 14,
      borderBottomWidth: 2,
      borderBottomColor: T.text,
    },
    greeting: { fontFamily: F.uiBold, fontSize: 22, color: T.text, letterSpacing: -0.3 },
    todayLabel: { fontFamily: F.uiMed, fontSize: 13, color: T.textDim, marginTop: 3 },

    scroll: { flex: 1 },
    body: { padding: D.pad, gap: D.stack },

    // Broadsheet: sections are flat, separated by rules — not floating cards.
    card: {
      borderTopWidth: 1,
      borderTopColor: T.borderStrong,
      paddingTop: 14,
      paddingBottom: 4,
    },

    quickStartRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginBottom: 14,
    },
    quickIconBox: {
      width: 32,
      height: 32,
      borderRadius: R.sm,
      backgroundColor: withAlpha(T.primary, 0.14),
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickTitle: { fontFamily: F.uiBold, fontSize: 12, color: T.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
    quickSub: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim },
    startBtn: {
      paddingVertical: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    startBtnText: { fontFamily: F.uiBold, fontSize: 16, color: T.onPrimary },

    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionTitle: { fontFamily: F.uiBold, fontSize: 12, color: T.textDim, textTransform: 'uppercase', letterSpacing: 1.2 },
    viewAll: { fontFamily: F.uiMed, fontSize: 13, color: T.primary },

    routinesList: { gap: 10, paddingVertical: 2 },
    routineCard: {
      width: 160,
      backgroundColor: T.surface,
      borderWidth: 1,
      borderColor: T.border,
      borderRadius: R.card,
      padding: D.cardPad,
      gap: 8,
    },
    routineIconBox: {
      width: 36,
      height: 36,
      borderRadius: R.sm,
      backgroundColor: withAlpha(T.primary, 0.12),
      alignItems: 'center',
      justifyContent: 'center',
    },
    routineName: { fontFamily: F.uiSemi, fontSize: 14, color: T.text },
    routineMeta: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim },

    plannedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 8,
    },
    plannedInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    plannedIconBox: {
      width: 30,
      height: 30,
      borderRadius: R.sm,
      backgroundColor: T.surface2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    plannedName: { flex: 1, fontFamily: F.uiMed, fontSize: 14, color: T.text },
    plannedStartBtn: {
      borderRadius: R.chip,
      paddingVertical: 8,
      paddingHorizontal: 18,
      backgroundColor: withAlpha(T.primary, 0.14),
      borderWidth: 1,
      borderColor: withAlpha(T.primary, 0.35),
    },
    plannedStartText: { fontFamily: F.uiBold, fontSize: 13, color: T.primary },

    emptyCard: { alignItems: 'center', paddingVertical: 24, gap: 8 },
    emptyText: { fontFamily: F.uiMed, fontSize: 14, color: T.textDim },
    emptyLink: { fontFamily: F.uiMed, fontSize: 13, color: T.primary },
  });
}
