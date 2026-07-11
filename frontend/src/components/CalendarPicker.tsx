import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { F, R, ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// Inline month-grid date picker. `value`/`onChange` use a local `YYYY-MM-DD`
// string. Extracted from the session logger so every date field (weigh-ins,
// fights, promotions) shares one validated picker instead of a raw text input.
export function CalendarPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (d: string) => void;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const [selY, selM, selD] = value.split('-').map(Number);
  const [viewYear, setViewYear] = useState(selY);
  const [viewMonth, setViewMonth] = useState(selM - 1); // 0-indexed

  function prevMonth() {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else setViewMonth((m) => m + 1);
  }
  function toISO(year: number, month: number, day: number): string {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const firstDayOffset = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstDayOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();

  return (
    <View style={styles.calContainer}>
      <View style={styles.calHeader}>
        <TouchableOpacity
          onPress={prevMonth}
          style={styles.calNavBtn}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <Ionicons name="chevron-back" size={20} color={T.text} />
        </TouchableOpacity>
        <Text style={styles.calMonthLabel}>
          {MONTH_NAMES[viewMonth]} {viewYear}
        </Text>
        <TouchableOpacity
          onPress={nextMonth}
          style={styles.calNavBtn}
          accessibilityRole="button"
          accessibilityLabel="Next month"
        >
          <Ionicons name="chevron-forward" size={20} color={T.text} />
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
            const isSelected = viewYear === selY && viewMonth === selM - 1 && day === selD;
            const isTdy =
              viewYear === today.getFullYear() &&
              viewMonth === today.getMonth() &&
              day === today.getDate();
            return (
              <TouchableOpacity
                key={col}
                style={[styles.calCell, isSelected && styles.calCellSelected]}
                onPress={() => onChange(toISO(viewYear, viewMonth, day))}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${MONTH_NAMES[viewMonth]} ${day}, ${viewYear}`}
              >
                <Text
                  style={[
                    styles.calDayNum,
                    isTdy && styles.calDayToday,
                    isSelected && styles.calDaySelectedText,
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
    calDaySelectedText: { color: T.onPrimary, fontFamily: F.uiBold },
  });
}
