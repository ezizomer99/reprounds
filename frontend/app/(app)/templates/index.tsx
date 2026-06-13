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
import type { TemplateWithItems } from '@app/shared';
import { useDeleteTemplate, useTemplates } from '../../../src/hooks/useTemplates';

interface TemplateRowProps {
  template: TemplateWithItems;
  onPress: (id: string) => void;
  onDelete: (id: string, name: string) => void;
}

function TemplateRow({ template, onPress, onDelete }: TemplateRowProps) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onPress(template.id)}
      onLongPress={() => onDelete(template.id, template.name)}
      activeOpacity={0.7}
    >
      <View style={styles.rowContent}>
        <Text style={styles.rowName}>{template.name}</Text>
        {template.dayLabel ? (
          <Text style={styles.rowDayLabel}>{template.dayLabel}</Text>
        ) : null}
      </View>
      <Text style={styles.rowMeta}>{template.items.length} items</Text>
      <Text style={styles.rowArrow}>›</Text>
    </TouchableOpacity>
  );
}

export default function TemplatesScreen() {
  const router = useRouter();
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
              onError: (err) => {
                Alert.alert('Error', err.message ?? 'Failed to delete template.');
              },
            });
          },
        },
      ],
    );
  }

  const list = templates ?? [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Templates</Text>
        <TouchableOpacity
          onPress={() => router.push('/(app)/templates/new')}
          style={styles.addButton}
        >
          <Text style={styles.addButtonText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {isLoading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      )}

      {isError && (
        <View style={styles.centered}>
          <Text style={styles.errorText}>
            {error?.message ?? 'Failed to load templates.'}
          </Text>
        </View>
      )}

      {!isLoading && !isError && (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TemplateRow
              template={item}
              onPress={(id) => router.push(`/(app)/templates/${id}`)}
              onDelete={handleDelete}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>
                No templates yet. Tap + New to create one.
              </Text>
            </View>
          }
          contentContainerStyle={list.length === 0 ? styles.emptyList : undefined}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  backButton: {
    minWidth: 52,
  },
  backText: {
    fontSize: 16,
    color: '#3b82f6',
  },
  addButton: {
    minWidth: 52,
    alignItems: 'flex-end',
  },
  addButtonText: {
    fontSize: 16,
    color: '#3b82f6',
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowContent: {
    flex: 1,
  },
  rowName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  rowDayLabel: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  rowMeta: {
    fontSize: 13,
    color: '#9ca3af',
    marginRight: 8,
  },
  rowArrow: {
    fontSize: 20,
    color: '#9ca3af',
    lineHeight: 22,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e5e7eb',
    marginLeft: 16,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyList: {
    flex: 1,
  },
  emptyText: {
    fontSize: 15,
    color: '#9ca3af',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  errorText: {
    fontSize: 15,
    color: '#ef4444',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
