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
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { Discipline, DisciplineCat, FocusStatus, FocusWithStats } from '@app/shared';
import { useDisciplines } from '../../../src/hooks/useDisciplines';
import {
  useCreateFocus,
  useDeleteFocus,
  useFocuses,
  useUpdateFocus,
} from '../../../src/hooks/useFocuses';
import { useProGate } from '../../../src/hooks/useProGate';
import { F, R, D, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { withAlpha } from '../../../src/lib/color';

const FREE_FOCUS_LIMIT = 3;

const STATUS_FILTERS: { label: string; value: FocusStatus }[] = [
  { label: 'Active', value: 'active' },
  { label: 'Achieved', value: 'achieved' },
  { label: 'Archived', value: 'archived' },
];

function categoryColor(cat: DisciplineCat, T: ThemeColors): string {
  if (cat === 'grappling') return T.grappling;
  if (cat === 'striking') return T.danger;
  return T.gold;
}

function formatDate(iso: string): string {
  // iso is YYYY-MM-DD; render as e.g. "8 Jul" without timezone drift.
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// ─── Add / edit focus modal ───────────────────────────────────────────────────

function FocusFormModal({ visible, onClose, editing }: {
  visible: boolean;
  onClose: () => void;
  editing: FocusWithStats | null;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { data: disciplines } = useDisciplines();
  const createFocus = useCreateFocus();
  const updateFocus = useUpdateFocus();

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [disciplineId, setDisciplineId] = useState<string | null>(null);
  // Re-seed the form each time the modal opens for a (possibly different) focus.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const seedKey = editing?.id ?? 'new';
  if (visible && seededFor !== seedKey) {
    setTitle(editing?.title ?? '');
    setNotes(editing?.notes ?? '');
    setDisciplineId(editing?.disciplineId ?? null);
    setSeededFor(seedKey);
  }

  const pending = createFocus.isPending || updateFocus.isPending;

  function handleClose() {
    setSeededFor(null);
    onClose();
  }

  async function handleSubmit() {
    const trimmed = title.trim();
    if (!trimmed) {
      Alert.alert('Validation', 'Give your focus a title.');
      return;
    }
    try {
      if (editing) {
        await updateFocus.mutateAsync({
          id: editing.id,
          title: trimmed,
          notes: notes.trim() || null,
          disciplineId,
        });
      } else {
        await createFocus.mutateAsync({
          title: trimmed,
          notes: notes.trim() || null,
          disciplineId,
        });
      }
      handleClose();
    } catch (err) {
      Alert.alert('Error', (err as Error).message ?? 'Failed to save focus.');
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <ScrollView
        style={styles.modalContainer}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{editing ? 'Edit Focus' : 'New Focus'}</Text>
          <TouchableOpacity onPress={handleClose}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>What do you want to work on? *</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Maintain guard, better strangle finishes"
            placeholderTextColor={T.muted}
            autoFocus={!editing}
            returnKeyType="next"
            selectionColor={T.primary}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Details, drills, or reminders…"
            placeholderTextColor={T.muted}
            multiline
            textAlignVertical="top"
            selectionColor={T.primary}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Discipline (optional)</Text>
          <View style={styles.chipWrap}>
            <TouchableOpacity
              style={[styles.chip, disciplineId === null && styles.chipActive]}
              onPress={() => setDisciplineId(null)}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, disciplineId === null && styles.chipTextActive]}>
                All disciplines
              </Text>
            </TouchableOpacity>
            {(disciplines ?? []).map((d) => {
              const active = disciplineId === d.id;
              const color = categoryColor(d.category, T);
              return (
                <TouchableOpacity
                  key={d.id}
                  style={[
                    styles.chip,
                    active && { backgroundColor: withAlpha(color, 0.18), borderColor: color },
                  ]}
                  onPress={() => setDisciplineId(d.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, active && { color }]}>{d.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.submitButton, pending && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={pending}
          activeOpacity={0.8}
        >
          {pending ? (
            <ActivityIndicator color={T.onPrimary} />
          ) : (
            <Text style={styles.submitText}>{editing ? 'Save Focus' : 'Add Focus'}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </Modal>
  );
}

// ─── Focus row ────────────────────────────────────────────────────────────────

function FocusRow({ focus, disciplines, onEdit, onSetStatus, onDelete }: {
  focus: FocusWithStats;
  disciplines: Discipline[];
  onEdit: (f: FocusWithStats) => void;
  onSetStatus: (f: FocusWithStats, status: FocusStatus) => void;
  onDelete: (f: FocusWithStats) => void;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const discipline = disciplines.find((d) => d.id === focus.disciplineId);
  const tagColor = discipline ? categoryColor(discipline.category, T) : T.textDim;

  function handleMenu() {
    const options: Parameters<typeof Alert.alert>[2] = [];
    if (focus.status !== 'active') {
      options.push({ text: 'Mark Active', onPress: () => onSetStatus(focus, 'active') });
    }
    if (focus.status !== 'achieved') {
      options.push({ text: 'Mark Achieved', onPress: () => onSetStatus(focus, 'achieved') });
    }
    if (focus.status !== 'archived') {
      options.push({ text: 'Archive', onPress: () => onSetStatus(focus, 'archived') });
    }
    options.push({ text: 'Delete', style: 'destructive', onPress: () => onDelete(focus) });
    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(focus.title, undefined, options);
  }

  const worked = focus.sessionCount === 0
    ? 'Not worked yet'
    : `${focus.sessionCount} session${focus.sessionCount === 1 ? '' : 's'}` +
      (focus.lastWorkedDate ? ` · last ${formatDate(focus.lastWorkedDate)}` : '');
  const meta = discipline ? `${discipline.name} · ${worked}` : worked;

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onEdit(focus)}
      onLongPress={handleMenu}
      activeOpacity={0.7}
    >
      <View style={[styles.rowAvatar, { backgroundColor: withAlpha(tagColor, 0.14) }]}>
        <Ionicons name="flag" size={18} color={tagColor} />
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowTitle} numberOfLines={2}>{focus.title}</Text>
        <Text style={styles.rowMeta} numberOfLines={1}>{meta}</Text>
      </View>
      <TouchableOpacity
        onPress={handleMenu}
        style={styles.menuButton}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="ellipsis-vertical" size={16} color={T.muted} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function FocusesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { isPro, showPaywall } = useProGate();

  const [statusFilter, setStatusFilter] = useState<FocusStatus>('active');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FocusWithStats | null>(null);

  const { data: focuses, isLoading, isError, error } = useFocuses(statusFilter);
  const { data: disciplines } = useDisciplines();
  const updateFocus = useUpdateFocus();
  const deleteFocus = useDeleteFocus();

  const list = focuses ?? [];

  function handleAddPress() {
    // Gate on the number of active focuses so the paywall doesn't block editing
    // or archiving existing ones.
    const activeCount = statusFilter === 'active' ? list.length : 0;
    if (!isPro && statusFilter === 'active' && activeCount >= FREE_FOCUS_LIMIT) {
      Alert.alert(
        'Limit reached',
        `Free accounts can keep up to ${FREE_FOCUS_LIMIT} active focuses. Upgrade to RepRounds Pro for unlimited focuses.`,
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Upgrade', onPress: showPaywall },
        ],
      );
      return;
    }
    setEditing(null);
    setShowForm(true);
  }

  function handleEdit(focus: FocusWithStats) {
    setEditing(focus);
    setShowForm(true);
  }

  function handleSetStatus(focus: FocusWithStats, status: FocusStatus) {
    updateFocus.mutate(
      { id: focus.id, status },
      { onError: (err) => Alert.alert('Error', err.message ?? 'Failed to update focus.') },
    );
  }

  function handleDelete(focus: FocusWithStats) {
    Alert.alert('Delete focus', `Remove "${focus.title}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          deleteFocus.mutate(focus.id, {
            onError: (err) => Alert.alert('Error', err.message ?? 'Failed to delete focus.'),
          }),
      },
    ]);
  }

  return (
    <Animated.View style={styles.screen} entering={FadeInDown.duration(280).springify()}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={T.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Training Focuses</Text>
          <Text style={styles.headerSub}>What you're working on, session to session</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={handleAddPress} activeOpacity={0.8}>
          <Ionicons name="add" size={20} color={T.onPrimary} />
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        {STATUS_FILTERS.map(({ label, value }) => {
          const active = statusFilter === value;
          return (
            <TouchableOpacity
              key={value}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setStatusFilter(value)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={T.primary} />
        </View>
      )}

      {isError && (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error?.message ?? 'Failed to load focuses.'}</Text>
        </View>
      )}

      {!isLoading && !isError && (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <FocusRow
              focus={item}
              disciplines={disciplines ?? []}
              onEdit={handleEdit}
              onSetStatus={handleSetStatus}
              onDelete={handleDelete}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListHeaderComponent={
            statusFilter === 'active' ? (
              <View style={styles.heroWrap}>
                <TouchableOpacity style={styles.heroCta} onPress={handleAddPress} activeOpacity={0.85}>
                  <Ionicons name="add" size={20} color={T.onPrimary} />
                  <View>
                    <Text style={styles.heroCtaTitle}>New focus</Text>
                    <Text style={styles.heroCtaSub}>What you want to work on</Text>
                  </View>
                </TouchableOpacity>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={statusFilter === 'active' ? styles.emptyUnderHero : styles.centered}>
              <Ionicons name="flag-outline" size={40} color={T.muted} />
              <Text style={styles.emptyText}>
                {statusFilter === 'active'
                  ? 'No active focuses yet — add one above to get started.'
                  : `No ${statusFilter} focuses.`}
              </Text>
            </View>
          }
          contentContainerStyle={[
            list.length === 0 && statusFilter !== 'active' && { flex: 1 },
            { paddingBottom: insets.bottom + 32 },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}

      <FocusFormModal visible={showForm} editing={editing} onClose={() => setShowForm(false)} />
    </Animated.View>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: T.bg },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: D.pad,
      paddingTop: 14,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: T.border,
    },
    backBtn: { paddingRight: 2 },
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

    filterRow: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: D.pad,
      paddingVertical: 12,
    },
    filterChip: {
      paddingVertical: 7,
      paddingHorizontal: 14,
      borderRadius: R.chip,
      borderWidth: 1,
      borderColor: T.border,
      backgroundColor: T.surface,
    },
    filterChipActive: { backgroundColor: withAlpha(T.primary, 0.16), borderColor: T.primary },
    filterChipText: { fontFamily: F.uiMed, fontSize: 13, color: T.textDim },
    filterChipTextActive: { color: T.primary },

    heroWrap: { paddingHorizontal: D.pad, paddingTop: 4, paddingBottom: 8 },
    heroCta: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      backgroundColor: T.primary, borderRadius: R.card, padding: 18,
    },
    heroCtaTitle: { fontFamily: F.uiBold, fontSize: 16, color: T.onPrimary },
    heroCtaSub: { fontFamily: F.uiMed, fontSize: 12, color: 'rgba(13,15,20,0.65)', marginTop: 1 },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: D.pad,
      paddingVertical: 14,
    },
    rowAvatar: {
      width: 38,
      height: 38,
      borderRadius: R.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowContent: { flex: 1 },
    rowTitle: { fontFamily: F.uiSemi, fontSize: 15, color: T.text, marginBottom: 3 },
    rowMeta: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim },
    menuButton: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },

    separator: { height: 1, backgroundColor: T.border, marginLeft: D.pad + 38 + 10 },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 48,
      gap: 10,
    },
    emptyUnderHero: {
      alignItems: 'center',
      paddingTop: 44,
      paddingHorizontal: 24,
      gap: 10,
    },
    emptyText: { fontFamily: F.uiMed, fontSize: 15, color: T.muted, textAlign: 'center' },
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
    textarea: { minHeight: 88, paddingTop: 11 },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingVertical: 9,
      paddingHorizontal: 14,
      borderRadius: R.sm,
      borderWidth: 1,
      borderColor: T.border,
      backgroundColor: T.surface,
    },
    chipActive: { backgroundColor: withAlpha(T.primary, 0.16), borderColor: T.primary },
    chipText: { fontFamily: F.uiMed, fontSize: 14, color: T.textDim },
    chipTextActive: { color: T.primary },
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
