import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCreatePartner, usePartners } from '../hooks/usePartners';
import { useTheme } from '../theme/ThemeContext';
import { F, R, ThemeColors } from '../theme/colors';

/**
 * Controlled training-partner field. Renders the selected partner and opens a
 * bottom sheet to search, pick, or add a partner inline. Used by the
 * martial-arts round logging UIs.
 */
export function PartnerPicker({
  value,
  onChange,
  label = 'Partner',
}: {
  value: string | null;
  onChange: (partnerId: string | null) => void;
  label?: string;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { data: partners, isLoading } = usePartners();
  const createPartner = useCreatePartner();

  const selected = partners?.find((p) => p.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return partners ?? [];
    return (partners ?? []).filter((p) => p.name.toLowerCase().includes(q));
  }, [partners, query]);

  const canCreate =
    query.trim().length > 0 &&
    !(partners ?? []).some((p) => p.name.toLowerCase() === query.trim().toLowerCase());

  async function handleCreate() {
    const name = query.trim();
    if (!name) return;
    const partner = await createPartner.mutateAsync({ name });
    onChange(partner.id);
    setQuery('');
    setOpen(false);
  }

  function handleSelect(id: string) {
    onChange(id);
    setOpen(false);
  }

  return (
    <>
      <TouchableOpacity style={styles.field} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Ionicons name="person-outline" size={15} color={T.textDim} />
        <Text style={[styles.fieldText, !selected && { color: T.muted }]} numberOfLines={1}>
          {selected ? selected.name : `Add ${label.toLowerCase()}`}
        </Text>
        {selected ? (
          <TouchableOpacity hitSlop={8} onPress={() => onChange(null)}>
            <Ionicons name="close-circle" size={16} color={T.muted} />
          </TouchableOpacity>
        ) : (
          <Ionicons name="chevron-forward" size={15} color={T.muted} />
        )}
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{label}</Text>

          <View style={styles.searchRow}>
            <Ionicons name="search" size={15} color={T.muted} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search or add a name"
              placeholderTextColor={T.muted}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={canCreate ? handleCreate : undefined}
            />
          </View>

          {canCreate && (
            <TouchableOpacity
              style={styles.createRow}
              onPress={handleCreate}
              disabled={createPartner.isPending}
            >
              {createPartner.isPending ? (
                <ActivityIndicator size="small" color={T.primary} />
              ) : (
                <Ionicons name="add-circle" size={18} color={T.primary} />
              )}
              <Text style={styles.createText}>Add “{query.trim()}”</Text>
            </TouchableOpacity>
          )}

          {isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={T.primary} />
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(p) => p.id}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 320 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.row} onPress={() => handleSelect(item.id)}>
                  <Text style={styles.rowText}>{item.name}</Text>
                  {item.id === value && <Ionicons name="checkmark" size={18} color={T.primary} />}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                !canCreate ? (
                  <Text style={styles.empty}>No partners yet. Type a name to add one.</Text>
                ) : null
              }
            />
          )}
        </View>
      </Modal>
    </>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    field: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 12, paddingVertical: 10,
      backgroundColor: T.surface2, borderRadius: R.sm, borderWidth: 1, borderColor: T.border,
    },
    fieldText: { flex: 1, fontFamily: F.uiMed, fontSize: 14, color: T.text },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: {
      position: 'absolute', left: 0, right: 0, bottom: 0,
      backgroundColor: T.surface,
      borderTopLeftRadius: 18, borderTopRightRadius: 18,
      paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28,
    },
    handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: T.borderStrong, marginBottom: 12 },
    title: { fontFamily: F.uiSemi, fontSize: 17, color: T.text, marginBottom: 12 },
    searchRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: T.surface2, borderRadius: R.sm, paddingHorizontal: 12, height: 44,
      borderWidth: 1, borderColor: T.border,
    },
    searchInput: { flex: 1, fontFamily: F.uiMed, fontSize: 15, color: T.text, padding: 0 },
    createRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
    createText: { fontFamily: F.uiMed, fontSize: 14, color: T.primary },
    row: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: T.border,
    },
    rowText: { fontFamily: F.uiMed, fontSize: 15, color: T.text },
    centered: { paddingVertical: 24, alignItems: 'center' },
    empty: { fontFamily: F.ui, fontSize: 13, color: T.muted, paddingVertical: 18, textAlign: 'center' },
  });
}
