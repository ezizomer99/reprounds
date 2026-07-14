import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
import { Chip } from './ui/Chip';
import { Stepper } from './ui/Stepper';
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
 *
 * When `sessionActive` and `elapsedSeconds` are supplied, each round's Minutes
 * field grows a "stamp from timer" button that fills the round's duration from
 * the session clock (minus the rounds already logged).
 */
export function RoundLogger({
  category,
  value,
  onChange,
  strikeWeapons = BOXING_WEAPONS,
  elapsedSeconds,
  sessionActive = false,
}: {
  category: DisciplineCat;
  value: RoundsSessionDetails | null;
  onChange: (next: RoundsSessionDetails) => void;
  /** Which striking weapons to show as counters (boxing vs Muay Thai). */
  strikeWeapons?: StrikeWeapon[];
  /** Live session stopwatch (seconds); enables the Minutes stamp button. */
  elapsedSeconds?: number;
  /** Whether the session is still in progress (gates the stamp button). */
  sessionActive?: boolean;
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

  // Fill a round's duration from the session clock: elapsed minus the time
  // already accounted for by the other rounds, so back-to-back stamps record
  // each round's own slice rather than the whole session.
  const stampDuration = (round: EditableRound) => {
    if (elapsedSeconds == null) return;
    const otherSum = rounds.reduce(
      (sum, r) => (r.id === round.id ? sum : sum + (r.durationSeconds ?? 0)),
      0,
    );
    updateRound(round.id, { durationSeconds: Math.max(0, elapsedSeconds - otherSum) });
  };

  const canStamp = sessionActive && elapsedSeconds != null;

  return (
    <View style={{ gap: 14 }}>
      {/* Class type */}
      <View style={styles.chipRow}>
        {CLASS_TYPES.map((ct) => (
          <Chip
            key={ct.value}
            label={ct.label}
            selected={data.classType === ct.value}
            onPress={() =>
              patchSession({ classType: data.classType === ct.value ? null : ct.value })
            }
          />
        ))}
      </View>

      {/* Rounds */}
      {rounds.map((round, i) => (
        <View key={round.id} style={styles.roundCard}>
          <View style={styles.roundHead}>
            <Text style={styles.roundTitle}>Round {i + 1}</Text>
            <TouchableOpacity
              hitSlop={8}
              onPress={() => removeRound(round.id)}
              accessibilityRole="button"
              accessibilityLabel={`Delete round ${i + 1}`}
            >
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
              <View style={styles.minuteRow}>
                <TextInput
                  style={[styles.numInput, { flex: 1 }]}
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
                {canStamp && (
                  <TouchableOpacity
                    style={styles.stampBtn}
                    onPress={() => stampDuration(round)}
                    accessibilityRole="button"
                    accessibilityLabel="Fill minutes from session timer"
                  >
                    <Ionicons name="stopwatch-outline" size={18} color={T.primary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <View style={{ flex: 2 }}>
              <Text style={styles.miniLabel}>Intensity</Text>
              <View style={styles.chipRow}>
                {INTENSITIES.map((lvl) => (
                  <Chip
                    key={lvl}
                    label={lvl}
                    selected={round.intensity === lvl}
                    onPress={() => updateRound(round.id, { intensity: lvl })}
                  />
                ))}
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

      <TouchableOpacity
        style={styles.addRound}
        onPress={addRound}
        accessibilityRole="button"
        accessibilityLabel="Add round"
      >
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
          <TouchableOpacity
            key={tag}
            style={styles.tagChip}
            onPress={() => removeTag(tag)}
            accessibilityRole="button"
            accessibilityLabel={`Remove tag ${tag}`}
          >
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
            <TouchableOpacity
              key={s}
              style={styles.tagSuggest}
              onPress={() => addTag(s)}
              accessibilityRole="button"
              accessibilityLabel={`Add tag ${s}`}
            >
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
          accessibilityLabel="Gi"
        />
      </View>

      <SubmissionSection side="for" round={round} onChange={onChange} />
      <SubmissionSection side="against" round={round} onChange={onChange} />

      <Stepper label="Sweeps" value={round.sweeps ?? 0} onChange={(n) => onChange({ sweeps: n })} />
      <Stepper
        label="Takedowns"
        value={round.takedowns ?? 0}
        onChange={(n) => onChange({ takedowns: n })}
      />

      <View>
        <Text style={styles.miniLabel}>Positions worked</Text>
        <View style={styles.chipRow}>
          {GRAPPLING_POSITIONS.map((p) => (
            <Chip
              key={p.value}
              label={p.label}
              selected={(round.positions ?? []).includes(p.value)}
              onPress={() => togglePosition(p.value)}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

/**
 * Submission tally for one side (for/against). Shows only the submissions that
 * have been tallied as stepper rows (label + − count +), with the running total
 * derived from those rows. A horizontally-scrolling palette of the not-yet-used
 * submissions sits below; tapping one adds it at 1, moving it up into the list.
 * Decrementing a row to 0 removes it, returning that type to the palette.
 *
 * The stored `submissionsFor` / `submissionsAgainst` total is kept equal to the
 * sum of the type map. Legacy rounds that carry a bare total larger than the
 * typed sum have the remainder folded into `other`, so nothing looks lost.
 */
function SubmissionSection({
  side,
  round,
  onChange,
}: {
  side: 'for' | 'against';
  round: EditableRound;
  onChange: (patch: Partial<EditableRound>) => void;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);

  const totalKey = side === 'for' ? 'submissionsFor' : 'submissionsAgainst';
  const mapKey = side === 'for' ? 'submissionsForTypes' : 'submissionsAgainstTypes';
  const otherKey = side === 'for' ? 'submissionsForOther' : 'submissionsAgainstOther';

  const raw = round[mapKey] ?? {};
  const storedTotal = round[totalKey] ?? 0;
  const rawSum = Object.values(raw).reduce((a, b) => a + b, 0);
  // Fold any legacy untyped remainder into `other` so old totals stay visible.
  const counts: Record<string, number> =
    storedTotal > rawSum ? { ...raw, other: (raw.other ?? 0) + (storedTotal - rawSum) } : raw;

  const setCount = (type: string, n: number) => {
    const map = { ...counts };
    if (n <= 0) delete map[type];
    else map[type] = n;
    const total = Object.values(map).reduce((a, b) => a + b, 0);
    const patch: Record<string, unknown> = { [mapKey]: map, [totalKey]: total };
    // Drop the free-text note when the 'other' count clears out.
    if (type === 'other' && n <= 0) patch[otherKey] = null;
    onChange(patch as Partial<EditableRound>);
  };

  const selected = GRAPPLING_SUBMISSIONS.filter((s) => (counts[s.value] ?? 0) > 0);
  const available = GRAPPLING_SUBMISSIONS.filter((s) => (counts[s.value] ?? 0) === 0);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.sectionHead}>
        <Text style={styles.miniLabel}>
          {side === 'for' ? 'Submissions for' : 'Submissions against'}
        </Text>
        <Text style={styles.totalBadge}>{total}</Text>
      </View>

      {selected.map((s) => (
        <Stepper
          key={s.value}
          label={submissionLabel(s.value)}
          value={counts[s.value] ?? 0}
          onChange={(n) => setCount(s.value, n)}
        />
      ))}

      {(counts.other ?? 0) > 0 && (
        <TextInput
          style={styles.otherNote}
          value={round[otherKey] ?? ''}
          onChangeText={(t) => onChange({ [otherKey]: t } as Partial<EditableRound>)}
          placeholder="What was the other submission?"
          placeholderTextColor={T.muted}
        />
      )}

      {available.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.addStrip}
        >
          {available.map((s) => (
            <Chip
              key={s.value}
              label={submissionLabel(s.value)}
              leftIcon="add"
              onPress={() => setCount(s.value, 1)}
              style={styles.addChip}
              accessibilityLabel={`Add ${submissionLabel(s.value)}`}
            />
          ))}
        </ScrollView>
      )}
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
          {STRIKING_ROUND_TYPES.map((rt) => (
            <Chip
              key={rt.value}
              label={rt.label}
              selected={round.roundType === rt.value}
              onPress={() => onChange({ roundType: round.roundType === rt.value ? null : rt.value })}
            />
          ))}
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
          {MMA_PHASES.map((ph) => (
            <Chip
              key={ph.value}
              label={ph.label}
              selected={phases.includes(ph.value)}
              onPress={() => togglePhase(ph.value)}
            />
          ))}
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

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    addStrip: { flexDirection: 'row', gap: 6, paddingVertical: 2 },
    addChip: { borderStyle: 'dashed', borderColor: T.borderStrong, backgroundColor: T.surface },
    roundCard: {
      gap: 10, padding: 12,
      backgroundColor: T.surface2, borderRadius: R.card, borderWidth: 1, borderColor: T.border,
    },
    roundHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    roundTitle: { fontFamily: F.uiSemi, fontSize: 14, color: T.text },
    inlineRow: { flexDirection: 'row', gap: 12 },
    minuteRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    stampBtn: {
      width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
      borderRadius: R.sm, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface,
    },
    miniLabel: { fontFamily: F.uiMed, fontSize: 11, color: T.textDim, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 },
    numInput: {
      fontFamily: F.mono, fontSize: 15, color: T.text,
      backgroundColor: T.surface, borderRadius: R.sm, borderWidth: 1, borderColor: T.border,
      paddingHorizontal: 12, paddingVertical: 9,
    },
    journal: { minHeight: 64, fontFamily: F.ui },
    otherNote: {
      fontFamily: F.ui, fontSize: 14, color: T.text,
      backgroundColor: T.surface, borderRadius: R.sm, borderWidth: 1, borderColor: T.border,
      paddingHorizontal: 12, paddingVertical: 8,
    },
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
    sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    totalBadge: {
      fontFamily: F.monoBold, fontSize: 14, color: T.text,
      minWidth: 26, textAlign: 'center',
      paddingHorizontal: 8, paddingVertical: 2,
      borderRadius: R.chip, backgroundColor: T.surface,
    },
    addRound: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      paddingVertical: 11, borderRadius: R.sm, borderWidth: 1, borderStyle: 'dashed', borderColor: T.borderStrong,
    },
    addRoundText: { fontFamily: F.uiSemi, fontSize: 14, color: T.primary },
  });
}
