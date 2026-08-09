import { useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTechniqueTags } from '../hooks/useNotes';
import { useTechniques, useCreateTechnique } from '../hooks/useTechniques';
import { useCurrentUser } from '../hooks/useAuth';
import { useProGate } from '../hooks/useProGate';
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
  Technique,
  TechniqueKind,
} from '@app/shared';
import {
  ROUNDS_SCHEMA,
  GRAPPLING_POSITIONS,
  GRAPPLING_SUBMISSIONS,
  FREE_CUSTOM_TECHNIQUE_LIMIT,
  NOTES_MAX_LENGTH,
  ROUND_MINUTES_RANGE,
  submissionLabel,
} from '@app/shared';
import { parseNumberInRangeResult } from '../lib/parseNumber';
import { PartnerPicker } from './PartnerPicker';
import { Chip } from './ui/Chip';
import { Stepper } from './ui/Stepper';
import { useTheme } from '../theme/ThemeContext';
import { Touchable } from './ui';
import { TYPE } from '../theme/type';
import { F, R, ThemeColors } from '../theme/colors';
import { withAlpha } from '../lib/color';

type TechniqueOption = { value: string; label: string };

// Submissions minus the 'other' escape hatch — 'other' is a client-only chip,
// never a bank row (it isn't seeded and can't be created as a custom).
const SUBMISSION_FALLBACK: TechniqueOption[] = GRAPPLING_SUBMISSIONS.filter(
  (s) => s.value !== 'other',
);

// Merge the server technique bank (global seeds + this user's customs) over the
// hardcoded constants, keeping the curated order and appending customs after.
// The constants are the offline / first-render fallback (and the seed source).
function mergeTechniqueOptions(
  fetched: Technique[] | undefined,
  fallback: readonly TechniqueOption[],
): TechniqueOption[] {
  const list = fetched ?? [];
  const labelByValue = new Map(list.map((t) => [t.value, t.label]));
  const seen = new Set<string>();
  const out: TechniqueOption[] = [];
  for (const c of fallback) {
    out.push({ value: c.value, label: labelByValue.get(c.value) ?? c.label });
    seen.add(c.value);
  }
  for (const t of list) {
    if (seen.has(t.value)) continue;
    out.push({ value: t.value, label: t.label });
    seen.add(t.value);
  }
  return out;
}

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
 * When `sessionActive` and `elapsedRef` are supplied, each round's Minutes
 * field grows a "stamp from timer" button that fills the round's duration from
 * the session clock (minus the rounds already logged).
 */
