import { useMemo } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RoutineWithItems, Session } from '@app/shared';
import { Touchable } from './ui';
import { F, R, D, ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { withAlpha } from '../lib/color';
import { useSessionsInRange } from '../hooks/useSession';
import { formatDayTitle, monthRange } from '../lib/calendar';
import { sessionIsMat } from '../lib/sessionMarkers';
import { buildRoutineMap, statusLabel } from './SessionRow';
import { CutCornerView } from './CutCornerView';
import { useUnit } from '../units/UnitContext';
import { fmtMinutes, kgToUnit } from '../units/units';

interface DaySheetProps {
  /** The day being shown, or null when closed. */
  iso: string | null;
  todayISO: string;
  routines: RoutineWithItems[] | undefined;
  onClose: () => void;
  onOpenSession: (id: string) => void;
  /**
   * Add a workout for this day. The caller decides schedule-vs-log from a freshly
   * read today — the sheet's own `isPast` only drives the button's wording, so the
   * two can never disagree about what gets created.
   */
  onAddWorkout: (iso: string) => void;
}

export function DaySheet({
  iso,
  todayISO,
  routines,
  onClose,
  onOpenSession,
  onAddWorkout,
}: DaySheetProps) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { unit } = useUnit();
  const routineMap = buildRoutineMap(routines);

  // Query the whole month, not the single day: that key is already populated by
  // the MonthGrid the user just tapped, so the sheet opens with data in hand and
  // stays live through every ['sessions'] invalidation. Reading from a snapshot
  // passed at tap time used to strand the sheet on "no workouts" whenever the
  // month was still loading.
  const [y, m] = iso ? iso.split('-').map(Number) : [0, 1];
  const { from, to } = monthRange(y, m - 1);
  const { data, isLoading, isError, refetch } = useSessionsInRange(from, to, iso !== null);

  const daySessions = useMemo(
    () => (data?.sessions ?? []).filter((s) => s.date === iso),
    [data, iso],
  );

  const totals = useMemo(() => {
    let minutes = 0;
    let volumeKg = 0;
    for (const s of daySessions) {
      minutes += s.durationMinutes ?? 0;
      volumeKg += s.volumeKg ?? 0;
    }
    return { minutes, volumeKg };
  }, [daySessions]);

  const isPast = iso !== null && iso < todayISO;
  // Built from the ISO parts, not `new Date(iso + 'T00:00:00')`: local midnight
  // does not exist on the transition day in zones that spring forward at
  // midnight, so the old idiom tied the heading to the device's timezone rules.
  const title = iso ? formatDayTitle(iso) : '';

  const totalParts = [
    totals.minutes > 0 ? fmtMinutes(totals.minutes) : null,
    totals.volumeKg > 0
      ? `${Math.round(kgToUnit(totals.volumeKg, unit)).toLocaleString()} ${unit}`
      : null,
  ].filter(Boolean);

  return (
    <Modal
      visible={iso !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.sheet}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{title}</Text>
            {totalParts.length > 0 && (
              <Text style={styles.totals}>{totalParts.join(' · ')}</Text>
            )}
          </View>
          <Touchable onPress={onClose} hasTextChild>
            <Text style={styles.close}>Close</Text>
          </Touchable>
        </View>

        {isLoading && (
          <View style={styles.centered}>
            <ActivityIndicator color={T.primary} />
          </View>
        )}

        {isError && !isLoading && (
          <Touchable style={styles.centered} onPress={() => void refetch()} hasTextChild>
            <Text style={styles.errorText}>Couldn&apos;t load this day — tap to retry</Text>
          </Touchable>
        )}

        {!isLoading && !isError && daySessions.length === 0 && (
          <View style={styles.centered}>
            <Ionicons name="calendar-outline" size={44} color={T.muted} />
            <Text style={styles.emptyText}>
              {isPast ? 'No workouts on this day' : 'No planned workouts for this day'}
            </Text>
          </View>
        )}

        {!isLoading && daySessions.length > 0 && (
          <View>
            {daySessions.map((s) => (
              <SessionRowCompact
                key={s.id}
                session={s}
                routineName={s.routineId ? routineMap.get(s.routineId) ?? null : null}
                unit={unit}
                styles={styles}
                T={T}
                onPress={() => onOpenSession(s.id)}
              />
            ))}
          </View>
        )}

        {iso !== null && (
          <View style={styles.footer}>
            <Touchable onPress={() => onAddWorkout(iso)} feedback="card" hasTextChild>
              <CutCornerView fill={T.primary} style={styles.cta}>
                <Ionicons
                  name={isPast ? 'create-outline' : 'add'}
                  size={18}
                  color={T.onPrimary}
                />
                <Text style={styles.ctaText}>
                  {isPast ? 'Log a workout for this day' : 'Schedule a workout'}
                </Text>
              </CutCornerView>
            </Touchable>
          </View>
        )}
      </View>
    </Modal>
  );
}

function SessionRowCompact({
  session,
  routineName,
  unit,
  styles,
  T,
  onPress,
}: {
  session: Session;
  routineName: string | null;
  unit: 'kg' | 'lbs';
  styles: ReturnType<typeof makeStyles>;
  T: ThemeColors;
  onPress: () => void;
}) {
  const isMat = sessionIsMat(session);
  const isPlanned = session.status === 'planned';
  // Mat sessions carry no volume, so that segment drops out on its own.
  const meta = [
    statusLabel(session),
    session.durationMinutes ? fmtMinutes(session.durationMinutes) : null,
    session.volumeKg
      ? `${Math.round(kgToUnit(session.volumeKg, unit)).toLocaleString()} ${unit}`
      : null,
  ].filter(Boolean);

  return (
    <Touchable style={styles.sessionRow} onPress={onPress} feedback="row" hasTextChild>
      <View style={[styles.kindBadge, isMat && styles.kindBadgeMat]}>
        {isMat ? (
          <Ionicons name="flash" size={14} color={T.grappling} />
        ) : (
          <Ionicons name="barbell" size={14} color={T.textDim} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.sessionName}>{session.name ?? routineName ?? 'Session'}</Text>
        <Text style={[styles.sessionMeta, isPlanned && styles.sessionMetaPlanned]}>
          {meta.join(' · ')}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={T.muted} />
    </Touchable>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    sheet: { flex: 1, backgroundColor: T.bg, padding: D.pad },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: 18,
    },
    title: { fontFamily: F.uiSemi, fontSize: 18, color: T.text, letterSpacing: -0.2 },
    totals: { fontFamily: F.uiMed, fontSize: 13, color: T.textDim, marginTop: 3 },
    close: { fontFamily: F.uiMed, fontSize: 15, color: T.textDim },

    centered: { alignItems: 'center', gap: 12, paddingVertical: 40 },
    emptyText: { fontFamily: F.uiMed, fontSize: 14, color: T.textDim, textAlign: 'center' },
    errorText: { fontFamily: F.uiMed, fontSize: 14, color: T.danger, textAlign: 'center' },

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
    sessionName: { fontFamily: F.uiSemi, fontSize: 15, color: T.text, marginBottom: 2 },
    sessionMeta: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim },
    sessionMetaPlanned: { color: T.gold },

    footer: { marginTop: 16 },
    cta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 16,
    },
    ctaText: { fontFamily: F.uiBold, fontSize: 15, color: T.onPrimary },
  });
}
