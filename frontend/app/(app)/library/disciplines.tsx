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
import { useState, useMemo } from 'react';
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
import { InlineError } from '../../../src/components/InlineError';
import { F, R, D, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { withAlpha } from '../../../src/lib/color';

const CATEGORY_OPTIONS: { label: string; value: DisciplineCat }[] = [
  { label: 'Grappling', value: 'grappling' },
  { label: 'Striking', value: 'striking' },
  { label: 'Mixed', value: 'mixed' },
];

function categoryColor(cat: DisciplineCat, T: ThemeColors): string {
  if (cat === 'grappling') return T.grappling;
  if (cat === 'striking') return T.danger;
  return T.gold;
}

interface DisciplineRowProps {
  discipline: Discipline;
  isOwned: boolean;
  onDelete: (id: string) => void;
}

function DisciplineRow({ discipline, isOwned, onDelete }: DisciplineRowProps) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const catColor = categoryColor(discipline.category, T);

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
    <View style={styles.row}>
      <View style={[styles.iconAvatar, { backgroundColor: withAlpha(catColor, 0.14) }]}>
        <Ionicons name="flash" size={18} color={catColor} />
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowName}>{discipline.name}</Text>
        <Text style={[styles.rowCat, { color: catColor }]}>{discipline.category}</Text>
      </View>
      {isOwned ? (
        <TouchableOpacity onPress={handleDelete} style={styles.deleteButton} activeOpacity={0.7}>
          <Ionicons name="trash-outline" size={15} color={T.danger} />
        </TouchableOpacity>
      ) : (
        <Ionicons name="chevron-forward" size={16} color={T.muted} />
      )}
    </View>
  );
}

interface AddDisciplineModalProps {
  visible: boolean;
  onClose: () => void;
}

function AddDisciplineModal({ visible, onClose }: AddDisciplineModalProps) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
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
              const color = categoryColor(value, T);
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

export default function DisciplinesScreen() {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: currentUser } = useCurrentUser();
  const [showAdd, setShowAdd] = useState(false);

  const { data: disciplines, isLoading, isError, refetch } = useDisciplines();
  const deleteDiscipline = useDeleteDiscipline();

  function handleDelete(id: string) {
    deleteDiscipline.mutate(id, {
      onError: (err) => Alert.alert('Error', err.message ?? 'Failed to delete discipline.'),
    });
  }

  const list = disciplines ?? [];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={T.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Disciplines</Text>
          {list.length > 0 && (
            <Text style={styles.headerSub}>{list.length} discipline{list.length !== 1 ? 's' : ''}</Text>
          )}
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
          <Ionicons name="add" size={18} color={T.onPrimary} />
        </TouchableOpacity>
      </View>

      {isLoading && (
        <View style={styles.centered}><ActivityIndicator size="large" color={T.primary} /></View>
      )}

      {isError && (
        <InlineError
          message="Couldn't load your disciplines."
          onRetry={() => { void refetch(); }}
        />
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

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: T.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 12, paddingVertical: 10,
      borderBottomWidth: 2, borderBottomColor: T.text,
    },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontFamily: F.uiSemi, fontSize: 19, color: T.text, letterSpacing: -0.2 },
    headerSub: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim, marginTop: 1 },
    addBtn: {
      width: 36, height: 36, borderRadius: R.sm,
      backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center',
    },

    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: D.pad, paddingVertical: 13,
    },
    iconAvatar: {
      width: 40, height: 40, borderRadius: R.sm,
      alignItems: 'center', justifyContent: 'center',
    },
    rowContent: { flex: 1 },
    rowName: { fontFamily: F.uiMed, fontSize: 15, color: T.text, marginBottom: 2 },
    rowCat: { fontFamily: F.uiBold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
    deleteButton: {
      width: 32, height: 32, alignItems: 'center', justifyContent: 'center',
      borderRadius: R.sm, backgroundColor: withAlpha(T.danger, 0.1),
    },

    separator: { height: 1, backgroundColor: T.border, marginLeft: D.pad + 40 + 12 },
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
    categoryOptions: { flexDirection: 'row', gap: 8 },
    categoryButton: {
      flex: 1, paddingVertical: 11, alignItems: 'center',
      borderRadius: R.sm, borderWidth: 1, borderColor: T.border,
      backgroundColor: T.surface,
    },
    categoryButtonText: { fontFamily: F.uiMed, fontSize: 14, color: T.textDim },
    submitButton: {
      marginTop: 8, backgroundColor: T.primary,
      borderRadius: R.card, paddingVertical: 14, alignItems: 'center',
    },
    submitButtonDisabled: { opacity: 0.55 },
    submitText: { fontFamily: F.uiBold, fontSize: 16, color: T.onPrimary },
  });
}
