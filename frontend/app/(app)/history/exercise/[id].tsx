import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { ExerciseHistoryEntry, StrengthSet } from '@app/shared';
import { totalVolume } from '@app/shared';
import { useExerciseHistory, useExercisePRs } from '../../../../src/hooks/useSession';
import { Sparkline } from '../../../../src/components/Sparkline';
import { useProGate } from '../../../../src/hooks/useProGate';
import { F, R, D, ThemeColors } from '../../../../src/theme/colors';
import { useTheme } from '../../../../src/theme/ThemeContext';
import { withAlpha } from '../../../../src/lib/color';

function formatDate(dateStr: string): { day: string; month: string } {
  const d = new Date(dateStr + 'T00:00:00');
  return {
    day: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    month: d.getFullYear().toString(),
  };
}

function formatBestSet(set: StrengthSet | null): string {
  if (!set) return '—';
  const parts: string[] = [];
  if (set.weight) parts.push(`${set.weight} kg`);
  if (set.reps) parts.push(`× ${set.reps}`);
  return parts.join(' ') || '—';
}

function formatSets(sets: StrengthSet[]): string {
  const done = sets.filter((s) => s.completed);
  if (!done.length) return 'No sets logged';
  const shown = done.slice(0, 3).map((s) => {
    if (s.weight && s.reps) return `${s.weight}×${s.reps}`;
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
  const { day } = formatDate(entry.date);
  const top = topWeight(entry.entry.sets);
  const vol = totalVolume(entry.entry.sets);
  return (
    <View style={[styles.historyRow, !isLast && { borderBottomWidth: 1, borderBottomColor: T.border }]}>
      <Text style={styles.historyDate}>{day}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.historySets}>{formatSets(entry.entry.sets)}</Text>
        {vol > 0 && (
          <Text style={styles.historyVol}>{Math.round(vol).toLocaleString()} kg volume</Text>
        )}
      </View>
      {top !== null && (
        <Text style={styles.historyTop}>{top}<Text style={styles.historyTopUnit}>kg</Text></Text>
      )}
    </View>
  );
}

export default function ExerciseHistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { isPro, showPaywall } = useProGate();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();

  const { data: prsData, isLoading: prsLoading } = useExercisePRs(id ?? null);
  const { data: historyData, isLoading: histLoading, isError, error } = useExerciseHistory(id ?? null);

  const history = historyData?.history ?? [];
  const headerTitle = name ?? history[0]?.entry.exerciseName ?? 'Exercise';
  const isLoading = prsLoading || histLoading;

  if (!isPro) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
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
          <Text style={styles.proGateTitle}>Glima Pro Feature</Text>
          <Text style={styles.proGateSub}>
            Exercise history, PR tracking, and 1RM estimates are available with Glima Pro.
          </Text>
          <TouchableOpacity style={styles.proGateBtn} onPress={showPaywall} activeOpacity={0.8}>
            <Text style={styles.proGateBtnText}>Upgrade to Pro</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const topWeights = history
    .map((e) => topWeight(e.entry.sets))
    .filter((v): v is number => v !== null)
    .reverse();

  const sparkMin = topWeights.length ? Math.min(...topWeights) : 0;
  const sparkMax = topWeights.length ? Math.max(...topWeights) : 0;

  const volumes = history
    .map((e) => totalVolume(e.entry.sets))
    .filter((v) => v > 0)
    .reverse();
  const volMin = volumes.length ? Math.round(Math.min(...volumes)) : 0;
  const volMax = volumes.length ? Math.round(Math.max(...volumes)) : 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
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
                    {prsData.estimatedOneRepMax !== null ? `${prsData.estimatedOneRepMax} kg` : '—'}
                  </Text>
                </View>
                <View style={styles.prDivider} />
                <View style={styles.prStat}>
                  <Text style={styles.prKey}>Best Set</Text>
                  <Text style={styles.prVal}>{formatBestSet(prsData.bestSet)}</Text>
                </View>
              </View>
              <Text style={styles.prTotal}>Total sessions: {prsData.totalSessions}</Text>
            </View>
          )}

          {topWeights.length >= 2 && (
            <View style={styles.card}>
              <View style={styles.sparklineHeader}>
                <Text style={styles.eyebrow}>Top set · last {topWeights.length}</Text>
                <Text style={styles.sparklineRange}>{sparkMin}–{sparkMax} kg</Text>
              </View>
              <Sparkline values={topWeights} width={320} height={60} color={T.primary} />
            </View>
          )}

          {volumes.length >= 2 && (
            <View style={styles.card}>
              <View style={styles.sparklineHeader}>
                <Text style={styles.eyebrow}>Volume · last {volumes.length}</Text>
                <Text style={styles.sparklineRange}>{volMin.toLocaleString()}–{volMax.toLocaleString()} kg</Text>
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
      borderBottomWidth: 1, borderBottomColor: T.border,
    },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontFamily: F.uiSemi, fontSize: 19, color: T.text, letterSpacing: -0.2 },
    headerSub: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim, marginTop: 1 },

    body: { padding: D.pad, gap: D.stack },

    prCard: {
      backgroundColor: T.surface,
      borderWidth: 1, borderColor: withAlpha(T.gold, 0.35),
      borderRadius: R.card, padding: D.cardPad,
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

    card: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: R.card, padding: D.cardPad, paddingBottom: 10, overflow: 'hidden' },
    sparklineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    sparklineRange: { fontFamily: F.mono, fontSize: 12, color: T.textDim },

    eyebrow: { fontFamily: F.uiBold, fontSize: 11, color: T.textDim, textTransform: 'uppercase', letterSpacing: 1.2 },

    historyCard: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: R.card, overflow: 'hidden' },
    historyRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: D.cardPad, paddingVertical: 12, gap: 10 },
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
