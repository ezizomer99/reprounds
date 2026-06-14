import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { Session, TemplateWithItems } from '@app/shared';
import { useSessions } from '../../../src/hooks/useSession';
import { useTemplates } from '../../../src/hooks/useTemplates';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function buildTemplateMap(templates: TemplateWithItems[] | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!templates) return map;
  for (const t of templates) {
    map.set(t.id, t.name);
  }
  return map;
}

interface SessionRowProps {
  session: Session;
  templateName: string | null;
  onPress: () => void;
}

function SessionRow({ session, templateName, onPress }: SessionRowProps) {
  const duration = session.durationMinutes ? `${session.durationMinutes} min` : null;

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.rowContent}>
        <Text style={styles.rowDate}>{formatDate(session.date)}</Text>
        <Text style={styles.rowTemplate}>
          {templateName ?? 'Ad-hoc session'}
        </Text>
        {duration ? <Text style={styles.rowDuration}>{duration}</Text> : null}
      </View>
      <Text style={styles.rowArrow}>›</Text>
    </TouchableOpacity>
  );
}

export default function HistoryScreen() {
  const router = useRouter();
  const { data: sessions, isLoading: sessionsLoading, isError, error } = useSessions('completed');
  const { data: templates } = useTemplates();

  const templateMap = buildTemplateMap(templates);
  const list = sessions ?? [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>History</Text>
        <View style={styles.headerSpacer} />
      </View>

      {sessionsLoading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      )}

      {isError && (
        <View style={styles.centered}>
          <Text style={styles.errorText}>
            {error?.message ?? 'Failed to load history.'}
          </Text>
        </View>
      )}

      {!sessionsLoading && !isError && (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SessionRow
              session={item}
              templateName={item.templateId ? (templateMap.get(item.templateId) ?? null) : null}
              onPress={() =>
                router.push({
                  pathname: '/sessions/[id]',
                  params: { id: item.id },
                } as never)
              }
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>
                No completed sessions yet. Log a workout to see your history.
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
  headerSpacer: {
    minWidth: 52,
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
  rowDate: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  rowTemplate: {
    fontSize: 13,
    color: '#6b7280',
  },
  rowDuration: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
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
