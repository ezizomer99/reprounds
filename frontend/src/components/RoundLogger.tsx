import { useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTechniqueTags } from '../hooks/useNotes';
import type {
  ClassType,
  DisciplineCat,
  GrapplingRound,
  MmaPhase,
  MmaRound,
  RoundIntensity,
  RoundsSessionDetails,
  StrikeWeapon,
  StrikingRound,
  StrikingRoundType,
} from '@app/shared';
import {
  ROUNDS_SCHEMA,
  GRAPPLING_POSITIONS,
  GRAPPLING_SUBMISSIONS,
  submissionLabel,
} from '@app/shared';
import { PartnerPicker } from './PartnerPicker';
import { useTheme } from '../theme/ThemeContext';
import { F, R, ThemeColors } from '../theme/colors';
import { withAlpha } from '../lib/color';

// A structural superset of every round type so the editor can hold all possible
// fields; the active card only renders the ones relevant to its category.
type EditableRound = GrapplingRound & StrikingRound & MmaRound;
type EditableSession = {
  schema: typeof ROUNDS_SCHEMA;
  category: DisciplineCat;
  rounds: EditableRound[];
  classType?: ClassType | null;
  techniqueNotes?: string | null;
  techniqueTags?: string[];
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

const MMA_PHASES: { value: MmaPhase; label: string }[] = [
  { value: 'standup', label: 'Standup' },
  { value: 'clinch', label: 'Clinch' },
  { value: 'ground', label: 'Ground' },
];

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

          {category === 'mixed' && (
            <MmaCounters round={round} onChange={(patch) => updateRound(round.id, patch)} />
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

      {/* Technique tags */}
      <TagEditor
        tags={data.techniqueTags ?? []}
        onChange={(tags) => patchSession({ techniqueTags: tags })}
      />
    </View>
  );
}

/**
 * Lowercased technique tag editor: removable chips + a text field that adds on
 * submit/comma, with suggestions drawn from the user's previously used tags.
 */
function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const [text, setText] = useState('');
  const { data: tagData } = useTechniqueTags();

  const addTag = (raw: string) => {
    const tag = raw.trim().toLowerCase().replace(/,+$/, '');
    if (!tag) return;
    if (!tags.includes(tag)) onChange([...tags, tag]);
    setText('');
  };

  const removeTag = (tag: string) => onChange(tags.filter((t) => t !== tag));

  const suggestions = useMemo(() => {
    const typed = text.trim().toLowerCase();
    return (tagData?.tags ?? [])
      .map((t) => t.tag)
      .filter((t) => !tags.includes(t) && (typed === '' ? true : t.includes(typed)))
      .slice(0, 6);
  }, [tagData, tags, text]);

  return (
    <View>
      <Text style={styles.miniLabel}>Technique tags</Text>
      <View style={styles.tagWrap}>
        {tags.map((tag) => (
          <TouchableOpacity key={tag} style={styles.tagChip} onPress={() => removeTag(tag)}>
            <Text style={styles.tagChipText}>{tag}</Text>
            <Ionicons name="close" size={13} color={T.primary} />
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        style={styles.numInput}
        value={text}
        onChangeText={(t) => (t.endsWith(',') ? addTag(t) : setText(t))}
        onSubmitEditing={() => addTag(text)}
        placeholder="Add a tag (e.g. knee cut)"
        placeholderTextColor={T.muted}
        autoCapitalize="none"
        returnKeyType="done"
        blurOnSubmit={false}
      />
      {suggestions.length > 0 && (
        <View style={styles.tagSuggestRow}>
          {suggestions.map((s) => (
            <TouchableOpacity key={s} style={styles.tagSuggest} onPress={() => addTag(s)}>
              <Ionicons name="add" size={12} color={T.textDim} />
              <Text style={styles.tagSuggestText}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
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

  // Tap a submission chip: +1 to its type count AND +1 to the top-line total.
  // Long-press: -1 to both (clamped at 0), removing the key when it hits 0.
  // The top-line stepper stays authoritative; sum(types) <= total (the gap is
  // untyped taps / legacy rounds).
  const bumpSubmission = (side: 'for' | 'against', type: string, delta: number) => {
    const totalKey = side === 'for' ? 'submissionsFor' : 'submissionsAgainst';
    const mapKey = side === 'for' ? 'submissionsForTypes' : 'submissionsAgainstTypes';
    const map = { ...(round[mapKey] ?? {}) };
    const cur = map[type] ?? 0;
    if (delta < 0 && cur === 0) return;
    const nextTypeCount = Math.max(0, cur + delta);
    if (nextTypeCount === 0) delete map[type];
    else map[type] = nextTypeCount;
    const nextTotal = Math.max(0, (round[totalKey] ?? 0) + (nextTypeCount - cur));
    onChange({ [mapKey]: map, [totalKey]: nextTotal } as Partial<EditableRound>);
  };

  const togglePosition = (pos: string) => {
    const current = round.positions ?? [];
    onChange({
      positions: current.includes(pos)
        ? current.filter((p) => p !== pos)
        : [...current, pos],
    });
  };

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
      <SubmissionTally
        counts={round.submissionsForTypes ?? {}}
        onBump={(type, delta) => bumpSubmission('for', type, delta)}
      />

      <Stepper
        label="Submissions against"
        value={round.submissionsAgainst ?? 0}
        onChange={(n) => onChange({ submissionsAgainst: n })}
      />
      <SubmissionTally
        counts={round.submissionsAgainstTypes ?? {}}
        onBump={(type, delta) => bumpSubmission('against', type, delta)}
      />

      <Stepper
        label="Sweeps"
        value={round.sweeps ?? 0}
        onChange={(n) => onChange({ sweeps: n })}
      />
      <Stepper
        label="Takedowns"
        value={round.takedowns ?? 0}
        onChange={(n) => onChange({ takedowns: n })}
      />

      <View>
        <Text style={styles.miniLabel}>Positions worked</Text>
        <View style={styles.chipRow}>
          {GRAPPLING_POSITIONS.map((p) => {
            const active = (round.positions ?? []).includes(p.value);
            return (
              <TouchableOpacity
                key={p.value}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => togglePosition(p.value)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

/**
 * Compact submission-type tally: a wrap of chips, one per curated submission.
 * Tap increments that submission (and the caller bumps the top-line total);
 * long-press decrements. Active chips show a count and the label is postfixed
 * with the tally so a glance reads "Armbar · 2".
 */
function SubmissionTally({
  counts,
  onBump,
}: {
  counts: Record<string, number>;
  onBump: (type: string, delta: number) => void;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  return (
    <View style={styles.chipRow}>
      {GRAPPLING_SUBMISSIONS.map((s) => {
        const n = counts[s.value] ?? 0;
        const active = n > 0;
        return (
          <TouchableOpacity
            key={s.value}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onBump(s.value, +1)}
            onLongPress={() => onBump(s.value, -1)}
            delayLongPress={250}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {submissionLabel(s.value)}
              {active ? ` · ${n}` : ''}
            </Text>
          </TouchableOpacity>
        );
      })}
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

function MmaCounters({
  round,
  onChange,
}: {
  round: EditableRound;
  onChange: (patch: Partial<EditableRound>) => void;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const phases = round.phases ?? [];
  const togglePhase = (p: MmaPhase) =>
    onChange({ phases: phases.includes(p) ? phases.filter((x) => x !== p) : [...phases, p] });

  return (
    <View style={{ gap: 10 }}>
      <View>
        <Text style={styles.miniLabel}>Phases</Text>
        <View style={styles.chipRow}>
          {MMA_PHASES.map((ph) => {
            const active = phases.includes(ph.value);
            return (
              <TouchableOpacity
                key={ph.value}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => togglePhase(ph.value)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{ph.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <Stepper
        label="Takedowns landed"
        value={round.takedownsLanded ?? 0}
        onChange={(n) => onChange({ takedownsLanded: n })}
      />
      <Stepper
        label="Takedowns defended"
        value={round.takedownsDefended ?? 0}
        onChange={(n) => onChange({ takedownsDefended: n })}
      />
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
      gap: 10, paddingVertical: 12,
      borderTopWidth: 1, borderTopColor: T.borderStrong,
    },
    roundHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    roundTitle: { fontFamily: F.uiBold, fontSize: 12, color: T.textDim, textTransform: 'uppercase', letterSpacing: 1 },
    inlineRow: { flexDirection: 'row', gap: 12 },
    miniLabel: { fontFamily: F.uiMed, fontSize: 11, color: T.textDim, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 },
    numInput: {
      fontFamily: F.mono, fontSize: 15, color: T.text,
      backgroundColor: T.surface, borderRadius: R.sm, borderWidth: 1, borderColor: T.border,
      paddingHorizontal: 12, paddingVertical: 9,
    },
    journal: { minHeight: 64, fontFamily: F.ui },
    tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
    tagChip: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.chip,
      backgroundColor: withAlpha(T.primary, 0.14),
    },
    tagChipText: { fontFamily: F.uiMed, fontSize: 12, color: T.primary },
    tagSuggestRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    tagSuggest: {
      flexDirection: 'row', alignItems: 'center', gap: 3,
      paddingHorizontal: 9, paddingVertical: 4, borderRadius: R.chip,
      backgroundColor: T.surface, borderWidth: 1, borderColor: T.border,
    },
    tagSuggestText: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim },
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
