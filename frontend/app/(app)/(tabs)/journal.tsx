import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useDeleteSession, useSessions } from '../../../src/hooks/useSession';
import { useRoutines } from '../../../src/hooks/useRoutines';
import { useProGate } from '../../../src/hooks/useProGate';
import { F, R, D, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { withAlpha } from '../../../src/lib/color';
import { Skeleton } from '../../../src/components/Skeleton';
import { SessionRow, buildRoutineMap, rowSeparatorMargin, sessionIsMat } from '../../../src/components/SessionRow';

const FREE_HISTORY_DAYS = 30;

type Filter = 'all' | 'gym' | 'mat';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'gym', label: 'Gym' },
  { key: 'mat', label: 'Martial Arts' },
];

export default function JournalTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { isPro, showPaywall } = useProGate();
  const { data: sessions, isLoading, isError, error } = useSessions('completed');
  const { data: routines } = useRoutines();
  const deleteSession = useDeleteSession();
  const [filter, setFilter] = useState<Filter>('all');

  const routineMap = buildRoutineMap(routines);
  const allSessions = sessions ?? [];

  const cutoff = useMemo(() => {
    if (isPro) return null;
    const d = new Date();
    d.setDate(d.getDate() - FREE_HISTORY_DAYS);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [isPro]);

  const windowed = cutoff
    ? allSessions.filter((s) => new Date(s.date + 'T00:00:00') >= cutoff)
    : allSessions;

  const list = useMemo(() => {
    if (filter === 'all') return windowed;
    return windowed.filter((s) =>
      filter === 'mat' ? sessionIsMat(s) : s.kinds?.includes('exercise') ?? false,
    );
  }, [windowed, filter]);

  const hiddenCount = cutoff ? allSessions.length - windowed.length : 0;

  function handleDelete(id: string, name: string) {
    Alert.alert(
      'Delete Session?',
      `"${name}" will be permanently removed along with all its logged sets.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteSession.mutate({ id }) },
      ],
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Journal</Text>
        {list.length > 0 && (
          <Text style={styles.headerSub}>
            {list.length} session{list.length !== 1 ? 's' : ''}
          </Text>
        )}
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map(({ key, label }) => {
          const active = filter === key;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setFilter(key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading && (
        <View style={{ paddingTop: 8 }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton width={40} height={40} radius={20} />
              <View style={{ flex: 1, gap: 8 }}>
                <Skeleton width="55%" height={14} />
                <Skeleton width="32%" height={11} />
              </View>
            </View>
          ))}
        </View>
      )}

      {isError && (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error?.message ?? 'Failed to load history.'}</Text>
        </View>
      )}

      {!isLoading && !isError && (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const routineName = item.routineId ? (routineMap.get(item.routineId) ?? null) : null;
            const displayName = item.name ?? routineName ?? 'Session';
            return (
              <SessionRow
                session={item}
                sessionName={item.name}
                routineName={routineName}
                isMat={sessionIsMat(item)}
                onPress={() => router.push({ pathname: '/sessions/[id]', params: { id: item.id } } as never)}
                onDelete={() => handleDelete(item.id, displayName)}
              />
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>No sessions yet.</Text>
              <Text style={styles.emptySub}>
                {filter === 'all'
                  ? 'Log a workout or martial arts session to see it here.'
                  : 'Nothing logged for this filter yet.'}
              </Text>
            </View>
          }
          ListFooterComponent={
            hiddenCount > 0 ? (
              <TouchableOpacity style={styles.upgradeFooter} onPress={showPaywall} activeOpacity={0.8}>
                <Ionicons name="lock-closed" size={14} color={T.gold} />
                <Text style={styles.upgradeFooterText}>
                  {hiddenCount} older session{hiddenCount !== 1 ? 's' : ''} hidden — upgrade to see full history
                </Text>
                <Ionicons name="chevron-forward" size={14} color={T.gold} />
              </TouchableOpacity>
            ) : null
          }
          contentContainerStyle={[
            list.length === 0 && { flex: 1 },
            { paddingBottom: insets.bottom + 32 },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}
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
      borderBottomWidth: 1,
      borderBottomColor: T.border,
    },
    headerTitle: { fontFamily: F.uiBold, fontSize: 22, color: T.text, letterSpacing: -0.3 },
    headerSub: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim, marginTop: 2 },

    filterRow: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: D.pad,
      paddingTop: 12,
      paddingBottom: 4,
    },
    filterChip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: T.border,
      backgroundColor: T.surface,
    },
    filterChipActive: { backgroundColor: T.primary, borderColor: T.primary },
    filterChipText: { fontFamily: F.uiMed, fontSize: 13, color: T.textDim },
    filterChipTextActive: { fontFamily: F.uiBold, color: T.onPrimary },

    skeletonRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: D.pad, paddingVertical: 14, gap: 12 },
    separator: { height: 1, backgroundColor: T.border, marginLeft: rowSeparatorMargin() },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
    emptyText: { fontFamily: F.uiSemi, fontSize: 15, color: T.textDim, marginBottom: 4 },
    emptySub: { fontFamily: F.uiMed, fontSize: 13, color: T.muted, textAlign: 'center', paddingHorizontal: 24 },
    errorText: { fontFamily: F.uiMed, fontSize: 15, color: T.danger, textAlign: 'center' },
    upgradeFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      margin: D.pad,
      padding: D.cardPad,
      borderRadius: R.card,
      backgroundColor: withAlpha(T.gold, 0.1),
      borderWidth: 1,
      borderColor: withAlpha(T.gold, 0.25),
    },
    upgradeFooterText: { flex: 1, fontFamily: F.uiMed, fontSize: 13, color: T.gold },
  });
}
