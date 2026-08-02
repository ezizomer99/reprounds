import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@app/shared';
import { F, ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { withAlpha } from '../lib/color';
import { useSessionsInRange } from '../hooks/useSession';
import { MONTH_NAMES, monthCells, monthRange, toISODate } from '../lib/calendar';

// Fixed 6-week grid so every month renders at the same height — keeps the
// calendar's FlashList offsets stable for initialScrollIndex.
const GRID_ROWS = 6;

interface MonthGridProps {
  year: number;
  month0: number;
  todayISO: string;
  /** Free-tier months older than the history window: no markers, lock row. */
  locked?: boolean;
  onDayPress: (iso: string, daySessions: Session[]) => void;
}

/**
 * One scrollable calendar month. Owns its own data: fetches the month's
 * sessions via a range query, so lazy loading falls out of list mounting.
 * Markers: filled dot = completed (gym/mat colors), hollow dot = planned.
 */
export function MonthGrid({ year, month0, todayISO, locked = false, onDayPress }: MonthGridProps) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { from, to } = monthRange(year, month0);
  const { data: sessions } = useSessionsInRange(from, to, !locked);

  const byDay = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const s of sessions ?? []) {
      const list = map.get(s.date);
      if (list) list.push(s);
      else map.set(s.date, [s]);
    }
    return map;
  }, [sessions]);

  const cells = useMemo(() => {
    const base = monthCells(year, month0);
    const padded = [...base];
    while (padded.length < GRID_ROWS * 7) padded.push(null);
    return padded;
  }, [year, month0]);

  return (
    <View style={styles.month}>
      <Text style={styles.monthTitle}>
        {MONTH_NAMES[month0]} {year}
      </Text>

      {locked && (
        <View style={styles.lockRow}>
          <Ionicons name="lock-closed" size={12} color={T.gold} />
          <Text style={styles.lockText}>Upgrade to see older history</Text>
        </View>
      )}

      {Array.from({ length: GRID_ROWS }, (_, week) => (
        <View key={week} style={styles.weekRow}>
          {cells.slice(week * 7, week * 7 + 7).map((day, col) => {
            if (day === null) return <View key={col} style={styles.cell} />;
            const iso = toISODate(year, month0, day);
            const daySessions = byDay.get(iso) ?? [];
            const isToday = iso === todayISO;
            const hasGym = daySessions.some(
              (s) => s.status === 'completed' && (s.kinds?.includes('exercise') ?? false),
            );
            const hasMat = daySessions.some(
              (s) => s.status === 'completed' && (s.kinds?.includes('martial_arts') ?? false),
            );
            const planned = daySessions.filter((s) => s.status === 'planned');
            const hasPlanned = planned.length > 0;
            const plannedIsMat = planned.some((s) => s.kinds?.includes('martial_arts') ?? false);
            return (
              <TouchableOpacity
                key={col}
                style={styles.cell}
                onPress={() => onDayPress(iso, daySessions)}
                accessibilityRole="button"
                accessibilityLabel={`${MONTH_NAMES[month0]} ${day}, ${year}`}
              >
                <View style={[styles.dayCircle, isToday && styles.dayCircleToday]}>
                  <Text style={[styles.dayNum, isToday && styles.dayNumToday]}>{day}</Text>
                </View>
                <View style={styles.dotRow}>
                  {!locked && hasGym && <View style={styles.gymDot} />}
                  {!locked && hasMat && <View style={styles.matDot} />}
                  {!locked && hasPlanned && (
                    <View style={[styles.plannedDot, plannedIsMat && styles.plannedDotMat]} />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    month: { paddingBottom: 18 },
    monthTitle: {
      fontFamily: F.uiSemi,
      fontSize: 17,
      color: T.text,
      letterSpacing: -0.2,
      marginBottom: 10,
    },
    lockRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    lockText: { fontFamily: F.uiMed, fontSize: 12, color: T.gold },
    weekRow: { flexDirection: 'row' },
    cell: { flex: 1, height: 48, alignItems: 'center', justifyContent: 'center' },
    dayCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayCircleToday: { backgroundColor: T.primary },
    dayNum: { fontFamily: F.monoBold, fontSize: 14, color: T.text },
    dayNumToday: { color: T.onPrimary },
    dotRow: { flexDirection: 'row', gap: 3, height: 5 },
    gymDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: T.primary },
    matDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: T.grappling },
    // Hollow dot: a scheduled (planned) workout, not yet logged.
    plannedDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      borderWidth: 1.5,
      borderColor: T.primary,
      backgroundColor: withAlpha(T.primary, 0),
    },
    plannedDotMat: { borderColor: T.grappling },
  });
}
