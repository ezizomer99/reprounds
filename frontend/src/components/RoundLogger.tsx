import { useMemo } from 'react';
import { StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type {
  ClassType,
  DisciplineCat,
  GrapplingRound,
  MmaRound,
  RoundIntensity,
  RoundsSessionDetails,
  StrikeWeapon,
  StrikingRound,
  StrikingRoundType,
} from '@app/shared';
import { ROUNDS_SCHEMA } from '@app/shared';
import { PartnerPicker } from './PartnerPicker';
import { useTheme } from '../theme/ThemeContext';
import { F, R, ThemeColors } from '../theme/colors';

// A structural superset of every round type so the editor can hold all possible
// fields; the active card only renders the ones relevant to its category.
type EditableRound = GrapplingRound & StrikingRound & MmaRound;
type EditableSession = {
  schema: typeof ROUNDS_SCHEMA;
  category: DisciplineCat;
  rounds: EditableRound[];
  classType?: ClassType | null;
  techniqueNotes?: string | null;
};

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const INTENSITIES: RoundIntensity[] = ['light', 'medium', 'hard'];
const CLASS_TYPES: { value: ClassType; label: string }[] = [
  { value: 'technique', label: 'Technique' },
  { value: 'sparring', label: 'Sparring' },
  { value: 'open_mat', label: 'Open mat' },
  { value: 'private', label: 'Private' },
  { value: 'competition_prep', label: 'Comp prep' },
  { value: 'conditioning', label: 'Conditioning' },
];

const STRIKING_ROUND_TYPES: { value: StrikingRoundType; label: string }[] = [
  { value: 'shadow', label: 'Shadow' },
  { value: 'bag', label: 'Bag' },
  { value: 'pads', label: 'Pads' },
  { value: 'sparring', label: 'Spar' },
  { value: 'clinch', label: 'Clinch' },
  { value: 'drilling', label: 'Drill' },
];

export const BOXING_WEAPONS: StrikeWeapon[] = ['jab', 'cross', 'hook', 'uppercut'];
export const MUAY_THAI_WEAPONS: StrikeWeapon[] = [
  'jab', 'cross', 'hook', 'uppercut', 'teep', 'roundhouse', 'knee', 'elbow',
];
const WEAPON_LABEL: Record<StrikeWeapon, string> = {
  jab: 'Jab', cross: 'Cross', hook: 'Hook', uppercut: 'Uppercut',
  teep: 'Teep', roundhouse: 'Round kick', knee: 'Knee', elbow: 'Elbow',
};

export function emptyRoundsSession(category: DisciplineCat): RoundsSessionDetails {
  return { schema: ROUNDS_SCHEMA, category, rounds: [] } as RoundsSessionDetails;
}

/**
 * Category-aware round logger. Renders class type, a list of round cards with
 * core counters branched on `category`, and a technique-journal field. Writes
 * the whole RoundsSessionDetails back through onChange (the parent persists it
 * into session_entries.details).
 */
export function RoundLogger({
  category,
  value,
  onChange,
  strikeWeapons = BOXING_WEAPONS,
}: {
  category: DisciplineCat;
  value: RoundsSessionDetails | null;
  onChange: (next: RoundsSessionDetails) => void;
  /** Which striking weapons to show as counters (boxing vs Muay Thai). */
  strikeWeapons?: StrikeWeapon[];
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);

  const data = (value ?? { schema: ROUNDS_SCHEMA, category, rounds: [] }) as unknown as EditableSession;
  const rounds = data.rounds ?? [];

  const emit = (next: EditableSession) => onChange(next as unknown as RoundsSessionDetails);

  const patchSession = (patch: Partial<EditableSession>) => emit({ ...data, ...patch });

  const updateRound = (id: string, patch: Partial<EditableRound>) =>
    emit({ ...data, rounds: rounds.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  const addRound = () =>
    emit({
      ...data,
      rounds: [...rounds, { id: genId(), intensity: 'medium' } as EditableRound],
    });

  const removeRound = (id: string) =>
    emit({ ...data, rounds: rounds.filter((r) => r.id !== id) });

  return (
    <View style={{ gap: 14 }}>
      {/* Class type */}
      <View style={styles.chipRow}>
        {CLASS_TYPES.map((ct) => {
          const active = data.classType === ct.value;
          return (
            <TouchableOpacity
              key={ct.value}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => patchSession({ classType: active ? null : ct.value })}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{ct.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Rounds */}
      {rounds.map((round, i) => (
        <View key={round.id} style={styles.roundCard}>
          <View style={styles.roundHead}>
            <Text style={styles.roundTitle}>Round {i + 1}</Text>
            <TouchableOpacity hitSlop={8} onPress={() => removeRound(round.id)}>
              <Ionicons name="trash-outline" size={16} color={T.muted} />
            </TouchableOpacity>
          </View>

          <PartnerPicker
            value={round.partnerId ?? null}
            onChange={(partnerId) => updateRound(round.id, { partnerId })}
          />

          <View style={styles.inlineRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.miniLabel}>Minutes</Text>
              <TextInput
                style={styles.numInput}
                value={
                  round.durationSeconds != null ? String(Math.round(round.durationSeconds / 60)) : ''
                }
                onChangeText={(t) =>
                  updateRound(round.id, {
                    durationSeconds: t.trim() === '' ? null : Math.round(Number(t) * 60),
                  })
                }
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={T.muted}
              />
            </View>
            <View style={{ flex: 2 }}>
              <Text style={styles.miniLabel}>Intensity</Text>
              <View style={styles.chipRow}>
                {INTENSITIES.map((lvl) => {
                  const active = round.intensity === lvl;
                  return (
                    <TouchableOpacity
                      key={lvl}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => updateRound(round.id, { intensity: lvl })}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{lvl}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          {category === 'grappling' && (
            <GrapplingCounters round={round} onChange={(patch) => updateRound(round.id, patch)} />
          )}

          {category === 'striking' && (
            <StrikingCounters
              round={round}
              weapons={strikeWeapons}
              onChange={(patch) => updateRound(round.id, patch)}
            />
          )}

          <TextInput
            style={styles.roundNotes}
            value={round.notes ?? ''}
            onChangeText={(t) => updateRound(round.id, { notes: t })}
            placeholder="Round notes (optional)"
            placeholderTextColor={T.muted}
            multiline
          />
        </View>
      ))}

      <TouchableOpacity style={styles.addRound} onPress={addRound}>
        <Ionicons name="add" size={16} color={T.primary} />
        <Text style={styles.addRoundText}>Add round</Text>
      </TouchableOpacity>

      {/* Technique journal */}
      <View>
        <Text style={styles.miniLabel}>Technique notes</Text>
        <TextInput
          style={[styles.numInput, styles.journal]}
          value={data.techniqueNotes ?? ''}
          onChangeText={(t) => patchSession({ techniqueNotes: t })}
          placeholder="What did you drill or learn?"
          placeholderTextColor={T.muted}
          multiline
          textAlignVertical="top"
        />
      </View>
    </View>
  );
}

function GrapplingCounters({
  round,
  onChange,
}: {
  round: EditableRound;
  onChange: (patch: Partial<EditableRound>) => void;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.giRow}>
        <Text style={styles.miniLabel}>Gi</Text>
        <Switch
          value={round.gi === 'gi'}
          onValueChange={(v) => onChange({ gi: v ? 'gi' : 'no_gi' })}
          trackColor={{ true: T.primary }}
        />
      </View>
      <Stepper
        label="Submissions for"
        value={round.submissionsFor ?? 0}
        onChange={(n) => onChange({ submissionsFor: n })}
      />
      <Stepper
        label="Submissions against"
        value={round.submissionsAgainst ?? 0}
        onChange={(n) => onChange({ submissionsAgainst: n })}
      />
    </View>
  );
}

function StrikingCounters({
  round,
  weapons,
  onChange,
}: {
  round: EditableRound;
  weapons: StrikeWeapon[];
  onChange: (patch: Partial<EditableRound>) => void;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const strikes = round.strikes ?? {};
  const setStrike = (w: StrikeWeapon, n: number) =>
    onChange({ strikes: { ...strikes, [w]: Math.max(0, n) } });

  return (
    <View style={{ gap: 10 }}>
      <View>
        <Text style={styles.miniLabel}>Round type</Text>
        <View style={styles.chipRow}>
          {STRIKING_ROUND_TYPES.map((rt) => {
            const active = round.roundType === rt.value;
            return (
              <TouchableOpacity
                key={rt.value}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => onChange({ roundType: active ? null : rt.value })}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{rt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View>
        <Text style={styles.miniLabel}>Strikes</Text>
        {weapons.map((w) => (
          <Stepper
            key={w}
            label={WEAPON_LABEL[w]}
            value={strikes[w] ?? 0}
            onChange={(n) => setStrike(w, n)}
          />
        ))}
      </View>
    </View>
  );
}

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepper}>
        <TouchableOpacity
          style={styles.stepBtn}
          onPress={() => onChange(Math.max(0, value - 1))}
        >
          <Ionicons name="remove" size={18} color={T.text} />
        </TouchableOpacity>
        <Text style={styles.stepValue}>{value}</Text>
        <TouchableOpacity style={styles.stepBtn} onPress={() => onChange(value + 1)}>
          <Ionicons name="add" size={18} color={T.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: {
      paddingHorizontal: 11, paddingVertical: 6,
      borderRadius: R.chip, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface2,
    },
    chipActive: { backgroundColor: T.primary, borderColor: T.primary },
    chipText: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim, textTransform: 'capitalize' },
    chipTextActive: { color: T.onPrimary },
    roundCard: {
      gap: 10, padding: 12,
      backgroundColor: T.surface2, borderRadius: R.card, borderWidth: 1, borderColor: T.border,
    },
    roundHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    roundTitle: { fontFamily: F.uiSemi, fontSize: 14, color: T.text },
    inlineRow: { flexDirection: 'row', gap: 12 },
    miniLabel: { fontFamily: F.uiMed, fontSize: 11, color: T.textDim, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 },
    numInput: {
      fontFamily: F.mono, fontSize: 15, color: T.text,
      backgroundColor: T.surface, borderRadius: R.sm, borderWidth: 1, borderColor: T.border,
      paddingHorizontal: 12, paddingVertical: 9,
    },
    journal: { minHeight: 64, fontFamily: F.ui },
    roundNotes: {
      fontFamily: F.ui, fontSize: 14, color: T.text,
      backgroundColor: T.surface, borderRadius: R.sm, borderWidth: 1, borderColor: T.border,
      paddingHorizontal: 12, paddingVertical: 9, minHeight: 40,
    },
    giRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    stepperLabel: { fontFamily: F.uiMed, fontSize: 14, color: T.text, flex: 1 },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    stepBtn: {
      width: 34, height: 34, alignItems: 'center', justifyContent: 'center',
      borderRadius: R.sm, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface,
    },
    stepValue: { fontFamily: F.monoBold, fontSize: 16, color: T.text, minWidth: 22, textAlign: 'center' },
    addRound: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      paddingVertical: 11, borderRadius: R.sm, borderWidth: 1, borderStyle: 'dashed', borderColor: T.borderStrong,
    },
    addRoundText: { fontFamily: F.uiSemi, fontSize: 14, color: T.primary },
  });
}
