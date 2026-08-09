import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useCallback, useState, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { Discipline, DisciplineCat } from '@app/shared';
import {
  useCreateDiscipline,
  useDeleteDiscipline,
  useDisciplines,
} from '../../../src/hooks/useDisciplines';
import { useFightRecords } from '../../../src/hooks/useFights';
import type { FightRecord } from '@app/shared';
import { useCurrentUser } from '../../../src/hooks/useAuth';
import { useProGate } from '../../../src/hooks/useProGate';
import { CutCornerView } from '../../../src/components/CutCornerView';
import { WeekSection } from '../../../src/components/WeekSection';
import { Section, EmptyState, ScreenHeader, Touchable } from '../../../src/components/ui';
import { TYPE } from '../../../src/theme/type';
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

function FightRecordBadge({ record }: { record: FightRecord | undefined }) {
  const { T } = useTheme();
  if (!record || record.wins + record.losses + record.draws === 0) return null;
  return (
    <Text style={{ fontFamily: F.uiMed, fontSize: 11, color: T.textDim }}>
      {record.wins}W–{record.losses}L–{record.draws}D
    </Text>
  );
}

interface DisciplineRowProps {
  discipline: Discipline;
  isOwned: boolean;
  isPro: boolean;
  record: FightRecord | undefined;
  onDelete: (id: string) => void;
  onPress: (id: string, name: string) => void;
}

