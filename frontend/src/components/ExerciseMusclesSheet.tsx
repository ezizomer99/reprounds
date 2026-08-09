import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { Exercise } from '@app/shared';
import { useResetExerciseMuscles, useSetExerciseMuscles } from '../hooks/useExercises';
import { toMuscleOption, toMuscleOptions } from '../lib/muscleOptions';
import { MusclePicker, type MuscleSelection } from './MusclePicker';
import { Touchable } from './ui';
import { F, R, type ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';

/** The picker state a stored exercise starts from. */
function selectionFor(exercise: Exercise | null): MuscleSelection {
  const primary = toMuscleOption(exercise?.muscleGroup);
  return { primary, secondary: toMuscleOptions(exercise?.secondaryMuscles, primary) };
}

/**
 * Edit which muscles an exercise works. Reachable for seeded catalogue entries
 * as well as the user's own, since the catalogue tags one muscle per lift and
 * pull-ups plainly work two.
 *
 * A plain RN Modal with `presentationStyle="pageSheet"` like every other dialog
 * in the app — BottomSheetModal's `present()` no-ops in release builds here.
 */
export function ExerciseMusclesSheet({
  exercise,
  onClose,
}: {
  exercise: Exercise | null;
  onClose: () => void;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const setMuscles = useSetExerciseMuscles();
  const resetMuscles = useResetExerciseMuscles();
  const [value, setValue] = useState<MuscleSelection>(() => selectionFor(exercise));

  // Reseed whenever a different exercise opens the sheet, and again when the
  // refetch after a save lands, so the sheet never shows a stale selection.
  useEffect(() => {
    setValue(selectionFor(exercise));
  }, [exercise]);

  // Only a seeded row has catalogue values to fall back to; a user's own
  // exercise holds its muscles directly, so there is nothing to restore.
  const isSeeded = exercise?.userId === null;
  const busy = setMuscles.isPending || resetMuscles.isPending;

  async function handleSave() {
    if (!exercise) return;
    try {
      await setMuscles.mutateAsync({
        id: exercise.id,
        muscleGroup: value.primary,
        secondaryMuscles: value.secondary,
      });
      onClose();
    } catch (err) {
      Alert.alert('Error', (err as Error).message ?? 'Failed to save muscles.');
    }
  }

  function handleReset() {
    if (!exercise) return;
    Alert.alert(
      'Reset muscles',
      `Restore the default muscles for "${exercise.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              await resetMuscles.mutateAsync(exercise.id);
              onClose();
            } catch (err) {
              Alert.alert('Error', (err as Error).message ?? 'Failed to reset muscles.');
            }
          },
        },
      ],
    );
  }

  return (
    <Modal
      visible={exercise !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <ScrollView
        style={{ flex: 1, backgroundColor: T.bg }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Muscles</Text>
            <Text style={styles.subtitle} numberOfLines={1}>{exercise?.name}</Text>
          </View>
          <Touchable onPress={onClose} hasTextChild>
            <Text style={styles.cancel}>Cancel</Text>
          </Touchable>
        </View>

        <MusclePicker value={value} onChange={setValue} />

        <Touchable
          style={[styles.saveBtn, busy && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={busy}
          feedback="card"
          hasTextChild
        >
          {setMuscles.isPending ? (
            <ActivityIndicator color={T.onPrimary} />
          ) : (
            <Text style={styles.saveText}>Save</Text>
          )}
        </Touchable>

        {isSeeded && (
          <Touchable
            style={styles.resetBtn}
            onPress={handleReset}
            disabled={busy}
            hasTextChild
          >
            <Text style={styles.resetText}>Reset to default</Text>
          </Touchable>
        )}
      </ScrollView>
    </Modal>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    content: { padding: 20, paddingBottom: 48 },
    header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 22 },
    title: { fontFamily: F.uiBold, fontSize: 20, color: T.text },
    subtitle: { fontFamily: F.uiMed, fontSize: 13, color: T.textDim, marginTop: 2 },
    cancel: { fontFamily: F.uiMed, fontSize: 15, color: T.textDim, paddingTop: 3 },
    saveBtn: {
      marginTop: 8,
      backgroundColor: T.primary,
      borderRadius: R.card,
      paddingVertical: 14,
      alignItems: 'center',
    },
    saveBtnDisabled: { opacity: 0.55 },
    saveText: { fontFamily: F.uiBold, fontSize: 16, color: T.onPrimary },
    resetBtn: { marginTop: 14, paddingVertical: 10, alignItems: 'center' },
    resetText: { fontFamily: F.uiMed, fontSize: 14, color: T.textDim },
  });
}
