import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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
        <Ionicons name="time-outline" size={12} color={T.primary} />
        <Text style={styles.historyText}>History</Text>
      </TouchableOpacity>
      {isOwned && (
        <TouchableOpacity onPress={handleDelete} style={styles.deleteButton} activeOpacity={0.7}>
          <Ionicons name="trash-outline" size={15} color={T.danger} />
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

export default function ExercisesTab() {
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
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Exercises</Text>
      </View>

      {/* Search + Add */}
      <View style={styles.searchRow}>
        <Ionicons name="search" size={15} color={T.muted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search exercises…"
          placeholderTextColor={T.muted}
          returnKeyType="search"
          selectionColor={T.primary}
        />
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)} activeOpacity={0.8}>
          <Ionicons name="add" size={22} color={T.onPrimary} />
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterTabsRow}>
        {TYPE_FILTERS.map(({ label, value }) => (
          <TouchableOpacity
            key={value}
            style={[styles.filterTab, filterType === value && styles.filterTabActive]}
            onPress={() => setFilterType(value)}
          >
            <Text style={[styles.filterTabText, filterType === value && styles.filterTabTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={T.primary} />
        </View>
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
    paddingHorizontal: D.pad,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  headerTitle: { fontFamily: F.uiBold, fontSize: 22, color: T.text, letterSpacing: -0.3 },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: T.surface,
    margin: D.pad,
    marginBottom: 0,
    borderRadius: R.sm,
    paddingLeft: 12,
    borderWidth: 1,
    borderColor: T.border,
    overflow: 'hidden',
  },
  searchInput: {
    flex: 1,
    fontFamily: F.uiMed,
    fontSize: 14,
    color: T.text,
    paddingVertical: 10,
  },
  addBtn: {
    width: 44,
    height: 44,
    backgroundColor: T.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  filterTabsRow: {
    flexDirection: 'row',
    backgroundColor: T.surface,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
    marginTop: D.pad,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 13,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  filterTabActive: { borderBottomColor: T.primary },
  filterTabText: { fontFamily: F.uiMed, fontSize: 14, color: T.textDim },
  filterTabTextActive: { fontFamily: F.uiBold, color: T.text },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: D.pad,
    paddingVertical: 13,
    gap: 10,
  },
  rowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  rowName: { fontFamily: F.uiMed, fontSize: 15, color: T.text },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: R.sm },
  badgeText: {
    fontFamily: F.uiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: withAlpha(T.primary, 0.35),
  },
  historyText: { fontFamily: F.uiMed, fontSize: 12, color: T.primary },
  deleteButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: R.sm,
    backgroundColor: withAlpha(T.danger, 0.1),
  },

  separator: { height: 1, backgroundColor: T.border, marginLeft: D.pad },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  emptyText: { fontFamily: F.uiMed, fontSize: 15, color: T.muted },
  errorText: {
    fontFamily: F.uiMed,
    fontSize: 15,
    color: T.danger,
    textAlign: 'center',
    paddingHorizontal: 24,
  },

  // Modal
  modalContainer: { flex: 1, backgroundColor: T.bg, padding: 24, paddingTop: 32 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
  },
  modalTitle: { fontFamily: F.uiBold, fontSize: 20, color: T.text },
  modalCancel: { fontFamily: F.uiMed, fontSize: 16, color: T.textDim },
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
  segmentButton: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: T.surface,
  },
  segmentButtonLeft: { borderRightWidth: 1, borderRightColor: T.border },
  segmentButtonRight: {},
  segmentButtonActive: { backgroundColor: T.primary },
  segmentText: { fontFamily: F.uiMed, fontSize: 14, color: T.textDim },
  segmentTextActive: { fontFamily: F.uiBold, color: T.onPrimary },
  submitButton: {
    marginTop: 8,
    backgroundColor: T.primary,
    borderRadius: R.card,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitButtonDisabled: { opacity: 0.55 },
  submitText: { fontFamily: F.uiBold, fontSize: 16, color: T.onPrimary },
});
