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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useMemo } from 'react';
import type {
  CreateTemplateItemRequest,
  Discipline,
  Exercise,
  TemplateItemWithDetails,
} from '@app/shared';
import { useExercises } from '../../../src/hooks/useExercises';
import { useDisciplines } from '../../../src/hooks/useDisciplines';
import {
  useAddTemplateItem,
  useCreateTemplate,
  useRemoveTemplateItem,
  useTemplates,
  useUpdateTemplate,
} from '../../../src/hooks/useTemplates';

interface ItemRowProps {
  name: string;
  kind: 'exercise' | 'martial_arts';
  onRemove: () => void;
}

function ItemRow({ name, kind, onRemove }: ItemRowProps) {
  const badgeColor = kind === 'exercise' ? '#3b82f6' : '#8b5cf6';
  const badgeLabel = kind === 'exercise' ? 'GYM' : 'MA';

  return (
    <View style={styles.itemRow}>
      <View style={[styles.kindBadge, { backgroundColor: badgeColor }]}>
        <Text style={styles.kindBadgeText}>{badgeLabel}</Text>
      </View>
      <Text style={styles.itemName} numberOfLines={1}>
        {name}
      </Text>
      <TouchableOpacity onPress={onRemove} style={styles.removeButton}>
        <Text style={styles.removeText}>Remove</Text>
      </TouchableOpacity>
    </View>
  );
}

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

interface PendingItem extends CreateTemplateItemRequest {
  _localId: string;
  _displayName: string;
}

export default function TemplateEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const isNew = id === 'new';

  const { data: templates, isLoading: templatesLoading } = useTemplates();

  const existingTemplate = useMemo(
    () => (isNew ? undefined : templates?.find((t) => t.id === id)),
    [isNew, templates, id],
  );

  const [name, setName] = useState('');
  const [dayLabel, setDayLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [initialised, setInitialised] = useState(false);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [showDisciplinePicker, setShowDisciplinePicker] = useState(false);

  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const addItem = useAddTemplateItem();
  const removeItem = useRemoveTemplateItem();

  if (!isNew && existingTemplate && !initialised) {
    setName(existingTemplate.name);
    setDayLabel(existingTemplate.dayLabel ?? '');
    setNotes(existingTemplate.notes ?? '');
    setInitialised(true);
  }

  const isSaving = createTemplate.isPending || updateTemplate.isPending;

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Validation', 'Template name is required.');
      return;
    }

    try {
      if (isNew) {
        await createTemplate.mutateAsync({
          name: trimmedName,
          dayLabel: dayLabel.trim() || null,
          notes: notes.trim() || null,
          items: pendingItems.map(({ _localId: _l, _displayName: _d, ...rest }) => rest),
        });
      } else if (existingTemplate) {
        await updateTemplate.mutateAsync({
          id: existingTemplate.id,
          name: trimmedName,
          dayLabel: dayLabel.trim() || null,
          notes: notes.trim() || null,
        });
      }
      router.back();
    } catch (err) {
      Alert.alert('Error', (err as Error).message ?? 'Failed to save template.');
    }
  }

  function handleAddExercise(exercise: Exercise) {
    if (isNew) {
      const item: PendingItem = {
        _localId: `${Date.now()}-${exercise.id}`,
        _displayName: exercise.name,
        kind: 'exercise',
        exerciseId: exercise.id,
        disciplineId: null,
      };
      setPendingItems((prev) => [...prev, item]);
    } else if (existingTemplate) {
      addItem.mutate(
        { templateId: existingTemplate.id, kind: 'exercise', exerciseId: exercise.id },
        {
          onError: (err) => {
            Alert.alert('Error', err.message ?? 'Failed to add exercise.');
          },
        },
      );
    }
  }

  function handleAddDiscipline(discipline: Discipline) {
    if (isNew) {
      const item: PendingItem = {
        _localId: `${Date.now()}-${discipline.id}`,
        _displayName: discipline.name,
        kind: 'martial_arts',
        exerciseId: null,
        disciplineId: discipline.id,
      };
      setPendingItems((prev) => [...prev, item]);
    } else if (existingTemplate) {
      addItem.mutate(
        {
          templateId: existingTemplate.id,
          kind: 'martial_arts',
          disciplineId: discipline.id,
        },
        {
          onError: (err) => {
            Alert.alert('Error', err.message ?? 'Failed to add discipline.');
          },
        },
      );
    }
  }

  function handleRemovePendingItem(localId: string) {
    setPendingItems((prev) => prev.filter((i) => i._localId !== localId));
  }

  function handleRemoveExistingItem(item: TemplateItemWithDetails) {
    if (!existingTemplate) return;
    removeItem.mutate(
      { templateId: existingTemplate.id, itemId: item.id },
      {
        onError: (err) => {
          Alert.alert('Error', err.message ?? 'Failed to remove item.');
        },
      },
    );
  }

  const screenTitle = isNew ? 'New Template' : (existingTemplate?.name ?? 'Edit Template');

  if (!isNew && templatesLoading && !initialised) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  const existingItems: TemplateItemWithDetails[] = existingTemplate?.items ?? [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {screenTitle}
        </Text>
        <TouchableOpacity
          onPress={handleSave}
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <Text style={styles.label}>Name *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Push Day"
            returnKeyType="next"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Day Label</Text>
          <TextInput
            style={styles.input}
            value={dayLabel}
            onChangeText={setDayLabel}
            placeholder="e.g. Monday, Push Day"
            returnKeyType="next"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional notes..."
            multiline
            returnKeyType="default"
          />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>Items</Text>
        </View>

        {isNew
          ? pendingItems.map((item) => (
              <ItemRow
                key={item._localId}
                name={item._displayName}
                kind={item.kind}
                onRemove={() => handleRemovePendingItem(item._localId)}
              />
            ))
          : existingItems.map((item) => (
              <ItemRow
                key={item.id}
                name={item.exerciseName ?? item.disciplineName ?? 'Unknown'}
                kind={item.kind}
                onRemove={() => handleRemoveExistingItem(item)}
              />
            ))}

        {isNew && pendingItems.length === 0 && existingItems.length === 0 && (
          <Text style={styles.emptyItemsText}>No items yet. Add exercises or disciplines below.</Text>
        )}
        {!isNew && existingItems.length === 0 && (
          <Text style={styles.emptyItemsText}>No items yet. Add exercises or disciplines below.</Text>
        )}

        <View style={styles.addItemsRow}>
          <TouchableOpacity
            style={styles.addItemButton}
            onPress={() => setShowExercisePicker(true)}
          >
            <Text style={styles.addItemButtonText}>+ Add Exercise</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addItemButton}
            onPress={() => setShowDisciplinePicker(true)}
          >
            <Text style={styles.addItemButtonText}>+ Add Discipline</Text>
          </TouchableOpacity>
        </View>

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
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  saveButton: {
    minWidth: 52,
    alignItems: 'flex-end',
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 20,
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
    backgroundColor: '#fff',
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 28,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
    marginBottom: 4,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f3f4f6',
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
  itemName: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    fontWeight: '500',
  },
  removeButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  removeText: {
    fontSize: 12,
    color: '#ef4444',
    fontWeight: '500',
  },
  emptyItemsText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    paddingVertical: 20,
    paddingHorizontal: 24,
  },
  addItemsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  addItemButton: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  addItemButtonText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '600',
  },
  bottomSpacer: {
    height: 40,
  },
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
  separator: {
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
