import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, Dumbbell, Plus, Swords } from 'lucide-react-native';
import type { TemplateWithItems } from '@app/shared';
import { useDeleteTemplate, useTemplates } from '../../../src/hooks/useTemplates';
import { T, F, R, D } from '../../../src/theme/colors';
import { withAlpha } from '../../../src/lib/color';

interface TemplateRowProps {
  template: TemplateWithItems;
  onPress: (id: string) => void;
  onDelete: (id: string, name: string) => void;
}

function TemplateRow({ template, onPress, onDelete }: TemplateRowProps) {
  const hasMartialArts = template.items.some((i) => i.kind === 'martial_arts');

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onPress(template.id)}
      onLongPress={() => onDelete(template.id, template.name)}
      activeOpacity={0.7}
    >
      <View style={[styles.iconAvatar, hasMartialArts && styles.iconAvatarMat]}>
        {hasMartialArts ? (
          <Swords size={18} color="#a78bfa" strokeWidth={1.8} />
        ) : (
          <Dumbbell size={18} color={T.textDim} strokeWidth={1.8} />
        )}
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowName}>{template.name}</Text>
        <Text style={styles.rowMeta}>
          {template.items.length} item{template.items.length !== 1 ? 's' : ''}
          {template.dayLabel ? ` · ${template.dayLabel}` : ''}
        </Text>
      </View>
      <ChevronRight size={16} color={T.muted} />
    </TouchableOpacity>
  );
}

export default function TemplatesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: templates, isLoading, isError, error } = useTemplates();
  const deleteTemplate = useDeleteTemplate();

  function handleDelete(id: string, name: string) {
    Alert.alert(
      'Delete template',
      `Remove "${name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteTemplate.mutate(id, {
              onError: (err) => Alert.alert('Error', err.message ?? 'Failed to delete template.'),
            });
          },
        },
      ],
    );
  }

  const list = templates ?? [];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ChevronLeft size={22} color={T.text} strokeWidth={2} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Templates</Text>
          {list.length > 0 && (
            <Text style={styles.headerSub}>{list.length} template{list.length !== 1 ? 's' : ''}</Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push({ pathname: '/templates/[id]', params: { id: 'new' } })}
        >
          <Plus size={18} color={T.onPrimary} strokeWidth={2.4} />
        </TouchableOpacity>
      </View>

      {isLoading && (
        <View style={styles.centered}><ActivityIndicator size="large" color={T.primary} /></View>
      )}

      {isError && (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error?.message ?? 'Failed to load templates.'}</Text>
        </View>
      )}

      {!isLoading && !isError && (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TemplateRow
              template={item}
              onPress={(id) => router.push({ pathname: '/templates/[id]', params: { id } })}
              onDelete={handleDelete}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>No templates yet.</Text>
              <Text style={styles.emptySub}>Tap + to create one.</Text>
            </View>
          }
          contentContainerStyle={[
            list.length === 0 && { flex: 1 },
            { paddingBottom: insets.bottom + 32 },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: D.pad, paddingVertical: 14,
  },
  iconAvatar: {
    width: 40, height: 40, borderRadius: R.sm,
    backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center',
  },
  iconAvatarMat: { backgroundColor: withAlpha('#a78bfa', 0.12) },
  rowContent: { flex: 1 },
  rowName: { fontFamily: F.uiMed, fontSize: 15, color: T.text, marginBottom: 2 },
  rowMeta: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim },

  separator: { height: 1, backgroundColor: T.border, marginLeft: D.pad + 40 + 12 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  emptyText: { fontFamily: F.uiSemi, fontSize: 15, color: T.textDim, marginBottom: 4 },
  emptySub: { fontFamily: F.uiMed, fontSize: 13, color: T.muted },
  errorText: { fontFamily: F.uiMed, fontSize: 15, color: T.danger, textAlign: 'center', paddingHorizontal: 24 },
});
