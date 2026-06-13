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
import type { Discipline, DisciplineCat } from '@app/shared';
import {
  useCreateDiscipline,
  useDeleteDiscipline,
  useDisciplines,
} from '../../../src/hooks/useDisciplines';
import { useCurrentUser } from '../../../src/hooks/useAuth';

const CATEGORY_OPTIONS: { label: string; value: DisciplineCat }[] = [
  { label: 'Grappling', value: 'grappling' },
  { label: 'Striking', value: 'striking' },
  { label: 'Mixed', value: 'mixed' },
];

const CATEGORY_BADGE_COLOR: Record<DisciplineCat, string> = {
  grappling: '#7c3aed',
  striking: '#dc2626',
  mixed: '#d97706',
};

function CategoryBadge({ category }: { category: DisciplineCat }) {
  return (
    <View style={[styles.badge, { backgroundColor: CATEGORY_BADGE_COLOR[category] }]}>
      <Text style={styles.badgeText}>{category}</Text>
    </View>
  );
}

interface DisciplineRowProps {
  discipline: Discipline;
  isOwned: boolean;
  onDelete: (id: string) => void;
}

function DisciplineRow({ discipline, isOwned, onDelete }: DisciplineRowProps) {
  function handleDelete() {
    Alert.alert(
      'Delete discipline',
      `Remove "${discipline.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDelete(discipline.id),
        },
      ],
    );
  }

  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowName}>{discipline.name}</Text>
        <CategoryBadge category={discipline.category} />
      </View>
      {isOwned && (
        <TouchableOpacity onPress={handleDelete} style={styles.deleteButton}>
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

interface AddDisciplineModalProps {
  visible: boolean;
  onClose: () => void;
}

function AddDisciplineModal({ visible, onClose }: AddDisciplineModalProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<DisciplineCat>('grappling');
  const createDiscipline = useCreateDiscipline();

  function reset() {
    setName('');
    setCategory('grappling');
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

    try {
      await createDiscipline.mutateAsync({ name: trimmed, category });
      handleClose();
    } catch (err) {
      Alert.alert('Error', (err as Error).message ?? 'Failed to create discipline.');
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
          <Text style={styles.modalTitle}>Add Discipline</Text>
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
            placeholder="e.g. Brazilian Jiu-Jitsu"
            autoFocus
            returnKeyType="next"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Category *</Text>
          <View style={styles.categoryOptions}>
            {CATEGORY_OPTIONS.map(({ label, value }) => (
              <TouchableOpacity
                key={value}
                style={[
                  styles.categoryButton,
                  category === value && {
                    backgroundColor: CATEGORY_BADGE_COLOR[value],
                    borderColor: CATEGORY_BADGE_COLOR[value],
                  },
                ]}
                onPress={() => setCategory(value)}
              >
                <Text
                  style={[
                    styles.categoryButtonText,
                    category === value && styles.categoryButtonTextActive,
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.submitButton,
            createDiscipline.isPending && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={createDiscipline.isPending}
        >
          {createDiscipline.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>Add Discipline</Text>
          )}
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

export default function DisciplinesScreen() {
  const router = useRouter();
  const { data: currentUser } = useCurrentUser();
  const [showAdd, setShowAdd] = useState(false);

  const { data: disciplines, isLoading, isError, error } = useDisciplines();
  const deleteDiscipline = useDeleteDiscipline();

  function handleDelete(id: string) {
    deleteDiscipline.mutate(id, {
      onError: (err) => {
        Alert.alert('Error', err.message ?? 'Failed to delete discipline.');
      },
    });
  }

  const list = disciplines ?? [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Disciplines</Text>
        <TouchableOpacity onPress={() => setShowAdd(true)} style={styles.addButton}>
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {isLoading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#7c3aed" />
        </View>
      )}

      {isError && (
        <View style={styles.centered}>
          <Text style={styles.errorText}>
            {error?.message ?? 'Failed to load disciplines.'}
          </Text>
        </View>
      )}

      {!isLoading && !isError && (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <DisciplineRow
              discipline={item}
              isOwned={item.userId === currentUser?.id}
              onDelete={handleDelete}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>No disciplines found.</Text>
            </View>
          }
          contentContainerStyle={list.length === 0 ? styles.emptyList : undefined}
        />
      )}

      <AddDisciplineModal visible={showAdd} onClose={() => setShowAdd(false)} />
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
    color: '#7c3aed',
  },
  addButton: {
    minWidth: 52,
    alignItems: 'flex-end',
  },
  addButtonText: {
    fontSize: 16,
    color: '#7c3aed',
    fontWeight: '600',
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
  categoryOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  categoryButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  categoryButtonText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  categoryButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  submitButton: {
    marginTop: 8,
    backgroundColor: '#7c3aed',
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
