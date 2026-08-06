import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BarChart } from 'react-native-gifted-charts';
import type { StrikeWeapon, StrikingRoundType } from '@app/shared';
import { grapplingPositionLabel, submissionLabel } from '@app/shared';
import { useMatStats } from '../../hooks/useStats';
import { useProGate } from '../../hooks/useProGate';
import { useTodayISO } from '../../hooks/useTodayISO';
import { weeksAgoMonday, weeklyBarLabel } from '../../lib/statsHelpers';
import { Skeleton } from '../Skeleton';
import { InlineError } from '../InlineError';
import { F, R, ThemeColors } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { withAlpha } from '../../lib/color';
import { parseLocalDate } from '../../lib/calendar';

export interface MatStatsViewProps {
  /** Window length in Monday-aligned weeks, from the tab's range selector. */
  weeks: number;
  /** Human label for that window, e.g. "Last 8 weeks". */
  rangeLabel: string;
}

const ROUND_TYPE_LABELS: Record<StrikingRoundType, string> = {
  shadow: 'Shadow',
  bag: 'Bag',
  pads: 'Pads',
  sparring: 'Sparring',
  clinch: 'Clinch',
  drilling: 'Drilling',
};

const WEAPON_LABELS: Record<StrikeWeapon, string> = {
  jab: 'Jab',
  cross: 'Cross',
  hook: 'Hook',
  uppercut: 'Uppercut',
  teep: 'Teep',
  roundhouse: 'Roundhouse',
  knee: 'Knee',
  elbow: 'Elbow',
};

