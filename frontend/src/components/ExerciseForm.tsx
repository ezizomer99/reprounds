import { useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { ActivityType, Exercise } from '@app/shared';
import { FREE_CUSTOM_EXERCISE_LIMIT, NAME_MAX_LENGTH } from '@app/shared';
import { useCreateExercise, useExercises } from '../hooks/useExercises';
import { useCurrentUser } from '../hooks/useAuth';
import { useProGate } from '../hooks/useProGate';
import { MusclePicker, type MuscleSelection } from './MusclePicker';
import { Chip } from './ui/Chip';
import { F, R, type ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';

const EQUIPMENT_OPTIONS = [
  'Barbell', 'Dumbbell', 'Kettlebell', 'Machine', 'Bodyweight', 'Resistance Band', 'Other',
] as const;

export interface ExerciseFormProps {
  initialName?: string;
  submitLabel: string;
  onCreated: (exercise: Exercise) => void;
}

/**
 * Shared create-exercise form (fields + submit logic). Rendered inside modal
 * shells in both the session picker and the exercise library. The parent is
 * responsible for the modal chrome (Modal / BottomSheetModal, ScrollView, header).
 *
 * Pass a React `key` from the parent whenever you want the form to reset to a
 * blank state (e.g. when the parent modal dismisses).
 */
export function ExerciseForm({ initialName = '', submitLabel, onCreated }: ExerciseFormProps) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const [name, setName] = useState(initialName);
  const [type, setType] = useState<Exclude<ActivityType, 'martial_arts'>>('strength');
  const [muscles, setMuscles] = useState<MuscleSelection>({ primary: null, secondary: [] });
  const [equipment, setEquipment] = useState<string | null>(null);
  const createExercise = useCreateExercise();
  const { data: allExercises } = useExercises();
  const { data: currentUser } = useCurrentUser();
  const { isPro, showPaywall } = useProGate();

  async function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Validation', 'Name is required.');
      return;
    }
    const customCount = (allExercises ?? []).filter((e) => e.userId === currentUser?.id).length;
    if (!isPro && customCount >= FREE_CUSTOM_EXERCISE_LIMIT) {
      Alert.alert(
        'Limit reached',
        `Free accounts can create up to ${FREE_CUSTOM_EXERCISE_LIMIT} custom exercises. Upgrade to RepRounds Pro for unlimited exercises.`,
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Upgrade', onPress: showPaywall },
        ],
      );
      return;
    }
    try {
      const newExercise = await createExercise.mutateAsync({
        name: trimmed,
        type,
        muscleGroup: muscles.primary ?? undefined,
        secondaryMuscles: muscles.secondary,
        equipment: equipment ?? undefined,
      });
      onCreated(newExercise);
    } catch (err) {
      Alert.alert('Error', (err as Error).message ?? 'Failed to create exercise.');
    }
  }

  return (
    <>
      <View style={styles.field}>
        <Text style={styles.label}>Name *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Bench Press"
          maxLength={NAME_MAX_LENGTH}
          placeholderTextColor={T.muted}
          autoFocus
          returnKeyType="next"
          selectionColor={T.primary}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Type *</Text>
        <View style={styles.segmented}>
          {(['strength', 'conditioning'] as const).map((t, i) => (
            <TouchableOpacity
              key={t}
              style={[
                styles.segmentBtn,
                i === 0 && styles.segmentBtnLeft,
                i === 1 && styles.segmentBtnRight,
                type === t && styles.segmentBtnActive,
              ]}
              onPress={() => setType(t)}
            >
              <Text style={[styles.segmentText, type === t && styles.segmentTextActive]}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <MusclePicker value={muscles} onChange={setMuscles} />

      <View style={styles.field}>
        <Text style={styles.label}>Equipment</Text>
        <View style={styles.pillWrap}>
          {EQUIPMENT_OPTIONS.map((eq) => (
            <Chip
              key={eq}
              label={eq}
              selected={equipment === eq}
              onPress={() => setEquipment(equipment === eq ? null : eq)}
            />
          ))}
        </View>
      </View>

      <TouchableOpacity
        style={[styles.submitBtn, createExercise.isPending && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={createExercise.isPending}
        activeOpacity={0.8}
      >
        {createExercise.isPending ? (
          <ActivityIndicator color={T.onPrimary} />
        ) : (
          <Text style={styles.submitText}>{submitLabel}</Text>
        )}
      </TouchableOpacity>
    </>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    field: { marginBottom: 20 },
    label: {
      fontFamily: F.uiBold,
      fontSize: 11,
      color: T.textDim,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 8,
    },
    input: {
      borderWidth: 1,
      borderColor: T.border,
      borderRadius: R.sm,
      backgroundColor: T.surface,
      paddingHorizontal: 12,
      paddingVertical: 11,
      fontFamily: F.uiMed,
      fontSize: 15,
      color: T.text,
    },
    segmented: {
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: T.border,
      borderRadius: R.sm,
      overflow: 'hidden',
    },
    segmentBtn: { flex: 1, paddingVertical: 11, alignItems: 'center', backgroundColor: T.surface },
    segmentBtnLeft: { borderRightWidth: 1, borderRightColor: T.border },
    segmentBtnRight: {},
    segmentBtnActive: { backgroundColor: T.primary },
    segmentText: { fontFamily: F.uiMed, fontSize: 14, color: T.textDim },
    segmentTextActive: { fontFamily: F.uiBold, color: T.onPrimary },
    pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    submitBtn: {
      marginTop: 8,
      backgroundColor: T.primary,
      borderRadius: R.card,
      paddingVertical: 14,
      alignItems: 'center',
    },
    submitBtnDisabled: { opacity: 0.55 },
    submitText: { fontFamily: F.uiBold, fontSize: 16, color: T.onPrimary },
  });
}
