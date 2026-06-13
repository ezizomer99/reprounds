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
import type { ActivityType, Exercise } from '@app/shared';
import {
  useCreateExercise,
  useDeleteExercise,
  useExercises,
} from '../../../src/hooks/useExercises';
import { useCurrentUser } from '../../../src/hooks/useAuth';

type FilterType = 'all' | 'strength' | 'conditioning';

const TYPE_FILTERS: { label: string; value: FilterType }[] = [
  { label: 'All', value: 'all' },
  { label: 'Strength', value: 'strength' },
  { label: 'Conditioning', value: 'conditioning' },
];

const TYPE_BADGE_COLOR: Record<Exclude<ActivityType, 'martial_arts'>, string> = {
  strength: '#3b82f6',
  conditioning: '#10b981',
};

function TypeBadge({ type }: { type: Exclude<ActivityType, 'martial_arts'> }) {
  return (
    <View style={[styles.badge, { backgroundColor: TYPE_BADGE_COLOR[type] }]}>
      <Text style={styles.badgeText}>{type}</Text>
    </View>
  );
}

interface ExerciseRowProps {
  exercise: Exercise;
  isOwned: boolean;
  onDelete: (id: string) => void;
}

function ExerciseRow({ exercise, isOwned, onDelete }: ExerciseRowProps) {
  function handleDelete() {
    Alert.alert(
      'Delete exercise',
      `Remove "${exercise.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDelete(exercise.id),
        },
      ],
    );
  }

  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowName}>{exercise.name}</Text>
        <TypeBadge type={exercise.type} />
      </View>
      {isOwned && (
        <TouchableOpacity onPress={handleDelete} style={styles.deleteButton}>
          <Text style={styles.deleteText}>Delete</Text>
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

    const parsedRest = restSeconds.trim()
      ? parseInt(restSeconds.trim(), 10)
      : null;

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
            autoFocus
            returnKeyType="next"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Type *</Text>
          <View style={styles.segmented}>
            {(['strength', 'conditioning'] as const).map((t) => (
              <TouchableOpacity
                key={t}
                style={[
                  styles.segmentButton,
                  type === t && styles.segmentButtonActive,
                ]}
                onPress={() => setType(t)}
              >
                <Text
                  style={[
                    styles.segmentText,
                    type === t && styles.segmentTextActive,
                  ]}
                >
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
            keyboardType="number-pad"
            returnKeyType="done"
          />
        </View>

        <TouchableOpacity
          style={[
            styles.submitButton,
            createExercise.isPending && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={createExercise.isPending}
        >
          {createExercise.isPending ? (
            <ActivityIndicator color="#fff" />
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
  const { data: currentUser } = useCurrentUser();
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const queryType =
    filterType === 'all'
      ? undefined
      : (filterType as Exclude<ActivityType, 'martial_arts'>);

  const { data: exercises, isLoading, isError, error } = useExercises({
    type: queryType,
    search: search.trim() || undefined,
  });

  const deleteExercise = useDeleteExercise();

  function handleDelete(id: string) {
    deleteExercise.mutate(id, {
      onError: (err) => {
        Alert.alert('Error', err.message ?? 'Failed to delete exercise.');
      },
    });
  }

  const filtered = exercises ?? [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Exercises</Text>
        <TouchableOpacity onPress={() => setShowAdd(true)} style={styles.addButton}>
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search exercises..."
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      </View>

      <View style={styles.filterRow}>
        {TYPE_FILTERS.map(({ label, value }) => (
          <TouchableOpacity
            key={value}
            style={[
              styles.filterTab,
              filterType === value && styles.filterTabActive,
            ]}
            onPress={() => setFilterType(value)}
          >
            <Text
              style={[
                styles.filterTabText,
                filterType === value && styles.filterTabTextActive,
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      )}

      {isError && (
        <View style={styles.centered}>
          <Text style={styles.errorText}>
            {error?.message ?? 'Failed to load exercises.'}
          </Text>
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
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>No exercises found.</Text>
            </View>
          }
          contentContainerStyle={filtered.length === 0 ? styles.emptyList : undefined}
        />
      )}

      <AddExerciseModal visible={showAdd} onClose={() => setShowAdd(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
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
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  backButton: {
    minWidth: 52,
  },
  backText: {
    fontSize: 16,
    color: '#3b82f6',
  },
  addButton: {
    minWidth: 52,
    alignItems: 'flex-end',
  },
  addButtonText: {
    fontSize: 16,
    color: '#3b82f6',
    fontWeight: '600',
  },
  searchRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  searchInput: {
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 8,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  filterTabActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  filterTabText: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  filterTabTextActive: {
    color: '#fff',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  deleteButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  deleteText: {
    fontSize: 13,
    color: '#ef4444',
    fontWeight: '500',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e5e7eb',
    marginLeft: 16,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyList: {
    flex: 1,
  },
  emptyText: {
    fontSize: 15,
    color: '#9ca3af',
  },
  errorText: {
    fontSize: 15,
    color: '#ef4444',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  modalCancel: {
    fontSize: 16,
    color: '#6b7280',
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
  },
  segmented: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    overflow: 'hidden',
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  segmentButtonActive: {
    backgroundColor: '#3b82f6',
  },
  segmentText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  segmentTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  submitButton: {
    marginTop: 8,
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
