import {
  Alert,
  Modal,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useState, useMemo, useRef } from 'react';
import { Swipeable, RectButton } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { Exercise } from '@app/shared';
import { FREE_CUSTOM_EXERCISE_LIMIT } from '@app/shared';
import {
  useDeleteExercise,
  useExercises,
} from '../../../src/hooks/useExercises';
import { ExerciseForm } from '../../../src/components/ExerciseForm';
import { ExerciseMusclesSheet } from '../../../src/components/ExerciseMusclesSheet';
import { ExerciseFilters, filterByChips, EMPTY_FILTER, type ExerciseChipFilter } from '../../../src/components/ExerciseFilters';
import { useCurrentUser } from '../../../src/hooks/useAuth';
import { useProGate } from '../../../src/hooks/useProGate';
import { Touchable } from '../../../src/components/ui';
import { F, R, D, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { Skeleton } from '../../../src/components/Skeleton';
import { InlineError } from '../../../src/components/InlineError';

const OTHER_KEY = '__other__';

interface ExerciseSection {
  key: string;
  title: string;
  count: number;
  data: Exercise[];
}

function titleForTarget(target: string): string {
  if (target === 'cardiovascular system') return 'Cardio';
  return target.replace(/\b\w/g, (ch) => ch.toUpperCase());
}


/**
 * Row subtitle: equipment first, then every muscle the lift works. The muscles
 * used to be a single fallback behind equipment, so a barbell bench press never
 * showed one at all — and now that an exercise can carry several, seeing them
 * here is the only confirmation a re-tag took without opening anything.
 */
function rowMeta(exercise: Exercise): string | null {
  const muscles = [exercise.muscleGroup, ...(exercise.secondaryMuscles ?? [])].filter(Boolean);
  const parts = [exercise.equipment, muscles.join(', ') || null, exercise.category];
  return parts.filter(Boolean).slice(0, 2).join(' · ') || null;
}

interface ExerciseRowProps {
  exercise: Exercise;
  isOwned: boolean;
  onPress: (exercise: Exercise) => void;
  onEditMuscles: (exercise: Exercise) => void;
  onDelete: (id: string) => void;
  styles: ReturnType<typeof makeStyles>;
  T: ThemeColors;
}

function ExerciseRow({ exercise, isOwned, onPress, onEditMuscles, onDelete, styles, T }: ExerciseRowProps) {
  const swipeableRef = useRef<Swipeable>(null);

  function handleDelete() {
    swipeableRef.current?.close();
    Alert.alert(
      'Delete exercise',
      `Remove "${exercise.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete(exercise.id) },
      ],
    );
  }

  const meta = rowMeta(exercise);

  const renderRightActions = () => (
    <RectButton style={styles.swipeDelete} onPress={handleDelete}>
      <Ionicons name="trash-outline" size={18} color="#fff" />
    </RectButton>
  );

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={isOwned ? renderRightActions : undefined}
      rightThreshold={40}
      overshootRight={false}
    >
      <View style={styles.rowOuter}>
        <Touchable
          style={styles.row}
          onPress={() => onPress(exercise)}
          feedback="row"
          hasTextChild
        >
          <View style={styles.rowContent}>
            <Text style={styles.rowName} numberOfLines={1}>{exercise.name}</Text>
            {meta ? (
              <Text style={styles.rowMeta} numberOfLines={1}>{meta}</Text>
            ) : null}
          </View>
        </Touchable>
        {/* The exercise detail screen is entirely Pro-gated, so the muscle
            editor can't live behind a row tap — it gets its own control. */}
        <Touchable
          style={styles.rowMuscleBtn}
          onPress={() => onEditMuscles(exercise)}
          accessibilityLabel={`Edit muscles for ${exercise.name}`}
        >
          <Ionicons name="body-outline" size={18} color={T.muted} />
        </Touchable>
      </View>
    </Swipeable>
  );
}

interface AddExerciseModalProps {
  visible: boolean;
  onClose: () => void;
}

function AddExerciseModal({ visible, onClose }: AddExerciseModalProps) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const [formKey, setFormKey] = useState(0);

  function handleClose() {
    setFormKey((k) => k + 1);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <ScrollView
        style={{ flex: 1, backgroundColor: T.bg }}
        contentContainerStyle={styles.modalContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Add Exercise</Text>
          <Touchable onPress={handleClose} hasTextChild>
            <Text style={styles.modalCancel}>Cancel</Text>
          </Touchable>
        </View>
        <ExerciseForm
          key={formKey}
          submitLabel="Add Exercise"
          onCreated={() => handleClose()}
        />
      </ScrollView>
    </Modal>
  );
}

export default function ExercisesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { data: currentUser } = useCurrentUser();
  const { isPro, isLoading: gateLoading, showPaywall } = useProGate();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ExerciseChipFilter>(EMPTY_FILTER);
  const [showAdd, setShowAdd] = useState(false);
  const [muscleTarget, setMuscleTarget] = useState<Exercise | null>(null);

  const { data: exercises, isLoading, isError, refetch, isRefetching } = useExercises({
    search: search.trim() || undefined,
  });

  const deleteExercise = useDeleteExercise();

  const filterActive = filter.equipment !== null || filter.muscle !== null;
  const isSearching = search.trim().length > 0 || filterActive;

  const filtered = useMemo(
    () => (exercises ? filterByChips(exercises, filter) : []),
    [exercises, filter],
  );

  const sections = useMemo<ExerciseSection[]>(() => {
    if (!exercises) return [];

    const groups = new Map<string, { title: string; items: Exercise[] }>();
    for (const ex of filtered) {
      const groupKey = (ex.target ?? ex.muscleGroup ?? ex.bodyPart)?.toLowerCase() ?? null;
      const key = groupKey ?? OTHER_KEY;
      const title = groupKey ? titleForTarget(groupKey) : 'Other';
      let g = groups.get(key);
      if (!g) {
        g = { title, items: [] };
        groups.set(key, g);
      }
      g.items.push(ex);
    }

    const built: ExerciseSection[] = [...groups.entries()].map(([key, g]) => ({
      key,
      title: g.title,
      count: g.items.length,
      data: expanded.has(key) || isSearching ? g.items : [],
    }));

    built.sort((a, b) => {
      if (a.key === OTHER_KEY) return 1;
      if (b.key === OTHER_KEY) return -1;
      return a.title.localeCompare(b.title);
    });

    return built;
  }, [exercises, filtered, expanded, isSearching]);

  function toggleSection(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleDelete(id: string) {
    deleteExercise.mutate(id, {
      onError: (err) => Alert.alert('Error', err.message ?? 'Failed to delete exercise.'),
    });
  }

  function handleRowPress(exercise: Exercise) {
    router.push({
      pathname: '/history/exercise/[id]',
      params: { id: exercise.id, name: exercise.name },
    } as never);
  }

  function handleAddPress() {
    const customCount = (exercises ?? []).filter((e) => e.userId === currentUser?.id).length;
    // Not while the gate is unresolved — a mid-race `false` told paying
    // users they'd hit a limit that doesn't apply to them.
    if (!isPro && !gateLoading && customCount >= FREE_CUSTOM_EXERCISE_LIMIT) {
      Alert.alert(
        'Limit reached',
        `Free accounts can create up to ${FREE_CUSTOM_EXERCISE_LIMIT} custom exercises. Upgrade to RepRounds Pro for unlimited exercises.`,
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Upgrade', onPress: showPaywall },
        ],
      );
      return;
    }
    setShowAdd(true);
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Touchable
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={T.text} />
        </Touchable>
        <Text style={styles.headerTitle}>Exercises</Text>
      </View>

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
        <Touchable style={styles.addBtn} onPress={handleAddPress} feedback="card" accessibilityLabel="Add an exercise">
          <Ionicons name="add" size={22} color={T.onPrimary} />
        </Touchable>
      </View>

      {!isLoading && !isError && exercises && exercises.length > 0 && (
        <View style={styles.filterRow}>
          <ExerciseFilters exercises={exercises} filter={filter} onChange={setFilter} dimensions={['equipment']} />
        </View>
      )}

      {isLoading && (
        <View style={{ paddingTop: 8 }}>
          {Array.from({ length: 3 }).map((_, si) => (
            <View key={si}>
              <View style={styles.skeletonSectionHeader}>
                <Skeleton width={80} height={11} />
              </View>
              {Array.from({ length: 4 }).map((_, ri) => (
                <View key={ri} style={styles.skeletonRow}>
                  <View style={{ flex: 1, gap: 7 }}>
                    <Skeleton width="55%" height={14} />
                    <Skeleton width="33%" height={11} />
                  </View>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}

      {isError && (
        <InlineError
          message="Couldn't load your exercises."
          onRetry={() => { void refetch(); }}
        />
      )}

      {!isLoading && !isError && (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => {
            const s = section as ExerciseSection;
            const open = expanded.has(s.key) || isSearching;
            return (
              <Touchable
                style={styles.sectionHeader}
                onPress={() => toggleSection(s.key)}
                disabled={isSearching}
                feedback="row"
                hasTextChild
              >
                <Text style={styles.sectionTitle}>{s.title}</Text>
                <Text style={styles.sectionCount}>({s.count})</Text>
                <View style={{ flex: 1 }} />
                <Ionicons
                  name={open ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={T.textDim}
                />
              </Touchable>
            );
          }}
          renderItem={({ item }) => (
            <ExerciseRow
              exercise={item}
              isOwned={item.userId === currentUser?.id}
              onPress={handleRowPress}
              onEditMuscles={setMuscleTarget}
              onDelete={handleDelete}
              styles={styles}
              T={T}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>No exercises found.</Text>
            </View>
          }
          contentContainerStyle={[
            sections.length === 0 && { flex: 1 },
            { paddingBottom: insets.bottom + 32 },
          ]}
          showsVerticalScrollIndicator={false}
          onRefresh={() => void refetch()}
          refreshing={isRefetching}
        />
      )}

      <AddExerciseModal visible={showAdd} onClose={() => setShowAdd(false)} />

      <ExerciseMusclesSheet exercise={muscleTarget} onClose={() => setMuscleTarget(null)} />
    </View>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: T.bg },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: D.pad,
      paddingTop: 14,
      paddingBottom: 14,
      borderBottomWidth: 2,
      borderBottomColor: T.text,
    },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
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

    filterRow: { paddingHorizontal: D.pad, paddingTop: 10 },

    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: D.pad,
      paddingVertical: 14,
      backgroundColor: T.surface,
      borderBottomWidth: 1,
      borderBottomColor: T.border,
    },
    sectionTitle: { fontFamily: F.uiBold, fontSize: 16, color: T.text, letterSpacing: -0.2 },
    sectionCount: { fontFamily: F.uiMed, fontSize: 13, color: T.textDim },

    // The row's own background lives on rowOuter so the muscle button sits on
    // the same opaque surface — a Swipeable reveals whatever is behind it.
    rowOuter: { flexDirection: 'row', alignItems: 'center', backgroundColor: T.bg },
    row: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: D.pad,
      paddingVertical: 12,
    },
    rowMuscleBtn: {
      width: 44,
      alignSelf: 'stretch',
      alignItems: 'center',
      justifyContent: 'center',
      paddingRight: 4,
    },
    rowContent: { flex: 1, gap: 3 },
    rowName: { fontFamily: F.uiMed, fontSize: 15, color: T.text },
    rowMeta: { fontFamily: F.ui, fontSize: 12, color: T.textDim },
    swipeDelete: {
      backgroundColor: T.danger,
      justifyContent: 'center',
      alignItems: 'center',
      width: 72,
    },

    separator: { height: 1, backgroundColor: T.border, marginLeft: D.pad },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
    skeletonSectionHeader: { paddingHorizontal: D.pad, paddingVertical: 10 },
    skeletonRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: D.pad, paddingVertical: 12, gap: 12 },
    emptyText: { fontFamily: F.uiMed, fontSize: 15, color: T.muted },
    errorText: {
      fontFamily: F.uiMed,
      fontSize: 15,
      color: T.danger,
      textAlign: 'center',
      paddingHorizontal: 24,
    },

    // Modal
    modalContent: { padding: 24, paddingTop: 32, paddingBottom: 40 },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 28,
    },
    modalTitle: { fontFamily: F.uiBold, fontSize: 20, color: T.text },
    modalCancel: { fontFamily: F.uiMed, fontSize: 16, color: T.textDim },
  });
}
