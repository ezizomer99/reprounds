import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import LottieView from 'lottie-react-native';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import type { RenderItemParams } from 'react-native-draggable-flatlist';
import Animated, { FadeIn, LinearTransition, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type {
  Discipline,
  EnumFieldDef,
  Exercise,
  SessionEntryWithSets,
  SessionWithEntries,
  SetType,
  StrengthSet,
} from '@app/shared';
import {
  FREE_CUSTOM_EXERCISE_LIMIT,
  isRoundsSession,
  NOTES_MAX_LENGTH,
  REPS_RANGE,
  REST_SECONDS_RANGE,
  RPE_RANGE,
  totalVolume,
} from '@app/shared';
import { useExercises } from '../../../src/hooks/useExercises';
import { useDisciplines } from '../../../src/hooks/useDisciplines';
import { useProGate } from '../../../src/hooks/useProGate';
import { ExerciseForm } from '../../../src/components/ExerciseForm';
import { ExerciseFilters, filterByChips, EMPTY_FILTER, type ExerciseChipFilter } from '../../../src/components/ExerciseFilters';
import {
  useSession,
  useCompleteSession,
  useSkipSession,
  useStartSession,
  useUpdateSession,
  useDeleteSession,
  useAddSessionEntry,
  useUpdateSessionEntry,
  useDeleteSessionEntry,
  useReorderSessionEntries,
  useAddStrengthSet,
  useUpdateStrengthSet,
  useDeleteStrengthSet,
  useExerciseHistory,
} from '../../../src/hooks/useSession';
import { useRoutines } from '../../../src/hooks/useRoutines';
import { useFocuses, useSetSessionFocuses } from '../../../src/hooks/useFocuses';
import { RestTimer } from '../../../src/components/RestTimer';
import { CutCornerView } from '../../../src/components/CutCornerView';
import { Skeleton } from '../../../src/components/Skeleton';
import { RoundLogger, BOXING_WEAPONS, MUAY_THAI_WEAPONS } from '../../../src/components/RoundLogger';
import { PlateCalculator } from '../../../src/components/PlateCalculator';
import { CalendarPicker } from '../../../src/components/CalendarPicker';
import { formatDayTitle, localTodayISO } from '../../../src/lib/calendar';
import { useUnit } from '../../../src/units/UnitContext';
import {
  fmtWeight,
  kgToUnit,
  unitToKg,
  fmtDuration,
  fmtMinutes,
  parseDuration,
  weightInputRange,
} from '../../../src/units/units';
import {
  clearActiveRest,
  getActiveRest,
  setActiveRest,
  updateActiveRestNotifId,
} from '../../../src/lib/restTimerStore';
import {
  parseIntInRangeResult,
  parseNumberInRange,
  parseNumberInRangeResult,
} from '../../../src/lib/parseNumber';
import { suggestOverload } from '../../../src/lib/overload';
import { generateWarmupRamp } from '../../../src/lib/warmup';
import { cancelScheduled, cancelScheduledByKind, scheduleInSeconds } from '../../../src/lib/notifications';
import { F, R, D, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { withAlpha } from '../../../src/lib/color';

// The set-row weight/reps/RPE cells are fixed-size boxes; past this scale the
// numbers grow wider than the cell and Android clips them at the edges.
const CELL_MAX_FONT_SCALE = 1.1;

const SET_TYPE_CYCLE: SetType[] = ['warmup', 'normal', 'drop', 'failure', 'amrap'];
const SET_TYPE_LABEL: Record<SetType, string> = {
  warmup: 'Warmup',
  normal: 'Normal',
  drop: 'Drop',
  failure: 'Failure',
  amrap: 'AMRAP',
};
function setTypeColors(T: ThemeColors): Record<SetType, string> {
  return { warmup: T.textDim, normal: T.primary, drop: T.grappling, failure: T.danger, amrap: T.gold };
}
const SET_TYPE_SHORT: Record<SetType, string> = {
  warmup:  'WU',
  normal:  '',
  drop:    'DROP',
  failure: 'FAIL',
  amrap:   'AMRAP',
};

/**
 * Next free setNumber for an entry. Must be derived from the highest existing
 * number, not `sets.length`: the backend deletes a set without renumbering its
 * siblings, so deleting set 2 of 3 leaves [1, 3] with length 2 — and
 * `length + 1` then hands the next set a duplicate 3. The list is ordered by
 * setNumber server-side, so duplicates order non-deterministically and
 * visibly swap places between refetches.
 */
/**
 * Bound for free-form numeric fields in a discipline's field_config (rounds
 * rolled, submissions landed, …). Deliberately generous — the schema doesn't
 * declare per-field ranges — but finite, so NaN and Infinity can't get through.
 */
const MA_NUMBER_RANGE = { min: 0, max: 100_000 };

function nextSetNumber(sets: readonly StrengthSet[]): number {
  return sets.reduce((max, s) => Math.max(max, s.setNumber), 0) + 1;
}

function formatElapsed(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}


// ─── Exercise picker modal ────────────────────────────────────────────────────

function PickExerciseModal({ visible, onClose, onPick, title = 'Add Exercise' }: {
  visible: boolean;
  onClose: () => void;
  onPick: (e: Exercise) => void;
  title?: string;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ExerciseChipFilter>(EMPTY_FILTER);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const { data: exercises, isLoading } = useExercises({ search: search.trim() || undefined });
  const { isPro, showPaywall } = useProGate();

  const filteredExercises = useMemo(
    () => filterByChips(exercises ?? [], filter),
    [exercises, filter],
  );

  function handleClose() {
    setSearch('');
    setFilter(EMPTY_FILTER);
    setShowCreate(false);
    onClose();
  }

  function handleCreatePress() {
    const allCustom = (exercises ?? []).filter((e) => e.userId != null);
    const searchActive = search.trim().length > 0;
    if (!isPro && !searchActive && allCustom.length >= FREE_CUSTOM_EXERCISE_LIMIT) {
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
    setCreateName(search.trim());
    setShowCreate(true);
  }

  const trimmed = search.trim();

  return (
    <>
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={handleClose}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.modalSearch}
            value={search}
            onChangeText={setSearch}
            placeholder="Search exercises..."
            placeholderTextColor={T.muted}
            clearButtonMode="while-editing"
          />
          {!isLoading && (exercises?.length ?? 0) > 0 && (
            <View style={styles.pickerFilterRow}>
              <ExerciseFilters exercises={exercises ?? []} filter={filter} onChange={setFilter} />
            </View>
          )}
          {isLoading ? (
            <View style={styles.centered}><ActivityIndicator color={T.primary} /></View>
          ) : (
            <FlatList
              data={filteredExercises}
              keyExtractor={(i) => i.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.pickRow} onPress={() => { onPick(item); handleClose(); }}>
                  <View style={styles.pickInfo}>
                    <Text style={styles.pickName}>{item.name}</Text>
                    <Text style={styles.pickMeta}>{item.equipment ?? item.muscleGroup ?? item.type}</Text>
                  </View>
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              ListEmptyComponent={
                trimmed ? (
                  <TouchableOpacity style={styles.createExRow} onPress={handleCreatePress} activeOpacity={0.7}>
                    <Ionicons name="add-circle-outline" size={20} color={T.primary} />
                    <Text style={styles.createExText}>Create exercise "{trimmed}"</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.centered}><Text style={styles.emptyText}>No exercises found.</Text></View>
                )
              }
            />
          )}
        </View>
      </Modal>
      <CreateExerciseInSessionModal
        visible={showCreate}
        initialName={createName}
        onClose={() => setShowCreate(false)}
        onCreated={(exercise) => {
          setShowCreate(false);
          onPick(exercise);
          handleClose();
        }}
      />
    </>
  );
}

// ─── Create exercise modal (used from session picker) ─────────────────────────

function CreateExerciseInSessionModal({
  visible,
  initialName,
  onClose,
  onCreated,
}: {
  visible: boolean;
  initialName: string;
  onClose: () => void;
  onCreated: (exercise: Exercise) => void;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView
        style={styles.modal}
        contentContainerStyle={styles.createExContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>New Exercise</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>
        <ExerciseForm
          key={visible ? (initialName || '_') : ''}
          initialName={initialName}
          submitLabel="Create & Add to Session"
          onCreated={onCreated}
        />
      </ScrollView>
    </Modal>
  );
}

// ─── Discipline picker modal ──────────────────────────────────────────────────

function PickDisciplineModal({ visible, onClose, onPick }: {
  visible: boolean;
  onClose: () => void;
  onPick: (d: Discipline) => void;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { data: disciplines, isLoading } = useDisciplines();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modal}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Add Discipline</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>
        {isLoading ? (
          <View style={styles.centered}><ActivityIndicator color={T.primary} /></View>
        ) : (
          <FlatList
            data={disciplines ?? []}
            keyExtractor={(i) => i.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.pickRow} onPress={() => { onPick(item); onClose(); }}>
                <Text style={styles.pickName}>{item.name}</Text>
                <Text style={styles.pickMeta}>{item.category}</Text>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={<View style={styles.centered}><Text style={styles.emptyText}>No disciplines found.</Text></View>}
          />
        )}
      </View>
    </Modal>
  );
}

// ─── Set row ─────────────────────────────────────────────────────────────────

function SetRow({ set, sessionId, entryId, displayNumber, onCompleted, onOpenMenu, exerciseType }: {
  set: StrengthSet;
  sessionId: string;
  entryId: string;
  displayNumber: number | null; // null = warm-up
  onCompleted?: (weightKg: number | null) => void;
  onOpenMenu: () => void;
  exerciseType?: 'strength' | 'conditioning';
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const SET_TYPE_COLOR = useMemo(() => setTypeColors(T), [T]);
  const isTime = exerciseType === 'conditioning';
  const isWarm = set.setType === 'warmup';
  // A just-added set carries a temporary client id until the list refetches;
  // any PATCH/DELETE against that id would 404, and the id swap remounts the
  // row anyway — so hold off all interaction until the real id lands.
  const isOptimistic = set.id.startsWith('optimistic-');
  const updateSet = useUpdateStrengthSet();
  const { unit } = useUnit();
  const [reps, setReps] = useState(set.reps !== null ? String(set.reps) : '');
  const [weight, setWeight] = useState(set.weight !== null ? fmtWeight(set.weight, unit) : '');
  const [duration, setDuration] = useState(set.reps !== null ? fmtDuration(set.reps) : '');
  const [rpe, setRpe] = useState(set.rpe !== null ? String(set.rpe) : '');
  const [notes, setNotes] = useState(set.notes ?? '');
  const [showNote, setShowNote] = useState(false);
  // Which cells currently hold something unusable, so they can be flagged
  // instead of silently discarding the value.
  const [badFields, setBadFields] = useState<Record<string, boolean>>({});

  const markField = (key: string, bad: boolean) =>
    setBadFields((prev) => (prev[key] === bad ? prev : { ...prev, [key]: bad }));

  // The cached set is the source of truth after a rollback. Without this the
  // query cache reverted but the TextInput kept showing the rejected text, so
  // a value the server refused looked saved. Skipped while the field has focus
  // so a background refetch can't stomp what's being typed.
  const focusedField = useRef<string | null>(null);
  useEffect(() => {
    if (focusedField.current !== 'reps') setReps(set.reps !== null ? String(set.reps) : '');
    if (focusedField.current !== 'duration') setDuration(set.reps !== null ? fmtDuration(set.reps) : '');
  }, [set.reps]);
  useEffect(() => {
    if (focusedField.current !== 'weight') {
      setWeight(set.weight !== null ? fmtWeight(set.weight, unit) : '');
    }
  }, [set.weight, unit]);
  useEffect(() => {
    if (focusedField.current !== 'rpe') setRpe(set.rpe !== null ? String(set.rpe) : '');
  }, [set.rpe]);

  const onFieldFocus = (key: string) => () => { focusedField.current = key; };
  const onFieldBlur = (key: string, handler: () => void) => () => {
    if (focusedField.current === key) focusedField.current = null;
    handler();
  };

  function handleBlurNotes() {
    if (isOptimistic) return;
    updateSet.mutate({ sessionId, entryId, setId: set.id, notes: notes.trim() || null });
  }

  function handleBlurReps() {
    if (isOptimistic) return;
    const { value, invalid } = parseIntInRangeResult(reps, REPS_RANGE);
    markField('reps', invalid);
    // Don't send a value the API will reject — the optimistic update would
    // paint it on screen and the rollback would be invisible.
    if (invalid) return;
    updateSet.mutate({ sessionId, entryId, setId: set.id, reps: value });
  }

  function handleBlurWeight() {
    if (isOptimistic) return;
    const { value, invalid } = parseNumberInRangeResult(weight, weightInputRange(unit));
    markField('weight', invalid);
    if (invalid) return;
    updateSet.mutate({
      sessionId,
      entryId,
      setId: set.id,
      weight: value === null ? null : unitToKg(value, unit),
    });
  }

  function handleBlurDuration() {
    if (isOptimistic) return;
    const secs = parseDuration(duration);
    markField('duration', duration.trim() !== '' && secs === null);
    if (duration.trim() !== '' && secs === null) return;
    setDuration(secs !== null ? fmtDuration(secs) : '');
    updateSet.mutate({ sessionId, entryId, setId: set.id, reps: secs });
  }

  function handleBlurRpe() {
    if (isOptimistic) return;
    const { value, invalid } = parseNumberInRangeResult(rpe, RPE_RANGE);
    markField('rpe', invalid);
    if (invalid) return;
    updateSet.mutate({ sessionId, entryId, setId: set.id, rpe: value });
  }

  const isDone = set.completed;
  const hasNote = (set.notes ?? '').trim().length > 0;

  function toggleComplete() {
    if (isOptimistic) return;
    const next = !isDone;
    const parsedWeight = parseNumberInRange(weight, weightInputRange(unit));
    const wKg = isTime || parsedWeight === null ? null : unitToKg(parsedWeight, unit);
    if (next) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    updateSet.mutate(
      { sessionId, entryId, setId: set.id, completed: next },
      { onSuccess: () => { if (next) onCompleted?.(set.setType !== 'warmup' ? wKg : null); } },
    );
  }

  return (
    <View>
    <View style={[styles.setRow, isDone && { backgroundColor: withAlpha(T.primary, 0.08) }]}>
      {/* Number circle / warm-up — tap to toggle complete */}
      <View style={styles.setCircleCol}>
        <TouchableOpacity
          style={[
            styles.setCircle,
            { borderColor: SET_TYPE_COLOR[set.setType] },
            isDone && styles.setCircleDone,
          ]}
          onPress={toggleComplete}
          disabled={updateSet.isPending || isOptimistic}
          accessibilityRole="button"
          accessibilityLabel={`Set ${displayNumber ?? 'warm-up'} — ${isDone ? 'completed, tap to un-complete' : 'tap to complete'}`}
        >
          {isDone ? (
            <Ionicons name="checkmark" size={16} color={T.onPrimary} />
          ) : isWarm ? (
            <Ionicons name="flame-outline" size={14} color={T.gold} />
          ) : (
            <Text style={styles.setCircleText}>{displayNumber}</Text>
          )}
        </TouchableOpacity>
        {!isDone && set.setType !== 'normal' && (
          <Text style={[styles.setTypeLabel, { color: SET_TYPE_COLOR[set.setType] }]}>
            {SET_TYPE_SHORT[set.setType]}
          </Text>
        )}
      </View>

      {isTime ? (
        <View style={[styles.cell, { flex: 2 }, isDone && styles.cellDone, badFields.duration && styles.cellInvalid]}>
          <TextInput
            style={styles.cellValue}
            value={duration}
            onChangeText={setDuration}
            onFocus={onFieldFocus('duration')}
            onBlur={onFieldBlur('duration', handleBlurDuration)}
            placeholder="0:00"
            placeholderTextColor={T.muted}
            keyboardType="default"
            returnKeyType="done"
            editable={!isDone && !isOptimistic}
            textAlign="center"
            maxFontSizeMultiplier={CELL_MAX_FONT_SCALE}
          />
          <Text style={styles.cellUnit} maxFontSizeMultiplier={CELL_MAX_FONT_SCALE}>min</Text>
        </View>
      ) : (
        <>
          <View style={[styles.cell, isDone && styles.cellDone, badFields.weight && styles.cellInvalid]}>
            <TextInput
              style={styles.cellValue}
              value={weight}
              onChangeText={setWeight}
              onFocus={onFieldFocus('weight')}
              onBlur={onFieldBlur('weight', handleBlurWeight)}
              placeholder="—"
              placeholderTextColor={T.muted}
              keyboardType="decimal-pad"
              returnKeyType="done"
              editable={!isDone && !isOptimistic}
              textAlign="center"
              maxFontSizeMultiplier={CELL_MAX_FONT_SCALE}
            />
            <Text style={styles.cellUnit} maxFontSizeMultiplier={CELL_MAX_FONT_SCALE}>{unit}</Text>
          </View>

          <View style={[styles.cell, isDone && styles.cellDone, badFields.reps && styles.cellInvalid]}>
            <TextInput
              style={styles.cellValue}
              value={reps}
              onChangeText={setReps}
              onFocus={onFieldFocus('reps')}
              onBlur={onFieldBlur('reps', handleBlurReps)}
              placeholder="—"
              placeholderTextColor={T.muted}
              keyboardType="number-pad"
              returnKeyType="done"
              editable={!isDone && !isOptimistic}
              textAlign="center"
              maxFontSizeMultiplier={CELL_MAX_FONT_SCALE}
            />
            <Text style={styles.cellUnit} maxFontSizeMultiplier={CELL_MAX_FONT_SCALE}>reps</Text>
          </View>

          {!isWarm && (
            <View style={[styles.cellRpe, isDone && styles.cellDone, badFields.rpe && styles.cellInvalid]}>
              <TextInput
                style={[styles.cellValue, { fontSize: 15 }]}
                value={rpe}
                onChangeText={setRpe}
                onFocus={onFieldFocus('rpe')}
                onBlur={onFieldBlur('rpe', handleBlurRpe)}
                placeholder="—"
                placeholderTextColor={T.muted}
                keyboardType="decimal-pad"
                returnKeyType="done"
                editable={!isDone && !isOptimistic}
                textAlign="center"
                maxFontSizeMultiplier={CELL_MAX_FONT_SCALE}
              />
              <Text style={styles.cellUnit} maxFontSizeMultiplier={CELL_MAX_FONT_SCALE}>RPE</Text>
            </View>
          )}
        </>
      )}

      <TouchableOpacity style={styles.menuBtn} onPress={() => setShowNote((v) => !v)}>
        <Ionicons
          name={hasNote ? 'document-text' : 'document-text-outline'}
          size={15}
          color={hasNote ? T.primary : T.muted}
        />
      </TouchableOpacity>

      <TouchableOpacity style={styles.menuBtn} onPress={onOpenMenu} disabled={isOptimistic}>
        <Ionicons name="ellipsis-vertical" size={16} color={T.muted} />
      </TouchableOpacity>
    </View>

    {(showNote || hasNote) && (
      <TextInput
        style={[styles.maInput, styles.setNoteInput]}
        value={notes}
        onChangeText={setNotes}
        onBlur={handleBlurNotes}
        placeholder="Note…"
        placeholderTextColor={T.muted}
        multiline
        maxLength={NOTES_MAX_LENGTH}
        textAlignVertical="top"
        /* Notes stay editable even after the set is completed */
      />
    )}
    </View>
  );
}

// ─── Per-set actions menu ─────────────────────────────────────────────────────

function SetActionsMenu({ set, onSetType, onDuplicate, onDelete, onPlateMath, onClose }: {
  set: StrengthSet;
  onSetType: (t: SetType) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onPlateMath: () => void;
  onClose: () => void;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const SET_TYPE_COLOR = useMemo(() => setTypeColors(T), [T]);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.menuSheet}>
          <Text style={styles.menuHeader}>Set type</Text>
          {SET_TYPE_CYCLE.map((t) => (
            <TouchableOpacity key={t} style={styles.menuItem} onPress={() => { onSetType(t); onClose(); }}>
              <Text style={[styles.menuItemText, { color: SET_TYPE_COLOR[t] }]}>{SET_TYPE_LABEL[t]}</Text>
              {set.setType === t && <Ionicons name="checkmark" size={16} color={T.primary} />}
            </TouchableOpacity>
          ))}
          <View style={styles.menuDivider} />
          <TouchableOpacity style={styles.menuItem} onPress={() => { onPlateMath(); onClose(); }}>
            <Ionicons name="barbell-outline" size={16} color={T.textDim} />
            <Text style={styles.menuItemText}>Plate math</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => { onDuplicate(); onClose(); }}>
            <Ionicons name="copy-outline" size={16} color={T.textDim} />
            <Text style={styles.menuItemText}>Duplicate set</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => { onDelete(); onClose(); }}>
            <Ionicons name="trash-outline" size={16} color={T.danger} />
            <Text style={[styles.menuItemText, { color: T.danger }]}>Delete set</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Rest timer preset sheet ──────────────────────────────────────────────────

const REST_PRESETS: Array<{ label: string; value: number }> = [
  { label: 'Off', value: 0 },
  { label: '0:30', value: 30 },
  { label: '1:00', value: 60 },
  { label: '1:30', value: 90 },
  { label: '2:00', value: 120 },
  { label: '3:00', value: 180 },
  { label: '5:00', value: 300 },
];

function RestTimerSheet({ current, onSelect, onClose }: {
  current: number | null;
  onSelect: (v: number) => void;
  onClose: () => void;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const isPreset = REST_PRESETS.some((p) => p.value === current);
  const [custom, setCustom] = useState(current !== null && !isPreset ? String(current) : '');
  // Already validated correctly before the shared helper existed; routed
  // through it so the 1-600s bound lives in one place with the others.
  const customParsed = parseIntInRangeResult(custom, REST_SECONDS_RANGE).value;
  const customValid = customParsed !== null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.menuSheet} onStartShouldSetResponder={() => true}>
          <Text style={styles.menuHeader}>Rest Timer</Text>
          {REST_PRESETS.map((p) => (
            <TouchableOpacity
              key={String(p.value)}
              style={styles.menuItem}
              onPress={() => { onSelect(p.value); onClose(); }}
            >
              <Text style={styles.menuItemText}>{p.label}</Text>
              {current === p.value && <Ionicons name="checkmark" size={16} color={T.primary} />}
            </TouchableOpacity>
          ))}
          <View style={styles.restCustomRow}>
            <TextInput
              style={styles.restCustomInput}
              value={custom}
              onChangeText={setCustom}
              placeholder="Custom (sec)"
              placeholderTextColor={T.muted}
              keyboardType="number-pad"
              maxLength={3}
              accessibilityLabel="Custom rest duration in seconds"
            />
            <TouchableOpacity
              style={[styles.restCustomSet, !customValid && { opacity: 0.4 }]}
              disabled={!customValid}
              onPress={() => { if (customParsed !== null) { onSelect(customParsed); onClose(); } }}
              accessibilityRole="button"
              accessibilityLabel="Set custom rest duration"
            >
              <Text style={styles.restCustomSetText}>Set</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Entry context menu (swap / remove) ───────────────────────────────────────

function EntryContextMenu({ onSwap, onGenerateWarmups, warmupsDisabled, onRemove, onClose }: {
  onSwap: () => void;
  onGenerateWarmups: () => void;
  warmupsDisabled: boolean;
  onRemove: () => void;
  onClose: () => void;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.menuSheet}>
          <Text style={styles.menuHeader}>Exercise</Text>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => { onSwap(); onClose(); }}
            accessibilityRole="button"
            accessibilityLabel="Swap exercise"
          >
            <Ionicons name="swap-horizontal-outline" size={16} color={T.textDim} />
            <Text style={styles.menuItemText}>Swap exercise</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.menuItem, warmupsDisabled && { opacity: 0.4 }]}
            onPress={() => { if (!warmupsDisabled) { onGenerateWarmups(); onClose(); } }}
            disabled={warmupsDisabled}
            accessibilityRole="button"
            accessibilityLabel="Generate warm-up sets"
          >
            <Ionicons name="flame-outline" size={16} color={T.gold} />
            <Text style={styles.menuItemText}>Generate warm-ups</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => { onRemove(); onClose(); }}
            accessibilityRole="button"
            accessibilityLabel="Remove exercise from session"
          >
            <Ionicons name="trash-outline" size={16} color={T.danger} />
            <Text style={[styles.menuItemText, { color: T.danger }]}>Remove exercise</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Last time ghost rows ─────────────────────────────────────────────────────

