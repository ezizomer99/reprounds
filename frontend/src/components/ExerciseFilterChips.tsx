import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMemo } from 'react';
import type { Exercise } from '@app/shared';
import { F, R, ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { withAlpha } from '../lib/color';

export interface ExerciseChipFilter {
  equipment: string | null;
  muscle: string | null;
}

export const EMPTY_FILTER: ExerciseChipFilter = { equipment: null, muscle: null };

/** Apply the equipment + muscle chip selection to a list (client-side). */
export function filterByChips(exercises: Exercise[], filter: ExerciseChipFilter): Exercise[] {
  return exercises.filter((e) => {
    if (filter.equipment && e.equipment !== filter.equipment) return false;
    if (filter.muscle && e.muscleGroup !== filter.muscle) return false;
    return true;
  });
}

function distinctSorted(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));
}

/**
 * Two rows of filter chips (equipment + muscle) derived from `exercises`.
 * Options come from the pre-chip-filtered list so toggling a chip doesn't
 * shrink the set of available chips.
 */
export function ExerciseFilterChips({ exercises, filter, onChange }: {
  exercises: Exercise[];
  filter: ExerciseChipFilter;
  onChange: (next: ExerciseChipFilter) => void;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);

  const equipmentOptions = useMemo(() => distinctSorted(exercises.map((e) => e.equipment)), [exercises]);
  const muscleOptions = useMemo(() => distinctSorted(exercises.map((e) => e.muscleGroup)), [exercises]);

  if (equipmentOptions.length === 0 && muscleOptions.length === 0) return null;

  const renderRow = (
    options: string[],
    selected: string | null,
    key: 'equipment' | 'muscle',
  ) => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {options.map((opt) => {
        const active = selected === opt;
        return (
          <TouchableOpacity
            key={opt}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onChange({ ...filter, [key]: active ? null : opt })}
            activeOpacity={0.8}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
              {opt}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      {equipmentOptions.length > 0 && renderRow(equipmentOptions, filter.equipment, 'equipment')}
      {muscleOptions.length > 0 && renderRow(muscleOptions, filter.muscle, 'muscle')}
    </View>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    container: { gap: 6 },
    row: { gap: 6, paddingHorizontal: 2, paddingVertical: 2 },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: R.chip,
      backgroundColor: T.surface2,
      borderWidth: 1,
      borderColor: T.border,
    },
    chipActive: { backgroundColor: withAlpha(T.primary, 0.15), borderColor: withAlpha(T.primary, 0.4) },
    chipText: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim, textTransform: 'capitalize' },
    chipTextActive: { color: T.primary, fontFamily: F.uiSemi },
  });
}
