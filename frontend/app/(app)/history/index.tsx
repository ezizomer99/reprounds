import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { Session, RoutineWithItems } from '@app/shared';
import { useDeleteSession, useSessions } from '../../../src/hooks/useSession';
import { useRoutines } from '../../../src/hooks/useRoutines';
import { useProGate } from '../../../src/hooks/useProGate';
import { F, R, D, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { withAlpha } from '../../../src/lib/color';

const FREE_HISTORY_DAYS = 30;

function formatDateBlock(dateStr: string): { day: string; month: string } {
  const d = new Date(dateStr + 'T00:00:00');
  return {
    day: String(d.getDate()),
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
  };
}

function buildRoutineMap(routines: RoutineWithItems[] | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!routines) return map;
  for (const t of routines) map.set(t.id, t.name);
  return map;
}

function SessionRow({ session, sessionName, routineName, isMat, onPress, onDelete }: {
  session: Session;
  sessionName: string | null;
  routineName: string | null;
  isMat: boolean;
  onPress: () => void;
  onDelete: () => void;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { day, month } = formatDateBlock(session.date);
  const duration = session.durationMinutes ? `${session.durationMinutes} min` : null;
  const displayName = sessionName ?? routineName ?? 'Session';

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.dateBlock}>
        <Text style={styles.dateDay}>{day}</Text>
        <Text style={styles.dateMonth}>{month}</Text>
      </View>
      <View style={styles.rowDivider} />
      <View style={styles.rowContent}>
        <Text style={styles.rowName}>{displayName}</Text>
        <Text style={styles.rowMeta}>
          {duration ?? ''}
          {duration ? ' · ' : ''}
          {session.status}
        </Text>
      </View>
      <View style={[styles.kindBadge, isMat && styles.kindBadgeMat]}>
        {isMat
          ? <Ionicons name="flash" size={12} color={T.grappling} />
          : <Ionicons name="barbell" size={12} color={T.textDim} />}
      </View>
      <TouchableOpacity onPress={onDelete} style={styles.deleteBtn} hitSlop={8}>
        <Ionicons name="trash-outline" size={17} color={T.danger} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

export default function HistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { isPro, showPaywall } = useProGate();
  const { data: sessions, isLoading, isError, error } = useSessions('completed');
  const { data: routines } = useRoutines();
  const deleteSession = useDeleteSession();

  const routineMap = buildRoutineMap(routines);
  const allSessions = sessions ?? [];

  const cutoff = useMemo(() => {
    if (isPro) return null;
    const d = new Date();
    d.setDate(d.getDate() - FREE_HISTORY_DAYS);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [isPro]);

  const list = cutoff
    ? allSessions.filter((s) => new Date(s.date + 'T00:00:00') >= cutoff)
    : allSessions;

  const hiddenCount = cutoff ? allSessions.length - list.length : 0;

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
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={T.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>History</Text>
          {list.length > 0 && <Text style={styles.headerSub}>{list.length} sessions logged</Text>}
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
                isMat={false}
                onPress={() => router.push({ pathname: '/sessions/[id]', params: { id: item.id } } as never)}
                onDelete={() => handleDelete(item.id, displayName)}
              />
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>No completed sessions yet.</Text>
              <Text style={styles.emptySub}>Log a workout to see your history here.</Text>
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
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 12, paddingVertical: 10,
      borderBottomWidth: 1, borderBottomColor: T.border,
    },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontFamily: F.uiSemi, fontSize: 19, color: T.text, letterSpacing: -0.2 },
    headerSub: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim, marginTop: 1 },

    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: D.pad, paddingVertical: 13, gap: 12 },
    dateBlock: { width: 46, alignItems: 'center', flexShrink: 0 },
    dateDay: { fontFamily: F.monoBold, fontSize: 19, color: T.text },
    dateMonth: { fontFamily: F.uiBold, fontSize: 10, color: T.textDim, letterSpacing: 0.6 },
    rowDivider: { width: 1, height: 34, backgroundColor: T.border },
    rowContent: { flex: 1 },
    rowName: { fontFamily: F.uiSemi, fontSize: 15, color: T.text, marginBottom: 2 },
    rowMeta: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim },
    kindBadge: {
      width: 26, height: 26, borderRadius: R.sm,
      backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center',
    },
    kindBadgeMat: { backgroundColor: withAlpha(T.grappling, 0.12) },
    deleteBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    separator: { height: 1, backgroundColor: T.border, marginLeft: D.pad + 46 + 12 + 1 + 12 },
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
