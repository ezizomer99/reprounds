import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Body from 'react-native-body-highlighter';
import type { ExerciseHistoryEntry, StrengthSet } from '@app/shared';
import { totalVolume } from '@app/shared';
import { useExerciseHistory, useExercisePRs, useExerciseProgression } from '../../../../src/hooks/useSession';
import { useExercise } from '../../../../src/hooks/useExercises';
import { useUnit } from '../../../../src/units/UnitContext';
import { fmtWeight, kgToUnit, type WeightUnit } from '../../../../src/units/units';
import { Sparkline } from '../../../../src/components/Sparkline';
import { buildBodyData } from '../../../../src/lib/muscleSlugMap';
import { useProGate } from '../../../../src/hooks/useProGate';
import { F, R, D, ThemeColors } from '../../../../src/theme/colors';
import { useTheme } from '../../../../src/theme/ThemeContext';
import { withAlpha } from '../../../../src/lib/color';
import { parseLocalDate } from '../../../../src/lib/calendar';

function formatDate(dateStr: string): { day: string; month: string } {
  const d = parseLocalDate(dateStr);
  return {
    day: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    month: d.getFullYear().toString(),
  };
}

function formatBestSet(set: StrengthSet | null, unit: WeightUnit): string {
  if (!set) return '—';
  const parts: string[] = [];
  if (set.weight) parts.push(`${fmtWeight(set.weight, unit)} ${unit}`);
  if (set.reps) parts.push(`× ${set.reps}`);
  return parts.join(' ') || '—';
}

function formatSets(sets: StrengthSet[], unit: WeightUnit): string {
  const done = sets.filter((s) => s.completed);
  if (!done.length) return 'No sets logged';
  const shown = done.slice(0, 3).map((s) => {
    if (s.weight && s.reps) return `${fmtWeight(s.weight, unit)}×${s.reps}`;
    if (s.reps) return `${s.reps} reps`;
    return '—';
  });
  const more = done.length > 3 ? ` +${done.length - 3}` : '';
  return shown.join(' · ') + more;
}

function topWeight(sets: StrengthSet[]): number | null {
  const done = sets.filter((s) => s.completed && s.weight !== null);
  if (!done.length) return null;
  return Math.max(...done.map((s) => s.weight!));
}

function HistoryRow({ entry, isLast }: { entry: ExerciseHistoryEntry; isLast: boolean }) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { unit } = useUnit();
  const { day } = formatDate(entry.date);
  const top = topWeight(entry.entry.sets);
  const vol = totalVolume(entry.entry.sets);
  return (
    <View style={[styles.historyRow, !isLast && { borderBottomWidth: 1, borderBottomColor: T.border }]}>
      <Text style={styles.historyDate}>{day}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.historySets}>{formatSets(entry.entry.sets, unit)}</Text>
        {vol > 0 && (
          <Text style={styles.historyVol}>{Math.round(kgToUnit(vol, unit)).toLocaleString()} {unit} volume</Text>
        )}
      </View>
      {top !== null && (
        <Text style={styles.historyTop}>{fmtWeight(top, unit)}<Text style={styles.historyTopUnit}>{unit}</Text></Text>
      )}
    </View>
  );
}

