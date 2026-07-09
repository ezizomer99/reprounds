import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { Focus, FocusStatus } from '@app/shared';
import {
  useCreateFocus,
  useDeleteFocus,
  useFocuses,
  useUpdateFocus,
} from '../../../src/hooks/useFocuses';
import { Skeleton } from '../../../src/components/Skeleton';
import { F, R, D, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { withAlpha } from '../../../src/lib/color';

const TABS: { key: FocusStatus; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'achieved', label: 'Achieved' },
  { key: 'archived', label: 'Archived' },
];

const EMPTY_COPY: Record<FocusStatus, { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }> = {
  active: {
    icon: 'flag-outline',
    title: 'No active focuses yet',
    text: 'Tap + to add what you’re working on — a technique to drill, a lift to build, anything you want to keep front of mind session to session.',
  },
  achieved: {
    icon: 'trophy-outline',
    title: 'Nothing achieved yet',
    text: 'When you nail a focus, mark it achieved and it’ll show up here as a little trophy shelf.',
  },
  archived: {
    icon: 'archive-outline',
    title: 'No archived focuses',
    text: 'Focuses you set aside for later live here — out of the way, but never lost.',
  },
};

interface FormState {
  mode: 'create' | 'edit';
  id?: string;
  title: string;
  notes: string;
}

