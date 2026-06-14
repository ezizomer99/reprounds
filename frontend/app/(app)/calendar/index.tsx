import { useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { CalendarItem, ScheduleRule } from '@app/shared';
import {
  useCalendar,
  useCreateScheduleRule,
  useDeleteScheduleRule,
  useScheduleRules,
  useUpdateScheduleRule,
} from '../../../src/hooks/useScheduleRules';
import { useTemplates } from '../../../src/hooks/useTemplates';

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

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatWeekLabel(start: Date): string {
  const end = addDays(start, 6);
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const startMonth = months[start.getMonth()];
  const endMonth = months[end.getMonth()];
  const year = end.getFullYear();
  if (startMonth === endMonth) {
    return `${startMonth} ${start.getDate()}–${end.getDate()}, ${year}`;
  }
  return `${startMonth} ${start.getDate()}–${endMonth} ${end.getDate()}, ${year}`;
}

interface DayRowProps {
  day: Date;
  items: CalendarItem[];
  templateNameMap: Record<string, string>;
  onVirtualTap: (item: Extract<CalendarItem, { kind: 'virtual' }>) => void;
  onRealTap: (item: Extract<CalendarItem, { kind: 'real' }>) => void;
  onRealLongPress: (item: Extract<CalendarItem, { kind: 'real' }>) => void;
}

function DayRow({
  day,
  items,
  templateNameMap,
  onVirtualTap,
  onRealTap,
  onRealLongPress,
}: DayRowProps) {
  const dateStr = toDateStr(day);
  const dayItems = items.filter((item) => {
    if (item.kind === 'virtual') return item.date === dateStr;
    return item.session.date === dateStr;
  });

  const dayName = DAY_NAMES[(day.getDay() + 6) % 7];
  const dateNum = day.getDate();

  return (
    <View style={styles.dayRow}>
      <View style={styles.dayLabel}>
        <Text style={styles.dayName}>{dayName}</Text>
        <Text style={styles.dayNum}>{dateNum}</Text>
      </View>
      <View style={styles.dayItems}>
        {dayItems.map((item, idx) => {
          if (item.kind === 'virtual') {
            const name = templateNameMap[item.templateId] ?? 'Scheduled';
            return (
              <TouchableOpacity
                key={`v-${item.scheduleRuleId}-${idx}`}
                style={[styles.pill, styles.pillVirtual]}
                onPress={() => onVirtualTap(item)}
                activeOpacity={0.7}
              >
                <Text style={styles.pillTextVirtual} numberOfLines={1}>{name}</Text>
              </TouchableOpacity>
            );
          }

          const { session } = item;
          const name = session.templateId
            ? (templateNameMap[session.templateId] ?? 'Session')
            : 'Ad-hoc';
          const isCompleted = session.status === 'completed';
          const isSkipped = session.status === 'skipped';

          return (
            <TouchableOpacity
              key={`r-${session.id}`}
              style={[
                styles.pill,
                isCompleted ? styles.pillCompleted : isSkipped ? styles.pillSkipped : styles.pillReal,
              ]}
              onPress={() => onRealTap(item)}
              onLongPress={() => onRealLongPress(item)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.pillTextReal,
                  isSkipped && styles.pillTextSkipped,
                ]}
                numberOfLines={1}
              >
                {name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

interface RuleModalProps {
  visible: boolean;
  editRule: ScheduleRule | null;
  templates: { id: string; name: string }[];
  onClose: () => void;
}

function RuleModal({ visible, editRule, templates, onClose }: RuleModalProps) {
  const today = toDateStr(new Date());
  const [templateId, setTemplateId] = useState<string>(
    editRule?.templateId ?? (templates[0]?.id ?? ''),
  );
  const [byDay, setByDay] = useState<number>(0);
  const [startDate, setStartDate] = useState<string>(
    editRule?.startDate ?? today,
  );

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
      updateRule.mutate(
        { id: editRule.id, mode: 'all', rrule, templateId, startDate },
        { onSuccess: onClose },
      );
    } else {
      createRule.mutate(
        { templateId, rrule, startDate },
        { onSuccess: onClose },
      );
    }
  }

  const isPending = createRule.isPending || updateRule.isPending;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onShow={handleOpen}
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose} style={styles.modalCancel}>
            <Text style={styles.modalCancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>
            {editRule ? 'Edit Schedule Rule' : 'New Schedule Rule'}
          </Text>
          <TouchableOpacity
            onPress={handleSave}
            style={styles.modalSave}
            disabled={isPending || !templateId}
          >
            <Text style={[styles.modalSaveText, (!templateId || isPending) && styles.disabled]}>
              Save
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
          <Text style={styles.fieldLabel}>Template</Text>
          {templates.length === 0 ? (
            <Text style={styles.emptyHint}>No templates — create one first.</Text>
          ) : (
            <View style={styles.templateList}>
              {templates.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={[
                    styles.templateOption,
                    templateId === t.id && styles.templateOptionSelected,
                  ]}
                  onPress={() => setTemplateId(t.id)}
                >
                  <Text
                    style={[
                      styles.templateOptionText,
                      templateId === t.id && styles.templateOptionTextSelected,
                    ]}
                  >
                    {t.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={styles.fieldLabel}>Day of Week</Text>
          <View style={styles.dayPicker}>
            {DAY_NAMES.map((d, idx) => (
              <TouchableOpacity
                key={d}
                style={[styles.dayBtn, byDay === idx && styles.dayBtnSelected]}
                onPress={() => setByDay(idx)}
              >
                <Text style={[styles.dayBtnText, byDay === idx && styles.dayBtnTextSelected]}>
                  {d}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Start Date (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.textInput}
            value={startDate}
            onChangeText={setStartDate}
            placeholder="2026-06-14"
            placeholderTextColor="#9ca3af"
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
          />
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function CalendarScreen() {
  const router = useRouter();
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
  for (const t of templateList) {
    templateNameMap[t.id] = t.name;
  }

  function handlePrevWeek() {
    setWeekStart((w) => addDays(w, -7));
  }

  function handleNextWeek() {
    setWeekStart((w) => addDays(w, 7));
  }

  function handleVirtualTap(item: Extract<CalendarItem, { kind: 'virtual' }>) {
    Alert.alert('Start session?', `Start session for ${templateNameMap[item.templateId] ?? 'this template'}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Start',
        onPress: () =>
          router.push({
            pathname: '/sessions/new' as never,
            params: { scheduleRuleId: item.scheduleRuleId, date: item.date },
          } as never),
      },
    ]);
  }

  function handleRealTap(item: Extract<CalendarItem, { kind: 'real' }>) {
    router.push({ pathname: '/sessions/[id]', params: { id: item.session.id } } as never);
  }

  function handleRealLongPress(item: Extract<CalendarItem, { kind: 'real' }>) {
    const { session } = item;
    if (session.status === 'completed') return;
    if (!session.scheduleRuleId) return;

    Alert.alert('Remove from schedule', 'Remove this occurrence from your schedule?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          deleteScheduleRule.mutate({
            id: session.scheduleRuleId!,
            mode: 'single',
            date: session.date,
          }),
      },
    ]);
  }

  function handleDeleteRule(rule: ScheduleRule) {
    const name = templateNameMap[rule.templateId] ?? 'this rule';
    Alert.alert(
      'Delete schedule rule',
      `Remove all recurring occurrences for "${name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete all',
          style: 'destructive',
          onPress: () => deleteScheduleRule.mutate({ id: rule.id, mode: 'all' }),
        },
      ],
    );
  }

  function handleEditRule(rule: ScheduleRule) {
    setEditRule(rule);
    setShowAddRule(true);
  }

  function handleCloseModal() {
    setShowAddRule(false);
    setEditRule(null);
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Calendar</Text>
        <TouchableOpacity
          onPress={() => { setEditRule(null); setShowAddRule(true); }}
          style={styles.addRuleButton}
        >
          <Text style={styles.addRuleText}>+ Rule</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <View style={styles.weekNav}>
          <TouchableOpacity onPress={handlePrevWeek} style={styles.weekArrow}>
            <Text style={styles.weekArrowText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.weekLabel}>{formatWeekLabel(weekStart)}</Text>
          <TouchableOpacity onPress={handleNextWeek} style={styles.weekArrow}>
            <Text style={styles.weekArrowText}>›</Text>
          </TouchableOpacity>
        </View>

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

        <View style={styles.rulesSection}>
          <Text style={styles.rulesSectionTitle}>Manage Rules</Text>
          {ruleList.length === 0 ? (
            <Text style={styles.emptyHint}>No schedule rules yet. Tap + Rule to add one.</Text>
          ) : (
            ruleList.map((rule) => (
              <View key={rule.id} style={styles.ruleRow}>
                <View style={styles.ruleInfo}>
                  <Text style={styles.ruleName} numberOfLines={1}>
                    {templateNameMap[rule.templateId] ?? 'Unknown template'}
                  </Text>
                  <Text style={styles.ruleRrule} numberOfLines={1}>{rule.rrule}</Text>
                </View>
                <TouchableOpacity
                  style={styles.ruleActionBtn}
                  onPress={() => handleEditRule(rule)}
                >
                  <Text style={styles.ruleActionEdit}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.ruleActionBtn}
                  onPress={() => handleDeleteRule(rule)}
                >
                  <Text style={styles.ruleActionDelete}>Delete</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <RuleModal
        visible={showAddRule}
        editRule={editRule}
        templates={templateList.map((t) => ({ id: t.id, name: t.name }))}
        onClose={handleCloseModal}
      />
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
  addRuleButton: {
    minWidth: 52,
    alignItems: 'flex-end',
  },
  addRuleText: {
    fontSize: 16,
    color: '#3b82f6',
    fontWeight: '600',
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingBottom: 40,
  },
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  weekArrow: {
    padding: 8,
  },
  weekArrowText: {
    fontSize: 24,
    color: '#3b82f6',
    lineHeight: 28,
  },
  weekLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  weekGrid: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 48,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f3f4f6',
  },
  dayLabel: {
    width: 48,
    alignItems: 'center',
    paddingTop: 2,
  },
  dayName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  dayNum: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  dayItems: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    paddingLeft: 8,
  },
  pill: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 2,
    maxWidth: '100%',
  },
  pillVirtual: {
    backgroundColor: '#dbeafe',
  },
  pillReal: {
    backgroundColor: '#e5e7eb',
  },
  pillCompleted: {
    backgroundColor: '#dcfce7',
  },
  pillSkipped: {
    backgroundColor: '#f3f4f6',
  },
  pillTextVirtual: {
    fontSize: 12,
    color: '#1d4ed8',
    fontWeight: '500',
  },
  pillTextReal: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
  },
  pillTextSkipped: {
    textDecorationLine: 'line-through',
    color: '#9ca3af',
  },
  rulesSection: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  rulesSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  ruleInfo: {
    flex: 1,
    marginRight: 8,
  },
  ruleName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  ruleRrule: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 2,
  },
  ruleActionBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  ruleActionEdit: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '500',
  },
  ruleActionDelete: {
    fontSize: 14,
    color: '#ef4444',
    fontWeight: '500',
  },
  emptyHint: {
    fontSize: 14,
    color: '#9ca3af',
    paddingVertical: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  modalCancel: {
    minWidth: 60,
  },
  modalCancelText: {
    fontSize: 16,
    color: '#3b82f6',
  },
  modalSave: {
    minWidth: 60,
    alignItems: 'flex-end',
  },
  modalSaveText: {
    fontSize: 16,
    color: '#3b82f6',
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.4,
  },
  modalBody: {
    flex: 1,
    padding: 16,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 20,
    marginBottom: 8,
  },
  templateList: {
    gap: 6,
  },
  templateOption: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  templateOptionSelected: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  templateOptionText: {
    fontSize: 15,
    color: '#374151',
  },
  templateOptionTextSelected: {
    color: '#1d4ed8',
    fontWeight: '600',
  },
  dayPicker: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  dayBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  dayBtnSelected: {
    backgroundColor: '#3b82f6',
    borderColor: '#2563eb',
  },
  dayBtnText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },
  dayBtnTextSelected: {
    color: '#fff',
    fontWeight: '700',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#f9fafb',
  },
});
