import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { Touchable } from './Touchable';
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

  // No haptic here — Touchable fires the light impact, and doing it in both
  // places buzzed twice per press.
  const step = (n: number) => onChange(n);

  return (
    <View style={styles.stepperRow}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepper}>
        <Touchable
          style={styles.stepBtn}
          onPress={() => step(Math.max(min, value - 1))}
          accessibilityLabel={`Decrease ${label}`}
        >
          <Ionicons name="remove" size={18} color={T.text} />
        </Touchable>
        <Text style={styles.stepValue} accessibilityLabel={`${label}: ${value}`}>
          {value}
        </Text>
        <Touchable
          style={styles.stepBtn}
          onPress={() => step(value + 1)}
          accessibilityLabel={`Increase ${label}`}
        >
          <Ionicons name="add" size={18} color={T.text} />
        </Touchable>
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
