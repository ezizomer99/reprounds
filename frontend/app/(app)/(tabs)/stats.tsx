import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { BarChart } from 'react-native-gifted-charts';
import Body from 'react-native-body-highlighter';
import { useProGate } from '../../../src/hooks/useProGate';
import {
  nextMondayISO,
  weeksAgoMonday,
  avgPerWeekFromBuckets,
  weeklyBarLabel,
  statsRange,
  STATS_RANGES,
  bodyScale,
  BODY_BASE_SIZE,
  barSizing,
  cardState,
  type StatsRangeKey,
} from '../../../src/lib/statsHelpers';
import {
  useMuscleSummary,
  useTopLifts,
  useWeeklyStats,
  useWeekStreak,
} from '../../../src/hooks/useStats';
import { useTodayISO } from '../../../src/hooks/useTodayISO';
import { aggregateMuscles } from '../../../src/lib/muscleSlugMap';
import { parseLocalDate } from '../../../src/lib/calendar';
import { useUnit } from '../../../src/units/UnitContext';
import { fmtWeight, kgToUnit } from '../../../src/units/units';
import { Skeleton } from '../../../src/components/Skeleton';
import { InlineError } from '../../../src/components/InlineError';
import { ProLock } from '../../../src/components/stats/ProLock';
import { Section, SectionHeader, StatTile, Touchable } from '../../../src/components/ui';
import { MatStatsView } from '../../../src/components/stats/MatStatsView';
import { RecentNotesCard } from '../../../src/components/stats/RecentNotesCard';
import { PRFeedCard } from '../../../src/components/stats/PRFeedCard';
import { F, R, D, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { withAlpha } from '../../../src/lib/color';

// The tile font-scaling ceiling that used to live here is FONT_SCALE.tile now,
// applied inside StatTile — same 1.3 and the same reason (three flex:1 tiles in
// a fixed row, each holding a 24pt number, overflow at the 3.1x iOS allows),
// but no longer restated per screen. CELL_MAX_FONT_SCALE in the session screen's
// set grid is still its own, since that grid is not built from StatTile.

/** Width gifted-charts reserves for the y-axis labels before the bars start. */
const Y_AXIS_ALLOWANCE = 40;

/**
 * Key for the body map's three shades.
 *
 * aggregateMuscles buckets each muscle into intensity 1–3 relative to the
 * hardest-worked one, and nothing on the card said so — a user seeing a blue
 * chest and pale-green shoulders had no way to know that meant "more" rather
 * than "different". Three swatches and two words is the whole fix.
 */
function MuscleIntensityLegend({ colors, T }: { colors: string[]; T: ThemeColors }) {
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}
      accessible
      accessibilityLabel="Shading shows how much each muscle was trained, from less to more"
    >
      <Text style={{ fontFamily: F.ui, fontSize: 10, color: T.muted }}>Less</Text>
      {colors.map((c) => (
        <View
          key={c}
          style={{ width: 18, height: 8, borderRadius: 2, backgroundColor: c }}
          importantForAccessibility="no"
        />
      ))}
      <Text style={{ fontFamily: F.ui, fontSize: 10, color: T.muted }}>More</Text>
    </View>
  );
}

