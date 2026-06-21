import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { F, R, D, ThemeColors } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeContext';
import { useUnit } from '../../src/units/UnitContext';
import type { WeightUnit } from '../../src/units/units';

type ThemeMode = 'dark' | 'light' | 'system';

const MODES: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const UNITS: { value: WeightUnit; label: string }[] = [
  { value: 'kg', label: 'Kilograms' },
  { value: 'lbs', label: 'Pounds' },
];

export default function SettingsScreen() {
  const { T, mode, setMode } = useTheme();
  const { unit, setUnit } = useUnit();
  const styles = useMemo(() => makeStyles(T), [T]);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={T.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
        <Text style={styles.sectionLabel}>Appearance</Text>

        <View style={styles.card}>
          <Text style={styles.rowLabel}>Theme</Text>
          <View style={styles.segmentRow}>
            {MODES.map(({ value, label }) => {
              const active = mode === value;
              return (
                <TouchableOpacity
                  key={value}
                  style={[styles.segment, active && styles.segmentActive]}
                  onPress={() => setMode(value)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <Text style={styles.sectionLabel}>Units</Text>

        <View style={styles.card}>
          <Text style={styles.rowLabel}>Weight</Text>
          <View style={styles.segmentRow}>
            {UNITS.map(({ value, label }) => {
              const active = unit === value;
              return (
                <TouchableOpacity
                  key={value}
                  style={[styles.segment, active && styles.segmentActive]}
                  onPress={() => setUnit(value)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </View>
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
    headerTitle: {
      flex: 1, fontFamily: F.uiSemi, fontSize: 19, color: T.text,
      letterSpacing: -0.2, textAlign: 'center',
    },
    body: { padding: D.pad, gap: D.stack },
    sectionLabel: {
      fontFamily: F.uiBold, fontSize: 11, color: T.textDim,
      textTransform: 'uppercase', letterSpacing: 1.2,
    },
    card: {
      backgroundColor: T.surface, borderRadius: R.card,
      borderWidth: 1, borderColor: T.border,
      padding: D.cardPad, gap: 14,
    },
    rowLabel: { fontFamily: F.uiSemi, fontSize: 15, color: T.text },
    segmentRow: {
      flexDirection: 'row',
      backgroundColor: T.surface2,
      borderRadius: R.sm,
      padding: 3,
      gap: 3,
    },
    segment: {
      flex: 1, paddingVertical: 8, alignItems: 'center',
      borderRadius: R.sm - 2,
    },
    segmentActive: { backgroundColor: T.primary },
    segmentText: { fontFamily: F.uiMed, fontSize: 14, color: T.textDim },
    segmentTextActive: { fontFamily: F.uiBold, color: T.onPrimary },
  });
}
