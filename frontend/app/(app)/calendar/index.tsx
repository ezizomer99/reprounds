import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRoutines } from '../../../src/hooks/useRoutines';
import { useProGate } from '../../../src/hooks/useProGate';
import { F, D, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { DAY_LABELS_LONG, localTodayISO, toISODate } from '../../../src/lib/calendar';
import { MonthGrid } from '../../../src/components/MonthGrid';
import { DaySheet } from '../../../src/components/DaySheet';

// Fixed scroll window: enough back-history for multi-year training logs
// without infinite-scroll bookkeeping, and a year ahead for scheduling.
const MONTHS_BACK = 24;
const MONTHS_FORWARD = 12;
// Same free-tier window as the History screen.
const FREE_HISTORY_DAYS = 30;

interface MonthItem {
  year: number;
  month0: number;
}

export default function CalendarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { isPro, isLoading: gateLoading, showPaywall } = useProGate();
  const { data: routines } = useRoutines();

  const todayISO = localTodayISO();
  // Only the date is held here — DaySheet reads the sessions live from the
  // month's cached query so it can't strand on a stale snapshot.
  const [sheetISO, setSheetISO] = useState<string | null>(null);

  const months = useMemo<MonthItem[]>(() => {
    const now = new Date();
    return Array.from({ length: MONTHS_BACK + 1 + MONTHS_FORWARD }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - MONTHS_BACK + i, 1);
      return { year: d.getFullYear(), month0: d.getMonth() };
    });
  }, []);

  // Free tier: only the trailing history window is visible, like History.
  // While the entitlement is still resolving we deliberately compute NO cutoff:
  // `isPro` is false during that race, and a lock derived from it would be
  // captured by already-mounted month cells and never re-evaluated. The window
  // is a presentation gate only — the API returns every row regardless — so a
  // brief unlocked flash for a free user beats a permanently locked calendar
  // for a paying one.
  const cutoffISO = useMemo(() => {
    if (gateLoading || isPro) return null;
    const d = new Date();
    d.setDate(d.getDate() - FREE_HISTORY_DAYS);
    return toISODate(d.getFullYear(), d.getMonth(), d.getDate());
  }, [isPro, gateLoading]);

  function handleDayPress(iso: string) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (cutoffISO && iso < cutoffISO) {
      showPaywall();
      return;
    }
    setSheetISO(iso);
  }

  function openSession(id: string) {
    setSheetISO(null);
    router.push({ pathname: '/sessions/[id]', params: { id } } as never);
  }

  // A past day logs a workout that already happened; today or later schedules
  // one. Both land in the same picker, which switches mode on `mode`.
  function addWorkout(iso: string, isPast: boolean) {
    setSheetISO(null);
    router.push({
      pathname: '/sessions/new',
      params: isPast ? { date: iso, mode: 'log' } : { date: iso },
    } as never);
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
        <Text style={styles.headerTitle}>Calendar</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.dayLabelRow}>
        {DAY_LABELS_LONG.map((d) => (
          <Text key={d} style={styles.dayLabel}>
            {d}
          </Text>
        ))}
      </View>

      <FlashList
        data={months}
        keyExtractor={(m) => `${m.year}-${m.month0}`}
        initialScrollIndex={MONTHS_BACK}
        // `months` is a stable memo, so cells are memoized on item identity
        // alone. Without extraData they keep the cutoff they mounted with and
        // stay locked forever once the entitlement resolves.
        extraData={cutoffISO}
        renderItem={({ item }) => (
          <View style={styles.monthWrap}>
            <MonthGrid
              year={item.year}
              month0={item.month0}
              todayISO={todayISO}
              cutoffISO={cutoffISO}
              onDayPress={handleDayPress}
              onUpgradePress={showPaywall}
            />
          </View>
        )}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      />

      <DaySheet
        iso={sheetISO}
        todayISO={todayISO}
        routines={routines}
        onClose={() => setSheetISO(null)}
        onOpenSession={openSession}
        onAddWorkout={addWorkout}
      />
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

    // Pinned weekday header shared by every month, like Lyfta's.
    dayLabelRow: {
      flexDirection: 'row',
      paddingHorizontal: D.pad,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: T.border,
    },
    dayLabel: {
      flex: 1,
      fontFamily: F.uiBold,
      fontSize: 11,
      color: T.textDim,
      textAlign: 'center',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },

    monthWrap: { paddingHorizontal: D.pad, paddingTop: 16 },
  });
}