export function RoundLogger({
  category,
  value,
  onChange,
  strikeWeapons = BOXING_WEAPONS,
  elapsedRef,
  sessionActive = false,
}: {
  category: DisciplineCat;
  value: RoundsSessionDetails | null;
  onChange: (next: RoundsSessionDetails) => void;
  /** Which striking weapons to show as counters (boxing vs Muay Thai). */
  strikeWeapons?: StrikeWeapon[];
  /**
   * Live session stopwatch (seconds); enables the Minutes stamp button.
   *
   * A ref rather than a number: the stamp reads it once, on tap, and passing
   * the ticking value as a prop re-rendered this whole tree — every round,
   * every counter — once a second for the length of the session.
   */
  elapsedRef?: React.MutableRefObject<number>;
  /** Whether the session is still in progress (gates the stamp button). */
  sessionActive?: boolean;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);

  // Grappling technique bank — global seeds + this user's customs, merged over
  // the constants. Only grappling surfaces positions / submission types.
  const isGrappling = category === 'grappling';
  const positionsQuery = useTechniques({ kind: 'position', category: 'grappling', enabled: isGrappling });
  const submissionsQuery = useTechniques({ kind: 'submission', enabled: isGrappling });
  const positionOptions = useMemo(
    () => mergeTechniqueOptions(positionsQuery.data, GRAPPLING_POSITIONS),
    [positionsQuery.data],
  );
  const submissionOptions = useMemo(
    () => mergeTechniqueOptions(submissionsQuery.data, SUBMISSION_FALLBACK),
    [submissionsQuery.data],
  );

  const createTechnique = useCreateTechnique();
  const { data: currentUser } = useCurrentUser();
  const { isPro, showPaywall } = useProGate();

  // Create a custom position/submission, honoring the free-tier cap (counted
  // across both kinds). Returns the created (or existing) row, or null if the
  // create was blocked or failed. Callers apply the result to the round.
  const handleCreateTechnique = async (
    kind: TechniqueKind,
    label: string,
  ): Promise<Technique | null> => {
    const trimmed = label.trim();
    if (!trimmed) return null;
    const customCount = [...(positionsQuery.data ?? []), ...(submissionsQuery.data ?? [])].filter(
      (t) => t.userId === currentUser?.id,
    ).length;
    if (!isPro && customCount >= FREE_CUSTOM_TECHNIQUE_LIMIT) {
      Alert.alert(
        'Limit reached',
        `Free accounts can create up to ${FREE_CUSTOM_TECHNIQUE_LIMIT} custom positions & submissions. Upgrade to RepRounds Pro for unlimited.`,
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Upgrade', onPress: showPaywall },
        ],
      );
      return null;
    }
    try {
      return await createTechnique.mutateAsync({ kind, label: trimmed });
    } catch (err) {
      Alert.alert('Error', (err as Error).message ?? 'Failed to add.');
      return null;
    }
  };

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
    if (elapsedRef == null) return;
    const otherSum = rounds.reduce(
      (sum, r) => (r.id === round.id ? sum : sum + (r.durationSeconds ?? 0)),
      0,
    );
    updateRound(round.id, { durationSeconds: Math.max(0, elapsedRef.current - otherSum) });
  };

  const canStamp = sessionActive && elapsedRef != null;

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
            <Touchable
              hitSlop={8}
              onPress={() => removeRound(round.id)}
              accessibilityLabel={`Delete round ${i + 1}`}
            >
              <Ionicons name="trash-outline" size={16} color={T.muted} />
            </Touchable>
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
                  onChangeText={(t) => {
                    const { value, invalid } = parseNumberInRangeResult(t, ROUND_MINUTES_RANGE);
                    // keyboardType is only a hint — paste, hardware keyboards
                    // and comma-decimal locales all get past it, and
                    // Math.round(NaN) put a NaN straight into the round.
                    if (invalid) return;
                    updateRound(round.id, {
                      durationSeconds: value === null ? null : Math.round(value * 60),
                    });
                  }}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={T.muted}
                />
                {canStamp && (
                  <Touchable
                    style={styles.stampBtn}
                    onPress={() => stampDuration(round)}
                    accessibilityLabel="Fill minutes from session timer"
                  >
                    <Ionicons name="stopwatch-outline" size={18} color={T.primary} />
                  </Touchable>
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
            <GrapplingCounters
              round={round}
              positions={positionOptions}
              submissions={submissionOptions}
              onCreateTechnique={handleCreateTechnique}
              onChange={(patch) => updateRound(round.id, patch)}
            />
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
            maxLength={NOTES_MAX_LENGTH}
          />
        </View>
      ))}

      <Touchable
        style={styles.addRound}
        onPress={addRound}
        accessibilityLabel="Add round"
      >
        <Ionicons name="add" size={16} color={T.primary} />
        <Text style={styles.addRoundText}>Add round</Text>
      </Touchable>

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
          maxLength={NOTES_MAX_LENGTH}
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
          <Touchable
            key={tag}
            style={styles.tagChip}
            onPress={() => removeTag(tag)}
            accessibilityLabel={`Remove tag ${tag}`}
          >
            <Text style={styles.tagChipText}>{tag}</Text>
            <Ionicons name="close" size={13} color={T.primary} />
          </Touchable>
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
            <Touchable
              key={s}
              style={styles.tagSuggest}
              onPress={() => addTag(s)}
              accessibilityLabel={`Add tag ${s}`}
            >
              <Ionicons name="add" size={12} color={T.textDim} />
              <Text style={styles.tagSuggestText}>{s}</Text>
            </Touchable>
          ))}
        </View>
      )}
    </View>
  );
}

