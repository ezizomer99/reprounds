import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable, RectButton } from 'react-native-gesture-handler';
import type { RoutineWithItems, Session } from '@app/shared';
import { F, R, D, ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { withAlpha } from '../lib/color';
import { localTodayISO } from '../lib/calendar';

export function formatDateBlock(dateStr: string): { day: string; month: string } {
  const d = new Date(dateStr + 'T00:00:00');
  return {
    day: String(d.getDate()),
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
  };
}

export function buildRoutineMap(routines: RoutineWithItems[] | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!routines) return map;
  for (const t of routines) map.set(t.id, t.name);
  return map;
}

/** Human status for meta lines: a planned session past its date is overdue. */
export function statusLabel(session: Session): string {
  switch (session.status) {
    case 'planned':
      return session.date < localTodayISO() ? 'Overdue' : 'Scheduled';
    case 'in_progress':
      return 'In progress';
    case 'completed':
      return 'Completed';
    case 'skipped':
      return 'Skipped';
  }
}

interface SessionRowProps {
  session: Session;
  sessionName: string | null;
  routineName: string | null;
  isMat: boolean;
  onPress: () => void;
  onDelete: () => void;
}

export function SessionRow({ session, sessionName, routineName, isMat, onPress, onDelete }: SessionRowProps) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { day, month } = formatDateBlock(session.date);
  const duration = session.durationMinutes ? `${session.durationMinutes} min` : null;
  const displayName = sessionName ?? routineName ?? 'Session';

  const renderRightActions = () => (
    <RectButton style={styles.swipeDelete} onPress={onDelete}>
      <Ionicons name="trash-outline" size={20} color="#fff" />
    </RectButton>
  );

  return (
    <Swipeable renderRightActions={renderRightActions} rightThreshold={40} overshootRight={false}>
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
            {statusLabel(session)}
          </Text>
        </View>
        <View style={[styles.kindBadge, isMat && styles.kindBadgeMat]}>
          {isMat
            ? <Ionicons name="flash" size={12} color={T.grappling} />
            : <Ionicons name="barbell" size={12} color={T.textDim} />}
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
}

/** Shared separator inset to align with the row content, not the date block. */
export function rowSeparatorMargin() {
  return D.pad + 46 + 12 + 1 + 12;
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: D.pad, paddingVertical: 13, gap: 12, backgroundColor: T.bg },
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
    swipeDelete: {
      backgroundColor: T.danger,
      justifyContent: 'center',
      alignItems: 'center',
      width: 72,
    },
  });
}
