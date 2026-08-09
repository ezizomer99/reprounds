import { useMemo } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { DayMarker, MarkerStyle, MarkerTone } from '../lib/sessionMarkers';
import { F, ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';

/**
 * The dots under a day. Extracted from MonthGrid so the week strip and the month
 * grid draw the same vocabulary from the same code — they used to disagree, and
 * the week strip was the one that was wrong.
 */
export function DayDots({
  markers,
  overflow = false,
  style,
}: {
  markers: DayMarker[];
  /** More distinct markers than the cell has room for. */
  overflow?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  return (
    <View style={[styles.dotRow, style]}>
      {markers.map((m) => (
        <View
          key={`${m.style}-${m.tone}`}
          style={[styles.dot, styles[m.style], toneStyle(m, styles)]}
        />
      ))}
      {/* Without this the extra sessions vanish with no trace. */}
      {overflow && <Text style={styles.overflowGlyph}>+</Text>}
    </View>
  );
}

const STYLE_LABEL: Record<MarkerStyle, string> = {
  filled: 'logged',
  core: 'in progress',
  hollow: 'planned',
  overdue: 'missed',
  faded: 'skipped',
};

const TONE_LABEL: Record<MarkerTone, string> = {
  gym: 'gym',
  mat: 'mat',
  muted: '',
};

/** How a marker reads aloud, and in the legend: "gym logged", "planned", "missed". */
export function markerLabel(m: DayMarker): string {
  const tone = TONE_LABEL[m.tone];
  return tone ? `${tone} ${STYLE_LABEL[m.style]}` : STYLE_LABEL[m.style];
}

/**
 * A key for the dots actually on screen.
 *
 * Derived from the markers rather than fixed, for two reasons. A static
 * five-item key would be noise in most weeks — the common case is one or two
 * kinds of dot. And the two that most need distinguishing are genuinely
 * ambiguous without it: a planned ring and a logged gym dot are both drawn in
 * the primary colour and differ only by fill, at five pixels across.
 */
export function DayDotsLegend({
  markers,
  style,
}: {
  markers: DayMarker[];
  style?: StyleProp<ViewStyle>;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);

  const entries = useMemo(() => {
    const seen = new Map<string, DayMarker>();
    for (const m of markers) {
      const key = `${m.style}-${m.tone}`;
      if (!seen.has(key)) seen.set(key, m);
    }
    return [...seen.values()];
  }, [markers]);

  if (entries.length === 0) return null;

  return (
    <View style={[styles.legend, style]} accessibilityRole="summary">
      {entries.map((m) => (
        <View key={`${m.style}-${m.tone}`} style={styles.legendItem}>
          <View style={[styles.dot, styles[m.style], toneStyle(m, styles)]} />
          <Text style={styles.legendText}>{markerLabel(m)}</Text>
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

    legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendText: { fontFamily: F.uiMed, fontSize: 11, color: T.muted },
  });
}
