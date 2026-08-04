import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { addDaysISO } from '@app/shared';
import { useRoutines } from '../../../src/hooks/useRoutines';
import { useProGate } from '../../../src/hooks/useProGate';
import { useTodayISO } from '../../../src/hooks/useTodayISO';
import { F, D, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import {
  DAY_LABELS_LONG,
  addMonths,
  localTodayISO,
  monthOfISO,
  monthsBetween,
  type YearMonth,
} from '../../../src/lib/calendar';
import { MonthGrid } from '../../../src/components/MonthGrid';
import { DaySheet } from '../../../src/components/DaySheet';

// Scroll window: enough back-history for multi-year training logs without
// infinite-scroll bookkeeping, and a year ahead for scheduling. "Earlier months"
// extends the back end on demand so a long-running log is never silently cut off.
const MONTHS_BACK = 24;
const MONTHS_FORWARD = 12;
const MONTHS_PER_EXTENSION = 12;
// Same free-tier window as the History screen.
const FREE_HISTORY_DAYS = 30;

export default function CalendarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { isPro, isLoading: gateLoading, showPaywall } = useProGate();
  const { data: routines } = useRoutines();

  // Refreshed at local midnight and on every foreground resume. A value read
  // straight into render goes stale overnight, and every past/future decision
  // below compares against it.
  const todayISO = useTodayISO();
  // Only the date is held here — DaySheet reads the sessions live from the
  // month's cached query so it can't strand on a stale snapshot.
  const [sheetISO, setSheetISO] = useState<string | null>(null);

  // The window is anchored to a month captured once, not to a rolling offset from
  // "now". When the day rolls over past a month boundary the new month is
  // appended and every existing index keeps its place; deriving the start from
  // `now` instead would shift index 0 and jump the user's scroll under them.
  const originRef = useRef<YearMonth>(addMonths(monthOfISO(localTodayISO()), -MONTHS_BACK));
  const [extraMonthsBack, setExtraMonthsBack] = useState(0);

  const origin = useMemo(
    () => addMonths(originRef.current, -extraMonthsBack),
    [extraMonthsBack],
  );

  // Keyed on the month, not the day: a daily rollover must not hand FlashList a
  // fresh `data` array when the set of months hasn't actually changed.
  const todayMonthKey = todayISO.slice(0, 7);
  const months = useMemo<YearMonth[]>(
    () => monthsBetween(origin, addMonths(monthOfISO(`${todayMonthKey}-01`), MONTHS_FORWARD)),
    [origin, todayMonthKey],
  );

  // Free tier: only the trailing history window is visible, like History.
  // While the entitlement is still resolving we deliberately compute NO cutoff:
  // `isPro` is false during that race, and a lock derived from it would be
  // captured by already-mounted month cells and never re-evaluated. The window
  // is a presentation gate only — the API returns every row regardless — so a
  // brief unlocked flash for a free user beats a permanently locked calendar
  // for a paying one.
  const cutoffISO = useMemo(() => {
    if (gateLoading || isPro) return null;
    return addDaysISO(todayISO, -FREE_HISTORY_DAYS);
  }, [isPro, gateLoading, todayISO]);

  // `months` is a stable memo, so cells are memoized on item identity alone.
  // Without this they keep the cutoff *and the day* they mounted with — staying
  // locked forever once the entitlement resolves, and highlighting yesterday
  // forever once the date rolls over.
  const cellExtraData = useMemo(
    () => `${cutoffISO ?? ''}|${todayISO}`,
    [cutoffISO, todayISO],
  );

  // Offering "earlier months" only makes sense with full history access — a free
  // user's `cutoffISO` already hides everything past 30 days, so extending the
  // window back would just add locked months.
  const canLoadEarlier = cutoffISO === null;

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
  // one. `mode` is always sent explicitly — the picker treats a missing mode as
  // "log", so an omission can never create a planned session by accident.
  //
  // Past/future is decided here against a freshly read today, not passed in from
  // the sheet: the grid may have rendered before a midnight rollover, and
  // scheduling a past day is exactly what produces an instantly-overdue session.
  function addWorkout(iso: string) {
    setSheetISO(null);
    const isPast = iso < localTodayISO();
    router.push({
      pathname: '/sessions/new',
      params: { date: iso, mode: isPast ? 'log' : 'schedule' },
    } as never);
  }

  function loadEarlierMonths() {
    setExtraMonthsBack((n) => n + MONTHS_PER_EXTENSION);
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
        extraData={cellExtraData}
        // No maintainVisibleContentPosition config needed: FlashList v2 keeps the
        // visible anchor by default, which is what stops "Show earlier months"
        // from shoving the current month down the screen as it prepends.
        ListHeaderComponent={
          canLoadEarlier ? (
            <TouchableOpacity
              style={styles.earlierBtn}
              onPress={loadEarlierMonths}
              accessibilityRole="button"
              accessibilityLabel="Show earlier months"
            >
              <Ionicons name="chevron-up" size={14} color={T.textDim} />
              <Text style={styles.earlierText}>Show earlier months</Text>
            </TouchableOpacity>
          ) : null
        }
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

    earlierBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 14,
    },
    earlierText: { fontFamily: F.uiMed, fontSize: 13, color: T.textDim },
  });
}
