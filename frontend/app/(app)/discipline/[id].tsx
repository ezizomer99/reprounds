import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { DisciplineCat, GiType } from '@app/shared';
import { useDisciplineHistory } from '../../../src/hooks/useDisciplines';
import { T, F, R, D } from '../../../src/theme/colors';
import { withAlpha } from '../../../src/lib/color';

const CATEGORY_COLOR: Record<DisciplineCat, string> = {
  grappling: '#a78bfa',
  striking: T.danger,
  mixed: T.gold,
};

const GI_LABEL: Record<GiType, string> = {
  gi: 'Gi',
  no_gi: 'No-Gi',
};

const GI_COLOR: Record<GiType, string> = {
  gi: '#3b82f6',
  no_gi: '#10b981',
};

function formatDate(dateStr: string): { day: string; month: string; year: string } {
  const d = new Date(dateStr + 'T00:00:00');
  return {
    day: String(d.getDate()),
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    year: String(d.getFullYear()),
  };
}

export default function DisciplineDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();

  const { data, isLoading, isError, error } = useDisciplineHistory(id ?? null);

  const history = data?.history ?? [];

  // Compute gi/no-gi counts from history
  let giCount = 0;
  let noGiCount = 0;
  for (const h of history) {
    if (h.entry.gi === 'gi') giCount++;
    else if (h.entry.gi === 'no_gi') noGiCount++;
  }

  const categoryParam = useLocalSearchParams<{ category?: string }>().category as DisciplineCat | undefined;
  const catColor = categoryParam ? (CATEGORY_COLOR[categoryParam] ?? T.primary) : T.primary;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={T.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {name ?? 'Discipline'}
          </Text>
        </View>
      </View>

      <FlatList
        data={history}
        keyExtractor={(item) => item.entry.id}
        ListHeaderComponent={
          <>
            {/* Stats row */}
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statNum}>{history.length}</Text>
                <Text style={styles.statKey}>Total sessions</Text>
              </View>
              {giCount > 0 && (
                <View style={[styles.statCard, { backgroundColor: withAlpha('#3b82f6', 0.1) }]}>
                  <Text style={[styles.statNum, { color: '#3b82f6' }]}>{giCount}</Text>
                  <Text style={styles.statKey}>Gi</Text>
                </View>
              )}
              {noGiCount > 0 && (
                <View style={[styles.statCard, { backgroundColor: withAlpha('#10b981', 0.1) }]}>
                  <Text style={[styles.statNum, { color: '#10b981' }]}>{noGiCount}</Text>
                  <Text style={styles.statKey}>No-Gi</Text>
                </View>
              )}
            </View>

            {history.length > 0 && (
              <Text style={styles.sectionLabel}>Session history</Text>
            )}
          </>
        }
        renderItem={({ item }) => {
          const { day, month } = formatDate(item.date);
          const gi = item.entry.gi;
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() =>
                router.push({
                  pathname: '/sessions/[id]',
                  params: { id: item.sessionId },
                } as never)
              }
              activeOpacity={0.7}
            >
              <View style={styles.dateBlock}>
                <Text style={styles.dateDay}>{day}</Text>
                <Text style={styles.dateMonth}>{month}</Text>
              </View>
              <View style={styles.rowDivider} />
              <View style={styles.rowContent}>
                {gi ? (
                  <View
                    style={[
                      styles.giBadge,
                      { backgroundColor: withAlpha(GI_COLOR[gi], 0.15) },
                    ]}
                  >
                    <Text style={[styles.giBadgeText, { color: GI_COLOR[gi] }]}>
                      {GI_LABEL[gi]}
                    </Text>
                  </View>
                ) : null}
                {item.entry.notes ? (
                  <Text style={styles.rowNotes} numberOfLines={2}>
                    {item.entry.notes}
                  </Text>
                ) : (
                  <Text style={styles.rowNoNotes}>No notes</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={16} color={T.muted} />
            </TouchableOpacity>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={T.primary} />
            </View>
          ) : isError ? (
            <View style={styles.centered}>
              <Text style={styles.errorText}>
                {error?.message ?? 'Failed to load history.'}
              </Text>
            </View>
          ) : (
            <View style={styles.centered}>
              <Ionicons name="body-outline" size={40} color={T.muted} />
              <Text style={styles.emptyText}>No sessions logged yet.</Text>
              <Text style={styles.emptySub}>
                Start a workout and add {name ?? 'this discipline'} to see your history here.
              </Text>
            </View>
          )
        }
        contentContainerStyle={[
          history.length === 0 && !isLoading && { flex: 1 },
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: F.uiBold, fontSize: 19, color: T.text, letterSpacing: -0.2 },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    padding: D.pad,
    paddingBottom: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: R.sm,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 4,
  },
  statNum: { fontFamily: F.monoBold, fontSize: 22, color: T.text },
  statKey: { fontFamily: F.uiMed, fontSize: 11, color: T.textDim, textTransform: 'uppercase', letterSpacing: 0.4 },

  sectionLabel: {
    fontFamily: F.uiBold,
    fontSize: 11,
    color: T.textDim,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    paddingHorizontal: D.pad,
    paddingTop: 8,
    paddingBottom: 4,
  },

  // History rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: D.pad,
    paddingVertical: 14,
    gap: 12,
  },
  dateBlock: { width: 42, alignItems: 'center', flexShrink: 0 },
  dateDay: { fontFamily: F.monoBold, fontSize: 19, color: T.text },
  dateMonth: { fontFamily: F.uiBold, fontSize: 10, color: T.textDim, letterSpacing: 0.6 },
  rowDivider: { width: 1, height: 36, backgroundColor: T.border, flexShrink: 0 },
  rowContent: { flex: 1, gap: 4 },

  giBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: R.chip,
  },
  giBadgeText: { fontFamily: F.uiBold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 },

  rowNotes: { fontFamily: F.uiMed, fontSize: 13, color: T.textDim },
  rowNoNotes: { fontFamily: F.uiMed, fontSize: 13, color: T.muted, fontStyle: 'italic' },

  separator: { height: 1, backgroundColor: T.border, marginLeft: D.pad + 42 + 12 + 1 + 12 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 10,
    paddingHorizontal: 32,
  },
  emptyText: { fontFamily: F.uiSemi, fontSize: 15, color: T.textDim },
  emptySub: { fontFamily: F.uiMed, fontSize: 13, color: T.muted, textAlign: 'center' },
  errorText: { fontFamily: F.uiMed, fontSize: 15, color: T.danger, textAlign: 'center' },
});