function LastTime({ exerciseId }: { exerciseId: string }) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { unit } = useUnit();
  const { data } = useExerciseHistory(exerciseId);

  const priorSets = useMemo(() => {
    if (!data?.history.length) return [];
    return data.history[0].entry.sets.filter(
      (s) => s.completed && s.setType !== 'warmup' && s.reps !== null,
    );
  }, [data]);

  if (!priorSets.length) return null;

  return (
    <View style={styles.ghostContainer}>
      <Text style={styles.ghostHeader}>Last session</Text>
      {priorSets.map((s, i) => {
        const weightStr = s.weight !== null
          ? `${fmtWeight(s.weight, unit)} ${unit}`
          : 'bw';
        return (
          <View key={i} style={styles.ghostRow}>
            <Text style={styles.ghostNum}>{i + 1}</Text>
            <Text style={styles.ghostLabel}>{weightStr} × {s.reps}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Strength entry card ──────────────────────────────────────────────────────

function StrengthEntryCard({ entry, sessionId, onStartRest, onStopRest, restingActive, onPR, exerciseType, exerciseMeta, sessionActive, collapsed = false, onToggleCollapse, onDrag }: {
  entry: SessionEntryWithSets;
  sessionId: string;
  onStartRest: (restSecs: number) => void;
  onStopRest: () => void;
  restingActive: boolean;
  onPR?: (exerciseName: string) => void;
  exerciseType?: 'strength' | 'conditioning';
  exerciseMeta?: { equipment: string | null; bodyPart: string | null };
  sessionActive?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Provided only while collapsed — long-pressing the header starts a drag. */
  onDrag?: () => void;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { unit } = useUnit();
  const isTime = exerciseType === 'conditioning';
  const addSet = useAddStrengthSet();
  const updateSet = useUpdateStrengthSet();
  const deleteSet = useDeleteStrengthSet();
  const updateEntry = useUpdateSessionEntry();
  const deleteEntry = useDeleteSessionEntry();
  const { data: history } = useExerciseHistory(entry.exerciseId);
  // New entries arrive server-seeded with a concrete value; null only remains
  // on legacy rows, rendered as the historical 2:00 fallback.
  const restSeconds = entry.restSeconds ?? 120;
  const restChipLabel = restSeconds === 0 ? 'Off' : fmtDuration(restSeconds);
  const [menuSet, setMenuSet] = useState<StrengthSet | null>(null);
  const [plateWeight, setPlateWeight] = useState<number | null>(null);
  const [showEntryMenu, setShowEntryMenu] = useState(false);
  const [showRestSheet, setShowRestSheet] = useState(false);
  const [showSwapPicker, setShowSwapPicker] = useState(false);

  const warmups = entry.sets.filter((s) => s.setType === 'warmup');
  const working = entry.sets.filter((s) => s.setType !== 'warmup');

  // Last session's working sets, used to autofill when starting fresh.
  const lastSessionWorking = useMemo(
    () => (history?.history[0]?.entry.sets ?? []).filter((s) => s.setType !== 'warmup'),
    [history],
  );

  // Progressive-overload chip: suggest a bump when last session earned it.
  const [overloadDismissed, setOverloadDismissed] = useState(false);
  // Bumped after Apply so SetRows remount and re-init their local input text
  // from the updated weights (the inputs don't sync from props by design).
  const [applyNonce, setApplyNonce] = useState(0);
  const overload = useMemo(
    () => (isTime ? null : suggestOverload(lastSessionWorking, exerciseMeta, unit)),
    [isTime, lastSessionWorking, exerciseMeta, unit],
  );

  // Max weight ever logged for this exercise (across all history).
  const maxHistoryWeight = useMemo(() => {
    if (!history?.history?.length) return null;
    let max = 0;
    for (const h of history.history) {
      for (const s of h.entry.sets) {
        if (s.completed && s.weight != null && s.setType !== 'warmup' && s.weight > max) {
          max = s.weight;
        }
      }
    }
    return max > 0 ? max : null;
  }, [history]);

  function handleAddWarmup() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addSet.mutate({ sessionId, entryId: entry.id, setNumber: nextSetNumber(entry.sets), setType: 'warmup', completed: false });
  }

  // Warm-up generation seeds from the first working set's weight, falling back
  // to last session's working weight so it's useful before any set is entered.
  const warmupSeedKg = working.find((s) => s.weight != null)?.weight
    ?? lastSessionWorking.find((s) => s.weight != null)?.weight
    ?? null;
  const canGenerateWarmups = !isTime && warmups.length === 0 && warmupSeedKg != null;

  async function handleGenerateWarmups() {
    const ramp = generateWarmupRamp(warmupSeedKg, unit, exerciseMeta?.equipment);
    if (ramp.length === 0) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      // Sequential so setNumber ordering is stable within the warm-up section.
      for (let i = 0; i < ramp.length; i++) {
        await addSet.mutateAsync({
          sessionId, entryId: entry.id, setNumber: nextSetNumber(entry.sets) + i,
          setType: 'warmup', reps: ramp[i].reps, weight: ramp[i].weightKg, completed: false,
        });
      }
    } catch (err) {
      Alert.alert('Error', (err as Error).message ?? 'Failed to add warm-ups.');
    }
  }

  async function handleApplyOverload() {
    if (!overload) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const incomplete = working.filter((s) => !s.completed && !s.id.startsWith('optimistic-'));
      if (incomplete.length > 0) {
        await Promise.all(
          incomplete.map((s) =>
            updateSet.mutateAsync({ sessionId, entryId: entry.id, setId: s.id, weight: overload.weightKg }),
          ),
        );
      } else if (working.length === 0) {
        const count = Math.min(Math.max(lastSessionWorking.length, 1), 5);
        for (let i = 0; i < count; i++) {
          await addSet.mutateAsync({
            sessionId, entryId: entry.id, setNumber: nextSetNumber(entry.sets) + i, setType: 'normal',
            reps: lastSessionWorking[i]?.reps ?? null, weight: overload.weightKg, completed: false,
          });
        }
      }
      setApplyNonce((n) => n + 1);
      setOverloadDismissed(true);
    } catch (err) {
      Alert.alert('Error', (err as Error).message ?? 'Failed to apply suggestion.');
    }
  }

  function handleAddSet() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Prefer the previous set in this session; otherwise autofill from the
    // matching set in the last session so a fresh exercise isn't blank.
    const source = working[working.length - 1] ?? lastSessionWorking[working.length] ?? null;
    addSet.mutate({
      sessionId, entryId: entry.id, setNumber: nextSetNumber(entry.sets), setType: 'normal',
      reps: source?.reps ?? null, weight: source?.weight ?? null, completed: false,
    });
  }

  function handleDuplicate(set: StrengthSet) {
    addSet.mutate({
      sessionId, entryId: entry.id, setNumber: nextSetNumber(entry.sets), setType: set.setType,
      reps: set.reps, weight: set.weight, completed: false,
    });
  }

  function handleDelete(set: StrengthSet) {
    Alert.alert('Delete Set', 'Remove this set?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteSet.mutate({ sessionId, entryId: entry.id, setId: set.id }) },
    ]);
  }

  function handleRemoveEntry() {
    Alert.alert(
      'Remove Exercise',
      'Remove this exercise from the session? All its sets will also be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            deleteEntry.mutate({ sessionId, entryId: entry.id });
          },
        },
      ],
    );
  }

  const entryMutationPending = updateEntry.isPending || deleteEntry.isPending;
  // Optimistically added entry: the server id isn't known yet, so hold off
  // set mutations until the refetch swaps in the real entry.
  const isOptimisticEntry = entry.id.startsWith('optimistic-');

  const doneSets = entry.sets.filter((s) => s.completed).length;

  return (
    <Animated.View style={styles.entryCard} layout={LinearTransition.duration(200)}>
      <View style={styles.entryHead}>
        <TouchableOpacity
          style={styles.entryNameBtn}
          onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onToggleCollapse?.(); }}
          onLongPress={onDrag}
          delayLongPress={150}
          accessibilityRole="button"
          accessibilityState={{ expanded: !collapsed }}
          accessibilityLabel={`${entry.exerciseName ?? 'Exercise'}, ${collapsed ? 'collapsed' : 'expanded'}`}
        >
          <Chevron collapsed={collapsed} />
          <View style={{ flex: 1 }}>
            <Text style={styles.entryName} numberOfLines={1}>{entry.exerciseName ?? 'Exercise'}</Text>
            {collapsed && (
              <Text style={styles.entryProgress}>
                {doneSets}/{entry.sets.length} done
              </Text>
            )}
          </View>
        </TouchableOpacity>
        <View style={styles.entryHeadRight}>
          {!collapsed && (
            <>
              <TouchableOpacity
                onPress={() => setShowRestSheet(true)}
                style={styles.restChip}
                accessibilityRole="button"
                accessibilityLabel={`Rest timer, ${restChipLabel}, tap to change`}
              >
                <Text style={styles.restChipText}>Rest: {restChipLabel}</Text>
              </TouchableOpacity>
              {sessionActive && restSeconds > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (restingActive) onStopRest();
                    else onStartRest(restSeconds);
                  }}
                  style={[styles.restPlayBtn, restingActive && styles.restPlayBtnActive]}
                  disabled={isOptimisticEntry}
                  accessibilityRole="button"
                  accessibilityLabel={restingActive ? 'Stop rest timer' : 'Start rest timer'}
                >
                  <Ionicons
                    name={restingActive ? 'stop' : 'play'}
                    size={12}
                    color={restingActive ? T.primary : T.textDim}
                  />
                </TouchableOpacity>
              )}
            </>
          )}
          {collapsed
            ? <View style={styles.gymDotBadge} />
            : <View style={styles.gymBadge}><Text style={styles.gymBadgeText}>Gym</Text></View>}
          <TouchableOpacity
            style={styles.entryMenuBtn}
            onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowEntryMenu(true); }}
            disabled={entryMutationPending}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Exercise options"
          >
            <Ionicons name="ellipsis-vertical" size={16} color={T.textDim} />
          </TouchableOpacity>
        </View>
      </View>

      {!collapsed && (
      <Animated.View style={styles.entryBody} entering={FadeIn.duration(140)}>
      {entry.exerciseId && <LastTime exerciseId={entry.exerciseId} />}

      {sessionActive && overload && !overloadDismissed && (
        <View style={styles.overloadChip}>
          <Ionicons name="trending-up" size={15} color={T.conditioning} />
          <View style={{ flex: 1 }}>
            <Text style={styles.overloadText}>
              Try {fmtWeight(overload.weightKg, unit)} {unit} · +{overload.incrementDisplay}
            </Text>
            <Text style={styles.overloadReason} numberOfLines={1}>{overload.reason}</Text>
          </View>
          <TouchableOpacity
            style={styles.overloadApply}
            onPress={handleApplyOverload}
            disabled={updateSet.isPending || addSet.isPending}
            accessibilityRole="button"
            accessibilityLabel="Apply suggested weight"
          >
            <Text style={styles.overloadApplyText}>Apply</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setOverloadDismissed(true)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Dismiss suggestion"
          >
            <Ionicons name="close" size={16} color={T.muted} />
          </TouchableOpacity>
        </View>
      )}

      {/* Warm-up */}
      <TouchableOpacity style={styles.addSubRow} onPress={handleAddWarmup} disabled={addSet.isPending || isOptimisticEntry}>
        <Ionicons name="add" size={15} color={T.gold} />
        <Text style={[styles.addSubText, { color: T.gold }]}>Warm-up</Text>
      </TouchableOpacity>
      {warmups.map((set) => (
        <SetRow
          key={set.id}
          set={set}
          sessionId={sessionId}
          entryId={entry.id}
          displayNumber={null}
          onOpenMenu={() => setMenuSet(set)}
          exerciseType={exerciseType}
        />
      ))}


      {/* Working sets */}
      <View style={styles.colHeaders}>
        <View style={styles.setCirclePlaceholder} />
        {isTime ? (
          <Text style={[styles.colHeader, { flex: 2 }]}>Duration</Text>
        ) : (
          <>
            <Text style={styles.colHeader}>Weight</Text>
            <Text style={styles.colHeader}>Reps</Text>
            <Text style={[styles.colHeader, { width: 56 }]}>RPE</Text>
          </>
        )}
        <View style={{ width: 32 }} />
      </View>

      {working.map((set, i) => (
        <SetRow
          key={`${set.id}-${applyNonce}`}
          set={set}
          sessionId={sessionId}
          entryId={entry.id}
          displayNumber={i + 1}
          onCompleted={(wKg) => {
            if (wKg !== null && maxHistoryWeight !== null && wKg > maxHistoryWeight) {
              onPR?.(entry.exerciseName ?? 'Exercise');
            }
          }}
          onOpenMenu={() => setMenuSet(set)}
          exerciseType={exerciseType}
        />
      ))}

      <TouchableOpacity style={styles.addSetBtn} onPress={handleAddSet} disabled={addSet.isPending || isOptimisticEntry}>
        {addSet.isPending ? (
          <ActivityIndicator size="small" color={T.textDim} />
        ) : (
          <>
            <Ionicons name="add" size={15} color={T.primary} />
            <Text style={styles.addSetText}>Set</Text>
          </>
        )}
      </TouchableOpacity>
      </Animated.View>
      )}

      {/* Overlays stay mounted while collapsed — the ⋮ menu works either way. */}
      {menuSet && (
        <SetActionsMenu
          set={menuSet}
          onSetType={(t) => updateSet.mutate({ sessionId, entryId: entry.id, setId: menuSet.id, setType: t })}
          onDuplicate={() => handleDuplicate(menuSet)}
          onDelete={() => handleDelete(menuSet)}
          onPlateMath={() => setPlateWeight(menuSet.weight ?? 0)}
          onClose={() => setMenuSet(null)}
        />
      )}

      {plateWeight !== null && (
        <PlateCalculator weightKg={plateWeight} onClose={() => setPlateWeight(null)} />
      )}

      {showEntryMenu && (
        <EntryContextMenu
          onSwap={() => setShowSwapPicker(true)}
          onGenerateWarmups={handleGenerateWarmups}
          warmupsDisabled={!canGenerateWarmups}
          onRemove={handleRemoveEntry}
          onClose={() => setShowEntryMenu(false)}
        />
      )}

      {showRestSheet && (
        <RestTimerSheet
          current={entry.restSeconds}
          onSelect={(v) => updateEntry.mutate({ sessionId, entryId: entry.id, restSeconds: v })}
          onClose={() => setShowRestSheet(false)}
        />
      )}

      <PickExerciseModal
        visible={showSwapPicker}
        title="Swap Exercise"
        onClose={() => setShowSwapPicker(false)}
        onPick={(e) => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          updateEntry.mutate({ sessionId, entryId: entry.id, exerciseId: e.id });
        }}
      />
    </Animated.View>
  );
}

