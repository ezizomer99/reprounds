import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { F, R, ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { DAY_LABELS, MONTH_NAMES, monthCells, monthRange, toISODate } from '../lib/calendar';

// How far the picker will ever navigate when a caller gives no explicit bound.
// Without this, repeated taps on the month arrows walk to year 0 or 9999 — and
// an unpadded year produced `999-01-01`, which the API rejects with an opaque
// "date must be YYYY-MM-DD" the user has no way to interpret.
const DEFAULT_YEARS_EITHER_SIDE = 50;

// Inline month-grid date picker. `value`/`onChange` use a local `YYYY-MM-DD`
// string. Extracted from the session logger so every date field (weigh-ins,
// fights, promotions) shares one validated picker instead of a raw text input.
export function CalendarPicker({
  value,
  onChange,
  minISO,
  maxISO,
}: {
  value: string;
  onChange: (d: string) => void;
  /**
   * Inclusive earliest selectable day. Reschedule passes today: moving a planned
   * session into the past creates one that is immediately overdue, and the server
   * rejects it, so the day must not look tappable.
   */
  minISO?: string;
  /**
   * Inclusive latest selectable day. Every picker that records something which
   * already happened (a finished session, a weigh-in, a fight, a promotion)
   * passes today.
   */
  maxISO?: string;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const [selY, selM, selD] = value.split('-').map(Number);
  const [viewYear, setViewYear] = useState(selY);
  const [viewMonth, setViewMonth] = useState(selM - 1); // 0-indexed

  // Fall back to a wide but finite range so navigation is always bounded, even
  // for callers that don't care about limiting the date.
  const bounds = useMemo(() => {
    const now = new Date();
    return {
      min: minISO ?? toISODate(now.getFullYear() - DEFAULT_YEARS_EITHER_SIDE, 0, 1),
      max: maxISO ?? toISODate(now.getFullYear() + DEFAULT_YEARS_EITHER_SIDE, 11, 31),
    };
  }, [minISO, maxISO]);

  // Compare against the month's last/first day so a partially-in-range month
  // stays reachable — only a month with no selectable day at all is blocked.
  const canGoPrev = monthRange(viewYear, viewMonth).from > bounds.min;
  const canGoNext = monthRange(viewYear, viewMonth).to < bounds.max;

  function prevMonth() {
    if (!canGoPrev) return;
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (!canGoNext) return;
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else setViewMonth((m) => m + 1);
  }
  const cells = monthCells(viewYear, viewMonth);

  const today = new Date();

  return (
    <View style={styles.calContainer}>
      <View style={styles.calHeader}>
        <TouchableOpacity
          onPress={prevMonth}
          disabled={!canGoPrev}
          style={styles.calNavBtn}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          accessibilityState={{ disabled: !canGoPrev }}
        >
          <Ionicons name="chevron-back" size={20} color={canGoPrev ? T.text : T.muted} />
        </TouchableOpacity>
        <Text style={styles.calMonthLabel}>
          {MONTH_NAMES[viewMonth]} {viewYear}
        </Text>
        <TouchableOpacity
          onPress={nextMonth}
          disabled={!canGoNext}
          style={styles.calNavBtn}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          accessibilityState={{ disabled: !canGoNext }}
        >
          <Ionicons name="chevron-forward" size={20} color={canGoNext ? T.text : T.muted} />
        </TouchableOpacity>
      </View>

      <View style={styles.calRow}>
        {DAY_LABELS.map((d) => (
          <Text key={d} style={styles.calDayLabel}>
            {d}
          </Text>
        ))}
      </View>

      {Array.from({ length: cells.length / 7 }, (_, week) => (
        <View key={week} style={styles.calRow}>
          {cells.slice(week * 7, week * 7 + 7).map((day, col) => {
            if (day === null) return <View key={col} style={styles.calCell} />;
            const iso = toISODate(viewYear, viewMonth, day);
            const isSelected = viewYear === selY && viewMonth === selM - 1 && day === selD;
            const isTdy =
              viewYear === today.getFullYear() &&
              viewMonth === today.getMonth() &&
              day === today.getDate();
            // Lexicographic comparison is exact for zero-padded YYYY-MM-DD.
            const disabled = iso < bounds.min || iso > bounds.max;
            return (
              <TouchableOpacity
                key={col}
                style={[styles.calCell, isSelected && styles.calCellSelected]}
                onPress={() => onChange(iso)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected, disabled }}
                accessibilityLabel={`${MONTH_NAMES[viewMonth]} ${day}, ${viewYear}`}
              >
                <Text
                  style={[
                    styles.calDayNum,
                    isTdy && styles.calDayToday,
                    isSelected && styles.calDaySelectedText,
                    disabled && styles.calDayDisabled,
                  ]}
                >
                  {day}
                </Text>
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
    calContainer: {
      backgroundColor: T.surface,
      borderRadius: R.card,
      borderWidth: 1,
      borderColor: T.border,
      padding: 12,
    },
    calHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    calNavBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    calMonthLabel: { fontFamily: F.uiSemi, fontSize: 15, color: T.text },
    calRow: { flexDirection: 'row' },
    calCell: {
      flex: 1,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: R.sm,
    },
    calCellSelected: { backgroundColor: T.primary },
    calDayLabel: {
      flex: 1,
      fontFamily: F.uiBold,
      fontSize: 11,
      color: T.textDim,
      textAlign: 'center',
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    calDayNum: { fontFamily: F.uiMed, fontSize: 14, color: T.text },
    calDayToday: { color: T.primary, fontFamily: F.uiBold },
    // Out of range: visibly unavailable rather than tappable-then-rejected.
    calDayDisabled: { color: T.muted, fontFamily: F.uiMed },
    calDaySelectedText: { color: T.onPrimary, fontFamily: F.uiBold },
  });
}
