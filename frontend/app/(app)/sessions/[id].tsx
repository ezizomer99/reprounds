import {
  ActivityIndicator,
  Alert,
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
import { Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { isRoundsSession, totalVolume } from '@app/shared';
import { useExercises } from '../../../src/hooks/useExercises';
import { useDisciplines } from '../../../src/hooks/useDisciplines';
import {
  useSession,
  useCompleteSession,
  useUpdateSession,
  useAddSessionEntry,
  useUpdateSessionEntry,
  useAddStrengthSet,
  useUpdateStrengthSet,
  useDeleteStrengthSet,
  useExerciseHistory,
} from '../../../src/hooks/useSession';
import { useRoutines } from '../../../src/hooks/useRoutines';
import { RestTimer } from '../../../src/components/RestTimer';
import { Skeleton } from '../../../src/components/Skeleton';
import { RoundLogger, BOXING_WEAPONS, MUAY_THAI_WEAPONS } from '../../../src/components/RoundLogger';
import { PlateCalculator } from '../../../src/components/PlateCalculator';
import { F, R, D, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { withAlpha } from '../../../src/lib/color';

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

function fmtDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
function parseDuration(val: string): number | null {
  const t = val.trim();
  if (!t) return null;
  if (t.includes(':')) {
    const [mPart, sPart] = t.split(':');
    const m = parseInt(mPart || '0', 10);
    const s = parseInt(sPart || '0', 10);
    if (isNaN(m) || isNaN(s)) return null;
    return m * 60 + Math.min(s, 59);
  }
  const n = parseInt(t, 10);
  return isNaN(n) ? null : n;
}

function formatElapsed(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Exercise picker modal ────────────────────────────────────────────────────

function PickExerciseModal({ visible, onClose, onPick }: {
  visible: boolean;
  onClose: () => void;
  onPick: (e: Exercise) => void;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const [search, setSearch] = useState('');
  const { data: exercises, isLoading } = useExercises({ search: search.trim() || undefined });

  function handleClose() { setSearch(''); onClose(); }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={styles.modal}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Add Exercise</Text>
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
        {isLoading ? (
          <View style={styles.centered}><ActivityIndicator color={T.primary} /></View>
        ) : (
          <FlatList
            data={exercises ?? []}
            keyExtractor={(i) => i.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.pickRow} onPress={() => { onPick(item); handleClose(); }}>
                {item.imageUrl ? (
                  <Image source={{ uri: item.imageUrl }} style={styles.pickThumb} resizeMode="cover" />
                ) : (
                  <View style={[styles.pickThumb, styles.pickThumbPlaceholder]} />
                )}
                <View style={styles.pickInfo}>
                  <Text style={styles.pickName}>{item.name}</Text>
                  <Text style={styles.pickMeta}>{item.equipment ?? item.muscleGroup ?? item.type}</Text>
                </View>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={<View style={styles.centered}><Text style={styles.emptyText}>No exercises found.</Text></View>}
          />
        )}
      </View>
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
          <TouchableOpacity onPress={onClose}><Text style={styles.modalCancel}>Cancel</Text></TouchableOpacity>
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
  onCompleted: () => void;
  onOpenMenu: () => void;
  exerciseType?: 'strength' | 'conditioning';
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const SET_TYPE_COLOR = useMemo(() => setTypeColors(T), [T]);
  const isTime = exerciseType === 'conditioning';
  const isWarm = set.setType === 'warmup';
  const updateSet = useUpdateStrengthSet();
  const [reps, setReps] = useState(set.reps !== null ? String(set.reps) : '');
  const [weight, setWeight] = useState(set.weight !== null ? String(set.weight) : '');
  const [duration, setDuration] = useState(set.reps !== null ? fmtDuration(set.reps) : '');
  const [rpe, setRpe] = useState(set.rpe !== null ? String(set.rpe) : '');

  function handleBlurReps() {
    const parsed = reps.trim() === '' ? null : Number(reps);
    updateSet.mutate({ sessionId, entryId, setId: set.id, reps: isNaN(parsed as number) ? null : parsed });
  }

  function handleBlurWeight() {
    const parsed = weight.trim() === '' ? null : Number(weight);
    updateSet.mutate({ sessionId, entryId, setId: set.id, weight: isNaN(parsed as number) ? null : parsed });
  }

  function handleBlurDuration() {
    const secs = parseDuration(duration);
    if (secs !== null) setDuration(fmtDuration(secs));
    updateSet.mutate({ sessionId, entryId, setId: set.id, reps: secs });
  }

  function handleBlurRpe() {
    const parsed = rpe.trim() === '' ? null : Number(rpe);
    updateSet.mutate({ sessionId, entryId, setId: set.id, rpe: isNaN(parsed as number) ? null : parsed });
  }

  const isDone = set.completed;

  function toggleComplete() {
    const next = !isDone;
    updateSet.mutate(
      { sessionId, entryId, setId: set.id, completed: next },
      { onSuccess: () => { if (next) onCompleted(); } },
    );
  }

  return (
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
          disabled={updateSet.isPending}
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
        <View style={[styles.cell, { flex: 2 }, isDone && styles.cellDone]}>
          <TextInput
            style={styles.cellValue}
            value={duration}
            onChangeText={setDuration}
            onBlur={handleBlurDuration}
            placeholder="0:00"
            placeholderTextColor={T.muted}
            keyboardType="default"
            returnKeyType="done"
            editable={!isDone}
            textAlign="center"
          />
          <Text style={styles.cellUnit}>min</Text>
        </View>
      ) : (
        <>
          <View style={[styles.cell, isDone && styles.cellDone]}>
            <TextInput
              style={styles.cellValue}
              value={weight}
              onChangeText={setWeight}
              onBlur={handleBlurWeight}
              placeholder="—"
              placeholderTextColor={T.muted}
              keyboardType="decimal-pad"
              returnKeyType="done"
              editable={!isDone}
              textAlign="center"
            />
            <Text style={styles.cellUnit}>kg</Text>
          </View>

          <View style={[styles.cell, isDone && styles.cellDone]}>
            <TextInput
              style={styles.cellValue}
              value={reps}
              onChangeText={setReps}
              onBlur={handleBlurReps}
              placeholder="—"
              placeholderTextColor={T.muted}
              keyboardType="number-pad"
              returnKeyType="done"
              editable={!isDone}
              textAlign="center"
            />
            <Text style={styles.cellUnit}>reps</Text>
          </View>

          {!isWarm && (
            <View style={[styles.cellRpe, isDone && styles.cellDone]}>
              <TextInput
                style={[styles.cellValue, { fontSize: 15 }]}
                value={rpe}
                onChangeText={setRpe}
                onBlur={handleBlurRpe}
                placeholder="—"
                placeholderTextColor={T.muted}
                keyboardType="decimal-pad"
                returnKeyType="done"
                editable={!isDone}
                textAlign="center"
              />
              <Text style={styles.cellUnit}>RPE</Text>
            </View>
          )}
        </>
      )}

      <TouchableOpacity style={styles.menuBtn} onPress={onOpenMenu}>
        <Ionicons name="ellipsis-vertical" size={16} color={T.muted} />
      </TouchableOpacity>
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

// ─── Last time summary ────────────────────────────────────────────────────────

function LastTime({ exerciseId }: { exerciseId: string }) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { data } = useExerciseHistory(exerciseId);
  const summary = useMemo(() => {
    if (!data?.history.length) return null;
    const sets = data.history[0].entry.sets.filter((s) => s.completed && s.reps !== null);
    if (!sets.length) return null;
    const s = sets[0];
    const w = s.weight !== null ? `×${s.weight}kg` : '';
    return `Last: ${sets.length}×${s.reps}${w}`;
  }, [data]);
  if (!summary) return null;
  return <Text style={styles.lastTimeText}>Last: <Text style={styles.lastTimeVal}>{summary.replace('Last: ', '')}</Text></Text>;
}

// ─── Strength entry card ──────────────────────────────────────────────────────

function StrengthEntryCard({ entry, sessionId, onSetCompleted, exerciseType }: {
  entry: SessionEntryWithSets;
  sessionId: string;
  onSetCompleted: (restSecs: number) => void;
  exerciseType?: 'strength' | 'conditioning';
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const isTime = exerciseType === 'conditioning';
  const addSet = useAddStrengthSet();
  const updateSet = useUpdateStrengthSet();
  const deleteSet = useDeleteStrengthSet();
  const { data: history } = useExerciseHistory(entry.exerciseId);
  const restSeconds = entry.restSeconds ?? 120;
  const [menuSet, setMenuSet] = useState<StrengthSet | null>(null);
  const [plateWeight, setPlateWeight] = useState<number | null>(null);

  const warmups = entry.sets.filter((s) => s.setType === 'warmup');
  const working = entry.sets.filter((s) => s.setType !== 'warmup');

  // Last session's working sets, used to autofill when starting fresh.
  const lastSessionWorking = useMemo(
    () => (history?.history[0]?.entry.sets ?? []).filter((s) => s.setType !== 'warmup'),
    [history],
  );

  function handleAddWarmup() {
    addSet.mutate({ sessionId, entryId: entry.id, setNumber: entry.sets.length + 1, setType: 'warmup', completed: false });
  }

  function handleAddSet() {
    // Prefer the previous set in this session; otherwise autofill from the
    // matching set in the last session so a fresh exercise isn't blank.
    const source = working[working.length - 1] ?? lastSessionWorking[working.length] ?? null;
    addSet.mutate({
      sessionId, entryId: entry.id, setNumber: entry.sets.length + 1, setType: 'normal',
      reps: source?.reps ?? null, weight: source?.weight ?? null, completed: false,
    });
  }

  function handleDuplicate(set: StrengthSet) {
    addSet.mutate({
      sessionId, entryId: entry.id, setNumber: entry.sets.length + 1, setType: set.setType,
      reps: set.reps, weight: set.weight, completed: false,
    });
  }

  function handleDelete(set: StrengthSet) {
    Alert.alert('Delete Set', 'Remove this set?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteSet.mutate({ sessionId, entryId: entry.id, setId: set.id }) },
    ]);
  }

  return (
    <View style={styles.entryCard}>
      <View style={styles.entryHead}>
        <Text style={styles.entryName}>{entry.exerciseName ?? 'Exercise'}</Text>
        <View style={styles.gymBadge}><Text style={styles.gymBadgeText}>Gym</Text></View>
      </View>
      {entry.exerciseId && <LastTime exerciseId={entry.exerciseId} />}

      {/* Warm-up */}
      <TouchableOpacity style={styles.addSubRow} onPress={handleAddWarmup} disabled={addSet.isPending}>
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
          onCompleted={() => onSetCompleted(restSeconds)}
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
            <Text style={[styles.colHeader, { width: 52 }]}>RPE</Text>
          </>
        )}
        <View style={{ width: 32 }} />
      </View>

      {working.map((set, i) => (
        <SetRow
          key={set.id}
          set={set}
          sessionId={sessionId}
          entryId={entry.id}
          displayNumber={i + 1}
          onCompleted={() => onSetCompleted(restSeconds)}
          onOpenMenu={() => setMenuSet(set)}
          exerciseType={exerciseType}
        />
      ))}

      <TouchableOpacity style={styles.addSetBtn} onPress={handleAddSet} disabled={addSet.isPending}>
        {addSet.isPending ? (
          <ActivityIndicator size="small" color={T.textDim} />
        ) : (
          <>
            <Ionicons name="add" size={15} color={T.primary} />
            <Text style={styles.addSetText}>Set</Text>
          </>
        )}
      </TouchableOpacity>

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
    </View>
  );
}

// ─── Martial arts entry card ──────────────────────────────────────────────────

function MartialArtsEntryCard({ entry, sessionId, disciplines }: {
  entry: SessionEntryWithSets;
  sessionId: string;
  disciplines: Discipline[];
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const updateEntry = useUpdateSessionEntry();
  const discipline = disciplines.find((d) => d.id === entry.disciplineId);
  const [details, setDetails] = useState<Record<string, unknown>>((entry.details as Record<string, unknown>) ?? {});
  const [justSaved, setJustSaved] = useState(false);

  const handleSave = useCallback(async () => {
    try {
      await updateEntry.mutateAsync({ sessionId, entryId: entry.id, details });
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1500);
    } catch (err) {
      Alert.alert('Error', (err as Error).message ?? 'Failed to save.');
    }
  }, [sessionId, entry.id, details, updateEntry]);

  function setField(key: string, value: unknown) {
    setDetails((prev) => ({ ...prev, [key]: value }));
  }

  if (!discipline) {
    return (
      <View style={styles.entryCard}>
        <View style={styles.entryHead}>
          <Text style={styles.entryName}>{entry.disciplineName ?? 'Discipline'}</Text>
          <View style={[styles.gymBadge, { backgroundColor: withAlpha(T.grappling, 0.15), borderColor: withAlpha(T.grappling, 0.3) }]}>
            <Text style={[styles.gymBadgeText, { color: T.grappling }]}>Martial Arts</Text>
          </View>
        </View>
        <ActivityIndicator style={{ margin: 12 }} color={T.primary} />
      </View>
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
    <View style={styles.entryCard}>
      <View style={styles.entryHead}>
        <Text style={styles.entryName}>{discipline.name}</Text>
        <View style={[styles.gymBadge, { backgroundColor: withAlpha(T.grappling, 0.15), borderColor: withAlpha(T.grappling, 0.3) }]}>
          <Text style={[styles.gymBadgeText, { color: T.grappling }]}>Martial Arts</Text>
        </View>
      </View>

      {useStructured ? (
        <RoundLogger
          category={discipline.category}
          value={isRoundsSession(details) ? details : null}
          onChange={(next) => setDetails(next as unknown as Record<string, unknown>)}
          strikeWeapons={strikeWeapons}
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
                value={details[field.key] != null ? String(details[field.key]) : ''}
                onChangeText={(t) => setField(field.key, t.trim() === '' ? null : Number(t))}
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
        disabled={updateEntry.isPending}
      >
        {updateEntry.isPending
          ? <ActivityIndicator size="small" color={T.onPrimary} />
          : <Text style={styles.maSaveBtnText}>{justSaved ? 'Saved ✓' : 'Save'}</Text>}
      </TouchableOpacity>
    </View>
  );
}

// ─── Wheel picker (shared) ───────────────────────────────────────────────────

const HOURS_ITEMS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const MINUTES_ITEMS = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));
const WHEEL_ITEM_H = 52;

function WheelPicker({ items, initialIndex, onChange }: {
  items: string[];
  initialIndex: number;
  onChange: (i: number) => void;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const ref = useRef<ScrollView>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      ref.current?.scrollTo({ y: initialIndex * WHEEL_ITEM_H, animated: false });
    }, 50);
    return () => clearTimeout(t);
  }, []); // mount only

  return (
    <View style={styles.wheel}>
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_H}
        decelerationRate="fast"
        nestedScrollEnabled
        contentContainerStyle={{ paddingVertical: WHEEL_ITEM_H }}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.y / WHEEL_ITEM_H);
          onChange(Math.max(0, Math.min(items.length - 1, i)));
        }}
      >
        {items.map((label, i) => (
          <View key={i} style={styles.wheelItemRow}>
            <Text style={styles.wheelItemText}>{label}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.wheelHighlight} pointerEvents="none" />
    </View>
  );
}