// ─── Collapse chevron ─────────────────────────────────────────────────────────

/** Chevron that rotates between pointing right (collapsed) and down (open). */
function Chevron({ collapsed }: { collapsed: boolean }) {
  const { T } = useTheme();
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: withTiming(collapsed ? '-90deg' : '0deg', { duration: 180 }) }],
  }));
  return (
    <Animated.View style={style}>
      <Ionicons name="chevron-down" size={14} color={T.textDim} />
    </Animated.View>
  );
}

// ─── Martial arts entry card ──────────────────────────────────────────────────

function MartialArtsEntryCard({ entry, sessionId, disciplines, elapsedSeconds, sessionActive, collapsed = false, onToggleCollapse, onDrag }: {
  entry: SessionEntryWithSets;
  sessionId: string;
  disciplines: Discipline[];
  elapsedSeconds?: number;
  sessionActive?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Provided only while collapsed — long-pressing the header starts a drag. */
  onDrag?: () => void;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const updateEntry = useUpdateSessionEntry();
  const discipline = disciplines.find((d) => d.id === entry.disciplineId);
  const [details, setDetails] = useState<Record<string, unknown>>((entry.details as Record<string, unknown>) ?? {});
  const [justSaved, setJustSaved] = useState(false);
  // Raw text for numeric detail fields while they're being typed.
  const [numberText, setNumberText] = useState<Record<string, string>>({});
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    },
    [],
  );

  const handleSave = useCallback(async () => {
    try {
      await updateEntry.mutateAsync({ sessionId, entryId: entry.id, details });
      setJustSaved(true);
      savedTimerRef.current = setTimeout(() => setJustSaved(false), 1500);
    } catch (err) {
      Alert.alert('Error', (err as Error).message ?? 'Failed to save.');
    }
  }, [sessionId, entry.id, details, updateEntry]);

  function setField(key: string, value: unknown) {
    setDetails((prev) => ({ ...prev, [key]: value }));
  }

  // Collapsed summary: how much has been logged so far.
  const roundCount = isRoundsSession(details) ? details.rounds.length : 0;
  const summary = roundCount > 0
    ? `${roundCount} round${roundCount !== 1 ? 's' : ''} logged`
    : 'Nothing logged yet';

  const head = (name: string) => (
    <View style={styles.entryHead}>
      <TouchableOpacity
        style={styles.entryNameBtn}
        onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onToggleCollapse?.(); }}
        onLongPress={onDrag}
        delayLongPress={150}
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        accessibilityLabel={`${name}, ${collapsed ? 'collapsed' : 'expanded'}`}
      >
        <Chevron collapsed={collapsed} />
        <View style={{ flex: 1 }}>
          <Text style={styles.entryName} numberOfLines={1}>{name}</Text>
          {collapsed && <Text style={styles.entryProgress}>{summary}</Text>}
        </View>
      </TouchableOpacity>
      {collapsed ? (
        <View style={[styles.gymDotBadge, { backgroundColor: T.grappling }]} />
      ) : (
        <View style={[styles.gymBadge, { backgroundColor: withAlpha(T.grappling, 0.15), borderColor: withAlpha(T.grappling, 0.3) }]}>
          <Text style={[styles.gymBadgeText, { color: T.grappling }]}>Martial Arts</Text>
        </View>
      )}
    </View>
  );

  if (!discipline) {
    return (
      <Animated.View style={styles.entryCard} layout={LinearTransition.duration(200)}>
        {head(entry.disciplineName ?? 'Discipline')}
        {!collapsed && <ActivityIndicator style={{ margin: 12 }} color={T.primary} />}
      </Animated.View>
    );
  }

  // Seeded (global) disciplines get the structured, category-aware round logger;
  // user-created custom disciplines keep their generic field_config form.
  // All three categories now have a structured logger.
  const useStructured = discipline.userId === null;
  const strikeWeapons = /muay thai|kickbox/i.test(discipline.name)
    ? MUAY_THAI_WEAPONS
    : BOXING_WEAPONS;

  return (
    <Animated.View style={styles.entryCard} layout={LinearTransition.duration(200)}>
      {head(discipline.name)}

      {!collapsed && (
      <Animated.View style={styles.entryBody} entering={FadeIn.duration(140)}>
      {useStructured ? (
        <RoundLogger
          category={discipline.category}
          value={isRoundsSession(details) ? details : null}
          onChange={(next) => setDetails(next as unknown as Record<string, unknown>)}
          strikeWeapons={strikeWeapons}
          elapsedSeconds={elapsedSeconds}
          sessionActive={sessionActive}
        />
      ) : discipline.fieldConfig.map((field) => {
        if (field.type === 'enum') {
          const enumField = field as EnumFieldDef;
          const current = details[field.key] as string | undefined;
          return (
            <View key={field.key} style={styles.maField}>
              <Text style={styles.maLabel}>{field.label}</Text>
              <View style={styles.enumRow}>
                {enumField.options.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.enumOpt, current === opt && styles.enumOptActive]}
                    onPress={() => setField(field.key, opt)}
                  >
                    <Text style={[styles.enumOptText, current === opt && styles.enumOptTextActive]}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          );
        }

        if (field.type === 'boolean') {
          const boolVal = Boolean(details[field.key]);
          return (
            <View key={field.key} style={[styles.maField, styles.maFieldRow]}>
              <Text style={styles.maLabel}>{field.label}</Text>
              <Switch
                value={boolVal}
                onValueChange={(v) => setField(field.key, v)}
                trackColor={{ true: T.primary }}
              />
            </View>
          );
        }

        if (field.type === 'number') {
          return (
            <View key={field.key} style={styles.maField}>
              <Text style={styles.maLabel}>{field.label}</Text>
              <TextInput
                style={styles.maInput}
                // Backed by a raw-text buffer while editing. Deriving the value
                // straight from the parsed number meant a keystroke that didn't
                // parse yet ("1.", or a locale comma) round-tripped through
                // Number() as NaN, which rendered as the literal text "NaN" and
                // serialized into the PATCH body.
                value={numberText[field.key] ?? (details[field.key] != null ? String(details[field.key]) : '')}
                onChangeText={(t) => {
                  setNumberText((prev) => ({ ...prev, [field.key]: t }));
                  const { value, invalid } = parseNumberInRangeResult(t, MA_NUMBER_RANGE);
                  if (!invalid) setField(field.key, value);
                }}
                onBlur={() =>
                  setNumberText((prev) => {
                    const next = { ...prev };
                    delete next[field.key];
                    return next;
                  })
                }
                keyboardType="decimal-pad"
                returnKeyType="done"
                placeholder="0"
                placeholderTextColor={T.muted}
              />
            </View>
          );
        }

        if (field.type === 'text') {
          return (
            <View key={field.key} style={styles.maField}>
              <Text style={styles.maLabel}>{field.label}</Text>
              <TextInput
                style={styles.maInput}
                value={(details[field.key] as string | undefined) ?? ''}
                onChangeText={(t) => setField(field.key, t)}
                returnKeyType="done"
                placeholderTextColor={T.muted}
              />
            </View>
          );
        }

        if (field.type === 'textarea') {
          return (
            <View key={field.key} style={styles.maField}>
              <Text style={styles.maLabel}>{field.label}</Text>
              <TextInput
                style={[styles.maInput, styles.maTextarea]}
                value={(details[field.key] as string | undefined) ?? ''}
                onChangeText={(t) => setField(field.key, t)}
                multiline
                maxLength={NOTES_MAX_LENGTH}
                textAlignVertical="top"
                placeholderTextColor={T.muted}
              />
            </View>
          );
        }

        return null;
      })}

      <TouchableOpacity
        style={[styles.maSaveBtn, (updateEntry.isPending || justSaved) && { opacity: 0.6 }]}
        onPress={handleSave}
        disabled={updateEntry.isPending || entry.id.startsWith('optimistic-')}
      >
        {updateEntry.isPending
          ? <ActivityIndicator size="small" color={T.onPrimary} />
          : <Text style={styles.maSaveBtnText}>{justSaved ? 'Saved ✓' : 'Save'}</Text>}
      </TouchableOpacity>
      </Animated.View>
      )}
    </Animated.View>
  );
}

