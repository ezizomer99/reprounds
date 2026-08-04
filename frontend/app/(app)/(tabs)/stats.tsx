import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { BarChart } from 'react-native-gifted-charts';
import Body from 'react-native-body-highlighter';
import { MAX_SESSIONS_PAGE, useSessions } from '../../../src/hooks/useSession';
import { useProGate } from '../../../src/hooks/useProGate';
import {
  nextMondayISO,
  weeksAgoMonday,
  computeWeekStreak,
  avgPerWeekFromBuckets,
  weeklyBarLabel,
  statsRange,
  STATS_RANGES,
  type StatsRangeKey,
} from '../../../src/lib/statsHelpers';
import { useMuscleSummary, useTopLifts, useWeeklyStats } from '../../../src/hooks/useStats';
import { useTodayISO } from '../../../src/hooks/useTodayISO';
import { aggregateMuscles } from '../../../src/lib/muscleSlugMap';
import { parseLocalDate } from '../../../src/lib/calendar';
import { useUnit } from '../../../src/units/UnitContext';
import { fmtWeight, kgToUnit } from '../../../src/units/units';
import { Skeleton } from '../../../src/components/Skeleton';
import { InlineError } from '../../../src/components/InlineError';
import { MatStatsView } from '../../../src/components/stats/MatStatsView';
import { RecentNotesCard } from '../../../src/components/stats/RecentNotesCard';
import { PRFeedCard } from '../../../src/components/stats/PRFeedCard';
import { F, R, D, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { withAlpha } from '../../../src/lib/color';

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

  // Still fetched, but only for the streak: a streak can reach back further than
  // the selected range, so it can't come from the range's buckets. Everything
  // else on this screen now reads server-side aggregates, which stay correct
  // past the 200-session page cap this list is subject to.
  const { data: sessions, isLoading, isError, refetch } = useSessions('completed', MAX_SESSIONS_PAGE);

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
  const {
    data: muscleData,
    isLoading: muscleLoading,
    isError: muscleError,
    refetch: refetchMuscles,
  } = useMuscleSummary(rangeStart, nextWeekMonday);
  const {
    data: topLiftsData,
    isLoading: topLiftsLoading,
    isError: topLiftsError,
    refetch: refetchTopLifts,
  } = useTopLifts(rangeStart);
  const {
    data: weeklyData,
    isLoading: weeklyLoading,
    isError: weeklyError,
    refetch: refetchWeekly,
  } = useWeeklyStats(rangeStart, range.weeks);

  const weeks = useMemo(() => weeklyData?.weeks ?? [], [weeklyData]);
  // The newest bucket is the current week by construction — rangeStart is the
  // Monday `weeks - 1` weeks back, so the series always ends on this week.
  const thisWeek = weeks.length ? weeks[weeks.length - 1].sessions : 0;
  const avg = useMemo(() => avgPerWeekFromBuckets(weeks), [weeks]);
  const streak = useMemo(
    () => (sessions ? computeWeekStreak(sessions.map((s) => s.date)) : 0),
    [sessions],
  );

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

  const hasMuscles = bodyData.length > 0;
  const hasSessions = weeks.some((w) => w.sessions > 0);
  const hasVolume = weeks.some((w) => w.volumeKg > 0);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Invalidate by prefix rather than calling each refetch: ['stats'] covers
    // muscles, top lifts and the mat view's own query, so one pull refreshes
    // whichever half is showing. Until now the tab had no way to force this at
    // all — every stats query holds a 5-minute staleTime.
    await Promise.allSettled([
      refetch(),
      queryClient.invalidateQueries({ queryKey: ['stats'] }),
      queryClient.invalidateQueries({ queryKey: ['notes'] }),
    ]);
    setRefreshing(false);
  }, [refetch, queryClient]);

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
            <TouchableOpacity
              key={seg.key}
              style={[styles.segmentBtn, statsView === seg.key && styles.segmentBtnActive]}
              onPress={() => setStatsView(seg.key)}
              activeOpacity={0.8}
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
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Range ── */}
        <View style={styles.rangeRow}>
          {STATS_RANGES.map((r) => (
            <TouchableOpacity
              key={r.key}
              style={[styles.rangeBtn, rangeKey === r.key && styles.rangeBtnActive]}
              onPress={() => setRangeKey(r.key)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={r.longLabel}
              accessibilityState={{ selected: rangeKey === r.key }}
            >
              <Text style={[styles.rangeText, rangeKey === r.key && styles.rangeTextActive]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {statsView === 'mat' ? (
          <MatStatsView weeks={range.weeks} rangeLabel={range.longLabel} />
        ) : (
          <>
        {/* ── Highlights ── */}
        <View style={styles.card}>
          <View style={styles.highlightsLabel}>
            <Ionicons name="star-outline" size={16} color={T.gold} />
            <Text style={styles.highlightsTitle}>Highlights</Text>
          </View>

          {/* The error guard sits here, not around the whole gym view: the muscle
              map and Top Lifts are separate queries with their own error and
              retry handling, and blanking them on a failed fetch here hid data
              that had loaded fine. */}
          {weeklyError || isError ? (
            <InlineError
              message="Couldn't load your gym stats."
              onRetry={() => {
                void refetch();
                void refetchWeekly();
              }}
            />
          ) : weeklyLoading || isLoading || proLoading ? (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <Skeleton width="30%" height={72} radius={12} />
              <Skeleton width="30%" height={72} radius={12} />
              <Skeleton width="30%" height={72} radius={12} />
            </View>
          ) : (
            <View style={styles.statCardsRow}>
              <View style={[styles.statCard, { backgroundColor: withAlpha(T.primary, 0.12) }]}>
                <Text style={[styles.statCardNum, { color: T.primary }]}>{thisWeek}</Text>
                <Text style={[styles.statCardLabel, { color: T.primary }]}>This Week</Text>
              </View>
              <TouchableOpacity
                style={[styles.statCard, { backgroundColor: withAlpha(T.conditioning, 0.12) }]}
                onPress={isPro ? undefined : showPaywall}
                activeOpacity={isPro ? 1 : 0.7}
              >
                {isPro ? (
                  <>
                    <Text style={[styles.statCardNum, { color: T.conditioning }]}>{avg}</Text>
                    <Text style={[styles.statCardLabel, { color: T.conditioning }]}>Avg/Week</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="lock-closed" size={18} color={T.conditioning} />
                    <Text style={[styles.statCardLabel, { color: T.conditioning }]}>Avg/Week</Text>
                  </>
                )}
              </TouchableOpacity>
              {/* Was the length of the top-lifts list, which the endpoint caps at
                  10 — so it read "10" forever once you had ten lifts, a page size
                  dressed as a metric. The week streak is a real number and the
                  helper behind it (grace for an untrained current week) already
                  exists and is tested. */}
              <TouchableOpacity
                style={[styles.statCard, { backgroundColor: withAlpha(T.gold, 0.12) }]}
                onPress={isPro ? () => router.push('/history' as never) : showPaywall}
                activeOpacity={0.7}
              >
                {isPro ? (
                  <>
                    <Text style={[styles.statCardNum, { color: T.gold }]}>{streak}</Text>
                    <Text style={[styles.statCardLabel, { color: T.gold }]}>Week Streak</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="lock-closed" size={18} color={T.gold} />
                    <Text style={[styles.statCardLabel, { color: T.gold }]}>Streak</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── Muscles over the selected range (FREE) ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <View style={[styles.cardIconBox, { backgroundColor: withAlpha(T.performance, 0.15) }]}>
                <Ionicons name="body-outline" size={16} color={T.performance} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Muscles Trained</Text>
                <Text style={styles.cardSub}>{range.longLabel}</Text>
              </View>
            </View>
            <View style={styles.toggleRow}>
              {(['front', 'back'] as const).map((side) => (
                <TouchableOpacity
                  key={side}
                  style={[styles.toggleBtn, muscleView === side && styles.toggleBtnActive]}
                  onPress={() => setMuscleView(side)}
                >
                  <Text style={[styles.toggleText, muscleView === side && styles.toggleTextActive]}>
                    {side.charAt(0).toUpperCase() + side.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {muscleError ? (
            <InlineError
              message="Couldn't load your muscle breakdown."
              onRetry={() => void refetchMuscles()}
            />
          ) : muscleLoading ? (
            // Without this the empty copy below doubled as the loading state, so
            // a user who had trained this week was told to go train.
            <View style={styles.bodyContainer}>
              <Skeleton width={140} height={220} radius={12} />
            </View>
          ) : hasMuscles ? (
            <View style={styles.bodyContainer}>
              <Body
                data={bodyData}
                side={muscleView}
                scale={1.1}
                colors={[withAlpha(T.primary, 0.4), T.primary, T.performance]}
                border={T.border}
                defaultFill={T.surface2}
              />
            </View>
          ) : (
            <View style={styles.muscleEmpty}>
              <Text style={styles.muscleEmptyText}>
                Log a gym workout in this range to see muscles trained.
              </Text>
            </View>
          )}
        </View>

        {/* ── Sessions per Week (PRO) ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <View style={[styles.cardIconBox, { backgroundColor: withAlpha(T.conditioning, 0.15) }]}>
                <Ionicons name="bar-chart-outline" size={16} color={T.conditioning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Sessions per Week</Text>
                <Text style={styles.cardSub}>{range.longLabel}</Text>
              </View>
            </View>
            {!isPro && !proLoading && (
              <TouchableOpacity onPress={showPaywall} activeOpacity={0.7}>
                <Ionicons name="lock-closed" size={16} color={T.muted} />
              </TouchableOpacity>
            )}
          </View>

          {isPro || proLoading ? (
            weeklyLoading || proLoading ? (
              <Skeleton width="100%" height={100} radius={8} />
            ) : !hasSessions ? (
              <Text style={styles.emptyText}>
                Log a few workouts to see how your weeks compare.
              </Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginTop: 8 }}
              >
                <BarChart
                  data={sessionBarData}
                  barWidth={28}
                  spacing={8}
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
              </ScrollView>
            )
          ) : (
            <TouchableOpacity onPress={showPaywall} activeOpacity={0.85}>
              <View style={styles.proBlur}>
                <Text style={styles.proBlurText}>Upgrade to Pro to see your weekly activity chart</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Volume per Week (PRO) ──
            Session count says how often you showed up; tonnage says whether the
            work went anywhere. Same buckets as the chart above, so the two read
            against each other. */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <View style={[styles.cardIconBox, { backgroundColor: withAlpha(T.performance, 0.15) }]}>
                <Ionicons name="trending-up-outline" size={16} color={T.performance} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Volume per Week</Text>
                <Text style={styles.cardSub}>{range.longLabel} · {unit}</Text>
              </View>
            </View>
            {!isPro && !proLoading && (
              <TouchableOpacity onPress={showPaywall} activeOpacity={0.7}>
                <Ionicons name="lock-closed" size={16} color={T.muted} />
              </TouchableOpacity>
            )}
          </View>

          {isPro || proLoading ? (
            weeklyLoading || proLoading ? (
              <Skeleton width="100%" height={100} radius={8} />
            ) : !hasVolume ? (
              // Distinct from the sessions chart's empty copy: a month of
              // bodyweight or conditioning work is real training that logs no
              // tonnage, and shouldn't read as "you did nothing".
              <Text style={styles.emptyText}>
                Log sets with weight and reps to see your weekly tonnage.
              </Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginTop: 8 }}
              >
                <BarChart
                  data={volumeBarData}
                  barWidth={28}
                  spacing={8}
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
              </ScrollView>
            )
          ) : (
            <TouchableOpacity onPress={showPaywall} activeOpacity={0.85}>
              <View style={styles.proBlur}>
                <Text style={styles.proBlurText}>Upgrade to Pro to see your weekly volume</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Top Lifts / PRs (PRO) ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <View style={[styles.cardIconBox, { backgroundColor: withAlpha(T.gold, 0.15) }]}>
                <Ionicons name="trophy-outline" size={16} color={T.gold} />
              </View>
              <Text style={styles.cardTitle}>Top Lifts</Text>
            </View>
            {!isPro && !proLoading && (
              <TouchableOpacity onPress={showPaywall} activeOpacity={0.7}>
                <Ionicons name="lock-closed" size={16} color={T.muted} />
              </TouchableOpacity>
            )}
          </View>

          {isPro || proLoading ? (
            topLiftsError ? (
              <InlineError
                message="Couldn't load your top lifts."
                onRetry={() => void refetchTopLifts()}
              />
            ) : topLiftsLoading || proLoading || !topLiftsData ? (
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
                  <TouchableOpacity
                    key={lift.exerciseId}
                    style={[styles.liftRow, i < topLiftsData.lifts.length - 1 && styles.liftRowBorder]}
                    onPress={() => router.push({ pathname: '/history/exercise/[id]', params: { id: lift.exerciseId, name: lift.exerciseName } } as never)}
                    activeOpacity={0.7}
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
                  </TouchableOpacity>
                ))}
              </View>
            )
          ) : (
            <TouchableOpacity onPress={showPaywall} activeOpacity={0.85}>
              <View style={styles.proBlur}>
                <Text style={styles.proBlurText}>Upgrade to Pro to unlock PR tracking</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* ── New PRs (PRO) ──
            Under Top Lifts by design: that board is your best ever, this is what
            actually moved inside the selected range. */}
        <PRFeedCard since={rangeStart} rangeLabel={range.longLabel} />
          </>
        )}

        {/* ── Recent Notes (both views) ── */}
        <RecentNotesCard />

        {/* ── Body weight ── */}
        <TouchableOpacity
          style={styles.catCard}
          onPress={() => router.push('/weight' as never)}
          activeOpacity={0.75}
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
        </TouchableOpacity>
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
    card: {
      borderTopWidth: 1,
      borderTopColor: T.borderStrong,
      paddingTop: 14,
      paddingBottom: 4,
    },

    // Highlights card
    highlightsLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
    highlightsTitle: { fontFamily: F.uiBold, fontSize: 12, color: T.textDim, textTransform: 'uppercase', letterSpacing: 1 },
    statCardsRow: { flexDirection: 'row', gap: 8 },
    statCard: {
      flex: 1,
      borderRadius: R.sm,
      paddingVertical: 14,
      alignItems: 'center',
      gap: 4,
    },
    statCardNum: { fontFamily: F.monoBold, fontSize: 24 },
    statCardLabel: { fontFamily: F.uiMed, fontSize: 11, textAlign: 'center' },

    // Shared card header
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardIconBox: {
      width: 28,
      height: 28,
      borderRadius: R.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTitle: { fontFamily: F.uiBold, fontSize: 12, color: T.textDim, textTransform: 'uppercase', letterSpacing: 1 },
    // Names the window a card is showing, so no title has to claim "this week".
    cardSub: { fontFamily: F.ui, fontSize: 11, color: T.muted, marginTop: 2 },

    // Muscles card
    toggleRow: { flexDirection: 'row', gap: 4 },
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

    // Body weight category card
    catCard: {
      borderTopWidth: 1,
      borderTopColor: T.borderStrong,
      paddingVertical: 14,
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
