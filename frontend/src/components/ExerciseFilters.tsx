import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { Exercise } from '@app/shared';
import { F, R, ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { withAlpha } from '../lib/color';

export interface ExerciseChipFilter {
  equipment: string | null;
  muscle: string | null;
}

export const EMPTY_FILTER: ExerciseChipFilter = { equipment: null, muscle: null };

/** Which filter dimensions to surface. The Exercises screen already groups its
 *  list by muscle, so it passes `['equipment']` to avoid a redundant control;
 *  the flat session picker passes both. */
export type FilterDimension = 'equipment' | 'muscle';
const ALL_DIMENSIONS: FilterDimension[] = ['equipment', 'muscle'];

const DIMENSION_LABEL: Record<FilterDimension, string> = {
  equipment: 'Equipment',
  muscle: 'Muscle group',
};

/** Every muscle an exercise works — primary first, then the secondaries. */
function musclesOf(e: Exercise): string[] {
  return [e.muscleGroup, ...(e.secondaryMuscles ?? [])].filter((m): m is string => !!m);
}

/** Apply the equipment + muscle selection to a list (client-side). */
export function filterByChips(exercises: Exercise[], filter: ExerciseChipFilter): Exercise[] {
  return exercises.filter((e) => {
    if (filter.equipment && e.equipment !== filter.equipment) return false;
    // Matches secondaries too: filtering by biceps should surface pull-ups,
    // which are a back exercise that happens to work them.
    if (filter.muscle && !musclesOf(e).includes(filter.muscle)) return false;
    return true;
  });
}

function distinctSorted(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));
}

function valueOf(filter: ExerciseChipFilter, dim: FilterDimension): string | null {
  return dim === 'equipment' ? filter.equipment : filter.muscle;
}

function withValue(filter: ExerciseChipFilter, dim: FilterDimension, value: string | null): ExerciseChipFilter {
  return dim === 'equipment' ? { ...filter, equipment: value } : { ...filter, muscle: value };
}

/**
 * A single "Filters" button that opens a labeled page-sheet of wrapping chips.
 * Replaces the old two-row horizontal-scroll chip strip: the dimensions are
 * clearly labeled, every option is visible at once, and active selections show
 * as removable chips inline next to the button.
 */
export function ExerciseFilters({ exercises, filter, onChange, dimensions = ALL_DIMENSIONS }: {
  exercises: Exercise[];
  filter: ExerciseChipFilter;
  onChange: (next: ExerciseChipFilter) => void;
  dimensions?: FilterDimension[];
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const [open, setOpen] = useState(false);

  const optionsByDim = useMemo(() => {
    const map = {} as Record<FilterDimension, string[]>;
    for (const dim of dimensions) {
      const values = dim === 'equipment'
        ? exercises.map((e) => e.equipment)
        : exercises.flatMap(musclesOf);
      map[dim] = distinctSorted(values);
    }
    return map;
  }, [exercises, dimensions]);

  // Only offer dimensions that actually have options in the current data set.
  const shownDimensions = dimensions.filter((dim) => optionsByDim[dim].length > 0);
  if (shownDimensions.length === 0) return null;

  const activeDimensions = shownDimensions.filter((dim) => valueOf(filter, dim) !== null);
  const activeCount = activeDimensions.length;

  function clearDimension(dim: FilterDimension) {
    onChange(withValue(filter, dim, null));
  }

  function clearAll() {
    let next = filter;
    for (const dim of shownDimensions) next = withValue(next, dim, null);
    onChange(next);
  }

  return (
    <View style={styles.bar}>
      <TouchableOpacity
        style={[styles.filterBtn, activeCount > 0 && styles.filterBtnActive]}
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="options-outline" size={16} color={activeCount > 0 ? T.primary : T.textDim} />
        <Text style={[styles.filterBtnText, activeCount > 0 && styles.filterBtnTextActive]}>Filters</Text>
        {activeCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{activeCount}</Text>
          </View>
        )}
      </TouchableOpacity>

      {activeDimensions.map((dim) => (
        <TouchableOpacity
          key={dim}
          style={styles.activeChip}
          onPress={() => clearDimension(dim)}
          activeOpacity={0.8}
        >
          <Text style={styles.activeChipText} numberOfLines={1}>{valueOf(filter, dim)}</Text>
          <Ionicons name="close" size={13} color={T.primary} />
        </TouchableOpacity>
      ))}

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalScreen}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={clearAll} disabled={activeCount === 0} hitSlop={8}>
              <Text style={[styles.modalClear, activeCount === 0 && styles.modalClearDisabled]}>Clear all</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Filters</Text>
            <TouchableOpacity onPress={() => setOpen(false)} hitSlop={8}>
              <Text style={styles.modalDone}>Done</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalBody} showsVerticalScrollIndicator={false}>
            {shownDimensions.map((dim) => {
              const selected = valueOf(filter, dim);
              return (
                <View key={dim} style={styles.group}>
                  <Text style={styles.groupLabel}>{DIMENSION_LABEL[dim]}</Text>
                  <View style={styles.chipWrap}>
                    {optionsByDim[dim].map((opt) => {
                      const active = selected === opt;
                      return (
                        <TouchableOpacity
                          key={opt}
                          style={[styles.chip, active && styles.chipActive]}
                          onPress={() => onChange(withValue(filter, dim, active ? null : opt))}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    bar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },

    filterBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: R.chip,
      backgroundColor: T.surface2,
      borderWidth: 1,
      borderColor: T.border,
    },
    filterBtnActive: { backgroundColor: withAlpha(T.primary, 0.12), borderColor: withAlpha(T.primary, 0.4) },
    filterBtnText: { fontFamily: F.uiSemi, fontSize: 13, color: T.textDim },
    filterBtnTextActive: { color: T.primary },
    badge: {
      minWidth: 18,
      height: 18,
      paddingHorizontal: 5,
      borderRadius: 9,
      backgroundColor: T.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: { fontFamily: F.uiBold, fontSize: 11, color: T.onPrimary },

    activeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingLeft: 12,
      paddingRight: 9,
      paddingVertical: 7,
      borderRadius: R.chip,
      backgroundColor: withAlpha(T.primary, 0.12),
      borderWidth: 1,
      borderColor: withAlpha(T.primary, 0.4),
    },
    activeChipText: {
      fontFamily: F.uiMed,
      fontSize: 12,
      color: T.primary,
      textTransform: 'capitalize',
      maxWidth: 160,
    },

    // Modal
    modalScreen: { flex: 1, backgroundColor: T.bg },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: T.border,
    },
    modalTitle: { fontFamily: F.uiBold, fontSize: 17, color: T.text },
    modalClear: { fontFamily: F.uiMed, fontSize: 15, color: T.textDim },
    modalClearDisabled: { color: T.muted, opacity: 0.5 },
    modalDone: { fontFamily: F.uiSemi, fontSize: 15, color: T.primary },

    modalBody: { padding: 20, gap: 24 },
    group: { gap: 12 },
    groupLabel: {
      fontFamily: F.uiBold,
      fontSize: 12,
      color: T.textDim,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: R.chip,
      backgroundColor: T.surface2,
      borderWidth: 1,
      borderColor: T.border,
    },
    chipActive: { backgroundColor: withAlpha(T.primary, 0.15), borderColor: withAlpha(T.primary, 0.4) },
    chipText: { fontFamily: F.uiMed, fontSize: 13, color: T.textDim, textTransform: 'capitalize' },
    chipTextActive: { color: T.primary, fontFamily: F.uiSemi },
  });
}