/** Sort a { key: count } map into the highest-count entries, capped at `limit`. */
function topEntries(map: Record<string, number> | undefined, limit: number): [string, number][] {
  return Object.entries(map ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function fmtMatTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function MatStatsView({ weeks, rangeLabel }: MatStatsViewProps) {
  const router = useRouter();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  // See the note in useProGate: a mid-race `isPro === false` looks exactly like
  // a free user, so reading it alone showed paying users the upsell blur first.
  const { isPro, isLoading: proLoading, showPaywall } = useProGate();

  // Re-derived when the day rolls over rather than frozen at mount. This is a
  // query key, so it does not self-correct on re-render the way the local
  // helpers do — an app resumed on Monday kept charting through last Sunday.
  const todayISO = useTodayISO();
  const since = useMemo(
    () => weeksAgoMonday(weeks, parseLocalDate(todayISO)),
    [weeks, todayISO],
  );
  const { data, isLoading, isError, refetch } = useMatStats(since, weeks);

  const barData = useMemo(
    () =>
      (data?.weeks ?? []).map((w, i, all) => ({
        value: w.rounds,
        // Shared with the gym charts so both axes thin out identically as the
        // range widens — 52 labels in a row is an unreadable smear.
        label: weeklyBarLabel(w.weekStart, i, all.length),
      })),
    [data],
  );

  const intensityTotal = data
    ? data.intensity.light + data.intensity.medium + data.intensity.hard + data.intensity.unspecified
    : 0;
  const intensitySegments = data
    ? (
        [
          { key: 'Light', count: data.intensity.light, color: T.conditioning },
          { key: 'Medium', count: data.intensity.medium, color: T.gold },
          { key: 'Hard', count: data.intensity.hard, color: T.primary },
          { key: 'Unrated', count: data.intensity.unspecified, color: T.muted },
        ] as const
      ).filter((s) => s.count > 0)
    : [];

  const grap = data?.grappling;
  const strik = data?.striking;
  const hasGrappling =
    !!grap &&
    (grap.rounds > 0 ||
      grap.submissionsFor > 0 ||
      grap.submissionsAgainst > 0 ||
      grap.sweeps > 0 ||
      grap.takedowns > 0 ||
      Object.keys(grap.positions ?? {}).length > 0);
  const hasStriking = !!strik && (strik.rounds > 0 || strik.totalStrikes > 0);
  // Requires `data`, not just `!isLoading`: a query paused offline is pending
  // without fetching, so `isLoading` is false while `data` is still undefined —
  // and "you haven't trained" is the wrong thing to tell someone on a plane.
  const isEmpty = !!data && data.totals.sessions === 0;
  const showSkeletons = isLoading || !data;

  // One guard above all four loading branches: a failed fetch used to render as
  // an all-zeroes view, indistinguishable from "you haven't trained".
  if (isError) {
    return <InlineError message="Couldn't load your mat stats." onRetry={() => void refetch()} />;
  }

  return (
    <>
      {/* ── Mat Highlights (FREE) ── */}
      <View style={styles.card}>
        <View style={styles.highlightsLabel}>
          <Ionicons name="star-outline" size={16} color={T.gold} />
          <Text style={styles.highlightsTitle}>Highlights</Text>
        </View>

        {showSkeletons ? (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <Skeleton width="30%" height={72} radius={12} />
            <Skeleton width="30%" height={72} radius={12} />
            <Skeleton width="30%" height={72} radius={12} />
          </View>
        ) : (
          <View style={styles.statCardsRow}>
            <View style={[styles.statCard, { backgroundColor: withAlpha(T.grappling, 0.12) }]}>
              <Text style={[styles.statCardNum, { color: T.grappling }]}>
                {data?.totals.rounds ?? 0}
              </Text>
              <Text style={[styles.statCardLabel, { color: T.grappling }]}>Rounds</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: withAlpha(T.conditioning, 0.12) }]}>
              <Text style={[styles.statCardNum, { color: T.conditioning }]}>
                {fmtMatTime(data?.totals.minutes ?? 0)}
              </Text>
              <Text style={[styles.statCardLabel, { color: T.conditioning }]}>Mat Time</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: withAlpha(T.gold, 0.12) }]}>
              <Text style={[styles.statCardNum, { color: T.gold }]}>
                {data?.totals.sessions ?? 0}
              </Text>
              <Text style={[styles.statCardLabel, { color: T.gold }]}>Sessions</Text>
            </View>
          </View>
        )}
        <Text style={styles.windowNote}>{rangeLabel}</Text>
      </View>

      {isEmpty ? (
        <View style={styles.card}>
          <View style={styles.emptyBox}>
            <Ionicons name="body-outline" size={28} color={T.muted} />
            <Text style={styles.emptyBoxText}>
              Log a martial arts session to see your mat stats.
            </Text>
          </View>
        </View>
      ) : (
        <>
          {/* ── Intensity Split (FREE) ── */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <View style={[styles.cardIconBox, { backgroundColor: withAlpha(T.primary, 0.15) }]}>
                  <Ionicons name="flame-outline" size={16} color={T.primary} />
                </View>
                <Text style={styles.cardTitle} numberOfLines={1}>Intensity Split</Text>
              </View>
            </View>

            {showSkeletons ? (
              <Skeleton width="100%" height={44} radius={8} />
            ) : intensityTotal === 0 ? (
              <Text style={styles.emptyText}>Rate your rounds to see the intensity mix.</Text>
            ) : (
              <>
                <View style={styles.intensityBar}>
                  {intensitySegments.map((s) => (
                    <View
                      key={s.key}
                      style={{ flex: s.count, backgroundColor: s.color }}
                    />
                  ))}
                </View>
                <View style={styles.intensityLegend}>
                  {intensitySegments.map((s) => (
                    <View key={s.key} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: s.color }]} />
                      <Text style={styles.legendText}>
                        {s.key} · {s.count}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>

          {/* ── Rounds per Week (PRO) ── */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <View style={[styles.cardIconBox, { backgroundColor: withAlpha(T.grappling, 0.15) }]}>
                  <Ionicons name="bar-chart-outline" size={16} color={T.grappling} />
                </View>
                <Text style={styles.cardTitle} numberOfLines={1}>Rounds per Week</Text>
              </View>
              {!isPro && !proLoading && (
                <TouchableOpacity onPress={showPaywall} activeOpacity={0.7}>
                  <Ionicons name="lock-closed" size={16} color={T.muted} />
                </TouchableOpacity>
              )}
            </View>

            {isPro || proLoading ? (
              showSkeletons || proLoading ? (
                <Skeleton width="100%" height={100} radius={8} />
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginTop: 8 }}
                >
                  <BarChart
                    data={barData}
                    barWidth={28}
                    spacing={8}
                    roundedTop
                    frontColor={T.grappling}
                    gradientColor={withAlpha(T.grappling, 0.5)}
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
                  <Text style={styles.proBlurText}>
                    Upgrade to Pro to see your weekly rounds chart
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          </View>

          {/* ── Sparring Numbers (PRO) ── */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <View style={[styles.cardIconBox, { backgroundColor: withAlpha(T.performance, 0.15) }]}>
                  <Ionicons name="fitness-outline" size={16} color={T.performance} />
                </View>
                <Text style={styles.cardTitle} numberOfLines={1}>Sparring Numbers</Text>
              </View>
              {!isPro && !proLoading && (
                <TouchableOpacity onPress={showPaywall} activeOpacity={0.7}>
                  <Ionicons name="lock-closed" size={16} color={T.muted} />
                </TouchableOpacity>
              )}
            </View>

            {isPro || proLoading ? (
              showSkeletons || proLoading ? (
                <View style={{ gap: 8, marginTop: 4 }}>
                  <Skeleton width="100%" height={40} radius={8} />
                  <Skeleton width="100%" height={40} radius={8} />
                </View>
              ) : !hasGrappling && !hasStriking ? (
                <Text style={styles.emptyText}>
                  Log rounds with submissions, takedowns, or strikes to see your numbers.
                </Text>
              ) : (
                <View style={{ gap: 14, marginTop: 4 }}>
                  {hasGrappling && grap && (
                    <View>
                      <Text style={styles.blockLabel}>Grappling · {grap.rounds} rounds</Text>
                      <View style={styles.numberGrid}>
                        <View style={styles.numberCell}>
                          <Text style={[styles.numberVal, { color: T.conditioning }]}>
                            {grap.submissionsFor}
                          </Text>
                          <Text style={styles.numberLabel}>Subs For</Text>
                        </View>
                        <View style={styles.numberCell}>
                          <Text style={[styles.numberVal, { color: T.danger }]}>
                            {grap.submissionsAgainst}
                          </Text>
                          <Text style={styles.numberLabel}>Subs Against</Text>
                        </View>
                        <View style={styles.numberCell}>
                          <Text style={[styles.numberVal, { color: T.grappling }]}>
                            {grap.sweeps}
                          </Text>
                          <Text style={styles.numberLabel}>Sweeps</Text>
                        </View>
                        <View style={styles.numberCell}>
                          <Text style={[styles.numberVal, { color: T.performance }]}>
                            {grap.takedowns}
                          </Text>
                          <Text style={styles.numberLabel}>Takedowns</Text>
                        </View>
                      </View>

                      {topEntries(grap.positions, 5).length > 0 && (
                        <View style={styles.subBlock}>
                          <Text style={styles.subBlockLabel}>Top positions</Text>
                          <View style={styles.chipRow}>
                            {topEntries(grap.positions, 5).map(([pos, n]) => (
                              <View key={pos} style={styles.chip}>
                                <Text style={styles.chipText}>
                                  {grapplingPositionLabel(pos)} · {n}
                                </Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}

                      {topEntries(grap.submissionsForByType, 4).length > 0 && (
                        <View style={styles.subBlock}>
                          <Text style={styles.subBlockLabel}>Most landed</Text>
                          <View style={styles.chipRow}>
                            {topEntries(grap.submissionsForByType, 4).map(([sub, n]) => (
                              <View key={sub} style={styles.chip}>
                                <Text style={styles.chipText}>
                                  {submissionLabel(sub)} · {n}
                                </Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}

                      {topEntries(grap.submissionsAgainstByType, 4).length > 0 && (
                        <View style={styles.subBlock}>
                          <Text style={styles.subBlockLabel}>Most tapped to</Text>
                          <View style={styles.chipRow}>
                            {topEntries(grap.submissionsAgainstByType, 4).map(([sub, n]) => (
                              <View key={sub} style={styles.chip}>
                                <Text style={styles.chipText}>
                                  {submissionLabel(sub)} · {n}
                                </Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}
                    </View>
                  )}

                  {hasStriking && strik && (
                    <View>
                      <Text style={styles.blockLabel}>Striking · {strik.rounds} rounds</Text>
                      {Object.keys(strik.roundsByType).length > 0 && (
                        <View style={styles.chipRow}>
                          {(Object.entries(strik.roundsByType) as [StrikingRoundType, number][]).map(
                            ([type, n]) => (
                              <View key={type} style={styles.chip}>
                                <Text style={styles.chipText}>
                                  {ROUND_TYPE_LABELS[type]} · {n}
                                </Text>
                              </View>
                            ),
                          )}
                        </View>
                      )}
                      {strik.totalStrikes > 0 && (
                        <View style={{ marginTop: 8 }}>
                          {(Object.entries(strik.strikes) as [StrikeWeapon, number][]).map(
                            ([weapon, n]) => (
                              <View key={weapon} style={styles.strikeRow}>
                                <Text style={styles.strikeName}>{WEAPON_LABELS[weapon]}</Text>
                                <Text style={styles.strikeCount}>{n}</Text>
                              </View>
                            ),
                          )}
                          <View style={[styles.strikeRow, styles.strikeTotalRow]}>
                            <Text style={[styles.strikeName, { color: T.text }]}>Total strikes</Text>
                            <Text style={[styles.strikeCount, { color: T.text }]}>
                              {strik.totalStrikes}
                            </Text>
                          </View>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              )
            ) : (
              <TouchableOpacity onPress={showPaywall} activeOpacity={0.85}>
                <View style={styles.proBlur}>
                  <Text style={styles.proBlurText}>
                    Upgrade to Pro to track your sparring numbers
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          </View>

          {/* ── Training partners (nav) ── */}
          <TouchableOpacity
            style={styles.partnersCard}
            onPress={() => router.push('/partners' as never)}
            activeOpacity={0.75}
          >
            <View style={[styles.cardIconBox, { backgroundColor: withAlpha(T.grappling, 0.15) }]}>
              <Ionicons name="people-outline" size={16} color={T.grappling} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle} numberOfLines={1}>Training partners</Text>
              <Text style={styles.partnersSub}>Who you roll with most, subs for & against</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={T.muted} />
          </TouchableOpacity>
        </>
      )}
    </>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    partnersCard: {
      borderTopWidth: 1,
      borderTopColor: T.borderStrong,
      paddingVertical: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    partnersSub: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim, marginTop: 2 },
    // Broadsheet: flat rule-separated section.
    card: {
      borderTopWidth: 1,
      borderTopColor: T.borderStrong,
      paddingTop: 14,
      paddingBottom: 4,
    },

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
    statCardNum: { fontFamily: F.monoBold, fontSize: 20 },
    statCardLabel: { fontFamily: F.uiMed, fontSize: 11, textAlign: 'center' },
    windowNote: { fontFamily: F.uiMed, fontSize: 11, color: T.muted, marginTop: 10, textAlign: 'center' },

    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    // Constrained and shrinkable, matching the Gym tab: an auto-width header row
    // whose title block carries `flex: 1` swells to the full width and pushes
    // whatever sits opposite it off the right edge.
    cardHeaderLeft: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardIconBox: {
      flexShrink: 0,
      width: 28,
      height: 28,
      borderRadius: R.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTitle: { fontFamily: F.uiBold, fontSize: 12, color: T.textDim, textTransform: 'uppercase', letterSpacing: 1 },

    intensityBar: {
      flexDirection: 'row',
      height: 14,
      borderRadius: 2,
      overflow: 'hidden',
      backgroundColor: T.surface2,
    },
    intensityLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim },

    proBlur: {
      backgroundColor: T.surface2,
      borderRadius: R.sm,
      paddingVertical: 20,
      alignItems: 'center',
      marginTop: 4,
    },
    proBlurText: { fontFamily: F.uiMed, fontSize: 13, color: T.muted, textAlign: 'center', paddingHorizontal: 16 },

    blockLabel: { fontFamily: F.uiSemi, fontSize: 13, color: T.textDim, marginBottom: 8 },
    subBlock: { marginTop: 12 },
    subBlockLabel: { fontFamily: F.uiMed, fontSize: 11, color: T.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
    numberGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    numberCell: {
      flexBasis: '47%',
      flexGrow: 1,
      backgroundColor: T.surface2,
      borderRadius: R.sm,
      paddingVertical: 12,
      alignItems: 'center',
      gap: 2,
    },
    numberVal: { fontFamily: F.monoBold, fontSize: 20 },
    numberLabel: { fontFamily: F.uiMed, fontSize: 11, color: T.textDim },

    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: {
      backgroundColor: T.surface2,
      borderRadius: R.chip,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    chipText: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim },

    strikeRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: T.border,
    },
    strikeTotalRow: { borderBottomWidth: 0, paddingTop: 8 },
    strikeName: { fontFamily: F.uiMed, fontSize: 13, color: T.textDim },
    strikeCount: { fontFamily: F.monoBold, fontSize: 14, color: T.textDim },

    emptyText: { fontFamily: F.uiMed, fontSize: 13, color: T.muted, paddingVertical: 12 },
    emptyBox: { alignItems: 'center', gap: 10, paddingVertical: 24 },
    emptyBoxText: {
      fontFamily: F.uiMed,
      fontSize: 13,
      color: T.muted,
      textAlign: 'center',
      paddingHorizontal: 16,
    },
  });
}
