import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@app/shared';
import { useRoutines } from '../../../src/hooks/useRoutines';
import { useProGate } from '../../../src/hooks/useProGate';
import { F, R, D, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { withAlpha } from '../../../src/lib/color';
import { localTodayISO, toISODate } from '../../../src/lib/calendar';
import { MonthGrid } from '../../../src/components/MonthGrid';
import { CutCornerView } from '../../../src/components/CutCornerView';
import {
  buildRoutineMap,
  sessionIsMat,
  statusLabel,
} from '../../../src/components/SessionRow';

// Fixed scroll window: enough back-history for multi-year training logs
// without infinite-scroll bookkeeping, and a year ahead for scheduling.
const MONTHS_BACK = 24;
const MONTHS_FORWARD = 12;
// Same free-tier window as the History screen.
const FREE_HISTORY_DAYS = 30;

interface MonthItem {
  year: number;
  month0: number;
}

export default function CalendarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { isPro, showPaywall } = useProGate();
  const { data: routines } = useRoutines();
  const routineMap = buildRoutineMap(routines);

  const todayISO = localTodayISO();
  const [sheet, setSheet] = useState<{ iso: string; sessions: Session[] } | null>(null);

  const months = useMemo<MonthItem[]>(() => {
    const now = new Date();
    return Array.from({ length: MONTHS_BACK + 1 + MONTHS_FORWARD }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - MONTHS_BACK + i, 1);
      return { year: d.getFullYear(), month0: d.getMonth() };
    });
  }, []);

  // Free tier: only the trailing history window is visible, like History.
  const cutoffISO = useMemo(() => {
    if (isPro) return null;
    const d = new Date();
    d.setDate(d.getDate() - FREE_HISTORY_DAYS);
    return toISODate(d.getFullYear(), d.getMonth(), d.getDate());
  }, [isPro]);

  function monthIsLocked(m: MonthItem): boolean {
    if (!cutoffISO) return false;
    const lastDay = new Date(m.year, m.month0 + 1, 0);
    return toISODate(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate()) < cutoffISO;
  }

  function handleDayPress(iso: string, daySessions: Session[]) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (cutoffISO && iso < cutoffISO) {
      showPaywall();
      return;
    }
    setSheet({ iso, sessions: daySessions });
  }

  function openSession(id: string) {
    setSheet(null);
    router.push({ pathname: '/sessions/[id]', params: { id } } as never);
  }

  function scheduleWorkout(iso: string) {
    setSheet(null);
    router.push({ pathname: '/sessions/new', params: { date: iso } } as never);
  }

  const sheetTitle = sheet
    ? new Date(sheet.iso + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      })
    : '';
  const sheetIsPast = sheet !== null && sheet.iso < todayISO;

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
        <Text style={styles.headerTitle}>Calendar</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.dayLabelRow}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <Text key={d} style={styles.dayLabel}>
            {d}
          </Text>
        ))}
      </View>

      <FlashList
        data={months}
        keyExtractor={(m) => `${m.year}-${m.month0}`}
        initialScrollIndex={MONTHS_BACK}
        renderItem={({ item }) => (
          <View style={styles.monthWrap}>
            <MonthGrid
              year={item.year}
              month0={item.month0}
              todayISO={todayISO}
              locked={monthIsLocked(item)}
              onDayPress={handleDayPress}
            />
          </View>
        )}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      />

      <Modal
        visible={sheet !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSheet(null)}
      >
        <View style={styles.sheetContainer}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{sheetTitle}</Text>
            <TouchableOpacity onPress={() => setSheet(null)}>
              <Text style={styles.sheetCancel}>Close</Text>
            </TouchableOpacity>
          </View>

          {sheet !== null && sheet.sessions.length === 0 && (
            <View style={styles.sheetEmpty}>
              <Ionicons name="calendar-outline" size={44} color={T.muted} />
              <Text style={styles.sheetEmptyText}>
                {sheetIsPast ? 'No workouts on this day' : 'No planned workouts for this day'}
              </Text>
            </View>
          )}

          {sheet !== null && sheet.sessions.length > 0 && (
            <View style={styles.sheetList}>
              {sheet.sessions.map((s) => {
                const isMat = sessionIsMat(s);
                const routineName = s.routineId ? (routineMap.get(s.routineId) ?? null) : null;
                const isPlanned = s.status === 'planned';
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={styles.sessionRow}
                    onPress={() => openSession(s.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.kindBadge, isMat && styles.kindBadgeMat]}>
                      {isMat ? (
                        <Ionicons name="flash" size={14} color={T.grappling} />
                      ) : (
                        <Ionicons name="barbell" size={14} color={T.textDim} />
                      )}
                    </View>
                    <View style={styles.sessionInfo}>
                      <Text style={styles.sessionName}>
                        {s.name ?? routineName ?? 'Session'}
                      </Text>
                      <Text style={[styles.sessionMeta, isPlanned && styles.sessionMetaPlanned]}>
                        {statusLabel(s)}
                        {s.durationMinutes ? ` · ${s.durationMinutes} min` : ''}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={T.muted} />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {sheet !== null && !sheetIsPast && (
            <View style={styles.sheetFooter}>
              <TouchableOpacity onPress={() => scheduleWorkout(sheet.iso)} activeOpacity={0.8}>
                <CutCornerView fill={T.primary} style={styles.scheduleCta}>
                  <Ionicons name="add" size={18} color={T.onPrimary} />
                  <Text style={styles.scheduleCtaText}>Schedule a workout</Text>
                </CutCornerView>
              </TouchableOpacity>
            </View>
          )}
        </View>
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
      borderBottomWidth: 2, borderBottomColor: T.text,
    },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { flex: 1, fontFamily: F.uiSemi, fontSize: 19, color: T.text, letterSpacing: -0.2, textAlign: 'center' },

    // Pinned weekday header shared by every month, like Lyfta's.
    dayLabelRow: {
      flexDirection: 'row',
      paddingHorizontal: D.pad,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: T.border,
    },
    dayLabel: {
      flex: 1,
      fontFamily: F.uiBold,
      fontSize: 11,
      color: T.textDim,
      textAlign: 'center',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },

    monthWrap: { paddingHorizontal: D.pad, paddingTop: 16 },

    sheetContainer: { flex: 1, backgroundColor: T.bg, padding: D.pad },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 18,
    },
    sheetTitle: { fontFamily: F.uiSemi, fontSize: 18, color: T.text, letterSpacing: -0.2 },
    sheetCancel: { fontFamily: F.uiMed, fontSize: 15, color: T.textDim },

    sheetEmpty: { alignItems: 'center', gap: 12, paddingVertical: 40 },
    sheetEmptyText: { fontFamily: F.uiMed, fontSize: 14, color: T.textDim, textAlign: 'center' },

    sheetList: { marginBottom: 8 },
    sessionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 13,
      borderBottomWidth: 1,
      borderBottomColor: T.border,
    },
    kindBadge: {
      width: 32, height: 32, borderRadius: R.sm,
      backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center',
    },
    kindBadgeMat: { backgroundColor: withAlpha(T.grappling, 0.12) },
    sessionInfo: { flex: 1 },
    sessionName: { fontFamily: F.uiSemi, fontSize: 15, color: T.text, marginBottom: 2 },
    sessionMeta: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim },
    sessionMetaPlanned: { color: T.gold },

    sheetFooter: { marginTop: 12 },
    scheduleCta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 16,
    },
    scheduleCtaText: { fontFamily: F.uiBold, fontSize: 15, color: T.onPrimary },
  });
}
