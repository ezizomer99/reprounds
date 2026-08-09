import { StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { addDaysISO } from '@app/shared';
import { useRoutines } from '../../../src/hooks/useRoutines';
import { useProGate } from '../../../src/hooks/useProGate';
import { useTodayISO } from '../../../src/hooks/useTodayISO';
import { Touchable } from '../../../src/components/ui';
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
//
// History is NOT part of the first paint — see `monthsBack` below. The current
// month has to be index 0 initially, because opening in the middle of this list
// is what broke it: FlashList v2 has no size estimates and assumes 200px for any
// unmeasured item, while a MonthGrid is ~360px, so `initialScrollIndex` computed
// an offset past the not-yet-grown content height and the platform clamped it to
// the bottom — landing on the last month instead of today's.
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

  // Opens straight onto a day when the caller named one — the week strip pushes
  // /calendar?date=YYYY-MM-DD so tapping Friday lands on Friday.
  const { date: dateParam } = useLocalSearchParams<{ date?: string }>();

  // Only the date is held here — DaySheet reads the sessions live from the
  // month's cached query so it can't strand on a stale snapshot.
  //
  // A one-shot initializer, deliberately not an effect: the param stays in the
  // route for the life of the screen, so an effect would reopen the sheet on the
  // next render every time the user closed it.
  //
  // Also deliberately not gated on `cutoffISO` — that is null while the
  // entitlement resolves (see the comment on it below), and every day a caller
  // can link to from this week is inside the free window anyway. `handleDayPress`
  // keeps its own check for taps on the grid, which can reach any month.
  const [sheetISO, setSheetISO] = useState<string | null>(() =>
    typeof dateParam === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null,
  );

  // The back edge is anchored to the month captured once at mount, never to a
  // rolling offset from "now": when the day rolls over past a month boundary the
  // new month is appended at the far end and every existing index keeps its
  // place. Deriving the start from `now` would shift index 0 and jump the user's
  // scroll under them.
  const anchorRef = useRef<YearMonth>(monthOfISO(localTodayISO()));

  // How much history is currently loaded *behind* the current month. Starts at 0
  // so the first paint puts the current month at index 0 and needs no scrolling
  // at all — the only way to be certain the calendar opens where it should.
  // `onLoad` then fills history in behind it (see the FlashList below).
  const [monthsBack, setMonthsBack] = useState(0);

  // Keyed on the month, not the day: a daily rollover must not hand FlashList a
  // fresh `data` array when the set of months hasn't actually changed.
  const todayMonthKey = todayISO.slice(0, 7);
  const months = useMemo<YearMonth[]>(
    () =>
      monthsBetween(
        addMonths(anchorRef.current, -monthsBack),
        addMonths(monthOfISO(`${todayMonthKey}-01`), MONTHS_FORWARD),
      ),
    [monthsBack, todayMonthKey],
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
    setMonthsBack((n) => n + MONTHS_PER_EXTENSION);
  }

  // Load the default history once the list has measured itself. Deferring to
  // `onLoad` rather than an effect matters: prepending is only seamless while
  // maintainVisibleContentPosition is live (on by default in v2, and gated on the
  // stable keys this list already supplies via keyExtractor), which is not the
  // case before the first layout pass.
  function handleListLoad() {
    setMonthsBack((n) => (n === 0 ? MONTHS_BACK : n));
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Touchable
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={T.text} />
        </Touchable>
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
        extraData={cellExtraData}
        // Deliberately NO initialScrollIndex: the current month is index 0 on the
        // first paint, so there is nothing to scroll to. Asking FlashList to open
        // mid-list is what produced the wrong month — see the note on MONTHS_BACK.
        //
        // No maintainVisibleContentPosition config needed either: it is on by
        // default in v2, and it is what absorbs the prepend below (and "Show
        // earlier months") so the month on screen stays put.
        onLoad={handleListLoad}
        // Always rendered, so the header can never unmount and shift the grid
        // under the user — the button itself is what's conditional. (It used to
        // render only for full-access users, and vanished mid-layout for a free
        // one the moment the entitlement resolved.)
        ListHeaderComponent={
          <View style={styles.earlierSlot}>
            {canLoadEarlier && (
              <Touchable
                style={styles.earlierBtn}
                onPress={loadEarlierMonths}
                accessibilityLabel="Show earlier months"
              >
                <Ionicons name="chevron-up" size={14} color={T.textDim} />
                <Text style={styles.earlierText}>Show earlier months</Text>
              </Touchable>
            )}
          </View>
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

    // Fixed height whether or not the button is showing, so the header never
    // changes the offset of the first month.
    earlierSlot: { height: 46, justifyContent: 'center' },
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
