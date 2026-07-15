import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import type { RenderItemParams } from 'react-native-draggable-flatlist';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type {
  CreateRoutineItemRequest,
  Discipline,
  Exercise,
  PlannedSet,
  RoutineItemTarget,
  SetType,
} from '@app/shared';
import { useExercises } from '../../../src/hooks/useExercises';
import { useDisciplines } from '../../../src/hooks/useDisciplines';
import {
  useAddRoutineItem,
  useCreateRoutine,
  useRemoveRoutineItem,
  useReorderRoutineItems,
  useRoutines,
  useUpdateRoutine,
  useUpdateRoutineItem,
} from '../../../src/hooks/useRoutines';
import { useUnit } from '../../../src/units/UnitContext';
import { fmtWeight, unitToKg, fmtDuration, parseDuration, type WeightUnit } from '../../../src/units/units';
import { F, R, D, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { withAlpha } from '../../../src/lib/color';

type ExerciseType = 'strength' | 'conditioning';

interface PendingItem extends CreateRoutineItemRequest {
  _localId: string;
  _displayName: string;
}

function asTarget(raw: Record<string, unknown> | null | undefined): RoutineItemTarget | null {
  if (!raw) return null;
  return raw as RoutineItemTarget;
}

const WORKING_TYPE_CYCLE: SetType[] = ['normal', 'drop', 'failure', 'amrap'];
const SET_TYPE_LABEL: Record<SetType, string> = {
  warmup: 'Warm-up', normal: 'Normal', drop: 'Drop', failure: 'Failure', amrap: 'AMRAP',
};
function setTypeColors(T: ThemeColors): Record<SetType, string> {
  return { warmup: T.textDim, normal: T.primary, drop: T.grappling, failure: T.danger, amrap: T.gold };
}

function plannedSetsOf(target: RoutineItemTarget | null): PlannedSet[] {
  return Array.isArray(target?.sets) ? (target!.sets as PlannedSet[]) : [];
}

function formatTarget(target: RoutineItemTarget | null, type: ExerciseType, unit: WeightUnit): string | null {
  const sets = plannedSetsOf(target);
  if (sets.length === 0) return null;
  const warm = sets.filter((s) => s.setType === 'warmup').length;
  const work = sets.filter((s) => s.setType !== 'warmup');
  const warmStr = warm > 0 ? `${warm} warm-up · ` : '';

  if (work.length === 0) return warm > 0 ? `${warm} warm-up` : null;

  const first = work[0];
  const allSame = work.every((s) =>
    s.reps === first.reps && s.weight === first.weight && s.durationSeconds === first.durationSeconds,
  );

  if (allSame) {
    if (type === 'conditioning' && first.durationSeconds != null) {
      return `${warmStr}${work.length} × ${fmtDuration(first.durationSeconds)}`;
    }
    if (first.reps != null) {
      const w = first.weight != null ? ` @ ${fmtWeight(first.weight, unit)}${unit}` : '';
      return `${warmStr}${work.length} × ${first.reps}${w}`;
    }
  }
  return `${warmStr}${work.length} set${work.length !== 1 ? 's' : ''}`;
}

// ---- Item Row ----

interface ItemRowProps {
  name: string;
  kind: 'exercise' | 'martial_arts';
  targetSummary: string | null;
  onPress?: () => void;
  onRemove: () => void;
  drag?: () => void;
  isActive?: boolean;
}

function ItemRow({ name, kind, targetSummary, onPress, onRemove, drag, isActive }: ItemRowProps) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const tappable = kind === 'exercise' && !!onPress;
  return (
    <View style={[styles.itemRow, isActive && styles.itemRowActive]}>
      <TouchableOpacity onLongPress={drag} style={styles.gripHandle} activeOpacity={0.6} disabled={!drag}>
        <Ionicons name="reorder-three-outline" size={16} color={drag ? T.textDim : T.muted} />
      </TouchableOpacity>
      <View style={[styles.kindBadge, kind === 'martial_arts' && styles.kindBadgeMat]}>
        {kind === 'martial_arts' ? (
          <Ionicons name="flash" size={13} color={T.grappling} />
        ) : (
          <Ionicons name="barbell" size={13} color={T.textDim} />
        )}
      </View>
      <TouchableOpacity
        style={styles.itemMain}
        onPress={onPress}
        disabled={!tappable}
        activeOpacity={0.7}
      >
        <Text style={styles.itemName} numberOfLines={1}>{name}</Text>
        {tappable && (
          <Text style={[styles.itemTarget, !targetSummary && styles.itemTargetEmpty]} numberOfLines={1}>
            {targetSummary ?? 'Tap to plan sets · reps'}
          </Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity onPress={onRemove} style={styles.removeButton} activeOpacity={0.7}>
        <Ionicons name="close" size={14} color={T.danger} />
      </TouchableOpacity>
    </View>
  );
}

// ---- Planned Sets Editor ----

type PlanRow = PlannedSet & { _id: string };

let planRowSeq = 0;
function newRow(setType: SetType, base?: Partial<PlannedSet>): PlanRow {
  return {
    _id: `pr-${Date.now()}-${planRowSeq++}`,
    setType,
    reps: base?.reps ?? null,
    weight: base?.weight ?? null,
    durationSeconds: base?.durationSeconds ?? null,
  };
}

function PlanSetRow({ row, index, type, onChange, onCycleType, onRemove }: {
  row: PlanRow;
  index: number; // working-set number, or -1 for warm-up
  type: ExerciseType;
  onChange: (patch: Partial<PlannedSet>) => void;
  onCycleType: () => void;
  onRemove: () => void;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const SET_TYPE_COLOR = useMemo(() => setTypeColors(T), [T]);
  const { unit } = useUnit();
  const isWarm = row.setType === 'warmup';
  const isTime = type === 'conditioning';
  const [reps, setReps] = useState(row.reps != null ? String(row.reps) : '');
  const [weight, setWeight] = useState(row.weight != null ? fmtWeight(row.weight, unit) : '');
  const [duration, setDuration] = useState(row.durationSeconds != null ? fmtDuration(row.durationSeconds) : '');

  return (
    <View style={styles.planRow}>
      {isWarm ? (
        <View style={styles.planNum}>
          <Ionicons name="flame-outline" size={15} color={T.gold} />
        </View>
      ) : (
        <View style={styles.planNum}>
          <Text style={styles.planNumText}>{index}</Text>
        </View>
      )}

      {isWarm ? (
        <View style={styles.planTypePlaceholder} />
      ) : (
        <TouchableOpacity
          style={[styles.planTypeChip, { borderColor: withAlpha(SET_TYPE_COLOR[row.setType], 0.45) }]}
          onPress={onCycleType}
        >
          <Text style={[styles.planTypeChipText, { color: SET_TYPE_COLOR[row.setType] }]}>
            {SET_TYPE_LABEL[row.setType]}
          </Text>
        </TouchableOpacity>
      )}

      {isTime ? (
        <View style={[styles.planCell, { flex: 2 }]}>
          <TextInput
            style={styles.planCellValue}
            value={duration}
            onChangeText={setDuration}
            onBlur={() => {
              const secs = parseDuration(duration);
              if (secs !== null) setDuration(fmtDuration(secs));
              onChange({ durationSeconds: secs });
            }}
            placeholder="0:00"
            placeholderTextColor={T.muted}
            textAlign="center"
          />
          <Text style={styles.planCellUnit}>min</Text>
        </View>
      ) : (
        <>
          <View style={styles.planCell}>
            <TextInput
              style={styles.planCellValue}
              value={weight}
              onChangeText={setWeight}
              onBlur={() =>
                onChange({ weight: weight.trim() === '' ? null : unitToKg(Number(weight), unit) })
              }
              placeholder="—"
              placeholderTextColor={T.muted}
              keyboardType="decimal-pad"
              textAlign="center"
            />
            <Text style={styles.planCellUnit}>{unit}</Text>
          </View>
          <View style={styles.planCell}>
            <TextInput
              style={styles.planCellValue}
              value={reps}
              onChangeText={setReps}
              onBlur={() => onChange({ reps: reps.trim() === '' ? null : parseInt(reps, 10) })}
              placeholder="—"
              placeholderTextColor={T.muted}
              keyboardType="number-pad"
              textAlign="center"
            />
            <Text style={styles.planCellUnit}>reps</Text>
          </View>
        </>
      )}

      <TouchableOpacity onPress={onRemove} style={styles.planRemove} activeOpacity={0.7}>
        <Ionicons name="close" size={14} color={T.danger} />
      </TouchableOpacity>
    </View>
  );
}

interface PlannedSetsModalProps {
  visible: boolean;
  name: string;
  type: ExerciseType;
  initial: RoutineItemTarget | null;
  onClose: () => void;
  onSave: (target: RoutineItemTarget | null) => void;
}

function PlannedSetsModal({ visible, name, type, initial, onClose, onSave }: PlannedSetsModalProps) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const [rows, setRows] = useState<PlanRow[]>([]);

  function handleOpen() {
    const planned = plannedSetsOf(initial);
    setRows(planned.map((p) => newRow(p.setType, p)));
  }

  const warmups = rows.filter((r) => r.setType === 'warmup');
  const working = rows.filter((r) => r.setType !== 'warmup');

  function patchRow(id: string, patch: Partial<PlannedSet>) {
    setRows((prev) => prev.map((r) => (r._id === id ? { ...r, ...patch } : r)));
  }
  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r._id !== id));
  }
  function cycleType(id: string) {
    setRows((prev) => prev.map((r) => {
      if (r._id !== id) return r;
      const idx = WORKING_TYPE_CYCLE.indexOf(r.setType);
      const next = WORKING_TYPE_CYCLE[(idx + 1) % WORKING_TYPE_CYCLE.length];
      return { ...r, setType: next };
    }));
  }
  function addWarmup() {
    setRows((prev) => [newRow('warmup'), ...prev]);
  }
  function addWorking() {
    const lastWork = [...working].reverse()[0];
    setRows((prev) => [...prev, newRow('normal', lastWork ? { reps: lastWork.reps, weight: lastWork.weight, durationSeconds: lastWork.durationSeconds } : undefined)]);
  }

  function handleSave() {
    // Persist in display order: warm-ups first, then working sets.
    const ordered: PlannedSet[] = [...warmups, ...working].map(({ _id, ...rest }) => rest);
    onSave(ordered.length === 0 ? null : { sets: ordered });
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onShow={handleOpen} onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle} numberOfLines={1}>{name}</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 32 }}>
          <Text style={styles.planHint}>Plan each set — this pre-fills the workout when you start the routine.</Text>

          {/* Warm-up section */}
          {warmups.map((row) => (
            <PlanSetRow
              key={row._id}
              row={row}
              index={-1}
              type={type}
              onChange={(p) => patchRow(row._id, p)}
              onCycleType={() => {}}
              onRemove={() => removeRow(row._id)}
            />
          ))}
          <TouchableOpacity style={styles.planAddRow} onPress={addWarmup} activeOpacity={0.7}>
            <Ionicons name="add" size={15} color={T.gold} />
            <Text style={[styles.planAddText, { color: T.gold }]}>Warm-up</Text>
          </TouchableOpacity>

          {/* Working sets */}
          {working.map((row, i) => (
            <PlanSetRow
              key={row._id}
              row={row}
              index={i + 1}
              type={type}
              onChange={(p) => patchRow(row._id, p)}
              onCycleType={() => cycleType(row._id)}
              onRemove={() => removeRow(row._id)}
            />
          ))}
          <TouchableOpacity style={styles.planAddRow} onPress={addWorking} activeOpacity={0.7}>
            <Ionicons name="add" size={15} color={T.primary} />
            <Text style={styles.planAddText}>Set</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.saveTargetBtn} onPress={handleSave} activeOpacity={0.85}>
            <Text style={styles.saveTargetText}>Save Plan</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ---- Pick Exercise Modal ----

