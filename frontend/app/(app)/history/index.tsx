import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, Dumbbell, Swords } from 'lucide-react-native';
import type { Session, TemplateWithItems } from '@app/shared';
import { useSessions } from '../../../src/hooks/useSession';
import { useTemplates } from '../../../src/hooks/useTemplates';
import { T, F, R, D } from '../../../src/theme/colors';
import { withAlpha } from '../../../src/lib/color';

function formatDateBlock(dateStr: string): { day: string; month: string } {
  const d = new Date(dateStr + 'T00:00:00');
  return {
    day: String(d.getDate()),
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
  };
}

function buildTemplateMap(templates: TemplateWithItems[] | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!templates) return map;
  for (const t of templates) map.set(t.id, t.name);
  return map;
}

function SessionRow({ session, templateName, isMat, onPress }: {
  session: Session;
  templateName: string | null;
  isMat: boolean;
  onPress: () => void;
}) {
  const { day, month } = formatDateBlock(session.date);
  const duration = session.durationMinutes ? `${session.durationMinutes} min` : null;

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.dateBlock}>
        <Text style={styles.dateDay}>{day}</Text>
        <Text style={styles.dateMonth}>{month}</Text>
      </View>
      <View style={styles.rowDivider} />
      <View style={styles.rowContent}>
        <Text style={styles.rowName}>{templateName ?? 'Ad-hoc session'}</Text>
        <Text style={styles.rowMeta}>
          {duration ?? ''}
          {duration ? ' · ' : ''}
          {session.status}
        </Text>
      </View>
      <View style={[styles.kindBadge, isMat && styles.kindBadgeMat]}>
        {isMat
          ? <Swords size={12} color={withAlpha('#a78bfa', 1)} strokeWidth={1.8} />
          : <Dumbbell size={12} color={T.textDim} strokeWidth={1.8} />}
      </View>
      <ChevronRight size={16} color={T.muted} />
    </TouchableOpacity>
  );
}

export default function HistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: sessions, isLoading, isError, error } = useSessions('completed');
  const { data: templates } = useTemplates();

  const templateMap = buildTemplateMap(templates);
  const list = sessions ?? [];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ChevronLeft size={22} color={T.text} strokeWidth={2} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>History</Text>
          {list.length > 0 && <Text style={styles.headerSub}>{list.length} sessions logged</Text>}
        </View>
        <View style={{ width: 40 }} />
      </View>

      {isLoading && (
        <View style={styles.centered}><ActivityIndicator size="large" color={T.primary} /></View>
      )}

      {isError && (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error?.message ?? 'Failed to load history.'}</Text>
        </View>
      )}

      {!isLoading && !isError && (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SessionRow
              session={item}
              templateName={item.templateId ? (templateMap.get(item.templateId) ?? null) : null}
              isMat={false}
              onPress={() => router.push({ pathname: '/sessions/[id]', params: { id: item.id } } as never)}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>No completed sessions yet.</Text>
              <Text style={styles.emptySub}>Log a workout to see your history here.</Text>
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

  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: D.pad, paddingVertical: 13, gap: 12 },
  dateBlock: { width: 46, alignItems: 'center', flexShrink: 0 },
  dateDay: { fontFamily: F.monoBold, fontSize: 19, color: T.text },
  dateMonth: { fontFamily: F.uiBold, fontSize: 10, color: T.textDim, letterSpacing: 0.6 },
  rowDivider: { width: 1, height: 34, backgroundColor: T.border },
  rowContent: { flex: 1 },
  rowName: { fontFamily: F.uiSemi, fontSize: 15, color: T.text, marginBottom: 2 },
  rowMeta: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim },
  kindBadge: {
    width: 26, height: 26, borderRadius: R.sm,
    backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center',
  },
  kindBadgeMat: { backgroundColor: withAlpha('#a78bfa', 0.12) },
  separator: { height: 1, backgroundColor: T.border, marginLeft: D.pad + 46 + 12 + 1 + 12 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  emptyText: { fontFamily: F.uiSemi, fontSize: 15, color: T.textDim, marginBottom: 4 },
  emptySub: { fontFamily: F.uiMed, fontSize: 13, color: T.muted, textAlign: 'center', paddingHorizontal: 24 },
  errorText: { fontFamily: F.uiMed, fontSize: 15, color: T.danger, textAlign: 'center' },
});