function GrapplingCounters({
  round,
  positions,
  submissions,
  onCreateTechnique,
  onChange,
}: {
  round: EditableRound;
  positions: TechniqueOption[];
  submissions: TechniqueOption[];
  onCreateTechnique: (kind: TechniqueKind, label: string) => Promise<Technique | null>;
  onChange: (patch: Partial<EditableRound>) => void;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const [addingPosition, setAddingPosition] = useState(false);

  const togglePosition = (pos: string) => {
    const current = round.positions ?? [];
    onChange({
      positions: current.includes(pos)
        ? current.filter((p) => p !== pos)
        : [...current, pos],
    });
  };

  const addPosition = (pos: string) => {
    const current = round.positions ?? [];
    if (!current.includes(pos)) onChange({ positions: [...current, pos] });
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

      <SubmissionSection
        side="for"
        round={round}
        submissions={submissions}
        onCreateTechnique={onCreateTechnique}
        onChange={onChange}
      />
      <SubmissionSection
        side="against"
        round={round}
        submissions={submissions}
        onCreateTechnique={onCreateTechnique}
        onChange={onChange}
      />

      <Stepper label="Sweeps" value={round.sweeps ?? 0} onChange={(n) => onChange({ sweeps: n })} />
      <Stepper
        label="Takedowns"
        value={round.takedowns ?? 0}
        onChange={(n) => onChange({ takedowns: n })}
      />

      <View>
        <Text style={styles.miniLabel}>Positions worked</Text>
        <View style={styles.chipRow}>
          {positions.map((p) => (
            <Chip
              key={p.value}
              label={p.label}
              selected={(round.positions ?? []).includes(p.value)}
              onPress={() => togglePosition(p.value)}
            />
          ))}
          <Chip
            label="Add position"
            leftIcon="add"
            onPress={() => setAddingPosition(true)}
            style={styles.addChip}
            textStyle={styles.addChipText}
          />
        </View>
      </View>

      <CreateTechniqueModal
        visible={addingPosition}
        title="Add position"
        placeholder="e.g. Butterfly guard"
        onClose={() => setAddingPosition(false)}
        onCreate={async (label) => {
          const t = await onCreateTechnique('position', label);
          if (!t) return false;
          addPosition(t.value);
          return true;
        }}
      />
    </View>
  );
}

/**
 * Submission tally for one side (landed/taken). Shows only the submissions
 * actually logged this round as counted chips ("Armbar · 2"); tap a chip to +1,
 * tap its ✕ to clear it. A single "Add submission" chip opens a searchable
 * picker to choose an existing type or create a custom one from the bank.
 *
 * The stored `submissionsFor` / `submissionsAgainst` total is kept equal to the
 * sum of the type map. Legacy rounds that carry a bare total larger than the
 * typed sum have the remainder folded into `other`, so nothing looks lost.
 */
function SubmissionSection({
  side,
  round,
  submissions,
  onCreateTechnique,
  onChange,
}: {
  side: 'for' | 'against';
  round: EditableRound;
  submissions: TechniqueOption[];
  onCreateTechnique: (kind: TechniqueKind, label: string) => Promise<Technique | null>;
  onChange: (patch: Partial<EditableRound>) => void;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const [pickerOpen, setPickerOpen] = useState(false);

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

  const labelOf = (value: string) =>
    value === 'other'
      ? 'Other'
      : submissions.find((s) => s.value === value)?.label ?? submissionLabel(value);

  const logged = Object.entries(counts).filter(([, n]) => n > 0);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.sectionHead}>
        <Text style={styles.miniLabel}>
          {side === 'for' ? 'Submissions landed' : 'Submissions taken'}
        </Text>
        <Text style={styles.totalBadge}>{total}</Text>
      </View>

      <View style={styles.chipRow}>
        {logged.map(([value, n]) => (
          <CountChip
            key={value}
            label={labelOf(value)}
            count={n}
            onIncrement={() => setCount(value, n + 1)}
            onRemove={() => setCount(value, 0)}
          />
        ))}
        <Chip
          label="Add submission"
          leftIcon="add"
          onPress={() => setPickerOpen(true)}
          style={styles.addChip}
          textStyle={styles.addChipText}
        />
      </View>

      {(counts.other ?? 0) > 0 && (
        <TextInput
          style={styles.otherNote}
          value={round[otherKey] ?? ''}
          onChangeText={(t) => onChange({ [otherKey]: t } as Partial<EditableRound>)}
          placeholder="What was the other submission?"
          placeholderTextColor={T.muted}
        />
      )}

      <SubmissionPicker
        visible={pickerOpen}
        submissions={submissions}
        counts={counts}
        onClose={() => setPickerOpen(false)}
        onSelect={(value) => {
          setCount(value, (counts[value] ?? 0) + 1);
          setPickerOpen(false);
        }}
        onCreate={async (label) => {
          const t = await onCreateTechnique('submission', label);
          if (!t) return;
          setCount(t.value, (counts[t.value] ?? 0) + 1);
          setPickerOpen(false);
        }}
      />
    </View>
  );
}