interface PickExerciseModalProps {
  visible: boolean;
  onClose: () => void;
  onPick: (exercise: Exercise) => void;
}

function PickExerciseModal({ visible, onClose, onPick }: PickExerciseModalProps) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const [search, setSearch] = useState('');
  const { data: exercises, isLoading } = useExercises({ search: search.trim() || undefined });

  function handleClose() {
    setSearch('');
    onClose();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Add Exercise</Text>
          <TouchableOpacity onPress={handleClose}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search exercises…"
          placeholderTextColor={T.muted}
          clearButtonMode="while-editing"
          returnKeyType="search"
          selectionColor={T.primary}
        />

        {isLoading ? (
          <View style={styles.modalCentered}>
            <ActivityIndicator size="large" color={T.primary} />
          </View>
        ) : (
          <FlatList
            data={exercises ?? []}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.pickRow}
                onPress={() => { onPick(item); handleClose(); }}
                activeOpacity={0.7}
              >
                <View style={styles.pickRowInfo}>
                  <Text style={styles.pickRowName}>{item.name}</Text>
                  <Text style={styles.pickRowType}>{item.equipment ?? item.muscleGroup ?? item.type}</Text>
                </View>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              <View style={styles.modalCentered}>
                <Text style={styles.emptyText}>No exercises found.</Text>
              </View>
            }
          />
        )}
      </View>
    </Modal>
  );
}

