import { useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { CalendarItem, RoutineWithItems } from '@app/shared';
import { useCalendar } from '../../../src/hooks/useCalendar';
import { useRoutines, useSkipOccurrence, useUpdateRoutine } from '../../../src/hooks/useRoutines';
import { useCreateSession } from '../../../src/hooks/useSession';
import { T, F, R, D } from '../../../src/theme/colors';
import { withAlpha } from '../../../src/lib/color';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const BYDAY_VALUES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

const DAY_FULL: Record<string, string> = {
  MO: 'Monday', TU: 'Tuesday', WE: 'Wednesday', TH: 'Thursday',
  FR: 'Friday', SA: 'Saturday', SU: 'Sunday',
};

function formatRRule(rrule: string | null): string {
  if (!rrule) return 'Not scheduled';
  const m = rrule.match(/BYDAY=([A-Z,]+)/);
  if (!m) return rrule;
  const days = m[1].split(',').map((d) => DAY_FULL[d] ?? d);
  if (days.length === 1) return `Every ${days[0]}`;
  return `Every ${days.slice(0, -1).join(', ')} and ${days[days.length - 1]}`;
}

function formatDateLabel(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const out = new Date(d);
  out.setDate(d.getDate() + diff);
  out.setHours(0, 0, 0, 0);
  return out;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(d.getDate() + n);
  return out;
}

function toDateStr(d: Date): string { return d.toISOString().slice(0, 10); }

function formatWeekLabel(start: Date): string {
  const end = addDays(start, 6);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const sm = months[start.getMonth()], em = months[end.getMonth()];
  const yr = end.getFullYear();
  return sm === em
    ? `${sm} ${start.getDate()}–${end.getDate()}, ${yr}`
    : `${sm} ${start.getDate()}–${em} ${end.getDate()}, ${yr}`;
}

function isThisWeek(weekStart: Date): boolean {
  return toDateStr(weekStart) === toDateStr(startOfWeek(new Date()));
}

function getByDaysFromRRule(rrule: string | null): number[] {
  if (!rrule) return [0];
  const match = rrule.match(/BYDAY=([A-Z,]+)/);
  if (!match) return [0];
  const days = match[1].split(',').map((d) => {
    const idx = BYDAY_VALUES.indexOf(d);
    return idx >= 0 ? idx : 0;
  });
  return days.length > 0 ? days : [0];
}

function DayRow({ day, items, routineNameMap, onVirtualTap, onRealTap, onRealLongPress, startingSession }: {
  day: Date;
  items: CalendarItem[];
  routineNameMap: Record<string, string>;
  onVirtualTap: (item: Extract<CalendarItem, { kind: 'virtual' }>) => void;
  onRealTap: (item: Extract<CalendarItem, { kind: 'real' }>) => void;
  onRealLongPress: (item: Extract<CalendarItem, { kind: 'real' }>) => void;
  startingSession: boolean;
}) {
  const dateStr = toDateStr(day);
  const dayItems = items.filter((i) => i.kind === 'virtual' ? i.date === dateStr : i.session.date === dateStr);
  const dayName = DAY_NAMES[(day.getDay() + 6) % 7];
  const isToday = toDateStr(day) === toDateStr(new Date());

  return (
    <View style={styles.dayRow}>
      <View style={[styles.dayLabel, isToday && styles.dayLabelToday]}>
        <Text style={[styles.dayName, isToday && styles.dayNameToday]}>{dayName}</Text>
        <Text style={[styles.dayNum, isToday && styles.dayNumToday]}>{day.getDate()}</Text>
      </View>
      <View style={styles.dayItems}>
        {dayItems.length === 0 && <View style={styles.emptyDay} />}
        {dayItems.map((item, idx) => {
          if (item.kind === 'virtual') {
            return (
              <TouchableOpacity
                key={`v-${item.routineId}-${idx}`}
                style={[styles.pill, styles.pillVirtual, startingSession && { opacity: 0.5 }]}
                onPress={() => !startingSession && onVirtualTap(item)}
                disabled={startingSession}
                activeOpacity={0.7}
              >
                <Text style={styles.pillVirtualText} numberOfLines={1}>
                  {routineNameMap[item.routineId] ?? 'Scheduled'}
                </Text>
              </TouchableOpacity>
            );
          }
          const { session } = item;
          const name = session.routineId ? (routineNameMap[session.routineId] ?? 'Session') : 'Ad-hoc';
          const isDone = session.status === 'completed';
          const isSkipped = session.status === 'skipped';
          return (
            <TouchableOpacity
              key={`r-${session.id}`}
              style={[styles.pill, isDone ? styles.pillDone : isSkipped ? styles.pillSkipped : styles.pillPlanned]}
              onPress={() => onRealTap(item)}
              onLongPress={() => onRealLongPress(item)}
              activeOpacity={0.7}
            >
              <Text style={[styles.pillRealText, isSkipped && styles.pillSkippedText]} numberOfLines={1}>{name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// Schedule a routine (create mode = pick an unscheduled routine; edit mode = bound to one routine).
function ScheduleModal({ visible, mode, routine, unscheduled, onClose }: {
  visible: boolean;
  mode: 'create' | 'edit';
  routine: RoutineWithItems | null;
  unscheduled: RoutineWithItems[];
  onClose: () => void;
}) {
  const today = toDateStr(new Date());
  const [routineId, setRoutineId] = useState('');
  const [byDays, setByDays] = useState<number[]>([0]);
  const [startDate, setStartDate] = useState(today);

  const updateRoutine = useUpdateRoutine();

  function handleOpen() {
    if (mode === 'edit' && routine) {
      setRoutineId(routine.id);
      setByDays(getByDaysFromRRule(routine.rrule));
      setStartDate(routine.startDate ?? today);
    } else {
      setRoutineId(unscheduled[0]?.id ?? '');
      setByDays([0]);
      setStartDate(today);
    }
  }

  function toggleDay(idx: number) {
    setByDays((prev) => {
      if (prev.includes(idx)) {
        if (prev.length === 1) return prev;
        return prev.filter((d) => d !== idx);
      }
      return [...prev, idx].sort((a, b) => a - b);
    });
  }

  function handleSave() {
    const id = mode === 'edit' && routine ? routine.id : routineId;
    if (!id) return;
    const rrule = `FREQ=WEEKLY;BYDAY=${byDays.map((i) => BYDAY_VALUES[i]).join(',')}`;
    updateRoutine.mutate(
      { id, rrule, startDate },
      {
        onSuccess: onClose,
        onError: (err) => Alert.alert('Error', err.message ?? 'Could not save schedule.'),
      },
    );
  }

  const canSave = (mode === 'edit' ? !!routine : !!routineId) && !updateRoutine.isPending;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onShow={handleOpen} onRequestClose={onClose}>
      <View style={styles.modal}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalCancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{mode === 'edit' ? 'Edit Schedule' : 'Schedule Routine'}</Text>
          <TouchableOpacity onPress={handleSave} disabled={!canSave}>
            <Text style={[styles.modalSaveText, !canSave && { opacity: 0.35 }]}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1, padding: D.pad }} keyboardShouldPersistTaps="handled">
          {mode === 'edit' ? (
            <>
              <Text style={styles.fieldLabel}>Routine</Text>
              <View style={styles.boundRoutine}>
                <Text style={styles.boundRoutineText}>{routine?.name ?? ''}</Text>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.fieldLabel}>Routine</Text>
              {unscheduled.length === 0 ? (
                <Text style={styles.emptyHint}>Every routine is already scheduled. Create a new routine first.</Text>
              ) : (
                <View style={{ gap: 6 }}>
                  {unscheduled.map((r) => (
                    <TouchableOpacity
                      key={r.id}
                      style={[styles.routineOpt, routineId === r.id && styles.routineOptSel]}
                      onPress={() => setRoutineId(r.id)}
                    >
                      <Text style={[styles.routineOptText, routineId === r.id && styles.routineOptTextSel]}>{r.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}

          <Text style={[styles.fieldLabel, { marginTop: 24 }]}>Days of Week</Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {DAY_NAMES.map((d, idx) => {
              const active = byDays.includes(idx);
              return (
                <TouchableOpacity
                  key={d}
                  style={[styles.dayBtn, active && styles.dayBtnSel]}
                  onPress={() => toggleDay(idx)}
                >
                  <Text style={[styles.dayBtnText, active && styles.dayBtnTextSel]}>{d}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.fieldLabel, { marginTop: 24 }]}>Start Date (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.textInput}
            value={startDate}
            onChangeText={setStartDate}
            placeholder="2026-06-15"
            placeholderTextColor={T.muted}
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
          />
          <View style={{ height: 48 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

function ScheduleDetailModal({ visible, routine, onClose, onEdit, onRemove }: {
  visible: boolean;
  routine: RoutineWithItems | null;
  onClose: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  if (!routine) return null;
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.detailModal}>
        <View style={styles.detailHeader}>
          <TouchableOpacity style={styles.detailClose} onPress={onClose}>
            <Ionicons name="close" size={22} color={T.textDim} />
          </TouchableOpacity>
          <Text style={styles.detailHeaderTitle}>Scheduled Routine</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={styles.detailHero}>
            <View style={styles.detailHeroIcon}>
              <Ionicons name="calendar-outline" size={26} color={T.primary} />
            </View>
            <Text style={styles.detailHeroName}>{routine.name}</Text>
          </View>

          <View style={styles.detailInfoCard}>
            <View style={styles.detailInfoRow}>
              <Ionicons name="repeat-outline" size={18} color={T.textDim} />
              <View style={{ flex: 1 }}>
                <Text style={styles.detailInfoLabel}>Repeats</Text>
                <Text style={styles.detailInfoValue}>{formatRRule(routine.rrule)}</Text>
              </View>
            </View>
            <View style={{ height: 1, backgroundColor: T.border }} />
            <View style={styles.detailInfoRow}>
              <Ionicons name="play-circle-outline" size={18} color={T.textDim} />
              <View style={{ flex: 1 }}>
                <Text style={styles.detailInfoLabel}>Starting</Text>
                <Text style={styles.detailInfoValue}>{formatDateLabel(routine.startDate)}</Text>
              </View>
            </View>
            {routine.endDate && (
              <>
                <View style={{ height: 1, backgroundColor: T.border }} />
                <View style={styles.detailInfoRow}>
                  <Ionicons name="stop-circle-outline" size={18} color={T.textDim} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailInfoLabel}>Ending</Text>
                    <Text style={styles.detailInfoValue}>{formatDateLabel(routine.endDate)}</Text>
                  </View>
                </View>
              </>
            )}
          </View>

          <View style={styles.detailActionsCard}>
            <TouchableOpacity style={styles.detailAction} onPress={onEdit} activeOpacity={0.7}>
              <Ionicons name="pencil-outline" size={18} color={T.primary} />
              <Text style={[styles.detailActionText, { color: T.primary }]}>Edit Schedule</Text>
            </TouchableOpacity>
            <View style={{ height: 1, backgroundColor: T.border }} />
            <TouchableOpacity style={styles.detailAction} onPress={onRemove} activeOpacity={0.7}>
              <Ionicons name="trash-outline" size={18} color={T.danger} />
              <Text style={[styles.detailActionText, { color: T.danger }]}>Remove from Schedule</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.detailFootnote}>
            Removing the schedule keeps the routine — you can still run it any time and re-schedule it later.
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function CalendarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [scheduleMode, setScheduleMode] = useState<'create' | 'edit'>('create');
  const [showSchedule, setShowSchedule] = useState(false);
  const [editRoutine, setEditRoutine] = useState<RoutineWithItems | null>(null);
  const [selectedRoutine, setSelectedRoutine] = useState<RoutineWithItems | null>(null);
  const [startingSession, setStartingSession] = useState(false);

  const from = toDateStr(weekStart);
  const to = toDateStr(addDays(weekStart, 6));

  const { data: calendarData } = useCalendar(from, to);
  const { data: routines } = useRoutines();
  const updateRoutine = useUpdateRoutine();
  const skipOccurrence = useSkipOccurrence();
  const createSession = useCreateSession();

  const items: CalendarItem[] = calendarData?.items ?? [];
  const routineList: RoutineWithItems[] = routines ?? [];
  const scheduledRoutines = routineList.filter((r) => r.rrule);
  const unscheduledRoutines = routineList.filter((r) => !r.rrule);

  const routineNameMap: Record<string, string> = {};
  for (const r of routineList) routineNameMap[r.id] = r.name;

  async function handleVirtualTap(item: Extract<CalendarItem, { kind: 'virtual' }>) {
    if (startingSession) return;
    setStartingSession(true);
    try {
      const session = await createSession.mutateAsync({
        routineId: item.routineId,
        date: item.date,
      });
      router.push({ pathname: '/sessions/[id]', params: { id: session.id } } as never);
    } catch (err) {
      Alert.alert('Error', (err as Error).message ?? 'Could not start session.');
    } finally {
      setStartingSession(false);
    }
  }

  function handleRealTap(item: Extract<CalendarItem, { kind: 'real' }>) {
    router.push({ pathname: '/sessions/[id]', params: { id: item.session.id } } as never);
  }

  function handleRealLongPress(item: Extract<CalendarItem, { kind: 'real' }>) {
    const { session } = item;
    if (session.status === 'completed' || !session.routineId) return;
    const routineId = session.routineId;
    Alert.alert('Skip this day?', 'Mark this scheduled session as skipped?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Skip', style: 'destructive', onPress: () => skipOccurrence.mutate({ id: routineId, date: session.date }) },
    ]);
  }

  function handleRemoveSchedule(routine: RoutineWithItems) {
    Alert.alert('Remove from schedule', `Stop scheduling "${routine.name}"? The routine itself is kept.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => updateRoutine.mutate({ id: routine.id, rrule: null, startDate: null, endDate: null }),
      },
    ]);
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const isCurrentWeek = isThisWeek(weekStart);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={T.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Calendar</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => { setScheduleMode('create'); setEditRoutine(null); setShowSchedule(true); }}>
          <Ionicons name="add" size={22} color={T.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
        {/* Week nav */}
        <View style={styles.weekNavCard}>
          <TouchableOpacity style={styles.navArrow} onPress={() => setWeekStart((w) => addDays(w, -7))}>
            <Ionicons name="chevron-back" size={22} color={T.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            {isCurrentWeek && <Text style={styles.weekLabel2}>This week</Text>}
            <Text style={styles.weekLabel}>{formatWeekLabel(weekStart)}</Text>
          </View>
          {!isCurrentWeek && (
            <TouchableOpacity style={styles.todayBtn} onPress={() => setWeekStart(startOfWeek(new Date()))}>
              <Text style={styles.todayBtnText}>Today</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.navArrow} onPress={() => setWeekStart((w) => addDays(w, 7))}>
            <Ionicons name="chevron-forward" size={22} color={T.text} />
          </TouchableOpacity>
        </View>

        {/* Day rows */}
        <View style={styles.weekGrid}>
          {weekDays.map((day) => (
            <DayRow
              key={toDateStr(day)}
              day={day}
              items={items}
              routineNameMap={routineNameMap}
              onVirtualTap={handleVirtualTap}
              onRealTap={handleRealTap}
              onRealLongPress={handleRealLongPress}
              startingSession={startingSession}
            />
          ))}
        </View>

        {/* Scheduled routines section */}
        <Text style={[styles.eyebrow, { marginTop: 24 }]}>Scheduled Routines</Text>
        {scheduledRoutines.length === 0 ? (
          <Text style={styles.emptyHint}>No routines scheduled. Tap + to schedule one.</Text>
        ) : (
          <View style={styles.rulesCard}>
            {scheduledRoutines.map((routine, idx) => (
              <View key={routine.id}>
                <TouchableOpacity
                  style={styles.ruleRow}
                  onPress={() => setSelectedRoutine(routine)}
                  activeOpacity={0.7}
                >
                  <View style={styles.ruleIcon}>
                    <Ionicons name="repeat-outline" size={17} color={T.textDim} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ruleName} numberOfLines={1}>{routine.name}</Text>
                    <Text style={styles.ruleSubtitle}>{formatRRule(routine.rrule)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={T.muted} />
                </TouchableOpacity>
                {idx < scheduledRoutines.length - 1 && <View style={{ height: 1, backgroundColor: T.border }} />}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <ScheduleModal
        visible={showSchedule}
        mode={scheduleMode}
        routine={editRoutine}
        unscheduled={unscheduledRoutines}
        onClose={() => { setShowSchedule(false); setEditRoutine(null); }}
      />

      <ScheduleDetailModal
        visible={selectedRoutine !== null}
        routine={selectedRoutine}
        onClose={() => setSelectedRoutine(null)}
        onEdit={() => { setScheduleMode('edit'); setEditRoutine(selectedRoutine); setSelectedRoutine(null); setShowSchedule(true); }}
        onRemove={() => { if (selectedRoutine) handleRemoveSchedule(selectedRoutine); setSelectedRoutine(null); }}
      />
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
  addBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontFamily: F.uiSemi, fontSize: 19, color: T.text, letterSpacing: -0.2, textAlign: 'center' },
  body: { padding: D.pad, gap: D.stack },

  weekNavCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: T.surface, borderWidth: 1, borderColor: T.border,
    borderRadius: R.card, paddingVertical: 8, paddingHorizontal: 8,
  },
  navArrow: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  weekLabel: { fontFamily: F.uiSemi, fontSize: 14, color: T.text },
  weekLabel2: { fontFamily: F.uiMed, fontSize: 11, color: T.textDim, marginBottom: 2 },
  todayBtn: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: R.sm,
    borderWidth: 1, borderColor: T.borderStrong, backgroundColor: T.surface2,
    marginRight: 4,
  },
  todayBtnText: { fontFamily: F.uiSemi, fontSize: 12, color: T.text },

  weekGrid: {
    backgroundColor: T.surface, borderWidth: 1, borderColor: T.border,
    borderRadius: R.card, overflow: 'hidden',
  },
  dayRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    minHeight: 52, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  dayLabel: { width: 52, alignItems: 'center', paddingTop: 2, gap: 1 },
  dayLabelToday: {},
  dayName: { fontFamily: F.uiSemi, fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  dayNameToday: { color: T.primary },
  dayNum: { fontFamily: F.monoBold, fontSize: 16, color: T.textDim },
  dayNumToday: { color: T.primary },
  dayItems: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingLeft: 8, paddingRight: 8 },
  emptyDay: { height: 4 },

  pill: { borderRadius: R.chip, paddingHorizontal: 10, paddingVertical: 4 },
  pillVirtual: { backgroundColor: withAlpha(T.primary, 0.15), borderWidth: 1, borderStyle: 'dashed', borderColor: withAlpha(T.primary, 0.4) },
  pillVirtualText: { fontFamily: F.uiSemi, fontSize: 12, color: T.primary },
  pillDone: { backgroundColor: withAlpha(T.primary, 0.18) },
  pillPlanned: { backgroundColor: T.surface2, borderWidth: 1, borderColor: T.borderStrong },
  pillSkipped: { backgroundColor: T.surface2 },
  pillRealText: { fontFamily: F.uiSemi, fontSize: 12, color: T.text },
  pillSkippedText: { textDecorationLine: 'line-through', color: T.muted },

  eyebrow: { fontFamily: F.uiBold, fontSize: 11, color: T.textDim, textTransform: 'uppercase', letterSpacing: 1.2 },
  emptyHint: { fontFamily: F.uiMed, fontSize: 14, color: T.muted },
  rulesCard: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: R.card, overflow: 'hidden' },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: D.cardPad, paddingVertical: 14 },
  ruleIcon: { width: 34, height: 34, borderRadius: R.sm, backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  ruleName: { fontFamily: F.uiSemi, fontSize: 14, color: T.text },
  ruleSubtitle: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim, marginTop: 1 },

  // Schedule detail modal
  detailModal: { flex: 1, backgroundColor: T.bg },
  detailHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: D.pad, paddingTop: 56, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  detailClose: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  detailHeaderTitle: { fontFamily: F.uiSemi, fontSize: 17, color: T.text },
  detailHero: { alignItems: 'center', paddingVertical: 28, gap: 10 },
  detailHeroIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: withAlpha(T.primary, 0.15), alignItems: 'center', justifyContent: 'center' },
  detailHeroName: { fontFamily: F.uiBold, fontSize: 20, color: T.text },
  detailInfoCard: { marginHorizontal: D.pad, backgroundColor: T.surface, borderRadius: R.card, borderWidth: 1, borderColor: T.border, overflow: 'hidden' },
  detailInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: D.cardPad, paddingVertical: 14 },
  detailInfoLabel: { fontFamily: F.uiBold, fontSize: 10, color: T.textDim, textTransform: 'uppercase', letterSpacing: 0.6 },
  detailInfoValue: { fontFamily: F.uiMed, fontSize: 14, color: T.text, marginTop: 2 },
  detailActionsCard: { marginHorizontal: D.pad, marginTop: 14, backgroundColor: T.surface, borderRadius: R.card, borderWidth: 1, borderColor: T.border, overflow: 'hidden' },
  detailAction: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: D.cardPad, paddingVertical: 16 },
  detailActionText: { fontFamily: F.uiSemi, fontSize: 15 },
  detailFootnote: { fontFamily: F.uiMed, fontSize: 12, color: T.muted, paddingHorizontal: D.pad, paddingTop: 12, lineHeight: 17 },

  // Schedule create/edit modal
  modal: { flex: 1, backgroundColor: T.bg },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: D.pad, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: T.border, paddingTop: 56,
  },
  modalTitle: { fontFamily: F.uiSemi, fontSize: 17, color: T.text },
  modalCancelText: { fontFamily: F.uiMed, fontSize: 16, color: T.textDim },
  modalSaveText: { fontFamily: F.uiSemi, fontSize: 16, color: T.primary },
  fieldLabel: { fontFamily: F.uiBold, fontSize: 11, color: T.textDim, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  boundRoutine: {
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: R.sm,
    borderWidth: 1, borderColor: T.border, backgroundColor: T.surface2,
  },
  boundRoutineText: { fontFamily: F.uiSemi, fontSize: 15, color: T.text },
  routineOpt: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: R.sm,
    borderWidth: 1, borderColor: T.border, backgroundColor: T.surface,
  },
  routineOptSel: { borderColor: T.primary, backgroundColor: withAlpha(T.primary, 0.1) },
  routineOptText: { fontFamily: F.uiMed, fontSize: 15, color: T.textDim },
  routineOptTextSel: { color: T.primary, fontFamily: F.uiSemi },
  dayBtn: {
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: R.sm,
    borderWidth: 1, borderColor: T.border, backgroundColor: T.surface,
  },
  dayBtnSel: { backgroundColor: T.primary, borderColor: T.primary },
  dayBtnText: { fontFamily: F.uiMed, fontSize: 13, color: T.textDim },
  dayBtnTextSel: { color: T.onPrimary, fontFamily: F.uiSemi },
  textInput: {
    backgroundColor: T.surface, borderWidth: 1, borderColor: T.border,
    borderRadius: R.sm, paddingHorizontal: 12, paddingVertical: 10,
    fontFamily: F.uiMed, fontSize: 15, color: T.text,
  },
});