/**
 * A counted, removable chip (Design A): the label with its tally ("Armbar · 2").
 * Tapping the body adds one (light haptic); tapping the ✕ clears the type.
 */
function CountChip({
  label,
  count,
  onIncrement,
  onRemove,
}: {
  label: string;
  count: number;
  onIncrement: () => void;
  onRemove: () => void;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  return (
    <View style={styles.countChip}>
      <Touchable
        onPress={() => {
          onIncrement();
        }}
        accessibilityLabel={`${label}, ${count}. Tap to add one`}
      >
        <Text style={styles.countChipText}>
          {label} · {count}
        </Text>
      </Touchable>
      <Touchable
        hitSlop={8}
        onPress={onRemove}
        accessibilityLabel={`Remove ${label}`}
      >
        <Ionicons name="close" size={13} color={T.onPrimary} style={styles.countChipClose} />
      </Touchable>
    </View>
  );
}

/**
 * Searchable pageSheet picker for submission types: lists the bank (seeds +
 * customs, plus the 'Other' escape hatch) filtered by query; tapping one adds
 * it. A "Create …" row runs the pro-gated create path when nothing matches.
 */
function SubmissionPicker({
  visible,
  submissions,
  counts,
  onClose,
  onSelect,
  onCreate,
}: {
  visible: boolean;
  submissions: TechniqueOption[];
  counts: Record<string, number>;
  onClose: () => void;
  onSelect: (value: string) => void;
  onCreate: (label: string) => Promise<void>;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const items = useMemo<TechniqueOption[]>(
    () => [...submissions, { value: 'other', label: 'Other' }],
    [submissions],
  );
  const q = query.trim().toLowerCase();
  const matches = q ? items.filter((s) => s.label.toLowerCase().includes(q)) : items;
  const exact = items.some((s) => s.label.toLowerCase() === q);

  const close = () => {
    setQuery('');
    setBusy(false);
    onClose();
  };
  const select = (value: string) => {
    setQuery('');
    onSelect(value);
  };
  const create = async () => {
    if (busy || q === '') return;
    setBusy(true);
    await onCreate(query.trim());
    setQuery('');
    setBusy(false);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={styles.modalSheet}>
        <View style={styles.pickerHead}>
          <Text style={styles.modalTitle}>Add submission</Text>
          <Touchable onPress={close} hasTextChild>
            <Text style={styles.pickerCancel}>Done</Text>
          </Touchable>
        </View>
        <TextInput
          style={styles.modalInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search or create…"
          placeholderTextColor={T.muted}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => {
            if (!exact && q) create();
          }}
          selectionColor={T.primary}
        />
        <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
          {matches.map((s) => {
            const n = counts[s.value] ?? 0;
            return (
              <Touchable key={s.value} style={styles.pickerRow} onPress={() => select(s.value)} hasTextChild>
                <Text style={styles.pickerRowText}>{s.label}</Text>
                {n > 0 && <Text style={styles.pickerRowCount}>· {n}</Text>}
              </Touchable>
            );
          })}
          {q !== '' && !exact && (
            <Touchable style={styles.pickerRow} onPress={create} disabled={busy} hasTextChild>
              <Ionicons name="add" size={15} color={T.primary} />
              <Text style={[styles.pickerRowText, styles.pickerCreateText]}>
                Create “{query.trim()}”
              </Text>
            </Touchable>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

/**
 * Minimal create-only pageSheet used for custom positions (existing positions
 * are already visible as toggle chips, so only creation needs a modal).
 */
function CreateTechniqueModal({
  visible,
  title,
  placeholder,
  onClose,
  onCreate,
}: {
  visible: boolean;
  title: string;
  placeholder: string;
  onClose: () => void;
  onCreate: (label: string) => Promise<boolean>;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => {
    setText('');
    setBusy(false);
    onClose();
  };
  const submit = async () => {
    if (busy || text.trim() === '') return;
    setBusy(true);
    const ok = await onCreate(text);
    if (ok) close();
    else setBusy(false);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={styles.modalSheet}>
        <View style={styles.pickerHead}>
          <Text style={styles.modalTitle}>{title}</Text>
          <Touchable onPress={close} hasTextChild>
            <Text style={styles.pickerCancel}>Cancel</Text>
          </Touchable>
        </View>
        <TextInput
          style={styles.modalInput}
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={T.muted}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={submit}
          selectionColor={T.primary}
        />
        <Touchable
          style={[styles.modalPrimaryBtn, busy && styles.modalBtnDisabled]}
          onPress={submit}
          disabled={busy}
          hasTextChild
        >
          <Text style={styles.modalPrimaryText}>Add</Text>
        </Touchable>
      </View>
    </Modal>
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
        label="Submissions landed"
        value={round.submissionsFor ?? 0}
        onChange={(n) => onChange({ submissionsFor: n })}
      />
      <Stepper
        label="Submissions taken"
        value={round.submissionsAgainst ?? 0}
        onChange={(n) => onChange({ submissionsAgainst: n })}
      />
    </View>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    addChip: { borderStyle: 'dashed', borderColor: T.borderStrong, backgroundColor: T.surface },
    roundCard: {
      gap: 10, paddingVertical: 12,
      // eslint-disable-next-line no-restricted-syntax -- A round row inside a scrolling logger, not a page section.
      borderTopWidth: 1, borderTopColor: T.borderStrong,
    },
    roundHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    roundTitle: { ...TYPE.sectionLabel, color: T.textDim },
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
    addChipText: { color: T.primary },
    countChip: {
      flexDirection: 'row', alignItems: 'center', gap: 3,
      paddingHorizontal: 11, paddingVertical: 6, borderRadius: R.chip,
      borderWidth: 1, borderColor: T.primary, backgroundColor: T.primary,
    },
    countChipText: { fontFamily: F.uiMed, fontSize: 12, color: T.onPrimary, textTransform: 'capitalize' },
    countChipClose: { marginLeft: 2, marginRight: -2, opacity: 0.85 },
    modalSheet: { flex: 1, backgroundColor: T.bg, padding: 20, gap: 14 },
    modalTitle: { fontFamily: F.uiBold, fontSize: 18, color: T.text },
    modalInput: {
      fontFamily: F.ui, fontSize: 16, color: T.text,
      backgroundColor: T.surface, borderRadius: R.sm, borderWidth: 1, borderColor: T.border,
      paddingHorizontal: 12, paddingVertical: 12,
    },
    pickerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    pickerCancel: { fontFamily: F.uiSemi, fontSize: 15, color: T.primary },
    pickerList: { marginTop: 2 },
    pickerRow: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingVertical: 13, paddingHorizontal: 4,
      borderBottomWidth: 1, borderBottomColor: T.border,
    },
    pickerRowText: { fontFamily: F.uiMed, fontSize: 16, color: T.text },
    pickerRowCount: { fontFamily: F.mono, fontSize: 14, color: T.textDim },
    pickerCreateText: { color: T.primary, fontFamily: F.uiSemi },
    modalPrimaryBtn: {
      backgroundColor: T.primary, borderRadius: R.card, paddingVertical: 14, alignItems: 'center',
    },
    modalPrimaryText: { fontFamily: F.uiBold, fontSize: 16, color: T.onPrimary },
    modalBtnDisabled: { opacity: 0.55 },
  });
}
