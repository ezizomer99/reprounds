import { Alert, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeOutLeft, LinearTransition } from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MAX_SESSIONS_PAGE, useDeleteSession, useSessions } from '../../../src/hooks/useSession';
import { useRoutines } from '../../../src/hooks/useRoutines';
import { useProGate } from '../../../src/hooks/useProGate';
import { Touchable } from '../../../src/components/ui';
import { F, R, D, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { withAlpha } from '../../../src/lib/color';
import { Skeleton } from '../../../src/components/Skeleton';
import { SessionRow, buildRoutineMap, rowSeparatorMargin } from '../../../src/components/SessionRow';
import { InlineError } from '../../../src/components/InlineError';
import { sessionIsMat } from '../../../src/lib/sessionMarkers';
import { parseLocalDate } from '../../../src/lib/calendar';

const FREE_HISTORY_DAYS = 30;

type Filter = 'all' | 'gym' | 'mat';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'gym', label: 'Gym' },
  { key: 'mat', label: 'Martial Arts' },
];

export default function HistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { isPro, isLoading: gateLoading, showPaywall } = useProGate();
  const { data: sessions, isLoading, isError, refetch, isRefetching } = useSessions('completed', MAX_SESSIONS_PAGE);
  const { data: routines, refetch: refetchRoutines } = useRoutines();
  const deleteSession = useDeleteSession();
  const [filter, setFilter] = useState<Filter>('all');

  const routineMap = buildRoutineMap(routines);
  const allSessions = sessions ?? [];

  const cutoff = useMemo(() => {
    // Not while the gate is unresolved: truncating on a mid-race `false`
    // flashed a shortened list and an "older sessions hidden" upsell at
    // people who had already paid.
    if (isPro || gateLoading) return null;
    const d = new Date();
    d.setDate(d.getDate() - FREE_HISTORY_DAYS);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [isPro, gateLoading]);

  const windowed = cutoff
    ? allSessions.filter((s) => parseLocalDate(s.date) >= cutoff)
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
        <Touchable
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={T.text} />
        </Touchable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>History</Text>
          {list.length > 0 && <Text style={styles.headerSub}>{list.length} sessions logged</Text>}
        </View>
        <Touchable
          style={styles.backBtn}
          onPress={() => router.push('/calendar' as never)}
          accessibilityLabel="Open calendar"
        >
          <Ionicons name="calendar-outline" size={20} color={T.text} />
        </Touchable>
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map(({ key, label }) => {
          const active = filter === key;
          return (
            <Touchable
              key={key}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setFilter(key)}
              feedback="row"
              hasTextChild
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
            </Touchable>
          );
        })}
      </View>

      {isLoading && (
        <View style={{ paddingTop: 8 }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton width={40} height={40} radius={R.sm} />
              <View style={{ flex: 1, gap: 8 }}>
                <Skeleton width="55%" height={14} />
                <Skeleton width="32%" height={11} />
              </View>
            </View>
          ))}
        </View>
      )}

      {isError && (
        <InlineError
          message="Couldn't load your history."
          onRetry={() => { void refetch(); }}
        />
      )}

      {!isLoading && !isError && (
        <FlashList
          data={list}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const routineName = item.routineId ? (routineMap.get(item.routineId) ?? null) : null;
            const displayName = item.name ?? routineName ?? 'Session';
            return (
              <Animated.View layout={LinearTransition} exiting={FadeOutLeft.duration(220)}>
                <SessionRow
                  session={item}
                  sessionName={item.name}
                  routineName={routineName}
                  isMat={sessionIsMat(item)}
                  onPress={() => router.push({ pathname: '/sessions/[id]', params: { id: item.id } } as never)}
                  onDelete={() => handleDelete(item.id, displayName)}
                />
              </Animated.View>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>No sessions yet.</Text>
              <Text style={styles.emptySub}>
                {filter === 'all'
                  ? 'Log a workout to see your history here.'
                  : 'Nothing logged for this filter yet.'}
              </Text>
            </View>
          }
          ListFooterComponent={
            hiddenCount > 0 ? (
              <Touchable style={styles.upgradeFooter} onPress={showPaywall} feedback="card" hasTextChild>
                <Ionicons name="lock-closed" size={14} color={T.gold} />
                <Text style={styles.upgradeFooterText}>
                  {hiddenCount} older session{hiddenCount !== 1 ? 's' : ''} hidden — upgrade to see full history
                </Text>
                <Ionicons name="chevron-forward" size={14} color={T.gold} />
              </Touchable>
            ) : null
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
          onRefresh={() => { void refetch(); void refetchRoutines(); }}
          refreshing={isRefetching}
        />
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
      borderRadius: R.sm,
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