// ---- Pick Discipline Modal ----

interface PickDisciplineModalProps {
  visible: boolean;
  onClose: () => void;
  onPick: (discipline: Discipline) => void;
}

function PickDisciplineModal({ visible, onClose, onPick }: PickDisciplineModalProps) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { data: disciplines, isLoading } = useDisciplines();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Add Discipline</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={styles.modalCentered}>
            <ActivityIndicator size="large" color={T.primary} />
          </View>
        ) : (
          <FlatList
            data={disciplines ?? []}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.pickRow}
                onPress={() => { onPick(item); onClose(); }}
                activeOpacity={0.7}
              >
                <Text style={styles.pickRowName}>{item.name}</Text>
                <Text style={styles.pickRowType}>{item.category}</Text>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              <View style={styles.modalCentered}>
                <Text style={styles.emptyText}>No disciplines found.</Text>
              </View>
            }
          />
        )}
      </View>
    </Modal>
  );
}

// ---- Main Screen ----

export default function RoutineEditorScreen() {
  const { T } = useTheme();
  const { unit } = useUnit();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isNew = id === 'new';

  const { data: routines, isLoading: routinesLoading } = useRoutines();

  const existingRoutine = useMemo(
    () => (isNew ? undefined : routines?.find((t) => t.id === id)),
    [isNew, routines, id],
  );

  const [name, setName] = useState('');
  const [dayLabel, setDayLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [initialised, setInitialised] = useState(false);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [showDisciplinePicker, setShowDisciplinePicker] = useState(false);

  const createRoutine = useCreateRoutine();
  const updateRoutine = useUpdateRoutine();
  const addItem = useAddRoutineItem();
  const removeItem = useRemoveRoutineItem();
  const updateItem = useUpdateRoutineItem();
  const reorderItems = useReorderRoutineItems();

  const { data: allExercises } = useExercises();
  const [editingTarget, setEditingTarget] = useState<{ id: string; isPending: boolean } | null>(null);

  const exerciseTypeMap = useMemo(() => {
    const m: Record<string, ExerciseType> = {};
    allExercises?.forEach((e) => { m[e.id] = e.type; });
    return m;
  }, [allExercises]);

  function typeOf(exerciseId: string | null | undefined): ExerciseType {
    return (exerciseId && exerciseTypeMap[exerciseId]) || 'strength';
  }

  if (!isNew && existingRoutine && !initialised) {
    setName(existingRoutine.name);
    setDayLabel(existingRoutine.dayLabel ?? '');
    setNotes(existingRoutine.notes ?? '');
    setInitialised(true);
  }

  const isSaving = createRoutine.isPending || updateRoutine.isPending;

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Validation', 'Routine name is required.');
      return;
    }

    try {
      if (isNew) {
        await createRoutine.mutateAsync({
          name: trimmedName,
          dayLabel: dayLabel.trim() || null,
          notes: notes.trim() || null,
          items: pendingItems.map(({ _localId: _l, _displayName: _d, ...rest }) => rest),
        });
      } else if (existingRoutine) {
        await updateRoutine.mutateAsync({
          id: existingRoutine.id,
          name: trimmedName,
          dayLabel: dayLabel.trim() || null,
          notes: notes.trim() || null,
        });
      }
      router.back();
    } catch (err) {
      Alert.alert('Error', (err as Error).message ?? 'Failed to save routine.');
    }
  }

  function handleAddExercise(exercise: Exercise) {
    if (isNew) {
      setPendingItems((prev) => [
        ...prev,
        {
          _localId: `${Date.now()}-${exercise.id}`,
          _displayName: exercise.name,
          kind: 'exercise',
          exerciseId: exercise.id,
          disciplineId: null,
        },
      ]);
    } else if (existingRoutine) {
      addItem.mutate(
        { routineId: existingRoutine.id, kind: 'exercise', exerciseId: exercise.id },
        { onError: (err) => Alert.alert('Error', err.message ?? 'Failed to add exercise.') },
      );
    }
  }

  function handleAddDiscipline(discipline: Discipline) {
    if (isNew) {
      setPendingItems((prev) => [
        ...prev,
        {
          _localId: `${Date.now()}-${discipline.id}`,
          _displayName: discipline.name,
          kind: 'martial_arts',
          exerciseId: null,
          disciplineId: discipline.id,
        },
      ]);
    } else if (existingRoutine) {
      addItem.mutate(
        { routineId: existingRoutine.id, kind: 'martial_arts', disciplineId: discipline.id },
        { onError: (err) => Alert.alert('Error', err.message ?? 'Failed to add discipline.') },
      );
    }
  }

  function handleSaveTarget(ref: { id: string; isPending: boolean }, target: RoutineItemTarget | null) {
    const stored = target as Record<string, unknown> | null;
    if (ref.isPending) {
      setPendingItems((prev) => prev.map((i) => (i._localId === ref.id ? { ...i, target: stored } : i)));
    } else if (existingRoutine) {
      updateItem.mutate(
        { routineId: existingRoutine.id, itemId: ref.id, target: stored },
        { onError: (err) => Alert.alert('Error', err.message ?? 'Failed to save target.') },
      );
    }
  }

  const screenTitle = isNew ? 'New Routine' : (existingRoutine?.name ?? 'Edit Routine');

  if (!isNew && routinesLoading && !initialised) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={T.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={T.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{screenTitle}</Text>
        <TouchableOpacity
          onPress={handleSave}
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color={T.onPrimary} size="small" />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}
      >
        <View style={styles.fields}>
          <View style={styles.field}>
            <Text style={styles.label}>Name *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Push Day"
              placeholderTextColor={T.muted}
              returnKeyType="next"
              selectionColor={T.primary}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Day Label</Text>
            <TextInput
              style={styles.input}
              value={dayLabel}
              onChangeText={setDayLabel}
              placeholder="e.g. Monday, Push Day"
              placeholderTextColor={T.muted}
              returnKeyType="next"
              selectionColor={T.primary}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional notes…"
              placeholderTextColor={T.muted}
              multiline
              returnKeyType="default"
              selectionColor={T.primary}
            />
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>Items</Text>
        </View>

        {isNew ? (
          pendingItems.length > 0 ? (
            <DraggableFlatList
              data={pendingItems}
              keyExtractor={(item) => item._localId}
              onDragEnd={({ data }) => setPendingItems(data)}
              scrollEnabled={false}
              renderItem={({ item, drag, isActive }: RenderItemParams<PendingItem>) => (
                <ScaleDecorator>
                  <ItemRow
                    name={item._displayName}
                    kind={item.kind}
                    targetSummary={formatTarget(asTarget(item.target), typeOf(item.exerciseId), unit)}
                    onPress={() => setEditingTarget({ id: item._localId, isPending: true })}
                    onRemove={() => setPendingItems((prev) => prev.filter((i) => i._localId !== item._localId))}
                    drag={drag}
                    isActive={isActive}
                  />
                </ScaleDecorator>
              )}
            />
          ) : (
            <Text style={styles.emptyItemsText}>No items yet. Add exercises or disciplines below.</Text>
          )
        ) : (
          (existingRoutine?.items ?? []).length > 0 ? (
            <DraggableFlatList
              data={existingRoutine?.items ?? []}
              keyExtractor={(item) => item.id}
              onDragEnd={({ data }) => {
                if (!existingRoutine) return;
                reorderItems.mutate(
                  { routineId: existingRoutine.id, order: data.map((i) => i.id) },
                  { onError: (err) => Alert.alert('Error', err.message ?? 'Failed to reorder items.') },
                );
              }}
              scrollEnabled={false}
              renderItem={({ item, drag, isActive }) => (
                <ScaleDecorator>
                  <ItemRow
                    name={item.exerciseName ?? item.disciplineName ?? 'Unknown'}
                    kind={item.kind}
                    targetSummary={formatTarget(asTarget(item.target), typeOf(item.exerciseId), unit)}
                    onPress={() => setEditingTarget({ id: item.id, isPending: false })}
                    onRemove={() => {
                      if (!existingRoutine) return;
                      removeItem.mutate(
                        { routineId: existingRoutine.id, itemId: item.id },
                        { onError: (err) => Alert.alert('Error', err.message ?? 'Failed to remove item.') },
                      );
                    }}
                    drag={drag}
                    isActive={isActive}
                  />
                </ScaleDecorator>
              )}
            />
          ) : (
            <Text style={styles.emptyItemsText}>No items yet. Add exercises or disciplines below.</Text>
          )
        )}

        <View style={styles.addItemsRow}>
          <TouchableOpacity
            style={styles.addItemButton}
            onPress={() => setShowExercisePicker(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={14} color={T.primary} />
            <Text style={styles.addItemButtonText}>Add Exercise</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addItemButton}
            onPress={() => setShowDisciplinePicker(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={14} color={T.primary} />
            <Text style={styles.addItemButtonText}>Add Discipline</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <PickExerciseModal
        visible={showExercisePicker}
        onClose={() => setShowExercisePicker(false)}
        onPick={handleAddExercise}
      />
      <PickDisciplineModal
        visible={showDisciplinePicker}
        onClose={() => setShowDisciplinePicker(false)}
        onPick={handleAddDiscipline}
      />

      {editingTarget && (() => {
        let name = 'Exercise';
        let exerciseId: string | null = null;
        let target: RoutineItemTarget | null = null;
        if (editingTarget.isPending) {
          const it = pendingItems.find((i) => i._localId === editingTarget.id);
          if (!it) return null;
          name = it._displayName;
          exerciseId = it.exerciseId ?? null;
          target = asTarget(it.target);
        } else {
          const it = existingRoutine?.items.find((i) => i.id === editingTarget.id);
          if (!it) return null;
          name = it.exerciseName ?? 'Exercise';
          exerciseId = it.exerciseId ?? null;
          target = asTarget(it.target);
        }
        return (
          <PlannedSetsModal
            visible
            name={name}
            type={typeOf(exerciseId)}
            initial={target}
            onClose={() => setEditingTarget(null)}
            onSave={(t) => handleSaveTarget(editingTarget, t)}
          />
        );
      })()}
    </View>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontFamily: F.uiSemi, fontSize: 19, color: T.text, letterSpacing: -0.2 },
  saveButton: {
    backgroundColor: T.primary, borderRadius: R.sm,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  saveButtonDisabled: { opacity: 0.55 },
  saveButtonText: { fontFamily: F.uiBold, fontSize: 14, color: T.onPrimary },

  fields: { padding: D.pad, gap: D.stack },
  field: { gap: 8 },
  label: {
    fontFamily: F.uiBold, fontSize: 11, color: T.textDim,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  input: {
    borderWidth: 1, borderColor: T.border,
    borderRadius: R.sm, backgroundColor: T.surface,
    paddingHorizontal: 12, paddingVertical: 11,
    fontFamily: F.uiMed, fontSize: 15, color: T.text,
  },
  notesInput: { minHeight: 80, textAlignVertical: 'top' },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: D.pad, paddingTop: 24, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  sectionHeaderText: {
    fontFamily: F.uiBold, fontSize: 11, color: T.textDim,
    textTransform: 'uppercase', letterSpacing: 1.0,
  },
  sectionHeaderHint: { fontFamily: F.uiMed, fontSize: 11, color: T.muted },

  // Item rows
  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: D.pad, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: T.border,
    backgroundColor: T.bg,
  },
  itemRowActive: { backgroundColor: T.surface2 },

  gripHandle: { width: 24, alignItems: 'center' },
  kindBadge: {
    width: 30, height: 30, borderRadius: R.sm,
    backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center',
  },
  kindBadgeMat: { backgroundColor: withAlpha(T.grappling, 0.12) },
  itemMain: { flex: 1 },
  itemName: { fontFamily: F.uiMed, fontSize: 15, color: T.text },
  itemTarget: { fontFamily: F.uiMed, fontSize: 12, color: T.primary, marginTop: 2 },
  itemTargetEmpty: { color: T.muted },
  removeButton: {
    width: 28, height: 28, borderRadius: R.sm,
    backgroundColor: withAlpha(T.danger, 0.1),
    alignItems: 'center', justifyContent: 'center',
  },

  emptyItemsText: {
    fontFamily: F.uiMed, fontSize: 14, color: T.muted,
    textAlign: 'center', paddingVertical: 24, paddingHorizontal: 24,
  },

  addItemsRow: { flexDirection: 'row', gap: 10, padding: D.pad },
  addItemButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: R.sm, borderWidth: 1, borderColor: withAlpha(T.primary, 0.35),
    paddingVertical: 12, backgroundColor: withAlpha(T.primary, 0.06),
  },
  addItemButtonText: { fontFamily: F.uiMed, fontSize: 14, color: T.primary },

  // Target editor
  targetBody: { paddingHorizontal: D.pad, gap: D.stack },
  targetHint: { fontFamily: F.uiMed, fontSize: 13, color: T.textDim, lineHeight: 18, marginBottom: 4 },
  targetRow: { flexDirection: 'row', gap: 12 },
  saveTargetBtn: {
    marginTop: 20, marginHorizontal: D.pad, backgroundColor: T.primary, borderRadius: R.card,
    paddingVertical: 14, alignItems: 'center',
  },
  saveTargetText: { fontFamily: F.uiBold, fontSize: 16, color: T.onPrimary },

  // Planned set rows
  planHint: { fontFamily: F.uiMed, fontSize: 13, color: T.textDim, lineHeight: 18, paddingHorizontal: D.pad, paddingTop: 20, paddingBottom: 12 },
  planRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: D.pad, paddingVertical: 8,
  },
  planNum: { width: 30, height: 30, borderRadius: R.sm, borderWidth: 1.5, borderColor: T.borderStrong, alignItems: 'center', justifyContent: 'center' },
  planNumText: { fontFamily: F.monoBold, fontSize: 14, color: T.text },
  planTypeChip: { borderWidth: 1, borderRadius: R.chip, paddingHorizontal: 8, paddingVertical: 4, minWidth: 64, alignItems: 'center' },
  planTypeChipText: { fontFamily: F.uiSemi, fontSize: 11 },
  planTypePlaceholder: { minWidth: 64 },
  planCell: { flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 3, backgroundColor: T.surface2, borderRadius: R.sm, paddingVertical: 8 },
  planCellValue: { fontFamily: F.monoBold, fontSize: 15, color: T.text, minWidth: 28, padding: 0 },
  planCellUnit: { fontFamily: F.uiMed, fontSize: 10, color: T.muted },
  planRemove: { width: 28, height: 28, borderRadius: R.sm, backgroundColor: withAlpha(T.danger, 0.1), alignItems: 'center', justifyContent: 'center' },
  planAddRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: D.pad, paddingVertical: 10, marginLeft: 38 },
  planAddText: { fontFamily: F.uiSemi, fontSize: 13, color: T.primary },

  // Modals
  modalContainer: { flex: 1, backgroundColor: T.bg, paddingTop: 24 },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, marginBottom: 16,
  },
  modalTitle: { fontFamily: F.uiBold, fontSize: 20, color: T.text },
  modalCancel: { fontFamily: F.uiMed, fontSize: 16, color: T.textDim },
  searchInput: {
    backgroundColor: T.surface, borderRadius: R.sm,
    borderWidth: 1, borderColor: T.border,
    paddingHorizontal: 12, paddingVertical: 9,
    fontFamily: F.uiMed, fontSize: 14, color: T.text,
    marginHorizontal: D.pad, marginBottom: 12,
  },
  pickRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: D.pad, paddingVertical: 10, gap: 12,
  },
  pickRowInfo: { flex: 1 },
  pickRowName: { fontFamily: F.uiMed, fontSize: 15, color: T.text },
  pickRowType: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim, marginTop: 2, textTransform: 'capitalize' },
  separator: { height: 1, backgroundColor: T.border, marginLeft: D.pad },
  modalCentered: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  emptyText: { fontFamily: F.uiMed, fontSize: 15, color: T.muted },
  });
}
