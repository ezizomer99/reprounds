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
import Animated, { FadeInDown } from 'react-native-reanimated';
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
import { fightRecord, useFights } from '../../../src/hooks/useFights';
import { useCurrentUser } from '../../../src/hooks/useAuth';
import { useProGate } from '../../../src/hooks/useProGate';
import { F, R, D, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { withAlpha } from '../../../src/lib/color';

const FREE_CUSTOM_DISCIPLINE_LIMIT = 1;

const CATEGORY_OPTIONS: { label: string; value: DisciplineCat }[] = [
  { label: 'Grappling', value: 'grappling' },
  { label: 'Striking', value: 'striking' },
  { label: 'Mixed', value: 'mixed' },
];

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

function categoryColor(cat: DisciplineCat, T: ThemeColors): string {
  if (cat === 'grappling') return T.grappling;
  if (cat === 'striking') return T.danger;
  return T.gold;
}

function FightRecordBadge({ disciplineId }: { disciplineId: string }) {
  const { T } = useTheme();
  const { data: fights } = useFights(disciplineId);
  if (!fights || fights.length === 0) return null;
  const { wins, losses, draws } = fightRecord(fights);
  return (
    <Text style={{ fontFamily: F.uiMed, fontSize: 11, color: T.textDim }}>
      {wins}W–{losses}L–{draws}D
    </Text>
  );
}

interface DisciplineRowProps {
  discipline: Discipline;
  isOwned: boolean;
  isPro: boolean;
  onDelete: (id: string) => void;
  onPress: (id: string, name: string) => void;
}

function DisciplineRow({ discipline, isOwned, isPro, onDelete, onPress }: DisciplineRowProps) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const catColor = categoryColor(discipline.category, T);
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[styles.rowCat, { color: catColor }]}>
            {CATEGORY_LABEL[discipline.category]}
          </Text>
          {isPro && <FightRecordBadge disciplineId={discipline.id} />}
        </View>
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

export default function MatTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { data: currentUser } = useCurrentUser();
  const { isPro, showPaywall } = useProGate();
  const [showAdd, setShowAdd] = useState(false);

  const { data: disciplines, isLoading, isError, error } = useDisciplines();
  const deleteDiscipline = useDeleteDiscipline();

  function handleDelete(id: string) {
    deleteDiscipline.mutate(id, {
      onError: (err) => Alert.alert('Error', err.message ?? 'Failed to delete discipline.'),
    });
  }

  function handlePress(id: string, name: string) {
    if (!isPro) { showPaywall(); return; }
    router.push({ pathname: '/discipline/[id]', params: { id, name } } as never);
  }

  function handleAddPress() {
    const customCount = (disciplines ?? []).filter((d) => d.userId === currentUser?.id).length;
    if (!isPro && customCount >= FREE_CUSTOM_DISCIPLINE_LIMIT) {
      Alert.alert(
        'Limit reached',
        `Free accounts can create up to ${FREE_CUSTOM_DISCIPLINE_LIMIT} custom discipline. Upgrade to RepRounds Pro for unlimited disciplines.`,
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Upgrade', onPress: showPaywall },
        ],
      );
      return;
    }
    setShowAdd(true);
  }

  const list = disciplines ?? [];

  return (
    <Animated.View style={styles.screen} entering={FadeInDown.duration(280).springify()}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Martial Arts</Text>
          {list.length > 0 && (
            <Text style={styles.headerSub}>
              {list.length} discipline{list.length !== 1 ? 's' : ''}
            </Text>
          )}
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={handleAddPress} activeOpacity={0.8}>
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
          ListHeaderComponent={
            <TouchableOpacity
              style={styles.quickCard}
              onPress={() => router.push('/sessions/new' as never)}
              activeOpacity={0.8}
            >
              <View style={styles.quickIconBox}>
                <Ionicons name="flash" size={18} color={T.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.quickTitle}>Quick mat session</Text>
                <Text style={styles.quickSub}>Log rounds and techniques right away</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={T.muted} />
            </TouchableOpacity>
          }
          renderItem={({ item }) => (
            <DisciplineRow
              discipline={item}
              isOwned={item.userId === currentUser?.id}
              isPro={isPro}
              onDelete={handleDelete}
              onPress={handlePress}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="body-outline" size={40} color={T.muted} />
              <Text style={styles.emptyText}>No disciplines yet.</Text>
              <TouchableOpacity onPress={handleAddPress} activeOpacity={0.7}>
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
    </Animated.View>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
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

    quickCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      margin: D.pad,
      marginBottom: 0,
      padding: D.cardPad,
      backgroundColor: T.surface,
      borderWidth: 1,
      borderColor: T.border,
      borderRadius: R.card,
    },
    quickIconBox: {
      width: 38,
      height: 38,
      borderRadius: R.sm,
      backgroundColor: withAlpha(T.primary, 0.12),
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    quickTitle: { fontFamily: F.uiSemi, fontSize: 15, color: T.text, marginBottom: 2 },
    quickSub: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim },

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
}