export default function StatsTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const queryClient = useQueryClient();
  // `isLoading` matters as much as `isPro`: a mid-race `isPro === false` is
  // indistinguishable from a genuine free user, so reading it alone flashed
  // lock icons and the upsell blur at every paying user on a cold start.
  const { isPro, isLoading: proLoading, showPaywall } = useProGate();
  const { unit } = useUnit();
  const [muscleView, setMuscleView] = useState<'front' | 'back'>('front');
  const [statsView, setStatsView] = useState<'gym' | 'mat'>('gym');
  // One range drives both halves of the tab, so switching Gym/Mat keeps it.
  const [rangeKey, setRangeKey] = useState<StatsRangeKey>('8w');
  const range = statsRange(rangeKey);

  // Local, not UTC: toISOString() sent the preceding Sunday as the window
  // start for anyone ahead of UTC, pulling an extra day into the summary.
  //
  // Derived from useTodayISO rather than frozen with an empty dep array: these
  // are query keys, so unlike the helpers below they do not self-correct on
  // re-render, and an app resumed the next morning kept asking for last week.
  const todayISO = useTodayISO();
  const rangeStart = useMemo(
    () => weeksAgoMonday(range.weeks, parseLocalDate(todayISO)),
    [range.weeks, todayISO],
  );
  const nextWeekMonday = useMemo(() => nextMondayISO(parseLocalDate(todayISO)), [todayISO]);
  // Pro content is only ever a paywall blur for a free user, so don't fetch it
  // for them — but wait for the gate to settle first: a mid-race `isPro ===
  // false` looks exactly like a genuine free user, and skipping the fetch on
  // that basis would leave a paying user on a permanent skeleton.
  const proContentEnabled = isPro && !proLoading;
  const {
    data: muscleData,
    isError: muscleError,
    refetch: refetchMuscles,
  } = useMuscleSummary(rangeStart, nextWeekMonday);
  const {
    data: topLiftsData,
    isError: topLiftsError,
    refetch: refetchTopLifts,
  } = useTopLifts(rangeStart, nextWeekMonday, proContentEnabled);
  const {
    data: weeklyData,
    isError: weeklyError,
    refetch: refetchWeekly,
  } = useWeeklyStats(rangeStart, range.weeks);
  const {
    data: streakData,
    isError: streakError,
    refetch: refetchStreak,
  } = useWeekStreak(todayISO);

  const weeks = useMemo(() => weeklyData?.weeks ?? [], [weeklyData]);
  // The newest bucket is the current week by construction — rangeStart is the
  // Monday `weeks - 1` weeks back, so the series always ends on this week.
  const thisWeek = weeks.length ? weeks[weeks.length - 1].sessions : 0;
  const avg = useMemo(() => avgPerWeekFromBuckets(weeks), [weeks]);

  const sessionBarData = useMemo(
    () =>
      weeks.map((w, i) => ({
        value: w.sessions,
        label: weeklyBarLabel(w.weekStart, i, weeks.length),
      })),
    [weeks],
  );
  const volumeBarData = useMemo(
    () =>
      weeks.map((w, i) => ({
        // Charted in the user's display unit so the axis matches every other
        // weight on screen; the API is always kg. Whole units — weekly tonnage
        // runs to thousands and a decimal place on the axis is noise.
        value: Math.round(kgToUnit(w.volumeKg, unit)),
        label: weeklyBarLabel(w.weekStart, i, weeks.length),
      })),
    [weeks, unit],
  );

  const bodyData = useMemo(
    () => aggregateMuscles(muscleData?.muscles ?? []),
    [muscleData],
  );

  // One hue, increasing saturation. This used to end on T.performance — a blue —
  // so the scale ran pale green → green → blue, and a hue jump at the top reads
  // as a different category rather than as "more". Memoized as well as recoloured:
  // a fresh array identity each render meant the ~30-path SVG could never be skipped.
  const muscleColors = useMemo(
    () => [withAlpha(T.primary, 0.35), withAlpha(T.primary, 0.7), T.primary],
    [T.primary],
  );

  // The body diagram is the one child on this screen with an intrinsic size the
  // library won't let us override, so it gets sized against the device instead
  // of trusting a constant to suit every phone.
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  // Bars are sized to fit the card rather than scrolled: gifted-charts draws its
  // y-axis inside the chart, so the horizontal ScrollView that used to wrap this
  // took the scale off screen with it. Y_AXIS_ALLOWANCE is the width its labels
  // occupy before the plot area starts.
  const bars = useMemo(
    () => barSizing(weeks.length, winWidth - 2 * D.pad - Y_AXIS_ALLOWANCE),
    [weeks.length, winWidth],
  );
  const bodyBox = useMemo(() => {
    const scale = bodyScale(winWidth, winHeight, D.pad);
    return {
      scale,
      width: Math.round(BODY_BASE_SIZE.width * scale),
      height: Math.round(BODY_BASE_SIZE.height * scale),
    };
  }, [winWidth, winHeight]);

  // Data beats an error everywhere on this tab — see cardState.
  const weeklyState = cardState(!!weeklyData, weeklyError);
  const muscleState = cardState(!!muscleData, muscleError);
  const topLiftsState = cardState(!!topLiftsData, topLiftsError);

  // Two different empty states, not one. `bodyData` is what survives slug
  // mapping, and muscleSlugMap deliberately maps 'cardio' and 'full body' to no
  // slug at all — so a month of conditioning, or of custom exercises tagged with
  // names the map doesn't know, produced an empty figure and the copy told a
  // user who had trained all month that they hadn't.
  const hasMuscles = bodyData.length > 0;
  const loggedUnmappedOnly = !hasMuscles && (muscleData?.muscles.length ?? 0) > 0;
  const hasSessions = weeks.some((w) => w.sessions > 0);
  const hasVolume = weeks.some((w) => w.volumeKg > 0);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Invalidate by prefix: ['stats'] covers muscles, top lifts, PRs, the weekly
    // buckets, the streak and the mat view's own query, so one pull refreshes
    // whichever half is showing. Every stats query holds a 5-minute staleTime,
    // so without this the tab had no way to force a refresh at all.
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: ['stats'] }),
      queryClient.invalidateQueries({ queryKey: ['notes'] }),
    ]);
    setRefreshing(false);
  }, [queryClient]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Stats</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={T.textDim}
            colors={[T.primary]}
          />
        }
      >
        {/* ── Gym / Martial Arts view toggle ── */}
        <View style={styles.segmentRow}>
          {(
            [
              { key: 'gym', label: 'Gym', icon: 'barbell-outline' },
              { key: 'mat', label: 'Martial Arts', icon: 'body-outline' },
            ] as const
          ).map((seg) => (
            <Touchable
              key={seg.key}
              style={[styles.segmentBtn, statsView === seg.key && styles.segmentBtnActive]}
              onPress={() => setStatsView(seg.key)}
              feedback="card"
              accessibilityLabel={`${seg.label} stats`}
              accessibilityState={{ selected: statsView === seg.key }}
            >
              <Ionicons
                name={seg.icon}
                size={15}
                color={statsView === seg.key ? T.onPrimary : T.textDim}
              />
              <Text
                style={[styles.segmentText, statsView === seg.key && styles.segmentTextActive]}
              >
                {seg.label}
              </Text>
            </Touchable>
          ))}
        </View>

        {/* ── Range ── */}
        <View style={styles.rangeRow}>
          {STATS_RANGES.map((r) => (
            <Touchable
              key={r.key}
              style={[styles.rangeBtn, rangeKey === r.key && styles.rangeBtnActive]}
              onPress={() => setRangeKey(r.key)}
              feedback="card"
              accessibilityLabel={r.longLabel}
              accessibilityState={{ selected: rangeKey === r.key }}
            >
              <Text style={[styles.rangeText, rangeKey === r.key && styles.rangeTextActive]}>
                {r.label}
              </Text>
            </Touchable>
          ))}
        </View>

        {statsView === 'mat' ? (
          <MatStatsView weeks={range.weeks} rangeLabel={range.longLabel} />
        ) : (
          <>
        {/* ── Highlights ── */}
        <Section>
          <SectionHeader title="Highlights" icon="star-outline" iconTone="gold" />

          {/* Gated on the weekly query alone. It used to also gate on the 200-row
              session list, which fed nothing here but the Pro-only streak — so a
              /sessions failure blanked "This Week" and "Avg/Week" even though
              both had loaded, and a free user lost two visible numbers to a
              query backing a locked tile. The streak degrades on its own below,
              and the muscle map and Top Lifts have their own error handling. */}
          {weeklyState === 'error' ? (
            <InlineError
              message="Couldn't load your gym stats."
              onRetry={() => void refetchWeekly()}
            />
          ) : weeklyState === 'loading' || proLoading ? (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <Skeleton width="30%" height={72} radius={12} />
              <Skeleton width="30%" height={72} radius={12} />
              <Skeleton width="30%" height={72} radius={12} />
            </View>
          ) : (
            <View style={styles.statCardsRow}>
              <StatTile
                tone="primary"
                value={thisWeek}
                label="This Week"
                accessibilityLabel={`${thisWeek} ${thisWeek === 1 ? 'session' : 'sessions'} this week`}
              />
              <StatTile
                tone="conditioning"
                value={isPro ? avg : <Ionicons name="lock-closed" size={18} color={T.conditioning} />}
                label="Avg/Week"
                onPress={isPro ? undefined : showPaywall}
                accessibilityLabel={
                  isPro
                    ? `${avg} sessions per week on average`
                    : 'Average sessions per week, locked — upgrade to Pro'
                }
              />
              {/* Was the length of the top-lifts list, which the endpoint caps at
                  10 — so it read "10" forever once you had ten lifts, a page size
                  dressed as a metric.

                  The number now comes from GET /stats/streak. Computing it here
                  meant downloading 200 session rows on every visit for one
                  integer, and the streak could only reach as far back as those
                  rows — ~40 weeks for someone training five times a week. It
                  degrades to "—" on its own rather than taking the row with it. */}
              {/* Free, like the week block on the Workout tab. It was locked
                  here and open there — the same number, behind a padlock on one
                  screen and printed on another. Of the two, the padlock was the
                  one that had to go: taking a number away from users who can
                  already see it is worse than giving up a lock nobody was
                  paying for. */}
              <StatTile
                tone="gold"
                value={streakData ? streakData.weeks : '—'}
                label="Week Streak"
                onPress={
                  streakError && !streakData
                    ? () => void refetchStreak()
                    : () => router.push('/history' as never)
                }
                accessibilityLabel={
                  streakData
                    ? `${streakData.weeks} week streak`
                    : 'Week streak unavailable, tap to retry'
                }
              />
            </View>
          )}
        </Section>

        {/* ── Muscles over the selected range (FREE) ── */}
        <Section>
          <SectionHeader
            title="Muscles Trained"
            subtitle={range.longLabel}
            icon="body-outline"
            iconTone="performance"
            right={
              <View style={styles.toggleRow}>
                {(['front', 'back'] as const).map((side) => {
                  const label = side.charAt(0).toUpperCase() + side.slice(1);
                  return (
                    <Touchable
                      key={side}
                      style={[styles.toggleBtn, muscleView === side && styles.toggleBtnActive]}
                      onPress={() => setMuscleView(side)}
                      feedback="card"
                      hitSlop={8}
                      accessibilityLabel={`${label} of body`}
                      accessibilityState={{ selected: muscleView === side }}
                    >
                      <Text style={[styles.toggleText, muscleView === side && styles.toggleTextActive]}>
                        {label}
                      </Text>
                    </Touchable>
                  );
                })}
              </View>
            }
          />

          {muscleState === 'error' ? (
            <InlineError
              message="Couldn't load your muscle breakdown."
              onRetry={() => void refetchMuscles()}
            />
          ) : muscleState === 'loading' ? (
            // Without this the empty copy below doubled as the loading state, so
            // a user who had trained this week was told to go train. Sized to the
            // figure it stands in for — at a fixed 140 × 220 it was half the real
            // thing, so the card jumped ~200 dp taller the moment data arrived.
            <View style={styles.bodyContainer}>
              <Skeleton width={bodyBox.width} height={bodyBox.height} radius={12} />
            </View>
          ) : hasMuscles ? (
            <View style={styles.bodyContainer}>
              <Body
                data={bodyData}
                side={muscleView}
                scale={bodyBox.scale}
                colors={muscleColors}
                border={T.border}
                defaultFill={T.surface2}
              />
              <MuscleIntensityLegend colors={muscleColors} T={T} />
            </View>
          ) : loggedUnmappedOnly ? (
            // Distinct from "you didn't train": conditioning and full-body work
            // is real training that maps to no muscle on the figure.
            <View style={styles.muscleEmpty}>
              <Text style={styles.muscleEmptyText}>
                Nothing in this range maps to a muscle group — cardio and full-body
                work don&apos;t shade the figure. Tag an exercise to see it here.
              </Text>
            </View>
          ) : (
            <View style={styles.muscleEmpty}>
              <Text style={styles.muscleEmptyText}>
                Log a gym workout in this range to see muscles trained.
              </Text>
            </View>
          )}
        </Section>

        {/* ── Sessions per Week (PRO) ── */}
        <Section>
          <SectionHeader
            title="Sessions per Week"
            subtitle={range.longLabel}
            icon="bar-chart-outline"
            iconTone="conditioning"
            right={!isPro && !proLoading ? <ProLock onPress={showPaywall} color={T.muted} /> : undefined}
          />

          {isPro || proLoading ? (
            // The error branch was missing here and on the volume chart below:
            // on a failed fetch `weeks` is empty, so `!hasSessions` was true and
            // the card told a user with years of history to go log a workout —
            // right under a Highlights card already showing the real error.
            weeklyState === 'error' ? (
              <InlineError
                message="Couldn't load your weekly sessions."
                onRetry={() => void refetchWeekly()}
              />
            ) : weeklyState === 'loading' || proLoading ? (
              <Skeleton width="100%" height={100} radius={8} />
            ) : !hasSessions ? (
              <Text style={styles.emptyText}>
                Log a few workouts to see how your weeks compare.
              </Text>
            ) : (
              <View style={{ marginTop: 8 }}>
                <BarChart
                  data={sessionBarData}
                  barWidth={bars.barWidth}
                  spacing={bars.spacing}
                  roundedTop
                  frontColor={T.conditioning}
                  gradientColor={withAlpha(T.conditioning, 0.5)}
                  isAnimated
                  height={100}
                  noOfSections={4}
                  yAxisColor="transparent"
                  xAxisColor={T.border}
                  yAxisTextStyle={{ color: T.muted, fontSize: 10, fontFamily: F.mono }}
                  xAxisLabelTextStyle={{ color: T.muted, fontSize: 8, fontFamily: F.uiMed }}
                  hideRules
                  barBorderRadius={4}
                  showGradient
                />
              </View>
            )
          ) : (
            <Touchable onPress={showPaywall} feedback="cta" haptic={false} hasTextChild>
              <View style={styles.proBlur}>
                <Text style={styles.proBlurText}>Upgrade to Pro to see your weekly activity chart</Text>
              </View>
            </Touchable>
          )}
        </Section>

        {/* ── Volume per Week (PRO) ──
            Session count says how often you showed up; tonnage says whether the
            work went anywhere. Same buckets as the chart above, so the two read
            against each other. */}
        <Section>
          <SectionHeader
            title="Volume per Week"
            subtitle={`${range.longLabel} · ${unit}`}
            icon="trending-up-outline"
            iconTone="performance"
            right={!isPro && !proLoading ? <ProLock onPress={showPaywall} color={T.muted} /> : undefined}
          />

          {isPro || proLoading ? (
            weeklyState === 'error' ? (
              <InlineError
                message="Couldn't load your weekly volume."
                onRetry={() => void refetchWeekly()}
              />
            ) : weeklyState === 'loading' || proLoading ? (
              <Skeleton width="100%" height={100} radius={8} />
            ) : !hasVolume ? (
              // Distinct from the sessions chart's empty copy: a month of
              // bodyweight or conditioning work is real training that logs no
              // tonnage, and shouldn't read as "you did nothing".
              <Text style={styles.emptyText}>
                Log sets with weight and reps to see your weekly tonnage.
              </Text>
            ) : (
              <View style={{ marginTop: 8 }}>
                <BarChart
                  data={volumeBarData}
                  barWidth={bars.barWidth}
                  spacing={bars.spacing}
                  roundedTop
                  frontColor={T.performance}
                  gradientColor={withAlpha(T.performance, 0.5)}
                  isAnimated
                  height={100}
                  noOfSections={4}
                  yAxisColor="transparent"
                  xAxisColor={T.border}
                  yAxisTextStyle={{ color: T.muted, fontSize: 10, fontFamily: F.mono }}
                  xAxisLabelTextStyle={{ color: T.muted, fontSize: 8, fontFamily: F.uiMed }}
                  hideRules
                  barBorderRadius={4}
                  showGradient
                />
              </View>
            )
          ) : (
            <Touchable onPress={showPaywall} feedback="cta" haptic={false} hasTextChild>
              <View style={styles.proBlur}>
                <Text style={styles.proBlurText}>Upgrade to Pro to see your weekly volume</Text>
              </View>
            </Touchable>
          )}
        </Section>

        {/* ── Top Lifts / PRs (PRO) ── */}
        <Section>
          {/* The range sub-label is not decoration: this board is scoped to the
              selected window like every other card, so a user's all-time bench
              drops off it at 4W. It was the only card that didn't say which
              window it was showing. */}
          <SectionHeader
            title="Top Lifts"
            subtitle={range.longLabel}
            icon="trophy-outline"
            iconTone="gold"
            right={!isPro && !proLoading ? <ProLock onPress={showPaywall} color={T.muted} /> : undefined}
          />

          {isPro || proLoading ? (
            topLiftsState === 'error' ? (
              <InlineError
                message="Couldn't load your top lifts."
                onRetry={() => void refetchTopLifts()}
              />
            ) : topLiftsState === 'loading' || proLoading || !topLiftsData ? (
              <View style={{ gap: 8, marginTop: 4 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} width="100%" height={40} radius={8} />
                ))}
              </View>
            ) : topLiftsData.lifts.length === 0 ? (
              <Text style={styles.emptyText}>Log workouts with weight + reps to see your top lifts.</Text>
            ) : (
              <View style={{ marginTop: 4 }}>
                {topLiftsData.lifts.map((lift, i) => (
                  <Touchable
                    key={lift.exerciseId}
                    style={[styles.liftRow, i < topLiftsData.lifts.length - 1 && styles.liftRowBorder]}
                    onPress={() => router.push({ pathname: '/history/exercise/[id]', params: { id: lift.exerciseId, name: lift.exerciseName } } as never)}
                    feedback="row"
                    haptic={false}
                    hasTextChild
                  >
                    <View style={styles.liftRank}>
                      <Text style={styles.liftRankText}>{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.liftName} numberOfLines={1}>{lift.exerciseName}</Text>
                      <Text style={styles.liftMeta}>
                        Best: {fmtWeight(lift.weight, unit)} {unit} × {lift.reps}
                      </Text>
                    </View>
                    <View style={styles.liftOneRM}>
                      <Text style={styles.liftOneRMVal}>
                        {fmtWeight(lift.estimatedOneRepMax, unit)} {unit}
                      </Text>
                      <Text style={styles.liftOneRMLabel}>est. 1RM</Text>
                    </View>
                  </Touchable>
                ))}
              </View>
            )
          ) : (
            <Touchable onPress={showPaywall} feedback="cta" haptic={false} hasTextChild>
              <View style={styles.proBlur}>
                <Text style={styles.proBlurText}>Upgrade to Pro to unlock PR tracking</Text>
              </View>
            </Touchable>
          )}
        </Section>

        {/* ── New PRs (PRO) ──
            Under Top Lifts by design: that board is your best ever, this is what
            actually moved inside the selected range. */}
        <PRFeedCard since={rangeStart} until={nextWeekMonday} rangeLabel={range.longLabel} />
          </>
        )}

        {/* ── Recent Notes (both views) ── */}
        <RecentNotesCard />

        {/* ── Body weight ── */}
        <Section density="row">
          <Touchable
            style={styles.catCard}
            onPress={() => router.push('/weight' as never)}
            feedback="card"
            haptic={false}
            hasTextChild
          >
          <View style={[styles.catIconBox, { backgroundColor: withAlpha(T.primary, 0.18) }]}>
            <Ionicons name="scale-outline" size={22} color={T.primary} />
          </View>
          <View style={styles.catBody}>
            <View style={styles.catTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.catTitle}>Body weight</Text>
                <Text style={styles.catSubtitle}>Track weigh-ins and trend over time</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={T.muted} />
            </View>
          </View>
          </Touchable>
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
    headerTitle: { fontFamily: F.uiBold, fontSize: 22, color: T.text, letterSpacing: -0.3 },

    scroll: { flex: 1 },
    body: { padding: D.pad, gap: D.stack },

    // Gym / Mat segmented control
    segmentRow: {
      flexDirection: 'row',
      backgroundColor: T.surface2,
      borderRadius: R.chip,
      padding: 3,
      gap: 3,
    },
    segmentBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 8,
      borderRadius: R.chip,
    },
    segmentBtnActive: { backgroundColor: T.primary },
    segmentText: { fontFamily: F.uiMed, fontSize: 13, color: T.textDim },
    segmentTextActive: { color: T.onPrimary, fontFamily: F.uiSemi },

    // Range selector — deliberately lighter than the Gym/Mat segment above it:
    // that switches what you're looking at, this only reframes it.
    rangeRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
    rangeBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 6,
      borderRadius: R.chip,
      borderWidth: 1,
      borderColor: T.border,
    },
    rangeBtnActive: { backgroundColor: withAlpha(T.primary, 0.14), borderColor: T.primary },
    rangeText: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim },
    rangeTextActive: { color: T.primary, fontFamily: F.uiSemi },

    // Broadsheet: sections are flat, separated by rules — not floating cards.

    statCardsRow: { flexDirection: 'row', gap: 8 },


    // Muscles card
    // Never squeezed: the header shrinks the title before it shrinks the control.
    toggleRow: { flexDirection: 'row', gap: 4, flexShrink: 0 },
    toggleBtn: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: R.chip,
      backgroundColor: T.surface2,
    },
    toggleBtnActive: { backgroundColor: T.primary },
    toggleText: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim },
    toggleTextActive: { color: T.onPrimary },
    bodyContainer: { alignItems: 'center', paddingVertical: 8 },
    muscleEmpty: { paddingVertical: 24, alignItems: 'center' },
    muscleEmptyText: {
      fontFamily: F.uiMed,
      fontSize: 13,
      color: T.muted,
      textAlign: 'center',
      paddingHorizontal: 16,
    },

    // Pro blur placeholder
    proBlur: {
      backgroundColor: T.surface2,
      borderRadius: R.sm,
      paddingVertical: 20,
      alignItems: 'center',
      marginTop: 4,
    },
    proBlurText: { fontFamily: F.uiMed, fontSize: 13, color: T.muted, textAlign: 'center', paddingHorizontal: 16 },

    // Top lifts
    liftRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
    },
    liftRowBorder: { borderBottomWidth: 1, borderBottomColor: T.border },
    liftRank: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: withAlpha(T.gold, 0.15),
      alignItems: 'center',
      justifyContent: 'center',
    },
    liftRankText: { fontFamily: F.monoBold, fontSize: 12, color: T.gold },
    liftName: { fontFamily: F.uiSemi, fontSize: 14, color: T.text },
    liftMeta: { fontFamily: F.uiMed, fontSize: 11, color: T.textDim, marginTop: 1 },
    liftOneRM: { alignItems: 'flex-end' },
    liftOneRMVal: { fontFamily: F.monoBold, fontSize: 17, color: T.text },
    liftOneRMLabel: { fontFamily: F.uiMed, fontSize: 10, color: T.muted },

    emptyText: { fontFamily: F.uiMed, fontSize: 13, color: T.muted, paddingVertical: 12 },

    // Body weight category row. The rule and vertical padding come from the
    // Section wrapping it — this is only the row layout.
    catCard: {
      flexDirection: 'row',
      gap: 14,
      alignItems: 'flex-start',
    },
    catIconBox: {
      width: 48,
      height: 48,
      borderRadius: R.sm,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    catBody: { flex: 1 },
    catTop: { flexDirection: 'row', alignItems: 'flex-start' },
    catTitle: { fontFamily: F.uiSemi, fontSize: 15, color: T.text, marginBottom: 2 },
    catSubtitle: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim },
  });
}
