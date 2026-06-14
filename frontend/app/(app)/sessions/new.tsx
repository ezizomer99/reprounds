import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, Dumbbell, Swords, Plus } from 'lucide-react-native';
import { useTemplates } from '../../../src/hooks/useTemplates';
import { useCreateSession } from '../../../src/hooks/useSession';
import { T, F, R, D } from '../../../src/theme/colors';
import type { TemplateWithItems } from '@app/shared';

export default function NewSessionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: templates, isLoading, isError } = useTemplates();
  const createSession = useCreateSession();

  const todayISO = new Date().toISOString().split('T')[0];

  async function handleStartFromTemplate(template: TemplateWithItems) {
    try {
      const session = await createSession.mutateAsync({ templateId: template.id, date: todayISO });
      router.push({ pathname: '/sessions/[id]', params: { id: session.id } } as never);
    } catch { /* surfaced via createSession.error */ }
  }

  async function handleEmptySession() {
    try {
      const session = await createSession.mutateAsync({ date: todayISO });
      router.push({ pathname: '/sessions/[id]', params: { id: session.id } } as never);
    } catch { /* surfaced via createSession.error */ }
  }

  const isStarting = createSession.isPending;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ChevronLeft size={22} color={T.text} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Session</Text>
        <View style={{ width: 40 }} />
      </View>

      {isStarting ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={T.primary} />
          <Text style={styles.startingText}>Starting session…</Text>
        </View>
      ) : (
        <FlatList
          data={templates ?? []}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <View style={styles.body}>
              <TouchableOpacity style={styles.heroCta} onPress={handleEmptySession} activeOpacity={0.8}>
                <Plus size={20} color={T.onPrimary} strokeWidth={2.4} />
                <View>
                  <Text style={styles.heroCtaTitle}>Start empty session</Text>
                  <Text style={styles.heroCtaSub}>Log without a template</Text>
                </View>
              </TouchableOpacity>

              <Text style={styles.eyebrow}>From template</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.templateRow}
              onPress={() => handleStartFromTemplate(item)}
              activeOpacity={0.7}
            >
              <View style={styles.templateIcon}>
                {item.items.some((i) => i.kind === 'martial_arts') ? (
                  <Swords size={19} color={T.primary} strokeWidth={1.8} />
                ) : (
                  <Dumbbell size={19} color={T.textDim} strokeWidth={1.8} />
                )}
              </View>
              <View style={styles.templateInfo}>
                <Text style={styles.templateName}>{item.name}</Text>
                <Text style={styles.templateMeta}>
                  {item.items.length} item{item.items.length !== 1 ? 's' : ''}
                  {item.dayLabel ? ` · ${item.dayLabel}` : ''}
                </Text>
              </View>
              <ChevronRight size={18} color={T.muted} />
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={styles.rowSep} />}
          ListEmptyComponent={
            isLoading ? (
              <View style={styles.centered}>
                <ActivityIndicator color={T.primary} />
              </View>
            ) : isError ? (
              <View style={styles.centered}>
                <Text style={styles.errorText}>Failed to load templates.</Text>
              </View>
            ) : (
              <View style={styles.centered}>
                <Text style={styles.emptyText}>No templates yet.</Text>
                <Text style={styles.emptySubText}>Create templates from the Training section.</Text>
              </View>
            )
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
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
  headerTitle: { flex: 1, fontFamily: F.uiSemi, fontSize: 19, color: T.text, letterSpacing: -0.2, textAlign: 'center' },
  body: { padding: D.pad, gap: D.stack },
  heroCta: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: T.primary, borderRadius: R.card, padding: 18,
  },
  heroCtaTitle: { fontFamily: F.uiBold, fontSize: 16, color: T.onPrimary },
  heroCtaSub: { fontFamily: F.uiMed, fontSize: 12, color: 'rgba(13,15,20,0.65)', marginTop: 1 },
  eyebrow: { fontFamily: F.uiBold, fontSize: 11, color: T.textDim, textTransform: 'uppercase', letterSpacing: 1.2 },
  templateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: D.pad, paddingVertical: 14,
  },
  templateIcon: {
    width: 38, height: 38, borderRadius: R.sm,
    backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center',
  },
  templateInfo: { flex: 1 },
  templateName: { fontFamily: F.uiMed, fontSize: 15, color: T.text, marginBottom: 2 },
  templateMeta: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim },
  rowSep: { height: 1, backgroundColor: T.border, marginLeft: D.pad + 38 + 14 },
  centered: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  startingText: { fontFamily: F.uiMed, fontSize: 15, color: T.textDim, marginTop: 12 },
  emptyText: { fontFamily: F.uiSemi, fontSize: 15, color: T.textDim, marginBottom: 4 },
  emptySubText: { fontFamily: F.uiMed, fontSize: 13, color: T.muted, textAlign: 'center' },
  errorText: { fontFamily: F.uiMed, fontSize: 15, color: T.danger },
});