// ─── Calendar date picker ────────────────────────────────────────────────────

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS  = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function CalendarPicker({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const [selY, selM, selD] = value.split('-').map(Number);
  const [viewYear, setViewYear]  = useState(selY);
  const [viewMonth, setViewMonth] = useState(selM - 1); // 0-indexed

  function prevMonth() {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  }
  function toISO(year: number, month: number, day: number): string {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const firstDayOffset = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth    = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstDayOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();

  return (
    <View style={styles.calContainer}>
      {/* Month navigation */}
      <View style={styles.calHeader}>
        <TouchableOpacity onPress={prevMonth} style={styles.calNavBtn}>
          <Ionicons name="chevron-back" size={20} color={T.text} />
        </TouchableOpacity>
        <Text style={styles.calMonthLabel}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
        <TouchableOpacity onPress={nextMonth} style={styles.calNavBtn}>
          <Ionicons name="chevron-forward" size={20} color={T.text} />
        </TouchableOpacity>
      </View>

      {/* Day-of-week headers */}
      <View style={styles.calRow}>
        {DAY_LABELS.map((d) => (
          <Text key={d} style={styles.calDayLabel}>{d}</Text>
        ))}
      </View>

      {/* Day grid */}
      {Array.from({ length: cells.length / 7 }, (_, week) => (
        <View key={week} style={styles.calRow}>
          {cells.slice(week * 7, week * 7 + 7).map((day, col) => {
            if (day === null) return <View key={col} style={styles.calCell} />;
            const isSelected = viewYear === selY && viewMonth === selM - 1 && day === selD;
            const isTdy = viewYear === today.getFullYear() && viewMonth === today.getMonth() && day === today.getDate();
            return (
              <TouchableOpacity
                key={col}
                style={[styles.calCell, isSelected && styles.calCellSelected]}
                onPress={() => onChange(toISO(viewYear, viewMonth, day))}
              >
                <Text style={[
                  styles.calDayNum,
                  isTdy && styles.calDayToday,
                  isSelected && styles.calDaySelectedText,
                ]}>{day}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ─── Session settings sheet ──────────────────────────────────────────────────

function SessionSettingsSheet({ session, routineName, onSave, onFinish, isPending }: {
  session: SessionWithEntries;
  routineName: string | null;
  onSave: (name: string, notes: string) => void;
  onFinish: (name: string, notes: string, date: string, durationMinutes: number) => void;
  isPending: boolean;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const now = new Date();

  // Parse startedAt into local hours/minutes
  const startDate = session.startedAt ? new Date(session.startedAt) : now;
  const [name, setName] = useState(session.name ?? routineName ?? '');
  const [notes, setNotes] = useState(session.notes ?? '');
  const [date, setDate] = useState(session.date);
  const [startH, setStartH] = useState(startDate.getHours());
  const [startM, setStartM] = useState(startDate.getMinutes());
  const [endH, setEndH] = useState(now.getHours());
  const [endM, setEndM] = useState(now.getMinutes());

  const durationMinutes = useMemo(() => {
    let mins = (endH * 60 + endM) - (startH * 60 + startM);
    if (mins < 0) mins += 1440; // crossed midnight
    return mins;
  }, [startH, startM, endH, endM]);

  function formatDuration(mins: number): string {
    if (mins === 0) return '0 min';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m} min`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}min`;
  }

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
          <CalendarPicker value={date} onChange={setDate} />

          {/* Start time */}
          <Text style={styles.settingsSectionLabel}>Start</Text>
          <View style={[styles.settingsCard, styles.settingsTimeCard]}>
            <View style={styles.wheelCol}>
              <WheelPicker items={HOURS_ITEMS} initialIndex={startH} onChange={setStartH} />
              <Text style={styles.wheelColLabel}>hrs</Text>
            </View>
            <Text style={styles.wheelColon}>:</Text>
            <View style={styles.wheelCol}>
              <WheelPicker items={MINUTES_ITEMS} initialIndex={startM} onChange={setStartM} />
              <Text style={styles.wheelColLabel}>min</Text>
            </View>
          </View>

          {/* End time */}
          <Text style={styles.settingsSectionLabel}>End</Text>
          <View style={[styles.settingsCard, styles.settingsTimeCard]}>
            <View style={styles.wheelCol}>
              <WheelPicker items={HOURS_ITEMS} initialIndex={endH} onChange={setEndH} />
              <Text style={styles.wheelColLabel}>hrs</Text>
            </View>
            <Text style={styles.wheelColon}>:</Text>
            <View style={styles.wheelCol}>
              <WheelPicker items={MINUTES_ITEMS} initialIndex={endM} onChange={setEndM} />
              <Text style={styles.wheelColLabel}>min</Text>
            </View>
          </View>
          <Text style={styles.settingsDurationHint}>
            Duration: {formatDuration(durationMinutes)}
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
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

const REST_DEFAULT = 120;

export default function SessionScreen() {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: session, isLoading, isError } = useSession(id ?? null);
  const completeSession = useCompleteSession();
  const updateSession = useUpdateSession();
  const addEntry = useAddSessionEntry();
  const { data: disciplines } = useDisciplines();
  const { data: allExercises } = useExercises();
  const { data: routines } = useRoutines();

  const exerciseTypeMap = useMemo(() => {
    const m = new Map<string, 'strength' | 'conditioning'>();
    allExercises?.forEach((e) => m.set(e.id, e.type));
    return m;
  }, [allExercises]);

  const routineName = useMemo(() => {
    if (!session?.routineId) return null;
    return routines?.find((r) => r.id === session.routineId)?.name ?? null;
  }, [session?.routineId, routines]);

  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [showDisciplinePicker, setShowDisciplinePicker] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [restSeconds, setRestSeconds] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState(REST_DEFAULT);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (restSeconds === null || restSeconds <= 0) return;
    const t = setTimeout(() => setRestSeconds((s) => (s !== null && s > 0 ? s - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [restSeconds]);

  useEffect(() => {
    if (!session?.startedAt || session.status !== 'in_progress') return;
    const tick = () => setElapsed(Math.floor((Date.now() - new Date(session.startedAt!).getTime()) / 1000));
    tick();
    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
  }, [session?.startedAt, session?.status]);

  function handleSetCompleted(secs: number) {
    setRestTotal(secs);
    setRestSeconds(secs);
  }

  function handleBack() {
    if (session?.status !== 'completed') {
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
      setShowSettings(false);
      router.back();
    } catch (err) {
      Alert.alert('Error', (err as Error).message ?? 'Failed to complete session.');
    }
  }

  async function handleSaveSettings(name: string, notes: string) {
    if (!id) return;
    try {
      await updateSession.mutateAsync({ id, name: name.trim() || null, notes: notes.trim() || null });
    } catch {
      // silent — non-critical
    }
    setShowSettings(false);
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
  const canFinish = doneCount > 0 || hasMartialArts;
  const isActive = session.status !== 'completed';

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* StrengthLog-style header */}
      <View style={styles.header}>
        {/* Left: X button */}
        <TouchableOpacity onPress={handleBack} style={styles.headerIconBtn}>
          <Ionicons name="close" size={20} color={T.danger} />
        </TouchableOpacity>

        {/* Center: timer or session name when done */}
        <View style={styles.headerCenter}>
          {isActive ? (
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
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => setShowSettings(true)}>
              <Ionicons name="settings-outline" size={20} color={T.textDim} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.headerIconBtn,
                styles.headerFinishBtn,
                (!canFinish || completeSession.isPending) && { opacity: 0.4 },
              ]}
              onPress={() => setShowSettings(true)}
              disabled={!canFinish || completeSession.isPending}
            >
              {completeSession.isPending
                ? <ActivityIndicator size="small" color={T.onPrimary} />
                : <Ionicons name="checkmark" size={20} color={T.onPrimary} />}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.doneBadge}><Text style={styles.doneBadgeText}>Done</Text></View>
        )}
      </View>

      {/* Rest timer (sticky, appears when active) */}
      {restSeconds !== null && (
        <RestTimer
          seconds={restSeconds}
          total={restTotal}
          onSkip={() => setRestSeconds(null)}
          onAdd={() => { setRestTotal((t) => t + 15); setRestSeconds((s) => (s ?? 0) + 15); }}
        />
      )}

      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 48 }]}
      >
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
              <Text style={styles.summaryNum}>{Math.round(sessionVolume).toLocaleString()}</Text>
              <Text style={styles.summaryKey}>kg volume</Text>
            </View>
          </View>
        )}

        {session.entries.map((entry) => {
          if (entry.kind === 'exercise') {
            return (
              <StrengthEntryCard
                key={entry.id}
                entry={entry}
                sessionId={session.id}
                onSetCompleted={handleSetCompleted}
                exerciseType={entry.exerciseId ? exerciseTypeMap.get(entry.exerciseId) : undefined}
              />
            );
          }
          if (entry.kind === 'martial_arts') {
            return (
              <MartialArtsEntryCard
                key={entry.id}
                entry={entry}
                sessionId={session.id}
                disciplines={disciplines ?? []}
              />
            );
          }
          return null;
        })}

        {session.status !== 'completed' && (
          <View style={styles.addEntryRow}>
            <TouchableOpacity style={styles.addEntryBtn} onPress={() => setShowExercisePicker(true)}>
              <Ionicons name="add" size={16} color={T.textDim} />
              <Text style={styles.addEntryText}>Exercise</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addEntryBtn} onPress={() => setShowDisciplinePicker(true)}>
              <Ionicons name="add" size={16} color={T.textDim} />
              <Text style={styles.addEntryText}>Discipline</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <PickExerciseModal
        visible={showExercisePicker}
        onClose={() => setShowExercisePicker(false)}
        onPick={(e) => { if (id) addEntry.mutate({ sessionId: id, kind: 'exercise', exerciseId: e.id }); }}
      />
      <PickDisciplineModal
        visible={showDisciplinePicker}
        onClose={() => setShowDisciplinePicker(false)}
        onPick={(d) => { if (id) addEntry.mutate({ sessionId: id, kind: 'martial_arts', disciplineId: d.id }); }}
      />

      {showSettings && session && (
        <SessionSettingsSheet
          session={session}
          routineName={routineName}
          onSave={handleSaveSettings}
          onFinish={doFinish}
          isPending={completeSession.isPending}
        />
      )}
    </View>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  loadingScreen: { flex: 1, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center' },
  skeletonCard: { backgroundColor: T.surface, borderRadius: R.card, borderWidth: 1, borderColor: T.border, padding: 14 },
  skeletonSetRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  errorText: { fontFamily: F.ui, fontSize: 15, color: T.danger, textAlign: 'center' },

  // StrengthLog-style header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
    gap: 8,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTimer: { fontFamily: F.mono, fontSize: 22, color: T.text, letterSpacing: 1 },
  headerDoneLabel: { fontFamily: F.uiSemi, fontSize: 17, color: T.text, letterSpacing: -0.2 },
  headerActions: { flexDirection: 'row', gap: 6 },
  headerIconBtn: {
    width: 40, height: 40, borderRadius: 20,
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

  body: { padding: D.pad, gap: D.stack },

  emptyEntries: { alignItems: 'center', paddingVertical: 48 },
  summaryBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: R.card,
    paddingVertical: 12, marginBottom: 4,
  },
  summaryStat: { flex: 1, alignItems: 'center', gap: 2 },
  summaryDivider: { width: 1, alignSelf: 'stretch', backgroundColor: T.border, marginVertical: 4 },
  summaryNum: { fontFamily: F.monoBold, fontSize: 20, color: T.text },
  summaryKey: { fontFamily: F.uiMed, fontSize: 11, color: T.textDim, textTransform: 'uppercase', letterSpacing: 0.4 },
  emptyTitle: { fontFamily: F.uiSemi, fontSize: 16, color: T.textDim, marginBottom: 4 },
  emptySub: { fontFamily: F.uiMed, fontSize: 13, color: T.muted, textAlign: 'center' },

  // Entry card
  entryCard: {
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: R.card,
    padding: D.cardPad,
    gap: 9,
  },
  entryHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  entryName: { fontFamily: F.uiSemi, fontSize: 17, color: T.text, letterSpacing: -0.2, flex: 1 },
  gymBadge: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: R.chip,
    backgroundColor: withAlpha(T.primary, 0.13), borderWidth: 1, borderColor: withAlpha(T.primary, 0.28),
  },
  gymBadgeText: { fontFamily: F.uiSemi, fontSize: 10, color: T.primary, letterSpacing: 0.4 },

  lastTimeText: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim },
  lastTimeVal: { fontFamily: F.uiSemi, color: T.text },

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
    width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: T.borderStrong,
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
  cellRpe: {
    width: 52,
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
  maSaveBtn: {
    backgroundColor: T.primary, borderRadius: R.sm,
    paddingVertical: 11, alignItems: 'center', marginTop: 4,
  },
  maSaveBtnText: { fontFamily: F.uiSemi, fontSize: 15, color: T.onPrimary },

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
  modalSearch: {
    backgroundColor: T.surface, borderWidth: 1, borderColor: T.border,
    borderRadius: R.sm, paddingHorizontal: 14, paddingVertical: 10,
    fontFamily: F.uiMed, fontSize: 15, color: T.text, marginHorizontal: 16, marginBottom: 12,
  },
  pickRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
  pickThumb: { width: 44, height: 44, borderRadius: 8 },
  pickThumbPlaceholder: { backgroundColor: T.surface2 },
  pickInfo: { flex: 1 },
  pickName: { fontFamily: F.uiMed, fontSize: 16, color: T.text },
  pickMeta: { fontFamily: F.uiMed, fontSize: 13, color: T.textDim, marginTop: 2, textTransform: 'capitalize' },
  separator: { height: 1, backgroundColor: T.border, marginLeft: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  emptyText: { fontFamily: F.uiMed, fontSize: 15, color: T.muted },

  // Wheel picker
  wheel: { height: WHEEL_ITEM_H * 3, overflow: 'hidden' },
  wheelHighlight: {
    position: 'absolute', left: 0, right: 0,
    top: WHEEL_ITEM_H, height: WHEEL_ITEM_H,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: T.borderStrong,
  },
  wheelItemRow: { height: WHEEL_ITEM_H, alignItems: 'center', justifyContent: 'center' },
  wheelItemText: { fontFamily: F.mono, fontSize: 30, color: T.text },
  wheelCol: { alignItems: 'center', gap: 4 },
  wheelColLabel: { fontFamily: F.uiSemi, fontSize: 11, color: T.textDim, textTransform: 'uppercase', letterSpacing: 0.8 },
  wheelColon: { fontFamily: F.mono, fontSize: 34, color: T.textDim, marginBottom: 20 },

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
    backgroundColor: T.surface, borderRadius: R.card,
    borderWidth: 1, borderColor: T.border,
    overflow: 'hidden',
  },
  settingsTimeCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 8,
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

  // Calendar picker
  calContainer: {
    backgroundColor: T.surface, borderRadius: R.card,
    borderWidth: 1, borderColor: T.border, padding: 12,
  },
  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  calNavBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  calMonthLabel: { fontFamily: F.uiSemi, fontSize: 15, color: T.text },
  calRow: { flexDirection: 'row' },
  calCell: { flex: 1, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: R.sm },
  calCellSelected: { backgroundColor: T.primary },
  calDayLabel: { flex: 1, fontFamily: F.uiBold, fontSize: 11, color: T.textDim, textAlign: 'center', textTransform: 'uppercase', marginBottom: 4 },
  calDayNum: { fontFamily: F.uiMed, fontSize: 14, color: T.text },
  calDayToday: { color: T.primary, fontFamily: F.uiBold },
  calDaySelectedText: { color: T.onPrimary, fontFamily: F.uiBold },
  });
}
