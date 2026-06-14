import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { ExerciseHistoryEntry, StrengthSet } from '@app/shared';
import { useExerciseHistory, useExercisePRs } from '../../../../src/hooks/useSession';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatBestSet(set: StrengthSet | null): string {
  if (!set) return '—';
  const parts: string[] = [];
  if (set.weight) parts.push(`${set.weight}kg`);
  if (set.reps) parts.push(`× ${set.reps} reps`);
  return parts.join(' ') || '—';
}

function formatSets(sets: StrengthSet[]): string {
  const completed = sets.filter((s) => s.completed);
  if (completed.length === 0) return 'No sets logged';
  const shown = completed.slice(0, 3);
  const parts = shown.map((s) => {
    if (s.weight && s.reps) return `${s.weight}kg×${s.reps}`;
    if (s.reps) return `${s.reps} reps`;
    return '—';
  });
  const suffix = completed.length > 3 ? ` +${completed.length - 3} more` : '';
  return `${completed.length} sets — ` + parts.join(', ') + suffix;
}

interface HistoryEntryRowProps {
  entry: ExerciseHistoryEntry;
}

function HistoryEntryRow({ entry }: HistoryEntryRowProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowDate}>{formatDate(entry.date)}</Text>
      <Text style={styles.rowSets}>{formatSets(entry.entry.sets)}</Text>
    </View>
  );
}

export default function ExerciseHistoryScreen() {
  const router = useRouter();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();

  const { data: prsData, isLoading: prsLoading } = useExercisePRs(id ?? null);
  const { data: historyData, isLoading: historyLoading, isError, error } = useExerciseHistory(id ?? null);

  const history = historyData?.history ?? [];
  const headerTitle = name ?? history[0]?.entry.exerciseName ?? 'Exercise';
  const isLoading = prsLoading || historyLoading;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{headerTitle}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {isLoading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      )}

      {isError && (
        <View style={styles.centered}>
          <Text style={styles.errorText}>
            {error?.message ?? 'Failed to load history.'}
          </Text>
        </View>
      )}

      {!isLoading && !isError && (
        <>
          {prsData && (
            <View style={styles.prCard}>
              <View style={styles.prRow}>
                <View style={styles.prStat}>
                  <Text style={styles.prStatLabel}>Est. 1RM</Text>
                  <Text style={styles.prStatValue}>
                    {prsData.estimatedOneRepMax !== null
                      ? `${prsData.estimatedOneRepMax} kg`
                      : '—'}
                  </Text>
                </View>
                <View style={styles.prDivider} />
                <View style={styles.prStat}>
                  <Text style={styles.prStatLabel}>Best Set</Text>
                  <Text style={styles.prStatValue}>
                    {formatBestSet(prsData.bestSet)}
                  </Text>
                </View>
              </View>
              <Text style={styles.prTotal}>Total sessions: {prsData.totalSessions}</Text>
            </View>
          )}

          <Text style={styles.sectionLabel}>Recent Sessions</Text>

          <FlatList
            data={history}
            keyExtractor={(item) => item.sessionId}
            renderItem={({ item }) => <HistoryEntryRow entry={item} />}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              <View style={styles.centered}>
                <Text style={styles.emptyText}>No history yet.</Text>
              </View>
            }
            contentContainerStyle={history.length === 0 ? styles.emptyList : undefined}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  backButton: {
    minWidth: 52,
  },
  backText: {
    fontSize: 16,
    color: '#3b82f6',
  },
  headerSpacer: {
    minWidth: 52,
  },
  prCard: {
    margin: 16,
    padding: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
  },
  prRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  prStat: {
    flex: 1,
    alignItems: 'center',
  },
  prDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: '#e5e7eb',
    marginVertical: 4,
  },
  prStatLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  prStatValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  prTotal: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowDate: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  rowSets: {
    fontSize: 13,
    color: '#6b7280',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e5e7eb',
    marginLeft: 16,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyList: {
    flex: 1,
  },
  emptyText: {
    fontSize: 15,
    color: '#9ca3af',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  errorText: {
    fontSize: 15,
    color: '#ef4444',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
