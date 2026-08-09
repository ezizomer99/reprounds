import { useMemo } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Touchable } from './ui';
import { F, R, ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { withAlpha } from '../lib/color';
import { CutCornerView } from './CutCornerView';

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

  // The pill lingers briefly at 0:00 before auto-dismissing; label it "Done"
  // so the pause reads as intentional.
  const done = seconds <= 0;
  // `total` comes from a restored ActiveRest as well as from a fresh start, so
  // a zero would reach the style as width: "NaN%" rather than being caught at
  // the call site.
  const frac = total > 0 ? Math.max(0, Math.min(1, seconds / total)) : 0;
  const mm = String(Math.floor(seconds / 60));
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <CutCornerView
      fill={T.surface2}
      stroke={withAlpha(T.primary, 0.35)}
      style={[styles.container, style]}
    >
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${frac * 100}%` as `${number}%` }]} />
      </View>

      <View style={styles.row}>
        <View style={styles.textCol}>
          <Text style={styles.label}>{done ? 'Rest done' : 'Rest'}</Text>
          <Text style={[styles.time, done && { color: T.primary }]}>{mm}:{ss}</Text>
        </View>
        {!done && <Touchable
          style={styles.addBtn}
          onPress={() => onAdd()}
          accessibilityLabel="Add 15 seconds to rest"
          feedback="row"
        >
          <Text style={styles.addBtnText}>+15s</Text>
        </Touchable>}
        <Touchable
          style={styles.skipBtn}
          onPress={() => onSkip()}
          accessibilityLabel={done ? 'Dismiss rest timer' : 'Skip rest timer'}
          feedback="row"
        >
          <Text style={styles.skipBtnText}>{done ? 'Dismiss' : 'Skip'}</Text>
        </Touchable>
      </View>
    </CutCornerView>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    container: {
      marginHorizontal: 18,
      marginBottom: 8,
    },
    // Inset from the edges so the bar clears the cut top-left corner.
    barTrack: {
      height: 3,
      marginTop: 12,
      marginHorizontal: 14,
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
