import {
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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
import { cardState, weekRangeOf } from '../../../src/lib/statsHelpers';
import { InlineError } from '../../../src/components/InlineError';
import { WeekSection } from '../../../src/components/WeekSection';
import { Skeleton } from '../../../src/components/Skeleton';
import {
  Button,
  EmptyState,
  Section,
  SectionHeader,
  Touchable,
} from '../../../src/components/ui';
import { F, R, D, ThemeColors } from '../../../src/theme/colors';
import { TYPE } from '../../../src/theme/type';
import { useTheme } from '../../../src/theme/ThemeContext';
import { withAlpha } from '../../../src/lib/color';

/**
 * Shared by the routine card and its skeleton. These had drifted to 160 and 150,
 * so the row visibly jumped when the real cards arrived.
 */
const ROUTINE_CARD_W = 160;
const ROUTINE_CARD_H = 96;

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
    <Touchable
      style={styles.routineCard}
      onPress={onPress}
      feedback="row"
      accessibilityLabel={`${routine.name}, ${routine.items.length} exercise${routine.items.length !== 1 ? 's' : ''}`}
    >
      <View style={styles.routineIconBox}>
        <Ionicons name="layers-outline" size={20} color={T.primary} />
      </View>
      {/* Two lines rather than one: the card is a fixed width in a horizontal
          scroller, so it can afford height but not width, and truncating a
          routine's name to ~14 characters told the user very little. */}
      <Text style={styles.routineName} numberOfLines={2}>
        {routine.name}
      </Text>
      <Text style={styles.routineMeta} numberOfLines={1}>
        {routine.items.length} exercise{routine.items.length !== 1 ? 's' : ''}
      </Text>
    </Touchable>
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
  const name = session.name ?? routineName ?? 'Planned session';
  return (
    <View style={styles.plannedRow}>
      <Touchable
        style={styles.plannedInfo}
        onPress={onOpen}
        feedback="row"
        haptic={false}
        accessibilityLabel={`Open ${name}`}
      >
        <View style={styles.plannedIconBox}>
          <Ionicons
            name={isMat ? 'flash' : 'barbell'}
            size={16}
            color={isMat ? T.grappling : T.textDim}
          />
        </View>
        <Text style={styles.plannedName} numberOfLines={1}>
          {name}
        </Text>
      </Touchable>
      <Button
        label="Start"
        onPress={onStart}
        variant="soft"
        size="sm"
        disabled={starting}
        accessibilityLabel={`Start ${name}`}
      />
    </View>
  );
}

