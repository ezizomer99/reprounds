import {
  Alert,
  Modal,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'react-native';
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
import { useCurrentUser } from '../../../src/hooks/useAuth';
import { useProGate } from '../../../src/hooks/useProGate';
import { F, R, D, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { Skeleton } from '../../../src/components/Skeleton';

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


function ExerciseThumbnail({ uri, styles }: { uri: string | null; styles: ReturnType<typeof makeStyles> }) {
  if (uri) {
    return (
      <View style={styles.thumbnailContainer}>
        <Image
          source={{ uri }}
          style={styles.thumbnail}
          resizeMode="contain"
        />
      </View>
    );
  }
  return <View style={[styles.thumbnailContainer, styles.thumbnailPlaceholder]} />;
}

interface ExerciseRowProps {
  exercise: Exercise;
  isOwned: boolean;
  onPress: (id: string) => void;
  onDelete: (id: string) => void;
  styles: ReturnType<typeof makeStyles>;
  T: ThemeColors;
}

function ExerciseRow({ exercise, isOwned, onPress, onDelete, styles }: ExerciseRowProps) {
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

  const meta = exercise.equipment ?? exercise.muscleGroup ?? exercise.category;

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
      <TouchableOpacity
        style={styles.row}
        onPress={() => onPress(exercise.id)}
        activeOpacity={0.7}
      >
        <ExerciseThumbnail uri={exercise.imageUrl} styles={styles} />
        <View style={styles.rowContent}>
          <Text style={styles.rowName} numberOfLines={1}>{exercise.name}</Text>
          {meta ? (
            <Text style={styles.rowMeta} numberOfLines={1}>{meta}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
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
          <TouchableOpacity onPress={handleClose}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </TouchableOpacity>
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
  const { isPro, showPaywall } = useProGate();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const { data: exercises, isLoading, isError, error, refetch, isRefetching } = useExercises({
    search: search.trim() || undefined,
  });

  const deleteExercise = useDeleteExercise();

  const isSearching = search.trim().length > 0;

  const sections = useMemo<ExerciseSection[]>(() => {
    if (!exercises) return [];

    const groups = new Map<string, { title: string; items: Exercise[] }>();
    for (const ex of exercises) {
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
  }, [exercises, expanded, isSearching]);

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

  function handleRowPress(id: string) {
    router.push({ pathname: '/exercises/[id]', params: { id } } as never);
  }

  function handleAddPress() {
    const customCount = (exercises ?? []).filter((e) => e.userId === currentUser?.id).length;
    if (!isPro && customCount >= FREE_CUSTOM_EXERCISE_LIMIT) {
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
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={T.text} />
        </TouchableOpacity>
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
        <TouchableOpacity style={styles.addBtn} onPress={handleAddPress} activeOpacity={0.8}>
          <Ionicons name="add" size={22} color={T.onPrimary} />
        </TouchableOpacity>
      </View>

      {isLoading && (
        <View style={{ paddingTop: 8 }}>
          {Array.from({ length: 3 }).map((_, si) => (
            <View key={si}>
              <View style={styles.skeletonSectionHeader}>
                <Skeleton width={80} height={11} />
              </View>
              {Array.from({ length: 4 }).map((_, ri) => (
                <View key={ri} style={styles.skeletonRow}>
                  <Skeleton width={38} height={38} radius={R.sm} />
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
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error?.message ?? 'Failed to load exercises.'}</Text>
        </View>
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
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => toggleSection(s.key)}
                activeOpacity={0.7}
                disabled={isSearching}
              >
                <Text style={styles.sectionTitle}>{s.title}</Text>
                <Text style={styles.sectionCount}>({s.count})</Text>
                <View style={{ flex: 1 }} />
                <Ionicons
                  name={open ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={T.textDim}
                />
              </TouchableOpacity>
            );
          }}
          renderItem={({ item }) => (
            <ExerciseRow
              exercise={item}
              isOwned={item.userId === currentUser?.id}
              onPress={handleRowPress}
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
      borderBottomWidth: 1,
      borderBottomColor: T.border,
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

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: D.pad,
      paddingVertical: 10,
      gap: 12,
      backgroundColor: T.bg,
    },
    thumbnailContainer: {
      width: 52,
      height: 52,
      borderRadius: R.sm,
      backgroundColor: '#FFFFFF',
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    thumbnail: {
      width: 52,
      height: 52,
    },
    thumbnailPlaceholder: {
      backgroundColor: T.surface2 ?? T.surface,
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

    separator: { height: 1, backgroundColor: T.border, marginLeft: D.pad + 52 + 12 },
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
