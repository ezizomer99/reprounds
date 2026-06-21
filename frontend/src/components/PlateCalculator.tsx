import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { F, R, ThemeColors } from '../theme/colors';
import { useUnit } from '../units/UnitContext';
import { kgToUnit } from '../units/units';

// Standard plate denominations per unit, largest first.
const PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];
const PLATES_LB = [45, 35, 25, 10, 5, 2.5];
const DEFAULT_BAR = { kg: 20, lbs: 45 };

interface PlateGroup {
  plate: number;
  count: number;
}

/** Greedily compute the plates loaded on each side of the bar. */
function platesPerSide(target: number, bar: number, plates: number[]): PlateGroup[] {
  if (!(target > bar)) return [];
  let perSide = (target - bar) / 2;
  const result: PlateGroup[] = [];
  for (const p of plates) {
    const count = Math.floor(perSide / p + 1e-9);
    if (count > 0) {
      result.push({ plate: p, count });
      perSide -= count * p;
    }
  }
  return result;
}

export function PlateCalculator({ weightKg, onClose }: { weightKg: number; onClose: () => void }) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { unit } = useUnit();
  const plateSet = unit === 'lbs' ? PLATES_LB : PLATES_KG;
  const initialTarget = weightKg ? String(Math.round(kgToUnit(weightKg, unit) * 10) / 10) : '';
  const [bar, setBar] = useState(String(DEFAULT_BAR[unit]));
  const [target, setTarget] = useState(initialTarget);

  const barN = Number(bar) || 0;
  const targetN = Number(target) || 0;
  const plates = platesPerSide(targetN, barN, plateSet);
  const achieved = barN + plates.reduce((s, p) => s + p.plate * p.count * 2, 0);
  const exact = Math.abs(achieved - targetN) < 0.01;

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.centerWrap} pointerEvents="box-none">
        <View style={styles.card}>
          <Text style={styles.title}>Plate calculator</Text>

          <View style={styles.inputs}>
            <View style={styles.inputCol}>
              <Text style={styles.label}>Target ({unit})</Text>
              <TextInput
                style={styles.input}
                value={target}
                onChangeText={setTarget}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={T.muted}
                autoFocus
              />
            </View>
            <View style={styles.inputCol}>
              <Text style={styles.label}>Bar ({unit})</Text>
              <TextInput
                style={styles.input}
                value={bar}
                onChangeText={setBar}
                keyboardType="decimal-pad"
                placeholder="20"
                placeholderTextColor={T.muted}
              />
            </View>
          </View>

          <Text style={styles.label}>Per side</Text>
          {plates.length === 0 ? (
            <Text style={styles.empty}>
              {targetN > 0 && targetN <= barN ? 'Target is at or below bar weight.' : 'Enter a target above the bar.'}
            </Text>
          ) : (
            <View style={styles.plateRow}>
              {plates.map((p) => (
                <View key={p.plate} style={styles.plateChip}>
                  <Text style={styles.plateChipText}>{p.plate}</Text>
                  <Text style={styles.plateChipMult}>× {p.count}</Text>
                </View>
              ))}
            </View>
          )}

          {plates.length > 0 && (
            <Text style={[styles.achieved, !exact && { color: T.gold }]}>
              {exact ? `Loads to ${achieved} ${unit}` : `Closest: ${Math.round(achieved * 10) / 10} ${unit}`}
            </Text>
          )}

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
    centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
    card: {
      width: '100%', maxWidth: 360,
      backgroundColor: T.surface, borderRadius: R.card, borderWidth: 1, borderColor: T.border,
      padding: 18, gap: 12,
    },
    title: { fontFamily: F.uiBold, fontSize: 18, color: T.text },
    inputs: { flexDirection: 'row', gap: 12 },
    inputCol: { flex: 1, gap: 6 },
    label: { fontFamily: F.uiMed, fontSize: 11, color: T.textDim, textTransform: 'uppercase', letterSpacing: 0.4 },
    input: {
      fontFamily: F.mono, fontSize: 17, color: T.text,
      backgroundColor: T.surface2, borderRadius: R.sm, borderWidth: 1, borderColor: T.border,
      paddingHorizontal: 12, paddingVertical: 10,
    },
    plateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    plateChip: {
      flexDirection: 'row', alignItems: 'baseline', gap: 3,
      backgroundColor: T.surface2, borderWidth: 1, borderColor: T.borderStrong, borderRadius: R.chip,
      paddingHorizontal: 12, paddingVertical: 7,
    },
    plateChipText: { fontFamily: F.monoBold, fontSize: 16, color: T.text },
    plateChipMult: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim },
    empty: { fontFamily: F.uiMed, fontSize: 13, color: T.muted },
    achieved: { fontFamily: F.uiSemi, fontSize: 13, color: T.conditioning },
    closeBtn: { marginTop: 4, backgroundColor: T.primary, borderRadius: R.card, paddingVertical: 12, alignItems: 'center' },
    closeBtnText: { fontFamily: F.uiBold, fontSize: 15, color: T.onPrimary },
  });
}
