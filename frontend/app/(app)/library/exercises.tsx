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
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Clock, Plus, Search, Trash2 } from 'lucide-react-native';
import type { ActivityType, Exercise } from '@app/shared';
import {
  useCreateExercise,
  useDeleteExercise,
  useExercises,
} from '../../../src/hooks/useExercises';
import { useCurrentUser } from '../../../src/hooks/useAuth';
import { T, F, R, D } from '../../../src/theme/colors';
import { withAlpha } from '../../../src/lib/color';

type FilterType = 'all' | 'strength' | 'conditioning';

const TYPE_FILTERS: { label: string; value: FilterType }[] = [
  { label: 'All', value: 'all' },
  { label: 'Strength', value: 'strength' },
  { label: 'Conditioning', value: 'conditioning' },
];

const TYPE_BADGE_BG: Record<Exclude<ActivityType, 'martial_arts'>, string> = {
  strength: withAlpha(T.primary, 0.18),
  conditioning: withAlpha('#10b981', 0.18),
};
const TYPE_BADGE_COLOR: Record<Exclude<ActivityType, 'martial_arts'>, string> = {
  strength: T.primary,
  conditioning: '#10b981',
};

function TypeBadge({ type }: { type: Exclude<ActivityType, 'martial_arts'> }) {
  return (
    <View style={[styles.badge, { backgroundColor: TYPE_BADGE_BG[type] }]}>
      <Text style={[styles.badgeText, { color: TYPE_BADGE_COLOR[type] }]}>{type}</Text>
    </View>
  );
}

interface ExerciseRowProps {
  exercise: Exercise;
  isOwned: boolean;
  onDelete: (id: string) => void;
  onHistory: (id: string, name: string) => void;
}

