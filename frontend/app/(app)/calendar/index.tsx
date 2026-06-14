import { useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { CalendarItem, ScheduleRule } from '@app/shared';
import {
  useCalendar, useCreateScheduleRule, useDeleteScheduleRule,
  useScheduleRules, useUpdateScheduleRule,
} from '../../../src/hooks/useScheduleRules';
import { useTemplates } from '../../../src/hooks/useTemplates';
import { T, F, R, D } from '../../../src/theme/colors';
import { withAlpha } from '../../../src/lib/color';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const BYDAY_VALUES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

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

function DayRow({ day, items, templateNameMap, onVirtualTap, onRealTap, onRealLongPress }: {
  day: Date;
  items: CalendarItem[];
  templateNameMap: Record<string, string>;
  onVirtualTap: (item: Extract<CalendarItem, { kind: 'virtual' }>) => void;
  onRealTap: (item: Extract<CalendarItem, { kind: 'real' }>) => void;
  onRealLongPress: (item: Extract<CalendarItem, { kind: 'real' }>) => void;
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
                key={`v-${item.scheduleRuleId}-${idx}`}
                style={[styles.pill, styles.pillVirtual]}
                onPress={() => onVirtualTap(item)}
                activeOpacity={0.7}
              >
                <Text style={styles.pillVirtualText} numberOfLines={1}>
                  {templateNameMap[item.templateId] ?? 'Scheduled'}
                </Text>
              </TouchableOpacity>
            );
          }
          const { session } = item;
          const name = session.templateId ? (templateNameMap[session.templateId] ?? 'Session') : 'Ad-hoc';
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

function RuleModal({ visible, editRule, templates, onClose }: {
  visible: boolean;
  editRule: ScheduleRule | null;
  templates: { id: string; name: string }[];
  onClose: () => void;
}) {
  const today = toDateStr(new Date());
  const [templateId, setTemplateId] = useState(editRule?.templateId ?? (templates[0]?.id ?? ''));
  const [byDay, setByDay] = useState(0);
  const [startDate, setStartDate] = useState(editRule?.startDate ?? today);

  const createRule = useCreateScheduleRule();
  const updateRule = useUpdateScheduleRule();

  function getByDayFromRule(rule: ScheduleRule): number {
    const match = rule.rrule.match(/BYDAY=([A-Z]+)/);
    if (!match) return 0;
    const idx = BYDAY_VALUES.indexOf(match[1]);
    return idx >= 0 ? idx : 0;
  }

  function handleOpen() {
    if (editRule) {
      setTemplateId(editRule.templateId);
      setByDay(getByDayFromRule(editRule));
      setStartDate(editRule.startDate);
    } else {
      setTemplateId(templates[0]?.id ?? '');
      setByDay(0);
      setStartDate(today);
    }
  }

  function handleSave() {
    const rrule = `FREQ=WEEKLY;BYDAY=${BYDAY_VALUES[byDay]}`;
    if (editRule) {
      updateRule.mutate({ id: editRule.id, mode: 'all', rrule, templateId, startDate }, { onSuccess: onClose });
    } else {
      createRule.mutate({ templateId, rrule, startDate }, { onSuccess: onClose });
    }
  }

  const isPending = createRule.isPending || updateRule.isPending;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onShow={handleOpen} onRequestClose={onClose}>
      <View style={styles.modal}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalCancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{editRule ? 'Edit Rule' : 'New Rule'}</Text>
          <TouchableOpacity onPress={handleSave} disabled={isPending || !templateId}>
            <Text style={[styles.modalSaveText, (!templateId || isPending) && { opacity: 0.35 }]}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1, padding: D.pad }} keyboardShouldPersistTaps="handled">
          <Text style={styles.fieldLabel}>Template</Text>
          {templates.length === 0 ? (
            <Text style={styles.emptyHint}>No templates — create one first.</Text>
          ) : (
            <View style={{ gap: 6 }}>
              {templates.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.templateOpt, templateId === t.id && styles.templateOptSel]}
                  onPress={() => setTemplateId(t.id)}
                >
                  <Text style={[styles.templateOptText, templateId === t.id && styles.templateOptTextSel]}>{t.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={[styles.fieldLabel, { marginTop: 24 }]}>Day of Week</Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {DAY_NAMES.map((d, idx) => (
              <TouchableOpacity
                key={d}
                style={[styles.dayBtn, byDay === idx && styles.dayBtnSel]}
                onPress={() => setByDay(idx)}
              >
                <Text style={[styles.dayBtnText, byDay === idx && styles.dayBtnTextSel]}>{d}</Text>
              </TouchableOpacity>
            ))}
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

export default function CalendarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [showAddRule, setShowAddRule] = useState(false);
  const [editRule, setEditRule] = useState<ScheduleRule | null>(null);

  const from = toDateStr(weekStart);
  const to = toDateStr(addDays(weekStart, 6));

  const { data: calendarData } = useCalendar(from, to);
  const { data: rules } = useScheduleRules();
  const { data: templates } = useTemplates();
  const deleteScheduleRule = useDeleteScheduleRule();

  const items: CalendarItem[] = calendarData?.items ?? [];
  const ruleList: ScheduleRule[] = rules ?? [];
  const templateList = templates ?? [];

  const templateNameMap: Record<string, string> = {};
  for (const t of templateList) templateNameMap[t.id] = t.name;

  function handleVirtualTap(item: Extract<CalendarItem, { kind: 'virtual' }>) {
    Alert.alert('Start session?', `Start "${templateNameMap[item.templateId] ?? 'session'}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Start', onPress: () => router.push({ pathname: '/sessions/new' as never, params: { scheduleRuleId: item.scheduleRuleId, date: item.date } } as never) },
    ]);
  }

  function handleRealTap(item: Extract<CalendarItem, { kind: 'real' }>) {
    router.push({ pathname: '/sessions/[id]', params: { id: item.session.id } } as never);
  }

  function handleRealLongPress(item: Extract<CalendarItem, { kind: 'real' }>) {
    const { session } = item;
    if (session.status === 'completed' || !session.scheduleRuleId) return;
    Alert.alert('Remove occurrence?', 'Remove this session from your schedule?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deleteScheduleRule.mutate({ id: session.scheduleRuleId!, mode: 'single', date: session.date }) },
    ]);
  }

  function handleDeleteRule(rule: ScheduleRule) {
    Alert.alert('Delete rule', `Remove all occurrences for "${templateNameMap[rule.templateId] ?? 'this rule'}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete all', style: 'destructive', onPress: () => deleteScheduleRule.mutate({ id: rule.id, mode: 'all' }) },
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
        <TouchableOpacity style={styles.addBtn} onPress={() => { setEditRule(null); setShowAddRule(true); }}>
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
              templateNameMap={templateNameMap}
              onVirtualTap={handleVirtualTap}
              onRealTap={handleRealTap}
              onRealLongPress={handleRealLongPress}
            />
          ))}
        </View>

        {/* Rules section */}
        <Text style={[styles.eyebrow, { marginTop: 24 }]}>Schedule Rules</Text>
        {ruleList.length === 0 ? (
          <Text style={styles.emptyHint}>No rules yet. Tap + to add one.</Text>
        ) : (
          <View style={styles.rulesCard}>
            {ruleList.map((rule, idx) => (
              <View key={rule.id}>
                <View style={styles.ruleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ruleName} numberOfLines={1}>{templateNameMap[rule.templateId] ?? 'Unknown'}</Text>
                    <Text style={styles.ruleRrule}>{rule.rrule}</Text>
                  </View>
                  <TouchableOpacity onPress={() => { setEditRule(rule); setShowAddRule(true); }} style={styles.ruleActionBtn}>
                    <Text style={styles.editText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteRule(rule)} style={styles.ruleActionBtn}>
                    <Text style={styles.deleteText}>Delete</Text>
                  </TouchableOpacity>
                </View>
                {idx < ruleList.length - 1 && <View style={{ height: 1, backgroundColor: T.border }} />}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <RuleModal
        visible={showAddRule}
        editRule={editRule}
        templates={templateList.map((t) => ({ id: t.id, name: t.name }))}
        onClose={() => { setShowAddRule(false); setEditRule(null); }}
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
  ruleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: D.cardPad, paddingVertical: 12, gap: 8 },
  ruleName: { fontFamily: F.uiSemi, fontSize: 14, color: T.text },
  ruleRrule: { fontFamily: F.uiMed, fontSize: 11, color: T.muted, marginTop: 1 },
  ruleActionBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  editText: { fontFamily: F.uiSemi, fontSize: 13, color: T.primary },
  deleteText: { fontFamily: F.uiSemi, fontSize: 13, color: T.danger },

  // Rule modal
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
  emptyHint2: { fontFamily: F.uiMed, fontSize: 14, color: T.muted },
  templateOpt: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: R.sm,
    borderWidth: 1, borderColor: T.border, backgroundColor: T.surface,
  },
  templateOptSel: { borderColor: T.primary, backgroundColor: withAlpha(T.primary, 0.1) },
  templateOptText: { fontFamily: F.uiMed, fontSize: 15, color: T.textDim },
  templateOptTextSel: { color: T.primary, fontFamily: F.uiSemi },
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
