import {
  Alert,
  FlatList,
  Modal,
  RefreshControl,
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
import type { PartnerStatsItem } from '@app/shared';
import { usePartnerStats, useUpdatePartner, useDeletePartner } from '../../../src/hooks/usePartners';
import { Skeleton } from '../../../src/components/Skeleton';
import { F, R, D, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { withAlpha } from '../../../src/lib/color';

function fmtMatTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtLastDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function PartnersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);

  const { data, isLoading, refetch, isRefetching } = usePartnerStats();
  const updatePartner = useUpdatePartner();
  const deletePartner = useDeletePartner();

  const partners = data?.partners ?? [];

  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [renameText, setRenameText] = useState('');

  function openRename(item: PartnerStatsItem) {
    if (!item.partnerId) return;
    setRenaming({ id: item.partnerId, name: item.name });
    setRenameText(item.name);
  }

  function submitRename() {
    const trimmed = renameText.trim();
    if (renaming && trimmed && trimmed !== renaming.name) {
      updatePartner.mutate(
        { id: renaming.id, name: trimmed },
        { onError: (err) => Alert.alert('Error', err.message || 'Failed to rename.') },
      );
    }
    setRenaming(null);
  }

  function handleDelete(item: PartnerStatsItem) {
    if (!item.partnerId) return;
    Alert.alert(
      'Delete partner',
      `Remove "${item.name}"? Their rounds stay logged but lose the partner tag.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deletePartner.mutate(item.partnerId!, {
            onError: (err) => Alert.alert('Error', err.message || 'Failed to delete partner.'),
          }),
        },
      ],
    );
  }

  const renderItem = ({ item }: { item: PartnerStatsItem }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={item.partnerId ? 0.7 : 1}
      onLongPress={item.partnerId ? () => handleDelete(item) : undefined}
      onPress={item.partnerId ? () => openRename(item) : undefined}
    >
      <View style={styles.cardHead}>
        <View style={[styles.avatar, !item.partnerId && { backgroundColor: T.surface2 }]}>
          <Ionicons name={item.partnerId ? 'person' : 'help'} size={18} color={item.partnerId ? T.grappling : T.muted} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.lastDate}>Last rolled {fmtLastDate(item.lastDate)}</Text>
        </View>
      </View>
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statVal}>{item.rounds}</Text>
          <Text style={styles.statLabel}>rounds</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statVal}>{fmtMatTime(item.minutes)}</Text>
          <Text style={styles.statLabel}>mat time</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statVal, { color: T.conditioning }]}>{item.submissionsFor}</Text>
          <Text style={styles.statLabel}>subs for</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statVal, { color: T.danger }]}>{item.submissionsAgainst}</Text>
          <Text style={styles.statLabel}>subs against</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

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
        <Text style={styles.headerTitle}>Training Partners</Text>
      </View>

      {isLoading ? (
        <View style={{ padding: D.pad, gap: D.stack }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} width="100%" height={110} radius={R.card} />
          ))}
        </View>
      ) : partners.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={36} color={T.muted} />
          <Text style={styles.emptyTitle}>No partner data yet</Text>
          <Text style={styles.emptyText}>
            Tag a partner on your rounds when logging a mat session to see who you train with most.
          </Text>
        </View>
      ) : (
        <FlatList
          data={partners}
          keyExtractor={(item) => item.partnerId ?? '__unassigned__'}
          renderItem={renderItem}
          contentContainerStyle={{ padding: D.pad, gap: D.stack, paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => void refetch()}
              tintColor={T.textDim}
            />
          }
          ListHeaderComponent={
            <Text style={styles.hint}>Tap a partner to rename · long-press to delete</Text>
          }
        />
      )}

      <Modal visible={!!renaming} transparent animationType="fade" onRequestClose={() => setRenaming(null)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setRenaming(null)}>
          <View style={styles.renameSheet}>
            <Text style={styles.renameTitle}>Rename partner</Text>
            <TextInput
              style={styles.renameInput}
              value={renameText}
              onChangeText={setRenameText}
              autoFocus
              selectionColor={T.primary}
              placeholderTextColor={T.muted}
              returnKeyType="done"
              onSubmitEditing={submitRename}
            />
            <View style={styles.renameActions}>
              <TouchableOpacity onPress={() => setRenaming(null)} style={styles.renameBtn}>
                <Text style={styles.renameCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={submitRename} style={[styles.renameBtn, styles.renameSave]}>
                <Text style={styles.renameSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
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
    headerTitle: { flex: 1, fontFamily: F.uiBold, fontSize: 19, color: T.text, letterSpacing: -0.2 },

    hint: { fontFamily: F.uiMed, fontSize: 12, color: T.muted, marginBottom: 4 },
    card: {
      backgroundColor: T.surface, borderWidth: 1, borderColor: T.border,
      borderRadius: R.card, padding: D.cardPad,
    },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar: {
      width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
      backgroundColor: withAlpha(T.grappling, 0.15),
    },
    name: { fontFamily: F.uiSemi, fontSize: 16, color: T.text },
    lastDate: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim, marginTop: 1 },

    statsRow: { flexDirection: 'row', marginTop: 14, gap: 8 },
    stat: { flex: 1, alignItems: 'center', gap: 2 },
    statVal: { fontFamily: F.monoBold, fontSize: 18, color: T.text },
    statLabel: { fontFamily: F.uiMed, fontSize: 11, color: T.textDim, textAlign: 'center' },

    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
    emptyTitle: { fontFamily: F.uiBold, fontSize: 17, color: T.text },
    emptyText: { fontFamily: F.uiMed, fontSize: 13, color: T.muted, textAlign: 'center', lineHeight: 19 },

    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 32 },
    renameSheet: { backgroundColor: T.surface, borderRadius: R.card, padding: 20, gap: 14 },
    renameTitle: { fontFamily: F.uiBold, fontSize: 17, color: T.text },
    renameInput: {
      backgroundColor: T.bg, borderWidth: 1, borderColor: T.border, borderRadius: R.sm,
      paddingHorizontal: 14, paddingVertical: 10, fontFamily: F.uiMed, fontSize: 16, color: T.text,
    },
    renameActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
    renameBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: R.chip },
    renameCancel: { fontFamily: F.uiMed, fontSize: 15, color: T.textDim },
    renameSave: { backgroundColor: T.primary },
    renameSaveText: { fontFamily: F.uiBold, fontSize: 15, color: T.onPrimary },
  });
}