function ExerciseRow({ exercise, isOwned, onDelete, onHistory }: ExerciseRowProps) {
  function handleDelete() {
    Alert.alert(
      'Delete exercise',
      `Remove "${exercise.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete(exercise.id) },
      ],
    );
  }

  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowName}>{exercise.name}</Text>
        <TypeBadge type={exercise.type} />
      </View>
      <TouchableOpacity
        onPress={() => onHistory(exercise.id, exercise.name)}
        style={styles.historyButton}
        activeOpacity={0.7}
      >
        <Clock size={12} color={T.primary} strokeWidth={2} />
        <Text style={styles.historyText}>History</Text>
      </TouchableOpacity>
      {isOwned && (
        <TouchableOpacity onPress={handleDelete} style={styles.deleteButton} activeOpacity={0.7}>
          <Trash2 size={15} color={T.danger} strokeWidth={1.8} />
        </TouchableOpacity>
      )}
    </View>
  );
}

interface AddExerciseModalProps {
  visible: boolean;
  onClose: () => void;
}

function AddExerciseModal({ visible, onClose }: AddExerciseModalProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<Exclude<ActivityType, 'martial_arts'>>('strength');
  const [restSeconds, setRestSeconds] = useState('');
  const createExercise = useCreateExercise();

  function reset() {
    setName('');
    setType('strength');
    setRestSeconds('');
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Validation', 'Name is required.');
      return;
    }

    const parsedRest = restSeconds.trim() ? parseInt(restSeconds.trim(), 10) : null;
    if (restSeconds.trim() && (isNaN(parsedRest!) || parsedRest! < 0)) {
      Alert.alert('Validation', 'Rest seconds must be a positive number.');
      return;
    }

    try {
      await createExercise.mutateAsync({
        name: trimmed,
        type,
        defaultRestSeconds: parsedRest,
      });
      handleClose();
    } catch (err) {
      Alert.alert('Error', (err as Error).message ?? 'Failed to create exercise.');
    }
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

        <View style={styles.field}>
          <Text style={styles.label}>Name *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Bench Press"
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
                  styles.segmentButton,
                  i === 0 && styles.segmentButtonLeft,
                  i === 1 && styles.segmentButtonRight,
                  type === t && styles.segmentButtonActive,
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

        <View style={styles.field}>
          <Text style={styles.label}>Default Rest (seconds)</Text>
          <TextInput
            style={styles.input}
            value={restSeconds}
            onChangeText={setRestSeconds}
            placeholder="e.g. 90"
            placeholderTextColor={T.muted}
            keyboardType="number-pad"
            returnKeyType="done"
            selectionColor={T.primary}
          />
        </View>

        <TouchableOpacity
          style={[styles.submitButton, createExercise.isPending && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={createExercise.isPending}
          activeOpacity={0.8}
        >
          {createExercise.isPending ? (
            <ActivityIndicator color={T.onPrimary} />
          ) : (
            <Text style={styles.submitText}>Add Exercise</Text>
          )}
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

export default function ExercisesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: currentUser } = useCurrentUser();
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const queryType =
    filterType === 'all' ? undefined : (filterType as Exclude<ActivityType, 'martial_arts'>);

  const { data: exercises, isLoading, isError, error } = useExercises({
    type: queryType,
    search: search.trim() || undefined,
  });

  const deleteExercise = useDeleteExercise();

  function handleDelete(id: string) {
    deleteExercise.mutate(id, {
      onError: (err) => Alert.alert('Error', err.message ?? 'Failed to delete exercise.'),
    });
  }

  function handleHistory(id: string, name: string) {
    router.push({ pathname: '/history/exercise/[id]', params: { id, name } } as never);
  }

  const filtered = exercises ?? [];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ChevronLeft size={22} color={T.text} strokeWidth={2} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Exercises</Text>
          {filtered.length > 0 && (
            <Text style={styles.headerSub}>{filtered.length} exercises</Text>
          )}
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
          <Plus size={18} color={T.onPrimary} strokeWidth={2.4} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <Search size={15} color={T.muted} strokeWidth={2} />
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
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
      >
        {TYPE_FILTERS.map(({ label, value }) => (
          <TouchableOpacity
            key={value}
            style={[styles.filterChip, filterType === value && styles.filterChipActive]}
            onPress={() => setFilterType(value)}
          >
            <Text style={[styles.filterChipText, filterType === value && styles.filterChipTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isLoading && (
        <View style={styles.centered}><ActivityIndicator size="large" color={T.primary} /></View>
      )}

      {isError && (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error?.message ?? 'Failed to load exercises.'}</Text>
        </View>
      )}

      {!isLoading && !isError && (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ExerciseRow
              exercise={item}
              isOwned={item.userId === currentUser?.id}
              onDelete={handleDelete}
              onHistory={handleHistory}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>No exercises found.</Text>
            </View>
          }
          contentContainerStyle={[
            filtered.length === 0 && { flex: 1 },
            { paddingBottom: insets.bottom + 32 },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}

      <AddExerciseModal visible={showAdd} onClose={() => setShowAdd(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: F.uiSemi, fontSize: 19, color: T.text, letterSpacing: -0.2 },
  headerSub: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim, marginTop: 1 },
  addBtn: {
    width: 36, height: 36, borderRadius: R.sm,
    backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center',
  },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: T.surface, borderRadius: R.sm,
    margin: D.pad, paddingHorizontal: 12, paddingVertical: 9,
    borderWidth: 1, borderColor: T.border,
  },
  searchInput: {
    flex: 1, fontFamily: F.uiMed, fontSize: 14, color: T.text,
  },

  filterScroll: { flexGrow: 0 },
  filterRow: { paddingHorizontal: D.pad, gap: 8, paddingBottom: 12 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: R.chip, borderWidth: 1, borderColor: T.border,
    backgroundColor: T.surface,
  },
  filterChipActive: { backgroundColor: T.text, borderColor: T.text },
  filterChipText: { fontFamily: F.uiMed, fontSize: 13, color: T.textDim },
  filterChipTextActive: { color: T.bg },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: D.pad, paddingVertical: 13, gap: 10,
  },
  rowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  rowName: { fontFamily: F.uiMed, fontSize: 15, color: T.text },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: R.sm },
  badgeText: { fontFamily: F.uiBold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 },

  historyButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: R.sm, borderWidth: 1, borderColor: withAlpha(T.primary, 0.35),
  },
  historyText: { fontFamily: F.uiMed, fontSize: 12, color: T.primary },
  deleteButton: {
    width: 32, height: 32, alignItems: 'center', justifyContent: 'center',
    borderRadius: R.sm, backgroundColor: withAlpha(T.danger, 0.1),
  },

  separator: { height: 1, backgroundColor: T.border, marginLeft: D.pad },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  emptyText: { fontFamily: F.uiMed, fontSize: 15, color: T.muted },
  errorText: { fontFamily: F.uiMed, fontSize: 15, color: T.danger, textAlign: 'center', paddingHorizontal: 24 },

  // Modal
  modalContainer: { flex: 1, backgroundColor: T.bg, padding: 24, paddingTop: 32 },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 28,
  },
  modalTitle: { fontFamily: F.uiBold, fontSize: 20, color: T.text },
  modalCancel: { fontFamily: F.uiMed, fontSize: 16, color: T.textDim },
  field: { marginBottom: 20 },
  label: {
    fontFamily: F.uiBold, fontSize: 11, color: T.textDim,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8,
  },
  input: {
    borderWidth: 1, borderColor: T.border,
    borderRadius: R.sm, backgroundColor: T.surface,
    paddingHorizontal: 12, paddingVertical: 11,
    fontFamily: F.uiMed, fontSize: 15, color: T.text,
  },
  segmented: {
    flexDirection: 'row', borderWidth: 1, borderColor: T.border,
    borderRadius: R.sm, overflow: 'hidden',
  },
  segmentButton: { flex: 1, paddingVertical: 11, alignItems: 'center', backgroundColor: T.surface },
  segmentButtonLeft: { borderRightWidth: 1, borderRightColor: T.border },
  segmentButtonRight: {},
  segmentButtonActive: { backgroundColor: T.primary },
  segmentText: { fontFamily: F.uiMed, fontSize: 14, color: T.textDim },
  segmentTextActive: { fontFamily: F.uiBold, color: T.onPrimary },
  submitButton: {
    marginTop: 8, backgroundColor: T.primary,
    borderRadius: R.card, paddingVertical: 14, alignItems: 'center',
  },
  submitButtonDisabled: { opacity: 0.55 },
  submitText: { fontFamily: F.uiBold, fontSize: 16, color: T.onPrimary },
});
