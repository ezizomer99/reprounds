import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  useCreateWeightLog,
  useDeleteWeightLog,
  useWeightLogs,
} from '../../../src/hooks/useWeightLogs';
import { useUnit } from '../../../src/units/UnitContext';
import { fmtWeight, kgToUnit, unitToKg } from '../../../src/units/units';
import { Sparkline } from '../../../src/components/Sparkline';
import { InlineError } from '../../../src/components/InlineError';
import { CalendarPicker } from '../../../src/components/CalendarPicker';
import { F, R, D, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function WeightScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);

  const { unit } = useUnit();
  const { data, isLoading, isError, refetch, isRefetching } = useWeightLogs();
  const deleteWeight = useDeleteWeightLog();
  const [showAdd, setShowAdd] = useState(false);

  const weights = data ?? []; // ordered date desc
  const latest = weights[0] ?? null;
  const previous = weights[1] ?? null;
  const delta = latest && previous ? latest.weightKg - previous.weightKg : null;
  // Sparkline needs chronological order and numeric values in display unit
  const sparkValues = useMemo(
    () => [...weights].reverse().slice(-20).map((w) => kgToUnit(w.weightKg, unit)),
    [weights, unit],
  );

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
        <Text style={styles.headerTitle}>Body weight</Text>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => setShowAdd(true)}
          accessibilityRole="button"
          accessibilityLabel="Add weigh-in"
        >
          <Ionicons name="add" size={24} color={T.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={weights}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={T.textDim}
          />
        }
        ListHeaderComponent={
          <View style={styles.summaryCard}>
            <View style={styles.summaryTop}>
              <View style={styles.summaryLeft}>
                <Text style={styles.summaryValue}>
                  {latest ? `${fmtWeight(latest.weightKg, unit)} ${unit}` : '—'}
                </Text>
                <Text style={styles.summaryKey}>Latest weigh-in</Text>
                {delta !== null && delta !== 0 && (
                  <View style={styles.deltaRow}>
                    <Ionicons
                      name={delta < 0 ? 'arrow-down' : 'arrow-up'}
                      size={14}
                      color={delta < 0 ? T.conditioning : T.gold}
                    />
                    <Text style={[styles.deltaText, { color: delta < 0 ? T.conditioning : T.gold }]}>
                      {kgToUnit(Math.abs(delta), unit).toFixed(1)} {unit} since last
                    </Text>
                  </View>
                )}
              </View>
              {sparkValues.length >= 2 && (
                <Sparkline values={sparkValues} height={56} />
              )}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowWeight}>{fmtWeight(item.weightKg, unit)} {unit}</Text>
              <Text style={styles.rowMeta}>
                {formatDate(item.date)}{item.notes ? ` · ${item.notes}` : ''}
              </Text>
            </View>
            <TouchableOpacity
              hitSlop={8}
              onPress={() =>
                Alert.alert('Delete entry?', 'This cannot be undone.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => deleteWeight.mutate(item.id) },
                ])
              }
            >
              <Ionicons name="trash-outline" size={16} color={T.muted} />
            </TouchableOpacity>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: D.gap }} />}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={T.primary} />
            </View>
          ) : isError ? (
            <View style={styles.centered}>
              <InlineError message="Couldn't load your weigh-ins." onRetry={() => void refetch()} />
            </View>
          ) : (
            <View style={styles.centered}>
              <Ionicons name="scale-outline" size={40} color={T.muted} />
              <Text style={styles.emptyText}>No weigh-ins yet.</Text>
              <Text style={styles.emptySub}>Log your weight to track it over a fight camp.</Text>
            </View>
          )
        }
        contentContainerStyle={[
          weights.length === 0 && !isLoading && { flex: 1 },
          { paddingBottom: insets.bottom + 32, paddingHorizontal: D.pad, gap: D.gap },
        ]}
        showsVerticalScrollIndicator={false}
      />

      {showAdd && <AddWeightModal onClose={() => setShowAdd(false)} />}
    </View>
  );
}

