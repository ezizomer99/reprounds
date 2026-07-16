import { StyleSheet, Text, View } from 'react-native';
import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useSessions } from '../hooks/useSession';
import { mondayOf, weekKey, computeWeekStreak } from '../lib/statsHelpers';
import { F, R, ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { withAlpha } from '../lib/color';

interface WeekDay {
  date: Date;
  abbrev: string;
  dayNum: number;
  isoDate: string;
}

function getWeekDays(): WeekDay[] {
  const now = new Date();
  const dow = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dow + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return {
      date: d,
      abbrev: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3).toUpperCase(),
      dayNum: d.getDate(),
      isoDate: d.toISOString().slice(0, 10),
    };
  });
}

function isToday(d: Date): boolean {
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

/**
 * Unified "My Week" block shared by the Workout and Martial Arts tabs.
 * One combined streak across all training, with per-activity trackers and
 * color-coded day dots (primary = gym, grappling = mat).
 */
export function MyWeek() {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { data: sessions } = useSessions('completed');

  const weekDays = useMemo(getWeekDays, []);

  const week = useMemo(() => {
    const completed = sessions ?? [];
    const allDates = completed.map((s) => s.date);
    const gymDates = completed.filter((s) => s.kinds?.includes('exercise')).map((s) => s.date);
    const matDates = completed
      .filter((s) => s.kinds?.includes('martial_arts'))
      .map((s) => s.date);
    const thisWeek = mondayOf(new Date()).toISOString().slice(0, 10);
    return {
      gymDays: new Set(gymDates),
      matDays: new Set(matDates),
      streak: computeWeekStreak(allDates),
      gymStreak: computeWeekStreak(gymDates),
      matStreak: computeWeekStreak(matDates),
      weekCount: allDates.filter((d) => weekKey(d) === thisWeek).length,
    };
  }, [sessions]);

  return (
    <View style={styles.card}>
      <View style={styles.weekHeader}>
        <View style={styles.weekHeaderLeft}>
          <View style={styles.calIconBox}>
            <Ionicons name="calendar-outline" size={16} color={T.textDim} />
          </View>
          <Text style={styles.weekTitle}>My Week</Text>
        </View>
      </View>
      <Text style={styles.weekSub}>
        {week.weekCount > 0
          ? `${week.weekCount} session${week.weekCount !== 1 ? 's' : ''} this week`
          : 'Log a session to start your streak'}
      </Text>

      <View style={styles.weekStrip}>
        {weekDays.map((wd) => {
          const today = isToday(wd.date);
          const hasGym = week.gymDays.has(wd.isoDate);
          const hasMat = week.matDays.has(wd.isoDate);
          return (
            <View key={wd.isoDate} style={styles.weekDayCol}>
              <Text style={[styles.weekDayAbbrev, today && styles.weekDayAbbrevActive]}>
                {wd.abbrev}
              </Text>
              <View style={[styles.weekDayCircle, today && styles.weekDayCircleActive]}>
                <Text style={[styles.weekDayNum, today && styles.weekDayNumActive]}>
                  {wd.dayNum}
                </Text>
              </View>
              <View style={styles.dotRow}>
                {hasGym && <View style={styles.gymDot} />}
                {hasMat && <View style={styles.matDot} />}
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.streakRow}>
        <View style={styles.streakChip}>
          <View style={[styles.streakIconBg, { backgroundColor: withAlpha(T.primary, 0.15) }]}>
            <Ionicons name="flash" size={14} color={T.primary} />
          </View>
          <View>
            <Text style={styles.streakNum}>
              {week.streak} week{week.streak !== 1 ? 's' : ''}
            </Text>
            <Text style={styles.streakLabel}>current streak</Text>
          </View>
        </View>
        <View style={styles.miniChip}>
          <View style={[styles.streakIconBg, { backgroundColor: withAlpha(T.primary, 0.15) }]}>
            <Ionicons name="barbell-outline" size={14} color={T.primary} />
          </View>
          <View>
            <Text style={styles.streakNum}>{week.gymStreak} wk</Text>
            <Text style={styles.streakLabel}>gym</Text>
          </View>
        </View>
        <View style={styles.miniChip}>
          <View style={[styles.streakIconBg, { backgroundColor: withAlpha(T.grappling, 0.15) }]}>
            <Ionicons name="body-outline" size={14} color={T.grappling} />
          </View>
          <View>
            <Text style={styles.streakNum}>{week.matStreak} wk</Text>
            <Text style={styles.streakLabel}>mat</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    // Broadsheet: flat section separated by a rule — horizontal padding comes
    // from the parent so both tabs align it with their own gutters.
    card: {
      borderTopWidth: 1,
      borderTopColor: T.borderStrong,
      paddingTop: 14,
      paddingBottom: 4,
    },

    weekHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    weekHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    calIconBox: {
      width: 28,
      height: 28,
      borderRadius: R.sm,
      backgroundColor: T.surface2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    weekTitle: { fontFamily: F.uiBold, fontSize: 12, color: T.textDim, textTransform: 'uppercase', letterSpacing: 1 },
    weekSub: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim, marginBottom: 14 },

    weekStrip: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
    weekDayCol: { alignItems: 'center', gap: 5, flex: 1 },
    weekDayAbbrev: { fontFamily: F.uiMed, fontSize: 10, color: T.textDim, letterSpacing: 0.3 },
    weekDayAbbrevActive: { color: T.primary, fontFamily: F.uiBold },
    weekDayCircle: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    weekDayCircleActive: { backgroundColor: T.primary },
    weekDayNum: { fontFamily: F.monoBold, fontSize: 14, color: T.text },
    weekDayNumActive: { color: T.onPrimary },
    dotRow: { flexDirection: 'row', gap: 3, height: 5, marginTop: -2 },
    gymDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: T.primary },
    matDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: T.grappling },

    streakRow: { flexDirection: 'row', gap: 8 },
    streakChip: {
      flex: 1.3,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: T.surface2,
      borderRadius: R.card,
      padding: 10,
    },
    miniChip: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: T.surface2,
      borderRadius: R.card,
      padding: 10,
    },
    streakIconBg: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    streakNum: { fontFamily: F.uiSemi, fontSize: 14, color: T.text },
    streakLabel: { fontFamily: F.uiMed, fontSize: 11, color: T.textDim },
  });
}
