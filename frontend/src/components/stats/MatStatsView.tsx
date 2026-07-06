import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BarChart } from 'react-native-gifted-charts';
import type { StrikeWeapon, StrikingRoundType } from '@app/shared';
import { useMatStats } from '../../hooks/useStats';
import { useProGate } from '../../hooks/useProGate';
import { weeksAgoMonday } from '../../lib/statsHelpers';
import { Skeleton } from '../Skeleton';
import { D, F, R, ThemeColors } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { withAlpha } from '../../lib/color';

const WEEKS = 8;

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

function fmtMatTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function MatStatsView() {
  const router = useRouter();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { isPro, showPaywall } = useProGate();

  const since = useMemo(() => weeksAgoMonday(WEEKS), []);
  const { data, isLoading } = useMatStats(since, WEEKS);

  const barData = useMemo(
    () =>
      (data?.weeks ?? []).map((w, i, all) => ({
        value: w.rounds,
        label:
          i === all.length - 1
            ? 'This\nweek'
            : new Date(w.weekStart + 'T00:00:00').toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              }),
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
    !!grap && (grap.rounds > 0 || grap.submissionsFor > 0 || grap.submissionsAgainst > 0 || grap.sweeps > 0 || grap.takedowns > 0);
  const hasStriking = !!strik && (strik.rounds > 0 || strik.totalStrikes > 0);
  const isEmpty = !isLoading && (data?.totals.sessions ?? 0) === 0;

  return (
    <>
      {/* ── Mat Highlights (FREE) ── */}
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
        <Text style={styles.windowNote}>Last {WEEKS} weeks</Text>
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
                <Text style={styles.cardTitle}>Intensity Split</Text>
              </View>
            </View>

            {isLoading ? (
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
                <Text style={styles.cardTitle}>Rounds per Week</Text>
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
                </View>
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
                <Text style={styles.cardTitle}>Sparring Numbers</Text>
              </View>
              {!isPro && (
                <TouchableOpacity onPress={showPaywall} activeOpacity={0.7}>
                  <Ionicons name="lock-closed" size={16} color={T.muted} />
                </TouchableOpacity>
              )}
            </View>

            {isPro ? (
              isLoading ? (
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
              <Text style={styles.cardTitle}>Training partners</Text>
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
      backgroundColor: T.surface,
      borderWidth: 1,
      borderColor: T.border,
      borderRadius: R.card,
      padding: D.cardPad,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    partnersSub: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim, marginTop: 2 },
    card: {
      backgroundColor: T.surface,
      borderWidth: 1,
      borderColor: T.border,
      borderRadius: R.card,
      padding: D.cardPad,
    },

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
    statCardNum: { fontFamily: F.monoBold, fontSize: 20 },
    statCardLabel: { fontFamily: F.uiMed, fontSize: 11, textAlign: 'center' },
    windowNote: { fontFamily: F.uiMed, fontSize: 11, color: T.muted, marginTop: 10, textAlign: 'center' },

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

    intensityBar: {
      flexDirection: 'row',
      height: 14,
      borderRadius: 7,
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