function AddWeightModal({ onClose }: { onClose: () => void }) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { unit } = useUnit();
  const createWeight = useCreateWeightLog();
  const [weight, setWeight] = useState('');
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState('');

  async function handleSave() {
    const entered = Number(weight);
    if (!weight.trim() || !Number.isFinite(entered) || entered <= 0) {
      Alert.alert('Weight required', `Enter a valid weight in ${unit}.`);
      return;
    }
    try {
      await createWeight.mutateAsync({
        date,
        weightKg: unitToKg(entered, unit),
        notes: notes.trim() || null,
      });
      onClose();
    } catch (err) {
      Alert.alert('Error', (err as Error).message ?? 'Failed to save weigh-in.');
    }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <ScrollView keyboardShouldPersistTaps="handled">
          <Text style={styles.sheetTitle}>Log weight</Text>

          <Text style={styles.sheetLabel}>Weight ({unit})</Text>
          <TextInput
            style={styles.sheetInput}
            value={weight}
            onChangeText={setWeight}
            placeholder="e.g. 77.5"
            placeholderTextColor={T.muted}
            keyboardType="decimal-pad"
            autoFocus
          />

          <Text style={styles.sheetLabel}>Date</Text>
          <CalendarPicker value={date} onChange={setDate} />

          <Text style={styles.sheetLabel}>Notes</Text>
          <TextInput
            style={[styles.sheetInput, styles.sheetTextarea]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional"
            placeholderTextColor={T.muted}
            multiline
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={[styles.saveBtn, createWeight.isPending && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={createWeight.isPending}
          >
            {createWeight.isPending ? (
              <ActivityIndicator size="small" color={T.onPrimary} />
            ) : (
              <Text style={styles.saveBtnText}>Save weigh-in</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: T.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 12, paddingVertical: 10,
      borderBottomWidth: 1, borderBottomColor: T.border,
    },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { flex: 1, fontFamily: F.uiBold, fontSize: 19, color: T.text, letterSpacing: -0.2 },

    summaryCard: {
      backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: R.card,
      padding: 20, marginTop: D.pad,
    },
    summaryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    summaryLeft: { gap: 4 },
    summaryValue: { fontFamily: F.monoBold, fontSize: 34, color: T.text },
    summaryKey: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim, textTransform: 'uppercase', letterSpacing: 0.5 },
    deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    deltaText: { fontFamily: F.uiSemi, fontSize: 13 },

    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: R.sm,
      paddingHorizontal: 14, paddingVertical: 12,
    },
    rowWeight: { fontFamily: F.uiSemi, fontSize: 16, color: T.text },
    rowMeta: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim, marginTop: 2 },

    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 10, paddingHorizontal: 32 },
    emptyText: { fontFamily: F.uiSemi, fontSize: 15, color: T.textDim },
    emptySub: { fontFamily: F.uiMed, fontSize: 13, color: T.muted, textAlign: 'center' },

    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: {
      position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '88%',
      backgroundColor: T.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18,
      paddingHorizontal: 18, paddingTop: 8, paddingBottom: 28,
    },
    handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: T.borderStrong, marginBottom: 12 },
    sheetTitle: { fontFamily: F.uiBold, fontSize: 19, color: T.text, marginBottom: 14 },
    sheetLabel: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 14, marginBottom: 6 },
    sheetInput: {
      fontFamily: F.uiMed, fontSize: 15, color: T.text,
      backgroundColor: T.surface2, borderRadius: R.sm, borderWidth: 1, borderColor: T.border,
      paddingHorizontal: 12, paddingVertical: 11,
    },
    sheetTextarea: { minHeight: 64, fontFamily: F.ui },
    saveBtn: { marginTop: 22, backgroundColor: T.primary, borderRadius: R.card, paddingVertical: 14, alignItems: 'center' },
    saveBtnText: { fontFamily: F.uiBold, fontSize: 15, color: T.onPrimary },
  });
}
