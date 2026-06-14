import {
  ActivityIndicator,
  Alert,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Dumbbell, GripVertical, Plus, Swords, Trash2, X } from 'lucide-react-native';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
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
import { T, F, R, D } from '../../../src/theme/colors';
import { withAlpha } from '../../../src/lib/color';

interface PendingItem extends CreateTemplateItemRequest {
  _localId: string;
  _displayName: string;
}

type DraggableItem =
  | { kind: 'pending'; item: PendingItem }
  | { kind: 'existing'; item: TemplateItemWithDetails };

function itemKey(d: DraggableItem) {
  return d.kind === 'pending' ? d.item._localId : d.item.id;
}

// ---- Item Row ----

interface ItemRowProps {
  name: string;
  kind: 'exercise' | 'martial_arts';
  drag: () => void;
  isActive: boolean;
  onRemove: () => void;
}

function ItemRow({ name, kind, drag, isActive, onRemove }: ItemRowProps) {
  return (
    <View style={[styles.itemRow, isActive && styles.itemRowActive]}>
      <TouchableOpacity onLongPress={drag} delayLongPress={150} style={styles.gripHandle}>
        <GripVertical size={16} color={T.muted} strokeWidth={1.8} />
      </TouchableOpacity>
      <View style={[styles.kindBadge, kind === 'martial_arts' && styles.kindBadgeMat]}>
        {kind === 'martial_arts' ? (
          <Swords size={13} color="#a78bfa" strokeWidth={1.8} />
        ) : (
          <Dumbbell size={13} color={T.textDim} strokeWidth={1.8} />
        )}
      </View>
      <Text style={styles.itemName} numberOfLines={1}>{name}</Text>
      <TouchableOpacity onPress={onRemove} style={styles.removeButton} activeOpacity={0.7}>
        <X size={14} color={T.danger} strokeWidth={2.5} />
      </TouchableOpacity>
    </View>
  );
}

// ---- Pick Exercise Modal ----

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
          <DraggableFlatList
            data={exercises ?? []}
            keyExtractor={(item) => item.id}
            onDragEnd={() => {}}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.pickRow}
                onPress={() => { onPick(item); handleClose(); }}
                activeOpacity={0.7}
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

// ---- Pick Discipline Modal ----

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
            <ActivityIndicator size="large" color={T.primary} />
          </View>
        ) : (
          <DraggableFlatList
            data={disciplines ?? []}
            keyExtractor={(item) => item.id}
            onDragEnd={() => {}}
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

export default function TemplateEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
    } else if (existingTemplate) {
      addItem.mutate(
        { templateId: existingTemplate.id, kind: 'exercise', exerciseId: exercise.id },
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
    } else if (existingTemplate) {
      addItem.mutate(
        { templateId: existingTemplate.id, kind: 'martial_arts', disciplineId: discipline.id },
        { onError: (err) => Alert.alert('Error', err.message ?? 'Failed to add discipline.') },
      );
    }
  }

  // Draggable items list (new templates only — existing items don't support reorder without API)
  const draggableItems: DraggableItem[] = isNew
    ? pendingItems.map((item) => ({ kind: 'pending', item }))
    : (existingTemplate?.items ?? []).map((item) => ({ kind: 'existing', item }));

  function renderDraggableItem({ item: d, drag, isActive }: RenderItemParams<DraggableItem>) {
    const name = d.kind === 'pending' ? d.item._displayName : (d.item.exerciseName ?? d.item.disciplineName ?? 'Unknown');
    const kind = d.kind === 'pending' ? d.item.kind : d.item.kind;

    function handleRemove() {
      if (d.kind === 'pending') {
        setPendingItems((prev) => prev.filter((i) => i._localId !== d.item._localId));
      } else if (existingTemplate) {
        removeItem.mutate(
          { templateId: existingTemplate.id, itemId: d.item.id },
          { onError: (err) => Alert.alert('Error', err.message ?? 'Failed to remove item.') },
        );
      }
    }

    return (
      <ScaleDecorator>
        <ItemRow
          name={name}
          kind={kind}
          drag={drag}
          isActive={isActive}
          onRemove={handleRemove}
        />
      </ScaleDecorator>
    );
  }

  const screenTitle = isNew ? 'New Template' : (existingTemplate?.name ?? 'Edit Template');

  if (!isNew && templatesLoading && !initialised) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={T.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ChevronLeft size={22} color={T.text} strokeWidth={2} />
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
          <Text style={styles.sectionHeaderHint}>Hold grip to reorder</Text>
        </View>

        {draggableItems.length > 0 ? (
          <DraggableFlatList
            data={draggableItems}
            keyExtractor={itemKey}
            onDragEnd={({ data }) => {
              if (isNew) {
                setPendingItems(data.filter((d) => d.kind === 'pending').map((d) => (d as { kind: 'pending'; item: PendingItem }).item));
              }
            }}
            renderItem={renderDraggableItem}
            scrollEnabled={false}
          />
        ) : (
          <Text style={styles.emptyItemsText}>
            No items yet. Add exercises or disciplines below.
          </Text>
        )}

        <View style={styles.addItemsRow}>
          <TouchableOpacity
            style={styles.addItemButton}
            onPress={() => setShowExercisePicker(true)}
            activeOpacity={0.7}
          >
            <Plus size={14} color={T.primary} strokeWidth={2.4} />
            <Text style={styles.addItemButtonText}>Add Exercise</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addItemButton}
            onPress={() => setShowDisciplinePicker(true)}
            activeOpacity={0.7}
          >
            <Plus size={14} color={T.primary} strokeWidth={2.4} />
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
    </View>
  );
}

const styles = StyleSheet.create({
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
  itemRowActive: { backgroundColor: T.surface },
  gripHandle: { width: 24, alignItems: 'center' },
  kindBadge: {
    width: 30, height: 30, borderRadius: R.sm,
    backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center',
  },
  kindBadgeMat: { backgroundColor: withAlpha('#a78bfa', 0.12) },
  itemName: { flex: 1, fontFamily: F.uiMed, fontSize: 15, color: T.text },
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: D.pad, paddingVertical: 14,
  },
  pickRowName: { fontFamily: F.uiMed, fontSize: 15, color: T.text },
  pickRowType: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim },
  separator: { height: 1, backgroundColor: T.border, marginLeft: D.pad },
  modalCentered: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  emptyText: { fontFamily: F.uiMed, fontSize: 15, color: T.muted },
});
