import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { T, F, R } from '../theme/colors';

const RADIUS = 18;
const CIRCUM = 2 * Math.PI * RADIUS;

interface RestTimerProps {
  seconds: number;
  total: number;
  onSkip: () => void;
  onAdd: () => void;
}

export function RestTimer({ seconds, total, onSkip, onAdd }: RestTimerProps) {
  const frac = Math.max(0, Math.min(1, seconds / total));
  const offset = CIRCUM * (1 - frac);
  const mm = String(Math.floor(seconds / 60));
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <View style={styles.container}>
      <Svg width={44} height={44} viewBox="0 0 44 44">
        <Circle
          cx={22} cy={22} r={RADIUS}
          fill="none" stroke={T.borderStrong} strokeWidth={4}
        />
        <Circle
          cx={22} cy={22} r={RADIUS}
          fill="none" stroke={T.primary} strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={CIRCUM}
          strokeDashoffset={offset}
          transform="rotate(-90 22 22)"
        />
      </Svg>
      <View style={styles.textCol}>
        <Text style={styles.label}>Rest</Text>
        <Text style={styles.time}>{mm}:{ss}</Text>
      </View>
      <TouchableOpacity style={styles.addBtn} onPress={onAdd} activeOpacity={0.7}>
        <Text style={styles.addBtnText}>+15s</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.skipBtn} onPress={onSkip} activeOpacity={0.7}>
        <Text style={styles.skipBtnText}>Skip</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 11,
    paddingHorizontal: 14,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: 'rgba(217,119,6,0.35)',
    borderRadius: R.card,
    marginHorizontal: 18,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 15,
    elevation: 8,
  },
  textCol: {
    flex: 1,
  },
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
  addBtnText: {
    fontFamily: F.uiSemi,
    fontSize: 13,
    color: T.text,
  },
  skipBtn: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: R.sm,
    backgroundColor: T.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipBtnText: {
    fontFamily: F.uiSemi,
    fontSize: 13,
    color: T.onPrimary,
  },
});
