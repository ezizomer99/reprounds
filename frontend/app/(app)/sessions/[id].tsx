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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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
import { RestTimer } from '../../../src/components/RestTimer';
import { T, F, R, D } from '../../../src/theme/colors';
import { withAlpha } from '../../../src/lib/color';

const SET_TYPE_CYCLE: SetType[] = ['warmup', 'normal', 'drop', 'failure', 'amrap'];
const SET_TYPE_LABEL: Record<SetType, string> = {
  warmup: 'W',
  normal: 'N',
  drop: 'D',
  failure: 'F',
  amrap: 'A',
};
const SET_TYPE_COLOR: Record<SetType, string> = {
  warmup: T.textDim,
  normal: T.primary,
  drop: '#a78bfa',
  failure: T.danger,
  amrap: T.gold,
};

// ─── Exercise picker modal ────────────────────────────────────────────────────

function PickExerciseModal({ visible, onClose, onPick }: {
  visible: boolean;
  onClose: () => void;
  onPick: (e: Exercise) => void;
}) {
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
                <Text style={styles.pickName}>{item.name}</Text>
                <Text style={styles.pickMeta}>{item.type}</Text>
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

function SetRow({ set, sessionId, entryId, onCompleted, onDelete }: {
  set: StrengthSet;
  sessionId: string;
  entryId: string;
  onCompleted: () => void;
  onDelete: () => void;
}) {
  const updateSet = useUpdateStrengthSet();
  const [reps, setReps] = useState(set.reps !== null ? String(set.reps) : '');
  const [weight, setWeight] = useState(set.weight !== null ? String(set.weight) : '');
  const [setType, setSetType] = useState<SetType>(set.setType);

  function cycleType() {
    const idx = SET_TYPE_CYCLE.indexOf(setType);
    const next = SET_TYPE_CYCLE[(idx + 1) % SET_TYPE_CYCLE.length];
    setSetType(next);
    updateSet.mutate({ sessionId, entryId, setId: set.id, setType: next });
  }

  function handleBlurReps() {
    const parsed = reps.trim() === '' ? null : Number(reps);
    updateSet.mutate({ sessionId, entryId, setId: set.id, reps: isNaN(parsed as number) ? null : parsed });
  }

  function handleBlurWeight() {
    const parsed = weight.trim() === '' ? null : Number(weight);
    updateSet.mutate({ sessionId, entryId, setId: set.id, weight: isNaN(parsed as number) ? null : parsed });
  }

  function handleComplete() {
    updateSet.mutate({ sessionId, entryId, setId: set.id, completed: true }, { onSuccess: onCompleted });
  }

  const chipColor = SET_TYPE_COLOR[setType];
  const isDone = set.completed;

  return (
    <View style={[styles.setRow, isDone && { backgroundColor: withAlpha(T.primary, 0.08) }]}>
      {/* Set number / long-press to delete */}
      <TouchableOpacity style={styles.setNum} onLongPress={onDelete} delayLongPress={600}>
        <Text style={styles.setNumText}>{set.setNumber}</Text>
      </TouchableOpacity>

      {/* Type chip — cycles on tap */}
      <TouchableOpacity
        style={[styles.typeChip, { borderColor: withAlpha(chipColor, 0.45) }]}
        onPress={cycleType}
      >
        <Text style={[styles.typeChipText, { color: chipColor }]}>{SET_TYPE_LABEL[setType]}</Text>
      </TouchableOpacity>

      {/* Weight cell */}
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

      {/* Reps cell */}
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
      </View>

      {/* Check button */}
      <TouchableOpacity
        style={[styles.checkBtn, isDone && { backgroundColor: T.primary, borderColor: T.primary }]}
        onPress={handleComplete}
        disabled={isDone || updateSet.isPending}
      >
        <Ionicons name="checkmark" size={18} color={isDone ? T.onPrimary : T.muted} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Last time summary ────────────────────────────────────────────────────────

function LastTime({ exerciseId }: { exerciseId: string }) {
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

function StrengthEntryCard({ entry, sessionId, onSetCompleted }: {
  entry: SessionEntryWithSets;
  sessionId: string;
  onSetCompleted: (restSecs: number) => void;
}) {
  const addSet = useAddStrengthSet();
  const deleteSet = useDeleteStrengthSet();
  const restSeconds = entry.restSeconds ?? 120;

  function handleAddSet() {
    addSet.mutate({ sessionId, entryId: entry.id, setNumber: entry.sets.length + 1, setType: 'normal', completed: false });
  }

  function handleDeleteSet(setId: string) {
    Alert.alert('Delete Set', 'Remove this set?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteSet.mutate({ sessionId, entryId: entry.id, setId }) },
    ]);
  }

  return (
    <View style={styles.entryCard}>
      <View style={styles.entryHead}>
        <Text style={styles.entryName}>{entry.exerciseName ?? 'Exercise'}</Text>
        <View style={styles.gymBadge}><Text style={styles.gymBadgeText}>Gym</Text></View>
      </View>
      {entry.exerciseId && <LastTime exerciseId={entry.exerciseId} />}

      <View style={styles.colHeaders}>
        <View style={styles.setNum} />
        <View style={styles.typeChip} />
        <Text style={styles.colHeader}>Weight</Text>
        <Text style={styles.colHeader}>Reps</Text>
        <View style={{ width: 44 }} />
      </View>

      {entry.sets.map((set) => (
        <SetRow
          key={set.id}
          set={set}
          sessionId={sessionId}
          entryId={entry.id}
          onCompleted={() => onSetCompleted(restSeconds)}
          onDelete={() => handleDeleteSet(set.id)}
        />
      ))}

      <TouchableOpacity style={styles.addSetBtn} onPress={handleAddSet} disabled={addSet.isPending}>
        {addSet.isPending ? (
          <ActivityIndicator size="small" color={T.textDim} />
        ) : (
          <>
            <Ionicons name="add" size={15} color={T.textDim} />
            <Text style={styles.addSetText}>Add set</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ─── Martial arts entry card ──────────────────────────────────────────────────

function MartialArtsEntryCard({ entry, sessionId, disciplines }: {
  entry: SessionEntryWithSets;
  sessionId: string;
  disciplines: Discipline[];
}) {
  const updateEntry = useUpdateSessionEntry();
  const discipline = disciplines.find((d) => d.id === entry.disciplineId);
  const [gi, setGi] = useState<GiType | null>(entry.gi ?? null);
  const [details, setDetails] = useState<Record<string, unknown>>((entry.details as Record<string, unknown>) ?? {});

  const handleSave = useCallback(() => {
    updateEntry.mutate({ sessionId, entryId: entry.id, gi, details });
  }, [sessionId, entry.id, gi, details, updateEntry]);

  function setField(key: string, value: unknown) {
    setDetails((prev) => ({ ...prev, [key]: value }));
  }

  if (!discipline) {
    return (
      <View style={styles.entryCard}>
        <View style={styles.entryHead}>
          <Text style={styles.entryName}>{entry.disciplineName ?? 'Discipline'}</Text>
          <View style={[styles.gymBadge, { backgroundColor: withAlpha('#a78bfa', 0.15), borderColor: withAlpha('#a78bfa', 0.3) }]}>
            <Text style={[styles.gymBadgeText, { color: '#a78bfa' }]}>Mat</Text>
          </View>
        </View>
        <ActivityIndicator style={{ margin: 12 }} color={T.primary} />
      </View>
    );
  }

  return (
    <View style={styles.entryCard}>
      <View style={styles.entryHead}>
        <Text style={styles.entryName}>{discipline.name}</Text>
        <View style={[styles.gymBadge, { backgroundColor: withAlpha('#a78bfa', 0.15), borderColor: withAlpha('#a78bfa', 0.3) }]}>
          <Text style={[styles.gymBadgeText, { color: '#a78bfa' }]}>Mat</Text>
        </View>
      </View>

      {discipline.fieldConfig.map((field) => {
        const isGiField = 'column' in field && field.column === 'gi';

        if (field.type === 'enum') {
          const enumField = field as EnumFieldDef;
          const current = isGiField ? gi : (details[field.key] as string | undefined);
          return (
            <View key={field.key} style={styles.maField}>
              <Text style={styles.maLabel}>{field.label}</Text>
              <View style={styles.enumRow}>
                {enumField.options.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.enumOpt, current === opt && styles.enumOptActive]}
                    onPress={() => isGiField ? setGi(opt as GiType) : setField(field.key, opt)}
                  >
                    <Text style={[styles.enumOptText, current === opt && styles.enumOptTextActive]}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          );
        }

        if (field.type === 'boolean') {
          const boolVal = isGiField ? gi !== null : Boolean(details[field.key]);
          return (
            <View key={field.key} style={[styles.maField, styles.maFieldRow]}>
              <Text style={styles.maLabel}>{field.label}</Text>
              <Switch
                value={boolVal}
                onValueChange={(v) => isGiField ? setGi(v ? 'gi' : null) : setField(field.key, v)}
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
        style={[styles.maSaveBtn, updateEntry.isPending && { opacity: 0.5 }]}
        onPress={handleSave}
        disabled={updateEntry.isPending}
      >
        {updateEntry.isPending ? <ActivityIndicator size="small" color={T.onPrimary} /> : <Text style={styles.maSaveBtnText}>Save</Text>}
      </TouchableOpacity>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

const REST_DEFAULT = 120;

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: session, isLoading, isError } = useSession(id ?? null);
  const completeSession = useCompleteSession();
  const addEntry = useAddSessionEntry();
  const { data: disciplines } = useDisciplines();

  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [showDisciplinePicker, setShowDisciplinePicker] = useState(false);
  const [restSeconds, setRestSeconds] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState(REST_DEFAULT);

  useEffect(() => {
    if (restSeconds === null || restSeconds <= 0) return;
    const t = setTimeout(() => setRestSeconds((s) => (s !== null && s > 0 ? s - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [restSeconds]);

  function handleSetCompleted(secs: number) {
    setRestTotal(secs);
    setRestSeconds(secs);
  }

  function handleBack() {
    if (session?.status !== 'completed') {
      Alert.alert('Leave Session?', 'Your session is in progress. Come back from History.', [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => router.back() },
      ]);
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

  const sessionName = useMemo(() => (session?.templateId ? 'Session' : 'Ad-hoc Session'), [session]);

  if (isLoading) {
    return <View style={styles.loadingScreen}><ActivityIndicator size="large" color={T.primary} /></View>;
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

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.headerBack}>
          <Ionicons name="chevron-back" size={22} color={T.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{sessionName}</Text>
        </View>
        {session.status !== 'completed' ? (
          <TouchableOpacity
            style={[styles.finishBtn, (doneCount === 0 || completeSession.isPending) && { opacity: 0.4 }]}
            onPress={handleFinish}
            disabled={doneCount === 0 || completeSession.isPending}
          >
            {completeSession.isPending
              ? <ActivityIndicator size="small" color={T.onPrimary} />
              : <Text style={styles.finishBtnText}>Finish</Text>}
          </TouchableOpacity>
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

        {session.entries.map((entry) => {
          if (entry.kind === 'exercise') {
            return (
              <StrengthEntryCard
                key={entry.id}
                entry={entry}
                sessionId={session.id}
                onSetCompleted={handleSetCompleted}
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  loadingScreen: { flex: 1, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontFamily: F.ui, fontSize: 15, color: T.danger, textAlign: 'center' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
    gap: 8,
  },
  headerBack: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: F.uiSemi, fontSize: 19, color: T.text, letterSpacing: -0.2 },
  finishBtn: {
    height: 38, paddingHorizontal: 16, backgroundColor: T.primary,
    borderRadius: R.sm, alignItems: 'center', justifyContent: 'center',
  },
  finishBtnText: { fontFamily: F.uiSemi, fontSize: 13, color: T.onPrimary },
  doneBadge: {
    height: 38, paddingHorizontal: 16, backgroundColor: withAlpha(T.primary, 0.15),
    borderRadius: R.sm, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: withAlpha(T.primary, 0.3),
  },
  doneBadgeText: { fontFamily: F.uiSemi, fontSize: 13, color: T.primary },

  body: { padding: D.pad, gap: D.stack },

  emptyEntries: { alignItems: 'center', paddingVertical: 48 },
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
  typeChip: {
    width: 28, height: 28, borderRadius: R.chip, borderWidth: 1,
    backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center',
    borderColor: T.borderStrong,
  },
  typeChipText: { fontFamily: F.uiBold, fontSize: 11 },
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
  addSetText: { fontFamily: F.uiSemi, fontSize: 13, color: T.textDim },

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
  pickRow: { paddingHorizontal: 16, paddingVertical: 14 },
  pickName: { fontFamily: F.uiMed, fontSize: 16, color: T.text },
  pickMeta: { fontFamily: F.uiMed, fontSize: 13, color: T.textDim, marginTop: 2 },
  separator: { height: 1, backgroundColor: T.border, marginLeft: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  emptyText: { fontFamily: F.uiMed, fontSize: 15, color: T.muted },
});
