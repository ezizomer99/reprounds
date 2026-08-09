import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MAX_SESSIONS_PAGE, useSessions, useSessionsInRange } from '../hooks/useSession';
import { useWeekStreak } from '../hooks/useStats';
import { cardState, computeWeekStreak, weekRangeOf } from '../lib/statsHelpers';
import { buildWeekStrip, WeekDayCell, weekSummary } from '../lib/weekStrip';
import { parseLocalDate } from '../lib/calendar';
import { useTodayISO } from '../hooks/useTodayISO';
import { F, R, ThemeColors } from '../theme/colors';
import { FONT_SCALE, TYPE } from '../theme/type';
import { useTheme } from '../theme/ThemeContext';
import { DayDots, DayDotsLegend, markerLabel } from './DayDots';
import { InlineError } from './InlineError';
import { Skeleton } from './Skeleton';
import { Section, SectionHeader, StatTile, Touchable } from './ui';

/**
 * How a day cell reads aloud: the date, then what is on it. Without this a
 * screen reader got seven unlabelled numbers — the dots carry the whole meaning
 * of the strip and are invisible to it.
 */
function dayA11yLabel(cell: WeekDayCell): string {
  const when = parseLocalDate(cell.isoDate).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const what =
    cell.markers.length === 0
      ? 'nothing logged'
      : cell.markers.map(markerLabel).join(', ') + (cell.overflow ? ', and more' : '');
  return `${when}, ${what}`;
}

function DayCell({ cell, onPress }: { cell: WeekDayCell; onPress: () => void }) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  return (
    <Touchable
      style={styles.dayCol}
      onPress={onPress}
      feedback="row"
      haptic={false}
      accessibilityLabel={dayA11yLabel(cell)}
    >
      <Text
        style={[styles.dayAbbrev, cell.isToday && styles.dayAbbrevActive]}
        maxFontSizeMultiplier={FONT_SCALE.tile}
      >
        {cell.abbrev}
      </Text>
      <View style={[styles.dayCircle, cell.isToday && styles.dayCircleActive]}>
        <Text
          style={[styles.dayNum, cell.isToday && styles.dayNumActive]}
          maxFontSizeMultiplier={FONT_SCALE.tile}
        >
          {cell.dayNum}
        </Text>
      </View>
      <DayDots markers={cell.markers} overflow={cell.overflow} />
    </Touchable>
  );
}

/**
 * The "this week" block, shared by the Workout and Martial Arts tabs: a seven-day
 * strip, a key for its dots, and the combined training streak.
 *
 * The strip and its summary line are one pass over one query (`buildWeekStrip`),
 * which is what stops the dots and the sentence above them from contradicting
 * each other, and what lets `in_progress`, `skipped` and overdue days render at
 * all. See src/lib/weekStrip.ts.
 *
 * Note this is no longer one big touch target. Every day opens its own day in
 * the calendar; the header's "View all" opens the calendar itself.
 */
