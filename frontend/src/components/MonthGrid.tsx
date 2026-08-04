import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@app/shared';
import { F, ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { useSessionsInRange } from '../hooks/useSession';
import { MONTH_NAMES, monthCells, monthRange, toISODate } from '../lib/calendar';
import { dayMarkerOverflow, dayMarkers, type DayMarker } from '../lib/sessionMarkers';

// Fixed 6-week grid so every month renders at the same height — keeps the
// calendar's FlashList offsets stable for initialScrollIndex. 6 rows is also
// the Monday-first maximum: a 31-day month starting Sunday needs 6 + 31 = 37
// cells, so do not "optimize" this to 5.
const GRID_ROWS = 6;

// The notice row is ALWAYS rendered, empty when there is nothing to say. It used
// to be two conditional rows (lock, error), which quietly broke the equal-height
// invariant above for exactly the months that had something to report.
const NOTICE_ROW_HEIGHT = 18;

interface MonthGridProps {
  year: number;
  month0: number;
  todayISO: string;
  /**
   * Free-tier history boundary, or null when the user has full access. Passed
   * as a value rather than a precomputed `locked` flag so the lock can never
   * go stale inside a memoized list cell.
   */
  cutoffISO?: string | null;
  onDayPress: (iso: string) => void;
  onUpgradePress?: () => void;
}

/**
 * One scrollable calendar month. Owns its own data: fetches the month's
 * sessions via a range query, so lazy loading falls out of list mounting.
 */
export function MonthGrid({
  year,
  month0,
  todayISO,
  cutoffISO,
  onDayPress,
  onUpgradePress,
}: MonthGridProps) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { from, to } = monthRange(year, month0);

  // Fully locked = every day predates the free window, so there is nothing
  // worth fetching. A boundary month still fetches: part of it is visible.
  const monthFullyLocked = !!cutoffISO && to < cutoffISO;
  const monthPartlyLocked = !!cutoffISO && from < cutoffISO;
  // Clamp the fetch to the visible part of a boundary month. Rows behind the
  // cutoff are never rendered, so pulling them only parks gated sessions in the
  // query cache — the paywall is a presentation gate, but it needn't hand the
  // client data it has no way to show.
  const fetchFrom = monthPartlyLocked && cutoffISO ? cutoffISO : from;
  const { data, isError, refetch } = useSessionsInRange(fetchFrom, to, !monthFullyLocked);
  const sessions = data?.sessions;
  const isTruncated = data?.hasMore ?? false;

  const markersByDay = useMemo(() => {
    const byDay = new Map<string, Session[]>();
    for (const s of sessions ?? []) {
      const list = byDay.get(s.date);
      if (list) list.push(s);
      else byDay.set(s.date, [s]);
    }
    const map = new Map<string, { markers: DayMarker[]; overflow: boolean }>();
    for (const [iso, list] of byDay) {
      map.set(iso, {
        markers: dayMarkers(list, todayISO),
        overflow: dayMarkerOverflow(list, todayISO),
      });
    }
    return map;
  }, [sessions, todayISO]);

  const cells = useMemo(() => {
    const padded = [...monthCells(year, month0)];
    while (padded.length < GRID_ROWS * 7) padded.push(null);
    return padded;
  }, [year, month0]);

  return (
    <View style={styles.month}>
      <Text style={styles.monthTitle}>
        {MONTH_NAMES[month0]} {year}
      </Text>

      {/* One fixed-height slot, always present. Priority: a load failure matters
          more than a truncation, which matters more than the paywall hint. */}
      <View style={styles.noticeRow}>
        {isError ? (
          <TouchableOpacity
            style={styles.noticeInner}
            onPress={() => void refetch()}
            accessibilityRole="button"
            accessibilityLabel="Retry loading this month"
          >
            <Ionicons name="alert-circle-outline" size={12} color={T.danger} />
            <Text style={styles.errorText}>Couldn&apos;t load — tap to retry</Text>
          </TouchableOpacity>
        ) : isTruncated ? (
          <View style={styles.noticeInner}>
            <Ionicons name="information-circle-outline" size={12} color={T.textDim} />
            <Text style={styles.truncatedText}>Too many sessions — some not shown</Text>
          </View>
        ) : monthPartlyLocked ? (
          <TouchableOpacity
            style={styles.noticeInner}
            onPress={onUpgradePress}
            accessibilityRole="button"
            accessibilityLabel="Upgrade to see older history"
          >
            <Ionicons name="lock-closed" size={12} color={T.gold} />
            <Text style={styles.lockText}>Upgrade to see older history</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {Array.from({ length: GRID_ROWS }, (_, week) => (
        <View key={week} style={styles.weekRow}>
          {cells.slice(week * 7, week * 7 + 7).map((day, col) => {
            if (day === null) return <View key={col} style={styles.cell} />;
            const iso = toISODate(year, month0, day);
            const isToday = iso === todayISO;
            // Days behind the free window show no markers at all — a visible
            // dot that opens the paywall instead of the day reads as a bug.
            const dayLocked = !!cutoffISO && iso < cutoffISO;
            const dayData = dayLocked ? undefined : markersByDay.get(iso);
            const markers = dayData?.markers ?? [];
            const label = `${MONTH_NAMES[month0]} ${day}, ${year}`;
            return (
              <TouchableOpacity
                key={col}
                style={styles.cell}
                onPress={() => onDayPress(iso)}
                accessibilityRole="button"
                // Tapping a locked day opens the paywall, not the day — say so,
                // rather than announcing a date that won't open.
                accessibilityLabel={dayLocked ? `${label}, locked — upgrade to view` : label}
              >
                <View style={[styles.dayCircle, isToday && styles.dayCircleToday]}>
                  <Text
                    style={[
                      styles.dayNum,
                      dayLocked && styles.dayNumLocked,
                      isToday && styles.dayNumToday,
                    ]}
                  >
                    {day}
                  </Text>
                </View>
                <View style={styles.dotRow}>
                  {markers.map((m) => (
                    <View
                      key={`${m.style}-${m.tone}`}
                      style={[styles.dot, styles[m.style], toneStyle(m, styles)]}
                    />
                  ))}
                  {/* More distinct markers than the cell has room for. Without
                      this the extra sessions vanish with no trace. */}
                  {dayData?.overflow && <Text style={styles.overflowGlyph}>+</Text>}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Tone is applied after style so a ring gets a border colour, a dot a fill. */
function toneStyle(m: DayMarker, styles: ReturnType<typeof makeStyles>) {
  if (m.tone === 'muted') return styles.toneMuted;
  const filled = m.style === 'filled';
  if (m.tone === 'mat') return filled ? styles.matFill : styles.matRing;
  return filled ? styles.gymFill : styles.gymRing;
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
    // Fixed height whether or not a notice is showing, so every month is the
    // same height and the FlashList offsets stay honest.
    noticeRow: { height: NOTICE_ROW_HEIGHT, justifyContent: 'center', marginBottom: 6 },
    noticeInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    lockText: { fontFamily: F.uiMed, fontSize: 12, color: T.gold },
    errorText: { fontFamily: F.uiMed, fontSize: 12, color: T.danger },
    truncatedText: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim },
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
    dayNumLocked: { color: T.muted },

    dotRow: { flexDirection: 'row', gap: 3, height: 7, alignItems: 'center' },
    dot: { width: 6, height: 6, borderRadius: 3 },
    // Completed: solid. In progress: ring with a solid core. Planned: ring.
    // Skipped: muted ring.
    filled: { width: 5, height: 5 },
    core: { width: 7, height: 7, borderRadius: 4, borderWidth: 2 },
    hollow: { borderWidth: 1.5, backgroundColor: 'transparent' },
    // Overdue: a heavier muted ring, so a planned day that has passed doesn't
    // look identical to one still coming up.
    overdue: { borderWidth: 2, backgroundColor: 'transparent', borderStyle: 'dashed' },
    faded: { borderWidth: 1.5, backgroundColor: 'transparent' },
    gymFill: { backgroundColor: T.primary },
    gymRing: { borderColor: T.primary, backgroundColor: 'transparent' },
    matFill: { backgroundColor: T.grappling },
    matRing: { borderColor: T.grappling, backgroundColor: 'transparent' },
    toneMuted: { borderColor: T.muted, backgroundColor: 'transparent' },
    overflowGlyph: { fontFamily: F.uiBold, fontSize: 9, color: T.textDim, marginLeft: 1 },
  });
}