export default function WorkoutTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { data: user } = useCurrentUser();
  // Same arguments WeekSection passes, so this is the *same* React Query entry
  // rather than a second fetch of the same rows. It used to omit the limit,
  // which put it under a different cache key: the tab issued two overlapping
  // /sessions requests and threw the rows from this one away, keeping only
  // `isError`.
  const {
    data: sessions,
    isError: sessionsError,
    refetch: refetchSessions,
  } = useSessions('completed', MAX_SESSIONS_PAGE);
  const {
    data: routines,
    isLoading: routinesLoading,
    isError: routinesError,
    refetch: refetchRoutines,
  } = useRoutines();

  // A failed *background* refetch over a persisted cache is not worth a banner —
  // the user can still read everything on screen. cardState encodes that rule
  // ("data beats an error"); this tab used to branch on isError alone and shout
  // about a refresh that changed nothing.
  const sessionsFailed = cardState(!!sessions, sessionsError) === 'error';
  const routinesFailed = cardState(!!routines, routinesError) === 'error';
  const errorMessage =
    sessionsFailed && routinesFailed
      ? "Couldn't refresh. Showing what we have."
      : routinesFailed
        ? "Couldn't load your routines."
        : "Couldn't load this week's sessions.";

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

  // Same range WeekSection asks for, via the shared helper, so the two share one
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
      // The Button's press impact fires on tap; this one confirms the session
      // actually started, which is the part that can fail.
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

  // Driven by the pull itself, not by isFetching: every background refetch — a
  // tab focus, a reconnect — used to spin the control as though the user had
  // asked for it. refetchWeek is awaited here too; it was fired and then left
  // out of the spinner entirely.
  const [pulling, setPulling] = useState(false);
  const onRefresh = useCallback(async () => {
    setPulling(true);
    try {
      await Promise.allSettled([refetchSessions(), refetchRoutines(), refetchWeek()]);
    } finally {
      setPulling(false);
    }
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
            refreshing={pulling}
            onRefresh={onRefresh}
            tintColor={T.primary}
            colors={[T.primary]}
          />
        }
      >
        {(sessionsFailed || routinesFailed) && (
          <InlineError
            message={errorMessage}
            onRetry={() => {
              if (sessionsFailed) void refetchSessions();
              if (routinesFailed) void refetchRoutines();
            }}
          />
        )}

        {/* Today's plan — a session scheduled from the calendar showed up here
            only as a ring dot in the week strip, so starting it meant navigating to the
            calendar and finding the day. */}
        {todaysPlanned.length > 0 && (
          <Section>
            <SectionHeader
              title="Today's plan"
              icon="calendar"
              iconTone="primary"
              subtitle={
                todaysPlanned.length === 1
                  ? 'You scheduled this for today.'
                  : `You scheduled ${todaysPlanned.length} sessions for today.`
              }
            />
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
          </Section>
        )}

        {/* Quick Start */}
        <Section>
          <SectionHeader
            title="Quick start"
            icon="flash"
            iconTone="primary"
            subtitle="Start right away and add exercises as you go."
          />
          <Button
            label="Start New Workout"
            icon="add"
            variant="hero"
            onPress={() => router.push('/sessions/new' as never)}
          />
        </Section>

        {/* My Week */}
        <WeekSection />

        {/* Routines — this was the one section without a rule above it, so it
            didn't line up with anything else on the screen. */}
        <Section>
          <SectionHeader
            title="Routines"
            icon="layers"
            iconTone="primary"
            action={{
              label: 'View all',
              onPress: () => router.push('/routines' as never),
              accessibilityLabel: 'View all routines',
            }}
          />
          {routinesLoading ? (
            // Was falling through to the "No routines yet" empty state on a cold
            // load, telling users with routines that they had none.
            <View style={styles.routinesList}>
              <Skeleton width={ROUTINE_CARD_W} height={ROUTINE_CARD_H} radius={R.sm} />
              <Skeleton width={ROUTINE_CARD_W} height={ROUTINE_CARD_H} radius={R.sm} />
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
            <EmptyState
              title="No routines yet."
              action={{
                label: 'Create your first routine',
                onPress: () => router.push('/routines' as never),
              }}
            />
          )}
        </Section>
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
    greeting: { ...TYPE.screenTitle, color: T.text },
    todayLabel: { fontFamily: F.uiMed, fontSize: 13, color: T.textDim, marginTop: 3 },

    scroll: { flex: 1 },
    body: { padding: D.pad, gap: D.stack },

    // One style for the real list and the skeleton row, so the two cannot drift
    // apart on gap the way they did on card width.
    routinesList: { flexDirection: 'row', gap: 10, paddingVertical: 2 },
    routineCard: {
      width: ROUTINE_CARD_W,
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
      flexShrink: 0,
      borderRadius: R.sm,
      backgroundColor: withAlpha(T.primary, 0.12),
      alignItems: 'center',
      justifyContent: 'center',
    },
    routineName: { ...TYPE.body, fontFamily: F.uiSemi, color: T.text },
    routineMeta: { ...TYPE.meta, color: T.textDim },

    plannedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 8,
    },
    plannedInfo: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
    plannedIconBox: {
      width: 30,
      height: 30,
      flexShrink: 0,
      borderRadius: R.sm,
      backgroundColor: T.surface2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    plannedName: { ...TYPE.body, flex: 1, minWidth: 0, color: T.text },
  });
}
