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
  //  - mode omitted  → schedule mode: create a 'planned' session on that future
  //    date and return to the calendar rather than entering the live logger.
  //  - mode=log      → backfill mode: the workout already happened, so create a
  //    normal session dated that day and go straight into the logger.
  const { date: calendarDate, mode } = useLocalSearchParams<{
    date?: string;
    mode?: 'schedule' | 'log';
  }>();
  const isBackfill = !!calendarDate && mode === 'log';
  const isScheduling = !!calendarDate && !isBackfill;

  const todayISO = localTodayISO();

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
    // routine is run one part at a time, so ask which part to start.
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
          {isScheduling ? 'Schedule Session' : isBackfill ? 'Log Past Workout' : 'New Session'}
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
          data={routines ?? []}
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
                          : 'Start empty session'}
                    </Text>
                    <Text style={styles.heroCtaSub}>
                      {isScheduling ? 'Plan a session without a routine' : 'Log without a routine'}
                    </Text>
                  </View>
                </CutCornerView>
              </TouchableOpacity>

              <Text style={styles.eyebrow}>From routine</Text>
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
                <Text style={styles.emptyText}>No routines yet.</Text>
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
