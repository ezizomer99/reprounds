import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BarChart } from 'react-native-gifted-charts';
import type { StrikeWeapon, StrikingRoundType } from '@app/shared';
import { grapplingPositionLabel, submissionLabel } from '@app/shared';
import { useMatStats } from '../../hooks/useStats';
import { useProGate } from '../../hooks/useProGate';
import { useTodayISO } from '../../hooks/useTodayISO';
import { barSizing, cardState, weeksAgoMonday, weeklyBarLabel } from '../../lib/statsHelpers';
import { Skeleton } from '../Skeleton';
import { InlineError } from '../InlineError';
import { Section, SectionHeader, StatTile, Touchable } from '../ui';
import { ProLock } from './ProLock';
import { D, F, R, ThemeColors } from '../../theme/colors';
import { TYPE } from '../../theme/type';
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

/** Width gifted-charts reserves for its y-axis labels before the plot area starts. */
const Y_AXIS_ALLOWANCE = 40;

// The tile font-scaling ceiling that used to live here is FONT_SCALE.tile now,
// applied inside StatTile — same 1.3, for the same reason (three flex:1 tiles in
// a fixed row, one holding "12h 30m", overflow at the 3.1× iOS allows), but no
// longer restated per screen.

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
  const { data, isError, refetch } = useMatStats(since, weeks);
  const state = cardState(!!data, isError);

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

  // Sized to fit rather than scrolled, same as the gym charts: gifted-charts
  // draws its y-axis inside the chart, so a horizontal ScrollView around it took
  // the scale off screen after the first swipe.
  const { width: winWidth } = useWindowDimensions();
  const bars = useMemo(
    () => barSizing(barData.length, winWidth - 2 * D.pad - Y_AXIS_ALLOWANCE),
    [barData.length, winWidth],
  );

  const intensity = useMemo(() => {
    if (!data) return { total: 0, segments: [] as { key: string; count: number; color: string }[] };
    const { light, medium, hard, unspecified } = data.intensity;
    return {
      total: light + medium + hard + unspecified,
      segments: [
        { key: 'Light', count: light, color: T.conditioning },
        { key: 'Medium', count: medium, color: T.gold },
        { key: 'Hard', count: hard, color: T.primary },
        { key: 'Unrated', count: unspecified, color: T.muted },
      ].filter((s) => s.count > 0),
    };
  }, [data, T.conditioning, T.gold, T.primary, T.muted]);
  const intensityTotal = intensity.total;
  const intensitySegments = intensity.segments;

  const grap = data?.grappling;
  const strik = data?.striking;

  // Computed once. Each of these used to be called twice per render — once to
  // test `.length > 0` and again to map — so every breakdown sorted its map
  // twice on every render, including theme changes and Pro-state settling.
  const breakdown = useMemo(
    () => ({
      positions: topEntries(grap?.positions, 5),
      submissionsFor: topEntries(grap?.submissionsForByType, 4),
      submissionsAgainst: topEntries(grap?.submissionsAgainstByType, 4),
      roundTypes: topEntries(strik?.roundsByType, 6).filter(([k]) => k in ROUND_TYPE_LABELS),
      strikes: topEntries(strik?.strikes, 8).filter(([k]) => k in WEAPON_LABELS),
    }),
    [grap, strik],
  );
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
  const showSkeletons = state === 'loading';

  // One guard above all four loading branches: a failed fetch used to render as
  // an all-zeroes view, indistinguishable from "you haven't trained".
  //
  // `state`, not `isError`: this is an early return, so keying it off the error
  // flag alone meant a failed *background* refetch wiped the entire Mat view —
  // the cache is persisted for 24 hours, so there was usually good data behind
  // it. It also renders inside the card frame now; every other state on this tab
  // sits under the broadsheet rule and this one hung above it.
  if (state === 'error') {
    return (
      <Section>
        <InlineError message="Couldn't load your mat stats." onRetry={() => void refetch()} />
      </Section>
    );
  }

  return (
    <>
      {/* ── Mat Highlights (FREE) ── */}
      <Section>
        <SectionHeader title="Highlights" icon="star-outline" iconTone="gold" />

        {showSkeletons ? (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <Skeleton width="30%" height={72} radius={12} />
            <Skeleton width="30%" height={72} radius={12} />
            <Skeleton width="30%" height={72} radius={12} />
          </View>
        ) : (
          <View style={styles.statCardsRow}>
            <StatTile tone="grappling" emphasis="md" value={data?.totals.rounds ?? 0} label="Rounds" />
            <StatTile
              tone="conditioning"
              emphasis="md"
              value={fmtMatTime(data?.totals.minutes ?? 0)}
              label="Mat Time"
            />
            <StatTile tone="gold" emphasis="md" value={data?.totals.sessions ?? 0} label="Sessions" />
          </View>
        )}
        <Text style={styles.windowNote}>{rangeLabel}</Text>
      </Section>

      {isEmpty ? (
        <Section>
          <View style={styles.emptyBox}>
            <Ionicons name="body-outline" size={28} color={T.muted} />
            <Text style={styles.emptyBoxText}>
              Log a martial arts session to see your mat stats.
            </Text>
          </View>
        </Section>
      ) : (
        <>
          {/* ── Intensity Split (FREE) ── */}
          <Section>
            <SectionHeader
              title="Intensity Split"
              icon="flame-outline"
              iconTone="primary"
            />

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
          </Section>

          {/* ── Rounds per Week (PRO) ── */}
          <Section>
            <SectionHeader
              title="Rounds per Week"
              icon="bar-chart-outline"
              iconTone="grappling"
              right={!isPro && !proLoading ? <ProLock onPress={showPaywall} color={T.muted} /> : undefined}
            />

            {isPro || proLoading ? (
              showSkeletons || proLoading ? (
                <Skeleton width="100%" height={100} radius={8} />
              ) : (
                <View style={{ marginTop: 8 }}>
                  <BarChart
                    data={barData}
                    barWidth={bars.barWidth}
                    spacing={bars.spacing}
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
                </View>
              )
            ) : (
              <Touchable onPress={showPaywall} feedback="cta" haptic={false} hasTextChild>
                <View style={styles.proBlur}>
                  <Text style={styles.proBlurText}>
                    Upgrade to Pro to see your weekly rounds chart
                  </Text>
                </View>
              </Touchable>
            )}
          </Section>

          {/* ── Sparring Numbers (PRO) ── */}
          <Section>
            <SectionHeader
              title="Sparring Numbers"
              icon="fitness-outline"
              iconTone="performance"
              right={!isPro && !proLoading ? <ProLock onPress={showPaywall} color={T.muted} /> : undefined}
            />

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

                      {breakdown.positions.length > 0 && (
                        <View style={styles.subBlock}>
                          <Text style={styles.subBlockLabel}>Top positions</Text>
                          <View style={styles.chipRow}>
                            {breakdown.positions.map(([pos, n]) => (
                              <View key={pos} style={styles.chip}>
                                <Text style={styles.chipText}>
                                  {grapplingPositionLabel(pos)} · {n}
                                </Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}

                      {breakdown.submissionsFor.length > 0 && (
                        <View style={styles.subBlock}>
                          <Text style={styles.subBlockLabel}>Most landed</Text>
                          <View style={styles.chipRow}>
                            {breakdown.submissionsFor.map(([sub, n]) => (
                              <View key={sub} style={styles.chip}>
                                <Text style={styles.chipText}>
                                  {submissionLabel(sub)} · {n}
                                </Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}

                      {breakdown.submissionsAgainst.length > 0 && (
                        <View style={styles.subBlock}>
                          <Text style={styles.subBlockLabel}>Most tapped to</Text>
                          <View style={styles.chipRow}>
                            {breakdown.submissionsAgainst.map(([sub, n]) => (
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
                      {/* Sorted and label-guarded, like every other breakdown on
                          this card. These two came straight off Object.entries,
                          so their order was whichever weapon or round type
                          happened to appear first in the backend fold — and a
                          key outside the label maps (an older or newer schema
                          variant) rendered a blank row rather than being
                          skipped. topEntries handles both. */}
                      {breakdown.roundTypes.length > 0 && (
                        <View style={styles.chipRow}>
                          {breakdown.roundTypes
                            .map(([type, n]) => (
                              <View key={type} style={styles.chip}>
                                <Text style={styles.chipText}>
                                  {ROUND_TYPE_LABELS[type as StrikingRoundType]} · {n}
                                </Text>
                              </View>
                            ))}
                        </View>
                      )}
                      {strik.totalStrikes > 0 && (
                        <View style={{ marginTop: 8 }}>
                          {breakdown.strikes
                            .map(([weapon, n]) => (
                              <View key={weapon} style={styles.strikeRow}>
                                <Text style={styles.strikeName}>
                                  {WEAPON_LABELS[weapon as StrikeWeapon]}
                                </Text>
                                <Text style={styles.strikeCount}>{n}</Text>
                              </View>
                            ))}
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
              <Touchable onPress={showPaywall} feedback="cta" haptic={false} hasTextChild>
                <View style={styles.proBlur}>
                  <Text style={styles.proBlurText}>
                    Upgrade to Pro to track your sparring numbers
                  </Text>
                </View>
              </Touchable>
            )}
          </Section>

          {/* ── Training partners (nav) ── */}
          <Section density="row">
            <Touchable
              style={styles.partnersCard}
              onPress={() => router.push('/partners' as never)}
              feedback="card"
              haptic={false}
              hasTextChild
            >
            <View style={[styles.cardIconBox, { backgroundColor: withAlpha(T.grappling, 0.15) }]}>
              <Ionicons name="people-outline" size={16} color={T.grappling} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle} numberOfLines={1}>Training partners</Text>
              <Text style={styles.partnersSub}>Who you roll with most, subs for & against</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={T.muted} />
            </Touchable>
          </Section>
        </>
      )}
    </>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    // The rule and vertical padding come from the Section wrapping it.
    partnersCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    partnersSub: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim, marginTop: 2 },
    statCardsRow: { flexDirection: 'row', gap: 8 },
    windowNote: { fontFamily: F.uiMed, fontSize: 11, color: T.muted, marginTop: 10, textAlign: 'center' },

    // Still used by the partners row below, which is a nav row rather than a
    // section header.
    cardIconBox: {
      flexShrink: 0,
      width: 28,
      height: 28,
      borderRadius: R.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTitle: { ...TYPE.sectionLabel, color: T.textDim },

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
    // Not TYPE.sectionLabel: this divides blocks *inside* a card, below the
    // section header, so it is deliberately lighter and tracked tighter.
    subBlockLabel: { ...TYPE.micro, color: T.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
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
