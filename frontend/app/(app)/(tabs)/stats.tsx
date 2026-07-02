import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useState, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BarChart } from 'react-native-gifted-charts';
import Body from 'react-native-body-highlighter';
import type { Session } from '@app/shared';
import { useSessions } from '../../../src/hooks/useSession';
import { useProGate } from '../../../src/hooks/useProGate';
import { useMuscleSummary, useTopLifts } from '../../../src/hooks/useStats';
import { aggregateMuscles } from '../../../src/lib/muscleSlugMap';
import { useUnit } from '../../../src/units/UnitContext';
import { fmtWeight } from '../../../src/units/units';
import { Skeleton } from '../../../src/components/Skeleton';
import { F, R, D, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { withAlpha } from '../../../src/lib/color';

function mondayOf(d: Date): Date {
  const m = new Date(d);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  m.setHours(0, 0, 0, 0);
  return m;
}

function sessionsThisWeek(sessions: Session[]): number {
  const monday = mondayOf(new Date());
  return sessions.filter((s) => new Date(s.date + 'T00:00:00') >= monday).length;
}

function avgPerWeek(sessions: Session[], weeks = 4): number {
  if (!sessions.length) return 0;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - weeks * 7);
  const recent = sessions.filter((s) => new Date(s.date + 'T00:00:00') >= cutoff);
  return Math.round((recent.length / weeks) * 10) / 10;
}

function getWeeklyBarData(sessions: Session[], weeks = 8) {
  const now = new Date();
  return Array.from({ length: weeks }, (_, i) => {
    const weekStart = mondayOf(new Date(now));
    weekStart.setDate(weekStart.getDate() - (weeks - 1 - i) * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    const count = sessions.filter((s) => {
      const d = new Date(s.date + 'T00:00:00');
      return d >= weekStart && d < weekEnd;
    }).length;
    const label = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return { value: count, label: i === weeks - 1 ? 'This\nweek' : label };
  });
}

export default function StatsTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { isPro, showPaywall } = useProGate();
  const { unit } = useUnit();
  const [muscleView, setMuscleView] = useState<'front' | 'back'>('front');

  const { data: sessions, isLoading } = useSessions('completed');

  const thisWeekMonday = useMemo(() => mondayOf(new Date()).toISOString().slice(0, 10), []);
  const { data: muscleData } = useMuscleSummary(thisWeekMonday);
  const { data: topLiftsData } = useTopLifts();

  const thisWeek = useMemo(() => (sessions ? sessionsThisWeek(sessions) : 0), [sessions]);
  const avg = useMemo(() => (sessions ? avgPerWeek(sessions) : 0), [sessions]);

  const weeklyBarData = useMemo(() => getWeeklyBarData(sessions ?? []), [sessions]);

  const bodyData = useMemo(
    () => aggregateMuscles(muscleData?.muscles ?? []),
    [muscleData],
  );

  const hasMuscles = bodyData.length > 0;

  return (
    <Animated.View style={styles.screen} entering={FadeInDown.duration(280).springify()}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Stats</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Highlights ── */}
        <View style={styles.card}>
          <View style={styles.highlightsLabel}>
            <Ionicons name="star-outline" size={16} color={T.gold} />
            <Text style={styles.highlightsTitle}>Highlights</Text>
          </View>

          {isLoading ? (
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
              <TouchableOpacity
                style={[styles.statCard, { backgroundColor: withAlpha(T.gold, 0.12) }]}
                onPress={isPro ? () => router.push('/history' as never) : showPaywall}
                activeOpacity={0.7}
              >
                {isPro ? (
                  <>
                    <Text style={[styles.statCardNum, { color: T.gold }]}>
                      {topLiftsData?.lifts.length ?? 0}
                    </Text>
                    <Text style={[styles.statCardLabel, { color: T.gold }]}>Tracked</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="lock-closed" size={18} color={T.gold} />
                    <Text style={[styles.statCardLabel, { color: T.gold }]}>PRs</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── Muscles This Week (FREE) ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <View style={[styles.cardIconBox, { backgroundColor: withAlpha(T.performance, 0.15) }]}>
                <Ionicons name="body-outline" size={16} color={T.performance} />
              </View>
              <Text style={styles.cardTitle}>Muscles This Week</Text>
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

          {hasMuscles ? (
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
                Log a gym workout this week to see muscles trained.
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
              <Text style={styles.cardTitle}>Sessions per Week</Text>
            </View>
            {!isPro && (
              <TouchableOpacity onPress={showPaywall} activeOpacity={0.7}>
                <Ionicons name="lock-closed" size={16} color={T.muted} />
              </TouchableOpacity>
            )}
          </View>

          {isPro ? (
            isLoading ? (
              <Skeleton width="100%" height={100} radius={8} />
            ) : (
              <View style={{ marginTop: 8, overflow: 'hidden' }}>
                <BarChart
                  data={weeklyBarData}
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
              </View>
            )
          ) : (
            <TouchableOpacity onPress={showPaywall} activeOpacity={0.85}>
              <View style={styles.proBlur}>
                <Text style={styles.proBlurText}>Upgrade to Pro to see your weekly activity chart</Text>
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
            {!isPro && (
              <TouchableOpacity onPress={showPaywall} activeOpacity={0.7}>
                <Ionicons name="lock-closed" size={16} color={T.muted} />
              </TouchableOpacity>
            )}
          </View>

          {isPro ? (
            !topLiftsData ? (
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
                      <Text style={styles.liftOneRMVal}>{fmtWeight(lift.estimatedOneRepMax, unit)}</Text>
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
    headerTitle: { fontFamily: F.uiBold, fontSize: 22, color: T.text, letterSpacing: -0.3 },

    scroll: { flex: 1 },
    body: { padding: D.pad, gap: D.stack },

    card: {
      backgroundColor: T.surface,
      borderWidth: 1,
      borderColor: T.border,
      borderRadius: R.card,
      padding: D.cardPad,
    },

    // Highlights card
    highlightsLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
    highlightsTitle: { fontFamily: F.uiBold, fontSize: 16, color: T.text },
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
    cardTitle: { fontFamily: F.uiSemi, fontSize: 15, color: T.text },

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
      backgroundColor: T.surface,
      borderWidth: 1,
      borderColor: T.border,
      borderRadius: R.card,
      padding: D.cardPad,
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