export default function ExerciseHistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { isPro, isLoading: gateLoading, showPaywall } = useProGate();
  const { unit } = useUnit();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();

  const [muscleView, setMuscleView] = useState<'front' | 'back'>('front');
  const { data: prsData, isLoading: prsLoading } = useExercisePRs(id ?? null);
  const { data: historyData, isLoading: histLoading, isError, error } = useExerciseHistory(id ?? null);
  const { data: progressionData } = useExerciseProgression(id ?? null);
  const { data: exerciseDetail } = useExercise(id ?? null);

  const history = historyData?.history ?? [];
  const headerTitle = name ?? history[0]?.entry.exerciseName ?? 'Exercise';
  const isLoading = prsLoading || histLoading;

  // Must run before any early return — hooks after a conditional return
  // change hook order when isPro flips and crash the renderer.
  const bodyData = useMemo(
    () => buildBodyData(exerciseDetail?.muscleGroup ?? null, exerciseDetail?.secondaryMuscles ?? null),
    [exerciseDetail],
  );

  // The gate resolves asynchronously (store entitlement + /me comp status), and
  // `useProGate` documents that a lock must not be derived while it's loading:
  // a mid-race `false` is indistinguishable from a genuine free user. Rendering
  // this wall then flashed "RepRounds Pro Feature" at paying subscribers on
  // every cold start.
  if (!isPro && !gateLoading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={22} color={T.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>{name ?? 'Exercise History'}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centered}>
          <View style={styles.proGateCircle}>
            <Ionicons name="trophy" size={28} color={T.gold} />
          </View>
          <Text style={styles.proGateTitle}>RepRounds Pro Feature</Text>
          <Text style={styles.proGateSub}>
            Exercise history, PR tracking, and 1RM estimates are available with RepRounds Pro.
          </Text>
          <TouchableOpacity style={styles.proGateBtn} onPress={showPaywall} activeOpacity={0.8}>
            <Text style={styles.proGateBtnText}>Upgrade to Pro</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Trend charts use the server-aggregated progression series (up to ~2 years,
  // oldest-first) rather than the 5-entry history so a lift's long-run trajectory
  // is visible. Falls back to nothing (charts hidden) until it loads.
  const progression = progressionData?.points ?? [];

  const topWeights = progression.map((p) => p.topWeight).filter((v) => v > 0);
  const sparkMin = topWeights.length ? Math.min(...topWeights) : 0;
  const sparkMax = topWeights.length ? Math.max(...topWeights) : 0;

  const volumes = progression.map((p) => p.totalVolume).filter((v) => v > 0);
  const volMin = volumes.length ? Math.round(Math.min(...volumes)) : 0;
  const volMax = volumes.length ? Math.round(Math.max(...volumes)) : 0;

  // Null = the session had no set the Epley estimate can speak for (all high-rep).
  // Dropping it omits that session from the trend rather than plotting a zero.
  const e1rms = progression
    .map((p) => p.bestEstimatedOneRepMax)
    .filter((v): v is number => v !== null && v > 0);
  const e1rmMin = e1rms.length ? Math.min(...e1rms) : 0;
  const e1rmMax = e1rms.length ? Math.max(...e1rms) : 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={22} color={T.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{headerTitle}</Text>
          {history[0]?.entry.exerciseName && <Text style={styles.headerSub}>{history[0].entry.exerciseName}</Text>}
        </View>
        <View style={{ width: 40 }} />
      </View>

      {isLoading && (
        <View style={styles.centered}><ActivityIndicator size="large" color={T.primary} /></View>
      )}

      {isError && (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error?.message ?? 'Failed to load history.'}</Text>
        </View>
      )}

      {!isLoading && !isError && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {prsData && (
            <View style={styles.prCard}>
              <View style={styles.prHeader}>
                <Ionicons name="trophy" size={18} color={T.gold} />
                <Text style={styles.prEyebrow}>Personal Records</Text>
                {prsData.bestSet && (
                  <Text style={styles.prDate}>set {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
                )}
              </View>
              <View style={styles.prSplit}>
                <View style={styles.prStat}>
                  <Text style={styles.prKey}>Est. 1RM</Text>
                  <Text style={[styles.prVal, styles.prValGold]}>
                    {prsData.estimatedOneRepMax !== null ? `${fmtWeight(prsData.estimatedOneRepMax, unit)} ${unit}` : '—'}
                  </Text>
                </View>
                <View style={styles.prDivider} />
                <View style={styles.prStat}>
                  <Text style={styles.prKey}>Best Set</Text>
                  <Text style={styles.prVal}>{formatBestSet(prsData.bestSet, unit)}</Text>
                </View>
              </View>
              <Text style={styles.prTotal}>Total sessions: {prsData.totalSessions}</Text>
            </View>
          )}

          {bodyData.length > 0 && (
            <View style={styles.card}>
              <View style={styles.muscleHeader}>
                <Text style={styles.eyebrow}>Muscles Targeted</Text>
                <View style={styles.muscleToggle}>
                  {(['front', 'back'] as const).map((side) => (
                    <TouchableOpacity
                      key={side}
                      style={[styles.muscleToggleBtn, muscleView === side && styles.muscleToggleBtnActive]}
                      onPress={() => setMuscleView(side)}
                    >
                      <Text style={[styles.muscleToggleText, muscleView === side && styles.muscleToggleTextActive]}>
                        {side.charAt(0).toUpperCase() + side.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={{ alignItems: 'center', paddingVertical: 4 }}>
                <Body
                  data={bodyData}
                  side={muscleView}
                  scale={0.9}
                  colors={[withAlpha(T.primary, 0.45), T.primary]}
                  border={T.border}
                  defaultFill={T.surface2}
                />
              </View>
            </View>
          )}

          {e1rms.length >= 2 && (
            <View style={styles.card}>
              <View style={styles.sparklineHeader}>
                <Text style={styles.eyebrow}>Est. 1RM trend · {e1rms.length} sessions</Text>
                <Text style={styles.sparklineRange}>{fmtWeight(e1rmMin, unit)}–{fmtWeight(e1rmMax, unit)} {unit}</Text>
              </View>
              <Sparkline values={e1rms} width={320} height={60} color={T.gold} />
            </View>
          )}

          {topWeights.length >= 2 && (
            <View style={styles.card}>
              <View style={styles.sparklineHeader}>
                <Text style={styles.eyebrow}>Top set · {topWeights.length} sessions</Text>
                <Text style={styles.sparklineRange}>{fmtWeight(sparkMin, unit)}–{fmtWeight(sparkMax, unit)} {unit}</Text>
              </View>
              <Sparkline values={topWeights} width={320} height={60} color={T.primary} />
            </View>
          )}

          {volumes.length >= 2 && (
            <View style={styles.card}>
              <View style={styles.sparklineHeader}>
                <Text style={styles.eyebrow}>Volume · {volumes.length} sessions</Text>
                <Text style={styles.sparklineRange}>
                  {Math.round(kgToUnit(volMin, unit)).toLocaleString()}–{Math.round(kgToUnit(volMax, unit)).toLocaleString()} {unit}
                </Text>
              </View>
              <Sparkline values={volumes} width={320} height={60} color={T.gold} />
            </View>
          )}

          <Text style={styles.eyebrow}>History</Text>
          {history.length === 0 ? (
            <View style={styles.centered}>
              <Text style={styles.emptyText}>No history yet.</Text>
            </View>
          ) : (
            <View style={styles.historyCard}>
              {history.map((entry, i) => (
                <HistoryRow key={entry.sessionId} entry={entry} isLast={i === history.length - 1} />
              ))}
            </View>
          )}
        </ScrollView>
      )}
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
    headerTitle: { fontFamily: F.uiSemi, fontSize: 19, color: T.text, letterSpacing: -0.2 },
    headerSub: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim, marginTop: 1 },

    body: { padding: D.pad, gap: D.stack },

    prCard: {
      borderTopWidth: 2, borderTopColor: withAlpha(T.gold, 0.6),
      paddingTop: 14, paddingBottom: 4,
      gap: 12,
    },
    prHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    prEyebrow: { fontFamily: F.uiBold, fontSize: 11, color: T.gold, textTransform: 'uppercase', letterSpacing: 0.8, flex: 1 },
    prDate: { fontFamily: F.uiMed, fontSize: 11, color: T.textDim },
    prSplit: { flexDirection: 'row', gap: 0 },
    prStat: { flex: 1, alignItems: 'center', gap: 4 },
    prDivider: { width: 1, backgroundColor: T.border, marginVertical: 4 },
    prKey: { fontFamily: F.uiBold, fontSize: 10, color: T.textDim, textTransform: 'uppercase', letterSpacing: 0.6 },
    prVal: { fontFamily: F.monoBold, fontSize: 24, color: T.text, letterSpacing: -0.5 },
    prValGold: { color: T.gold },
    prTotal: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim, textAlign: 'center' },

    muscleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    muscleToggle: { flexDirection: 'row', gap: 4 },
    muscleToggleBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.chip, backgroundColor: T.surface2 },
    muscleToggleBtnActive: { backgroundColor: T.primary },
    muscleToggleText: { fontFamily: F.uiMed, fontSize: 11, color: T.textDim },
    muscleToggleTextActive: { color: T.onPrimary },

    card: { borderTopWidth: 1, borderTopColor: T.borderStrong, paddingTop: 14, paddingBottom: 10, overflow: 'hidden' },
    sparklineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    sparklineRange: { fontFamily: F.mono, fontSize: 12, color: T.textDim },

    eyebrow: { fontFamily: F.uiBold, fontSize: 11, color: T.textDim, textTransform: 'uppercase', letterSpacing: 1.2 },

    historyCard: { borderTopWidth: 1, borderTopColor: T.borderStrong },
    historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 10 },
    historyDate: { fontFamily: F.uiSemi, fontSize: 14, color: T.text, width: 76 },
    historySets: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim },
    historyVol: { fontFamily: F.uiMed, fontSize: 11, color: T.muted, marginTop: 2 },
    historyTop: { fontFamily: F.monoBold, fontSize: 16, color: T.text },
    historyTopUnit: { fontFamily: F.uiMed, fontSize: 11, color: T.muted },

    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 12, paddingHorizontal: 32 },
    emptyText: { fontFamily: F.uiMed, fontSize: 15, color: T.muted },
    errorText: { fontFamily: F.uiMed, fontSize: 15, color: T.danger, textAlign: 'center' },
    proGateCircle: {
      width: 64, height: 64, borderRadius: 32,
      backgroundColor: withAlpha(T.gold, 0.15),
      borderWidth: 1, borderColor: withAlpha(T.gold, 0.3),
      alignItems: 'center', justifyContent: 'center',
    },
    proGateTitle: { fontFamily: F.uiBold, fontSize: 20, color: T.text, letterSpacing: -0.3 },
    proGateSub: { fontFamily: F.uiMed, fontSize: 14, color: T.textDim, textAlign: 'center', lineHeight: 21 },
    proGateBtn: {
      marginTop: 8, backgroundColor: T.primary, borderRadius: R.card,
      paddingVertical: 13, paddingHorizontal: 28,
    },
    proGateBtnText: { fontFamily: F.uiBold, fontSize: 15, color: T.onPrimary },
  });
}
