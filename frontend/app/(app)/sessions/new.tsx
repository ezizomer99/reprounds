import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTemplates } from '../../../src/hooks/useTemplates';
import { useCreateSession } from '../../../src/hooks/useSession';
import type { TemplateWithItems } from '@app/shared';

export default function NewSessionScreen() {
  const router = useRouter();
  const { data: templates, isLoading, isError } = useTemplates();
  const createSession = useCreateSession();

  const todayISO = new Date().toISOString().split('T')[0];

  async function handleStartFromTemplate(template: TemplateWithItems) {
    try {
      const session = await createSession.mutateAsync({
        templateId: template.id,
        date: todayISO,
      });
      // Route types will include /sessions/[id] after Metro processes the new file
      router.push({ pathname: '/sessions/[id]', params: { id: session.id } } as never);
    } catch {
      // error is surfaced via createSession.error if needed
    }
  }

  async function handleEmptySession() {
    try {
      const session = await createSession.mutateAsync({ date: todayISO });
      router.push({ pathname: '/sessions/[id]', params: { id: session.id } } as never);
    } catch {
      // error is surfaced via createSession.error if needed
    }
  }

  const isStarting = createSession.isPending;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Session</Text>
        <View style={styles.headerRight} />
      </View>

      {isStarting && (
        <View style={styles.startingOverlay}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.startingText}>Starting session...</Text>
        </View>
      )}

      {!isStarting && (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Quick Start</Text>
            <TouchableOpacity style={styles.emptySessionButton} onPress={handleEmptySession}>
              <Text style={styles.emptySessionButtonText}>Empty Session</Text>
              <Text style={styles.emptySessionSubText}>Start logging without a template</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sectionDivider}>
            <Text style={styles.sectionLabel}>From Template</Text>
          </View>

          {isLoading && (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#3b82f6" />
            </View>
          )}

          {isError && (
            <View style={styles.centered}>
              <Text style={styles.errorText}>Failed to load templates.</Text>
            </View>
          )}

          {!isLoading && !isError && (
            <FlatList
              data={templates ?? []}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.templateRow}
                  onPress={() => handleStartFromTemplate(item)}
                >
                  <View style={styles.templateRowContent}>
                    <Text style={styles.templateName}>{item.name}</Text>
                    {item.dayLabel ? (
                      <Text style={styles.templateDayLabel}>{item.dayLabel}</Text>
                    ) : null}
                    <Text style={styles.templateMeta}>
                      {item.items.length} item{item.items.length !== 1 ? 's' : ''}
                    </Text>
                  </View>
                  <Text style={styles.rowArrow}>›</Text>
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              ListEmptyComponent={
                <View style={styles.centered}>
                  <Text style={styles.emptyText}>No templates yet.</Text>
                  <Text style={styles.emptySubText}>Create templates in the Training section.</Text>
                </View>
              }
              contentContainerStyle={templates?.length === 0 ? styles.emptyListContainer : undefined}
            />
          )}
        </>
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
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  backButton: {
    minWidth: 52,
  },
  backText: {
    fontSize: 16,
    color: '#3b82f6',
  },
  headerRight: {
    minWidth: 52,
  },
  startingOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  startingText: {
    fontSize: 15,
    color: '#6b7280',
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionDivider: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  emptySessionButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  emptySessionButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
  },
  emptySessionSubText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
  },
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  templateRowContent: {
    flex: 1,
  },
  templateName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  templateDayLabel: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 2,
  },
  templateMeta: {
    fontSize: 12,
    color: '#9ca3af',
  },
  rowArrow: {
    fontSize: 22,
    color: '#9ca3af',
    lineHeight: 24,
    marginLeft: 8,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e5e7eb',
    marginLeft: 16,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyListContainer: {
    flex: 1,
  },
  emptyText: {
    fontSize: 15,
    color: '#6b7280',
    fontWeight: '500',
    marginBottom: 4,
  },
  emptySubText: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 15,
    color: '#ef4444',
  },
});