function DisciplineRow({ discipline, isOwned, isPro, record, onDelete, onPress }: DisciplineRowProps) {
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
    <Touchable
      style={styles.row}
      onPress={() => onPress(discipline.id, discipline.name)}
      feedback="row"
      hasTextChild
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
          {isPro && <FightRecordBadge record={record} />}
        </View>
      </View>
      {isOwned && (
        <Touchable
          onPress={handleDelete}
          style={styles.deleteButton}
          feedback="row"
          hitSlop={8}
          accessibilityLabel={`Delete ${discipline.name}`}
        >
          <Ionicons name="trash-outline" size={15} color={T.danger} />
        </Touchable>
      )}
      <Ionicons name="chevron-forward" size={16} color={T.muted} />
    </Touchable>
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
          <Touchable onPress={handleClose} haptic={false} hasTextChild>
            <Text style={styles.modalCancel}>Cancel</Text>
          </Touchable>
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
                <Touchable
                  key={value}
                  style={[
                    styles.categoryButton,
                    active && { backgroundColor: withAlpha(color, 0.18), borderColor: color },
                  ]}
                  onPress={() => setCategory(value)}
                  feedback="row"
                  hasTextChild
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.categoryButtonText, active && { color }]}>{label}</Text>
                </Touchable>
              );
            })}
          </View>
        </View>

        <Touchable
          style={[styles.submitButton, createDiscipline.isPending && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={createDiscipline.isPending}
          feedback="card"
          accessibilityLabel="Add discipline"
        >
          {createDiscipline.isPending ? (
            <ActivityIndicator color={T.onPrimary} />
          ) : (
            <Text style={styles.submitText}>Add Discipline</Text>
          )}
        </Touchable>
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
  const { isPro, isLoading: gateLoading, showPaywall } = useProGate();
  const [showAdd, setShowAdd] = useState(false);

  const { data: disciplines, isLoading, isError, error, isFetching, refetch } = useDisciplines();
  const { data: fightRecords } = useFightRecords();

  // Parity with the Stats, Journal and Workout tabs — this was the last list
  // screen you couldn't pull to refresh.
  const onRefresh = useCallback(() => { void refetch(); }, [refetch]);
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
    // See exercises/index.tsx — don't enforce a limit on an unresolved gate.
    if (!isPro && !gateLoading && customCount >= FREE_CUSTOM_DISCIPLINE_LIMIT) {
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
    <View style={styles.screen}>
      <ScreenHeader
        title="Martial Arts"
        subtitle={
          list.length > 0
            ? `${list.length} discipline${list.length !== 1 ? 's' : ''}`
            : undefined
        }
        right={
          <Touchable
            style={styles.addBtn}
            onPress={handleAddPress}
            feedback="card"
            accessibilityLabel="Add a discipline"
          >
            <Ionicons name="add" size={20} color={T.onPrimary} />
          </Touchable>
        }
      />

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
            <>
              <View style={styles.headerBlock}>
                {/* Quick Start — mirrors the Workout tab's hero */}
                <Section style={styles.heroCard}>
                  <View style={styles.heroRow}>
                    <View style={styles.heroIconBox}>
                      <Ionicons name="flash" size={18} color={T.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.heroTitle}>Quick start</Text>
                      <Text style={styles.heroSub}>Log rounds and techniques right away</Text>
                    </View>
                  </View>
                  <Touchable
                    onPress={() =>
                      router.push('/sessions/new?kind=martial_arts' as never)
                    }
                    feedback="cta"
                    hasTextChild
                  >
                    <CutCornerView fill={T.primary} style={styles.startBtn}>
                      <Ionicons name="add" size={20} color={T.onPrimary} />
                      <Text style={styles.startBtnText}>Start New Mat Session</Text>
                    </CutCornerView>
                  </Touchable>
                </Section>

                {/* My Week */}
                <WeekSection />
              </View>
              <Touchable
                style={[styles.quickCard, styles.quickCardFirst]}
                onPress={() => router.push('/focuses' as never)}
                feedback="card"
                hasTextChild
              >
                <View style={[styles.quickIconBox, { backgroundColor: withAlpha(T.grappling, 0.14) }]}>
                  <Ionicons name="flag" size={18} color={T.grappling} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.quickTitle}>Training focuses</Text>
                  <Text style={styles.quickSub}>Plan what to work on before you train</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={T.muted} />
              </Touchable>
              <Touchable
                style={styles.quickCard}
                onPress={() => router.push('/library/techniques' as never)}
                feedback="card"
                hasTextChild
              >
                <View style={[styles.quickIconBox, { backgroundColor: withAlpha(T.grappling, 0.14) }]}>
                  <Ionicons name="body-outline" size={18} color={T.grappling} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.quickTitle}>Positions & submissions</Text>
                  <Text style={styles.quickSub}>Manage the chips you tap while logging</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={T.muted} />
              </Touchable>
            </>
          }
          renderItem={({ item }) => (
            <DisciplineRow
              discipline={item}
              isOwned={item.userId === currentUser?.id}
              isPro={isPro}
              record={fightRecords?.get(item.id)}
              onDelete={handleDelete}
              onPress={handlePress}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <EmptyState
              size="screen"
              icon="body-outline"
              title="No disciplines yet."
              action={{ label: 'Add your first discipline', onPress: handleAddPress }}
            />
          }
          contentContainerStyle={[
            list.length === 0 && { flex: 1 },
            { paddingBottom: insets.bottom + 32 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isFetching}
              onRefresh={onRefresh}
              tintColor={T.primary}
              colors={[T.primary]}
            />
          }
        />
      )}

      <AddDisciplineModal visible={showAdd} onClose={() => setShowAdd(false)} />
    </View>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: T.bg },

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

    // Hero block above the row list — same gutter as the Workout tab's body.
    headerBlock: {
      paddingHorizontal: D.pad,
      paddingTop: D.pad,
      paddingBottom: D.stack,
      gap: D.stack,
    },
    // Broadsheet: flat section separated by a rule, matching the Workout tab.
    heroCard: {
      paddingTop: 14,
      paddingBottom: 4,
    },
    heroRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginBottom: 14,
    },
    heroIconBox: {
      width: 32,
      height: 32,
      borderRadius: R.sm,
      backgroundColor: withAlpha(T.primary, 0.14),
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroTitle: { ...TYPE.sectionLabel, color: T.textDim, marginBottom: 2 },
    heroSub: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim },
    startBtn: {
      paddingVertical: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    startBtnText: { fontFamily: F.uiBold, fontSize: 16, color: T.onPrimary },

    // Broadsheet: quick actions are flat rows in the list, not floating cards.
    quickCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: D.pad,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: T.border,
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
    quickCardFirst: { borderTopWidth: 1, borderTopColor: T.border },
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
