import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRoutines } from '../../../src/hooks/useRoutines';
import { useCreateSession } from '../../../src/hooks/useSession';
import { F, R, D, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { CutCornerView } from '../../../src/components/CutCornerView';
import { localTodayISO } from '../../../src/lib/calendar';
import type { EntryKind, RoutineWithItems } from '@app/shared';

export default function NewSessionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { data: routines, isLoading, isError } = useRoutines();
  const createSession = useCreateSession();

  // Arriving from the calendar with a ?date=:
  //  - mode=schedule → create a 'planned' session on that future date and return
  //    to the calendar rather than entering the live logger.
  //  - mode=log      → backfill mode: the workout already happened, so create a
  //    normal session dated that day and go straight into the logger.
  //
  // Scheduling must be requested explicitly. It used to be the default for any
  // ?date= without mode=log, so a caller that forgot `mode` — or a deep link —
  // silently created a planned session, and on a past date that session was
  // immediately overdue. Defaulting to backfill fails safe instead.
  //
  // ?kind= says which side of the app the user came in from, so the Mat tab's
  // "Start New Mat Session" leads somewhere that is actually about mat work. It
  // shapes the flow — the title, which routines are offered, and which half of a
  // mixed routine is seeded — and is validated rather than trusted, since it
  // arrives from a route.
  //
  // It deliberately does NOT tag an empty session. A session's kind is derived
  // from its entries (the backend reads `kinds` from session_entries), and
  // CreateSessionRequest.kind only filters which routine items get seeded. An
  // empty session genuinely has no kind until its first entry, and the logger
  // already handles that by offering both "Exercise" and "Discipline" until one
  // is chosen. Sending `kind` there would be a field the server ignores.
  const { date: calendarDate, mode, kind } = useLocalSearchParams<{
    date?: string;
    mode?: 'schedule' | 'log';
    kind?: string;
  }>();
  const todayISO = localTodayISO();
  // A past date can only ever be a backfill, whatever the caller asked for.
  const isScheduling = !!calendarDate && mode === 'schedule' && calendarDate >= todayISO;
  const isBackfill = !!calendarDate && !isScheduling;

  const startKind: EntryKind | undefined =
    kind === 'exercise' || kind === 'martial_arts' ? kind : undefined;
  const isMatFlow = startKind === 'martial_arts';

  // Offer only the routines that have something of the requested kind in them —
  // a mat session picker listing leg-day is just noise.
  const visibleRoutines = useMemo(() => {
    if (!startKind) return routines ?? [];
    return (routines ?? []).filter((r) => r.items.some((i) => i.kind === startKind));
  }, [routines, startKind]);

  function handleActiveSessionConflict(err: unknown) {
    const e = err as { status?: number; body?: { sessionId?: string } };
    if (e?.status === 409 && e?.body?.sessionId) {
      const sid = e.body.sessionId;
      Alert.alert(
        'Active Session',
        isBackfill
          ? 'You already have a session in progress. Finish or discard it before logging a past workout.'
          : 'You already have a session in progress.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Resume', onPress: () => router.push({ pathname: '/sessions/[id]', params: { id: sid } } as never) },
        ],
      );
      return;
    }
    // Anything that isn't the active-session conflict used to fall through
    // silently: a 500, a dropped connection or a request timeout left the user
    // tapping "Start" with no response at all.
    Alert.alert('Error', (err as Error).message ?? 'Failed to start the session.');
  }

  async function startRoutine(routine: RoutineWithItems, kind?: EntryKind) {
    try {
      if (isScheduling) {
        await createSession.mutateAsync({
          routineId: routine.id,
          date: calendarDate,
          kind,
          status: 'planned',
        });
        router.back();
        return;
      }
      const session = await createSession.mutateAsync({
        routineId: routine.id,
        date: isBackfill ? calendarDate : todayISO,
        kind,
      });
      openLogger(session.id);
    } catch (err) { handleActiveSessionConflict(err); }
  }

  // Backfill replaces this screen so Back from the logger returns to the
  // calendar, not to a picker that would happily create a second session.
  function openLogger(id: string) {
    const to = { pathname: '/sessions/[id]', params: { id } } as never;
    if (isBackfill) router.replace(to);
    else router.push(to);
  }

  function handleStartFromRoutine(routine: RoutineWithItems) {
    const hasGym = routine.items.some((i) => i.kind === 'exercise');
    const hasMat = routine.items.some((i) => i.kind === 'martial_arts');
    // A session is either weightlifting or martial arts — never both. A mixed
    // routine is run one part at a time, so ask which part to start — unless the
    // caller already said, in which case asking again is just a tax.
    if (hasGym && hasMat && startKind) {
      startRoutine(routine, startKind);
      return;
    }
    if (hasGym && hasMat) {
      Alert.alert(
        isScheduling ? 'Schedule which part?' : isBackfill ? 'Log which part?' : 'Start which part?',
        'This routine has both gym and martial-arts items. A session tracks one at a time.',
        [
          { text: 'Gym', onPress: () => startRoutine(routine, 'exercise') },
          { text: 'Martial Arts', onPress: () => startRoutine(routine, 'martial_arts') },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }
    startRoutine(routine);
  }

  async function handleEmptySession() {
    try {
      if (isScheduling) {
        await createSession.mutateAsync({ date: calendarDate, status: 'planned' });
        router.back();
        return;
      }
      const session = await createSession.mutateAsync({
        date: isBackfill ? calendarDate : todayISO,
      });
      openLogger(session.id);
    } catch (err) { handleActiveSessionConflict(err); }
  }

  const isStarting = createSession.isPending;

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
        <Text style={styles.headerTitle}>
          {isScheduling
            ? 'Schedule Session'
            : isBackfill
              ? 'Log Past Workout'
              : isMatFlow
                ? 'New Mat Session'
                : 'New Session'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {isStarting ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={T.primary} />
          <Text style={styles.startingText}>
            {isScheduling ? 'Scheduling session…' : 'Starting session…'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={visibleRoutines}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <View style={styles.body}>
              <TouchableOpacity onPress={handleEmptySession} activeOpacity={0.8}>
                <CutCornerView fill={T.primary} style={styles.heroCta}>
                  <Ionicons name="add" size={20} color={T.onPrimary} />
                  <View>
                    <Text style={styles.heroCtaTitle}>
                      {isScheduling
                        ? 'Schedule empty session'
                        : isBackfill
                          ? 'Log empty session'
                          : isMatFlow
                            ? 'Start empty mat session'
                            : 'Start empty session'}
                    </Text>
                    <Text style={styles.heroCtaSub}>
                      {isScheduling ? 'Plan a session without a routine' : 'Log without a routine'}
                    </Text>
                  </View>
                </CutCornerView>
              </TouchableOpacity>

              <Text style={styles.eyebrow}>
                {isMatFlow ? 'From mat routine' : 'From routine'}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const hasGym = item.items.some((i) => i.kind === 'exercise');
            const hasMat = item.items.some((i) => i.kind === 'martial_arts');
            const isMixed = hasGym && hasMat;
            return (
            <TouchableOpacity
              style={styles.routineRow}
              onPress={() => handleStartFromRoutine(item)}
              activeOpacity={0.7}
            >
              <View style={styles.routineIcon}>
                {isMixed ? (
                  <Ionicons name="layers" size={19} color={T.primary} />
                ) : hasMat ? (
                  <Ionicons name="flash" size={19} color={T.primary} />
                ) : (
                  <Ionicons name="barbell" size={19} color={T.textDim} />
                )}
              </View>
              <View style={styles.routineInfo}>
                <Text style={styles.routineName}>{item.name}</Text>
                <Text style={styles.routineMeta}>
                  {item.items.length} item{item.items.length !== 1 ? 's' : ''}
                  {isMixed ? ' · Gym + Mat' : ''}
                  {item.dayLabel ? ` · ${item.dayLabel}` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={T.muted} />
            </TouchableOpacity>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.rowSep} />}
          ListEmptyComponent={
            isLoading ? (
              <View style={styles.centered}>
                <ActivityIndicator color={T.primary} />
              </View>
            ) : isError ? (
              <View style={styles.centered}>
                <Text style={styles.errorText}>Failed to load routines.</Text>
              </View>
            ) : (
              <View style={styles.centered}>
                <Text style={styles.emptyText}>
                  {isMatFlow ? 'No mat routines yet.' : 'No routines yet.'}
                </Text>
                <Text style={styles.emptySubText}>Create routines from the Training section.</Text>
              </View>
            )
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
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
    headerTitle: { flex: 1, fontFamily: F.uiSemi, fontSize: 19, color: T.text, letterSpacing: -0.2, textAlign: 'center' },
    body: { padding: D.pad, gap: D.stack },
    heroCta: {
      flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18,
    },
    heroCtaTitle: { fontFamily: F.uiBold, fontSize: 16, color: T.onPrimary },
    heroCtaSub: { fontFamily: F.uiMed, fontSize: 12, color: 'rgba(10,11,13,0.65)', marginTop: 1 },
    eyebrow: { fontFamily: F.uiBold, fontSize: 11, color: T.textDim, textTransform: 'uppercase', letterSpacing: 1.2 },
    routineRow: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      paddingHorizontal: D.pad, paddingVertical: 14,
    },
    routineIcon: {
      width: 38, height: 38, borderRadius: R.sm,
      backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center',
    },
    routineInfo: { flex: 1 },
    routineName: { fontFamily: F.uiMed, fontSize: 15, color: T.text, marginBottom: 2 },
    routineMeta: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim },
    rowSep: { height: 1, backgroundColor: T.border, marginLeft: D.pad + 38 + 14 },
    centered: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 24 },
    startingText: { fontFamily: F.uiMed, fontSize: 15, color: T.textDim, marginTop: 12 },
    emptyText: { fontFamily: F.uiSemi, fontSize: 15, color: T.textDim, marginBottom: 4 },
    emptySubText: { fontFamily: F.uiMed, fontSize: 13, color: T.muted, textAlign: 'center' },
    errorText: { fontFamily: F.uiMed, fontSize: 15, color: T.danger },
  });
}
