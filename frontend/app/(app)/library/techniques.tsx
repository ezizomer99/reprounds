import {
  ActivityIndicator,
  Alert,
  Modal,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useState, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { Technique, TechniqueKind } from '@app/shared';
import { FREE_CUSTOM_TECHNIQUE_LIMIT } from '@app/shared';
import {
  useCreateTechnique,
  useDeleteTechnique,
  useTechniques,
} from '../../../src/hooks/useTechniques';
import { useCurrentUser } from '../../../src/hooks/useAuth';
import { useProGate } from '../../../src/hooks/useProGate';
import { Touchable } from '../../../src/components/ui';
import { F, R, D, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { withAlpha } from '../../../src/lib/color';

const KIND_OPTIONS: { label: string; value: TechniqueKind }[] = [
  { label: 'Position', value: 'position' },
  { label: 'Submission', value: 'submission' },
];

const KIND_ICON: Record<TechniqueKind, keyof typeof Ionicons.glyphMap> = {
  position: 'body-outline',
  submission: 'lock-closed-outline',
};

function TechniqueRow({
  technique,
  isOwned,
  onDelete,
}: {
  technique: Technique;
  isOwned: boolean;
  onDelete: (id: string) => void;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);

  function handleDelete() {
    Alert.alert(
      'Delete technique',
      `Remove "${technique.label}"? This cannot be undone. Sessions you already logged keep their data.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete(technique.id) },
      ],
    );
  }

  return (
    <View style={styles.row}>
      <View style={[styles.iconAvatar, { backgroundColor: withAlpha(T.grappling, 0.14) }]}>
        <Ionicons name={KIND_ICON[technique.kind]} size={18} color={T.grappling} />
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowName}>{technique.label}</Text>
        <Text style={styles.rowMeta}>{isOwned ? 'Custom' : 'Default'}</Text>
      </View>
      {isOwned && (
        <Touchable onPress={handleDelete} style={styles.deleteButton} feedback="row" accessibilityLabel={`Delete ${technique.label}`}>
          <Ionicons name="trash-outline" size={15} color={T.danger} />
        </Touchable>
      )}
    </View>
  );
}

function AddTechniqueModal({
  visible,
  onClose,
  canAdd,
  onLimit,
}: {
  visible: boolean;
  onClose: () => void;
  canAdd: boolean;
  onLimit: () => void;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<TechniqueKind>('position');
  const createTechnique = useCreateTechnique();

  function reset() {
    setLabel('');
    setKind('position');
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    const trimmed = label.trim();
    if (!trimmed) {
      Alert.alert('Validation', 'Name is required.');
      return;
    }
    if (!canAdd) {
      onLimit();
      return;
    }
    try {
      await createTechnique.mutateAsync({ kind, label: trimmed });
      handleClose();
    } catch (err) {
      Alert.alert('Error', (err as Error).message ?? 'Failed to add technique.');
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
          <Text style={styles.modalTitle}>Add Technique</Text>
          <Touchable onPress={handleClose} hasTextChild>
            <Text style={styles.modalCancel}>Cancel</Text>
          </Touchable>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Type *</Text>
          <View style={styles.kindOptions}>
            {KIND_OPTIONS.map(({ label: optLabel, value }) => {
              const active = kind === value;
              return (
                <Touchable
                  key={value}
                  style={[
                    styles.kindButton,
                    active && { backgroundColor: withAlpha(T.grappling, 0.18), borderColor: T.grappling },
                  ]}
                  onPress={() => setKind(value)}
                  feedback="row"
                  hasTextChild
                >
                  <Text style={[styles.kindButtonText, active && { color: T.grappling }]}>
                    {optLabel}
                  </Text>
                </Touchable>
              );
            })}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Name *</Text>
          <TextInput
            style={styles.input}
            value={label}
            onChangeText={setLabel}
            placeholder={kind === 'position' ? 'e.g. Butterfly guard' : 'e.g. Bow and arrow'}
            placeholderTextColor={T.muted}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
            selectionColor={T.primary}
          />
        </View>

        <Touchable
          style={[styles.submitButton, createTechnique.isPending && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={createTechnique.isPending}
          feedback="card"
          hasTextChild
        >
          {createTechnique.isPending ? (
            <ActivityIndicator color={T.onPrimary} />
          ) : (
            <Text style={styles.submitText}>Add Technique</Text>
          )}
        </Touchable>
      </View>
    </Modal>
  );
}

export default function TechniquesScreen() {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: currentUser } = useCurrentUser();
  const { isPro, isLoading: gateLoading, showPaywall } = useProGate();
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');

  const { data: techniques, isLoading, isError, error } = useTechniques({ category: 'grappling' });
  const deleteTechnique = useDeleteTechnique();

  const list = techniques ?? [];
  const customCount = list.filter((t) => t.userId === currentUser?.id).length;
  // `gateLoading` counts as allowed — see exercises/index.tsx.
  const canAdd = isPro || gateLoading || customCount < FREE_CUSTOM_TECHNIQUE_LIMIT;

  const sections = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matches = query
      ? list.filter((t) => t.label.toLowerCase().includes(query))
      : list;
    const positions = matches.filter((t) => t.kind === 'position');
    const submissions = matches.filter((t) => t.kind === 'submission');
    return [
      { title: 'Positions', data: positions },
      { title: 'Submissions', data: submissions },
    ].filter((s) => s.data.length > 0);
  }, [list, search]);

  function handleDelete(id: string) {
    deleteTechnique.mutate(id, {
      onError: (err) => Alert.alert('Error', err.message ?? 'Failed to delete technique.'),
    });
  }

  function showLimit() {
    Alert.alert(
      'Limit reached',
      `Free accounts can create up to ${FREE_CUSTOM_TECHNIQUE_LIMIT} custom positions & submissions. Upgrade to RepRounds Pro for unlimited.`,
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Upgrade', onPress: showPaywall },
      ],
    );
  }

  function handleAddPress() {
    if (!canAdd) {
      showLimit();
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
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Positions & Submissions</Text>
          <Text style={styles.headerSub}>The chips you tap while logging rounds</Text>
        </View>
        <Touchable style={styles.addBtn} onPress={handleAddPress} accessibilityLabel="Add a technique">
          <Ionicons name="add" size={18} color={T.onPrimary} />
        </Touchable>
      </View>

      <View style={styles.searchRow}>
        <Ionicons name="search" size={15} color={T.muted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search positions & submissions…"
          placeholderTextColor={T.muted}
          returnKeyType="search"
          selectionColor={T.primary}
        />
      </View>

      {isLoading && (
        <View style={styles.centered}><ActivityIndicator size="large" color={T.primary} /></View>
      )}

      {isError && (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error?.message ?? 'Failed to load techniques.'}</Text>
        </View>
      )}

      {!isLoading && !isError && (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TechniqueRow
              technique={item}
              isOwned={item.userId === currentUser?.id}
              onDelete={handleDelete}
            />
          )}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>
                {search.trim()
                  ? `No techniques match "${search.trim()}".`
                  : 'No techniques found.'}
              </Text>
            </View>
          }
          contentContainerStyle={[
            sections.length === 0 && { flex: 1 },
            { paddingBottom: insets.bottom + 32 },
          ]}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
        />
      )}

      <AddTechniqueModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        canAdd={canAdd}
        onLimit={showLimit}
      />
    </View>
  );
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
    headerTitle: { fontFamily: F.uiSemi, fontSize: 19, color: T.text, letterSpacing: -0.2 },
    headerSub: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim, marginTop: 1 },
    addBtn: {
      width: 36, height: 36, borderRadius: R.sm,
      backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center',
    },

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
    },
    searchInput: {
      flex: 1,
      fontFamily: F.uiMed,
      fontSize: 14,
      color: T.text,
      paddingVertical: 10,
      paddingRight: 12,
    },

    sectionHeader: {
      fontFamily: F.uiBold, fontSize: 11, color: T.textDim,
      textTransform: 'uppercase', letterSpacing: 0.8,
      paddingHorizontal: D.pad, paddingTop: 20, paddingBottom: 8,
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
    rowMeta: { fontFamily: F.uiBold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: T.muted },
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
    kindOptions: { flexDirection: 'row', gap: 8 },
    kindButton: {
      flex: 1, paddingVertical: 11, alignItems: 'center',
      borderRadius: R.sm, borderWidth: 1, borderColor: T.border,
      backgroundColor: T.surface,
    },
    kindButtonText: { fontFamily: F.uiMed, fontSize: 14, color: T.textDim },
    submitButton: {
      marginTop: 8, backgroundColor: T.primary,
      borderRadius: R.card, paddingVertical: 14, alignItems: 'center',
    },
    submitButtonDisabled: { opacity: 0.55 },
    submitText: { fontFamily: F.uiBold, fontSize: 16, color: T.onPrimary },
  });
}
