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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  Discipline,
  EnumFieldDef,
  Exercise,
  GiType,
  SessionEntryWithSets,
  SetType,
  StrengthSet,
} from '@app/shared';
import { useExercises } from '../../../src/hooks/useExercises';
import { useDisciplines } from '../../../src/hooks/useDisciplines';
import {
  useSession,
  useCompleteSession,
  useAddSessionEntry,
  useUpdateSessionEntry,
  useAddStrengthSet,
  useUpdateStrengthSet,
  useDeleteStrengthSet,
  useExerciseHistory,
} from '../../../src/hooks/useSession';

// ─── Picker modals (same pattern as template editor) ────────────────────────

interface PickExerciseModalProps {
  visible: boolean;
  onClose: () => void;
  onPick: (exercise: Exercise) => void;
}

function PickExerciseModal({ visible, onClose, onPick }: PickExerciseModalProps) {
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
          placeholder="Search exercises..."
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
        {isLoading ? (
          <View style={styles.modalCentered}>
            <ActivityIndicator size="large" color="#3b82f6" />
          </View>
        ) : (
          <FlatList
            data={exercises ?? []}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.pickRow}
                onPress={() => {
                  onPick(item);
                  handleClose();
                }}
              >
                <Text style={styles.pickRowName}>{item.name}</Text>
                <Text style={styles.pickRowType}>{item.type}</Text>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={styles.pickSeparator} />}
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

interface PickDisciplineModalProps {
  visible: boolean;
  onClose: () => void;
  onPick: (discipline: Discipline) => void;
}

function PickDisciplineModal({ visible, onClose, onPick }: PickDisciplineModalProps) {
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
            <ActivityIndicator size="large" color="#3b82f6" />
          </View>
        ) : (
          <FlatList
            data={disciplines ?? []}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.pickRow}
                onPress={() => {
                  onPick(item);
                  onClose();
                }}
              >
                <Text style={styles.pickRowName}>{item.name}</Text>
                <Text style={styles.pickRowType}>{item.category}</Text>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={styles.pickSeparator} />}
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

// ─── Rest Timer ──────────────────────────────────────────────────────────────

interface RestTimerProps {
  endsAt: number; // Date.now() + duration ms
  onDismiss: () => void;
}

function RestTimer({ endsAt, onDismiss }: RestTimerProps) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.round((endsAt - Date.now()) / 1000)),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      const secs = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      setRemaining(secs);
      if (secs === 0) clearInterval(interval);
    }, 500);
    return () => clearInterval(interval);
  }, [endsAt]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const display = `${mins}:${String(secs).padStart(2, '0')}`;

  return (
    <TouchableOpacity style={styles.restTimer} onPress={onDismiss} activeOpacity={0.8}>
      <Text style={styles.restTimerLabel}>Rest</Text>
      <Text style={styles.restTimerCount}>{display}</Text>
      <Text style={styles.restTimerDismiss}>Tap to dismiss</Text>
    </TouchableOpacity>
  );
}

// ─── Set row (strength) ──────────────────────────────────────────────────────

const SET_TYPE_OPTIONS: { value: SetType; label: string }[] = [
  { value: 'warmup', label: 'W' },
  { value: 'normal', label: 'N' },
  { value: 'drop', label: 'D' },
  { value: 'failure', label: 'F' },
  { value: 'amrap', label: 'A' },
];

interface SetRowProps {
  set: StrengthSet;
  sessionId: string;
  entryId: string;
  restSeconds: number;
  onCompleted: () => void;
  onDelete: () => void;
}

