import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Flame, Calendar, Clock, Layers, Dumbbell, Swords, ChevronRight } from 'lucide-react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { useCurrentUser } from '../../src/hooks/useAuth';
import { useSessions } from '../../src/hooks/useSession';
import { useTemplates } from '../../src/hooks/useTemplates';
import { clearSessionToken } from '../../src/lib/auth';
import { T, F, R, D } from '../../src/theme/colors';

function todayLabel(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function thisWeekSessions(sessions: { date: string }[]): number {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  return sessions.filter((s) => new Date(s.date + 'T00:00:00') >= startOfWeek).length;
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const { data: sessions } = useSessions('completed');
  const { data: templates } = useTemplates();

  const lastSession = sessions?.[0] ?? null;
  const weekCount = sessions ? thisWeekSessions(sessions) : 0;
  const templateCount = templates?.length ?? 0;

  async function handleSignOut() {
    await clearSessionToken();
    await GoogleSignin.signOut();
    queryClient.clear();
    router.replace('/(auth)/sign-in');
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Glíma</Text>
          <Text style={styles.headerSub}>{todayLabel()}</Text>
        </View>
        <View style={styles.streakBadge}>
          <Flame size={14} color={T.gold} fill={T.gold} />
          <Text style={styles.streakText}>— day</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Log Workout CTA */}
        <TouchableOpacity
          style={styles.heroCta}
          onPress={() => router.push('/sessions/new' as never)}
          activeOpacity={0.8}
        >
          <View style={styles.heroCtaLeft}>
            <View style={styles.heroCtaIcon}>
              <Text style={styles.heroCtaPlus}>+</Text>
            </View>
            <View>
              <Text style={styles.heroCtaTitle}>Log Workout</Text>
              <Text style={styles.heroCtaSub}>Start from a template or empty</Text>
            </View>
          </View>
          <ChevronRight size={20} color={T.onPrimary} strokeWidth={2.5} />
        </TouchableOpacity>

        {/* Last Session */}
        {lastSession && (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.eyebrow}>Last session</Text>
            </View>
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push({ pathname: '/sessions/[id]', params: { id: lastSession.id } } as never)}
              activeOpacity={0.7}
            >
              <View style={styles.lastSessionHead}>
                <Text style={styles.lastSessionName}>
                  {lastSession.templateId ? (templates?.find((t) => t.id === lastSession.templateId)?.name ?? 'Session') : 'Ad-hoc session'}
                </Text>
                <ChevronRight size={18} color={T.muted} />
              </View>
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={styles.statNum}>
                    {lastSession.durationMinutes != null ? `${lastSession.durationMinutes}` : '—'}
                  </Text>
                  <Text style={styles.statKey}>
                    {lastSession.durationMinutes != null ? 'min' : 'duration'}
                  </Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statNum}>
                    {new Date(lastSession.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Text>
                  <Text style={styles.statKey}>date</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statNum}>{lastSession.status}</Text>
                  <Text style={styles.statKey}>status</Text>
                </View>
              </View>
            </TouchableOpacity>
          </>
        )}

        {/* Week Stats */}
        <View style={styles.grid2}>
          <View style={styles.card}>
            <Text style={styles.statNum}>{weekCount}<Text style={styles.statNumDim}>/7</Text></Text>
            <Text style={styles.statKey}>Sessions · wk</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.statNum}>—</Text>
            <Text style={styles.statKey}>On the mat</Text>
          </View>
        </View>

        {/* Training */}
        <Text style={[styles.eyebrow, { marginTop: 4 }]}>Training</Text>
        <View style={styles.grid2}>
          <NavCard
            icon={<Calendar size={28} color={T.primary} strokeWidth={1.8} />}
            label="Calendar"
            meta="This week"
            onPress={() => router.push('/calendar')}
          />
          <NavCard
            icon={<Clock size={28} color={T.primary} strokeWidth={1.8} />}
            label="History"
            meta={sessions ? `${sessions.length} sessions` : 'Sessions'}
            onPress={() => router.push('/history')}
          />
        </View>
        <TouchableOpacity
          style={[styles.card, styles.wideNavCard]}
          onPress={() => router.push('/templates')}
          activeOpacity={0.7}
        >
          <Layers size={24} color={T.primary} strokeWidth={1.8} />
          <View style={styles.navCardText}>
            <Text style={styles.navCardLabel}>Templates</Text>
            <Text style={styles.navCardMeta}>{templateCount} routines</Text>
          </View>
          <ChevronRight size={18} color={T.muted} />
        </TouchableOpacity>

        {/* Library */}
        <Text style={[styles.eyebrow, { marginTop: 4 }]}>Library</Text>
        <View style={styles.listCard}>
          <TouchableOpacity
            style={styles.listRow}
            onPress={() => router.push('/library/exercises')}
            activeOpacity={0.7}
          >
            <Dumbbell size={22} color={T.textDim} strokeWidth={1.8} />
            <View style={styles.listRowText}>
              <Text style={styles.listRowTitle}>Exercises</Text>
            </View>
            <ChevronRight size={18} color={T.muted} />
          </TouchableOpacity>
          <View style={styles.rowDivider} />
          <TouchableOpacity
            style={styles.listRow}
            onPress={() => router.push('/library/disciplines')}
            activeOpacity={0.7}
          >
            <Swords size={22} color={T.textDim} strokeWidth={1.8} />
            <View style={styles.listRowText}>
              <Text style={styles.listRowTitle}>Disciplines</Text>
            </View>
            <ChevronRight size={18} color={T.muted} />
          </TouchableOpacity>
        </View>

        {/* Sign Out */}
        {user && (
          <View style={styles.userRow}>
            <Text style={styles.userEmail}>{user.name ?? user.email}</Text>
            <TouchableOpacity onPress={handleSignOut} activeOpacity={0.7}>
              <Text style={styles.signOutText}>Sign out</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function NavCard({ icon, label, meta, onPress }: {
  icon: React.ReactNode;
  label: string;
  meta: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.card, styles.navCard]} onPress={onPress} activeOpacity={0.7}>
      {icon}
      <Text style={styles.navCardLabel}>{label}</Text>
      <Text style={styles.navCardMeta}>{meta}</Text>
      <ChevronRight size={16} color={T.muted} style={{ marginTop: 'auto' } as never} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: T.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: D.pad,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  headerLeft: {
    gap: 2,
  },
  headerTitle: {
    fontFamily: F.uiSemi,
    fontSize: 21,
    color: T.text,
    letterSpacing: -0.2,
  },
  headerSub: {
    fontFamily: F.uiMed,
    fontSize: 12,
    color: T.textDim,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 30,
    paddingHorizontal: 11,
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.28)',
    borderRadius: R.chip,
  },
  streakText: {
    fontFamily: F.uiSemi,
    fontSize: 13,
    color: T.gold,
  },
  scroll: {
    flex: 1,
  },
  body: {
    padding: D.pad,
    gap: D.stack,
  },
  heroCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: T.primary,
    borderRadius: R.card,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  heroCtaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroCtaIcon: {
    width: 38,
    height: 38,
    borderRadius: R.sm,
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCtaPlus: {
    fontFamily: F.uiBold,
    fontSize: 24,
    color: T.onPrimary,
    lineHeight: 26,
  },
  heroCtaTitle: {
    fontFamily: F.uiBold,
    fontSize: 16,
    color: T.onPrimary,
  },
  heroCtaSub: {
    fontFamily: F.uiMed,
    fontSize: 12,
    color: 'rgba(13,15,20,0.65)',
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    fontFamily: F.uiBold,
    fontSize: 11,
    color: T.textDim,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  card: {
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: R.card,
    padding: D.cardPad,
  },
  lastSessionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  lastSessionName: {
    fontFamily: F.uiSemi,
    fontSize: 17,
    color: T.text,
    letterSpacing: -0.2,
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statNum: {
    fontFamily: F.monoBold,
    fontSize: 19,
    color: T.text,
  },
  statNumDim: {
    fontFamily: F.mono,
    fontSize: 15,
    color: T.muted,
  },
  statKey: {
    fontFamily: F.uiMed,
    fontSize: 10,
    color: T.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: T.border,
  },
  grid2: {
    flexDirection: 'row',
    gap: D.gap,
  },
  navCard: {
    flex: 1,
    gap: 6,
    minHeight: 100,
  },
  navCardLabel: {
    fontFamily: F.uiSemi,
    fontSize: 15,
    color: T.text,
    marginTop: 4,
  },
  navCardMeta: {
    fontFamily: F.uiMed,
    fontSize: 12,
    color: T.textDim,
  },
  wideNavCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  navCardText: {
    flex: 1,
  },
  listCard: {
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: R.card,
    overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: D.cardPad,
    paddingVertical: 16,
  },
  rowDivider: {
    height: 1,
    backgroundColor: T.border,
    marginLeft: D.cardPad + 22 + 14,
  },
  listRowText: {
    flex: 1,
  },
  listRowTitle: {
    fontFamily: F.uiMed,
    fontSize: 15,
    color: T.text,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  userEmail: {
    fontFamily: F.uiMed,
    fontSize: 13,
    color: T.textDim,
  },
  signOutText: {
    fontFamily: F.uiMed,
    fontSize: 13,
    color: T.muted,
  },
});