export function WeekSection() {
  const { T } = useTheme();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(T), [T]);

  // Refreshed at midnight and on resume, so the strip advances and the "today"
  // highlight moves without needing the tab to be remounted.
  const todayISO = useTodayISO();
  const range = useMemo(() => weekRangeOf(todayISO), [todayISO]);

  // One source for everything on the strip. This sends no status filter, so it
  // returns completed, in-progress, planned and skipped alike — which is exactly
  // what the markers need, and why the old two-query split could be dropped.
  const {
    data: weekData,
    isError: weekError,
    refetch: refetchWeek,
  } = useSessionsInRange(range.from, range.to);

  const { days, counts } = useMemo(
    () => buildWeekStrip(todayISO, weekData?.sessions ?? []),
    [todayISO, weekData],
  );

  // The authoritative streak — the same GET /stats/streak the Stats tab reads,
  // so the two screens can't show different numbers for the same run. Falls
  // back to the local computation only while the request is in flight or has
  // failed, which is better than a flash of zero.
  const { data: sessions } = useSessions('completed', MAX_SESSIONS_PAGE);
  const { data: streakData } = useWeekStreak(todayISO);
  const localStreak = useMemo(
    () => computeWeekStreak((sessions ?? []).map((s) => s.date)),
    [sessions],
  );
  const streak = streakData?.weeks ?? localStreak;

  // All three numbers, one source. These used to be computed here over the
  // 200-row session list while the headline came from the server, so the row
  // showed two horizons side by side.
  //
  // No local fallback for these two: there isn't an honest one. The old local
  // computation is exactly what was wrong, and a dash says "not known yet",
  // which is true while the request is in flight and true against a Worker that
  // predates the fields.
  const gymStreak = streakData?.gymWeeks;
  const matStreak = streakData?.matWeeks;
  const wk = (n: number | undefined) => (n === undefined ? '—' : `${n} wk`);
  const wkLabel = (n: number | undefined, kind: string) =>
    n === undefined
      ? `${kind} streak unavailable`
      : `${n} week ${kind} streak`;

  // Gate on the week query, since that is what the strip draws. Cold-loading
  // used to render a real "0 weeks" and "log a session to start your streak" to
  // someone mid-streak; cardState keeps cached data on screen through a failed
  // background refetch and only shows an error when there is nothing behind it.
  const state = cardState(!!weekData, weekError);

  const legendMarkers = useMemo(() => days.flatMap((d) => d.markers), [days]);

  return (
    <Section>
      <SectionHeader
        title="This week"
        icon="calendar-outline"
        subtitle={state === 'ready' ? weekSummary(counts) : undefined}
        action={{
          label: 'View all',
          onPress: () => router.push('/calendar' as never),
          accessibilityLabel: 'Open calendar',
        }}
      />

      {state === 'loading' ? (
        <View style={styles.skeletonWrap}>
          <Skeleton height={54} radius={R.sm} />
          <View style={styles.chipRow}>
            <Skeleton height={52} radius={R.sm} style={styles.flex13} />
            <Skeleton height={52} radius={R.sm} style={styles.flex1} />
            <Skeleton height={52} radius={R.sm} style={styles.flex1} />
          </View>
        </View>
      ) : state === 'error' ? (
        <InlineError
          message="Couldn't load this week."
          onRetry={() => void refetchWeek()}
        />
      ) : (
        <>
          <View style={styles.strip}>
            {days.map((cell) => (
              <DayCell
                key={cell.isoDate}
                cell={cell}
                // Every day opens that day. Tapping Friday used to open the
                // calendar on the current month with nothing selected, because
                // the whole block was a single button.
                onPress={() =>
                  router.push({ pathname: '/calendar', params: { date: cell.isoDate } } as never)
                }
              />
            ))}
          </View>

          {/* A planned ring and a logged gym dot are both drawn in the primary
              colour and differ only by fill, at five pixels across. */}
          <DayDotsLegend markers={legendMarkers} style={styles.legend} />

          <View style={styles.chipRow}>
            <StatTile
              layout="inline"
              icon="flash"
              tone="primary"
              value={`${streak} wk`}
              label="current streak"
              accessibilityLabel={`${streak} week current streak`}
              style={styles.flex13}
            />
            <StatTile
              layout="inline"
              icon="barbell-outline"
              tone="primary"
              value={wk(gymStreak)}
              label="gym"
              accessibilityLabel={wkLabel(gymStreak, 'gym')}
            />
            <StatTile
              layout="inline"
              icon="body-outline"
              tone="grappling"
              value={wk(matStreak)}
              label="mat"
              accessibilityLabel={wkLabel(matStreak, 'mat')}
            />
          </View>
        </>
      )}
    </Section>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    strip: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    dayCol: { flex: 1, alignItems: 'center', gap: 5, paddingVertical: 2 },
    dayAbbrev: { fontFamily: F.uiMed, fontSize: 11, color: T.textDim, letterSpacing: 0.3 },
    dayAbbrevActive: { color: T.primary, fontFamily: F.uiBold },
    dayCircle: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayCircleActive: { backgroundColor: T.primary },
    dayNum: { ...TYPE.numSm, color: T.text },
    dayNumActive: { color: T.onPrimary },

    legend: { marginBottom: 14 },
    chipRow: { flexDirection: 'row', gap: 8 },
    // The streak chip carries the longest label, so it gets the extra share.
    flex13: { flex: 1.3 },
    flex1: { flex: 1 },
    skeletonWrap: { gap: 14 },
  });
}
