import { useMemo } from 'react';
import { StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { F, R, ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { withAlpha } from '../lib/color';

interface RestTimerProps {
  seconds: number;
  total: number;
  onSkip: () => void;
  onAdd: () => void;
  style?: StyleProp<ViewStyle>;
}

export function RestTimer({ seconds, total, onSkip, onAdd, style }: RestTimerProps) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);

  const frac = Math.max(0, Math.min(1, seconds / total));
  const mm = String(Math.floor(seconds / 60));
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <View style={[styles.container, style]}>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${frac * 100}%` as `${number}%` }]} />
      </View>

      <View style={styles.row}>
        <View style={styles.textCol}>
          <Text style={styles.label}>Rest</Text>
          <Text style={styles.time}>{mm}:{ss}</Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onAdd(); }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Add 15 seconds to rest"
        >
          <Text style={styles.addBtnText}>+15s</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.skipBtn}
          onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSkip(); }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Skip rest timer"
        >
          <Text style={styles.skipBtnText}>Skip</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    container: {
      backgroundColor: T.surface2,
      borderWidth: 1,
      borderColor: withAlpha(T.primary, 0.35),
      borderRadius: R.card,
      marginHorizontal: 18,
      marginBottom: 8,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.35,
      shadowRadius: 15,
      elevation: 8,
    },
    barTrack: {
      height: 3,
      backgroundColor: withAlpha(T.primary, 0.15),
    },
    barFill: {
      height: 3,
      backgroundColor: T.primary,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      padding: 11,
      paddingHorizontal: 14,
    },
    textCol: { flex: 1 },
    label: {
      fontFamily: F.uiSemi,
      fontSize: 11,
      color: T.textDim,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    time: {
      fontFamily: F.monoBold,
      fontSize: 24,
      color: T.text,
      letterSpacing: -0.5,
    },
    addBtn: {
      height: 34,
      paddingHorizontal: 12,
      borderRadius: R.sm,
      borderWidth: 1,
      borderColor: T.borderStrong,
      backgroundColor: T.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addBtnText: { fontFamily: F.uiSemi, fontSize: 13, color: T.text },
    skipBtn: {
      height: 34,
      paddingHorizontal: 14,
      borderRadius: R.sm,
      backgroundColor: T.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    skipBtnText: { fontFamily: F.uiSemi, fontSize: 13, color: T.onPrimary },
  });
}