export default function FocusesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);

  const { data: focuses, isLoading, isError, error, refetch, isRefetching } = useFocuses();
  const createFocus = useCreateFocus();
  const updateFocus = useUpdateFocus();
  const deleteFocus = useDeleteFocus();

  const [tab, setTab] = useState<FocusStatus>('active');
  const [form, setForm] = useState<FormState | null>(null);

  const list = focuses ?? [];
  const counts = useMemo(() => {
    const c: Record<FocusStatus, number> = { active: 0, achieved: 0, archived: 0 };
    for (const f of list) c[f.status] += 1;
    return c;
  }, [list]);
  const visible = useMemo(() => list.filter((f) => f.status === tab), [list, tab]);

  function openCreate() {
    setForm({ mode: 'create', title: '', notes: '' });
  }

  function openEdit(focus: Focus) {
    setForm({ mode: 'edit', id: focus.id, title: focus.title, notes: focus.notes ?? '' });
  }

  function submitForm() {
    if (!form) return;
    const title = form.title.trim();
    if (!title) return;
    const notes = form.notes.trim() || null;

    if (form.mode === 'create') {
      createFocus.mutate(
        { title, notes },
        { onError: (err) => Alert.alert('Error', err.message || 'Failed to add focus.') },
      );
    } else if (form.id) {
      updateFocus.mutate(
        { id: form.id, title, notes },
        { onError: (err) => Alert.alert('Error', err.message || 'Failed to save focus.') },
      );
    }
    setForm(null);
  }

  function changeStatus(focus: Focus, status: FocusStatus) {
    updateFocus.mutate(
      { id: focus.id, status },
      { onError: (err) => Alert.alert('Error', err.message || 'Failed to update focus.') },
    );
  }

  function confirmDelete(focus: Focus) {
    Alert.alert(
      'Delete focus',
      `Remove “${focus.title}”? This can’t be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            deleteFocus.mutate(focus.id, {
              onError: (err) => Alert.alert('Error', err.message || 'Failed to delete focus.'),
            }),
        },
      ],
    );
  }

  function openActions(focus: Focus) {
    const options: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
      { text: 'Edit', onPress: () => openEdit(focus) },
    ];
    if (focus.status !== 'active') {
      options.push({ text: 'Move to active', onPress: () => changeStatus(focus, 'active') });
    }
    if (focus.status !== 'achieved') {
      options.push({ text: 'Mark achieved', onPress: () => changeStatus(focus, 'achieved') });
    }
    if (focus.status !== 'archived') {
      options.push({ text: 'Archive', onPress: () => changeStatus(focus, 'archived') });
    }
    options.push({ text: 'Delete', style: 'destructive', onPress: () => confirmDelete(focus) });
    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(focus.title, undefined, options);
  }

  const renderItem = ({ item }: { item: Focus }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.75}
      onPress={() => openEdit(item)}
      onLongPress={() => openActions(item)}
    >
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        {item.notes ? (
          <Text style={styles.cardNotes} numberOfLines={3}>{item.notes}</Text>
        ) : null}
      </View>
      <TouchableOpacity
        style={styles.menuBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        onPress={() => openActions(item)}
      >
        <Ionicons name="ellipsis-horizontal" size={18} color={T.muted} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const empty = EMPTY_COPY[tab];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={T.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Training Focuses</Text>
          <Text style={styles.headerSub}>What you're working on, session to session</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
          <Ionicons name="add" size={20} color={T.onPrimary} />
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        {TABS.map(({ key, label }) => {
          const selected = tab === key;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.tab, selected && styles.tabSelected]}
              onPress={() => setTab(key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, selected && styles.tabTextSelected]}>
                {label}
                {counts[key] > 0 ? `  ${counts[key]}` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading ? (
        <View style={{ padding: D.pad, gap: D.stack }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} width="100%" height={72} radius={R.card} />
          ))}
        </View>
      ) : isError ? (
        <View style={styles.stateBlock}>
          <Ionicons name="cloud-offline-outline" size={38} color={T.muted} />
          <Text style={styles.stateTitle}>Couldn't load your focuses</Text>
          <Text style={styles.stateText}>
            {isServerMissing(error)
              ? 'This feature needs the latest app update. Pull to retry, or try again after updating.'
              : 'Something went wrong reaching the server. Check your connection and try again.'}
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()} disabled={isRefetching}>
            <Ionicons name="refresh" size={16} color={T.onPrimary} />
            <Text style={styles.retryText}>{isRefetching ? 'Retrying…' : 'Try again'}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: D.pad, gap: D.stack, paddingBottom: insets.bottom + 32, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          onRefresh={refetch}
          refreshing={isRefetching}
          ListEmptyComponent={
            <View style={styles.stateBlock}>
              <Ionicons name={empty.icon} size={38} color={T.muted} />
              <Text style={styles.stateTitle}>{empty.title}</Text>
              <Text style={styles.stateText}>{empty.text}</Text>
              {tab === 'active' && (
                <TouchableOpacity style={styles.retryBtn} onPress={openCreate}>
                  <Ionicons name="add" size={16} color={T.onPrimary} />
                  <Text style={styles.retryText}>Add a focus</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      <Modal
        visible={!!form}
        transparent
        animationType="fade"
        onRequestClose={() => setForm(null)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setForm(null)}
          >
            <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
              <Text style={styles.sheetTitle}>
                {form?.mode === 'edit' ? 'Edit focus' : 'New focus'}
              </Text>
              <TextInput
                style={styles.input}
                value={form?.title ?? ''}
                onChangeText={(t) => setForm((f) => (f ? { ...f, title: t } : f))}
                placeholder="What are you working on?"
                placeholderTextColor={T.muted}
                autoFocus
                selectionColor={T.primary}
                returnKeyType="next"
                maxLength={120}
              />
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                value={form?.notes ?? ''}
                onChangeText={(t) => setForm((f) => (f ? { ...f, notes: t } : f))}
                placeholder="Notes (optional) — drills, cues, why it matters"
                placeholderTextColor={T.muted}
                selectionColor={T.primary}
                multiline
                maxLength={2000}
              />
              <View style={styles.sheetActions}>
                <TouchableOpacity onPress={() => setForm(null)} style={styles.sheetBtn}>
                  <Text style={styles.sheetCancel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={submitForm}
                  style={[styles.sheetBtn, styles.sheetSave, !form?.title.trim() && styles.sheetSaveDisabled]}
                  disabled={!form?.title.trim()}
                >
                  <Text style={styles.sheetSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// A 404/HTTP-shaped error means the backend endpoint isn't reachable (e.g. an
// older app build hitting a route that hadn't shipped) rather than a network
// blip — surface a more helpful message for it.
function isServerMissing(error: Error | null): boolean {
  const status = (error as (Error & { status?: number }) | null)?.status;
  return status === 404 || /HTTP 404/.test(error?.message ?? '');
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: T.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 12, paddingVertical: 10,
      borderBottomWidth: 1, borderBottomColor: T.border,
    },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontFamily: F.uiBold, fontSize: 19, color: T.text, letterSpacing: -0.2 },
    headerSub: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim, marginTop: 1 },
    addBtn: {
      width: 40, height: 40, borderRadius: 20, backgroundColor: T.primary,
      alignItems: 'center', justifyContent: 'center',
    },

    tabs: {
      flexDirection: 'row', gap: 8,
      paddingHorizontal: D.pad, paddingTop: 14, paddingBottom: 4,
    },
    tab: {
      paddingHorizontal: 16, paddingVertical: 8, borderRadius: R.chip,
      borderWidth: 1, borderColor: T.border, backgroundColor: T.surface,
    },
    tabSelected: {
      borderColor: T.primary, backgroundColor: withAlpha(T.primary, 0.12),
    },
    tabText: { fontFamily: F.uiSemi, fontSize: 14, color: T.textDim },
    tabTextSelected: { color: T.primary },

    card: {
      flexDirection: 'row', alignItems: 'flex-start',
      backgroundColor: T.surface, borderWidth: 1, borderColor: T.border,
      borderRadius: R.card, padding: D.cardPad,
    },
    cardBody: { flex: 1, gap: 4 },
    cardTitle: { fontFamily: F.uiSemi, fontSize: 16, color: T.text, lineHeight: 21 },
    cardNotes: { fontFamily: F.uiMed, fontSize: 13, color: T.textDim, lineHeight: 18 },
    menuBtn: { paddingLeft: 12, paddingTop: 2 },

    stateBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
    stateTitle: { fontFamily: F.uiBold, fontSize: 17, color: T.text, textAlign: 'center' },
    stateText: { fontFamily: F.uiMed, fontSize: 13, color: T.muted, textAlign: 'center', lineHeight: 19 },
    retryBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6,
      backgroundColor: T.primary, paddingHorizontal: 18, paddingVertical: 10, borderRadius: R.chip,
    },
    retryText: { fontFamily: F.uiBold, fontSize: 14, color: T.onPrimary },

    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
    sheet: { backgroundColor: T.surface, borderRadius: R.card, padding: 20, gap: 12 },
    sheetTitle: { fontFamily: F.uiBold, fontSize: 18, color: T.text },
    input: {
      backgroundColor: T.bg, borderWidth: 1, borderColor: T.border, borderRadius: R.sm,
      paddingHorizontal: 14, paddingVertical: 11, fontFamily: F.uiMed, fontSize: 16, color: T.text,
    },
    inputMultiline: { minHeight: 90, textAlignVertical: 'top', paddingTop: 11 },
    sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 2 },
    sheetBtn: { paddingVertical: 9, paddingHorizontal: 18, borderRadius: R.chip },
    sheetCancel: { fontFamily: F.uiMed, fontSize: 15, color: T.textDim },
    sheetSave: { backgroundColor: T.primary },
    sheetSaveDisabled: { opacity: 0.5 },
    sheetSaveText: { fontFamily: F.uiBold, fontSize: 15, color: T.onPrimary },
  });
}
