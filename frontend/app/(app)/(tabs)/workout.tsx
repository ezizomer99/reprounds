import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { RoutineWithItems } from '@app/shared';
import { useCurrentUser } from '../../../src/hooks/useAuth';
import { useSessions } from '../../../src/hooks/useSession';
import { useRoutines } from '../../../src/hooks/useRoutines';
import { InlineError } from '../../../src/components/InlineError';
import { CutCornerView } from '../../../src/components/CutCornerView';
import { MyWeek } from '../../../src/components/MyWeek';
import { Skeleton } from '../../../src/components/Skeleton';
import { F, R, D, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { withAlpha } from '../../../src/lib/color';

function greeting(name: string | null): string {
  const hour = new Date().getHours();
  const time = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const first = name?.split(' ')[0] ?? 'Athlete';
  return `Good ${time}, ${first}`;
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

function RoutineCard({
  routine,
  onPress,
}: {
  routine: RoutineWithItems;
  onPress: () => void;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  return (
    <TouchableOpacity style={styles.routineCard} onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }} activeOpacity={0.7}>
      <View style={styles.routineIconBox}>
        <Ionicons name="layers-outline" size={20} color={T.primary} />
      </View>
      <Text style={styles.routineName} numberOfLines={1}>
        {routine.name}
      </Text>
      <Text style={styles.routineMeta}>
        {routine.items.length} exercise{routine.items.length !== 1 ? 's' : ''}
      </Text>
    </TouchableOpacity>
  );
}

export default function WorkoutTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { data: user } = useCurrentUser();
  const { isError: sessionsError, refetch: refetchSessions } = useSessions('completed');
  const {
    data: routines,
    isLoading: routinesLoading,
    isError: routinesError,
    refetch: refetchRoutines,
  } = useRoutines();
  const hasError = sessionsError || routinesError;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.greeting}>{greeting(user?.name ?? null)}</Text>
        <Text style={styles.todayLabel}>{todayLabel()}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        {hasError && (
          <InlineError
            message="Couldn't refresh your recent workouts. Showing what we have."
            onRetry={() => {
              if (sessionsError) void refetchSessions();
              if (routinesError) void refetchRoutines();
            }}
          />
        )}

        {/* Quick Start */}
        <View style={styles.card}>
          <View style={styles.quickStartRow}>
            <View style={styles.quickIconBox}>
              <Ionicons name="flash" size={18} color={T.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.quickTitle}>Quick start</Text>
              <Text style={styles.quickSub}>Start right away and add exercises as you go!</Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/sessions/new' as never)}
            activeOpacity={0.85}
          >
            <CutCornerView fill={T.primary} style={styles.startBtn}>
              <Ionicons name="add" size={20} color={T.onPrimary} />
              <Text style={styles.startBtnText}>Start New Workout</Text>
            </CutCornerView>
          </TouchableOpacity>
        </View>

        {/* My Week */}
        <MyWeek />

        {/* Routines */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Routines</Text>
          <TouchableOpacity
            onPress={() => router.push('/routines' as never)}
            activeOpacity={0.7}
          >
            <Text style={styles.viewAll}>View all</Text>
          </TouchableOpacity>
        </View>

        {routinesLoading ? (
          // Was falling through to the "No routines yet" empty state on a cold
          // load, telling users with routines that they had none.
          <View style={[styles.routinesList, { flexDirection: 'row', gap: 12 }]}>
            <Skeleton width={150} height={96} radius={R.sm} />
            <Skeleton width={150} height={96} radius={R.sm} />
          </View>
        ) : routines && routines.length > 0 ? (
          <FlatList
            data={routines}
            keyExtractor={(t) => t.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.routinesList}
            renderItem={({ item }) => (
              <RoutineCard
                routine={item}
                onPress={() =>
                  router.push({
                    pathname: '/routines/[id]',
                    params: { id: item.id },
                  } as never)
                }
              />
            )}
          />
        ) : (
          <View style={[styles.card, styles.emptyCard]}>
            <Text style={styles.emptyText}>No routines yet.</Text>
            <TouchableOpacity
              onPress={() => router.push('/routines' as never)}
              activeOpacity={0.7}
            >
              <Text style={styles.emptyLink}>Create your first routine →</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: T.bg },

    header: {
      paddingHorizontal: D.pad,
      paddingTop: 14,
      paddingBottom: 14,
      borderBottomWidth: 2,
      borderBottomColor: T.text,
    },
    greeting: { fontFamily: F.uiBold, fontSize: 22, color: T.text, letterSpacing: -0.3 },
    todayLabel: { fontFamily: F.uiMed, fontSize: 13, color: T.textDim, marginTop: 3 },

    scroll: { flex: 1 },
    body: { padding: D.pad, gap: D.stack },

    // Broadsheet: sections are flat, separated by rules — not floating cards.
    card: {
      borderTopWidth: 1,
      borderTopColor: T.borderStrong,
      paddingTop: 14,
      paddingBottom: 4,
    },

    quickStartRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginBottom: 14,
    },
    quickIconBox: {
      width: 32,
      height: 32,
      borderRadius: R.sm,
      backgroundColor: withAlpha(T.primary, 0.14),
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickTitle: { fontFamily: F.uiBold, fontSize: 12, color: T.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
    quickSub: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim },
    startBtn: {
      paddingVertical: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    startBtnText: { fontFamily: F.uiBold, fontSize: 16, color: T.onPrimary },

    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionTitle: { fontFamily: F.uiBold, fontSize: 12, color: T.textDim, textTransform: 'uppercase', letterSpacing: 1.2 },
    viewAll: { fontFamily: F.uiMed, fontSize: 13, color: T.primary },

    routinesList: { gap: 10, paddingVertical: 2 },
    routineCard: {
      width: 160,
      backgroundColor: T.surface,
      borderWidth: 1,
      borderColor: T.border,
      borderRadius: R.card,
      padding: D.cardPad,
      gap: 8,
    },
    routineIconBox: {
      width: 36,
      height: 36,
      borderRadius: R.sm,
      backgroundColor: withAlpha(T.primary, 0.12),
      alignItems: 'center',
      justifyContent: 'center',
    },
    routineName: { fontFamily: F.uiSemi, fontSize: 14, color: T.text },
    routineMeta: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim },

    emptyCard: { alignItems: 'center', paddingVertical: 24, gap: 8 },
    emptyText: { fontFamily: F.uiMed, fontSize: 14, color: T.textDim },
    emptyLink: { fontFamily: F.uiMed, fontSize: 13, color: T.primary },
  });
}
