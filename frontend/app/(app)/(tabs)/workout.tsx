import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { RoutineWithItems } from '@app/shared';
import { useCurrentUser } from '../../../src/hooks/useAuth';
import { useSessions } from '../../../src/hooks/useSession';
import { useRoutines } from '../../../src/hooks/useRoutines';
import { mondayOf, weekKey, computeWeekStreak } from '../../../src/lib/statsHelpers';
import { F, R, D, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { withAlpha } from '../../../src/lib/color';

function greeting(name: string | null): string {
  const hour = new Date().getHours();
  const time = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const first = name?.split(' ')[0] ?? 'Athlete';
  return `Good ${time}, ${first}`;
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

interface WeekDay {
  date: Date;
  abbrev: string;
  dayNum: number;
  isoDate: string;
}

function getWeekDays(): WeekDay[] {
  const now = new Date();
  const dow = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dow + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return {
      date: d,
      abbrev: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3).toUpperCase(),
      dayNum: d.getDate(),
      isoDate: d.toISOString().slice(0, 10),
    };
  });
}

function isToday(d: Date): boolean {
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
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

export default function WorkoutTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { data: user } = useCurrentUser();
  const { data: sessions } = useSessions('completed');
  const { data: routines } = useRoutines();

  const weekDays = useMemo(getWeekDays, []);
  const sessionDates = useMemo(
    () => new Set(sessions?.map((s) => s.date) ?? []),
    [sessions],
  );

  const { weekStreak, weekCount } = useMemo(() => {
    const dates = sessions?.map((s) => s.date) ?? [];
    const thisWeek = mondayOf(new Date()).toISOString().slice(0, 10);
    return {
      weekStreak: computeWeekStreak(dates),
      weekCount: dates.filter((d) => weekKey(d) === thisWeek).length,
    };
  }, [sessions]);

  return (
    <Animated.View style={styles.screen} entering={FadeInDown.duration(280).springify()}>
      <View style={styles.header}>
        <Text style={styles.greeting}>{greeting(user?.name ?? null)}</Text>
        <Text style={styles.todayLabel}>{todayLabel()}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
      >
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
            style={styles.startBtn}
            onPress={() => router.push('/sessions/new' as never)}
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={20} color={T.onPrimary} />
            <Text style={styles.startBtnText}>Start New Workout</Text>
          </TouchableOpacity>
        </View>

        {/* My Week */}
        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push('/calendar' as never)}
          activeOpacity={0.88}
        >
          <View style={styles.weekHeader}>
            <View style={styles.weekHeaderLeft}>
              <View style={styles.calIconBox}>
                <Ionicons name="calendar-outline" size={16} color={T.textDim} />
              </View>
              <Text style={styles.weekTitle}>My Week</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={T.muted} />
          </View>
          <Text style={styles.weekSub}>
            {weekCount > 0
              ? `${weekCount} workout${weekCount !== 1 ? 's' : ''} this week`
              : 'Log a workout to start your streak'}
          </Text>

          <View style={styles.weekStrip}>
            {weekDays.map((wd) => {
              const today = isToday(wd.date);
              const hasSession = sessionDates.has(wd.isoDate);
              return (
                <View key={wd.isoDate} style={styles.weekDayCol}>
                  <Text style={[styles.weekDayAbbrev, today && styles.weekDayAbbrevActive]}>
                    {wd.abbrev}
                  </Text>
                  <View style={[styles.weekDayCircle, today && styles.weekDayCircleActive]}>
                    <Text style={[styles.weekDayNum, today && styles.weekDayNumActive]}>
                      {wd.dayNum}
                    </Text>
                  </View>
                  {hasSession && <View style={styles.sessionDot} />}
                </View>
              );
            })}
          </View>

          <View style={styles.streakRow}>
            <View style={styles.streakChip}>
              <View style={styles.streakIconBg}>
                <Ionicons name="flash" size={14} color={T.primary} />
              </View>
              <View>
                <Text style={styles.streakNum}>{weekStreak} week{weekStreak !== 1 ? 's' : ''}</Text>
                <Text style={styles.streakLabel}>current streak</Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>

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

        {routines && routines.length > 0 ? (
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
    </Animated.View>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: T.bg },

    header: {
      paddingHorizontal: D.pad,
      paddingTop: 14,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: T.border,
    },
    greeting: { fontFamily: F.uiBold, fontSize: 22, color: T.text, letterSpacing: -0.3 },
    todayLabel: { fontFamily: F.uiMed, fontSize: 13, color: T.textDim, marginTop: 3 },

    scroll: { flex: 1 },
    body: { padding: D.pad, gap: D.stack },

    card: {
      backgroundColor: T.surface,
      borderWidth: 1,
      borderColor: T.border,
      borderRadius: R.card,
      padding: D.cardPad,
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
    quickTitle: { fontFamily: F.uiSemi, fontSize: 15, color: T.text, marginBottom: 2 },
    quickSub: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim },
    startBtn: {
      backgroundColor: T.primary,
      borderRadius: R.card,
      paddingVertical: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    startBtnText: { fontFamily: F.uiBold, fontSize: 16, color: T.onPrimary },

    weekHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    weekHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    calIconBox: {
      width: 28,
      height: 28,
      borderRadius: R.sm,
      backgroundColor: T.surface2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    weekTitle: { fontFamily: F.uiSemi, fontSize: 15, color: T.text },
    weekSub: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim, marginBottom: 14 },

    weekStrip: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
    weekDayCol: { alignItems: 'center', gap: 5, flex: 1 },
    weekDayAbbrev: { fontFamily: F.uiMed, fontSize: 10, color: T.textDim, letterSpacing: 0.3 },
    weekDayAbbrevActive: { color: T.primary, fontFamily: F.uiBold },
    weekDayCircle: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    weekDayCircleActive: { backgroundColor: T.primary },
    weekDayNum: { fontFamily: F.monoBold, fontSize: 14, color: T.text },
    weekDayNumActive: { color: T.onPrimary },
    sessionDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor: T.primary,
      marginTop: -2,
    },

    streakRow: { flexDirection: 'row', gap: 10 },
    streakChip: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: T.surface2,
      borderRadius: R.card,
      padding: 10,
    },
    streakIconBg: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: withAlpha(T.primary, 0.15),
      alignItems: 'center',
      justifyContent: 'center',
    },
    streakNum: { fontFamily: F.uiSemi, fontSize: 14, color: T.text },
    streakLabel: { fontFamily: F.uiMed, fontSize: 11, color: T.textDim },

    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionTitle: { fontFamily: F.uiBold, fontSize: 17, color: T.text },
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

    emptyCard: { alignItems: 'center', paddingVertical: 24, gap: 8 },
    emptyText: { fontFamily: F.uiMed, fontSize: 14, color: T.textDim },
    emptyLink: { fontFamily: F.uiMed, fontSize: 13, color: T.primary },
  });
}
