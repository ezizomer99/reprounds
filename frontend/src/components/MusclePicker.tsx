import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { MuscleGroup } from '@app/shared';
import { MAX_SECONDARY_MUSCLES } from '@app/shared';
import { MUSCLE_OPTIONS } from '../lib/muscleOptions';
import { Chip } from './ui/Chip';
import { F, type ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';

export interface MuscleSelection {
  primary: MuscleGroup | null;
  secondary: MuscleGroup[];
}

/**
 * Primary + secondary muscle picker, shared by the create-exercise form and the
 * edit sheet.
 *
 * The split isn't cosmetic: the muscle heat map and the per-exercise body
 * diagram weight a primary muscle twice what a secondary one gets
 * (`PRIMARY_WEIGHT` in lib/muscleSlugMap.ts), so a flat list would colour a
 * bench press's triceps as hot as its chest.
 *
 * The primary is removed from the secondary row rather than shown disabled —
 * the same muscle at both weights would double-count on the map, and the server
 * strips it anyway.
 */
export function MusclePicker({
  value,
  onChange,
}: {
  value: MuscleSelection;
  onChange: (next: MuscleSelection) => void;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);

  const atCap = value.secondary.length >= MAX_SECONDARY_MUSCLES;

  function setPrimary(m: MuscleGroup) {
    const primary = value.primary === m ? null : m;
    onChange({ primary, secondary: value.secondary.filter((s) => s !== primary) });
  }

  function toggleSecondary(m: MuscleGroup) {
    const has = value.secondary.includes(m);
    if (!has && atCap) return;
    onChange({
      primary: value.primary,
      secondary: has ? value.secondary.filter((s) => s !== m) : [...value.secondary, m],
    });
  }

  return (
    <>
      <View style={styles.field}>
        <Text style={styles.label}>Primary muscle</Text>
        <View style={styles.chipWrap}>
          {MUSCLE_OPTIONS.map((m) => (
            <Chip
              key={m}
              label={m}
              selected={value.primary === m}
              onPress={() => setPrimary(m)}
            />
          ))}
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Also works</Text>
        <Text style={styles.hint}>
          Everything else the lift hits — pull-ups work back, then biceps.
        </Text>
        <View style={styles.chipWrap}>
          {MUSCLE_OPTIONS.filter((m) => m !== value.primary).map((m) => (
            <Chip
              key={m}
              label={m}
              variant="soft"
              selected={value.secondary.includes(m)}
              onPress={() => toggleSecondary(m)}
            />
          ))}
        </View>
      </View>
    </>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    field: { marginBottom: 20 },
    label: {
      fontFamily: F.uiBold,
      fontSize: 11,
      color: T.textDim,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 8,
    },
    hint: { fontFamily: F.ui, fontSize: 12, color: T.muted, marginTop: -4, marginBottom: 8 },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  });
}