function SetRow({ set, sessionId, entryId, restSeconds, onCompleted, onDelete }: SetRowProps) {
  const updateSet = useUpdateStrengthSet();

  const [reps, setReps] = useState(set.reps !== null ? String(set.reps) : '');
  const [weight, setWeight] = useState(set.weight !== null ? String(set.weight) : '');
  const [setType, setSetType] = useState<SetType>(set.setType);

  function handleChangeType(t: SetType) {
    setSetType(t);
    updateSet.mutate({ sessionId, entryId, setId: set.id, setType: t });
  }

  function handleBlurReps() {
    const parsed = reps.trim() === '' ? null : Number(reps);
    updateSet.mutate({
      sessionId,
      entryId,
      setId: set.id,
      reps: isNaN(parsed as number) ? null : parsed,
    });
  }

  function handleBlurWeight() {
    const parsed = weight.trim() === '' ? null : Number(weight);
    updateSet.mutate({
      sessionId,
      entryId,
      setId: set.id,
      weight: isNaN(parsed as number) ? null : parsed,
    });
  }

  function handleComplete() {
    updateSet.mutate(
      { sessionId, entryId, setId: set.id, completed: true },
      { onSuccess: onCompleted },
    );
  }

  return (
    <View
      style={[styles.setRow, set.completed && styles.setRowCompleted]}
    >
      <TouchableOpacity
        onLongPress={onDelete}
        style={styles.setNumberCell}
        delayLongPress={600}
      >
        <Text style={styles.setNumber}>{set.setNumber}</Text>
      </TouchableOpacity>

      <View style={styles.setTypeRow}>
        {SET_TYPE_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[
              styles.setTypeBtn,
              setType === opt.value && styles.setTypeBtnActive,
            ]}
            onPress={() => handleChangeType(opt.value)}
          >
            <Text
              style={[
                styles.setTypeBtnText,
                setType === opt.value && styles.setTypeBtnTextActive,
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TextInput
        style={styles.setInput}
        value={reps}
        onChangeText={setReps}
        onBlur={handleBlurReps}
        placeholder="Reps"
        keyboardType="number-pad"
        returnKeyType="done"
        editable={!set.completed}
      />

      <TextInput
        style={styles.setInput}
        value={weight}
        onChangeText={setWeight}
        onBlur={handleBlurWeight}
        placeholder="kg"
        keyboardType="decimal-pad"
        returnKeyType="done"
        editable={!set.completed}
      />

      <TouchableOpacity
        style={[styles.checkBtn, set.completed && styles.checkBtnDone]}
        onPress={handleComplete}
        disabled={set.completed || updateSet.isPending}
      >
        <Text style={styles.checkBtnText}>{set.completed ? '✓' : '○'}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Last-time summary ───────────────────────────────────────────────────────

interface LastTimeProps {
  exerciseId: string;
}

function LastTime({ exerciseId }: LastTimeProps) {
  const { data } = useExerciseHistory(exerciseId);

  const summary = useMemo(() => {
    if (!data?.history.length) return null;
    const last = data.history[0];
    const sets = last.entry.sets.filter((s) => s.completed && s.reps !== null);
    if (!sets.length) return null;
    const firstSet = sets[0];
    const count = sets.length;
    const weightPart = firstSet.weight !== null ? `×${firstSet.weight}kg` : '';
    return `Last: ${count}×${firstSet.reps}${weightPart}`;
  }, [data]);

  if (!summary) return null;

  return (
    <View style={styles.lastTime}>
      <Text style={styles.lastTimeText}>{summary}</Text>
    </View>
  );
}

// ─── Strength entry card ─────────────────────────────────────────────────────

interface StrengthEntryCardProps {
  entry: SessionEntryWithSets;
  sessionId: string;
}

function StrengthEntryCard({ entry, sessionId }: StrengthEntryCardProps) {
  const addSet = useAddStrengthSet();
  const deleteSet = useDeleteStrengthSet();
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);

  const restSeconds = entry.restSeconds ?? 90;

  function handleSetCompleted() {
    setRestEndsAt(Date.now() + restSeconds * 1000);
  }

  function handleAddSet() {
    addSet.mutate({
      sessionId,
      entryId: entry.id,
      setNumber: entry.sets.length + 1,
      setType: 'normal',
      completed: false,
    });
  }

  function handleDeleteSet(setId: string) {
    Alert.alert('Delete Set', 'Remove this set?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteSet.mutate({ sessionId, entryId: entry.id, setId }),
      },
    ]);
  }

  return (
    <View style={styles.entryCard}>
      <View style={styles.entryCardHeader}>
        <View style={[styles.kindBadge, { backgroundColor: '#3b82f6' }]}>
          <Text style={styles.kindBadgeText}>GYM</Text>
        </View>
        <Text style={styles.entryName}>{entry.exerciseName ?? 'Exercise'}</Text>
      </View>

      {entry.exerciseId && <LastTime exerciseId={entry.exerciseId} />}

      <View style={styles.setHeaderRow}>
        <Text style={[styles.setHeaderCell, styles.setNumberCell]}>Set</Text>
        <Text style={styles.setHeaderType}>Type</Text>
        <Text style={styles.setHeaderCell}>Reps</Text>
        <Text style={styles.setHeaderCell}>kg</Text>
        <Text style={styles.setHeaderCheck}> </Text>
      </View>

      {entry.sets.map((set) => (
        <SetRow
          key={set.id}
          set={set}
          sessionId={sessionId}
          entryId={entry.id}
          restSeconds={restSeconds}
          onCompleted={handleSetCompleted}
          onDelete={() => handleDeleteSet(set.id)}
        />
      ))}

      <TouchableOpacity
        style={styles.addSetBtn}
        onPress={handleAddSet}
        disabled={addSet.isPending}
      >
        {addSet.isPending ? (
          <ActivityIndicator size="small" color="#3b82f6" />
        ) : (
          <Text style={styles.addSetBtnText}>+ Add Set</Text>
        )}
      </TouchableOpacity>

      {restEndsAt !== null && (
        <RestTimer endsAt={restEndsAt} onDismiss={() => setRestEndsAt(null)} />
      )}
    </View>
  );
}

// ─── Martial arts entry card ─────────────────────────────────────────────────

interface MartialArtsEntryCardProps {
  entry: SessionEntryWithSets;
  sessionId: string;
  disciplines: Discipline[];
}

function MartialArtsEntryCard({ entry, sessionId, disciplines }: MartialArtsEntryCardProps) {
  const updateEntry = useUpdateSessionEntry();

  const discipline = disciplines.find((d) => d.id === entry.disciplineId);

  const [gi, setGi] = useState<GiType | null>(entry.gi ?? null);
  const [details, setDetails] = useState<Record<string, unknown>>(
    (entry.details as Record<string, unknown>) ?? {},
  );

  const handleSave = useCallback(() => {
    updateEntry.mutate({ sessionId, entryId: entry.id, gi, details });
  }, [sessionId, entry.id, gi, details, updateEntry]);

  function setField(key: string, value: unknown) {
    setDetails((prev) => ({ ...prev, [key]: value }));
  }

  if (!discipline) {
    return (
      <View style={styles.entryCard}>
        <View style={styles.entryCardHeader}>
          <View style={[styles.kindBadge, { backgroundColor: '#8b5cf6' }]}>
            <Text style={styles.kindBadgeText}>MA</Text>
          </View>
          <Text style={styles.entryName}>{entry.disciplineName ?? 'Discipline'}</Text>
        </View>
        <ActivityIndicator style={{ margin: 12 }} />
      </View>
    );
  }

  return (
    <View style={styles.entryCard}>
      <View style={styles.entryCardHeader}>
        <View style={[styles.kindBadge, { backgroundColor: '#8b5cf6' }]}>
          <Text style={styles.kindBadgeText}>MA</Text>
        </View>
        <Text style={styles.entryName}>{discipline.name}</Text>
      </View>

      {discipline.fieldConfig.map((field) => {
        const isGiField = 'column' in field && field.column === 'gi';

        if (field.type === 'enum') {
          const enumField = field as EnumFieldDef;
          const currentValue = isGiField ? gi : (details[field.key] as string | undefined);

          return (
            <View key={field.key} style={styles.maField}>
              <Text style={styles.maFieldLabel}>{field.label}</Text>
              <View style={styles.enumRow}>
                {enumField.options.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[
                      styles.enumOption,
                      currentValue === opt && styles.enumOptionActive,
                    ]}
                    onPress={() => {
                      if (isGiField) {
                        setGi(opt as GiType);
                      } else {
                        setField(field.key, opt);
                      }
                    }}
                  >
                    <Text
                      style={[
                        styles.enumOptionText,
                        currentValue === opt && styles.enumOptionTextActive,
                      ]}
                    >
                      {opt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          );
        }

        if (field.type === 'boolean') {
          const boolValue = isGiField
            ? gi !== null
            : Boolean(details[field.key]);

          return (
            <View key={field.key} style={[styles.maField, styles.maFieldRow]}>
              <Text style={styles.maFieldLabel}>{field.label}</Text>
              <Switch
                value={boolValue}
                onValueChange={(v) => {
                  if (isGiField) {
                    setGi(v ? 'gi' : null);
                  } else {
                    setField(field.key, v);
                  }
                }}
              />
            </View>
          );
        }

        if (field.type === 'number') {
          const numValue = details[field.key];
          return (
            <View key={field.key} style={styles.maField}>
              <Text style={styles.maFieldLabel}>{field.label}</Text>
              <TextInput
                style={styles.maInput}
                value={numValue !== undefined && numValue !== null ? String(numValue) : ''}
                onChangeText={(t) =>
                  setField(field.key, t.trim() === '' ? null : Number(t))
                }
                keyboardType="decimal-pad"
                returnKeyType="done"
                placeholder="0"
              />
            </View>
          );
        }

        if (field.type === 'text') {
          return (
            <View key={field.key} style={styles.maField}>
              <Text style={styles.maFieldLabel}>{field.label}</Text>
              <TextInput
                style={styles.maInput}
                value={(details[field.key] as string | undefined) ?? ''}
                onChangeText={(t) => setField(field.key, t)}
                returnKeyType="done"
              />
            </View>
          );
        }

        if (field.type === 'textarea') {
          return (
            <View key={field.key} style={styles.maField}>
              <Text style={styles.maFieldLabel}>{field.label}</Text>
              <TextInput
                style={[styles.maInput, styles.maTextarea]}
                value={(details[field.key] as string | undefined) ?? ''}
                onChangeText={(t) => setField(field.key, t)}
                multiline
                textAlignVertical="top"
                returnKeyType="default"
              />
            </View>
          );
        }

        return null;
      })}

      <TouchableOpacity
        style={[styles.maSaveBtn, updateEntry.isPending && styles.maSaveBtnDisabled]}
        onPress={handleSave}
        disabled={updateEntry.isPending}
      >
        {updateEntry.isPending ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.maSaveBtnText}>Save</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data: session, isLoading, isError } = useSession(id ?? null);
  const completeSession = useCompleteSession();
  const addEntry = useAddSessionEntry();
  const { data: disciplines } = useDisciplines();

  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [showDisciplinePicker, setShowDisciplinePicker] = useState(false);

  function handleBack() {
    if (session?.status !== 'completed') {
      Alert.alert(
        'Leave Session?',
        'Your session is still in progress. You can finish it later from History.',
        [
          { text: 'Stay', style: 'cancel' },
          { text: 'Leave', style: 'destructive', onPress: () => router.back() },
        ],
      );
    } else {
      router.back();
    }
  }

  async function handleFinish() {
    if (!id) return;
    try {
      await completeSession.mutateAsync({ id });
      router.back();
    } catch (err) {
      Alert.alert('Error', (err as Error).message ?? 'Failed to complete session.');
    }
  }

  function handleAddExercise(exercise: Exercise) {
    if (!id) return;
    addEntry.mutate({ sessionId: id, kind: 'exercise', exerciseId: exercise.id });
  }

  function handleAddDiscipline(discipline: Discipline) {
    if (!id) return;
    addEntry.mutate({ sessionId: id, kind: 'martial_arts', disciplineId: discipline.id });
  }

  const sessionName = useMemo(() => {
    if (!session) return 'Session';
    return session.templateId ? 'Session' : 'Ad-hoc Session';
  }, [session]);

  const isFinishing = completeSession.isPending;

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (isError || !session) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Failed to load session.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backLinkBtn}>
          <Text style={styles.backLinkText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {sessionName}
        </Text>
        {session.status !== 'completed' ? (
          <TouchableOpacity
            style={[styles.finishBtn, isFinishing && styles.finishBtnDisabled]}
            onPress={handleFinish}
            disabled={isFinishing}
          >
            {isFinishing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.finishBtnText}>Finish</Text>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.completedBadge}>
            <Text style={styles.completedBadgeText}>Done</Text>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        {session.entries.length === 0 && (
          <View style={styles.emptyEntries}>
            <Text style={styles.emptyEntriesText}>No exercises yet.</Text>
            <Text style={styles.emptyEntriesSubText}>Add exercises or disciplines below.</Text>
          </View>
        )}

        {session.entries.map((entry) => {
          if (entry.kind === 'exercise') {
            return (
              <StrengthEntryCard
                key={entry.id}
                entry={entry}
                sessionId={session.id}
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
            <TouchableOpacity
              style={styles.addEntryBtn}
              onPress={() => setShowExercisePicker(true)}
            >
              <Text style={styles.addEntryBtnText}>+ Exercise</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addEntryBtn}
              onPress={() => setShowDisciplinePicker(true)}
            >
              <Text style={styles.addEntryBtnText}>+ Discipline</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.bottomSpacer} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  errorText: {
    fontSize: 15,
    color: '#ef4444',
    marginBottom: 12,
  },
  backLinkBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  backLinkText: {
    fontSize: 15,
    color: '#3b82f6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  backButton: {
    minWidth: 52,
  },
  backText: {
    fontSize: 16,
    color: '#3b82f6',
  },
  finishBtn: {
    minWidth: 60,
    alignItems: 'center',
    backgroundColor: '#10b981',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  finishBtnDisabled: {
    opacity: 0.6,
  },
  finishBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  completedBadge: {
    minWidth: 60,
    alignItems: 'center',
    backgroundColor: '#d1fae5',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  completedBadgeText: {
    color: '#065f46',
    fontSize: 13,
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 12,
  },
  emptyEntries: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyEntriesText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: 4,
  },
  emptyEntriesSubText: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
  },
  // Entry card shared
  entryCard: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  entryCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  kindBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  kindBadgeText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  entryName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
  },
  // Last time
  lastTime: {
    marginBottom: 8,
  },
  lastTimeText: {
    fontSize: 12,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  // Set table header
  setHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  setHeaderCell: {
    width: 52,
    fontSize: 11,
    color: '#9ca3af',
    fontWeight: '600',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  setHeaderType: {
    flex: 1,
    fontSize: 11,
    color: '#9ca3af',
    fontWeight: '600',
    textTransform: 'uppercase',
    marginLeft: 4,
  },
  setHeaderCheck: {
    width: 36,
  },
  // Set row
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f3f4f6',
  },
  setRowCompleted: {
    opacity: 0.55,
  },
  setNumberCell: {
    width: 28,
    alignItems: 'center',
  },
  setNumber: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '600',
    textAlign: 'center',
  },
  setTypeRow: {
    flexDirection: 'row',
    flex: 1,
    gap: 3,
  },
  setTypeBtn: {
    flex: 1,
    paddingVertical: 4,
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  setTypeBtnActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  setTypeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6b7280',
  },
  setTypeBtnTextActive: {
    color: '#fff',
  },
  setInput: {
    width: 52,
    height: 34,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 6,
    fontSize: 14,
    textAlign: 'center',
    color: '#111827',
    backgroundColor: '#fff',
  },
  checkBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBtnDone: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  checkBtnText: {
    fontSize: 16,
    color: '#6b7280',
    fontWeight: '700',
    lineHeight: 18,
  },
  // Add set button
  addSetBtn: {
    marginTop: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    borderStyle: 'dashed',
  },
  addSetBtnText: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '600',
  },
  // Rest timer
  restTimer: {
    marginTop: 12,
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  restTimerLabel: {
    fontSize: 11,
    color: '#3b82f6',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  restTimerCount: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1d4ed8',
    fontVariant: ['tabular-nums'],
  },
  restTimerDismiss: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
  },
  // MA fields
  maField: {
    marginBottom: 12,
  },
  maFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  maFieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  enumRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  enumOption: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
  },
  enumOptionActive: {
    backgroundColor: '#8b5cf6',
    borderColor: '#8b5cf6',
  },
  enumOptionText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  enumOptionTextActive: {
    color: '#fff',
  },
  maInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#fff',
  },
  maTextarea: {
    minHeight: 80,
  },
  maSaveBtn: {
    marginTop: 4,
    backgroundColor: '#8b5cf6',
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
  },
  maSaveBtnDisabled: {
    opacity: 0.6,
  },
  maSaveBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  // Add entry row
  addEntryRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  addEntryBtn: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  addEntryBtnText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '600',
  },
  bottomSpacer: {
    height: 48,
  },
  // Picker modals
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  modalCancel: {
    fontSize: 16,
    color: '#6b7280',
  },
  searchInput: {
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  pickRowName: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '500',
  },
  pickRowType: {
    fontSize: 13,
    color: '#6b7280',
  },
  pickSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e5e7eb',
    marginLeft: 16,
  },
  modalCentered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 15,
    color: '#9ca3af',
  },
});
