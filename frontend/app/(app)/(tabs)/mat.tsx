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
import type { Discipline, DisciplineCat } from '@app/shared';
import {
  useCreateDiscipline,
  useDeleteDiscipline,
  useDisciplines,
} from '../../../src/hooks/useDisciplines';
import { useCurrentUser } from '../../../src/hooks/useAuth';
import { T, F, R, D } from '../../../src/theme/colors';
import { withAlpha } from '../../../src/lib/color';

const CATEGORY_OPTIONS: { label: string; value: DisciplineCat }[] = [
  { label: 'Grappling', value: 'grappling' },
  { label: 'Striking', value: 'striking' },
  { label: 'Mixed', value: 'mixed' },
];

const CATEGORY_COLOR: Record<DisciplineCat, string> = {
  grappling: '#a78bfa',
  striking: T.danger,
  mixed: T.gold,
};

const CATEGORY_ICON: Record<DisciplineCat, keyof typeof Ionicons.glyphMap> = {
  grappling: 'body-outline',
  striking: 'hand-left-outline',
  mixed: 'flash-outline',
};

const CATEGORY_LABEL: Record<DisciplineCat, string> = {
  grappling: 'Grappling',
  striking: 'Striking',
  mixed: 'Mixed',
};

interface DisciplineRowProps {
  discipline: Discipline;
  isOwned: boolean;
  onDelete: (id: string) => void;
  onPress: (id: string, name: string) => void;
}

function DisciplineRow({ discipline, isOwned, onDelete, onPress }: DisciplineRowProps) {
  const catColor = CATEGORY_COLOR[discipline.category];
  const catIcon = CATEGORY_ICON[discipline.category];

  function handleDelete() {
    Alert.alert(
      'Delete discipline',
      `Remove "${discipline.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete(discipline.id) },
      ],
    );
  }

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onPress(discipline.id, discipline.name)}
      activeOpacity={0.7}
    >
      <View style={[styles.iconAvatar, { backgroundColor: withAlpha(catColor, 0.14) }]}>
        <Ionicons name={catIcon} size={20} color={catColor} />
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowName}>{discipline.name}</Text>
        <Text style={[styles.rowCat, { color: catColor }]}>
          {CATEGORY_LABEL[discipline.category]}
        </Text>
      </View>
      {isOwned && (
        <TouchableOpacity
          onPress={handleDelete}
          style={styles.deleteButton}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="trash-outline" size={15} color={T.danger} />
        </TouchableOpacity>
      )}
      <Ionicons name="chevron-forward" size={16} color={T.muted} />
    </TouchableOpacity>
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
            placeholderTextColor={T.muted}
            autoFocus
            returnKeyType="next"
            selectionColor={T.primary}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Category *</Text>
          <View style={styles.categoryOptions}>
            {CATEGORY_OPTIONS.map(({ label, value }) => {
              const active = category === value;
              const color = CATEGORY_COLOR[value];
              return (
                <TouchableOpacity
                  key={value}
                  style={[
                    styles.categoryButton,
                    active && { backgroundColor: withAlpha(color, 0.18), borderColor: color },
                  ]}
                  onPress={() => setCategory(value)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.categoryButtonText, active && { color }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.submitButton, createDiscipline.isPending && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={createDiscipline.isPending}
          activeOpacity={0.8}
        >
          {createDiscipline.isPending ? (
            <ActivityIndicator color={T.onPrimary} />
          ) : (
            <Text style={styles.submitText}>Add Discipline</Text>
          )}
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

export default function MatTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: currentUser } = useCurrentUser();
  const [showAdd, setShowAdd] = useState(false);

  const { data: disciplines, isLoading, isError, error } = useDisciplines();
  const deleteDiscipline = useDeleteDiscipline();

  function handleDelete(id: string) {
    deleteDiscipline.mutate(id, {
      onError: (err) => Alert.alert('Error', err.message ?? 'Failed to delete discipline.'),
    });
  }

  function handlePress(id: string, name: string) {
    router.push({ pathname: '/discipline/[id]', params: { id, name } } as never);
  }

  const list = disciplines ?? [];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Martial Arts</Text>
          {list.length > 0 && (
            <Text style={styles.headerSub}>
              {list.length} discipline{list.length !== 1 ? 's' : ''}
            </Text>
          )}
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)} activeOpacity={0.8}>
          <Ionicons name="add" size={20} color={T.onPrimary} />
        </TouchableOpacity>
      </View>

      {isLoading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={T.primary} />
        </View>
      )}

      {isError && (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error?.message ?? 'Failed to load disciplines.'}</Text>
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
              onPress={handlePress}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="body-outline" size={40} color={T.muted} />
              <Text style={styles.emptyText}>No disciplines yet.</Text>
              <TouchableOpacity onPress={() => setShowAdd(true)} activeOpacity={0.7}>
                <Text style={styles.emptyLink}>Add your first discipline →</Text>
              </TouchableOpacity>
            </View>
          }
          contentContainerStyle={[
            list.length === 0 && { flex: 1 },
            { paddingBottom: insets.bottom + 32 },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}

      <AddDisciplineModal visible={showAdd} onClose={() => setShowAdd(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: D.pad,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  headerTitle: { fontFamily: F.uiBold, fontSize: 22, color: T.text, letterSpacing: -0.3 },
  headerSub: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim, marginTop: 2 },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: R.sm,
    backgroundColor: T.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: D.pad,
    paddingVertical: 14,
  },
  iconAvatar: {
    width: 42,
    height: 42,
    borderRadius: R.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowContent: { flex: 1 },
  rowName: { fontFamily: F.uiSemi, fontSize: 15, color: T.text, marginBottom: 2 },
  rowCat: {
    fontFamily: F.uiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  deleteButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: R.sm,
    backgroundColor: withAlpha(T.danger, 0.1),
  },

  separator: { height: 1, backgroundColor: T.border, marginLeft: D.pad + 42 + 12 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 10,
  },
  emptyText: { fontFamily: F.uiMed, fontSize: 15, color: T.muted },
  emptyLink: { fontFamily: F.uiMed, fontSize: 13, color: T.primary },
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
  categoryOptions: { flexDirection: 'row', gap: 8 },
  categoryButton: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
  },
  categoryButtonText: { fontFamily: F.uiMed, fontSize: 14, color: T.textDim },
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