// ─── Training focus checklist ─────────────────────────────────────────────────

function FocusChecklistCard({ session, isActive }: {
  session: SessionWithEntries;
  isActive: boolean;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const router = useRouter();
  const { data: focuses, isLoading } = useFocuses('active');
  const setSessionFocuses = useSetSessionFocuses();

  // Focuses tagged to a discipline in this session, plus global (untagged) ones.
  const sessionDisciplineIds = useMemo(
    () => new Set(session.entries.filter((e) => e.kind === 'martial_arts').map((e) => e.disciplineId)),
    [session.entries],
  );
  const relevant = useMemo(
    () => (focuses ?? []).filter(
      (f) => f.disciplineId === null || sessionDisciplineIds.has(f.disciplineId),
    ),
    [focuses, sessionDisciplineIds],
  );

  // Local mirror of the ticked set for instant feedback; re-seed whenever the
  // server value changes (the mutation invalidates and refetches the session).
  const [selected, setSelected] = useState<Set<string>>(() => new Set(session.focusIds ?? []));
  useEffect(() => {
    setSelected(new Set(session.focusIds ?? []));
  }, [session.focusIds]);

  function toggle(focusId: string) {
    if (!isActive) return;
    const next = new Set(selected);
    if (next.has(focusId)) next.delete(focusId);
    else next.add(focusId);
    setSelected(next);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSessionFocuses.mutate(
      { sessionId: session.id, focusIds: [...next] },
      {
        onError: (err) => {
          setSelected(new Set(session.focusIds ?? []));
          Alert.alert('Error', err.message || 'Failed to update focuses.');
        },
      },
    );
  }

  if (isLoading) return null;

  // On a completed session, only surface the focuses that were actually worked.
  const rows = isActive ? relevant : relevant.filter((f) => selected.has(f.id));
  if (rows.length === 0) {
    if (!isActive) return null;
    return (
      <View style={styles.entryCard}>
        <Text style={styles.focusCardTitle}>Training focuses</Text>
        <Text style={styles.focusHintText}>
          Set what you want to work on and tick it off as you train.
        </Text>
        <TouchableOpacity onPress={() => router.push('/focuses' as never)} activeOpacity={0.7}>
          <Text style={styles.focusHintLink}>Add a focus →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.entryCard}>
      <Text style={styles.focusCardTitle}>Training focuses</Text>
      {isActive && (
        <Text style={styles.focusCardSub}>Tick what you worked on this session.</Text>
      )}
      {rows.map((focus) => {
        const on = selected.has(focus.id);
        return (
          <TouchableOpacity
            key={focus.id}
            style={styles.focusRow}
            onPress={() => toggle(focus.id)}
            activeOpacity={isActive ? 0.7 : 1}
            disabled={!isActive}
          >
            <View style={[styles.focusCheckbox, on && styles.focusCheckboxOn]}>
              {on && <Ionicons name="checkmark" size={14} color={T.onPrimary} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.focusRowLabel, on && styles.focusRowLabelOn]}>{focus.title}</Text>
              {focus.disciplineName && (
                <Text style={styles.focusRowMeta}>{focus.disciplineName}</Text>
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Time input (masked HH:MM) ───────────────────────────────────────────────

function TimeInput({ value, onChange }: {
  value: { h: number; m: number };
  onChange: (h: number, m: number) => void;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const [digits, setDigits] = useState(
    `${String(value.h).padStart(2, '0')}${String(value.m).padStart(2, '0')}`,
  );

  function toDisplay(d: string): string {
    if (d.length <= 2) return d;
    return `${d.slice(0, 2)}:${d.slice(2)}`;
  }

  function handleChange(text: string) {
    const raw = text.replace(/\D/g, '').slice(0, 4);
    setDigits(raw);
    if (raw.length === 4) {
      const h = Math.min(23, parseInt(raw.slice(0, 2), 10));
      const m = Math.min(59, parseInt(raw.slice(2, 4), 10));
      onChange(h, m);
    }
  }

  function handleBlur() {
    const d = digits.padEnd(4, '0');
    const h = Math.min(23, parseInt(d.slice(0, 2), 10));
    const m = Math.min(59, parseInt(d.slice(2, 4), 10));
    setDigits(`${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}`);
    onChange(h, m);
  }

  return (
    <TextInput
      style={styles.timeInputField}
      value={toDisplay(digits)}
      onChangeText={handleChange}
      onBlur={handleBlur}
      keyboardType="number-pad"
      maxLength={5}
      placeholder="00:00"
      placeholderTextColor={T.muted}
      selectTextOnFocus
    />
  );
}

// ─── Calendar date picker ────────────────────────────────────────────────────


// ─── Session settings sheet ──────────────────────────────────────────────────

function SessionSettingsSheet({ session, routineName, onSave, onFinish, onDiscard, isPending }: {
  session: SessionWithEntries;
  routineName: string | null;
  onSave: (name: string, notes: string) => void;
  onFinish: (name: string, notes: string, date: string, durationMinutes: number) => void;
  onDiscard: () => void;
  isPending: boolean;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const now = new Date();

  // A backdated session was created just now to record a workout from an
  // earlier day, so `startedAt` and "now" are both meaningless as clock times —
  // they'd give a 0-minute duration. Seed a plausible evening hour to edit
  // instead of silently saving zero.
  const isBackdated = session.date !== localTodayISO();
  const startDate = session.startedAt ? new Date(session.startedAt) : now;
  const [name, setName] = useState(session.name ?? routineName ?? '');
  const [notes, setNotes] = useState(session.notes ?? '');
  const [date, setDate] = useState(session.date);
  const [startH, setStartH] = useState(isBackdated ? 18 : startDate.getHours());
  const [startM, setStartM] = useState(isBackdated ? 0 : startDate.getMinutes());
  const [endH, setEndH] = useState(isBackdated ? 19 : now.getHours());
  const [endM, setEndM] = useState(isBackdated ? 0 : now.getMinutes());

  const durationMinutes = useMemo(() => {
    let mins = (endH * 60 + endM) - (startH * 60 + startM);
    if (mins < 0) mins += 1440; // crossed midnight
    return mins;
  }, [startH, startM, endH, endM]);


  function handleClose() {
    onSave(name, notes);
  }

  function handleFinish() {
    onFinish(name, notes, date, durationMinutes);
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={styles.settingsContainer}>
        {/* Sheet header */}
        <View style={styles.settingsHeader}>
          <TouchableOpacity onPress={handleClose} style={styles.settingsCloseBtn}>
            <Ionicons name="close" size={22} color={T.text} />
          </TouchableOpacity>
          <Text style={styles.settingsTitle}>Session Settings</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.settingsBody}
        >
          {/* Name */}
          <Text style={styles.settingsSectionLabel}>Name the workout</Text>
          <TextInput
            style={styles.settingsInput}
            value={name}
            onChangeText={setName}
            placeholder={routineName ?? 'Workout name'}
            placeholderTextColor={T.muted}
            returnKeyType="done"
          />

          {/* Date */}
          <Text style={styles.settingsSectionLabel}>Select date</Text>
          {/* Finishing a session records work already done, so a future date is
              never valid — including when backdating an earlier day. */}
          <CalendarPicker value={date} onChange={setDate} maxISO={localTodayISO()} />

          {/* Start & End time */}
          <Text style={styles.settingsSectionLabel}>Start & End time</Text>
          <View style={[styles.settingsCard, styles.timeRow]}>
            <View style={styles.timeCol}>
              <Text style={styles.timeColLabel}>Start</Text>
              <TimeInput
                value={{ h: startH, m: startM }}
                onChange={(h, m) => { setStartH(h); setStartM(m); }}
              />
            </View>
            <Text style={styles.timeSeparator}>–</Text>
            <View style={styles.timeCol}>
              <Text style={styles.timeColLabel}>End</Text>
              <TimeInput
                value={{ h: endH, m: endM }}
                onChange={(h, m) => { setEndH(h); setEndM(m); }}
              />
            </View>
          </View>
          <Text style={styles.settingsDurationHint}>
            Duration: {fmtMinutes(durationMinutes)}
          </Text>

          {/* Notes */}
          <Text style={styles.settingsSectionLabel}>Would you like to add a comment?</Text>
          <TextInput
            style={[styles.settingsInput, styles.settingsTextarea]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Add comment"
            placeholderTextColor={T.muted}
            multiline
            maxLength={NOTES_MAX_LENGTH}
            textAlignVertical="top"
          />

          {/* Finish button */}
          <TouchableOpacity
            style={[styles.settingsFinishBtn, isPending && { opacity: 0.5 }]}
            onPress={handleFinish}
            disabled={isPending}
          >
            {isPending
              ? <ActivityIndicator size="small" color={T.onPrimary} />
              : <Text style={styles.settingsFinishBtnText}>Finish Workout</Text>}
          </TouchableOpacity>

          {/* Discard button */}
          <TouchableOpacity
            style={[styles.settingsDiscardBtn, isPending && { opacity: 0.5 }]}
            onPress={onDiscard}
            disabled={isPending}
          >
            <Text style={styles.settingsDiscardBtnText}>Discard Workout</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function SessionScreen() {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { unit } = useUnit();
  const { data: session, isLoading, isError } = useSession(id ?? null);
  const completeSession = useCompleteSession();
  const deleteSession = useDeleteSession();
  const updateSession = useUpdateSession();
  const startSession = useStartSession();
  const skipSession = useSkipSession();
  const reorderEntries = useReorderSessionEntries();
  const updateEntry = useUpdateSessionEntry();
  const addEntry = useAddSessionEntry();
  const { data: disciplines } = useDisciplines();
  const { data: allExercises } = useExercises();
  const { data: routines } = useRoutines();

  const exerciseTypeMap = useMemo(() => {
    const m = new Map<string, 'strength' | 'conditioning'>();
    allExercises?.forEach((e) => m.set(e.id, e.type));
    return m;
  }, [allExercises]);

  const exerciseMetaMap = useMemo(() => {
    const m = new Map<string, { equipment: string | null; bodyPart: string | null }>();
    allExercises?.forEach((e) => m.set(e.id, { equipment: e.equipment, bodyPart: e.bodyPart }));
    return m;
  }, [allExercises]);

  const routineName = useMemo(() => {
    if (!session?.routineId) return null;
    return routines?.find((r) => r.id === session.routineId)?.name ?? null;
  }, [session?.routineId, routines]);

  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [showDisciplinePicker, setShowDisciplinePicker] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  // Collapsed entry ids. Collapsed cards shrink to a name + progress row and
  // become draggable, so reordering happens in place instead of in a modal.
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(new Set());
  // Seeded from the module-level store so a rest period started before backing
  // out to another screen is still running when this screen remounts.
  const restoredRest = useRef(getActiveRest(id)).current;
  const [restSeconds, setRestSeconds] = useState<number | null>(
    restoredRest ? Math.max(0, Math.ceil((restoredRest.endsAt - Date.now()) / 1000)) : null,
  );
  const [restTotal, setRestTotal] = useState(restoredRest?.total ?? 120);
  // Which entry's rest timer is running, so its card can show a stop control.
  const [restEntryId, setRestEntryId] = useState<string | null>(restoredRest?.entryId ?? null);
  // Absolute wall-clock time (epoch ms) the rest period ends. The visible
  // countdown is derived from this, not decremented tick-by-tick, so it stays
  // aligned with the scheduled "Rest complete" notification even when the app
  // is backgrounded (JS timers freeze while the notification fires on time).
  const [restEndsAt, setRestEndsAt] = useState<number | null>(restoredRest?.endsAt ?? null);
  const [elapsed, setElapsed] = useState(0);
  const [prBanner, setPrBanner] = useState<string | null>(null);
  const prTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);

  // Derive the visible rest countdown from the absolute end time. The interval
  // only recomputes from Date.now(), so on return from background it snaps to
  // the true remaining time instead of resuming from where JS froze.
  const restDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restZeroFiredRef = useRef(false);

  // Rest hit zero: buzz (unless the background notification already alerted),
  // hold the pill at 0:00 briefly, then auto-dismiss it.
  function finishRestCountdown(alreadyAlerted: boolean) {
    setRestEndsAt(null);
    clearActiveRest();
    if (restZeroFiredRef.current) return;
    restZeroFiredRef.current = true;
    if (!alreadyAlerted) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    restDismissRef.current = setTimeout(() => {
      setRestSeconds(null);
      setRestEntryId(null);
      restDismissRef.current = null;
    }, 4000);
  }

  useEffect(() => {
    if (restEndsAt === null) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((restEndsAt - Date.now()) / 1000));
      setRestSeconds(remaining);
      if (remaining <= 0) finishRestCountdown(false);
    };
    tick();
    const intervalId = setInterval(tick, 500);
    return () => clearInterval(intervalId);
  }, [restEndsAt]);

  // Snap the countdown back in sync the instant the app is foregrounded,
  // rather than waiting for the next interval tick. If the timer ran out while
  // backgrounded the OS notification already alerted, so no extra buzz.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && restEndsAt !== null) {
        const remaining = Math.max(0, Math.ceil((restEndsAt - Date.now()) / 1000));
        setRestSeconds(remaining);
        if (remaining <= 0) finishRestCountdown(true);
      }
    });
    return () => sub.remove();
  }, [restEndsAt]);

  useEffect(() => {
    if (!session?.startedAt || session.status !== 'in_progress') return;
    // Backdated log: the wall-clock elapsed time is meaningless, so don't run.
    if (session.date < localTodayISO()) return;
    const tick = () => setElapsed(Math.floor((Date.now() - new Date(session.startedAt!).getTime()) / 1000));
    tick();
    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
  }, [session?.startedAt, session?.status, session?.date]);

  // A finished session has no next set to rest for — clear any pending
  // "Rest complete" notification (covers finishing mid-rest and reopening a
  // completed session after the app was killed).
  useEffect(() => {
    if (session?.status === 'completed') {
      void cancelScheduledByKind('rest');
      clearActiveRest();
    }
  }, [session?.status]);

  // Timers that outlive the screen otherwise: the rest pill's auto-dismiss and
  // the PR banner both setState after unmount, and the celebration's deferred
  // router.back() (below) could pop a screen the user had already navigated to.
  useEffect(
    () => () => {
      if (restDismissRef.current) clearTimeout(restDismissRef.current);
      if (prTimerRef.current) clearTimeout(prTimerRef.current);
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
    },
    [],
  );

  // Schedule a local notification for when the rest timer ends, so it still
  // fires (with sound/vibration) if the app is backgrounded.
  const restNotifId = useRef<string | null>(restoredRest?.notifId ?? null);
  // Serialize arming. Two fast +15s taps used to run this concurrently: both
  // read the same restNotifId before either wrote back, so the first schedule
  // was never cancelled and fired as an orphan ding 15s early.
  const armChain = useRef<Promise<void>>(Promise.resolve());
  function armRestNotification(secs: number) {
    armChain.current = armChain.current.then(async () => {
      const previous = restNotifId.current;
      restNotifId.current = null;
      await cancelScheduled(previous);
      restNotifId.current = await scheduleInSeconds(
        secs,
        'Rest complete',
        'Time for your next set.',
        { kind: 'rest' },
      );
      updateActiveRestNotifId(restNotifId.current);
    });
    void armChain.current;
  }

  function handleStartRest(entryId: string, secs: number) {
    if (secs <= 0) return;
    if (restDismissRef.current) {
      clearTimeout(restDismissRef.current);
      restDismissRef.current = null;
    }
    restZeroFiredRef.current = false;
    const endsAt = Date.now() + secs * 1000;
    setRestEntryId(entryId);
    setRestTotal(secs);
    setRestSeconds(secs);
    setRestEndsAt(endsAt);
    setActiveRest({ sessionId: id, entryId, endsAt, total: secs, notifId: restNotifId.current });
    armRestNotification(secs);
  }

  function handleStopRest() {
    void cancelScheduled(restNotifId.current);
    restNotifId.current = null;
    clearActiveRest();
    if (restDismissRef.current) {
      clearTimeout(restDismissRef.current);
      restDismissRef.current = null;
    }
    restZeroFiredRef.current = false;
    setRestEndsAt(null);
    setRestSeconds(null);
    setRestEntryId(null);
  }

  function handleRestAdd() {
    if (restEndsAt === null) return; // already at 0:00 (or stopped) — nothing to extend
    // Extend from the existing end time so wall-clock and notification stay
    // aligned; re-arm the notification for the newly-remaining duration.
    const newEnd = restEndsAt + 15 * 1000;
    const remaining = Math.max(0, Math.ceil((newEnd - Date.now()) / 1000));
    const newTotal = restTotal + 15;
    setRestEndsAt(newEnd);
    setRestTotal(newTotal);
    setRestSeconds(remaining);
    if (restEntryId) {
      setActiveRest({
        sessionId: id,
        entryId: restEntryId,
        endsAt: newEnd,
        total: newTotal,
        notifId: restNotifId.current,
      });
    }
    armRestNotification(remaining);
  }

  function handlePR(exerciseName: string) {
    if (prTimerRef.current) clearTimeout(prTimerRef.current);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPrBanner(exerciseName);
    prTimerRef.current = setTimeout(() => setPrBanner(null), 3000);
  }

  function handleBack() {
    // Leaving a scheduled, skipped or finished session is normal navigation —
    // the leave-warning only applies to a live in-progress session.
    if (
      session?.status !== 'completed' &&
      session?.status !== 'planned' &&
      session?.status !== 'skipped'
    ) {
      Alert.alert(
        'Leave Session?',
        'Your session will still be in progress. Use the Resume button to return.',
        [
          { text: 'Stay', style: 'cancel' },
          { text: 'Leave', style: 'destructive', onPress: () => router.back() },
        ],
      );
    } else {
      router.back();
    }
  }

  async function handleStartPlanned() {
    if (!id) return;
    try {
      await startSession.mutateAsync({ id });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      const e = err as { status?: number; body?: { sessionId?: string } };
      if (e?.status === 409 && e?.body?.sessionId) {
        const sid = e.body.sessionId;
        Alert.alert(
          'Active Session',
          'You already have a session in progress.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Resume', onPress: () => router.push({ pathname: '/sessions/[id]', params: { id: sid } } as never) },
          ],
        );
      } else {
        Alert.alert('Error', (err as Error).message ?? 'Failed to start session.');
      }
    }
  }

  function handleSkipPlanned() {
    if (!id) return;
    Alert.alert(
      'Skip this workout?',
      "It'll be marked as skipped and stay on your calendar. You can still start it later.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Skip',
          style: 'destructive',
          onPress: async () => {
            try {
              await skipSession.mutateAsync({ id });
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.back();
            } catch (err) {
              Alert.alert('Error', (err as Error).message ?? 'Failed to skip session.');
            }
          },
        },
      ],
    );
  }

  async function handleReschedule(date: string) {
    if (!id) return;
    setShowReschedule(false);
    try {
      await updateSession.mutateAsync({ id, date });
    } catch (err) {
      Alert.alert('Error', (err as Error).message ?? 'Failed to reschedule session.');
    }
  }

  async function doFinish(name: string, notes: string, date: string, durationMinutes: number) {
    if (!id) return;
    try {
      await completeSession.mutateAsync({
        id,
        name: name.trim() || null,
        notes: notes.trim() || null,
        durationMinutes: durationMinutes || null,
        date,
      });
      handleStopRest();
      setShowSettings(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowCelebration(true);
      // Held in a ref and cleared on unmount: if the user taps back during the
      // celebration this would otherwise fire a second router.back() and pop
      // them off whatever screen they'd already reached.
      finishTimerRef.current = setTimeout(() => router.back(), 1800);
    } catch (err) {
      Alert.alert('Error', (err as Error).message ?? 'Failed to complete session.');
    }
  }

  async function handleSaveSettings(name: string, notes: string) {
    if (!id) return;
    try {
      await updateSession.mutateAsync({ id, name: name.trim() || null, notes: notes.trim() || null });
    } catch (err) {
      // Was swallowed as "non-critical", which meant a failed rename or a lost
      // session note closed the sheet looking like it had saved.
      Alert.alert('Error', (err as Error).message ?? 'Failed to save session details.');
      return;
    }
    setShowSettings(false);
  }

  function handleDiscard() {
    Alert.alert(
      'Discard Workout?',
      'All logged entries will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: async () => {
            if (!id) return;
            try {
              await deleteSession.mutateAsync({ id });
              handleStopRest();
              setShowSettings(false);
              router.back();
            } catch {
              Alert.alert('Error', 'Failed to discard session.');
            }
          },
        },
      ],
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <View style={styles.headerIconBtn}><Skeleton width={22} height={22} radius={6} /></View>
          <View style={styles.headerCenter}><Skeleton width={92} height={20} /></View>
          <View style={styles.headerActions}>
            <View style={styles.headerIconBtn}><Skeleton width={22} height={22} radius={6} /></View>
            <View style={styles.headerIconBtn}><Skeleton width={22} height={22} radius={6} /></View>
          </View>
        </View>
        <View style={{ padding: 16, gap: 16 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <View key={i} style={styles.skeletonCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <Skeleton width={44} height={44} radius={10} />
                <View style={{ flex: 1, gap: 8 }}>
                  <Skeleton width="60%" height={15} />
                  <Skeleton width="30%" height={11} />
                </View>
              </View>
              {Array.from({ length: 3 }).map((__, j) => (
                <View key={j} style={styles.skeletonSetRow}>
                  <Skeleton width={26} height={26} radius={8} />
                  <Skeleton width={72} height={26} radius={8} />
                  <Skeleton width={72} height={26} radius={8} />
                  <View style={{ flex: 1 }} />
                  <Skeleton width={26} height={26} radius={13} />
                </View>
              ))}
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (isError || !session) {
    return (
      <View style={styles.loadingScreen}>
        <Text style={styles.errorText}>Failed to load session.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ fontFamily: F.uiMed, color: T.primary }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const doneCount = session.entries.reduce((n, e) => n + e.sets.filter((s) => s.completed).length, 0);
  const sessionVolume = session.entries.reduce((sum, e) => sum + totalVolume(e.sets), 0);
  const hasMartialArts = session.entries.some((e) => e.kind === 'martial_arts');
  const hasExercise = session.entries.some((e) => e.kind === 'exercise');
  const canFinish = doneCount > 0 || hasMartialArts;
  const isActive = session.status !== 'completed';
  const isPlanned = session.status === 'planned';
  const isSkipped = session.status === 'skipped';
  // Neither has been started, so neither has anything to finish — both show the
  // start bar instead of the running timer and the finish check.
  const notYetStarted = isPlanned || isSkipped;
  // A workout being logged after the fact: the elapsed timer would count from
  // the moment the session row was created, which tells the user nothing.
  const isBackdated = session.status === 'in_progress' && session.date < localTodayISO();
  // A planned session whose day has already passed. The header used to say
  // "Scheduled" for it, contradicting the "Overdue" the session list showed.
  const isOverdue = isPlanned && session.date < localTodayISO();
  const scheduledLabel = formatDayTitle(session.date, { weekday: 'short' });

  const entryIds = session.entries.map((e) => e.id);
  const allCollapsed = entryIds.length > 0 && entryIds.every((eid) => collapsedIds.has(eid));

  function toggleCollapsed(entryId: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  }

  function toggleCollapseAll() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCollapsedIds(allCollapsed ? new Set() : new Set(entryIds));
  }

  // Link/unlink an exercise into a superset with the entry above it.
  const sessId = session.id;
  const allEntries = session.entries;
  function toggleSuperset(prev: SessionEntryWithSets, curr: SessionEntryWithSets, linked: boolean) {
    if (linked) {
      updateEntry.mutate({ sessionId: sessId, entryId: curr.id, supersetGroup: null });
      return;
    }
    const maxGroup = Math.max(0, ...allEntries.map((e) => e.supersetGroup ?? 0));
    const group = prev.supersetGroup ?? maxGroup + 1;
    if (prev.supersetGroup == null) {
      updateEntry.mutate({ sessionId: sessId, entryId: prev.id, supersetGroup: group });
    }
    updateEntry.mutate({ sessionId: sessId, entryId: curr.id, supersetGroup: group });
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* StrengthLog-style header */}
      <View style={styles.header}>
        {/* Left: X button */}
        <TouchableOpacity onPress={handleBack} style={styles.headerIconBtn}>
          <Ionicons name="close" size={20} color={T.danger} />
        </TouchableOpacity>

        {/* Center: scheduled date when planned, timer when live, name when done */}
        <View style={styles.headerCenter}>
          {notYetStarted || isBackdated ? (
            <>
              <Text style={styles.headerDoneLabel} numberOfLines={1}>
                {scheduledLabel}
              </Text>
              <Text style={styles.headerScheduledSub}>
                {isSkipped
                  ? 'Skipped'
                  : isOverdue
                    ? 'Overdue'
                    : isPlanned
                      ? 'Scheduled'
                      : 'Logging past workout'}
              </Text>
            </>
          ) : isActive ? (
            <Text style={styles.headerTimer}>{formatElapsed(elapsed)}</Text>
          ) : (
            <Text style={styles.headerDoneLabel} numberOfLines={1}>
              {session.name ?? routineName ?? 'Session'}
            </Text>
          )}
        </View>

        {/* Right: settings + finish (or done badge) */}
        {isActive ? (
          <View style={styles.headerActions}>
            {session.entries.length > 1 && (
              <TouchableOpacity
                style={styles.headerIconBtn}
                onPress={toggleCollapseAll}
                accessibilityRole="button"
                accessibilityLabel={allCollapsed ? 'Expand all exercises' : 'Collapse all exercises'}
              >
                <Ionicons
                  name={allCollapsed ? 'chevron-expand-outline' : 'chevron-collapse-outline'}
                  size={20}
                  color={T.textDim}
                />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => setShowSettings(true)}>
              <Ionicons name="settings-outline" size={20} color={T.textDim} />
            </TouchableOpacity>
            {/* A planned or skipped session can't finish — start it first. */}
            {!notYetStarted && (
              <TouchableOpacity
                style={[
                  styles.headerIconBtn,
                  styles.headerFinishBtn,
                  (!canFinish || completeSession.isPending) && { opacity: 0.4 },
                ]}
                onPress={() => setShowSettings(true)}
                disabled={!canFinish || completeSession.isPending}
                accessibilityRole="button"
                accessibilityLabel="Finish workout"
              >
                {completeSession.isPending
                  ? <ActivityIndicator size="small" color={T.onPrimary} />
                  : <Ionicons name="checkmark" size={20} color={T.onPrimary} />}
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.doneBadge}><Text style={styles.doneBadgeText}>Done</Text></View>
        )}
      </View>

      {/* Pinned bar for a session that hasn't started: start, move, or skip it. */}
      {notYetStarted && (
        <View style={styles.plannedBar}>
          <TouchableOpacity
            style={{ flex: 1 }}
            onPress={handleStartPlanned}
            disabled={startSession.isPending}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Start workout"
          >
            <CutCornerView fill={T.primary} style={styles.startCta}>
              {startSession.isPending ? (
                <ActivityIndicator size="small" color={T.onPrimary} />
              ) : (
                <Ionicons name="play" size={16} color={T.onPrimary} />
              )}
              <Text style={styles.startCtaText}>Start workout</Text>
            </CutCornerView>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.rescheduleBtn}
            onPress={() => setShowReschedule(true)}
            accessibilityRole="button"
            accessibilityLabel="Reschedule workout"
          >
            <Ionicons name="calendar-outline" size={16} color={T.textDim} />
            <Text style={styles.rescheduleText}>Move</Text>
          </TouchableOpacity>
          {isPlanned && (
            <TouchableOpacity
              style={styles.rescheduleBtn}
              onPress={handleSkipPlanned}
              disabled={skipSession.isPending}
              accessibilityRole="button"
              accessibilityLabel="Skip workout"
            >
              <Ionicons name="close-circle-outline" size={16} color={T.textDim} />
              <Text style={styles.rescheduleText}>Skip</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <DraggableFlatList
        data={session.entries}
        keyExtractor={(entry) => entry.id}
        containerStyle={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        // Sessions hold a handful of entries, and set inputs keep uncommitted
        // local text — so keep every card mounted rather than virtualizing.
        removeClippedSubviews={false}
        initialNumToRender={50}
        windowSize={21}
        onDragEnd={({ data }) => {
          const order = data.map((e) => e.id);
          if (order.every((id, i) => session.entries[i]?.id === id)) return;
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          reorderEntries.mutate(
            { sessionId: session.id, order },
            { onError: (err) => Alert.alert('Error', err.message || 'Failed to reorder.') },
          );
        }}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + (restSeconds !== null ? 140 : 48) }]}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            {session.entries.length === 0 && (
              <View style={styles.emptyEntries}>
                <Text style={styles.emptyTitle}>No exercises yet</Text>
                <Text style={styles.emptySub}>Add exercises or disciplines below.</Text>
              </View>
            )}

            {sessionVolume > 0 && (
              <View style={styles.summaryBar}>
                <View style={styles.summaryStat}>
                  <Text style={styles.summaryNum}>{doneCount}</Text>
                  <Text style={styles.summaryKey}>sets done</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryStat}>
                  <Text style={styles.summaryNum}>{Math.round(kgToUnit(sessionVolume, unit)).toLocaleString()}</Text>
                  <Text style={styles.summaryKey}>{unit} volume</Text>
                </View>
              </View>
            )}

            {hasMartialArts && <FocusChecklistCard session={session} isActive={isActive} />}
          </View>
        }
        renderItem={({ item: entry, getIndex, drag, isActive: isDragging }: RenderItemParams<SessionEntryWithSets>) => {
          const i = getIndex() ?? 0;
          const prev = session.entries[i - 1];
          const next = session.entries[i + 1];
          const linkedAbove =
            entry.kind === 'exercise' && prev?.kind === 'exercise' &&
            entry.supersetGroup != null && entry.supersetGroup === prev.supersetGroup;
          const grouped =
            entry.supersetGroup != null &&
            (entry.supersetGroup === prev?.supersetGroup || entry.supersetGroup === next?.supersetGroup);
          const canLink = isActive && entry.kind === 'exercise' && prev?.kind === 'exercise';
          const isCollapsed = collapsedIds.has(entry.id);
          // Only a collapsed card can be dragged — an expanded one is full of
          // inputs a long-press would fight with.
          const dragHandler = isCollapsed && session.entries.length > 1 ? drag : undefined;

          return (
            <ScaleDecorator activeScale={1.03}>
              <View style={styles.entryItem}>
                {/* Superset links describe adjacency, which is meaningless mid-drag. */}
                {canLink && !isDragging && (
                  <TouchableOpacity
                    style={styles.supersetLink}
                    onPress={() => toggleSuperset(prev, entry, linkedAbove)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={linkedAbove ? 'link' : 'link-outline'}
                      size={13}
                      color={linkedAbove ? T.primary : T.muted}
                    />
                    <Text style={[styles.supersetLinkText, linkedAbove && { color: T.primary }]}>
                      {linkedAbove ? 'Superset' : 'Superset with above'}
                    </Text>
                  </TouchableOpacity>
                )}
                <View style={[grouped ? styles.supersetGrouped : undefined, isDragging && styles.entryDragging]}>
                  {entry.kind === 'exercise' ? (
                    <StrengthEntryCard
                      entry={entry}
                      sessionId={session.id}
                      onStartRest={(secs) => handleStartRest(entry.id, secs)}
                      onStopRest={handleStopRest}
                      restingActive={restEntryId === entry.id && restSeconds !== null}
                      onPR={handlePR}
                      exerciseType={entry.exerciseId ? exerciseTypeMap.get(entry.exerciseId) : undefined}
                      exerciseMeta={entry.exerciseId ? exerciseMetaMap.get(entry.exerciseId) : undefined}
                      sessionActive={isActive}
                      collapsed={isCollapsed}
                      onToggleCollapse={() => toggleCollapsed(entry.id)}
                      onDrag={dragHandler}
                    />
                  ) : (
                    <MartialArtsEntryCard
                      entry={entry}
                      sessionId={session.id}
                      disciplines={disciplines ?? []}
                      elapsedSeconds={elapsed}
                      sessionActive={isActive}
                      collapsed={isCollapsed}
                      onToggleCollapse={() => toggleCollapsed(entry.id)}
                      onDrag={dragHandler}
                    />
                  )}
                </View>
              </View>
            </ScaleDecorator>
          );
        }}
        ListFooterComponent={
          <View style={styles.listFooter}>
        {session.status !== 'completed' && (
          <View style={styles.addEntryRow}>
            {/* A session is either weightlifting or martial arts — never both.
                Once the first entry sets the kind, only that kind can be added. */}
            {!hasMartialArts && (
              <TouchableOpacity style={styles.addEntryBtn} onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowExercisePicker(true); }}>
                <Ionicons name="add" size={16} color={T.textDim} />
                <Text style={styles.addEntryText}>Exercise</Text>
              </TouchableOpacity>
            )}
            {!hasExercise && (
              <TouchableOpacity style={styles.addEntryBtn} onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowDisciplinePicker(true); }}>
                <Ionicons name="add" size={16} color={T.textDim} />
                <Text style={styles.addEntryText}>Discipline</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
          </View>
        }
      />

      {/* Floating rest timer */}
      {restSeconds !== null && (
        <RestTimer
          seconds={restSeconds}
          total={restTotal}
          onSkip={handleStopRest}
          onAdd={handleRestAdd}
          style={[styles.restTimerFloat, { bottom: insets.bottom + 16 }]}
        />
      )}

      {/* PR banner */}
      {prBanner !== null && (
        <CutCornerView
          fill={withAlpha('#F5C300', 0.95)}
          cut={10}
          style={[styles.prBanner, { bottom: insets.bottom + (restSeconds !== null ? 126 : 16) }]}
        >
          <View style={styles.prBannerRow}>
            <Ionicons name="trophy" size={15} color="#1A1200" style={{ marginRight: 6 }} />
            <Text style={styles.prBannerText}>New PR — {prBanner}</Text>
          </View>
        </CutCornerView>
      )}

      <PickExerciseModal
        visible={showExercisePicker}
        onClose={() => setShowExercisePicker(false)}
        onPick={(e) => {
          if (!id) return;
          addEntry.mutate(
            { sessionId: id, kind: 'exercise', exerciseId: e.id, exerciseName: e.name },
            { onError: (err) => Alert.alert('Error', err.message || 'Failed to add exercise.') },
          );
        }}
      />
      <PickDisciplineModal
        visible={showDisciplinePicker}
        onClose={() => setShowDisciplinePicker(false)}
        onPick={(d) => {
          if (!id) return;
          addEntry.mutate(
            { sessionId: id, kind: 'martial_arts', disciplineId: d.id, disciplineName: d.name },
            { onError: (err) => Alert.alert('Error', err.message || 'Failed to add discipline.') },
          );
        }}
      />

      {showSettings && session && (
        <SessionSettingsSheet
          session={session}
          routineName={routineName}
          onSave={handleSaveSettings}
          onFinish={doFinish}
          onDiscard={handleDiscard}
          isPending={completeSession.isPending}
        />
      )}

      {showCelebration && (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <LottieView
            source={require('../../../assets/celebration.json')}
            autoPlay
            loop={false}
            style={{ flex: 1 }}
          />
        </View>
      )}

      <Modal
        visible={showReschedule}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReschedule(false)}
      >
        <TouchableOpacity
          style={styles.rescheduleOverlay}
          activeOpacity={1}
          onPress={() => setShowReschedule(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.rescheduleCard}>
            <Text style={styles.rescheduleTitle}>Reschedule to</Text>
            {/* Moving a planned session into the past makes it instantly overdue,
                and the API rejects it — so those days must not look tappable. */}
            <CalendarPicker
              value={session.date}
              onChange={handleReschedule}
              minISO={localTodayISO()}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  loadingScreen: { flex: 1, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center' },
  skeletonCard: { borderTopWidth: 1, borderTopColor: T.borderStrong, paddingVertical: 14 },
  skeletonSetRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  errorText: { fontFamily: F.ui, fontSize: 15, color: T.danger, textAlign: 'center' },

  // StrengthLog-style header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: T.text,
    gap: 8,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTimer: { fontFamily: F.mono, fontSize: 22, color: T.text, letterSpacing: 1 },
  headerDoneLabel: { fontFamily: F.uiSemi, fontSize: 17, color: T.text, letterSpacing: -0.2 },
  headerActions: { flexDirection: 'row', gap: 6 },
  headerIconBtn: {
    width: 40, height: 40, borderRadius: R.sm,
    backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: T.border,
  },
  headerFinishBtn: {
    backgroundColor: T.primary,
    borderColor: T.primary,
  },
  doneBadge: {
    height: 40, paddingHorizontal: 16, backgroundColor: withAlpha(T.primary, 0.15),
    borderRadius: R.sm, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: withAlpha(T.primary, 0.3),
  },
  doneBadgeText: { fontFamily: F.uiSemi, fontSize: 13, color: T.primary },
  headerScheduledSub: { fontFamily: F.uiBold, fontSize: 10, color: T.gold, textTransform: 'uppercase', letterSpacing: 1, marginTop: 1 },

  plannedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: D.pad,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  startCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
  },
  startCtaText: { fontFamily: F.uiBold, fontSize: 15, color: T.onPrimary },
  rescheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: R.sm,
    backgroundColor: T.surface,
  },
  rescheduleText: { fontFamily: F.uiMed, fontSize: 13, color: T.textDim },
  rescheduleOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: D.pad,
  },
  rescheduleCard: {
    backgroundColor: T.bg,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: T.borderStrong,
    padding: D.cardPad,
    gap: 10,
  },
  rescheduleTitle: { fontFamily: F.uiSemi, fontSize: 16, color: T.text },

  // No `gap` here: drag offsets are measured per cell, so spacing has to live
  // inside the cells (entryItem) rather than between them.
  body: { padding: D.pad },

  emptyEntries: { alignItems: 'center', paddingVertical: 48 },
  summaryBar: {
    flexDirection: 'row', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: T.borderStrong,
    borderBottomWidth: 1, borderBottomColor: T.borderStrong,
    paddingVertical: 12, marginBottom: 4,
  },
  summaryStat: { flex: 1, alignItems: 'center', gap: 2 },
  summaryDivider: { width: 1, alignSelf: 'stretch', backgroundColor: T.border, marginVertical: 4 },
  summaryNum: { fontFamily: F.monoBold, fontSize: 20, color: T.text },
  summaryKey: { fontFamily: F.uiMed, fontSize: 11, color: T.textDim, textTransform: 'uppercase', letterSpacing: 0.4 },
  supersetLink: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingLeft: 4 },
  supersetLinkText: { fontFamily: F.uiMed, fontSize: 12, color: T.muted },
  supersetGrouped: { borderLeftWidth: 2, borderLeftColor: withAlpha(T.primary, 0.5), paddingLeft: 8, marginLeft: 2 },
  emptyTitle: { fontFamily: F.uiSemi, fontSize: 16, color: T.textDim, marginBottom: 4 },
  emptySub: { fontFamily: F.uiMed, fontSize: 13, color: T.muted, textAlign: 'center' },

  // Broadsheet: entries are flat rule-separated sections, not floating cards.
  entryCard: {
    borderTopWidth: 1,
    borderTopColor: T.borderStrong,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 9,
  },
  entryHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // The card's own `gap` only separates head from body, so the body carries the
  // same spacing for its own rows.
  entryBody: { gap: 9 },
  entryName: { fontFamily: F.uiSemi, fontSize: 17, color: T.text, letterSpacing: -0.2 },
  entryNameBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7, marginRight: 8 },
  entryHeadRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // Collapsed summary line under the name ("3/6 done").
  entryProgress: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim, marginTop: 2 },
  entryMenuBtn: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  // Collapsed cards trade the kind badge for a single colored dot.
  gymDotBadge: { width: 7, height: 7, borderRadius: 4, backgroundColor: T.primary },
  entryItem: { marginBottom: D.stack },
  entryDragging: { opacity: 0.95 },
  listHeader: { gap: D.stack, marginBottom: D.stack },
  listFooter: { marginTop: 4 },
  restChip: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: R.chip,
    backgroundColor: T.surface2, borderWidth: 1, borderColor: T.borderStrong,
  },
  restChipText: { fontFamily: F.uiSemi, fontSize: 10, color: T.textDim, letterSpacing: 0.4 },
  restPlayBtn: {
    width: 24, height: 24, borderRadius: R.chip, alignItems: 'center', justifyContent: 'center',
    backgroundColor: T.surface2, borderWidth: 1, borderColor: T.borderStrong,
  },
  restPlayBtnActive: {
    backgroundColor: withAlpha(T.primary, 0.13), borderColor: withAlpha(T.primary, 0.28),
  },
  restCustomRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingVertical: 10,
  },
  restCustomInput: {
    flex: 1, fontFamily: F.uiSemi, fontSize: 15, color: T.text,
    borderWidth: 1, borderColor: T.borderStrong, borderRadius: R.sm,
    backgroundColor: T.surface2, paddingHorizontal: 12, paddingVertical: 8,
  },
  restCustomSet: {
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: R.sm,
    backgroundColor: T.primary,
  },
  restCustomSetText: { fontFamily: F.uiSemi, fontSize: 13, color: T.onPrimary },
  gymBadge: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: R.chip,
    backgroundColor: withAlpha(T.primary, 0.13), borderWidth: 1, borderColor: withAlpha(T.primary, 0.28),
  },
  gymBadgeText: { fontFamily: F.uiSemi, fontSize: 10, color: T.primary, letterSpacing: 0.4 },

  overloadChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: R.sm,
    backgroundColor: withAlpha(T.conditioning, 0.1),
    borderWidth: 1, borderColor: withAlpha(T.conditioning, 0.28),
  },
  overloadText: { fontFamily: F.uiSemi, fontSize: 13, color: T.text },
  overloadReason: { fontFamily: F.uiMed, fontSize: 11, color: T.textDim, marginTop: 1 },
  overloadApply: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: R.chip,
    backgroundColor: T.conditioning,
  },
  overloadApplyText: { fontFamily: F.uiBold, fontSize: 12, color: T.onPrimary },

  ghostContainer: { gap: 2, marginBottom: 2 },
  ghostHeader: {
    fontFamily: F.uiBold,
    fontSize: 10,
    color: T.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 1,
  },
  ghostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 20,
    opacity: 0.5,
  },
  ghostNum: {
    width: 14,
    fontFamily: F.mono,
    fontSize: 11,
    color: T.textDim,
    textAlign: 'right',
  },
  ghostLabel: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim },

  // Column headers
  colHeaders: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 2 },
  colHeader: { flex: 1, fontFamily: F.uiSemi, fontSize: 10, color: T.muted, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.6 },

  // Set row
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: D.rowH,
    borderRadius: R.sm,
    paddingHorizontal: 2,
  },
  setNum: { width: 28, alignItems: 'center', justifyContent: 'center' },
  setNumText: { fontFamily: F.uiSemi, fontSize: 13, color: T.muted },
  setCircleCol: { width: 30, alignItems: 'center', gap: 2 },
  setCircle: {
    width: 30, height: 30, borderRadius: R.sm, borderWidth: 1.5, borderColor: T.borderStrong,
    backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center',
  },
  setCircleWarm: { borderColor: withAlpha(T.gold, 0.5) },
  setCircleDone: { backgroundColor: T.primary, borderColor: T.primary },
  setCircleText: { fontFamily: F.monoBold, fontSize: 14, color: T.text },
  setTypeLabel: { fontSize: 7, fontFamily: F.uiBold, letterSpacing: 0.4 },
  setCirclePlaceholder: { width: 30 },
  menuBtn: { width: 28, height: 32, alignItems: 'center', justifyContent: 'center' },
  typeChip: {
    height: 28, borderRadius: R.chip, borderWidth: 1,
    paddingHorizontal: 8,
    backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center',
    borderColor: T.borderStrong,
  },
  typeChipText: { fontFamily: F.uiBold, fontSize: 10 },
  typeChipPlaceholder: { width: 72 },
  cell: {
    flex: 1,
    height: D.rowH - 12,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: R.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  cellDone: { backgroundColor: 'transparent', borderColor: 'transparent' },
  // The value in this cell couldn't be saved — flag it rather than dropping it
  // silently, which is what used to happen.
  cellInvalid: { borderColor: T.danger, backgroundColor: withAlpha(T.danger, 0.08) },
  cellRpe: {
    width: 56,
    height: D.rowH - 12,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: R.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  cellValue: {
    fontFamily: F.mono,
    fontSize: 17,
    color: T.text,
    flex: 1,
    textAlign: 'center',
    // Android TextInputs carry intrinsic padding and font padding that offset
    // the digits inside the cell and eat into its already-tight width.
    padding: 0,
    includeFontPadding: false,
  },
  cellUnit: { fontFamily: F.uiMed, fontSize: 10, color: T.muted, marginBottom: 6, alignSelf: 'flex-end' },
  checkBtn: {
    width: 44, height: D.rowH - 12, borderRadius: R.sm,
    borderWidth: 1.5, borderColor: T.borderStrong, backgroundColor: T.surface2,
    alignItems: 'center', justifyContent: 'center',
  },

  // Add set
  addSetBtn: {
    height: 40, borderRadius: R.sm, borderWidth: 1, borderColor: T.borderStrong,
    borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6,
  },
  addSetText: { fontFamily: F.uiSemi, fontSize: 13, color: T.primary },
  addSubRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 2 },
  addSubText: { fontFamily: F.uiSemi, fontSize: 13 },

  // Per-set actions menu
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  menuSheet: { backgroundColor: T.surface, borderTopLeftRadius: R.card, borderTopRightRadius: R.card, paddingVertical: 8, paddingBottom: 32 },
  menuHeader: { fontFamily: F.uiBold, fontSize: 11, color: T.textDim, textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14 },
  menuItemText: { flex: 1, fontFamily: F.uiSemi, fontSize: 15, color: T.text },
  menuDivider: { height: 1, backgroundColor: T.border, marginVertical: 6 },

  // MA fields
  maField: { gap: 6 },
  maFieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  maLabel: {
    fontFamily: F.uiSemi, fontSize: 11, color: T.textDim,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  enumRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  enumOpt: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: R.sm,
    borderWidth: 1, borderColor: T.borderStrong, backgroundColor: T.surface2,
  },
  enumOptActive: { backgroundColor: T.primary, borderColor: T.primary },
  enumOptText: { fontFamily: F.uiMed, fontSize: 14, color: T.textDim },
  enumOptTextActive: { color: T.onPrimary, fontFamily: F.uiSemi },
  maInput: {
    backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border,
    borderRadius: R.sm, paddingHorizontal: 12, paddingVertical: 9,
    fontFamily: F.uiMed, fontSize: 15, color: T.text,
  },
  maTextarea: { minHeight: 80 },
  setNoteInput: {
    marginLeft: 37, marginRight: 2, marginBottom: 8,
    minHeight: 38, fontSize: 14, paddingVertical: 8,
  },
  maSaveBtn: {
    backgroundColor: T.primary, borderRadius: R.sm,
    paddingVertical: 11, alignItems: 'center', marginTop: 4,
  },
  maSaveBtnText: { fontFamily: F.uiSemi, fontSize: 15, color: T.onPrimary },

  // Training focus checklist
  focusCardTitle: { fontFamily: F.uiBold, fontSize: 12, color: T.textDim, textTransform: 'uppercase', letterSpacing: 1 },
  focusCardSub: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim, marginTop: -2 },
  focusRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 5 },
  focusCheckbox: {
    width: 24, height: 24, borderRadius: R.sm,
    borderWidth: 1.5, borderColor: T.borderStrong, backgroundColor: T.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  focusCheckboxOn: { backgroundColor: T.primary, borderColor: T.primary },
  focusRowLabel: { fontFamily: F.uiMed, fontSize: 14, color: T.text },
  focusRowLabelOn: { fontFamily: F.uiSemi },
  focusRowMeta: { fontFamily: F.uiMed, fontSize: 11, color: T.textDim, marginTop: 1 },
  focusHintText: { fontFamily: F.uiMed, fontSize: 13, color: T.textDim },
  focusHintLink: { fontFamily: F.uiSemi, fontSize: 13, color: T.primary, marginTop: 2 },

  // Floating overlays
  restTimerFloat: {
    position: 'absolute',
    left: 18,
    right: 18,
    zIndex: 50,
    marginHorizontal: 0,
  },
  prBanner: {
    position: 'absolute',
    left: 18,
    right: 18,
    zIndex: 60,
  },
  prBannerRow: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  prBannerText: { fontFamily: F.uiBold, fontSize: 15, color: '#1A1200' },

  // Add entry row
  addEntryRow: { flexDirection: 'row', gap: D.gap },
  addEntryBtn: {
    flex: 1, backgroundColor: T.surface, borderRadius: R.sm,
    borderWidth: 1, borderColor: T.border, paddingVertical: 13,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  addEntryText: { fontFamily: F.uiSemi, fontSize: 14, color: T.textDim },

  // Picker modals
  modal: { flex: 1, backgroundColor: T.bg, paddingTop: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, marginBottom: 16 },
  modalTitle: { fontFamily: F.uiSemi, fontSize: 20, color: T.text },
  modalCancel: { fontFamily: F.uiMed, fontSize: 16, color: T.textDim },
  modalDone: { fontFamily: F.uiSemi, fontSize: 16, color: T.primary },

  modalSearch: {
    backgroundColor: T.surface, borderWidth: 1, borderColor: T.border,
    borderRadius: R.sm, paddingHorizontal: 14, paddingVertical: 10,
    fontFamily: F.uiMed, fontSize: 15, color: T.text, marginHorizontal: 16, marginBottom: 12,
  },
  pickerFilterRow: { paddingHorizontal: 16, paddingBottom: 10 },
  pickRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
  pickInfo: { flex: 1 },
  pickName: { fontFamily: F.uiMed, fontSize: 16, color: T.text },
  pickMeta: { fontFamily: F.uiMed, fontSize: 13, color: T.textDim, marginTop: 2, textTransform: 'capitalize' },
  separator: { height: 1, backgroundColor: T.border, marginLeft: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  emptyText: { fontFamily: F.uiMed, fontSize: 15, color: T.muted },

  // Create exercise (from session picker)
  createExRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingVertical: 18,
  },
  createExText: { fontFamily: F.uiSemi, fontSize: 15, color: T.primary, flex: 1 },
  createExContent: { padding: 24, paddingBottom: 48 },
  createExField: { marginBottom: 20 },
  createExLabel: {
    fontFamily: F.uiBold, fontSize: 11, color: T.textDim,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8,
  },
  createExInput: {
    borderWidth: 1, borderColor: T.border, borderRadius: R.sm,
    backgroundColor: T.surface, paddingHorizontal: 12, paddingVertical: 11,
    fontFamily: F.uiMed, fontSize: 15, color: T.text,
  },
  createExSegmented: {
    flexDirection: 'row', borderWidth: 1, borderColor: T.border,
    borderRadius: R.sm, overflow: 'hidden',
  },
  createExSegmentBtn: {
    flex: 1, paddingVertical: 11, alignItems: 'center', backgroundColor: T.surface,
  },
  createExSegmentLeft: { borderRightWidth: 1, borderRightColor: T.border },
  createExSegmentRight: {},
  createExSegmentActive: { backgroundColor: T.primary },
  createExSegmentText: { fontFamily: F.uiMed, fontSize: 14, color: T.textDim },
  createExSegmentTextActive: { fontFamily: F.uiBold, color: T.onPrimary },
  createExPillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  createExPill: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: R.sm,
    borderWidth: 1, borderColor: T.borderStrong, backgroundColor: T.surface,
  },
  createExPillActive: { backgroundColor: T.primary, borderColor: T.primary },
  createExPillText: { fontFamily: F.uiMed, fontSize: 13, color: T.text },
  createExPillTextActive: { color: T.onPrimary },
  createExSubmit: {
    marginTop: 8, backgroundColor: T.primary, borderRadius: R.card,
    paddingVertical: 14, alignItems: 'center',
  },
  createExSubmitDisabled: { opacity: 0.55 },
  createExSubmitText: { fontFamily: F.uiBold, fontSize: 16, color: T.onPrimary },

  // Time input
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 8 },
  timeCol: { flex: 1, alignItems: 'center', gap: 6 },
  timeColLabel: { fontFamily: F.uiSemi, fontSize: 11, color: T.textDim, textTransform: 'uppercase', letterSpacing: 0.8 },
  timeSeparator: { fontFamily: F.mono, fontSize: 24, color: T.textDim, marginTop: 18 },
  timeInputField: {
    fontFamily: F.monoBold, fontSize: 30, color: T.text,
    letterSpacing: 2, textAlign: 'center',
    borderBottomWidth: 2, borderBottomColor: T.primary,
    paddingVertical: 4, minWidth: 100,
  },

  // Session settings sheet
  settingsContainer: { flex: 1, backgroundColor: T.bg },
  settingsHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  settingsCloseBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  settingsTitle: { fontFamily: F.uiSemi, fontSize: 17, color: T.text },
  settingsBody: { padding: D.pad, gap: 12, paddingBottom: 40 },
  settingsSectionLabel: {
    fontFamily: F.uiBold, fontSize: 11, color: T.textDim,
    textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 8,
  },
  settingsCard: {
    borderTopWidth: 1, borderTopColor: T.borderStrong,
  },
  settingsInput: {
    backgroundColor: T.surface, borderWidth: 1, borderColor: T.border,
    borderRadius: R.sm, paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: F.uiMed, fontSize: 16, color: T.text,
  },
  settingsTextarea: { minHeight: 80, textAlignVertical: 'top' },
  settingsDateRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  settingsDateLabel: { fontFamily: F.uiSemi, fontSize: 13, color: T.textDim, width: 48 },
  settingsDateRight: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  settingsDateValue: { fontFamily: F.uiMed, fontSize: 14, color: T.text, flex: 1, textAlign: 'center' },
  dateArrow: { padding: 8 },
  settingsDurationHint: {
    fontFamily: F.uiMed, fontSize: 13, color: T.primary,
    textAlign: 'center', marginTop: 2,
  },
  settingsFinishBtn: {
    backgroundColor: T.primary, borderRadius: R.sm,
    paddingVertical: 16, alignItems: 'center', marginTop: 16,
  },
  settingsFinishBtnText: { fontFamily: F.uiSemi, fontSize: 16, color: T.onPrimary },
  settingsDiscardBtn: {
    borderRadius: R.sm, borderWidth: 1, borderColor: T.danger,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  settingsDiscardBtnText: { fontFamily: F.uiSemi, fontSize: 16, color: T.danger },
  });
}
