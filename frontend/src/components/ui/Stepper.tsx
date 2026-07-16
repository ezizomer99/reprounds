import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme/ThemeContext';
import { F, R, ThemeColors } from '../../theme/colors';

/**
 * Labeled counter: `label` on the left, a − value + control on the right.
 * Clamps at `min` (default 0), fires a light haptic on each step, and labels the
 * two buttons for screen readers.
 */
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);

  const step = (n: number) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(n);
  };

  return (
    <View style={styles.stepperRow}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepper}>
        <TouchableOpacity
          style={styles.stepBtn}
          onPress={() => step(Math.max(min, value - 1))}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
        >
          <Ionicons name="remove" size={18} color={T.text} />
        </TouchableOpacity>
        <Text style={styles.stepValue} accessibilityLabel={`${label}: ${value}`}>
          {value}
        </Text>
        <TouchableOpacity
          style={styles.stepBtn}
          onPress={() => step(value + 1)}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
        >
          <Ionicons name="add" size={18} color={T.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    stepperLabel: { fontFamily: F.uiMed, fontSize: 14, color: T.text, flex: 1 },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    stepBtn: {
      width: 34, height: 34, alignItems: 'center', justifyContent: 'center',
      borderRadius: R.sm, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface,
    },
    stepValue: { fontFamily: F.monoBold, fontSize: 16, color: T.text, minWidth: 22, textAlign: 'center' },
  });
}
